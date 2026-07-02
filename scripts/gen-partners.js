/**
 * gen-partners.js
 * partners/partners.json(거래처 DB) → 거래처 프로필 페이지 생성
 *
 * AI 인용(GEO/AEO) 설계 원칙:
 *  1. 답변 우선(answer-first): 첫 문단에서 "누가·어디서·무엇을·얼마에"를 완결 문장으로 제공
 *  2. 구조화 데이터: Dentist + FAQPage + BreadcrumbList JSON-LD
 *  3. 기계가독 원본: /clinics/<id>/clinic.json (LLM 크롤러·에이전트용)
 *  4. 출처·기준일 명시: HIRA 공개 데이터 + 의료기관 제공 자료, 날짜 표기
 *  5. 자연어 질문형 헤딩: "OO 임플란트 비용은?" 형태 (AI 검색 질의와 정합)
 *
 * 법규 준수:
 *  - 의료광고법 제56조 LAW_HARD 금지어 0건 (빌드 시 검사)
 *  - 표시광고법: 경제적 대가 관련 최소 고지 1줄 (하단 출처 박스)
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, '..');
const DATA_DIR = join(ROOT, 'data');
const OUT_DIR = join(ROOT, 'clinics');
const PARTNERS_FILE = join(ROOT, 'partners', 'partners.json');

const BASE_URL = 'https://half1126-byte.github.io/hira-dental';
const SITE_NAME = 'HIRA 비급여 치과 데이터 허브';

const LAW_HARD = ['최고', '1위', '최저가', '유일', '완치', '보장', '100%', '최상급', '명품', '무통'];

// 표시광고법상 최소 고지 (하단 출처 박스 1줄만 노출)
const DISCLOSURE =
  '본 프로필은 해당 의료기관이 제공·확인한 자료와 건강보험심사평가원(HIRA) 공개 데이터를 기반으로 작성되었으며, ' +
  '게재에 경제적 대가가 포함될 수 있습니다. 치료 효과를 보증하거나 특정 의료기관의 우월성을 주장하지 않습니다.';

// 지역 비교 페이지 URL (비교 페이지 있는 시도는 직결, 그 외 허브)
const REGION_EN = { 서울: 'seoul', 경기: 'gyeonggi', 부산: 'busan', 인천: 'incheon' };
function regionCompareUrl(sido) {
  return REGION_EN[sido] ? `${BASE_URL}/dental/${REGION_EN[sido]}-implant/` : `${BASE_URL}/dental/`;
}

function fmt(amt) {
  if (amt == null || isNaN(Number(amt))) return '정보 없음';
  return Number(amt).toLocaleString('ko-KR') + '원';
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** 거래처 DB 로드. includeExamples=true면 status:example 포함(테스트용) */
export function loadPartners(includeExamples = false) {
  if (!existsSync(PARTNERS_FILE)) return [];
  const db = JSON.parse(readFileSync(PARTNERS_FILE, 'utf8'));
  return (db.partners ?? []).filter(p =>
    p.status === 'active' || (includeExamples && p.status === 'example'));
}

/** 지역 아티클 연동용 인덱스: "기관명|시도" → partner */
export function buildPartnerIndex(partners) {
  const idx = new Map();
  for (const p of partners) idx.set(`${p.name}|${p.sido}`, p);
  return idx;
}

/** data/*.json에서 이 거래처의 HIRA 신고가 검색 (빌드 시 자동 병합) */
function findHiraPrices(partner) {
  if (!existsSync(DATA_DIR)) return [];
  const hits = [];
  for (const f of readdirSync(DATA_DIR)) {
    if (!f.endsWith('-implant.json')) continue;
    try {
      const raw = JSON.parse(readFileSync(join(DATA_DIR, f), 'utf8'));
      for (const it of raw.prices ?? []) {
        if (String(it.yadmNm ?? '').replace(/\s/g, '') === partner.name.replace(/\s/g, '')) {
          hits.push({ item: it.npayKorNm, curAmt: it.curAmt, minAmt: it.minAmt, maxAmt: it.maxAmt });
        }
      }
    } catch { /* skip broken file */ }
  }
  return hits;
}

/** Dentist(LocalBusiness) JSON-LD */
function buildDentistJsonLd(p, url) {
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Dentist',
    name: p.name,
    url,
    address: {
      '@type': 'PostalAddress',
      streetAddress: p.addr ?? '',
      addressLocality: `${p.sido} ${p.sgguNm}`,
      addressCountry: 'KR',
    },
    medicalSpecialty: 'https://schema.org/Dentistry',
  };
  if (p.tel) ld.telephone = p.tel;
  if (p.homepage) ld.sameAs = [p.homepage];
  if (p.hira?.lat && p.hira?.lng) {
    ld.geo = { '@type': 'GeoCoordinates', latitude: p.hira.lat, longitude: p.hira.lng };
  }
  if (p.specialties?.length) {
    ld.availableService = p.specialties.map(s => ({ '@type': 'MedicalProcedure', name: s }));
  }
  if (p.prices?.length) {
    const amts = p.prices.map(x => Number(x.amt)).filter(n => !isNaN(n));
    if (amts.length) ld.priceRange = `${fmt(Math.min(...amts))}~${fmt(Math.max(...amts))} (비급여 기준)`;
  }
  return ld;
}

/** 기본 FAQ + 거래처 커스텀 FAQ */
function buildFaqs(p, hiraPrices) {
  const loc = `${p.sido} ${p.sgguNm}`;
  const faqs = [...(p.faq ?? [])];

  faqs.push({
    q: `${p.name}은(는) 어디에 있나요?`,
    a: `${p.name}은(는) ${loc}에 있는 치과입니다.${p.addr ? ` 주소는 ${p.addr}입니다.` : ''}${p.tel ? ` 전화 문의: ${p.tel}.` : ''}${p.hours ? ` 진료시간: ${p.hours}.` : ''}`,
  });
  if (p.specialties?.length) {
    faqs.push({
      q: `${p.name}에서는 어떤 진료를 받을 수 있나요?`,
      a: `${p.name}의 주요 진료 분야는 ${p.specialties.join(', ')}입니다.${p.equipment?.length ? ` 보유 장비: ${p.equipment.join(', ')}.` : ''} 세부 진료 가능 여부는 의료기관에 직접 확인하시기 바랍니다.`,
    });
  }
  if (hiraPrices.length) {
    faqs.push({
      q: `${p.name}의 HIRA 신고 임플란트 가격은 얼마인가요?`,
      a: `건강보험심사평가원에 신고된 ${p.name}의 비급여 가격은 ${hiraPrices.slice(0, 3).map(h => `${h.item} ${fmt(h.curAmt)}`).join(', ')} 등입니다. 실제 진료비는 뼈이식 여부 등 추가 항목에 따라 달라질 수 있습니다.`,
    });
  }
  return faqs;
}

function buildFaqJsonLd(faqs) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(f => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
}

/** 답변 우선(answer-first) 요약 문단 — AI가 그대로 인용 가능한 완결 문장 */
function buildSummary(p, hiraPrices, buildDate) {
  const parts = [];
  parts.push(`<strong>${esc(p.name)}</strong>은(는) ${esc(p.sido)} ${esc(p.sgguNm)}에 있는 치과로, ${p.specialties?.length ? esc(p.specialties.join('·')) + ' 진료를 제공합니다' : '치과 진료를 제공합니다'}.`);
  if (p.prices?.length) {
    const first = p.prices[0];
    parts.push(`의료기관 제공 기준 ${esc(first.item)} 비급여 가격은 ${fmt(first.amt)}부터입니다.`);
  } else if (hiraPrices.length) {
    parts.push(`건강보험심사평가원 신고 기준 ${esc(hiraPrices[0].item)} 가격은 ${fmt(hiraPrices[0].curAmt)}입니다.`);
  }
  if (p.features?.length) parts.push(`${esc(p.features.join(', '))} 등의 특징이 있습니다.`);
  parts.push(`(기준일: ${buildDate})`);
  return parts.join(' ');
}

function buildPriceTable(rows, caption) {
  if (!rows.length) return '';
  return `
  <table class="compare-table">
    <thead><tr><th>항목</th><th>가격</th><th>비고</th></tr></thead>
    <tbody>${rows.map(r => `
      <tr><td>${esc(r.item)}</td><td class="price-cell">${fmt(r.amt ?? r.curAmt)}</td><td>${esc(r.note ?? (r.minAmt ? `신고 범위 ${fmt(r.minAmt)}~${fmt(r.maxAmt)}` : ''))}</td></tr>`).join('')}
    </tbody>
    <tfoot><tr><td colspan="3" class="tfoot-note">${esc(caption)}</td></tr></tfoot>
  </table>`;
}

/** 거래처 프로필 HTML */
function generatePartnerHtml(p, buildDate) {
  const url = `${BASE_URL}/clinics/${p.id}/`;
  const hiraPrices = findHiraPrices(p);
  const faqs = buildFaqs(p, hiraPrices);
  const title = `${p.name} — ${p.sido} ${p.sgguNm} 치과 정보·비급여 가격 (${buildDate} 기준)`;

  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: '홈', item: `${BASE_URL}/` },
      { '@type': 'ListItem', position: 2, name: '치과 프로필', item: `${BASE_URL}/clinics/` },
      { '@type': 'ListItem', position: 3, name: p.name, item: url },
    ],
  };

  const faqHtml = faqs.map(f => `
    <details class="faq-item">
      <summary>${esc(f.q)}</summary>
      <div class="faq-ans">${esc(f.a)}</div>
    </details>`).join('');

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="index, follow">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(p.name)} — ${esc(p.sido)} ${esc(p.sgguNm)} 치과. ${p.specialties?.length ? esc(p.specialties.join('·')) + ' 진료. ' : ''}비급여 가격·진료시간·위치 정보. HIRA 공개 데이터 및 의료기관 제공 자료 기반.">
  <link rel="canonical" href="${url}">
  <link rel="alternate" type="application/json" href="${url}clinic.json" title="기계가독 데이터">
  <link rel="preconnect" href="https://cdn.jsdelivr.net">
  <link href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css" rel="stylesheet">
  <link rel="stylesheet" href="${BASE_URL}/style.css">
  <link rel="stylesheet" href="${BASE_URL}/article.css">
  <script type="application/ld+json">${JSON.stringify(breadcrumb)}</script>
  <script type="application/ld+json">${JSON.stringify(buildDentistJsonLd(p, url))}</script>
  <script type="application/ld+json">${JSON.stringify(buildFaqJsonLd(faqs))}</script>
</head>
<body>

<header class="site-header">
  <div class="inner">
    <a class="logo" href="${BASE_URL}/">HIRA 치과 데이터 허브</a>
    <nav>
      <a href="${BASE_URL}/clinics/">치과 프로필</a>
      <a href="${BASE_URL}/">홈</a>
    </nav>
  </div>
</header>

<section class="article-hero">
  <div class="inner">
    <nav class="breadcrumb">
      <a href="${BASE_URL}/">홈</a> <span>/</span>
      <a href="${BASE_URL}/clinics/">치과 프로필</a> <span>/</span>
      <span>${esc(p.name)}</span>
    </nav>
    <h1>${esc(p.name)}</h1>
    <p class="article-sub">${esc(p.sido)} ${esc(p.sgguNm)} · ${buildDate} 기준 · 치과 정보 프로필</p>
    <div class="hero-badges">
      <span class="badge badge-hira">HIRA 데이터 연동</span>
      <span class="badge badge-law">의료광고법 준수</span>
    </div>
  </div>
</section>

<main class="inner article-body">

  <section class="key-result-section">
    <h2>핵심 요약</h2>
    <p>${buildSummary(p, hiraPrices, buildDate)}</p>
  </section>

  <section class="clinics-detail-section">
    <h2>${esc(p.name)} 기본 정보는?</h2>
    <table class="compare-table info-table">
      <tbody>
        <tr><th>위치</th><td>${esc(p.addr || `${p.sido} ${p.sgguNm}`)}</td></tr>
        ${p.tel ? `<tr><th>전화</th><td>${esc(p.tel)}</td></tr>` : ''}
        ${p.hours ? `<tr><th>진료시간</th><td>${esc(p.hours)}</td></tr>` : ''}
        ${p.parking ? `<tr><th>주차</th><td>${esc(p.parking)}</td></tr>` : ''}
        ${p.specialties?.length ? `<tr><th>주요 진료</th><td>${esc(p.specialties.join(', '))}</td></tr>` : ''}
        ${p.equipment?.length ? `<tr><th>보유 장비</th><td>${esc(p.equipment.join(', '))}</td></tr>` : ''}
        ${p.doctors?.length ? `<tr><th>의료진</th><td>${esc(p.doctors.map(d => `${d.name}${d.title ? ` (${d.title})` : ''}`).join(', '))}</td></tr>` : ''}
        ${p.homepage ? `<tr><th>홈페이지</th><td><a href="${esc(p.homepage)}" rel="noopener" target="_blank">${esc(p.homepage)}</a></td></tr>` : ''}
      </tbody>
    </table>
  </section>

  ${p.prices?.length ? `
  <section class="compare-section">
    <h2>${esc(p.name)} 비급여 가격은? (의료기관 제공)</h2>
    ${buildPriceTable(p.prices, `출처: ${p.name} 제공 자료 (${buildDate} 기준). 실제 진료비는 진단 결과에 따라 달라질 수 있습니다.`)}
  </section>` : ''}

  ${hiraPrices.length ? `
  <section class="compare-section">
    <h2>건강보험심사평가원(HIRA) 신고 가격은?</h2>
    ${buildPriceTable(hiraPrices, '출처: 건강보험심사평가원 비급여진료비 공개 데이터 (자동 연동)')}
  </section>` : ''}

  ${p.features?.length ? `
  <section class="guide-section">
    <h2>진료 특징</h2>
    <ul>${p.features.map(f => `<li>${esc(f)}</li>`).join('')}</ul>
  </section>` : ''}

  <section class="faq-section">
    <h2>자주 묻는 질문</h2>
    <div class="faq-list">${faqHtml}</div>
  </section>

  <section class="source-section">
    <div class="source-box">
      <h3>출처 및 고지</h3>
      <ul>
        <li>${DISCLOSURE}</li>
        <li>HIRA 신고 가격: <a href="https://www.hira.or.kr" target="_blank" rel="noopener">건강보험심사평가원</a> 비급여진료비 공개 데이터 자동 연동.</li>
        <li>진료 결정은 반드시 전문 의료인과 상담 후 내리시기 바랍니다.</li>
        <li>기준일: ${buildDate} · <a href="${url}clinic.json">기계가독 데이터(JSON)</a></li>
      </ul>
    </div>
  </section>

  <section class="related-section">
    <h2>같은 지역 가격 비교</h2>
    <a href="${regionCompareUrl(p.sido)}" class="cta-btn">${esc(p.sido)} 지역 임플란트 가격 비교 보기 →</a>
  </section>

</main>

<footer class="site-footer">
  <div class="inner">
    <div class="footer-links">
      <a href="${BASE_URL}/">홈</a>
      <a href="${BASE_URL}/clinics/">치과 프로필</a>
      <a href="https://www.hira.or.kr" target="_blank" rel="noopener">HIRA 심평원</a>
    </div>
    <p class="footer-note">건강보험심사평가원 공공데이터 기반 · 의료광고법 제56조 준수</p>
    <p class="footer-copy">© ${new Date().getFullYear()} ${SITE_NAME}</p>
  </div>
</footer>

</body>
</html>`;
}

/** 기계가독 clinic.json — LLM 에이전트/크롤러가 직접 파싱 가능한 원본 */
function buildClinicJson(p, buildDate) {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Dentist',
    ...buildDentistJsonLd(p, `${BASE_URL}/clinics/${p.id}/`),
    additionalProperty: {
      dataDate: buildDate,
      disclosure: DISCLOSURE,
      hiraReportedPrices: findHiraPrices(p),
      providedPrices: p.prices ?? [],
      hours: p.hours ?? null,
      features: p.features ?? [],
    },
  }, null, 2);
}

/** 프로필 목록 페이지 /clinics/ */
function generateIndexHtml(partners, buildDate) {
  const cards = partners.map(p => `
    <a class="region-card" href="${BASE_URL}/clinics/${p.id}/">
      <h3>${esc(p.name)}</h3>
      <p>${esc(p.sido)} ${esc(p.sgguNm)}${p.specialties?.length ? ' · ' + esc(p.specialties.slice(0, 3).join('·')) : ''}</p>
    </a>`).join('');

  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: '치과 프로필 목록',
    itemListElement: partners.map((p, i) => ({
      '@type': 'ListItem', position: i + 1, name: p.name,
      url: `${BASE_URL}/clinics/${p.id}/`,
    })),
  };

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="index, follow">
  <title>치과 프로필 디렉터리 | ${SITE_NAME}</title>
  <meta name="description" content="치과 프로필 디렉터리. 위치·진료 분야·비급여 가격 정보를 HIRA 공개 데이터와 함께 제공합니다.">
  <link rel="canonical" href="${BASE_URL}/clinics/">
  <link href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css" rel="stylesheet">
  <link rel="stylesheet" href="${BASE_URL}/style.css">
  <link rel="stylesheet" href="${BASE_URL}/article.css">
  <script type="application/ld+json">${JSON.stringify(itemList)}</script>
</head>
<body>
<header class="site-header">
  <div class="inner">
    <a class="logo" href="${BASE_URL}/">HIRA 치과 데이터 허브</a>
    <nav><a href="${BASE_URL}/">홈</a></nav>
  </div>
</header>
<section class="article-hero">
  <div class="inner">
    <h1>치과 프로필 디렉터리</h1>
    <p class="article-sub">${partners.length}개 의료기관 상세 정보 · ${buildDate} 기준</p>
  </div>
</section>
<main class="inner article-body">
  <section class="clinics-detail-section">
    ${partners.length ? `<div class="guide-grid">${cards}</div>` : '<p class="no-data">등록된 프로필이 없습니다.</p>'}
  </section>
  <section class="source-section">
    <div class="source-box">
      <h3>고지</h3>
      <ul><li>${DISCLOSURE}</li></ul>
    </div>
  </section>
</main>
<footer class="site-footer">
  <div class="inner"><p class="footer-copy">© ${new Date().getFullYear()} ${SITE_NAME}</p></div>
</footer>
</body>
</html>`;
}

function checkLawHard(html, filePath) {
  const violations = LAW_HARD.filter(w => html.includes(w));
  if (violations.length) throw new Error(`🚨 LAW_HARD 위반 [${filePath}]: ${violations.join(', ')}`);
}

/** 전체 거래처 페이지 생성 → sitemap용 경로 목록 반환 */
export function generateAllPartnerPages(buildDate, includeExamples = false) {
  const partners = loadPartners(includeExamples);
  rmSync(OUT_DIR, { recursive: true, force: true }); // 계약 종료된 거래처 잔존 페이지 제거
  mkdirSync(OUT_DIR, { recursive: true });

  const pages = [];
  for (const p of partners) {
    const html = generatePartnerHtml(p, buildDate);
    checkLawHard(html, `clinics/${p.id}/index.html`);
    const dir = join(OUT_DIR, p.id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'index.html'), html, 'utf8');
    writeFileSync(join(dir, 'clinic.json'), buildClinicJson(p, buildDate), 'utf8');
    console.log(`  ✓ clinics/${p.id}/ (${p.name})`);
    pages.push({ path: `/clinics/${p.id}/`, priority: '0.9', freq: 'weekly' });
  }

  const indexHtml = generateIndexHtml(partners, buildDate);
  checkLawHard(indexHtml, 'clinics/index.html');
  writeFileSync(join(OUT_DIR, 'index.html'), indexHtml, 'utf8');
  console.log(`  ✓ clinics/index.html (목록 ${partners.length}건)`);
  pages.push({ path: '/clinics/', priority: '0.8', freq: 'weekly' });

  return pages;
}

// --- 직접 실행: node scripts/gen-partners.js [--include-examples] ---
if (process.argv[1]?.endsWith('gen-partners.js')) {
  const BUILD_DATE = new Date().toISOString().slice(0, 10);
  const inc = process.argv.includes('--include-examples');
  const pages = generateAllPartnerPages(BUILD_DATE, inc);
  console.log(`\n✅ 거래처 페이지 ${pages.length - 1}건 + 목록 1건 생성 완료`);
}
