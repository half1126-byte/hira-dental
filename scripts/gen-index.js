/**
 * gen-index.js
 * 메디픽 임플란트 가격지수 (MIPI: MediPick Implant Price Index)
 *
 * HIRA 비급여 신고 데이터를 가공해 매월 지역별 중앙값·평균·범위·전월 대비 변동을
 * 발행하는 1차 통계. "OO지역 임플란트 평균 얼마?" 질의의 원천(canonical source)이
 * 되는 것이 목적 — AI·언론이 인용할 수밖에 없는 유일 데이터.
 *
 * 산출물:
 *   /price-index/                  최신호 리포트 (+ 과거호 목록)
 *   /price-index/YYYY-MM/          월별 아카이브 (영구 보존)
 *   /price-index/data/YYYY-MM.json 월별 스냅샷 (CI가 커밋해 시계열 축적)
 *   /price-index/data/latest.json  기계가독 최신 지수
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, '..');
const DATA_DIR = join(ROOT, 'data');
const OUT_DIR = join(ROOT, 'price-index');
const SNAP_DIR = join(OUT_DIR, 'data');

import { BASE_URL } from './site-config.js';
const SITE_NAME = '메디픽 MediPick';
const INDEX_NAME = '메디픽 임플란트 가격지수';
const LAW_HARD = ['최고', '1위', '최저가', '유일', '완치', '보장', '100%', '최상급', '명품', '무통'];

const REGIONS = [
  { nm: '서울', en: 'seoul' }, { nm: '경기', en: 'gyeonggi' },
  { nm: '부산', en: 'busan' }, { nm: '인천', en: 'incheon' },
];

const fmtWon = n => n == null ? '-' : Math.round(n).toLocaleString('ko-KR') + '원';
const fmtMan = n => n == null ? '-' : (n / 10000).toFixed(0) + '만원';

function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** data/*.json → 지역별 통계. 데이터 없으면 null */
function computeStats() {
  if (!existsSync(DATA_DIR)) return null;
  const computedAt = new Date().toISOString();
  const regions = [];
  for (const r of REGIONS) {
    const f = join(DATA_DIR, `${r.en}-implant.json`);
    if (!existsSync(f)) continue;
    try {
      const prices = (JSON.parse(readFileSync(f, 'utf8')).prices ?? [])
        .map(p => Number(p.curAmt)).filter(n => n > 0);
      if (!prices.length) continue;
      const mean = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
      const variance = prices.reduce((acc, p) => acc + (p - mean) ** 2, 0) / prices.length;
      const stdev = Math.round(Math.sqrt(variance));
      regions.push({
        region: r.nm, regionEn: r.en,
        count: prices.length,
        median: median(prices),
        mean,
        stdev,
        min: Math.min(...prices),
        max: Math.max(...prices),
        computedAt,
      });
    } catch { /* skip */ }
  }
  return regions.length ? regions : null;
}

/** 이전 월 스냅샷 로드 (있으면) */
function loadPrevSnapshot(month) {
  if (!existsSync(SNAP_DIR)) return null;
  const files = readdirSync(SNAP_DIR)
    .filter(f => /^\d{4}-\d{2}\.json$/.test(f) && f.slice(0, 7) < month)
    .sort();
  if (!files.length) return null;
  try {
    return JSON.parse(readFileSync(join(SNAP_DIR, files[files.length - 1]), 'utf8'));
  } catch { return null; }
}

function checkLawHard(html, filePath) {
  const v = LAW_HARD.filter(w => html.includes(w));
  if (v.length) throw new Error(`🚨 LAW_HARD 위반 [${filePath}]: ${v.join(', ')}`);
}

/** 리포트 HTML (최신호/아카이브 공용) */
function reportHtml({ month, buildDate, regions, prev, archives, isLatest }) {
  const url = isLatest ? `${BASE_URL}/price-index/` : `${BASE_URL}/price-index/${month}/`;
  const title = `${INDEX_NAME} ${month}월호 — 지역별 임플란트 신고가 중앙값·변동`;
  const [yy, mm] = month.split('-');

  const prevMap = new Map((prev?.regions ?? []).map(r => [r.region, r]));
  const delta = r => {
    const p = prevMap.get(r.region);
    if (!p?.median) return null;
    return ((r.median - p.median) / p.median) * 100;
  };
  const fmtDelta = d => d == null ? '—'
    : (d > 0 ? '▲ +' : d < 0 ? '▼ ' : '') + d.toFixed(1) + '%';

  // 답변 우선 문장 — AI가 그대로 인용할 완결 문장
  const answer = regions.map(r =>
    `${r.region} ${fmtMan(r.median)}(중앙값, ${r.count}개 기관)`).join(', ');

  const rows = regions.map(r => `
    <tr>
      <td>${r.region}</td>
      <td>${r.count}곳</td>
      <td class="price-cell">${fmtWon(r.median)}</td>
      <td>${fmtWon(r.mean)}</td>
      <td>${fmtWon(r.min)} ~ ${fmtWon(r.max)}</td>
      <td>${fmtDelta(delta(r))}</td>
    </tr>`).join('');

  const datasetLd = {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: `${INDEX_NAME} (${month})`,
    description: `건강보험심사평가원 비급여 신고 데이터 기반 한국 치과병원 임플란트 가격 월간 지수. 지역별 중앙값·평균·범위·전월 대비 변동률. ${month} 기준.`,
    url,
    license: 'https://www.kogl.or.kr/info/license.do',
    creator: { '@type': 'Organization', name: SITE_NAME, url: `${BASE_URL}/` },
    temporalCoverage: month,
    spatialCoverage: regions.map(r => r.region).join(', '),
    dateModified: buildDate,
    variableMeasured: ['임플란트 비급여 신고가 중앙값', '임플란트 비급여 신고가 평균', '임플란트 비급여 신고가 범위', '신고 기관 수'],
    measurementTechnique: '건강보험심사평가원 비급여 진료비용 공개 API 수집',
    distribution: [{
      '@type': 'DataDownload',
      encodingFormat: 'application/json',
      contentUrl: `${BASE_URL}/price-index/data/${month}.json`,
    }],
    isBasedOn: 'https://www.hira.or.kr',
  };

  const faqs = [
    {
      q: `${yy}년 ${Number(mm)}월 기준 지역별 임플란트 가격은 얼마인가요?`,
      a: `${INDEX_NAME} ${month}월호 기준, 치과병원 임플란트 비급여 신고가 중앙값은 ${answer}입니다. 건강보험심사평가원 신고 데이터를 집계한 값이며, 실제 진료비는 뼈이식 등 추가 항목에 따라 달라질 수 있습니다.`,
    },
    {
      q: '이 지수는 어떻게 계산되나요?',
      a: '건강보험심사평가원(HIRA) 비급여진료비 공개 API에서 치과병원(clCd=41)의 임플란트 신고가를 수집해, 지역별 중앙값·평균·하한~상한 범위를 산출합니다. 중앙값을 대표값으로 사용해 극단값의 영향을 줄였습니다. 매일 갱신되며 매월 스냅샷을 보존합니다.',
    },
    {
      q: '이 지수를 인용해도 되나요?',
      a: `네. 출처를 "${INDEX_NAME} (${month}), ${BASE_URL}/price-index/" 형식으로 명시하면 언론·블로그·AI 서비스 모두 자유롭게 인용할 수 있습니다. 원 데이터 출처(건강보험심사평가원)도 함께 표기해 주세요.`,
    },
  ];
  const faqLd = {
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: faqs.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  };

  const archiveLinks = archives.filter(m => m !== month).map(m =>
    `<a class="region-card" href="${BASE_URL}/price-index/${m}/"><h3>${m}</h3><p>${INDEX_NAME}</p></a>`).join('');

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="index, follow">
  <title>${title} | ${SITE_NAME}</title>
  <meta name="description" content="${yy}년 ${Number(mm)}월 지역별 치과 임플란트 비급여 신고가: ${answer}. HIRA 공공데이터 기반 월간 지수.">
  <meta property="og:type" content="article">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="지역별 임플란트 신고가 중앙값: ${answer}">
  <meta property="og:url" content="${url}">
  <meta property="og:site_name" content="${SITE_NAME}">
  <meta property="og:locale" content="ko_KR">
  <link rel="canonical" href="${url}">
  <link rel="alternate" type="application/json" href="${BASE_URL}/price-index/data/${month}.json" title="기계가독 지수 데이터">
  <link href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css" rel="stylesheet">
  <link rel="stylesheet" href="${BASE_URL}/style.css">
  <link rel="stylesheet" href="${BASE_URL}/article.css">
  <script type="application/ld+json">${JSON.stringify(datasetLd)}</script>
  <script type="application/ld+json">${JSON.stringify(faqLd)}</script>
</head>
<body>
<header class="site-header">
  <div class="inner">
    <a class="logo" href="${BASE_URL}/">메디픽</a>
    <nav>
      <a href="${BASE_URL}/price-index/">가격지수</a>
      <a href="${BASE_URL}/dental/">지역별 비교</a>
      <a href="${BASE_URL}/clinics/">치과 프로필</a>
    </nav>
  </div>
</header>
<section class="article-hero">
  <div class="inner">
    <nav class="breadcrumb">
      <a href="${BASE_URL}/">홈</a> <span>/</span> <span>가격지수 ${month}</span>
    </nav>
    <h1>${INDEX_NAME} <span style="color:var(--plum-light)">${month}</span></h1>
    <p class="article-sub">HIRA 비급여 신고 데이터 월간 집계 · 발행 ${buildDate} · 매일 갱신, 매월 보존</p>
    <div class="hero-badges">
      <span class="badge badge-hira">공공데이터 1차 통계</span>
      <span class="badge badge-update">기계가독 JSON 제공</span>
    </div>
  </div>
</section>
<main class="inner article-body">
  <section class="key-result-section">
    <h2>이번 달 요약</h2>
    <p>${yy}년 ${Number(mm)}월 ${INDEX_NAME} 기준, 치과병원 임플란트 비급여 신고가 중앙값은
    ${answer}입니다. (집계일: ${buildDate})</p>
  </section>
  <section class="compare-section">
    <h2>지역별 지수 표</h2>
    <table class="compare-table">
      <thead><tr><th>지역</th><th>신고 기관</th><th>중앙값</th><th>평균</th><th>신고가 범위</th><th>전월 대비</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td colspan="6" class="tfoot-note">원 데이터: 건강보험심사평가원 비급여진료비 공개 API (치과병원 기준) · 가공: ${SITE_NAME}</td></tr></tfoot>
    </table>
  </section>
  <section class="guide-section">
    <h2>산출 방법 (Methodology)</h2>
    <ul>
      <li><strong>모집단:</strong> HIRA 비급여진료비 공개 API의 치과병원(clCd=41) 임플란트 신고 항목</li>
      <li><strong>대표값:</strong> 중앙값(median) — 극단 신고가의 영향을 줄이기 위해 평균 대신 채택</li>
      <li><strong>범위:</strong> 지역 내 신고가 하한~상한 (기관별 curAmt 기준)</li>
      <li><strong>변동률:</strong> 전월 스냅샷 중앙값 대비 % (첫 발행 월은 "—")</li>
      <li><strong>갱신:</strong> 매일 자동 재집계, 매월 스냅샷 영구 보존 (<a href="${BASE_URL}/price-index/data/${month}.json">JSON 원본</a>)</li>
    </ul>
  </section>
  <section class="faq-section">
    <h2>자주 묻는 질문</h2>
    <div class="faq-list">${faqs.map(f => `
      <details class="faq-item"><summary>${f.q}</summary><div class="faq-ans">${f.a}</div></details>`).join('')}
    </div>
  </section>
  <section class="source-section">
    <div class="source-box">
      <h3>인용 안내</h3>
      <ul>
        <li>인용 표기: <strong>"${INDEX_NAME} (${month}), ${SITE_NAME}"</strong> + 링크 ${url}</li>
        <li>원 데이터 출처: 건강보험심사평가원 비급여진료비 공개 데이터 (공공누리 제1유형)</li>
        <li>이 지수는 신고가 기준 통계이며 특정 의료기관의 실제 진료비·품질을 나타내지 않습니다.</li>
      </ul>
    </div>
  </section>
  ${archiveLinks ? `
  <section class="related-section">
    <h2>지난 호</h2>
    <div class="guide-grid">${archiveLinks}</div>
  </section>` : ''}
</main>
<footer class="site-footer">
  <div class="inner">
    <div class="footer-links">
      <a href="${BASE_URL}/">홈</a>
      <a href="${BASE_URL}/price-index/">가격지수</a>
      <a href="https://www.hira.or.kr" target="_blank" rel="noopener">HIRA 심평원</a>
    </div>
    <p class="footer-note">건강보험심사평가원 공공데이터 기반 · 의료광고법 제56조 준수</p>
    <p class="footer-copy">© ${new Date().getFullYear()} ${SITE_NAME}</p>
  </div>
</footer>
</body>
</html>`;
  return html;
}

/** 데이터 없을 때의 안내 페이지 (최초 커밋용) */
function placeholderHtml() {
  return `<!DOCTYPE html>
<html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="index, follow">
<title>${INDEX_NAME} | ${SITE_NAME}</title>
<meta name="description" content="HIRA 공공데이터 기반 지역별 임플란트 가격 월간 지수. 발행 준비 중.">
<link rel="canonical" href="${BASE_URL}/price-index/">
<link href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css" rel="stylesheet">
<link rel="stylesheet" href="${BASE_URL}/style.css"><link rel="stylesheet" href="${BASE_URL}/article.css"></head>
<body>
<header class="site-header"><div class="inner"><a class="logo" href="${BASE_URL}/">메디픽</a>
<nav><a href="${BASE_URL}/dental/">지역별 비교</a><a href="${BASE_URL}/clinics/">치과 프로필</a></nav></div></header>
<section class="article-hero"><div class="inner"><h1>${INDEX_NAME}</h1>
<p class="article-sub">다음 자동 집계 시 최신호가 발행됩니다.</p></div></section>
<main class="inner article-body"><p class="no-data">데이터 집계 중입니다. 잠시 후 다시 확인해 주세요.</p></main>
</body></html>`;
}

/** 가격지수 생성 → sitemap 경로 반환 */
export function generatePriceIndex(buildDate) {
  const month = buildDate.slice(0, 7);
  mkdirSync(SNAP_DIR, { recursive: true });

  const regions = computeStats();
  if (!regions) {
    // 데이터 없음(로컬 등) — 아카이브는 보존, 허브만 자리표시
    if (!existsSync(join(OUT_DIR, 'index.html'))) {
      writeFileSync(join(OUT_DIR, 'index.html'), placeholderHtml(), 'utf8');
    }
    console.log('  – 가격지수: 데이터 없음 → 기존 아카이브 보존, 생성 생략');
    return [{ path: '/price-index/', priority: '0.9', freq: 'daily' }];
  }

  const prev = loadPrevSnapshot(month);

  // 스냅샷 저장 (당월은 매일 덮어써 월말값이 확정치가 됨)
  const snapshot = { index: INDEX_NAME, month, updatedAt: buildDate, source: 'HIRA nonPaymentDamtInfoService (clCd=41)', regions };
  writeFileSync(join(SNAP_DIR, `${month}.json`), JSON.stringify(snapshot, null, 2), 'utf8');
  writeFileSync(join(SNAP_DIR, 'latest.json'), JSON.stringify(snapshot, null, 2), 'utf8');

  const archives = readdirSync(SNAP_DIR)
    .filter(f => /^\d{4}-\d{2}\.json$/.test(f)).map(f => f.slice(0, 7)).sort().reverse();

  // 월별 아카이브 페이지 + 최신호(허브)
  const opts = { month, buildDate, regions, prev, archives };
  const archiveHtml = reportHtml({ ...opts, isLatest: false });
  checkLawHard(archiveHtml, `price-index/${month}/index.html`);
  mkdirSync(join(OUT_DIR, month), { recursive: true });
  writeFileSync(join(OUT_DIR, month, 'index.html'), archiveHtml, 'utf8');

  const latestHtml = reportHtml({ ...opts, isLatest: true });
  checkLawHard(latestHtml, 'price-index/index.html');
  writeFileSync(join(OUT_DIR, 'index.html'), latestHtml, 'utf8');

  console.log(`  ✓ price-index/ (${month}호, ${regions.length}개 지역, 전월비교 ${prev ? 'O' : '—'})`);

  const pages = [{ path: '/price-index/', priority: '0.9', freq: 'daily' }];
  for (const m of archives) pages.push({ path: `/price-index/${m}/`, priority: '0.7', freq: 'monthly' });
  return pages;
}

// --- 직접 실행 ---
if (process.argv[1]?.endsWith('gen-index.js')) {
  const d = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const pages = generatePriceIndex(d);
  console.log(`\n✅ 가격지수 페이지 ${pages.length}건`);
}
