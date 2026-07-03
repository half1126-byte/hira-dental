/**
 * hira-lookup.js
 * HIRA 병원정보서비스(getHospBasisList) 기관명 검색 — 공용 모듈
 * 의원급 포함 전체 요양기관 기본정보(주소·전화·좌표·ykiho) 조회 가능.
 * HIRA_API_KEY 환경변수 없으면 null 반환 (호출측에서 생략 처리).
 */

import { XMLParser } from 'fast-xml-parser';

// 병원정보서비스는 2자리 시도코드 사용
export const SIDO2 = { 서울: '11', 부산: '21', 인천: '22', 대구: '23', 광주: '24', 대전: '25', 울산: '26', 경기: '31', 강원: '32', 충북: '33', 충남: '34', 전북: '35', 전남: '36', 경북: '37', 경남: '38', 제주: '39', 세종: '41' };

/** 기관명으로 검색해 정확 일치(공백 무시) 우선으로 1건 반환. 키 없거나 미발견 시 null */
export async function searchHiraBasis(name, sido) {
  const KEY = process.env.HIRA_API_KEY;
  if (!KEY) return null;

  const params = new URLSearchParams({ yadmNm: name, numOfRows: '10', pageNo: '1' });
  if (SIDO2[sido]) params.set('sidoCd', SIDO2[sido]);

  const url = `https://apis.data.go.kr/B551182/hospInfoServicev2/getHospBasisList?serviceKey=${KEY}&${params}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HIRA API HTTP ${res.status}`);

  const parser = new XMLParser({ ignoreAttributes: false });
  const parsed = parser.parse(await res.text());
  const raw = parsed?.response?.body?.items?.item;
  if (!raw) return null;

  const items = Array.isArray(raw) ? raw : [raw];
  const norm = s => String(s ?? '').replace(/\s/g, '');
  return items.find(it => norm(it.yadmNm) === norm(name)) ?? items[0];
}

/** API 응답 → partners.json hira 필드 형태로 변환 */
export function toHiraField(item) {
  if (!item) return {};
  return {
    ykiho: String(item.ykiho ?? ''),
    clCdNm: String(item.clCdNm ?? ''),
    lat: item.YPos ? Number(item.YPos) : undefined,
    lng: item.XPos ? Number(item.XPos) : undefined,
    estbDd: String(item.estbDd ?? ''),
    matchedAt: new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10),
  };
}
