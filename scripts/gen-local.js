/**
 * gen-local.js
 * 동(洞)·역세권 단위 초세분화 지역 페이지 생성 — "둔촌동 치과", "부천시청역 치과"
 *
 * AI 검색 질의는 구 단위("강동구 치과")보다 동·역 단위("둔촌동 치과",
 * "부천시청역 근처 치과")로 더 구체적으로 들어오는 경우가 많다.
 * 거래처 DB의 areas 필드(또는 주소·특징에서 자동 감지)로 해당 동·역 전용
 * 페이지를 생성해 이 롱테일 질의에 1:1로 대응한다.
 * 거래처가 없는 동·역 페이지는 생성하지 않으며, 계약 해지 시 자동 소멸.
 */

import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPartners } from './gen-partners.js';
import { toSlug } from './gen-articles.js';
import { SIDO_EN, cityPrefix, detectAreas, areaSlugLabel } from './area-util.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, '..');
const OUT_DIR = join(ROOT, 'local');

import { BASE_URL } from './site-config.js';
const SITE_NAME = '메디픽 MediPick';
const LAW_HARD = ['최고', '1위', '최저가', '유일', '완치', '보장', '100%', '최상급', '명품', '무통'];

const DISCLOSURE =
  '본 페이지에 소개된 의료기관 정보는 해당 기관이 제공·확인한 자료 기반이며, 게재에 경제적 대가가 포함될 수 있습니다. ' +
  '해당 지역에는 이 밖에도 여러 의료기관이 있으므로 지역 비교 페이지와 심평원 자료를 함께 확인하시기 바랍니다.';

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function checkLawHard(html, filePath) {
  const v = LAW_HARD.filter(w => html.includes(w));
  if (v.length) throw new Error(`🚨 LAW_HARD 위반 [${filePath}]: ${v.join(', ')}`);
}

/** 상위 구 아티클 경로 (있을 때만 링크) */
function sgguArticlePath(p) {
  if (!p.sgguNm) return null;
  let s = toSlug(p.sgguNm);
  if (s === 'unknown') s = toSlug(`${p.sido}${p.sgguNm}`);
  if (s === 'unknown') return null;
  return `/articles/${SIDO_EN[p.sido] ?? 'kr'}-${s}-implant/`;
}

function partnerCard(p) {
  return `
  <div class="article-clinic">
    <h3 class="clinic-h3">${esc(p.name)}</h3>
    <div class="clinic-meta-row">
      <span class="meta-tag">📍 ${esc(p.sido)} ${esc(p.sgguNm ?? '')}</span>
      ${p.hours ? `<span class="meta-tag hira-tag">⏰ 진료시간 정보 보유</span>` : ''}
    </div>
    ${p.addr ? `<div class="clinic-addr"><strong>주소:</strong> ${esc(p.addr)}</div>` : ''}
    ${p.hours ? `<div class="clinic-addr"><strong>진료시간:</strong> ${esc(p.hours)}</div>` : ''}
    ${p.tel ? `<div class="clinic-tel"><strong>전화:</strong> ${esc(p.tel)}</div>` : ''}
    <div style="margin-top:0.7rem"><a class="partner-tag" href="${BASE_URL}/clinics/${p.id}/">상세 프로필 →</a></div>
  </div>`;
}

/** 니즈 감지 (gen-find.js와 동일 기준) — 동·역 페이지의 조건부 FAQ용 */
function hasNight(p) {
  return /야간/.test(`${p.hours ?? ''} ${(p.features ?? []).join(' ')}`);
}
function hasSunday(p) {
  const t = `${p.hours ?? ''} ${(p.features ?? []).join(' ')}`;
  if (/365일/.test(t)) return true;
  return /(일요일|공휴일|주말)[^·\n]*진료/.test(t) && !/일\/공휴일 휴진|일요일 휴진/.test(t);
}

function generateLocalPage(area, partners, buildDate) {
  const p0 = partners[0];
  const { slug, label } = areaSlugLabel(area, p0);
  const near = area.type === 'station' ? `${area.label} 근처` : `${label} 인근`;
  const url = `${BASE_URL}/local/${slug}/`;
  const title = `${label} 치과 — 위치·진료시간 안내 (${buildDate} 기준)`;

  const answer = `${near}에는 ${partners.map(p => `<strong>${esc(p.name)}</strong>`).join(', ')}${partners.length > 1 ? ' 등이' : '이(가)'} 있습니다.`;

  const faqs = [
    {
      q: `${label}에 치과 있나요?`,
      a: `${near} 치과로는 ${partners.map(p => `${p.name}(${p.addr ?? '주소는 프로필 참고'}, ${p.tel ?? '전화는 프로필 참고'})`).join(', ')}이 있습니다. 방문 전 전화로 당일 진료 여부를 확인하시기 바랍니다. (기준일: ${buildDate})`,
    },
  ];
  const nightPs = partners.filter(hasNight);
  if (nightPs.length) faqs.push({
    q: `${label}에서 평일 저녁·야간에 진료하는 치과는?`,
    a: `${nightPs.map(p => `${p.name}(${p.hours ?? '진료시간 전화 확인'})`).join(', ')}이 야간진료를 운영합니다. 요일별 운영 시간이 다를 수 있어 방문 당일 전화 확인을 권장합니다.`,
  });
  const sunPs = partners.filter(hasSunday);
  if (sunPs.length) faqs.push({
    q: `${label}에서 일요일·공휴일에 진료하는 치과는?`,
    a: `${sunPs.map(p => `${p.name}(${p.hours ?? '진료시간 전화 확인'})`).join(', ')}이 일요일·공휴일 진료를 운영합니다. 사전 예약 또는 전화 확인 후 방문을 권장합니다.`,
  });
  faqs.push({
    q: `${label} 치과 임플란트 가격은 어디서 확인하나요?`,
    a: `건강보험심사평가원에 신고된 지역 비급여 가격은 메디픽 지역별 비교 페이지에서 확인할 수 있습니다. 개별 기관의 확인된 가격은 각 치과 프로필에 표시됩니다.`,
  });

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  };
  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `${label} 치과 목록`,
    itemListElement: partners.map((p, i) => ({
      '@type': 'ListItem', position: i + 1, name: p.name, url: `${BASE_URL}/clinics/${p.id}/`,
    })),
  };
  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: '홈', item: `${BASE_URL}/` },
      { '@type': 'ListItem', position: 2, name: `${p0.sido} ${p0.sgguNm ?? ''}`.trim(), item: `${BASE_URL}${sgguArticlePath(p0) ?? '/articles/'}` },
      { '@type': 'ListItem', position: 3, name: `${label} 치과`, item: url },
    ],
  };

  const desc = `${label} 치과 정보 — ${partners.map(p => p.name).join(', ')}. 주소·진료시간·연락처와 지역 비급여 가격 비교 링크. ${buildDate} 기준.`;
  const artPath = sgguArticlePath(p0);

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="index, follow">
  <title>${esc(title)} | ${SITE_NAME}</title>
  <meta name="description" content="${esc(desc)}">
  <meta property="og:type" content="article">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(desc)}">
  <meta property="og:url" content="${url}">
  <meta property="og:site_name" content="${SITE_NAME}">
  <meta property="og:locale" content="ko_KR">
  <link rel="canonical" href="${url}">
  <link href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css" rel="stylesheet">
  <link rel="stylesheet" href="${BASE_URL}/style.css">
  <link rel="stylesheet" href="${BASE_URL}/article.css">
  <script type="application/ld+json">${JSON.stringify(faqJsonLd)}</script>
  <script type="application/ld+json">${JSON.stringify(itemList)}</script>
  <script type="application/ld+json">${JSON.stringify(breadcrumb)}</script>
</head>
<body>
<header class="site-header">
  <div class="inner">
    <a class="logo" href="${BASE_URL}/">메디픽</a>
    <nav>
      <a href="${BASE_URL}/dental/">지역별 비교</a>
      <a href="${BASE_URL}/clinics/">치과 프로필</a>
    </nav>
  </div>
</header>
<section class="article-hero">
  <div class="inner">
    <nav class="breadcrumb">
      <a href="${BASE_URL}/">홈</a> <span>/</span>
      ${artPath ? `<a href="${BASE_URL}${artPath}">${esc(p0.sido)} ${esc(p0.sgguNm ?? '')}</a> <span>/</span>` : ''}
      <span>${esc(label)} 치과</span>
    </nav>
    <h1>${esc(label)} 치과는 어디에 있나요?</h1>
    <p class="article-sub">${buildDate} 기준 · 주소·진료시간·연락처</p>
  </div>
</section>
<main class="inner article-body">
  <section class="key-result-section">
    <h2>바로 답변</h2>
    <p>${answer} 아래에서 주소·진료시간·연락처를 확인하세요. (기준일: ${buildDate})</p>
  </section>
  <section class="clinics-detail-section">
    <h2>${esc(near)} 치과 상세 정보</h2>
    ${partners.map(partnerCard).join('')}
  </section>
  <section class="faq-section">
    <h2>자주 묻는 질문</h2>
    <div class="faq-list">${faqs.map(f => `
      <details class="faq-item"><summary>${esc(f.q)}</summary><div class="faq-ans">${esc(f.a)}</div></details>`).join('')}
    </div>
  </section>
  <section class="source-section">
    <div class="source-box">
      <h3>안내 및 고지</h3>
      <ul>
        <li>${DISCLOSURE}</li>
        <li>진료시간·주소는 의료기관 사정으로 변동될 수 있으니 방문 전 전화 확인을 권장합니다.</li>
        <li>${artPath ? `이 지역 전체 기관의 비급여 가격 비교: <a href="${BASE_URL}${artPath}">${esc(p0.sido)} ${esc(p0.sgguNm ?? '')} 임플란트 가격 아티클</a> · ` : ''}<a href="${BASE_URL}/dental/">지역별 비교 페이지</a> · <a href="https://www.hira.or.kr" target="_blank" rel="noopener">건강보험심사평가원</a></li>
      </ul>
    </div>
  </section>
</main>
<footer class="site-footer">
  <div class="inner">
    <div class="footer-links">
      <a href="${BASE_URL}/">홈</a>
      <a href="${BASE_URL}/clinics/">치과 프로필</a>
      <a href="${BASE_URL}/dental/">지역별 비교</a>
    </div>
    <p class="footer-note">건강보험심사평가원 공공데이터 기반 · 의료광고법 제56조 준수</p>
    <p class="footer-copy">© ${new Date().getFullYear()} ${SITE_NAME}</p>
  </div>
</footer>
</body>
</html>`;

  checkLawHard(html, `local/${slug}/index.html`);
  const dir = join(OUT_DIR, slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), html, 'utf8');
  return { path: `/local/${slug}/`, priority: '0.8', freq: 'weekly', title: `${label} 치과` };
}

/** 전체 동·역 페이지 생성 → sitemap 경로 목록 반환 */
export function generateAllLocalPages(buildDate) {
  const partners = loadPartners();
  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });

  // (시도|동·역 라벨) 그룹핑 — 같은 동 이름이 다른 도시에 있어도 분리 (예: 부천 중동 vs 인천 중동)
  const groups = new Map();
  for (const p of partners) {
    for (const area of detectAreas(p)) {
      if (!area?.label) continue;
      const k = `${p.sido}|${area.label}`;
      if (!groups.has(k)) groups.set(k, { area, partners: [] });
      groups.get(k).partners.push(p);
    }
  }

  const pages = [];
  for (const { area, partners: ps } of groups.values()) {
    const page = generateLocalPage(area, ps, buildDate);
    console.log(`  ✓ ${page.path} (${page.title}, ${ps.length}곳)`);
    pages.push(page);
  }
  console.log(`  → 동·역세권 페이지 ${pages.length}건 생성`);
  return pages;
}

// --- 직접 실행 ---
if (process.argv[1]?.endsWith('gen-local.js')) {
  const pages = generateAllLocalPages(new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10));
  console.log(`\n✅ ${pages.length}건 완료`);
}
