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
  crown:   { label: '크라운(지르코니아)',     slug: 'crown',   filter: '크라운/Zirconia' },
  scaling: { label: '스케일링(치석제거)',     slug: 'scaling', filter: '치석제거/전악' },
};

// 인용 모니터링·IndexNow가 쓰는 호스트명 (BASE_URL에서 자동 파생)
export const SITE_DOMAIN = new URL(BASE_URL).host;
