/**
 * build.js
 * 빌드 오케스트레이터: fetch → gen-pages → sitemap
 * node --env-file=.env.local scripts/build.js
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchImplantPrices, fetchDentalHospList, fetchNationwideStats, fetchNonPayItems, fetchDentalCounts, dedupeAndSort, PROCEDURES, SIDO } from './fetch-hira.js';
import { generateRegionPage, generateSitemap, generateDentalHub, generateComparePage, generateMethodologyPage } from './gen-pages.js';
import { generateAllArticlesForSido, generateArticlesIndex, REGION_META } from './gen-articles.js';
import { generateAllPartnerPages } from './gen-partners.js';
import { enrichPartners } from './enrich-partners.js';
import { generateAllFindPages } from './gen-find.js';
import { generateAllLocalPages } from './gen-local.js';
import { generateLlmsTxt } from './gen-llms.js';
import { generatePriceIndex } from './gen-index.js';
import { generateOgImages } from './gen-og.js';
import { getPageDates, savePageDates } from './page-dates.js';
import { BASE_URL, MIN_INDEX_CLINICS, REGIONS } from './site-config.js';
import { writeFileSync, mkdirSync } from 'node:fs';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, '..');
const DATA = join(ROOT, 'data');

// KST 기준 날짜 (CI는 UTC로 돌므로 +9h 보정 — 새벽 1시 빌드 시 '어제' 표기 방지)
const BUILD_DATE = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

// 생성할 지역 목록: site-config.js의 REGIONS (전국 17개 시도)

async function fetchAndSave(nm, en) {
  mkdirSync(DATA, { recursive: true });

  console.log(`\n[${nm}] 데이터 수집 중...`);

  // 전체 항목 1회 조회 + 병원 목록 병렬
  // 전국 확장: 큰 시도는 치과병원 비급여 항목이 2,000행을 넘을 수 있어 상한을 넉넉히 둔다
  const [allItems, hospList] = await Promise.all([
    fetchNonPayItems(nm, '41', [], 8000),
    fetchDentalHospList(nm),
  ]);
  // 병원정보서비스가 느려 동시 호출 시 타임아웃이 잦았음 → 가격 수집 뒤에 따로 호출
  const counts = await fetchDentalCounts(nm).catch(() => null);
  console.log(`  ✓ ${nm} 치과병원 비급여 항목 ${allItems.length}행 수집`);

  const fetchedAt = new Date().toISOString();

  // 3시술 분기 저장
  for (const proc of Object.values(PROCEDURES)) {
    const filtered = allItems.filter(it =>
      String(it.npayKorNm ?? '').includes(proc.filter)
    );
    const prices = dedupeAndSort(filtered);

    const payload = proc.slug === 'implant'
      ? { sido: nm, fetchedAt, prices, hospList, counts }  // 기존 스키마 + 시도 치과 수
      : { sido: nm, fetchedAt, prices };

    const outFile = join(DATA, `${en}-${proc.slug}.json`);
    writeFileSync(outFile, JSON.stringify(payload, null, 2));
    console.log(`  → data/${en}-${proc.slug}.json 저장 완료 (${prices.length}건)`);
  }

  return join(DATA, `${en}-implant.json`);
}

async function main() {
  console.log(`\n=== HIRA Dental 빌드 시작 (${BUILD_DATE}) ===\n`);

  // 1. 데이터 수집 단계
  console.log('── 1단계: HIRA 데이터 수집 ──');

  const dataFiles = [];
  for (const r of REGIONS) {
    try {
      const dataFile = await fetchAndSave(r.nm, r.en);
      dataFiles.push({ ...r, dataFile });
    } catch (e) {
      console.warn(`  ⚠ ${r.nm} 수집 실패: ${e.message}`);
    }
  }

  // 전국 통계
  try {
    console.log('\n[전국] 통계 수집 중...');
    const stats = await fetchNationwideStats();
    writeFileSync(
      join(DATA, 'nationwide-stats.json'),
      JSON.stringify({ fetchedAt: new Date().toISOString(), stats }, null, 2),
    );
    console.log(`  → data/nationwide-stats.json 저장 완료 (${stats.length}건)`);
  } catch (e) {
    console.warn('  ⚠ 전국 통계 수집 실패:', e.message);
  }

  // 2. 페이지 생성 단계
  console.log('\n── 2단계: HTML 페이지 생성 ──');
  const generatedPages = [];

  for (const r of dataFiles) {
    if (!existsSync(r.dataFile)) continue;
    // 가격 신고 치과병원이 0곳인 시도는 빈 페이지를 만들지 않는다
    const nPrices = (JSON.parse(readFileSync(r.dataFile, 'utf8')).prices ?? []).length;
    if (!nPrices) { console.log(`  · ${r.nm}: 가격 신고 치과병원 0곳 — 지역 페이지 생략`); continue; }
    try {
      generateRegionPage(r.dataFile, r.nm, r.en, BUILD_DATE);
      generatedPages.push({
        path: `/dental/${r.en}-implant/`,
        priority: '0.9',
        freq: 'weekly',
      });
    } catch (e) {
      console.error(`  ✗ ${r.nm} 페이지 생성 실패: ${e.message}`);
      process.exit(1); // LAW_HARD 위반 시 빌드 중단
    }
  }

  // 2.4 홈 지역 카드: 실제 생성된 지역 페이지만 노출
  try {
    const home = readFileSync(join(ROOT, 'index.html'), 'utf8');
    const cards = generatedPages.map(p => {
      const r = REGIONS.find(x => p.path === `/dental/${x.en}-implant/`);
      return `        <a href="/dental/${r.en}-implant/" class="region-card">
          <div class="region-name">${r.nm}</div>
          <div class="region-sub">${r.en[0].toUpperCase()}${r.en.slice(1)}</div>
          <div class="region-badge">데이터 공개 중</div>
        </a>`;
    }).join('\n');
    const next = home.replace(/(<!-- REGION_GRID_START[^>]*-->\n)[\s\S]*?(<!-- REGION_GRID_END -->)/, `$1${cards}\n$2`);
    if (generatedPages.length && next !== home) writeFileSync(join(ROOT, 'index.html'), next);
    console.log(`  ✓ index.html 지역 카드 ${generatedPages.length}개`);
  } catch (e) {
    console.warn(`  ⚠ 홈 지역 카드 갱신 실패(계속 진행): ${e.message}`);
  }

  // 2.5 치과 허브 + 전국 비교 페이지 + 방법론 페이지
  try {
    generateDentalHub(BUILD_DATE);
    generateComparePage(BUILD_DATE);
    generateMethodologyPage(BUILD_DATE);
  } catch (e) {
    console.error(`  ✗ 허브/비교 페이지 생성 실패: ${e.message}`);
    process.exit(1);
  }

  // 3. 아티클 페이지 생성 (시군구별 치과 추천 아티클)
  console.log('\n── 3단계: 아티클 페이지 생성 ──');
  const articlePages = [];
  let thinArticles = 0;
  const procList = Object.values(PROCEDURES);
  for (const r of REGION_META) {
    console.log(`\n[${r.sido}] 아티클 생성 중...`);
    for (const proc of procList) {
      const dataFile = join(DATA, `${r.dataKey}-${proc.slug}.json`);
      if (!existsSync(dataFile)) {
        console.warn(`  ⚠ ${r.sido} ${proc.slug} 데이터 없음 — 스킵`);
        continue;
      }
      try {
        const results = generateAllArticlesForSido(r.dataKey, r.sido, r.sidoEn, BUILD_DATE, 1, proc);
        for (const res of results) {
          // 기관 수가 기준 미만인 얇은 페이지는 noindex라 사이트맵에서도 뺀다
          if (!res.indexable) { thinArticles++; continue; }
          const path = `/articles/${res.sidoEn}-${res.sgguSlug}-${proc.slug}/`;
          articlePages.push({
            path,
            priority: '0.8',
            freq: 'weekly',
            lastmod: getPageDates(`${BASE_URL}${path}`)?.modified,
          });
        }
      } catch (e) {
        console.warn(`  ⚠ ${r.sido} ${proc.slug} 아티클 생성 오류: ${e.message}`);
      }
    }
  }
  console.log(`\n  → 색인 대상 아티클 ${articlePages.length}개 · 기관 ${MIN_INDEX_CLINICS}곳 미만 noindex ${thinArticles}개`);
  const datedPages = savePageDates();
  console.log(`  ✓ meta/page-dates.json 저장 (${datedPages}개 페이지 발행·수정일)`);
  try {
    generateArticlesIndex(BUILD_DATE);
  } catch (e) {
    console.error(`  ✗ 아티클 목록 생성 실패: ${e.message}`);
    process.exit(1);
  }

  // 3.4 거래처 HIRA 자동 보강 (CI Secret 키 사용, 키 없으면 생략)
  console.log('\n── 3.4단계: 거래처 HIRA 자동 보강 ──');
  try {
    await enrichPartners();
  } catch (e) {
    console.warn(`  ⚠ 거래처 보강 오류(계속 진행): ${e.message}`);
  }

  // 3.5 거래처(제휴) 프로필 페이지 생성
  console.log('\n── 3.5단계: 거래처 프로필 생성 ──');
  let partnerPages = [];
  try {
    partnerPages = generateAllPartnerPages(BUILD_DATE);
  } catch (e) {
    console.error(`  ✗ 거래처 프로필 생성 실패: ${e.message}`);
    process.exit(1); // LAW_HARD 위반 시 빌드 중단
  }

  // 3.6 니즈별 찾기 + 동·역세권 페이지 + llms.txt 자동 갱신
  console.log('\n── 3.6단계: 니즈별·동·역세권 페이지·llms.txt ──');
  let findPages = [];
  let localPages = [];
  try {
    findPages = generateAllFindPages(BUILD_DATE);
    localPages = generateAllLocalPages(BUILD_DATE);
    generateLlmsTxt(findPages, BUILD_DATE, localPages);
  } catch (e) {
    console.error(`  ✗ 니즈·동·역세권 페이지 생성 실패: ${e.message}`);
    process.exit(1);
  }

  // 3.7 가격지수 (MIPI) 발행
  console.log('\n── 3.7단계: 가격지수 발행 ──');
  let indexPages = [];
  try {
    indexPages = generatePriceIndex(BUILD_DATE);
  } catch (e) {
    console.error(`  ✗ 가격지수 생성 실패: ${e.message}`);
    process.exit(1);
  }

  // 3.8 월간 보도자료 초안 (지수 데이터 기반, 실패해도 빌드는 계속)
  try {
    const { generatePressRelease } = await import('./gen-press.js');
    generatePressRelease();
  } catch (e) {
    console.warn(`  ⚠ 보도자료 초안 생성 오류(계속 진행): ${e.message}`);
  }

  // 3.9 OG 이미지 생성 (이미 존재하면 스킵 — 빌드 시간 절약)
  console.log('\n── 3.9단계: OG 이미지 생성 ──');
  try {
    await generateOgImages();
  } catch (e) {
    console.warn(`  ⚠ OG 이미지 생성 오류(계속 진행): ${e.message}`);
  }

  // 4. sitemap.xml 생성
  console.log('\n── 4단계: sitemap.xml 생성 ──');
  generateSitemap(
    [
      { path: '/', priority: '1.0', freq: 'daily' },
      { path: '/dental/', priority: '0.9', freq: 'weekly' },
      { path: '/methodology/', priority: '0.7', freq: 'monthly' },
      ...generatedPages,
      { path: '/dental/compare/', priority: '0.8', freq: 'weekly' },
      { path: '/articles/', priority: '0.8', freq: 'weekly' },
      ...articlePages,
      ...partnerPages,
      ...findPages,
      ...localPages,
      ...indexPages,
    ],
    BUILD_DATE,
  );

  // 4.5 IndexNow 제출 목록: 아티클은 오늘 데이터가 바뀐 것만, 나머지(허브·지역·프로필 등)는 전부.
  //     매일 전체 URL을 재통지하지 않아 검색엔진에 '변경 없는 재제출' 신호를 덜 보낸다.
  const allPaths = [
    '/', '/dental/', '/methodology/', '/dental/compare/', '/articles/',
    ...generatedPages, ...articlePages, ...partnerPages, ...findPages, ...localPages, ...indexPages,
  ].map(p => (typeof p === 'string' ? p : p.path));
  const changed = allPaths.filter(path => {
    if (!path.startsWith('/articles/') || path === '/articles/') return true;
    return getPageDates(`${BASE_URL}${path}`)?.modified === BUILD_DATE;
  });
  writeFileSync(join(ROOT, 'indexnow-urls.txt'), changed.map(p => `${BASE_URL}${p}`).join('\n') + '\n');
  console.log(`  ✓ indexnow-urls.txt (${changed.length}/${allPaths.length}개 URL — 변경 없는 아티클 제외)`);

  // 5. 시크릿 스캔 (빌드 결과물 대상)
  console.log('\n── 5단계: 시크릿·광고법 스캔 ──');
  const { execSync } = await import('node:child_process');
  try {
    execSync(
      'node -e "const{readdirSync,readFileSync}=require(\'fs\');const{join}=require(\'path\');function scan(d){try{for(const f of readdirSync(d,{withFileTypes:true})){if(f.isDirectory())scan(join(d,f.name));else if(f.name.endsWith(\'.html\')){const c=readFileSync(join(d,f.name),\'utf8\');const hits=[\'nO3sSSWe\',\'Gwwwwang94\'].filter(k=>c.includes(k));if(hits.length)throw new Error(\'SECRET LEAK: \'+join(d,f.name)+\' :: \'+hits.join(\',\'));}}}catch(e){if(e.code!==\'ENOENT\')throw e}};scan(\'dental\');scan(\'articles\');scan(\'clinics\');scan(\'find\');scan(\'local\');scan(\'price-index\')"',
      { cwd: ROOT, stdio: 'inherit' },
    );
    console.log('  ✓ 시크릿 스캔 통과');
  } catch (e) {
    console.error('  ✗ 시크릿 스캔 실패:', e.message);
    process.exit(1);
  }

  console.log('\n=== 빌드 완료 ===');
  console.log(`생성된 페이지: ${generatedPages.length}개`);
  generatedPages.forEach(p => console.log(`  • ${p.path}`));
}

main().catch(e => {
  console.error('\n✗ 빌드 오류:', e.message);
  process.exit(1);
});
