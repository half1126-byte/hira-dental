/**
 * area-util.js
 * 동(洞)·역세권 공용 유틸 — 한글 로마자 슬러그, 거래처 areas 감지, 표시명 규칙
 * gen-local.js(페이지 생성)와 gen-partners.js(프로필 내부 링크)가 공유한다.
 */

export const SIDO_EN = { 서울: 'seoul', 경기: 'gyeonggi', 부산: 'busan', 인천: 'incheon', 대구: 'daegu', 광주: 'gwangju', 대전: 'daejeon', 울산: 'ulsan', 강원: 'gangwon', 충북: 'chungbuk', 충남: 'chungnam', 전북: 'jeonbuk', 전남: 'jeonnam', 경북: 'gyeongbuk', 경남: 'gyeongnam', 제주: 'jeju', 세종: 'sejong' };

// ── 한글 → 로마자 슬러그 (국어의 로마자 표기법 기반, 슬러그 용도 단순화) ──
const CHO = ['g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's', 'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h'];
const JUNG = ['a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa', 'wae', 'oe', 'yo', 'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i'];
// 종성은 로마자 표기법 대표음(받침 ㄱ→k, ㄷ계열→t, ㅂ→p)으로 단순화
const JONG = ['', 'k', 'k', 'k', 'n', 'n', 'n', 't', 'l', 'k', 'm', 'l', 'l', 'l', 'p', 'l', 'm', 'p', 'p', 't', 't', 'ng', 't', 't', 'k', 't', 'p', 't'];

export function romanize(str) {
  let out = '';
  for (const ch of String(str)) {
    const code = ch.codePointAt(0);
    if (code >= 0xac00 && code <= 0xd7a3) {
      const idx = code - 0xac00;
      out += CHO[Math.floor(idx / 588)] + JUNG[Math.floor((idx % 588) / 28)] + JONG[idx % 28];
    } else if (/[a-zA-Z0-9]/.test(ch)) {
      out += ch.toLowerCase();
    } else if (/[\s·-]/.test(ch)) {
      out += '-';
    }
  }
  return out.replace(/lr/g, 'll').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

// 경기도 통합시(구가 있는 시) — sgguNm에서 시 이름 추출용
const GYEONGGI_CITY = /^(고양|부천|성남|수원|안산|안양|용인)/;

/** 표시용 지역 접두: 서울 둔촌동 / 부천 중동 / 인천 계산동 */
export function cityPrefix(p) {
  if (p.sido === '경기') {
    const m = String(p.sgguNm ?? '').match(GYEONGGI_CITY);
    return m ? m[1] : p.sido;
  }
  return p.sido;
}

/**
 * 거래처의 동·역 목록 추출.
 * 1순위: partners.json의 areas 필드 [{label, type: 'dong'|'station'|'landmark'}]
 * 2순위: 주소 괄호 안 동 이름 + features의 "○○역" 자동 감지
 */
export function detectAreas(p) {
  if (Array.isArray(p.areas) && p.areas.length) return p.areas;
  const areas = [];
  const dongM = String(p.addr ?? '').match(/\(([가-힣0-9]{1,8}동)\)/) || String(p.addr ?? '').match(/\s([가-힣]{1,6}동)\s/);
  if (dongM) areas.push({ label: dongM[1], type: 'dong' });
  for (const f of p.features ?? []) {
    const stM = String(f).match(/([가-힣0-9]{2,10}역)(?=\s|\d|,|·|$|\()/);
    if (stM && !areas.some(a => a.label === stM[1])) areas.push({ label: stM[1], type: 'station' });
  }
  return areas;
}

/** 동·역 페이지 슬러그와 표시명 — "둔촌동역 치과"는 역명 그대로, 동·랜드마크는 도시 접두 */
export function areaSlugLabel(area, p) {
  const label = area.type === 'station' ? area.label : `${cityPrefix(p)} ${area.label}`;
  const slug = `${SIDO_EN[p.sido] ?? 'kr'}-${romanize(area.label)}`;
  return { slug, label };
}
