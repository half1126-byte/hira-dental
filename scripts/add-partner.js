/**
 * add-partner.js
 * 거래처(제휴 치과) 입력 → HIRA 공공 API 자동 조사 → partners/partners.json 등록
 *
 * 사용법:
 *   node --env-file=.env.local scripts/add-partner.js --name "OO치과의원" --sido 서울 --id gangnam-oo-dental
 *   옵션: --sggu 강남구 --tel 02-000-0000 --homepage https://... --specialties "임플란트,교정"
 *
 * 동작:
 *   1. HIRA 병원정보서비스(getHospBasisList)에서 기관명 검색 → 주소·전화·좌표·ykiho 자동 채움
 *   2. data/*-implant.json(비급여 신고가)에서 동일 기관 검색 → 매칭 결과 표시
 *   3. partners.json에 status:"paused"로 저장 (내용 검수 후 "active"로 변경하면 배포됨)
 *   4. HIRA_API_KEY 없으면 API 조사 없이 스켈레톤만 등록 (수동 보완)
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { searchHiraBasis, toHiraField } from './hira-lookup.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, '..');
const PARTNERS_FILE = join(ROOT, 'partners', 'partners.json');
const DATA_DIR = join(ROOT, 'data');

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

/** HIRA 병원정보서비스에서 기관명 검색 */
async function searchHira(name, sido) {
  if (!process.env.HIRA_API_KEY) {
    console.warn('⚠ HIRA_API_KEY 없음 — API 조사 생략, 스켈레톤만 등록합니다.');
    return null;
  }
  return searchHiraBasis(name, sido);
}

/** data/*.json에서 비급여 신고가 매칭 */
function findLocalPrices(name) {
  if (!existsSync(DATA_DIR)) return [];
  const norm = s => String(s ?? '').replace(/\s/g, '');
  const hits = [];
  for (const f of readdirSync(DATA_DIR)) {
    if (!f.endsWith('-implant.json')) continue;
    try {
      const raw = JSON.parse(readFileSync(join(DATA_DIR, f), 'utf8'));
      for (const it of raw.prices ?? []) {
        if (norm(it.yadmNm) === norm(name)) hits.push(it);
      }
    } catch { /* skip */ }
  }
  return hits;
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.name || !args.sido || !args.id) {
    console.error('사용법: node scripts/add-partner.js --name "기관명" --sido 서울 --id url-slug [--sggu 강남구 ...]');
    process.exit(1);
  }
  if (!/^[a-z0-9-]+$/.test(args.id)) {
    console.error('✗ --id 는 영문 소문자·숫자·하이픈만 가능합니다.');
    process.exit(1);
  }

  const db = JSON.parse(readFileSync(PARTNERS_FILE, 'utf8'));
  if (db.partners.some(p => p.id === args.id)) {
    console.error(`✗ 이미 존재하는 id: ${args.id}`);
    process.exit(1);
  }

  console.log(`\n[조사] ${args.name} (${args.sido}) HIRA 검색 중...`);
  let hira = null;
  try {
    hira = await searchHira(args.name, args.sido);
  } catch (e) {
    console.warn(`⚠ HIRA 검색 실패: ${e.message}`);
  }

  const partner = {
    id: args.id,
    status: 'paused',
    name: args.name,
    sido: args.sido,
    sgguNm: args.sggu ?? hira?.sgguCdNm ?? '',
    addr: args.addr ?? hira?.addr ?? '',
    tel: args.tel ?? String(hira?.telno ?? ''),
    homepage: args.homepage ?? (hira?.hospUrl ? String(hira.hospUrl) : ''),
    specialties: args.specialties ? String(args.specialties).split(',').map(s => s.trim()) : ['임플란트'],
    doctors: [],
    equipment: [],
    hours: '',
    parking: '',
    features: [],
    prices: [],
    faq: [],
    contractStart: new Date().toISOString().slice(0, 10),
    hira: toHiraField(hira),
  };

  if (hira) {
    console.log(`  ✓ HIRA 매칭: ${hira.yadmNm} (${hira.clCdNm ?? ''}) / ${hira.addr ?? ''}`);
  } else {
    console.log('  – HIRA 매칭 없음 (의원급이거나 명칭 불일치 가능) → 수동 보완 필요');
  }

  const localPrices = findLocalPrices(args.name);
  if (localPrices.length) {
    console.log(`  ✓ 비급여 신고가 ${localPrices.length}건 발견 (빌드 시 프로필에 자동 병합됨)`);
  }

  db.partners.push(partner);
  db.updatedAt = new Date().toISOString().slice(0, 10);
  writeFileSync(PARTNERS_FILE, JSON.stringify(db, null, 2) + '\n', 'utf8');

  console.log(`\n✅ partners/partners.json 등록 완료 (status: paused)`);
  console.log('다음 단계:');
  console.log('  1. partners/partners.json에서 진료시간·특징·가격·FAQ 등 보완 (의료광고법 금지어 주의)');
  console.log(`  2. status를 "active"로 변경`);
  console.log('  3. node scripts/build.js → /clinics/' + args.id + '/ 생성 + 지역 아티클 자동 연동');
}

main().catch(e => { console.error('✗ 오류:', e.message); process.exit(1); });
