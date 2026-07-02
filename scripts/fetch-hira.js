/**
 * fetch-hira.js
 * HIRA 공공 API → data/*.json 생성
 *
 * [확인된 사실]
 * - npayKorNm 파라미터: API가 무시함 → 클라이언트 필터 사용
 * - sidoCd 형식: 6자리 (서울=110000, 경기=410000 등)
 * - 의원급(치과의원/한의원/피부과의원) 데이터: 이 API에 없음 (병원급만)
 *
 * 활용 가능 clCd:
 *   11=종합병원, 21=병원, 29=정신병원, 41=치과병원, 92=한방병원
 *
 * HIRA_API_KEY: 환경변수에서만 읽음 (코드 하드코딩 금지)
 */

import { XMLParser } from 'fast-xml-parser';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dir, '../data');
mkdirSync(DATA_DIR, { recursive: true });

const KEY = process.env.HIRA_API_KEY;
if (!KEY) throw new Error('HIRA_API_KEY 환경변수 없음. .env.local 확인');

const BASE_NONPAY = 'https://apis.data.go.kr/B551182/nonPaymentDamtInfoService';
const BASE_HOSP   = 'https://apis.data.go.kr/B551182/hospInfoServicev2';

const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: true });

// 시도코드 (6자리 형식 — API 검증 완료)
export const SIDO = {
  서울: '110000',
  부산: '260000',
  대구: '270000',
  인천: '280000',
  광주: '290000',
  대전: '300000',
  울산: '310000',
  세종: '360000',
  경기: '410000',
  강원: '420000',
  충북: '430000',
  충남: '440000',
  전북: '450000',
  전남: '460000',
  경북: '470000',
  경남: '480000',
  제주: '500000',
};

// 진료과별 clCd + 항목 키워드 매핑
export const SPECIALTIES = {
  dental: {
    label: '치과',
    clCds: ['41'],           // 치과병원 (치과의원은 이 API에 없음)
    keywords: ['임플란트', '크라운', '라미네이트', '치과'],
    implantKeywords: ['임플란트'],
  },
  korean_medicine: {
    label: '한방',
    clCds: ['92'],           // 한방병원
    keywords: ['추나', '한약', '침', '봉침', '한방'],
    implantKeywords: ['추나요법'],
  },
  hospital: {
    label: '종합병원',
    clCds: ['11'],           // 종합병원 (피부과·정형외과 비급여 포함)
    keywords: ['보톡스', '도수치료', '체외충격파', '필러', '레이저', '라식', '라섹'],
    implantKeywords: ['도수치료'],
  },
};

async function fetchXml(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'HIRANopayBot/0.1 (public data aggregator)' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url.slice(0, 80)}`);
  return res.text();
}

/**
 * 비급여 데이터 조회 (clCd + sidoCd 기반)
 * npayKorNm 파라미터는 API가 무시 → 클라이언트 키워드 필터 사용
 */
export async function fetchNonPayItems(sidoNm, clCd, keywords = [], maxRows = 2000) {
  const sidoCd = SIDO[sidoNm];
  if (!sidoCd) throw new Error(`알 수 없는 시도명: ${sidoNm}`);

  const items = [];
  let page = 1;

  while (items.length < maxRows) {
    const params = new URLSearchParams({
      sidoCd,
      clCd,
      numOfRows: '100',
      pageNo: String(page),
    });
    const url = `${BASE_NONPAY}/getNonPaymentItemHospDtlList?serviceKey=${KEY}&${params}`;

    try {
      const xml = await fetchXml(url);
      const parsed = parser.parse(xml);
      const body = parsed?.response?.body;
      if (!body) break;

      const totalCount = Number(body.totalCount ?? 0);
      if (totalCount === 0) break;

      const raw = body?.items?.item;
      if (!raw) break;

      const pageItems = Array.isArray(raw) ? raw : [raw];
      items.push(...pageItems);

      if (items.length >= totalCount) break;
      page++;
    } catch (e) {
      console.warn(`  ⚠ 페이지 ${page} 오류 (clCd=${clCd}):`, e.message);
      break;
    }
  }

  // 키워드 필터 (클라이언트 사이드)
  const filtered = keywords.length > 0
    ? items.filter(it => keywords.some(kw => String(it.npayKorNm ?? '').includes(kw)))
    : items;

  console.log(`  ✓ ${sidoNm} clCd=${clCd}: 전체 ${items.length}건 → 키워드 필터 후 ${filtered.length}건`);
  return filtered;
}

/**
 * 치과 임플란트 가격 조회 (치과병원, clCd=41)
 */
export async function fetchImplantPrices(sidoNm) {
  const items = await fetchNonPayItems(sidoNm, '41', ['임플란트']);

  // 중복 제거 (요양기관명+주소)
  const seen = new Set();
  const deduped = items.filter(it => {
    const key = `${it.yadmNm}|${it.addr}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // 현재가 오름차순
  deduped.sort((a, b) => Number(a.curAmt ?? 9999999) - Number(b.curAmt ?? 9999999));
  return deduped;
}

/**
 * 진료과별 비급여 조회
 */
export async function fetchBySpecialty(sidoNm, specialtyKey) {
  const spec = SPECIALTIES[specialtyKey];
  if (!spec) throw new Error(`알 수 없는 진료과: ${specialtyKey}`);

  const allItems = [];
  for (const clCd of spec.clCds) {
    const items = await fetchNonPayItems(sidoNm, clCd, spec.keywords);
    allItems.push(...items);
  }

  // 중복 제거 (기관명+항목명)
  const seen = new Set();
  const deduped = allItems.filter(it => {
    const key = `${it.yadmNm}|${it.npayKorNm}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  deduped.sort((a, b) => Number(a.curAmt ?? 9999999) - Number(b.curAmt ?? 9999999));
  return deduped;
}

/**
 * 전국 통계 조회 (항목별 평균)
 */
export async function fetchNationwideStats(maxPages = 10) {
  const items = [];
  for (let pg = 1; pg <= maxPages; pg++) {
    const params = new URLSearchParams({ numOfRows: '100', pageNo: String(pg) });
    const url = `${BASE_NONPAY}/getNonPaymentItemClcdList?serviceKey=${KEY}&${params}`;
    try {
      const xml = await fetchXml(url);
      const parsed = parser.parse(xml);
      const raw = parsed?.response?.body?.items?.item;
      if (!raw) break;
      const pageItems = Array.isArray(raw) ? raw : [raw];
      items.push(...pageItems);
      if (pageItems.length < 100) break;
    } catch (e) {
      console.warn(`  ⚠ 통계 페이지 ${pg} 오류:`, e.message);
      break;
    }
  }
  console.log(`  ✓ 전국 통계: ${items.length}건`);
  return items;
}

/**
 * 치과 기본 목록 (병원정보서비스, dgsbjtCd=49)
 */
export async function fetchDentalHospList(sidoNm, maxRows = 200) {
  const sidoCd = SIDO[sidoNm];
  if (!sidoCd) throw new Error(`알 수 없는 시도명: ${sidoNm}`);

  // 병원정보서비스는 2자리 시도코드 사용 (다른 API)
  const sidoCd2 = sidoCd.slice(0, 2);
  const params = new URLSearchParams({
    sidoCd: sidoCd2,
    dgsbjtCd: '49',   // 치과
    numOfRows: String(maxRows),
    pageNo: '1',
  });
  const url = `${BASE_HOSP}/getHospBasisList?serviceKey=${KEY}&${params}`;
  try {
    const xml = await fetchXml(url);
    const parsed = parser.parse(xml);
    const raw = parsed?.response?.body?.items?.item;
    if (!raw) return [];
    const items = Array.isArray(raw) ? raw : [raw];
    console.log(`  ✓ ${sidoNm} 치과목록(hospInfo): ${items.length}건`);
    return items;
  } catch (e) {
    console.warn(`  ⚠ 치과목록 조회 실패:`, e.message);
    return [];
  }
}

// --- 메인 실행 ---
if (process.argv[1].endsWith('fetch-hira.js')) {
  const TARGETS = ['서울', '경기'];

  for (const sido of TARGETS) {
    console.log(`\n[${sido}] 데이터 수집 중...`);
    const key = sido === '서울' ? 'seoul'
      : sido === '경기' ? 'gyeonggi'
      : sido.toLowerCase().replace(/[^a-z]/g, '');

    const prices = await fetchImplantPrices(sido);
    writeFileSync(
      join(DATA_DIR, `${key}-implant.json`),
      JSON.stringify({ sido, fetchedAt: new Date().toISOString(), prices }, null, 2),
    );
    console.log(`  → data/${key}-implant.json 저장 (${prices.length}건)`);
  }

  console.log('\n✅ fetch-hira.js 완료');
}
