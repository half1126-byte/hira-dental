/**
 * gen-articles.js
 * HIRA 비급여 데이터 → 시군구별 치과 추천 아티클 자동 생성
 * medicalguide.co.kr 구조 참조: 핵심결과 → 병원상세 → 비교표 → FAQ
 *
 * 의료광고법 제56조: LAW_HARD 0건 (최고/1위/최저가/유일/완치/보장/100%/최상급/명품 금지)
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPartners, buildPartnerIndex } from './gen-partners.js';
import { normalizeName } from './normalize.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, '..');
const DATA_DIR = join(ROOT, 'data');
const OUT_DIR = join(ROOT, 'articles');

import { BASE_URL } from './site-config.js';
const SITE_NAME = '메디픽 MediPick';

const LAW_HARD = ['최고', '1위', '최저가', '유일', '완치', '보장', '100%', '최상급', '명품', '무통'];

// 거래처(제휴) 인덱스: "기관명|시도" → partner (모듈 로드 시 1회)
const PARTNER_IDX = buildPartnerIndex(loadPartners());

/** 해당 병원이 거래처면 프로필 URL 반환 (동명 충돌 시 주소 첫 2어절 보조키로 재조회) */
function partnerUrl(yadmNm, sidoNm, addr) {
  const key = `${normalizeName(yadmNm)}|${sidoNm}`;
  let p = PARTNER_IDX.get(key);
  if (!p && addr) {
    const addrKey = String(addr).split(/\s+/).slice(0, 2).join(' ');
    if (addrKey) p = PARTNER_IDX.get(`${key}|${addrKey}`);
  }
  return p ? `${BASE_URL}/clinics/${p.id}/` : null;
}

// 지역 메타 (데이터 파일 + 영문 slug + 한국어 지역명)
export const REGION_META = [
  { dataKey: 'seoul',    sido: '서울', sidoEn: 'seoul',    specialty: 'implant' },
  { dataKey: 'gyeonggi', sido: '경기', sidoEn: 'gyeonggi', specialty: 'implant' },
  { dataKey: 'busan',    sido: '부산', sidoEn: 'busan',    specialty: 'implant' },
  { dataKey: 'incheon',  sido: '인천', sidoEn: 'incheon',  specialty: 'implant' },
];

// 시군구 영문 slug 변환 (한글 → 로마자 근사)
const SGGU_SLUG_MAP = {
  // 서울
  '강남구': 'gangnam', '강동구': 'gangdong', '강북구': 'gangbuk', '강서구': 'gangseo',
  '관악구': 'gwanak',  '광진구': 'gwangjin', '구로구': 'guro',    '금천구': 'geumcheon',
  '노원구': 'nowon',   '도봉구': 'dobong',   '동대문구': 'dongdaemun', '동작구': 'dongjak',
  '마포구': 'mapo',    '서대문구': 'seodaemun', '서초구': 'seocho', '성동구': 'seongdong',
  '성북구': 'seongbuk','송파구': 'songpa',   '양천구': 'yangcheon','영등포구': 'yeongdeungpo',
  '용산구': 'yongsan', '은평구': 'eunpyeong','종로구': 'jongno',  '중구': 'seoul-jung',
  '중랑구': 'jungnang',
  // 경기 (API 실측값 기준)
  '고양덕양구': 'goyang-deogyang', '고양일산동구': 'goyang-ilsandong', '고양일산서구': 'goyang-ilsanseo',
  '과천시': 'gwacheon', '군포시': 'gunpo', '시흥시': 'siheung',
  '부천소사구': 'bucheon-sosa', '부천오정구': 'bucheon-ojeong', '부천원미구': 'bucheon-wonmi',
  '성남분당구': 'seongnam-bundang', '성남수정구': 'seongnam-sujeong', '성남중원구': 'seongnam-jungwon',
  '수원영통구': 'suwon-yeongtong', '수원팔달구': 'suwon-paldal',
  '안산단원구': 'ansan-danwon', '안양동안구': 'anyang-dongan',
  '양주시': 'yangju', '오산시': 'osan', '의왕시': 'uiwang', '의정부시': 'uijeongbu',
  '이천시': 'icheon', '파주시': 'paju', '평택시': 'pyeongtaek',
  '용인기흥구': 'yongin-giheung', '용인수지구': 'yongin-suji', '용인처인구': 'yongin-cheoin',
  '화성동탄구': 'hwaseong-dongtan',
  '수원시': 'suwon', '성남시': 'seongnam', '고양시': 'goyang', '용인시': 'yongin',
  '부천시': 'bucheon', '안산시': 'ansan', '안양시': 'anyang', '화성시': 'hwaseong',
  '김포시': 'gimpo', '광명시': 'gwangmyeong', '하남시': 'hanam', '안성시': 'anseong',
  '구리시': 'guri', '남양주시': 'namyangju', '포천시': 'pocheon',
  // 부산 (API 실측값 기준)
  '부산수영구': 'suyeong',  '부산해운대구': 'haeundae', '부산남구': 'busan-nam',
  '부산동래구': 'dongnae',  '부산금정구': 'geumjeong', '부산북구': 'busan-buk',
  '부산사하구': 'saha',     '부산강서구': 'busan-gangseo', '부산사상구': 'sasang',
  '부산연제구': 'yeonje',   '부산동구': 'busan-dong',  '부산중구': 'busan-jung',
  '부산서구': 'busan-seo',  '부산기장군': 'gijang',    '부산진구': 'busanjin',
  // 인천 (API 실측값 기준)
  '인천남동구': 'namdong',  '인천부평구': 'bupyeong',   '인천서구': 'incheon-seo',
  '인천계양구': 'gyeyang',  '인천연수구': 'yeonsu',     '인천미추홀구': 'michuhol',
  '인천동구': 'incheon-dong','인천강화군': 'ganghwa',   '인천영종구': 'yeongjong',
  '인천검단구': 'incheon-geomdan', '인천서해구': 'incheon-seohae',
};

export function toSlug(sgguNm) {
  if (SGGU_SLUG_MAP[sgguNm]) return SGGU_SLUG_MAP[sgguNm];
  // fallback: 한글 제거, 영문/숫자만 남김
  return sgguNm.replace(/[가-힣]/g, '').replace(/\s+/g, '-').toLowerCase() || 'unknown';
}

function formatPrice(amt) {
  if (!amt || isNaN(Number(amt))) return '정보 없음';
  return Number(amt).toLocaleString('ko-KR') + '원';
}

/** 시군구 통계 (아티클 전용 — 시도 집계인 gen-index.js의 computeStats와 별개) */
function computeSgguStats(clinics) {
  const prices = clinics.map(c => Number(c.curAmt)).filter(n => n > 0);
  if (!prices.length) return { count: 0, mean: null, median: null, min: null, max: null };
  const sorted = [...prices].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const medianVal = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return {
    count: prices.length,
    mean: Math.round(prices.reduce((a, b) => a + b, 0) / prices.length),
    median: Math.round(medianVal),
    min: sorted[0],
    max: sorted[sorted.length - 1],
  };
}

/** 병원 카드 HTML (아티클용 — 개별 상세 섹션) */
function buildClinicSection(clinic, rank, sidoNm) {
  const name = clinic.yadmNm ?? '이름 미상';
  const addr = clinic.addr ?? '';
  const pUrl = partnerUrl(name, sidoNm, addr);
  const tel = clinic.telno ?? '';
  const price = formatPrice(clinic.curAmt);
  const minP = formatPrice(clinic.minAmt);
  const maxP = formatPrice(clinic.maxAmt);
  const item = clinic.npayKorNm ?? '임플란트';
  const sggu = clinic.sgguCdNm ?? '';

  return `
  <div class="article-clinic" id="clinic-${rank}">
    <h3 class="clinic-h3"><span class="clinic-num">${rank}</span> ${name}</h3>
    <div class="clinic-meta-row">
      ${sggu ? `<span class="meta-tag">📍 ${sggu}</span>` : ''}
      <span class="meta-tag hira-tag">HIRA 공개 데이터</span>
      ${pUrl ? `<a class="meta-tag partner-tag" href="${pUrl}">상세 프로필 →</a>` : ''}
    </div>
    <div class="price-highlight-box">
      <div class="ph-label">HIRA 비급여 신고 가격 (${item})</div>
      <div class="ph-price">${price}</div>
      ${minP !== price || maxP !== price ? `<div class="ph-range">신고 범위: ${minP} ~ ${maxP}</div>` : ''}
    </div>
    ${addr ? `<div class="clinic-addr"><strong>주소:</strong> ${addr}</div>` : ''}
    ${tel ? `<div class="clinic-tel"><strong>연락처:</strong> ${tel}</div>` : ''}
    <div class="clinic-source-note">
      위 가격은 건강보험심사평가원에 신고한 비급여 진료비입니다. 실제 청구금액은 상담 시 달라질 수 있습니다.
    </div>
  </div>`;
}

/** 비교 표 HTML */
function buildCompareTable(clinics, sidoNm) {
  if (!clinics.length) return '';
  const rows = clinics.slice(0, 10).map((c, i) => {
    const pUrl = partnerUrl(c.yadmNm, sidoNm, c.addr);
    return `
    <tr>
      <td>${i + 1}</td>
      <td>${c.yadmNm ?? ''}${pUrl ? ` <a class="partner-tag-sm" href="${pUrl}">상세정보</a>` : ''}</td>
      <td>${c.sgguCdNm ?? ''}</td>
      <td class="price-cell">${formatPrice(c.curAmt)}</td>
      <td>${formatPrice(c.minAmt)}</td>
      <td>${formatPrice(c.maxAmt)}</td>
    </tr>`;
  }).join('');

  return `
  <table class="compare-table">
    <thead>
      <tr>
        <th>#</th>
        <th>의료기관명</th>
        <th>위치</th>
        <th>신고가</th>
        <th>하한가</th>
        <th>상한가</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
    <tfoot>
      <tr><td colspan="6" class="tfoot-note">출처: 건강보험심사평가원 비급여진료비 공개 데이터</td></tr>
    </tfoot>
  </table>`;
}

/** FAQ HTML + FAQPage JSON-LD */
function buildFaq(sgguNm, sidoNm, stats, dataMonth) {
  const location = `${sidoNm} ${sgguNm}`;
  const hasStats = stats && stats.count >= 3 && stats.mean && stats.median;
  const faq1a = hasStats
    ? `HIRA ${dataMonth} 신고 데이터 기준, ${location} 임플란트 평균 ${stats.mean.toLocaleString('ko-KR')}원(중앙값 ${stats.median.toLocaleString('ko-KR')}원, 범위 ${stats.min.toLocaleString('ko-KR')}~${stats.max.toLocaleString('ko-KR')}원, 표본 ${stats.count}개 기관). 이 페이지에서 HIRA 공개 데이터를 기준으로 실제 신고 가격을 확인하실 수 있습니다. 반드시 방문 전 해당 의료기관에 직접 확인하시길 권장합니다.`
    : `건강보험심사평가원에 신고된 ${location} 치과병원의 임플란트 비급여 가격은 표본 ${stats ? stats.count : 0}개 기관 신고가 기준으로 공개되어 있습니다. 이 페이지에서 HIRA 공개 데이터를 기준으로 실제 신고 가격을 확인하실 수 있습니다. 반드시 방문 전 해당 의료기관에 직접 확인하시길 권장합니다.`;
  const faqs = [
    {
      q: `${location} 임플란트 비급여 가격은 어느 정도인가요?`,
      a: faq1a,
    },
    {
      q: '임플란트 비급여 신고 가격과 실제 진료비는 다를 수 있나요?',
      a: 'HIRA에 신고된 비급여 가격은 의료기관이 제출한 기준 가격이며, 뼈이식 여부·상부구조물 종류·임시치아 등 추가 항목에 따라 실제 총 진료비가 달라질 수 있습니다. 상담 시 전체 항목별 비용을 사전에 안내받는 것이 중요합니다.',
    },
    {
      q: '임플란트 치료 기간은 얼마나 걸리나요?',
      a: '일반적으로 발치 후 골유착 기간 포함 3~6개월, 뼈이식이 필요한 경우 6~12개월 이상 소요될 수 있습니다. 개인의 골밀도·잇몸 상태에 따라 달라지므로 정확한 기간은 진료 후 결정됩니다.',
    },
    {
      q: '임플란트에 건강보험이 적용되나요?',
      a: '만 65세 이상은 평생 최대 2개까지 건강보험이 적용되어 본인부담금이 줄어듭니다. 그 외 연령대나 추가 임플란트는 비급여 항목이므로 의료기관 신고가 기준으로 비용이 결정됩니다.',
    },
    {
      q: '치과 방문 전 확인할 사항이 있나요?',
      a: '구강악안면외과·치주과 전문의 여부, 임플란트 보증 기간·사후관리 방침, 파노라마·CT 장비 보유 여부, 비급여 항목별 사전 비용 고지 여부를 확인하시기 바랍니다.',
    },
    {
      q: 'HIRA 비급여 데이터는 얼마나 자주 업데이트되나요?',
      a: '건강보험심사평가원은 의료기관으로부터 비급여 가격을 정기적으로 수집합니다. 이 사이트는 HIRA 공개 API를 통해 데이터를 자동으로 갱신합니다. 가장 정확한 최신 정보는 심평원 홈페이지(www.hira.or.kr) 또는 해당 의료기관에 직접 문의하세요.',
    },
  ];

  const faqHtml = faqs.map(f => `
    <details class="faq-item">
      <summary>${f.q}</summary>
      <div class="faq-ans">${f.a}</div>
    </details>`).join('');

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(f => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };

  return { faqHtml, faqJsonLd };
}

/** 아티클 JSON-LD (Article + BreadcrumbList) */
function buildArticleJsonLd(sgguNm, sidoNm, sidoEn, sgguSlug, clinics, buildDate, stats) {
  const url = `${BASE_URL}/articles/${sidoEn}-${sgguSlug}-implant/`;
  const title = `${sidoNm} ${sgguNm} 임플란트 치과 가격 정보 (HIRA 공개 데이터 ${buildDate} 기준)`;
  const month = buildDate.slice(0, 7); // YYYY-MM

  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: '홈', item: `${BASE_URL}/` },
      { '@type': 'ListItem', position: 2, name: '치과', item: `${BASE_URL}/dental/` },
      { '@type': 'ListItem', position: 3, name: `${sidoNm} 임플란트`, item: `${BASE_URL}/dental/${sidoEn}-implant/` },
      { '@type': 'ListItem', position: 4, name: `${sgguNm} 임플란트`, item: url },
    ],
  };

  const article = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title,
    description: `건강보험심사평가원 비급여 데이터 기반 ${sidoNm} ${sgguNm} 임플란트 가격 정보. ${clinics.length}개 기관 신고가 공개.`,
    datePublished: buildDate,
    dateModified: buildDate,
    author: {
      '@type': 'Organization',
      name: SITE_NAME,
      url: `${BASE_URL}/methodology/`,
    },
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      url: `${BASE_URL}/`,
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    isBasedOn: `${BASE_URL}/price-index/${month}/`,
  };

  return { breadcrumb, article, url, title };
}

/** 아티클 HTML 전체 생성 */
function generateArticleHtml(clinics, sgguNm, sidoNm, sidoEn, sgguSlug, buildDate) {
  const stats = computeSgguStats(clinics);
  const dataMonth = buildDate.slice(0, 7); // YYYY-MM
  const hasStats = stats.count >= 3 && stats.mean && stats.median;

  // self-contained 통계 문장 (AI 인용 대상)
  const statSentence = hasStats
    ? `HIRA ${dataMonth} 신고 데이터 기준, ${sidoNm} ${sgguNm} 임플란트 평균 ${stats.mean.toLocaleString('ko-KR')}원(중앙값 ${stats.median.toLocaleString('ko-KR')}원, 범위 ${stats.min.toLocaleString('ko-KR')}~${stats.max.toLocaleString('ko-KR')}원, 표본 ${stats.count}개 기관)`
    : `HIRA ${dataMonth} 신고 데이터 기준, ${sidoNm} ${sgguNm} 임플란트 표본 ${stats.count}개 기관 신고가 기준`;

  const { faqHtml, faqJsonLd } = buildFaq(sgguNm, sidoNm, stats, dataMonth);
  const { breadcrumb, article, url, title } = buildArticleJsonLd(sgguNm, sidoNm, sidoEn, sgguSlug, clinics, buildDate, stats);
  const compareTable = buildCompareTable(clinics, sidoNm);
  const clinicSections = clinics.slice(0, 8).map((c, i) => buildClinicSection(c, i + 1, sidoNm)).join('');

  // meta description: self-contained 문장
  const metaDesc = `${statSentence}. 신고 기준가, 연락처, 주소 포함.`;

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="index, follow">
  <title>${title}</title>
  <meta name="description" content="${metaDesc}">
  <meta property="og:type" content="article">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="건강보험심사평가원 데이터 기반 ${sidoNm} ${sgguNm} 임플란트 가격 정보">
  <meta property="og:url" content="${url}">
  <meta property="og:site_name" content="${SITE_NAME}">
  <meta property="og:locale" content="ko_KR">
  <link rel="canonical" href="${url}">
  <link rel="preconnect" href="https://cdn.jsdelivr.net">
  <link href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css" rel="stylesheet">
  <link rel="stylesheet" href="${BASE_URL}/style.css">
  <link rel="stylesheet" href="${BASE_URL}/article.css">
  <script type="application/ld+json">${JSON.stringify(breadcrumb, null, 2)}</script>
  <script type="application/ld+json">${JSON.stringify(article, null, 2)}</script>
  <script type="application/ld+json">${JSON.stringify(faqJsonLd, null, 2)}</script>
</head>
<body>

<header class="site-header">
  <div class="inner">
    <a class="logo" href="${BASE_URL}/">메디픽</a>
    <nav>
      <a href="${BASE_URL}/dental/${sidoEn}-implant/">← ${sidoNm} 임플란트 전체 보기</a>
      <a href="${BASE_URL}/">홈</a>
    </nav>
  </div>
</header>

<section class="article-hero">
  <div class="inner">
    <nav class="breadcrumb">
      <a href="${BASE_URL}/">홈</a> <span>/</span>
      <a href="${BASE_URL}/dental/">치과</a> <span>/</span>
      <a href="${BASE_URL}/dental/${sidoEn}-implant/">${sidoNm} 임플란트</a> <span>/</span>
      <span>${sgguNm}</span>
    </nav>
    <h1>${sidoNm} ${sgguNm} 임플란트 치과 가격 정보</h1>
    <p class="article-sub">건강보험심사평가원(HIRA) 비급여 신고 데이터 기반 · ${clinics.length}개 기관 · ${buildDate} 기준</p>
    <div class="hero-badges">
      <span class="badge badge-hira">HIRA 공개 데이터</span>
      <span class="badge badge-law">의료광고법 준수</span>
      <span class="badge badge-update">매일 자동 갱신</span>
    </div>
  </div>
</section>

<main class="inner article-body">

  <!-- 핵심 결과 -->
  <section class="key-result-section">
    <h2>핵심 정보 요약</h2>
    <p>${statSentence}.</p>
    ${hasStats ? `
    <div class="stat-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:0.75rem;margin:1rem 0">
      <div class="stat-card" style="background:var(--bg-card,#f8f8fb);border-radius:8px;padding:0.75rem 1rem;text-align:center">
        <div style="font-size:.75rem;color:#666">평균</div>
        <div style="font-weight:700;font-size:1.05rem">${stats.mean.toLocaleString('ko-KR')}원</div>
      </div>
      <div class="stat-card" style="background:var(--bg-card,#f8f8fb);border-radius:8px;padding:0.75rem 1rem;text-align:center">
        <div style="font-size:.75rem;color:#666">중앙값</div>
        <div style="font-weight:700;font-size:1.05rem">${stats.median.toLocaleString('ko-KR')}원</div>
      </div>
      <div class="stat-card" style="background:var(--bg-card,#f8f8fb);border-radius:8px;padding:0.75rem 1rem;text-align:center">
        <div style="font-size:.75rem;color:#666">범위</div>
        <div style="font-weight:700;font-size:1.05rem">${stats.min.toLocaleString('ko-KR')}~${stats.max.toLocaleString('ko-KR')}원</div>
      </div>
      <div class="stat-card" style="background:var(--bg-card,#f8f8fb);border-radius:8px;padding:0.75rem 1rem;text-align:center">
        <div style="font-size:.75rem;color:#666">표본</div>
        <div style="font-weight:700;font-size:1.05rem">${stats.count}개 기관</div>
      </div>
    </div>` : ''}
    <div class="notice-box" style="margin-top:1rem">
      <div class="notice-icon">ℹ</div>
      <div class="notice-text">
        <strong>이 데이터는 병원이 HIRA에 신고한 기준 가격입니다.</strong>
        실제 진료비는 뼈이식 여부·상부구조물 종류 등에 따라 달라질 수 있으므로
        반드시 방문 전 의료기관에 직접 확인하시기 바랍니다.
      </div>
    </div>
  </section>

  <!-- 데이터 출처 -->
  <section class="data-source-section">
    <h2>데이터 출처 및 분석 방법</h2>
    <ul>
      <li><strong>주 데이터:</strong> 건강보험심사평가원(HIRA) 비급여진료비 공개 API</li>
      <li><strong>기관 종별:</strong> 치과병원(clCd=41) — 의원급은 별도 신고 체계 적용</li>
      <li><strong>지역 필터:</strong> ${sidoNm} ${sgguNm} 소재 기관</li>
      <li><strong>항목 필터:</strong> 비급여 항목명에 '임플란트' 포함 항목</li>
      <li><strong>업데이트:</strong> HIRA API 자동 연동, 매일 갱신</li>
    </ul>
  </section>

  <!-- 병원별 상세 -->
  <section class="clinics-detail-section">
    <h2>${sidoNm} ${sgguNm} 임플란트 HIRA 신고 기관 목록</h2>
    ${clinics.length === 0
      ? '<p class="no-data">해당 지역 치과병원 임플란트 신고 데이터가 없습니다.</p>'
      : clinicSections
    }
  </section>

  <!-- 비교 표 -->
  ${clinics.length > 1 ? `
  <section class="compare-section">
    <h2>한눈에 비교</h2>
    <p class="section-desc">HIRA 비급여 신고 가격 기준 정렬 (신고가 오름차순)</p>
    ${compareTable}
  </section>` : ''}

  <!-- 선택 체크리스트 -->
  <section class="guide-section">
    <h2>치과 선택 체크리스트</h2>
    <div class="guide-grid">
      <div class="guide-card">
        <h3>전문의 확인</h3>
        <p>구강악안면외과·치주과 전문의 여부를 확인하세요. HIRA 의료기관 검색에서 확인 가능합니다.</p>
      </div>
      <div class="guide-card">
        <h3>비용 사전 고지</h3>
        <p>임플란트 본체 외 뼈이식·상부보철·임시치아 등 추가 항목 비용을 상담 전에 확인하세요.</p>
      </div>
      <div class="guide-card">
        <h3>장비 보유 여부</h3>
        <p>파노라마·3D CT(CBCT) 등 정밀 진단 장비 보유 여부가 시술 정확도에 영향을 줍니다.</p>
      </div>
      <div class="guide-card">
        <h3>사후 관리 방침</h3>
        <p>보증 기간, 정기 검진 포함 여부, 문제 발생 시 처리 방침을 미리 확인하세요.</p>
      </div>
    </div>
  </section>

  <!-- 주의 신호 -->
  <section class="warning-section guide-section">
    <h2>방문 전 주의 사항</h2>
    <ul class="warning-list">
      <li>전화 상담 시 구체적인 비용 고지 없이 방문만 유도하는 경우</li>
      <li>상담 전에 과도한 추가 시술을 권유하는 경우</li>
      <li>비급여 항목별 상세 비용 안내를 거부하는 경우</li>
      <li>시술 전 X-ray·CT 등 정밀 검사 없이 바로 진행하는 경우</li>
    </ul>
  </section>

  <!-- FAQ -->
  <section class="faq-section">
    <h2>자주 묻는 질문</h2>
    <div class="faq-list">${faqHtml}</div>
  </section>

  <!-- 출처 -->
  <section class="source-section">
    <div class="source-box">
      <h3>데이터 출처 및 면책 고지</h3>
      <ul>
        <li>본 페이지의 가격 정보는 <a href="https://www.hira.or.kr" target="_blank" rel="noopener">건강보험심사평가원(HIRA)</a> 비급여진료비 공개 데이터를 기반으로 합니다.</li>
        <li>치과병원(병원급) 신고 데이터이며, 치과의원 데이터는 별도 체계로 관리됩니다.</li>
        <li>신고 가격과 실제 진료비는 다를 수 있으며, 이 사이트는 특정 의료기관을 추천하지 않습니다.</li>
        <li>진료 결정은 반드시 전문 의료인과 상담 후 내리시기 바랍니다.</li>
        <li>데이터 기준일: ${buildDate} · 문의: <a href="${BASE_URL}/">메디픽 MediPick</a></li>
      </ul>
    </div>
  </section>

  <!-- 관련 지역 링크 -->
  <section class="related-section">
    <h2>${sidoNm} 전체 임플란트 가격 보기</h2>
    <a href="${BASE_URL}/dental/${sidoEn}-implant/" class="cta-btn">${sidoNm} 전체 치과 가격 비교 →</a>
  </section>

</main>

<footer class="site-footer">
  <div class="inner">
    <div class="footer-links">
      <a href="${BASE_URL}/">홈</a>
      <a href="${BASE_URL}/dental/${sidoEn}-implant/">${sidoNm} 임플란트</a>
      <a href="https://www.hira.or.kr" target="_blank" rel="noopener">HIRA 심평원</a>
    </div>
    <p class="footer-note">건강보험심사평가원 공공데이터 기반 · 의료광고법 제56조 준수 · 특정 의료기관 추천 아님</p>
    <p class="footer-copy">© ${new Date().getFullYear()} ${SITE_NAME}</p>
  </div>
</footer>

</body>
</html>`;
}

/** LAW_HARD 검사 */
function checkLawHard(html, filePath) {
  const violations = LAW_HARD.filter(word => html.includes(word));
  if (violations.length > 0) {
    throw new Error(`🚨 LAW_HARD 위반 [${filePath}]: ${violations.join(', ')}`);
  }
}

/** 지역 데이터 파일 읽기 */
function loadRegionData(dataKey) {
  const dataFile = join(DATA_DIR, `${dataKey}-implant.json`);
  if (!existsSync(dataFile)) {
    console.warn(`  ⚠ 데이터 파일 없음: ${dataFile}`);
    return [];
  }
  const raw = JSON.parse(readFileSync(dataFile, 'utf8'));
  return raw.prices ?? [];
}

/** 시군구별로 그룹화 */
function groupBySggu(prices) {
  const map = {};
  for (const p of prices) {
    const sggu = p.sgguCdNm ?? '기타';
    if (!map[sggu]) map[sggu] = [];
    map[sggu].push(p);
  }
  return map;
}

/** 아티클 페이지 생성 (단일 지역 × 시군구) */
export function generateArticlePage(clinics, sgguNm, sidoNm, sidoEn, buildDate) {
  const sgguSlug = toSlug(sgguNm);
  const outDir = join(OUT_DIR, `${sidoEn}-${sgguSlug}-implant`);
  mkdirSync(outDir, { recursive: true });

  const html = generateArticleHtml(clinics, sgguNm, sidoNm, sidoEn, sgguSlug, buildDate);
  const filePath = join(outDir, 'index.html');

  checkLawHard(html, `articles/${sidoEn}-${sgguSlug}-implant/index.html`);
  writeFileSync(filePath, html, 'utf8');

  return { sgguNm, sgguSlug, sidoEn, clinics: clinics.length };
}

/** 특정 시도의 모든 시군구 아티클 생성 */
export function generateAllArticlesForSido(dataKey, sidoNm, sidoEn, buildDate, minClinics = 1) {
  const prices = loadRegionData(dataKey);
  if (!prices.length) {
    console.warn(`  ⚠ ${sidoNm}: 데이터 없음`);
    return [];
  }

  const groups = groupBySggu(prices);
  const results = [];

  for (const [sgguNm, clinics] of Object.entries(groups)) {
    if (clinics.length < minClinics) continue;
    try {
      const r = generateArticlePage(clinics, sgguNm, sidoNm, sidoEn, buildDate);
      console.log(`  ✓ articles/${sidoEn}-${r.sgguSlug}-implant/ (${r.clinics}개 병원)`);
      results.push(r);
    } catch (e) {
      console.error(`  ✗ ${sgguNm} 생성 실패: ${e.message}`);
    }
  }

  return results;
}

// --- 직접 실행 ---
if (process.argv[1]?.endsWith('gen-articles.js')) {
  const BUILD_DATE = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  mkdirSync(OUT_DIR, { recursive: true });

  let totalArticles = 0;
  for (const r of REGION_META) {
    console.log(`\n[${r.sido}] 아티클 생성 중...`);
    const results = generateAllArticlesForSido(r.dataKey, r.sido, r.sidoEn, BUILD_DATE);
    totalArticles += results.length;
  }

  console.log(`\n✅ 총 ${totalArticles}개 아티클 생성 완료`);
}

/** /articles/ — 아티클 목록 페이지 (생성된 아티클 디렉터리 스캔) */
export function generateArticlesIndex(buildDate) {
  const dirs = readdirSync(OUT_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .sort();

  const items = [];
  for (const dir of dirs) {
    const f = join(OUT_DIR, dir, 'index.html');
    if (!existsSync(f)) continue;
    const m = readFileSync(f, 'utf8').match(/<h1>([^<]+)<\/h1>/);
    items.push({ dir, title: m ? m[1] : dir });
  }

  const cards = items.map(it => `
    <a class="region-card" href="${BASE_URL}/articles/${it.dir}/">
      <h3>${it.title.replace(' 임플란트 치과 가격 정보', '')}</h3>
      <p>임플란트 가격 정보</p>
    </a>`).join('');

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="index, follow">
  <title>시군구별 임플란트 가격 아티클 ${items.length}개 | HIRA 비급여 데이터</title>
  <meta name="description" content="서울·경기·부산·인천 ${items.length}개 시군구별 치과 임플란트 비급여 가격 아티클. 건강보험심사평가원 공개 데이터 기반.">
  <link rel="canonical" href="${BASE_URL}/articles/">
  <link href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css" rel="stylesheet">
  <link rel="stylesheet" href="${BASE_URL}/style.css">
  <link rel="stylesheet" href="${BASE_URL}/article.css">
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
    <h1>시군구별 임플란트 가격 아티클</h1>
    <p class="article-sub">${items.length}개 지역 · ${buildDate} 기준 · HIRA 공개 데이터</p>
  </div>
</section>
<main class="inner article-body">
  <section class="clinics-detail-section">
    <div class="guide-grid">${cards || '<p class="no-data">아티클 준비 중입니다.</p>'}</div>
  </section>
</main>
<footer class="site-footer">
  <div class="inner">
    <div class="footer-links">
      <a href="${BASE_URL}/">홈</a>
      <a href="${BASE_URL}/dental/">지역별 비교</a>
    </div>
    <p class="footer-note">건강보험심사평가원 공공데이터 기반 · 의료광고법 제56조 준수</p>
  </div>
</footer>
</body>
</html>`;

  checkLawHard(html, 'articles/index.html');
  writeFileSync(join(OUT_DIR, 'index.html'), html, 'utf8');
  console.log(`  ✓ articles/index.html (목록 ${items.length}건)`);
}
