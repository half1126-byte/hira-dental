/**
 * submit-indexnow.js
 * IndexNow 프로토콜로 검색엔진(Bing·네이버 등)에 URL 자동 제출
 *
 * - Bing 색인은 ChatGPT 검색이 사용 → AI 검색 노출에 직결
 * - 네이버도 IndexNow 지원 (국내 질의 대응)
 * - 계정·API키 불필요: 사이트에 호스팅된 키 파일(<key>.txt)로 소유 검증
 * - 배포 완료 후 실행 (키 파일이 라이브 상태여야 검증 가능)
 *
 * 실행: node scripts/submit-indexnow.js   (CI: build.yml indexnow 잡)
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, '..');

const KEY = '01641d0d88be2025b555e6f89832ade7'; // 공개 키 (사이트 루트 <key>.txt로 호스팅, 비밀 아님)
const BASE_URL = 'https://half1126-byte.github.io/hira-dental';
const HOST = 'half1126-byte.github.io';

// 배포된 라이브 sitemap 우선 (CI 빌드가 재생성한 최신본), 실패 시 로컬 파일
async function loadSitemap() {
  try {
    const res = await fetch(`${BASE_URL}/sitemap.xml`, { signal: AbortSignal.timeout(15000) });
    if (res.ok) {
      console.log('  라이브 sitemap.xml 사용');
      return res.text();
    }
  } catch { /* fallback */ }
  console.log('  로컬 sitemap.xml 사용 (라이브 조회 실패)');
  return readFileSync(join(ROOT, 'sitemap.xml'), 'utf8');
}

const sitemap = await loadSitemap();
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);

if (!urls.length) {
  console.error('✗ sitemap.xml에서 URL을 찾지 못함');
  process.exit(1);
}

const payload = {
  host: HOST,
  key: KEY,
  keyLocation: `${BASE_URL}/${KEY}.txt`,
  urlList: urls,
};

console.log(`IndexNow 제출: ${urls.length}개 URL → api.indexnow.org (Bing·네이버 등 연동)`);

try {
  const res = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20000),
  });
  // 200 = 접수, 202 = 접수(키 검증 대기)
  if (res.status === 200 || res.status === 202) {
    console.log(`✅ 제출 완료 (HTTP ${res.status})`);
  } else {
    console.warn(`⚠ 제출 응답 HTTP ${res.status}: ${await res.text()}`);
    // 색인 통지는 부가 기능 — 배포 파이프라인을 실패시키지 않음
  }
} catch (e) {
  console.warn(`⚠ IndexNow 제출 실패(무시하고 계속): ${e.message}`);
}
