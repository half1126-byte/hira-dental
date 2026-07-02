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
