/**
 * check-citations.js
 * AI 검색 인용 모니터링 — 거래처별 타깃 질의를 AI 검색에 실제로 던져
 * 이 사이트가 인용(출처 표시)되는지 자동 점검하고 리포트 생성
 *
 * - PERPLEXITY_API_KEY 있으면: Perplexity(sonar)에 실질의 → citations에서 도메인 검색
 * - 키 없으면: 질의 체크리스트만 리포트로 생성 (수동 점검용)
 * - 결과: reports/citations-YYYY-MM-DD.md (주간 워크플로가 커밋)
 * - API 오류(401 등)는 '미인용'과 구분해 기록하고, 오류가 1건이라도 있으면 exit 1
 *   (리포트는 남기고 워크플로를 실패시켜 알림 이슈가 생성되게 함)
 * - CITATION_RUNS=N 으로 질의당 반복 횟수 지정 (기본 1). AI 답변은 매번 달라지므로
 *   등장률은 반복 측정으로 본다.
 *
 * 실행: node scripts/check-citations.js
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, '..');
import { SITE_DOMAIN } from './site-config.js';
const TODAY = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

/** 거래처 + 사이트 공통 타깃 질의 생성 */
function buildQueries() {
  // A. 가격·비교형 (주력 KPI) — 기관 3곳 이상으로 색인되는 지역 아티클 위주
  const queries = [
    { q: '서울 치과 임플란트 비급여 가격 얼마나 하나요', target: '지역 비교 페이지', type: 'A 가격' },
    { q: '강남구 임플란트 가격 비교', target: '지역 아티클', type: 'A 가격' },
    { q: '서초구 임플란트 비급여 가격', target: '지역 아티클', type: 'A 가격' },
    { q: '분당 임플란트 가격 얼마', target: '지역 아티클', type: 'A 가격' },
    { q: '부산진구 임플란트 비용', target: '지역 아티클', type: 'A 가격' },
    { q: '인천 부평구 임플란트 가격', target: '지역 아티클', type: 'A 가격' },
    { q: '서울 지르코니아 보철 비급여 가격', target: '지역 아티클', type: 'A 가격' },
    { q: '치과 임플란트 가격 지수 2026', target: '가격지수', type: 'A 가격' },
  ];
  const pf = join(ROOT, 'partners', 'partners.json');
  if (existsSync(pf)) {
    const db = JSON.parse(readFileSync(pf, 'utf8'));
    for (const p of db.partners ?? []) {
      if (p.status !== 'active') continue;
      queries.push(
        { q: `${p.sgguNm} 치과 추천`, target: `${p.name} 프로필/지역 아티클`, type: 'C 추천' },
        { q: `${p.name} 진료시간 위치`, target: `${p.name} 프로필`, type: 'B 기관명' },
      );
      const t = `${p.hours ?? ''} ${(p.features ?? []).join(' ')}`;
      if (/야간/.test(t)) queries.push({ q: `${p.sgguNm} 야간진료 치과`, target: '니즈별 찾기 페이지', type: 'B 니즈' });
      if (/365일/.test(t) || (/(일요일|공휴일|주말)[^·\n]*진료/.test(t) && !/휴진/.test(t)))
        queries.push({ q: `${p.sgguNm} 일요일 진료 치과`, target: '니즈별 찾기 페이지', type: 'B 니즈' });
      const st = `${(p.specialties ?? []).join(' ')} ${(p.features ?? []).join(' ')}`;
      if (/소아/.test(st)) queries.push({ q: `${p.sgguNm} 소아 진료 치과`, target: '니즈별 찾기 페이지 (소아)', type: 'B 니즈' });
      if (/의식하진정|수면치료|진정치료/.test(st)) queries.push({ q: `${p.sgguNm} 수면치료 되는 치과`, target: '니즈별 찾기 페이지 (진정치료)', type: 'B 니즈' });
      for (const a of p.areas ?? [])
        queries.push({ q: `${a.label} 치과 ${a.type === 'station' ? '근처 ' : ''}추천`, target: `동·역세권 페이지 (${a.label})`, type: 'C 추천' });
    }
  }
  return queries;
}

/** Perplexity 실질의 → 인용 여부 확인 */
async function askPerplexity(query) {
  const KEY = process.env.PERPLEXITY_API_KEY;
  const res = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'sonar',
      messages: [{ role: 'user', content: query }],
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`Perplexity HTTP ${res.status}`);
  const data = await res.json();
  const citations = (data.citations ?? data.search_results?.map(r => r.url) ?? []).map(String);
  const cited = citations.filter(u => u.includes(SITE_DOMAIN));
  return { cited, citations };
}

function hostOf(u) {
  try { return new URL(u).host.replace(/^www\./, ''); } catch { return String(u).slice(0, 40); }
}

const queries = buildQueries();
const hasKey = !!process.env.PERPLEXITY_API_KEY;
const RUNS = Math.max(1, Number(process.env.CITATION_RUNS) || 1);
const rows = [];
const domainCount = new Map();   // 전체 응답에 등장한 출처 도메인 (경쟁 출처 파악용)
let okCalls = 0, errCalls = 0, citedCalls = 0, citedQueries = 0;
const byType = {};

for (const { q, target, type = '-' } of queries) {
  if (!hasKey) {
    rows.push(`| ${type} | ${q} | ${target} | 수동 점검 필요 | - | - |`);
    continue;
  }
  let ok = 0, err = 0, hit = 0, firstUrl = '', lastErr = '';
  const hosts = new Map();
  for (let i = 0; i < RUNS; i++) {
    try {
      const { cited, citations } = await askPerplexity(q);
      ok++;
      if (cited.length) { hit++; firstUrl ||= cited[0]; }
      for (const h of new Set(citations.map(hostOf))) {
        hosts.set(h, (hosts.get(h) ?? 0) + 1);
        domainCount.set(h, (domainCount.get(h) ?? 0) + 1);
      }
    } catch (e) {
      err++; lastErr = e.message;
    }
  }
  okCalls += ok; errCalls += err; citedCalls += hit;
  if (hit) citedQueries++;
  const t = (byType[type] ??= { ok: 0, hit: 0 });
  t.ok += ok; t.hit += hit;

  let status;
  if (ok === 0) status = `⚠ 측정 실패 (${lastErr})`;
  else if (hit) status = `✅ 인용 ${hit}/${ok}회`;
  else status = `❌ 미인용 0/${ok}회`;
  if (ok && err) status += ` · 오류 ${err}회`;
  const top = [...hosts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([h]) => h).join(', ') || '-';
  rows.push(`| ${type} | ${q} | ${target} | ${status} | ${firstUrl || '-'} | ${top} |`);
  console.log(`${ok === 0 ? '⚠' : hit ? '✅' : '❌'} ${q}`);
}

const typeLines = Object.entries(byType).sort()
  .map(([k, v]) => `- ${k}: ${v.ok ? `${v.hit}/${v.ok}회 인용 (${Math.round((v.hit / v.ok) * 100)}%)` : '측정 실패'}`)
  .join('\n');
const topDomains = [...domainCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)
  .map(([h, n]) => `| ${h} | ${n} |`).join('\n');

let resultLine;
if (!hasKey) resultLine = `${queries.length}개 질의 체크리스트 (ChatGPT·Perplexity에 직접 물어 확인)`;
else if (okCalls === 0) resultLine = `⚠ 측정 실패 — 전체 ${errCalls}회 호출 모두 오류. 인용률을 알 수 없음 (0건 인용이 아님)`;
else resultLine = `질의 ${queries.length}개 × ${RUNS}회 — 성공 ${okCalls}회 중 ${citedCalls}회 인용, 인용된 질의 ${citedQueries}개${errCalls ? ` · ⚠ 오류 ${errCalls}회 (이 회차는 인용률 계산에서 제외)` : ''}`;

const report = `# AI 인용 모니터링 리포트 (${TODAY})

- 점검 도구: ${hasKey ? `Perplexity API (sonar) 실질의, 질의당 ${RUNS}회` : '없음 — PERPLEXITY_API_KEY Secret 등록 시 자동 실질의'}
- 대상 도메인: ${SITE_DOMAIN}
- 결과: ${resultLine}
${typeLines ? `\n## 질의 유형별 인용률\n\n${typeLines}\n\n> A 가격·비교형이 주력 지표. C 추천형은 지도·플레이스가 우선 인용되는 영역이라 관찰용.\n` : ''}
## 질의별 결과

| 유형 | 질의 | 기대 인용 페이지 | 결과 | 인용 URL | 주요 출처 도메인 |
|------|------|----------------|------|---------|----------------|
${rows.join('\n')}
${topDomains ? `\n## 전체 응답에 자주 등장한 출처 도메인\n\n| 도메인 | 등장 질의·회차 수 |\n|---|---|\n${topDomains}\n` : ''}
> 미인용 질의는 해당 페이지의 첫 문단(답변 문장)·FAQ·가격 수치를 보강하고,
> 위 출처 도메인이 무엇을 담고 있는지 비교해 보완합니다. (docs/GEO-PLAYBOOK.md 참고)
`;

mkdirSync(join(ROOT, 'reports'), { recursive: true });
const outFile = join(ROOT, 'reports', `citations-${TODAY}.md`);
writeFileSync(outFile, report, 'utf8');
console.log(`\n✅ 리포트 생성: reports/citations-${TODAY}.md`);

if (hasKey && errCalls > 0) {
  console.error(`\n⚠ API 오류 ${errCalls}회 — 리포트는 남기고 실패로 종료합니다 (키 만료·한도 확인 필요).`);
  process.exitCode = 1;
}
