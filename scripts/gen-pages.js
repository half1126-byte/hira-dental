/**
 * gen-pages.js
 * data/*.json → dental/{region}/index.html 생성
 * 의료광고법 제56조 LAW_HARD 0건 보장 (생성 후 자동 스캔)
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT   = join(__dir, '..');
const DATA   = join(ROOT, 'data');
const TMPL   = join(ROOT, 'templates');
const DENTAL = join(ROOT, 'dental');

const BASE_URL = 'https://half1126-byte.github.io/hira-dental';

// 의료광고법 제56조 금지어
const LAW_HARD = ['최고', '1위', '최저가', '유일', '완치', '보장', '100%', '최상급', '명품', '무통'];

function checkLawHard(html, filePath) {
  const found = LAW_HARD.filter(w => html.includes(w));
  if (found.length > 0) {
    throw new Error(`🚨 LAW_HARD 위반 [${filePath}]: ${found.join(', ')}`);
  }
}

function formatAmt(val) {
  const n = Number(val);
  if (!n || n <= 0) return '미신고';
  return `${(n / 10000).toFixed(0)}만원`;
}

function formatDate(iso) {
  return (iso || new Date().toISOString()).slice(0, 10);
}

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 상위 N개 클리닉 카드 HTML */
function buildClinicCards(prices, top = 20) {
  const list = prices.slice(0, top);
  if (list.length === 0) return '<p class="no-data">데이터 준비 중입니다.</p>';

  return list.map((it, i) => {
    const rank = String(i + 1).padStart(2, '0');
    const name = escHtml(it.yadmNm ?? '');
    const addr = escHtml(it.addr ?? '');
    const tel  = escHtml(it.telno ?? '');
    const sggu = escHtml(it.sgguCdNm ?? '');
    const clNm = escHtml(it.clCdNm ?? '치과의원');
    const cur  = formatAmt(it.curAmt);
    const min  = formatAmt(it.minAmt);
    const max  = formatAmt(it.maxAmt);
    const rmrk = escHtml(it.rmrk ?? '');
    const priceStr = it.minAmt && it.maxAmt && it.minAmt !== it.maxAmt
      ? `${formatAmt(it.minAmt)} ~ ${formatAmt(it.maxAmt)}`
      : cur !== '미신고' ? cur : '미신고';

    return `
    <div class="clinic-card">
      <div class="clinic-rank">${rank}</div>
      <div class="clinic-name">${name}</div>
      <div class="clinic-meta">
        <span>${sggu}</span>
        <span>·</span>
        <span>${clNm}</span>
        ${tel ? `<span>·</span><span>${tel}</span>` : ''}
      </div>
      <div class="clinic-price-row">
        <span class="price-label">HIRA 신고 임플란트</span>
        <span class="price-value">${priceStr}</span>
      </div>
      ${addr ? `<div class="clinic-addr">${addr}</div>` : ''}
      ${rmrk ? `<div class="clinic-rmrk">${rmrk}</div>` : ''}
      <div class="hira-badge">건강보험심사평가원 비급여 신고 데이터</div>
    </div>`;
  }).join('\n');
}

/** 비교 표 HTML (상위 10개) */
function buildCompareTable(prices, top = 10) {
  const list = prices.slice(0, top);
  if (list.length === 0) return '';
  const rows = list.map(it => `
    <tr>
      <td>${escHtml(it.yadmNm ?? '')}</td>
      <td>${escHtml(it.sgguCdNm ?? '')}</td>
      <td>${escHtml(it.clCdNm ?? '')}</td>
      <td class="price-cell">${formatAmt(it.minAmt)}</td>
      <td class="price-cell">${formatAmt(it.curAmt)}</td>
      <td class="price-cell">${formatAmt(it.maxAmt)}</td>
    </tr>`).join('');

  return `
  <table class="compare-table">
    <thead>
      <tr>
        <th>의료기관명</th>
        <th>지역</th>
        <th>종별</th>
        <th>하한가</th>
        <th>신고가</th>
        <th>상한가</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
    <tfoot>
      <tr><td colspan="6" class="tfoot-note">출처: 건강보험심사평가원 비급여진료비 공개 데이터 (2024년 기준)</td></tr>
    </tfoot>
  </table>`;
}

/** JSON-LD ItemList + Dentist (상위 5개) */
function buildJsonLd(prices, regionNm, regionEn, buildDate) {
  const top5 = prices.slice(0, 5);
  const url = `${BASE_URL}/dental/${regionEn}-implant/`;

  const listItems = top5.map((it, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    item: {
      '@type': 'Dentist',
      name: it.yadmNm ?? '',
      address: {
        '@type': 'PostalAddress',
        streetAddress: it.addr ?? '',
        addressLocality: it.sgguCdNm ?? '',
        addressRegion: it.sidoCdNm ?? regionNm,
        addressCountry: 'KR',
      },
      telephone: it.telno ?? '',
      medicalSpecialty: 'Dentistry',
      ...(it.curAmt && it.curAmt > 0 ? {
        makesOffer: [{
          '@type': 'Offer',
          itemOffered: { '@type': 'MedicalProcedure', name: '치과 임플란트' },
          priceSpecification: {
            '@type': 'PriceSpecification',
            price: String(it.curAmt),
            priceCurrency: 'KRW',
            description: '건강보험심사평가원 비급여 신고가 (2024년 기준)',
          },
        }],
      } : {}),
    },
  }));

  const schemas = [
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: '홈', item: BASE_URL + '/' },
        { '@type': 'ListItem', position: 2, name: '치과', item: BASE_URL + '/dental/' },
        { '@type': 'ListItem', position: 3, name: `${regionNm} 임플란트`, item: url },
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: `${regionNm} 임플란트 치과 비급여 가격 목록`,
      description: `건강보험심사평가원 공개 데이터 기반 ${regionNm} 임플란트 치과 비급여 신고 가격`,
      numberOfItems: top5.length,
      itemListElement: listItems,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: `${regionNm} 임플란트 가격은 얼마인가요?`,
          acceptedAnswer: {
            '@type': 'Answer',
            text: `건강보험심사평가원 비급여 신고 데이터 기준, ${regionNm} 치과의원의 임플란트 가격은 기관마다 다릅니다. 본 페이지에서 신고된 가격 정보를 확인하실 수 있습니다.`,
          },
        },
        {
          '@type': 'Question',
          name: '비급여 임플란트 가격 데이터는 어디서 가져오나요?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: '건강보험심사평가원(HIRA)이 매년 수집·공개하는 의료기관 비급여 진료비 신고 데이터를 사용합니다. data.go.kr 공공데이터포털을 통해 제공됩니다.',
          },
        },
        {
          '@type': 'Question',
          name: '임플란트 치료 기간은 얼마나 걸리나요?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: '일반적으로 식립 후 뼈와 융합되는 데 3~6개월이 소요됩니다. 뼈이식이 필요한 경우 기간이 더 길어질 수 있습니다. 정확한 치료 기간은 담당 의사와 상담하시기 바랍니다.',
          },
        },
        {
          '@type': 'Question',
          name: '65세 이상 임플란트 건강보험 적용이 되나요?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: '65세 이상은 평생 2개까지 건강보험 적용을 받을 수 있습니다. 본인부담률 30%이며, 나머지는 건강보험에서 지원됩니다. 이 페이지의 가격은 비급여 자료로, 보험 적용 가격과 다를 수 있습니다.',
          },
        },
        {
          '@type': 'Question',
          name: '임플란트 가격 차이가 나는 이유는 무엇인가요?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: '임플란트 브랜드(오스템, 스트라우만 등), 재료, 시술 난이도(뼈이식 여부), 기공료, 의료기관 규모 등에 따라 가격이 달라집니다. 의료기관마다 신고 방식도 상이할 수 있습니다.',
          },
        },
        {
          '@type': 'Question',
          name: '이 사이트의 가격 정보는 얼마나 최신인가요?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: `건강보험심사평가원이 공개한 2024년 비급여 신고 데이터를 기반으로 하며, 매일 자동 갱신됩니다. 실제 진료비는 변동될 수 있으므로 해당 의료기관에 직접 문의하시기 바랍니다.`,
          },
        },
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: `${regionNm} 임플란트 치과 비급여 가격 비교 (HIRA 공개 데이터)`,
      datePublished: buildDate,
      dateModified: buildDate,
      author: { '@type': 'Organization', name: '메디앤메디 리서치팀' },
      publisher: { '@type': 'Organization', name: '한국 치과 비급여 가이드' },
      about: { '@type': 'MedicalProcedure', name: '치과 임플란트', procedureType: 'Therapeutic' },
      description: `건강보험심사평가원 공개 데이터 기반 ${regionNm} 임플란트 비급여 가격 정보`,
    },
  ];

  return schemas.map(s => `<script type="application/ld+json">\n${JSON.stringify(s, null, 2)}\n</script>`).join('\n');
}

/** 지역 페이지 생성 */
export function generateRegionPage(dataFile, regionNm, regionEn, buildDate) {
  const raw = JSON.parse(readFileSync(dataFile, 'utf8'));
  const prices = raw.prices ?? [];
  const tmpl = readFileSync(join(TMPL, 'region-page.html.tmpl'), 'utf8');
  const pageUrl = `${BASE_URL}/dental/${regionEn}-implant/`;

  const priceMin = prices[0]?.curAmt ? formatAmt(prices[0].curAmt) : '미신고';
  const priceMax = prices[prices.length - 1]?.curAmt ? formatAmt(prices[prices.length - 1].curAmt) : '미신고';

  const html = tmpl
    .replace(/\{\{REGION_KO\}\}/g, escHtml(regionNm))
    .replace(/\{\{REGION_EN\}\}/g, regionEn)
    .replace(/\{\{BUILD_DATE\}\}/g, buildDate)
    .replace(/\{\{CANONICAL_URL\}\}/g, pageUrl)
    .replace(/\{\{BASE_URL\}\}/g, BASE_URL)
    .replace(/\{\{TOTAL_COUNT\}\}/g, String(prices.length))
    .replace(/\{\{PRICE_MIN\}\}/g, priceMin)
    .replace(/\{\{PRICE_MAX\}\}/g, priceMax)
    .replace(/\{\{CLINIC_CARDS\}\}/g, buildClinicCards(prices, 20))
    .replace(/\{\{COMPARE_TABLE\}\}/g, buildCompareTable(prices, 10))
    .replace(/\{\{JSONLD\}\}/g, buildJsonLd(prices, regionNm, regionEn, buildDate));

  checkLawHard(html, `dental/${regionEn}-implant/index.html`);

  const outDir = join(DENTAL, `${regionEn}-implant`);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'index.html'), html);
  console.log(`  ✓ dental/${regionEn}-implant/index.html 생성`);
}

/** sitemap.xml 생성 */
export function generateSitemap(pages, buildDate) {
  const entries = pages.map(p => `
  <url>
    <loc>${BASE_URL}${p.path}</loc>
    <lastmod>${buildDate}</lastmod>
    <changefreq>${p.freq ?? 'weekly'}</changefreq>
    <priority>${p.priority ?? '0.9'}</priority>
  </url>`).join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>`;

  writeFileSync(join(ROOT, 'sitemap.xml'), xml);
  console.log('  ✓ sitemap.xml 생성');
}

/** 공통 페이지 셸 */
function pageShell({ title, desc, canonicalPath, heroTitle, heroSub, body, buildDate }) {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="index, follow">
  <title>${title}</title>
  <meta name="description" content="${desc}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${desc}">
  <meta property="og:url" content="${BASE_URL}${canonicalPath}">
  <meta property="og:locale" content="ko_KR">
  <link rel="canonical" href="${BASE_URL}${canonicalPath}">
  <link href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css" rel="stylesheet">
  <link rel="stylesheet" href="${BASE_URL}/style.css">
  <link rel="stylesheet" href="${BASE_URL}/article.css">
</head>
<body>
<header class="site-header">
  <div class="inner">
    <a class="logo" href="${BASE_URL}/">메디픽</a>
    <nav>
      <a href="${BASE_URL}/price-index/">가격지수</a>
      <a href="${BASE_URL}/dental/">지역별 비교</a>
      <a href="${BASE_URL}/articles/">지역 아티클</a>
      <a href="${BASE_URL}/clinics/">치과 프로필</a>
    </nav>
  </div>
</header>
<section class="article-hero">
  <div class="inner">
    <h1>${heroTitle}</h1>
    <p class="article-sub">${heroSub} · ${buildDate} 기준</p>
  </div>
</section>
<main class="inner article-body">
${body}
</main>
<footer class="site-footer">
  <div class="inner">
    <div class="footer-links">
      <a href="${BASE_URL}/">홈</a>
      <a href="${BASE_URL}/dental/">지역별 비교</a>
      <a href="https://www.hira.or.kr" target="_blank" rel="noopener">HIRA 심평원</a>
    </div>
    <p class="footer-note">건강보험심사평가원 공공데이터 기반 · 의료광고법 제56조 준수</p>
  </div>
</footer>
</body>
</html>`;
}

const HUB_REGIONS = [
  { nm: '서울', en: 'seoul' }, { nm: '경기', en: 'gyeonggi' },
  { nm: '부산', en: 'busan' }, { nm: '인천', en: 'incheon' },
];

/** 지역 데이터 요약 통계 (데이터 없으면 null) */
function regionStats(en) {
  const f = join(DATA, `${en}-implant.json`);
  if (!existsSync(f)) return null;
  try {
    const prices = (JSON.parse(readFileSync(f, 'utf8')).prices ?? []).filter(p => Number(p.curAmt) > 0);
    if (!prices.length) return null;
    const amts = prices.map(p => Number(p.curAmt));
    return {
      count: prices.length,
      avg: Math.round(amts.reduce((a, b) => a + b, 0) / amts.length),
      min: Math.min(...amts),
      max: Math.max(...amts),
    };
  } catch { return null; }
}

/** /dental/ — 치과 허브 페이지 */
export function generateDentalHub(buildDate) {
  const cards = HUB_REGIONS.map(r => {
    const s = regionStats(r.en);
    return `
    <a class="region-card" href="${BASE_URL}/dental/${r.en}-implant/">
      <h3>${r.nm} 임플란트</h3>
      <p>${s ? `${s.count}개 기관 · 평균 신고가 ${formatAmt(s.avg)}` : 'HIRA 신고 가격 비교'}</p>
    </a>`;
  }).join('');

  const html = pageShell({
    title: '지역별 치과 임플란트 가격 비교 | HIRA 비급여 데이터',
    desc: '건강보험심사평가원 공개 데이터 기반 서울·경기·부산·인천 치과 임플란트 비급여 신고 가격 비교.',
    canonicalPath: '/dental/',
    heroTitle: '지역별 임플란트 가격 비교',
    heroSub: 'HIRA 비급여 신고 데이터',
    buildDate,
    body: `
  <section class="clinics-detail-section">
    <h2>지역을 선택하세요</h2>
    <div class="guide-grid">${cards}</div>
  </section>
  <section class="related-section">
    <h2>더 보기</h2>
    <a href="${BASE_URL}/dental/compare/" class="cta-btn">전국 지역 비교 →</a>
    <a href="${BASE_URL}/articles/" class="cta-btn cta-secondary">시군구별 상세 아티클 →</a>
  </section>`,
  });
  checkLawHard(html, 'dental/index.html');
  writeFileSync(join(DENTAL, 'index.html'), html);
  console.log('  ✓ dental/index.html (허브)');
}

/** /dental/compare/ — 전국 비교 페이지 */
export function generateComparePage(buildDate) {
  const rows = HUB_REGIONS.map(r => {
    const s = regionStats(r.en);
    return `
    <tr>
      <td><a href="${BASE_URL}/dental/${r.en}-implant/">${r.nm}</a></td>
      <td>${s ? s.count + '곳' : '준비 중'}</td>
      <td class="price-cell">${s ? formatAmt(s.avg) : '-'}</td>
      <td>${s ? `${formatAmt(s.min)} ~ ${formatAmt(s.max)}` : '-'}</td>
    </tr>`;
  }).join('');

  const html = pageShell({
    title: '전국 치과 임플란트 비급여 가격 비교 (지역별 평균) | HIRA 데이터',
    desc: '서울·경기·부산·인천 치과병원 임플란트 비급여 신고가의 지역별 평균·범위 비교. 건강보험심사평가원 공개 데이터 기반.',
    canonicalPath: '/dental/compare/',
    heroTitle: '전국 임플란트 가격 비교',
    heroSub: '지역별 평균 신고가 · HIRA 공개 데이터',
    buildDate,
    body: `
  <section class="compare-section">
    <h2>지역별 임플란트 신고가 요약은?</h2>
    <table class="compare-table">
      <thead><tr><th>지역</th><th>신고 기관 수</th><th>평균 신고가</th><th>신고가 범위</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td colspan="4" class="tfoot-note">출처: 건강보험심사평가원 비급여진료비 공개 데이터 (치과병원 기준, ${buildDate})</td></tr></tfoot>
    </table>
    <div class="notice-box" style="margin-top:1rem">
      <div class="notice-icon">ℹ</div>
      <div class="notice-text">평균은 지역 내 신고 기관들의 단순 평균이며, 실제 진료비는 뼈이식·상부구조물 등에 따라 달라질 수 있습니다. 지역명을 클릭하면 기관별 상세 가격을 볼 수 있습니다.</div>
    </div>
  </section>`,
  });
  checkLawHard(html, 'dental/compare/index.html');
  mkdirSync(join(DENTAL, 'compare'), { recursive: true });
  writeFileSync(join(DENTAL, 'compare', 'index.html'), html);
  console.log('  ✓ dental/compare/index.html (전국 비교)');
}
