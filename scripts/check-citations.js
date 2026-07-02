/**
 * check-citations.js
 * AI 검색 인용 모니터링 — 거래처별 타깃 질의를 AI 검색에 실제로 던져
 * 이 사이트가 인용(출처 표시)되는지 자동 점검하고 리포트 생성
 *
 * - PERPLEXITY_API_KEY 있으면: Perplexity(sonar)에 실질의 → citations에서 도메인 검색
 * - 키 없으면: 질의 체크리스트만 리포트로 생성 (수동 점검용)
 * - 결과: reports/citations-YYYY-MM-DD.md (주간 워크플로가 커밋)
 *
 * 실행: node scripts/check-citations.js
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, '..');
const SITE_DOMAIN = 'half1126-byte.github.io';
const TODAY = new Date().toISOString().slice(0, 10);

/** 거래처 + 사이트 공통 타깃 질의 생성 */
function buildQueries() {
  const queries = [
    { q: '강남 임플란트 가격 비교', target: '지역 아티클' },
    { q: '서울 치과 임플란트 비급여 가격 얼마나 하나요', target: '지역 비교 페이지' },
  ];
  const pf = join(ROOT, 'partners', 'partners.json');
  if (existsSync(pf)) {
    const db = JSON.parse(readFileSync(pf, 'utf8'));
    for (const p of db.partners ?? []) {
      if (p.status !== 'active') continue;
      queries.push(
        { q: `${p.sgguNm} 치과 추천`, target: `${p.name} 프로필/지역 아티클` },
        { q: `${p.name} 진료시간 위치`, target: `${p.name} 프로필` },
      );
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
  const citations = data.citations ?? data.search_results?.map(r => r.url) ?? [];
  const cited = citations.filter(u => String(u).includes(SITE_DOMAIN));
  return { cited, total: citations.length };
}

const queries = buildQueries();
const hasKey = !!process.env.PERPLEXITY_API_KEY;
const rows = [];
let hits = 0;

for (const { q, target } of queries) {
  if (!hasKey) {
    rows.push(`| ${q} | ${target} | 수동 점검 필요 | - |`);
    continue;
  }
  try {
    const { cited, total } = await askPerplexity(q);
    if (cited.length) hits++;
    rows.push(`| ${q} | ${target} | ${cited.length ? '✅ 인용됨' : '❌ 미인용'} | ${cited[0] ?? `출처 ${total}건 중 0`} |`);
    console.log(`${cited.length ? '✅' : '❌'} ${q}`);
  } catch (e) {
    rows.push(`| ${q} | ${target} | ⚠ 오류: ${e.message} | - |`);
  }
}

const report = `# AI 인용 모니터링 리포트 (${TODAY})

- 점검 도구: ${hasKey ? 'Perplexity API (sonar) 실질의' : '없음 — PERPLEXITY_API_KEY Secret 등록 시 자동 실질의'}
- 대상 도메인: ${SITE_DOMAIN}
- 결과: ${hasKey ? `${queries.length}개 질의 중 ${hits}건 인용` : `${queries.length}개 질의 체크리스트 (ChatGPT·Perplexity에 직접 물어 확인)`}

| 질의 | 기대 인용 페이지 | 결과 | 인용 URL |
|------|----------------|------|---------|
${rows.join('\n')}

> 미인용 질의는 해당 페이지의 첫 문단(답변 문장)·FAQ·가격 수치를 보강하고,
> 거래처 외부 링크(sameAs)를 늘리면 개선됩니다. (docs/GEO-PLAYBOOK.md 참고)
`;

mkdirSync(join(ROOT, 'reports'), { recursive: true });
const outFile = join(ROOT, 'reports', `citations-${TODAY}.md`);
writeFileSync(outFile, report, 'utf8');
console.log(`\n✅ 리포트 생성: reports/citations-${TODAY}.md`);
