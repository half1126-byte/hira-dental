/**
 * gen-district.js
 * 시군구별 치과 현황 페이지
 *   /dental/{시도}/          — 시도 안 시군구 목록 (치과의원·치과병원·치과의사 수)
 *   /dental/{시도}/{시군구}/ — 시군구 치과 현황 + 전체 기관 목록
 *
 * 원천: meta/institutions/{시도}.json (건강보험심사평가원 병원정보서비스, build.js가 주 1회 갱신)
 *
 * 원칙
 * - 공공데이터 사실만 싣는다. 순위·추천·평가 없음. 목록은 동 → 기관명 가나다순
 * - 제휴(유료) 여부를 표시하거나 정렬에 반영하지 않는다 (정보면과 광고면 분리)
 * - 기관명은 실제 상호라 금지어 검사에서 제외하고, 우리가 쓴 문장만 검사한다
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASE_URL, SITE_NAME, REGIONS, checkLawHard } from './site-config.js';
import { toSlug } from './gen-articles.js';
import { pageDates } from './page-dates.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const INST_DIR = join(ROOT, 'meta', 'institutions');
const OUT = join(ROOT, 'dental');

// 기관이 이보다 적은 시군구는 noindex + 사이트맵 제외 (얇은 페이지 방지)
export const MIN_DISTRICT_INSTITUTIONS = 5;

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const n = v => Number(v).toLocaleString('ko-KR');
const kDate = iso => { const d = new Date(new Date(iso).getTime() + 9 * 3600e3); return `${d.getUTCFullYear()}년 ${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`; };
const year = estb => (/^\d{8}$/.test(estb) ? estb.slice(0, 4) : '');

function summarize(items, fetchedAt) {
  const clinic = items.filter(x => x.cl === '치과의원').length;
  const hosp = items.filter(x => x.cl === '치과병원').length;
  // 치과의사 수는 값이 있는 기관이 대부분일 때만 신뢰 (필드가 비어 있으면 표시하지 않음)
  const withDent = items.filter(x => Number.isFinite(x.dentists));
  const dentOk = items.length && withDent.length / items.length >= 0.8;
  const dentists = dentOk ? withDent.reduce((a, x) => a + x.dentists, 0) : null;
  const specialists = dentOk ? withDent.reduce((a, x) => a + (x.specialists ?? 0), 0) : null;
  // 최근 1년 신규 개설 (수집일 기준)
  const cut = new Date(new Date(fetchedAt).getTime() - 365 * 864e5).toISOString().slice(0, 10).replace(/-/g, '');
  const withEstb = items.filter(x => /^\d{8}$/.test(x.estb));
  const recent = withEstb.length / Math.max(items.length, 1) >= 0.8 ? withEstb.filter(x => x.estb >= cut).length : null;
  const dongs = {};
  for (const x of items) if (x.dong) dongs[x.dong] = (dongs[x.dong] ?? 0) + 1;
  const topDongs = Object.entries(dongs).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko'));
  return { total: items.length, clinic, hosp, dentists, specialists, recent, topDongs };
}

function shell({ title, desc, path, robots, h1, sub, crumbs, body, jsonLd }) {
  const url = `${BASE_URL}${path}`;
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="${robots}">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(desc)}">
  <meta property="og:url" content="${url}">
  <meta property="og:site_name" content="${SITE_NAME}">
  <meta property="og:locale" content="ko_KR">
  <meta property="og:image" content="${BASE_URL}/assets/og-default.png">
  <link rel="canonical" href="${url}">
  <link href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css" rel="stylesheet">
  <link rel="stylesheet" href="${BASE_URL}/style.css">
  <link rel="stylesheet" href="${BASE_URL}/article.css">
${jsonLd.map(j => `  <script type="application/ld+json">${JSON.stringify(j)}</script>`).join('\n')}
</head>
<body>
<header class="site-header">
  <div class="inner">
    <a class="logo" href="${BASE_URL}/">메디픽</a>
    <nav>
      <a href="${BASE_URL}/dental/">지역별 비교</a>
      <a href="${BASE_URL}/articles/">지역 아티클</a>
      <a href="${BASE_URL}/methodology/">데이터 방법론</a>
    </nav>
  </div>
</header>
<section class="article-hero">
  <div class="inner">
    <nav class="breadcrumb">${crumbs.map(([nm, href]) => (href ? `<a href="${BASE_URL}${href}">${esc(nm)}</a>` : esc(nm))).join(' › ')}</nav>
    <h1>${esc(h1)}</h1>
    <p class="article-sub">${sub}</p>
  </div>
</section>
<main class="inner article-body">
${body}
</main>
<footer class="site-footer">
  <div class="inner">
    <p class="footer-note">건강보험심사평가원 공공데이터 기반 · 특정 의료기관을 추천하거나 평가하지 않습니다 · 의료광고법 제56조 준수</p>
    <p class="footer-copy">© ${new Date().getFullYear()} ${SITE_NAME}</p>
  </div>
</footer>
</body>
</html>`;
}

function breadcrumbLd(items) {
  return {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: items.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: `${BASE_URL}${path}` })),
  };
}

/** 시군구 페이지 */
function districtPage(r, sggu, slug, items, fetchedAt, priceArticle, buildDate) {
  const s = summarize(items, fetchedAt);
  const path = `/dental/${r.en}/${slug}/`;
  const where = `${r.nm} ${sggu}`;
  const asOf = kDate(fetchedAt);
  const indexable = s.total >= MIN_DISTRICT_INSTITUTIONS;
  const top3 = s.topDongs.slice(0, 3).map(([d, c]) => `${d}(${c}곳)`).join(', ');

  const answer = [
    `건강보험심사평가원 병원정보서비스 기준(${asOf} 수집), ${where}에는 치과의원 ${n(s.clinic)}곳과 치과병원 ${n(s.hosp)}곳, 모두 ${n(s.total)}곳의 치과가 있습니다.`,
    s.dentists != null ? `이 기관들에 등록된 치과의사는 ${n(s.dentists)}명이며, 그중 치과 전문의는 ${n(s.specialists)}명입니다.` : '',
    s.recent != null ? `최근 1년 사이 새로 개설한 치과는 ${n(s.recent)}곳입니다.` : '',
    top3 ? `치과가 가장 많은 동은 ${top3}입니다.` : '',
  ].filter(Boolean).join(' ');

  const priceLine = priceArticle
    ? `치과병원의 임플란트 비급여 신고가는 <a href="${BASE_URL}${priceArticle}">${esc(where)} 임플란트 가격</a>에서 볼 수 있습니다.`
    : '이 지역은 비급여 가격을 신고한 치과병원이 적어 별도 가격 통계 페이지가 없습니다.';

  const card = (label, val) => `<div class="stat-card"><div class="stat-label">${label}</div><div class="stat-value">${val}</div></div>`;
  const cards = [
    card('치과의원', `${n(s.clinic)}곳`),
    card('치과병원', `${n(s.hosp)}곳`),
    s.dentists != null ? card('치과의사', `${n(s.dentists)}명`) : '',
    s.recent != null ? card('최근 1년 개설', `${n(s.recent)}곳`) : '',
  ].join('');

  const dongRows = s.topDongs.slice(0, 20).map(([d, c]) => `<tr><td>${esc(d)}</td><td>${n(c)}곳</td></tr>`).join('');

  // 목록: 동 → 기관명 가나다순 (순위 아님)
  const sorted = [...items].sort((a, b) => a.dong.localeCompare(b.dong, 'ko') || a.name.localeCompare(b.name, 'ko'));
  const listRows = sorted.map(x => `<tr><td>${esc(x.name)}</td><td>${x.cl}</td><td>${esc(x.dong || '-')}</td><td>${esc(x.addr)}</td><td>${esc(x.tel || '-')}</td><td>${year(x.estb) || '-'}</td></tr>`).join('');

  const faqs = [
    [`${where}에 치과는 몇 곳인가요?`, `건강보험심사평가원 병원정보서비스 기준(${asOf} 수집) 치과의원 ${n(s.clinic)}곳, 치과병원 ${n(s.hosp)}곳으로 모두 ${n(s.total)}곳입니다.`],
    top3 ? [`${where}에서 치과가 많은 동은 어디인가요?`, `${top3} 순으로 많습니다. 동별 전체 분포는 이 페이지의 표에서 볼 수 있습니다.`] : null,
    [`${where} 치과 임플란트 가격은 어디서 확인하나요?`, priceArticle
      ? `건강보험심사평가원에 비급여 가격을 신고한 치과병원 기준 통계를 ${where} 임플란트 가격 페이지에서 볼 수 있습니다. 치과의원 가격은 공개 API에 포함되지 않아, 실제 비용은 각 의료기관에 확인해야 합니다.`
      : '이 지역은 가격을 신고한 치과병원이 적어 별도 통계를 내지 않습니다. 치과의원 가격은 공개 API에 포함되지 않아 각 의료기관에 확인해야 합니다.'],
    ['이 목록은 순위나 추천인가요?', '아닙니다. 공공데이터에 등록된 기관을 동과 기관명 가나다순으로 나열한 것이며, 광고·제휴 여부와 관계없이 같은 기준으로 표시합니다.'],
  ].filter(Boolean);

  const body = `
  <section class="key-result-section">
    <h2>${esc(where)} 치과 현황 요약</h2>
    <p>${answer}</p>
    <div class="stat-grid district-stats">${cards}</div>
    <p>${priceLine}</p>
  </section>

  <section class="compare-section">
    <h2>${esc(where)} 동별 치과 수</h2>
    <table class="compare-table">
      <thead><tr><th>동</th><th>치과 수</th></tr></thead>
      <tbody>${dongRows}</tbody>
      <tfoot><tr><td colspan="2" class="tfoot-note">출처: 건강보험심사평가원 병원정보서비스 (${asOf} 수집, 치과의원·치과병원)</td></tr></tfoot>
    </table>
  </section>

  <section class="faq-section">
    <h2>자주 묻는 질문</h2>
    <div class="faq-list">${faqs.map(([q, a]) => `<details class="faq-item"><summary>${esc(q)}</summary><div class="faq-ans">${esc(a)}</div></details>`).join('')}</div>
  </section>

  <section class="clinics-detail-section">
    <h2>${esc(where)} 치과 전체 목록 (${n(s.total)}곳)</h2>
    <p class="section-desc">동 → 기관명 가나다순입니다. 진료시간·진료과목·비용은 각 의료기관에 확인하세요.</p>
    <div class="table-scroll">
    <table class="compare-table district-list">
      <thead><tr><th>기관명</th><th>종별</th><th>동</th><th>주소</th><th>전화</th><th>개설연도</th></tr></thead>
      <tbody>__LIST_ROWS__</tbody>
    </table>
    </div>
  </section>

  <section class="related-regions-section">
    <h2>더 보기</h2>
    <p><a href="${BASE_URL}/dental/${r.en}/">${esc(r.nm)} 시군구별 치과 현황</a> · <a href="${BASE_URL}/dental/compare/">전국 시도별 비교</a> · <a href="${BASE_URL}/methodology/">데이터 수집·가공 방법</a></p>
  </section>`;

  const title = `${where} 치과 현황: 치과의원 ${n(s.clinic)}곳·치과병원 ${n(s.hosp)}곳 (${asOf.replace(/ \d+일$/, '')} 공공데이터)`;
  const desc = answer.slice(0, 155);
  const jsonLd = [
    breadcrumbLd([['홈', '/'], ['치과', '/dental/'], [`${r.nm} 치과 현황`, `/dental/${r.en}/`], [`${sggu} 치과 현황`, path]]),
    {
      '@context': 'https://schema.org', '@type': 'Dataset',
      name: `${where} 치과 기관 현황`,
      description: answer,
      url: `${BASE_URL}${path}`,
      spatialCoverage: where,
      dateModified: buildDate,
      creator: { '@type': 'Organization', name: SITE_NAME, url: `${BASE_URL}/` },
      isBasedOn: 'https://www.data.go.kr',
      variableMeasured: ['치과의원 수', '치과병원 수', '치과의사 수', '최근 1년 개설 수', '동별 치과 수'],
    },
    {
      '@context': 'https://schema.org', '@type': 'FAQPage',
      mainEntity: faqs.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
    },
  ];

  const page = shell({
    title, desc, path,
    robots: indexable ? 'index, follow' : 'noindex, follow',
    h1: `${where} 치과 현황`,
    sub: `건강보험심사평가원 병원정보서비스 · ${asOf} 수집 · 치과 ${n(s.total)}곳`,
    crumbs: [['홈', '/'], ['치과', '/dental/'], [`${r.nm}`, `/dental/${r.en}/`], [sggu, null]],
    body, jsonLd,
  });
  // 우리가 쓴 문장만 금지어 검사 (기관명·주소는 실제 상호라 제외)
  checkLawHard(page, `dental/${r.en}/${slug}/index.html`);
  const html = page.replace('__LIST_ROWS__', listRows);

  mkdirSync(join(OUT, r.en, slug), { recursive: true });
  writeFileSync(join(OUT, r.en, slug, 'index.html'), html);
  const dates = pageDates(`${BASE_URL}${path}`, JSON.stringify(sorted.map(x => [x.name, x.cl, x.addr, x.tel])), buildDate);
  return { path, indexable, lastmod: dates.modified, sggu, slug, s };
}

/** 시도 허브 */
function sidoHub(r, districts, fetchedAt) {
  const path = `/dental/${r.en}/`;
  const asOf = kDate(fetchedAt);
  const tot = districts.reduce((a, d) => ({ clinic: a.clinic + d.s.clinic, hosp: a.hosp + d.s.hosp }), { clinic: 0, hosp: 0 });
  const rows = [...districts].sort((a, b) => a.sggu.localeCompare(b.sggu, 'ko')).map(d =>
    `<tr><td><a href="${BASE_URL}${d.path}">${esc(d.sggu)}</a></td><td>${n(d.s.clinic)}곳</td><td>${n(d.s.hosp)}곳</td><td>${d.s.dentists != null ? `${n(d.s.dentists)}명` : '-'}</td></tr>`).join('');
  const answer = `건강보험심사평가원 병원정보서비스 기준(${asOf} 수집), ${r.nm}에는 치과의원 ${n(tot.clinic)}곳과 치과병원 ${n(tot.hosp)}곳이 ${districts.length}개 시군구에 있습니다.`;
  const page = shell({
    title: `${r.nm} 시군구별 치과 현황 (치과의원 ${n(tot.clinic)}곳·치과병원 ${n(tot.hosp)}곳)`,
    desc: answer, path, robots: 'index, follow',
    h1: `${r.nm} 시군구별 치과 현황`,
    sub: `건강보험심사평가원 병원정보서비스 · ${asOf} 수집`,
    crumbs: [['홈', '/'], ['치과', '/dental/'], [`${r.nm} 치과 현황`, null]],
    body: `
  <section class="key-result-section"><h2>${esc(r.nm)} 치과 현황 요약</h2><p>${answer}</p>
    <p>${existsSync(join(OUT, `${r.en}-implant`, 'index.html')) ? `<a href="${BASE_URL}/dental/${r.en}-implant/">${esc(r.nm)} 임플란트 비급여 가격 비교</a> · ` : ''}<a href="${BASE_URL}/dental/compare/">전국 시도별 비교</a></p></section>
  <section class="compare-section"><h2>시군구별 치과 수</h2>
    <table class="compare-table"><thead><tr><th>시군구</th><th>치과의원</th><th>치과병원</th><th>치과의사</th></tr></thead><tbody>${rows}</tbody>
    <tfoot><tr><td colspan="4" class="tfoot-note">출처: 건강보험심사평가원 병원정보서비스 (${asOf} 수집)</td></tr></tfoot></table></section>`,
    jsonLd: [breadcrumbLd([['홈', '/'], ['치과', '/dental/'], [`${r.nm} 치과 현황`, path]])],
  });
  checkLawHard(page, `dental/${r.en}/index.html`);
  writeFileSync(join(OUT, r.en, 'index.html'), page);
  return { path, priority: '0.8', freq: 'weekly' };
}

/** 전체 생성 → 사이트맵용 페이지 목록 반환 (noindex 페이지 제외) */
export function generateDistrictPages(buildDate, indexableArticlePaths = new Set()) {
  const pages = [];
  let made = 0, thin = 0;
  for (const r of REGIONS) {
    const f = join(INST_DIR, `${r.en}.json`);
    if (!existsSync(f)) continue;
    const data = JSON.parse(readFileSync(f, 'utf8'));
    const groups = {};
    for (const x of data.items ?? []) if (x.sggu) (groups[x.sggu] ??= []).push(x);
    const districts = [];
    const usedSlugs = new Set();
    for (const [sggu, items] of Object.entries(groups)) {
      let slug = toSlug(sggu);
      while (usedSlugs.has(slug)) slug += '-2';
      usedSlugs.add(slug);
      const article = `/articles/${r.en}-${toSlug(sggu)}-implant/`;
      const d = districtPage(r, sggu, slug, items, data.fetchedAt, indexableArticlePaths.has(article) ? article : null, buildDate);
      districts.push(d);
      made++;
      if (d.indexable) pages.push({ path: d.path, priority: '0.8', freq: 'weekly', lastmod: d.lastmod });
      else thin++;
    }
    if (districts.length) pages.push(sidoHub(r, districts, data.fetchedAt));
  }
  console.log(`  ✓ 시군구 치과 현황 ${made}개 (색인 ${made - thin} · 기관 ${MIN_DISTRICT_INSTITUTIONS}곳 미만 noindex ${thin})`);
  return pages;
}
