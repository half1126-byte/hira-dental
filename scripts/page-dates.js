/**
 * page-dates.js
 * 페이지별 최초 발행일·실제 수정일 보존.
 * 매일 빌드해도 내용(데이터)이 바뀌지 않으면 dateModified를 올리지 않는다.
 * 저장 위치: meta/page-dates.json (CI가 커밋해 다음 빌드로 이어짐)
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = join(ROOT, 'meta', 'page-dates.json');

let db = {};
try { if (existsSync(FILE)) db = JSON.parse(readFileSync(FILE, 'utf8')); } catch { db = {}; }

/** url + 내용 키 → { published, modified } */
export function pageDates(url, contentKey, buildDate) {
  const hash = createHash('sha1').update(String(contentKey)).digest('hex').slice(0, 16);
  const e = db[url];
  if (!e) db[url] = { published: buildDate, modified: buildDate, hash };
  else if (e.hash !== hash) { e.modified = buildDate; e.hash = hash; }
  return { published: db[url].published, modified: db[url].modified };
}

export function getPageDates(url) {
  return db[url] ?? null;
}

export function savePageDates() {
  mkdirSync(dirname(FILE), { recursive: true });
  const sorted = Object.fromEntries(Object.keys(db).sort().map(k => [k, db[k]]));
  writeFileSync(FILE, JSON.stringify(sorted, null, 1) + '\n', 'utf8');
  return Object.keys(sorted).length;
}
