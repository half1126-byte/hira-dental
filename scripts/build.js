/**
 * build.js
 * 빌드 오케스트레이터: fetch → gen-pages → sitemap
 * node --env-file=.env.local scripts/build.js
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchImplantPrices, fetchDentalHospList, fetchNationwideStats, SIDO } from './fetch-hira.js';
import { generateRegionPage, generateSitemap } from './gen-pages.js';
import { generateAllArticlesForSido, REGION_META } from './gen-articles.js';
import { generateAllPartnerPages } from './gen-partners.js';
import { writeFileSync, mkdirSync } from 'node:fs';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, '..');
const DATA = join(ROOT, 'data');

const BUILD_DATE = new Date().toISOString().slice(0, 10);

// 생성할 지역 목록 (한국어명, 영문 slug)
const REGIONS = [
  { nm: '서울', en: 'seoul' },
  { nm: '경기', en: 'gyeonggi' },
  { nm: '부산', en: 'busan' },
  { nm: '인천', en: 'incheon' },
];

async function fetchAndSave(nm, en) {
  mkdirSync(DATA, { recursive: true });
  const dataFile = join(DATA, `${en}-implant.json`);

  console.log(`\n[${nm}] 데이터 수집 중...`);
  const [prices, hospList] = await Promise.all([
    fetchImplantPrices(nm),
    fetchDentalHospList(nm),
  ]);

  writeFileSync(dataFile, JSON.stringify({ sido: nm, fetchedAt: new Date().toISOString(), prices, hospList }, null, 2));
  console.log(`  → data/${en}-implant.json 저장 완료 (${prices.length}건)`);
  return dataFile;
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

  // 3. 아티클 페이지 생성 (시군구별 치과 추천 아티클)
  console.log('\n── 3단계: 아티클 페이지 생성 ──');
  const articlePages = [];
  for (const r of REGION_META) {
    console.log(`\n[${r.sido}] 아티클 생성 중...`);
    try {
      const results = generateAllArticlesForSido(r.dataKey, r.sido, r.sidoEn, BUILD_DATE, 1);
      for (const res of results) {
        articlePages.push({
          path: `/articles/${res.sidoEn}-${res.sgguSlug}-implant/`,
          priority: '0.8',
          freq: 'weekly',
        });
      }
    } catch (e) {
      console.warn(`  ⚠ ${r.sido} 아티클 생성 오류: ${e.message}`);
    }
  }
  console.log(`\n  → 총 ${articlePages.length}개 아티클 생성`);

  // 3.5 거래처(제휴) 프로필 페이지 생성
  console.log('\n── 3.5단계: 거래처 프로필 생성 ──');
  let partnerPages = [];
  try {
    partnerPages = generateAllPartnerPages(BUILD_DATE);
  } catch (e) {
    console.error(`  ✗ 거래처 프로필 생성 실패: ${e.message}`);
    process.exit(1); // LAW_HARD 위반 시 빌드 중단
  }

  // 4. sitemap.xml 생성
  console.log('\n── 4단계: sitemap.xml 생성 ──');
  generateSitemap(
    [
      { path: '/', priority: '1.0', freq: 'daily' },
      { path: '/dental/', priority: '0.9', freq: 'weekly' },
      ...generatedPages,
      { path: '/dental/compare/', priority: '0.8', freq: 'weekly' },
      ...articlePages,
      ...partnerPages,
    ],
    BUILD_DATE,
  );

  // 5. 시크릿 스캔 (빌드 결과물 대상)
  console.log('\n── 5단계: 시크릿·광고법 스캔 ──');
  const { execSync } = await import('node:child_process');
  try {
    execSync(
      'node -e "const{readdirSync,readFileSync}=require(\'fs\');const{join}=require(\'path\');function scan(d){try{for(const f of readdirSync(d,{withFileTypes:true})){if(f.isDirectory())scan(join(d,f.name));else if(f.name.endsWith(\'.html\')){const c=readFileSync(join(d,f.name),\'utf8\');const hits=[\'nO3sSSWe\',\'Gwwwwang94\'].filter(k=>c.includes(k));if(hits.length)throw new Error(\'SECRET LEAK: \'+join(d,f.name)+\' :: \'+hits.join(\',\'));}}}catch(e){if(e.code!==\'ENOENT\')throw e}};scan(\'dental\');scan(\'articles\');scan(\'clinics\')"',
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
