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

// 시도코드 — HIRA API 구 행정코드 체계 (API 직접 조회로 검증)
// 신 행정코드(부산=26, 인천=28 등)와 다름. API 응답에서 실측.
export const SIDO = {
  서울: '110000',
  부산: '210000',
  인천: '220000',
  대구: '230000',
  광주: '240000',
  대전: '250000',
  울산: '260000',
  경기: '310000',
  강원: '320000',
  충북: '330000',
  충남: '340000',
  전북: '350000',
  전남: '360000',
  경북: '370000',
  경남: '380000',
  제주: '390000',
  세종: '410000',
};

// 시술별 메타 — 정의는 site-config.js (키 없이도 로드 가능한 중립 모듈)
export { PROCEDURES } from './site-config.js';

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

const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * HIRA API 호출 — 일시 장애(타임아웃·네트워크·5xx·서비스 오류 코드)는 최대 3회 재시도.
 * 2026-11-12 전국 확장 첫 빌드에서 병원정보서비스가 17개 시도 중 15곳에서 15초 타임아웃.
 */
async function fetchXml(url, { attempts = 3, timeoutMs = 30000 } = {}) {
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'HIRANopayBot/0.1 (public data aggregator)' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { fatal: true });
      const xml = await res.text();
      checkResultCode(xml);
      return xml;
    } catch (e) {
      lastErr = e;
      if (e.fatal || i === attempts) break;
      await sleep(i * 3000);
    }
  }
  throw new Error(`${lastErr?.message ?? lastErr} (${attempts}회 시도)`);
}

/**
 * 응답 헤더의 resultCode 확인. 정상(00/0/000)이 아니면 오류로 던진다.
 * 이 확인이 없으면 호출 한도 초과·서비스 오류 응답이 '데이터 0건'과 구분되지 않는다
 * (2026-11-12 광주가 0행으로 수집된 원인 후보).
 */
function checkResultCode(xml) {
  const code = /<resultCode>\s*([^<\s]+)\s*<\/resultCode>/.exec(xml)?.[1];
  const msg = /<resultMsg>\s*([^<]*)<\/resultMsg>/.exec(xml)?.[1]?.trim()
    ?? /<returnAuthMsg>\s*([^<]*)<\/returnAuthMsg>/.exec(xml)?.[1]?.trim();
  if (code && !['00', '0', '000'].includes(code)) throw new Error(`HIRA resultCode ${code}${msg ? ` (${msg})` : ''}`);
  if (!code && /<OpenAPI_ServiceResponse>|SERVICE_KEY|LIMITED_NUMBER/i.test(xml)) throw new Error(`HIRA 오류 응답: ${msg ?? xml.slice(0, 120)}`);
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
      if (totalCount === 0) {
        console.log(`  · ${sidoNm} clCd=${clCd}: API 정상 응답(resultCode 확인), 신고 항목 0건`);
        break;
      }

      const raw = body?.items?.item;
      if (!raw) break;

      const pageItems = Array.isArray(raw) ? raw : [raw];
      items.push(...pageItems);

      if (items.length >= totalCount) break;
      page++;
    } catch (e) {
      // 재시도 후에도 실패하면 빈 값·일부 값으로 통계를 내지 않도록 시도 단위로 실패시킨다
      // (build.js가 해당 시도만 건너뛰고 계속 진행)
      throw new Error(`${sidoNm} 비급여 ${page}페이지 수집 실패 — ${items.length}건까지 받음: ${e.message}`);
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
 * 중복 제거(요양기관명+주소) + curAmt 오름차순 정렬 헬퍼
 */
export function dedupeAndSort(items) {
  const seen = new Set();
  const deduped = items.filter(it => {
    const key = `${it.yadmNm}|${it.addr}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  deduped.sort((a, b) => Number(a.curAmt ?? 9999999) - Number(b.curAmt ?? 9999999));
  return deduped;
}

/**
 * 치과 임플란트 가격 조회 (치과병원, clCd=41)
 */
export async function fetchImplantPrices(sidoNm) {
  const items = await fetchNonPayItems(sidoNm, '41', ['임플란트']);
  return dedupeAndSort(items);
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

/**
 * 시도별 치과의원·치과병원 수 (병원정보서비스 totalCount, 1행만 요청)
 * - 비급여 가격 API는 치과병원만 제공하므로, 표본이 지역 치과 전체 중 얼마인지 밝히는 근거로 쓴다
 * - 시도코드 표기(6자리/2자리)를 둘 다 시도하고, 값이 비정상이면 null (페이지에 표시하지 않음)
 */
export async function fetchDentalCounts(sidoNm) {
  const sidoCd = SIDO[sidoNm];
  if (!sidoCd) throw new Error(`알 수 없는 시도명: ${sidoNm}`);
  async function count(code, clCd) {
    const params = new URLSearchParams({ sidoCd: code, clCd, numOfRows: '1', pageNo: '1' });
    const xml = await fetchXml(`${BASE_HOSP}/getHospBasisList?serviceKey=${KEY}&${params}`);
    const n = Number(parser.parse(xml)?.response?.body?.totalCount);
    return Number.isFinite(n) ? n : null;
  }
  for (const code of [sidoCd, sidoCd.slice(0, 2)]) {
    try {
      const clinic = await count(code, '51');   // 치과의원
      const hosp = await count(code, '41');     // 치과병원
      // 의원이 병원보다 많아야 정상 (clCd가 무시되면 두 값이 같게 나옴)
      if (clinic > 0 && hosp > 0 && clinic > hosp) {
        console.log(`  ✓ ${sidoNm} 치과 수(hospInfo): 치과의원 ${clinic}곳 · 치과병원 ${hosp}곳`);
        return { clinic, hosp, source: '건강보험심사평가원 병원정보서비스', checkedAt: new Date().toISOString() };
      }
    } catch (e) {
      console.warn(`  ⚠ ${sidoNm} 치과 수 조회 실패(sidoCd=${code}): ${e.message}`);
    }
  }
  console.warn(`  ⚠ ${sidoNm} 치과 수: 신뢰할 수 있는 값을 받지 못해 표시하지 않음`);
  return null;
}

// 주소·시도명으로 해당 시도 소속 여부 확인 (응답이 다른 시도·전국 값이면 걸러냄)
const SIDO_ADDR = {
  서울: /서울/, 부산: /부산/, 대구: /대구/, 인천: /인천/, 광주: /광주광역시|^광주/, 대전: /대전/, 울산: /울산/, 세종: /세종/,
  경기: /경기/, 강원: /강원/, 충북: /충청북|충북/, 충남: /충청남|충남/, 전북: /전라북|전북/, 전남: /전라남|전남/,
  경북: /경상북|경북/, 경남: /경상남|경남/, 제주: /제주/,
};

/**
 * 시도 내 치과의원(51)·치과병원(41) 전체 기본정보 (병원정보서비스, 페이지 수집)
 * - 시군구별 치과 현황 페이지의 원천 데이터
 * - 시도코드 6자리/2자리 중 '해당 시도 주소가 실제로 돌아오는' 쪽을 채택
 * - 다른 시도 기관이 섞이면 제거, 수집이 끝까지 안 되면 throw (일부 데이터로 통계를 내지 않음)
 */
export async function fetchDentalInstitutions(sidoNm, pageSize = 500) {
  const code6 = SIDO[sidoNm];
  const re = SIDO_ADDR[sidoNm];
  if (!code6 || !re) throw new Error(`알 수 없는 시도명: ${sidoNm}`);
  const inSido = it => re.test(`${it.sidoCdNm ?? ''} ${it.addr ?? ''}`);
  const num = v => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v));

  async function pageAll(code, clCd) {
    const items = [];
    let total = null;
    for (let page = 1; page <= 60; page++) {
      const params = new URLSearchParams({ sidoCd: code, clCd, numOfRows: String(pageSize), pageNo: String(page) });
      const xml = await fetchXml(`${BASE_HOSP}/getHospBasisList?serviceKey=${KEY}&${params}`, { timeoutMs: 60000 });
      const body = parser.parse(xml)?.response?.body;
      total = Number(body?.totalCount ?? 0);
      const raw = body?.items?.item;
      if (!raw) break;
      items.push(...(Array.isArray(raw) ? raw : [raw]));
      if (items.length >= total) break;
    }
    return { total, items };
  }

  const out = [];
  for (const [clCd, clNm] of [['51', '치과의원'], ['41', '치과병원']]) {
    let got = null;
    for (const code of [code6, code6.slice(0, 2)]) {
      try {
        const r = await pageAll(code, clCd);
        // 치과병원은 실제로 0곳인 시도가 있음(광주). 치과의원은 0이면 잘못된 조회로 본다
        if (r.total === 0 && clCd === '41') { got = r; break; }
        if (r.total > 0 && r.items.length && r.items.slice(0, 20).every(inSido)) { got = r; break; }
      } catch (e) {
        console.warn(`  ⚠ ${sidoNm} ${clNm} 목록 조회 실패(sidoCd=${code}): ${e.message}`);
      }
    }
    if (!got) throw new Error(`${sidoNm} ${clNm} 목록을 신뢰할 수 있게 받지 못함`);
    if (got.items.length < got.total) throw new Error(`${sidoNm} ${clNm} 목록 일부만 수집 (${got.items.length}/${got.total})`);
    for (const it of got.items) {
      if (!inSido(it)) continue;
      const dety = ['detyGdrCnt', 'detyIntnCnt', 'detyResdntCnt', 'detySdrCnt'].map(k => num(it[k]));
      out.push({
        name: String(it.yadmNm ?? '').trim(),
        cl: clNm,
        sggu: String(it.sgguCdNm ?? '').trim(),
        dong: String(it.emdongNm ?? '').trim(),
        addr: String(it.addr ?? '').trim(),
        tel: String(it.telno ?? '').trim(),
        estb: String(it.estbDd ?? '').trim(),
        dentists: dety.every(v => v == null) ? null : dety.reduce((a, b) => a + (b ?? 0), 0),
        specialists: num(it.detySdrCnt),
      });
    }
  }
  console.log(`  ✓ ${sidoNm} 치과 기관 목록: ${out.length}곳 (치과의원 ${out.filter(x => x.cl === '치과의원').length} · 치과병원 ${out.filter(x => x.cl === '치과병원').length})`);
  return out;
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
