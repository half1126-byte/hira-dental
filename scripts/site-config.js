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

export const BASE_URL = 'https://half1126-byte.github.io/hira-dental';

// 인용 모니터링·IndexNow가 쓰는 호스트명 (BASE_URL에서 자동 파생)
export const SITE_DOMAIN = new URL(BASE_URL).host;
