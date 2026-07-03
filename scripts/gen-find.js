/**
 * gen-find.js
 * 니즈별 치과 찾기 페이지 자동 생성 — "○○ 야간진료 치과", "○○ 일요일 진료 치과"
 *
 * AI 검색 질의("부천 야간진료 치과 있나요?")와 1:1로 대응하는 전용 페이지를
 * 거래처 DB의 진료시간·특징에서 자동 감지해 생성한다.
 * 거래처가 없는 지역×니즈 조합은 생성하지 않으며, 계약 해지 시 자동 소멸.
 */

import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPartners } from './gen-partners.js';
import { toSlug } from './gen-articles.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, '..');
const OUT_DIR = join(ROOT, 'find');

const BASE_URL = 'https://half1126-byte.github.io/hira-dental';
const SITE_NAME = 'HIRA 비급여 치과 데이터 허브';
const LAW_HARD = ['최고', '1위', '최저가', '유일', '완치', '보장', '100%', '최상급', '명품', '무통'];

const DISCLOSURE =
  '본 페이지에 소개된 의료기관 정보는 해당 기관이 제공·확인한 자료 기반이며, 게재에 경제적 대가가 포함될 수 있습니다. ' +
  '해당 지역에는 이 밖에도 여러 의료기관이 있으므로 지역 비교 페이지와 심평원 자료를 함께 확인하시기 바랍니다.';

const SIDO_EN = { 서울: 'seoul', 경기: 'gyeonggi', 부산: 'busan', 인천: 'incheon', 대구: 'daegu', 광주: 'gwangju', 대전: 'daejeon', 울산: 'ulsan', 강원: 'gangwon', 충북: 'chungbuk', 충남: 'chungnam', 전북: 'jeonbuk', 전남: 'jeonnam', 경북: 'gyeongbuk', 경남: 'gyeongnam', 제주: 'jeju', 세종: 'sejong' };

// 니즈 정의: 감지 조건 + 페이지 문구
const NEEDS = [
  {
    key: 'night',
    label: '야간진료',
    question: '평일 저녁·야간에 진료하는 치과',
    detect: p => /야간/.test(`${p.hours ?? ''} ${(p.features ?? []).join(' ')}`),
    tip: '야간진료는 요일별로 운영 시간이 다른 경우가 많으므로, 방문 당일 전화로 접수 마감 시간을 확인하는 것이 안전합니다.',
  },
  {
    key: 'sunday',
    label: '일요일·공휴일 진료',
    question: '일요일이나 공휴일에도 진료하는 치과',
    detect: p => {
      const t = `${p.hours ?? ''} ${(p.features ?? []).join(' ')}`;
      if (/365일/.test(t)) return true;
      return /(일요일|공휴일|주말)[^·\n]*진료/.test(t) && !/일\/공휴일 휴진|일요일 휴진/.test(t);
    },
    tip: '일요일·공휴일은 일반 접수보다 대기가 길 수 있어 사전 예약 또는 전화 확인 후 방문을 권장합니다.',
  },
];

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function checkLawHard(html, filePath) {
  const v = LAW_HARD.filter(w => html.includes(w));
  if (v.length) throw new Error(`🚨 LAW_HARD 위반 [${filePath}]: ${v.join(', ')}`);
}

/** 지역 라벨: "서울 강동구" | "경기 부천원미구" 등 + slug */
function regionOf(p) {
  const label = p.sgguNm ? `${p.sido} ${p.sgguNm}` : p.sido;
  // 슬러그 맵은 '계양구'가 아닌 '인천계양구' 형태 키도 있어 시도 접두 재시도
  let sgguSlug = p.sgguNm ? toSlug(p.sgguNm) : '';
  if (sgguSlug === 'unknown') sgguSlug = toSlug(`${p.sido}${p.sgguNm}`);
  const slug = p.sgguNm && sgguSlug !== 'unknown'
    ? `${SIDO_EN[p.sido] ?? 'kr'}-${sgguSlug}`
    : (SIDO_EN[p.sido] ?? 'kr');
  return { label, slug };
}

/** 거래처 요약 카드 */
function partnerCard(p) {
  return `
  <div class="article-clinic">
    <h3 class="clinic-h3">${esc(p.name)}</h3>
    <div class="clinic-meta-row">
      <span class="meta-tag">📍 ${esc(p.sido)} ${esc(p.sgguNm ?? '')}</span>
      ${p.hours ? `<span class="meta-tag hira-tag">⏰ 진료시간 정보 보유</span>` : ''}
    </div>
    ${p.hours ? `<div class="clinic-addr"><strong>진료시간:</strong> ${esc(p.hours)}</div>` : ''}
    ${p.addr ? `<div class="clinic-addr"><strong>주소:</strong> ${esc(p.addr)}</div>` : ''}
    ${p.tel ? `<div class="clinic-tel"><strong>전화:</strong> ${esc(p.tel)}</div>` : ''}
    <div style="margin-top:0.7rem"><a class="partner-tag" href="${BASE_URL}/clinics/${p.id}/">상세 프로필 →</a></div>
  </div>`;
}

function generateFindPage(region, need, partners, buildDate) {
  const url = `${BASE_URL}/find/${region.slug}-${need.key}/`;
  const title = `${region.label} ${need.label} 치과 (${buildDate} 기준)`;
  const answer = `${region.label}에서 ${need.question}로는 ${partners.map(p =>
    `<strong>${esc(p.name)}</strong>`).join(', ')}${partners.length > 1 ? ' 등이' : '이(가)'} 있습니다.`;

  const faqs = [
    {
      q: `${region.label}에 ${need.label} 치과가 있나요?`,
      a: `${region.label}의 ${partners.map(p => `${p.name}(${p.hours ?? '진료시간 전화 확인'})`).join(', ')}에서 ${need.question.replace('치과', '진료')}를 확인할 수 있습니다. 방문 전 전화로 당일 진료 여부를 확인하시기 바랍니다. (기준일: ${buildDate})`,
    },
    {
      q: `${need.label} 치과 이용 시 주의할 점은?`,
      a: need.tip,
    },
  ];

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  };
  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: title,
    itemListElement: partners.map((p, i) => ({
      '@type': 'ListItem', position: i + 1, name: p.name, url: `${BASE_URL}/clinics/${p.id}/`,
    })),
  };

  const desc = `${region.label} ${need.label} 치과 정보 — ${partners.map(p => p.name).join(', ')}. 진료시간·연락처·위치. ${buildDate} 기준.`;

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
</head>
<body>
<header class="site-header">
  <div class="inner">
    <a class="logo" href="${BASE_URL}/">HIRA 치과 데이터 허브</a>
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
      <span>${esc(region.label)} ${esc(need.label)}</span>
    </nav>
    <h1>${esc(region.label)} ${esc(need.label)} 치과는?</h1>
    <p class="article-sub">${buildDate} 기준 · 진료시간·연락처 정보</p>
  </div>
</section>
<main class="inner article-body">
  <section class="key-result-section">
    <h2>바로 답변</h2>
    <p>${answer} 아래에서 진료시간과 연락처를 확인하세요. (기준일: ${buildDate})</p>
  </section>
  <section class="clinics-detail-section">
    <h2>${esc(region.label)} ${esc(need.label)} 운영 기관</h2>
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
        <li>진료시간은 의료기관 사정으로 변동될 수 있으니 방문 전 전화 확인을 권장합니다.</li>
        <li>지역 전체 기관의 비급여 가격 비교: <a href="${BASE_URL}/dental/">지역별 비교 페이지</a> · <a href="https://www.hira.or.kr" target="_blank" rel="noopener">건강보험심사평가원</a></li>
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

  checkLawHard(html, `find/${region.slug}-${need.key}/index.html`);
  const dir = join(OUT_DIR, `${region.slug}-${need.key}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), html, 'utf8');
  return { path: `/find/${region.slug}-${need.key}/`, priority: '0.8', freq: 'weekly', title };
}

/** 전체 니즈 페이지 생성 → sitemap 경로 목록 반환 */
export function generateAllFindPages(buildDate) {
  const partners = loadPartners();
  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });

  // (지역 라벨 × 니즈) 그룹핑: 시군구 단위 + 시도 단위 둘 다 생성
  const groups = new Map(); // key: slug|needKey → {region, need, partners:[]}
  for (const p of partners) {
    for (const need of NEEDS) {
      if (!need.detect(p)) continue;
      const targets = [regionOf(p)];
      if (p.sgguNm) targets.push({ label: p.sido, slug: SIDO_EN[p.sido] ?? 'kr' }); // 시도 단위 집계
      for (const region of targets) {
        const k = `${region.slug}|${need.key}`;
        if (!groups.has(k)) groups.set(k, { region, need, partners: [] });
        groups.get(k).partners.push(p);
      }
    }
  }

  const pages = [];
  for (const { region, need, partners: ps } of groups.values()) {
    const page = generateFindPage(region, need, ps, buildDate);
    console.log(`  ✓ ${page.path} (${ps.length}곳)`);
    pages.push(page);
  }
  console.log(`  → 니즈별 페이지 ${pages.length}건 생성`);
  return pages;
}

// --- 직접 실행 ---
if (process.argv[1]?.endsWith('gen-find.js')) {
  const pages = generateAllFindPages(new Date().toISOString().slice(0, 10));
  console.log(`\n✅ ${pages.length}건 완료`);
}
