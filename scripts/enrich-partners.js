/**
 * enrich-partners.js
 * 빌드 시 거래처 HIRA 자동 보강 (CI에서 HIRA_API_KEY Secret으로 실행)
 *
 * active 거래처 중 hira.ykiho가 비어 있는 기관을 HIRA 병원정보서비스로 검색해
 * 좌표·기관코드·설립일을 채우고, addr/tel이 비어 있으면 함께 채운다.
 * partners.json에 바로 반영 → 이어지는 gen-partners가 보강된 데이터로 페이지 생성.
 * (CI 워크스페이스는 휘발성이라 커밋되지 않지만, 매 빌드마다 재보강되므로 문제 없음)
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { searchHiraBasis, toHiraField } from './hira-lookup.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const PARTNERS_FILE = join(__dir, '..', 'partners', 'partners.json');

/** @param force true면 이미 매칭된 기관도 재조회 */
export async function enrichPartners(force = false) {
  if (!process.env.HIRA_API_KEY) {
    console.log('  – HIRA_API_KEY 없음 → 거래처 보강 생략');
    return 0;
  }
  if (!existsSync(PARTNERS_FILE)) return 0;

  const db = JSON.parse(readFileSync(PARTNERS_FILE, 'utf8'));
  let enriched = 0;

  for (const p of db.partners ?? []) {
    if (p.status !== 'active') continue;
    if (p.hira?.ykiho && !force) continue;
    try {
      const hit = await searchHiraBasis(p.name, p.sido);
      if (!hit) {
        console.warn(`  – ${p.name}: HIRA 매칭 없음`);
        continue;
      }
      p.hira = { ...p.hira, ...toHiraField(hit) };
      if (!p.addr && hit.addr) p.addr = String(hit.addr);
      if (!p.tel && hit.telno) p.tel = String(hit.telno);
      if (!p.sgguNm && hit.sgguCdNm) p.sgguNm = String(hit.sgguCdNm);
      enriched++;
      console.log(`  ✓ ${p.name}: ${p.hira.clCdNm || '기관'} 매칭 (ykiho ${p.hira.ykiho ? '확보' : '없음'}, 좌표 ${p.hira.lat ? '확보' : '없음'})`);
    } catch (e) {
      console.warn(`  ⚠ ${p.name} 보강 실패: ${e.message}`);
    }
  }

  if (enriched) {
    writeFileSync(PARTNERS_FILE, JSON.stringify(db, null, 2) + '\n', 'utf8');
    console.log(`  → partners.json ${enriched}건 보강 완료`);
  }
  return enriched;
}

// --- 직접 실행: node --env-file=.env.local scripts/enrich-partners.js [--force] ---
if (process.argv[1]?.endsWith('enrich-partners.js')) {
  const n = await enrichPartners(process.argv.includes('--force'));
  console.log(`\n✅ 거래처 보강 ${n}건`);
}
