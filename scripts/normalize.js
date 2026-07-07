/**
 * normalize.js
 * 병원명 정규화 유틸리티 — gen-partners.js / gen-articles.js 공유
 *
 * 정규화 규칙:
 *  1. 공백 전부 제거
 *  2. 법인 접두어 제거 (의료법인·사단법인·재단법인·학교법인·사회복지법인)
 *  3. 괄호 및 괄호 내용 제거: (...) / （...）/ [...] / 【...】
 *  4. 소문자화 (영문 혼재 대비)
 */

/** 제거할 법인 접두어 패턴 */
const CORP_PREFIXES = [
  '의료법인',
  '사단법인',
  '재단법인',
  '학교법인',
  '사회복지법인',
  '특수법인',
];

/**
 * normalizeName(name) → 정규화된 병원명 문자열
 * @param {string} name
 * @returns {string}
 */
export function normalizeName(name) {
  if (!name) return '';
  let s = String(name);

  // 법인 접두어 제거
  for (const prefix of CORP_PREFIXES) {
    if (s.startsWith(prefix)) {
      s = s.slice(prefix.length);
      break;
    }
  }

  // 괄호 및 내용 제거: 반각/전각 소괄호, 대괄호, 특수괄호
  s = s.replace(/\([^)]*\)/g, '');
  s = s.replace(/（[^）]*）/g, '');
  s = s.replace(/\[[^\]]*\]/g, '');
  s = s.replace(/【[^】]*】/g, '');

  // 공백 전부 제거 + 소문자화
  s = s.replace(/\s/g, '').toLowerCase();

  return s;
}
