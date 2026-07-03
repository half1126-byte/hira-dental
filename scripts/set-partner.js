/**
 * set-partner.js
 * 거래처 상태 변경/삭제 CLI (계약 해지·재개 처리)
 *
 * 사용법:
 *   node scripts/set-partner.js --id gangdong-trium-dental --status paused   # 해지(페이지 제거, 기록 유지)
 *   node scripts/set-partner.js --id gangdong-trium-dental --status active   # 재활성화
 *   node scripts/set-partner.js --id gangdong-trium-dental --remove          # 완전 삭제
 *   node scripts/set-partner.js --list                                       # 전체 목록
 *
 * 상태 변경 후 빌드하면 gen-partners가 clinics/를 재생성하므로
 * paused/삭제된 거래처 페이지는 자동으로 사라진다.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const PARTNERS_FILE = join(__dir, '..', 'partners', 'partners.json');

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const k = argv[i].slice(2);
      const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
      args[k] = v;
    }
  }
  return args;
}

const args = parseArgs(process.argv);
const db = JSON.parse(readFileSync(PARTNERS_FILE, 'utf8'));

if (args.list) {
  for (const p of db.partners) {
    console.log(`${String(p.status).padEnd(7)} ${p.id.padEnd(28)} ${p.name} (${p.sido} ${p.sgguNm})`);
  }
  process.exit(0);
}

if (!args.id) {
  console.error('사용법: --id <slug> --status active|paused | --remove | --list');
  process.exit(1);
}

const idx = db.partners.findIndex(p => p.id === args.id);
if (idx === -1) {
  console.error(`✗ 거래처 없음: ${args.id}`);
  console.error('  등록된 id 목록: ' + db.partners.map(p => p.id).join(', '));
  process.exit(1);
}

const p = db.partners[idx];

if (args.remove) {
  db.partners.splice(idx, 1);
  console.log(`✅ 삭제: ${p.name} (${args.id}) — 다음 빌드에서 페이지 제거됨`);
} else if (args.status) {
  if (!['active', 'paused'].includes(args.status)) {
    console.error('✗ --status 는 active 또는 paused 만 가능합니다.');
    process.exit(1);
  }
  const prev = p.status;
  p.status = args.status;
  if (args.status === 'paused') p.contractEnd = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  else delete p.contractEnd;
  console.log(`✅ ${p.name}: ${prev} → ${args.status}${args.status === 'paused' ? ' (해지일 기록, 다음 빌드에서 페이지 제거)' : ''}`);
} else {
  console.error('✗ --status 또는 --remove 를 지정하세요.');
  process.exit(1);
}

db.updatedAt = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
writeFileSync(PARTNERS_FILE, JSON.stringify(db, null, 2) + '\n', 'utf8');
