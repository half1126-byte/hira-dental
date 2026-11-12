/**
 * site-config.js
 * 사이트 주소 단일 설정 — 도메인 전환 시 이 파일의 BASE_URL 한 줄만 바꾼다.
 *
 * 커스텀 도메인(medipick.kr) 연결 시:
 *   1) 이 파일: BASE_URL = 'https://medipick.kr'
 *   2) 정적 파일 수동 교체: index.html(canonical·og:url), robots.txt(Sitemap),
 *      .github/workflows/partner.yml(안내 링크), docs/사용가이드.md, README.md
 *   3) CNAME 파일 생성 + build.yml _site 복사 목록에 CNAME 추가
 *   자세한 절차: docs/도메인-전환.md
 */

export const BASE_URL = 'https://xn--2z1bo3hsx1a.com';

// 시술별 메타 (label, slug, filter) — fetch-hira.js가 API 키를 모듈 로드 시 요구하므로
// 키 없이 실행되는 gen-articles.js 단독 실행 경로를 위해 중립 모듈에 둔다
export const PROCEDURES = {
  implant: { label: '임플란트',              slug: 'implant', filter: '임플란트' },
  crown:   { label: '지르코니아 보철',        slug: 'crown',   filter: '크라운/Zirconia' },
  scaling: { label: '스케일링(치석제거)',     slug: 'scaling', filter: '치석제거/전악' },
};

// 인용 모니터링·IndexNow가 쓰는 호스트명 (BASE_URL에서 자동 파생)
export const SITE_DOMAIN = new URL(BASE_URL).host;

// ── 공통 브랜드·검수 설정 (생성기마다 따로 두던 상수를 한 곳으로 모음) ──
export const SITE_NAME = '메디픽 MediPick';

// 시군구 아티클 색인 기준: 신고 기관 수가 이보다 적으면 noindex + 사이트맵 제외.
// 기관 1~2곳짜리 페이지는 지명만 바뀐 얇은 페이지로 보여 검색 품질 평가에 불리하다.
// 0으로 바꾸면 전부 색인(이전 동작).
export const MIN_INDEX_CLINICS = 3;

// 의료광고법 제56조·치과 광고 심의 기준 금지어 (생성 결과에 있으면 빌드 중단)
export const LAW_HARD = [
  '최고', '1위', '최저가', '유일', '완치', '보장', '100%', '최상급', '명품', '무통',
  '잘하는', '전문병원', '전문치과', '임플란트 전문', 'TOP', '할인', '이벤트', '파격',
];

// 금지어가 들어가도 광고 표현이 아닌 정상 문맥 (검사 전에 제거하고 본다)
const LAW_ALLOW = [
  /건강보험\s*보장/g, /보장성/g, /보장\s*범위/g,
  /의료기관\s*추천\s*아님/g,
];

/** 금지어 검사 — 위반 시 throw (빌드 중단) */
export function checkLawHard(html, filePath) {
  let text = String(html);
  for (const re of LAW_ALLOW) text = text.replace(re, '');
  const found = LAW_HARD.filter(w => text.includes(w));
  if (found.length) throw new Error(`🚨 LAW_HARD 위반 [${filePath}]: ${found.join(', ')}`);
}

// ── 전국 17개 시도 (인구 순) — 수집·페이지·가격지수·OG 이미지가 모두 이 목록을 쓴다 ──
// 데이터가 없는 시도는 각 생성기에서 건너뛴다(빈 페이지를 만들지 않음).
export const REGIONS = [
  { nm: '서울', en: 'seoul' },    { nm: '경기', en: 'gyeonggi' },  { nm: '부산', en: 'busan' },
  { nm: '경남', en: 'gyeongnam' }, { nm: '인천', en: 'incheon' },   { nm: '경북', en: 'gyeongbuk' },
  { nm: '대구', en: 'daegu' },    { nm: '충남', en: 'chungnam' },  { nm: '전남', en: 'jeonnam' },
  { nm: '전북', en: 'jeonbuk' },  { nm: '충북', en: 'chungbuk' },  { nm: '강원', en: 'gangwon' },
  { nm: '대전', en: 'daejeon' },  { nm: '광주', en: 'gwangju' },   { nm: '울산', en: 'ulsan' },
  { nm: '제주', en: 'jeju' },     { nm: '세종', en: 'sejong' },
];
