/**
 * gen-og.js
 * SVG → resvg → PNG 1200×630 OG 이미지 생성
 *
 * 산출물:
 *   assets/og-default.png          — 사이트 기본 카드
 *   assets/og/seoul.png            — 서울 지역 카드
 *   assets/og/gyeonggi.png         — 경기 지역 카드
 *   assets/og/busan.png            — 부산 지역 카드
 *   assets/og/incheon.png          — 인천 지역 카드
 *
 * 실행: node scripts/gen-og.js
 * build.js에서 import { generateOgImages } from './gen-og.js' 로 호출 가능
 *
 * 의료광고법: 카드 문구에 최고·1위·유일·완치·보장·100%·무통·최상급·명품 0건
 */

import { Resvg } from '@resvg/resvg-js';
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, '..');
const ASSETS = join(ROOT, 'assets');
const FONTS_DIR = join(ASSETS, 'fonts');
const OG_DIR = join(ASSETS, 'og');

// 폰트 경로 우선순위: 1) 커밋된 Pretendard Bold, 2) 시스템 맑은 고딕
const PRETENDARD_PATH = join(FONTS_DIR, 'Pretendard-Bold.ttf');
const SYSTEM_FONTS = [
  'C:/Windows/Fonts/malgunbd.ttf',   // 맑은 고딕 Bold
  'C:/Windows/Fonts/malgun.ttf',     // 맑은 고딕
  'C:/Windows/Fonts/gulim.ttc',      // 굴림
];

function resolveFont() {
  if (existsSync(PRETENDARD_PATH)) {
    return { path: PRETENDARD_PATH, family: 'Pretendard' };
  }
  for (const p of SYSTEM_FONTS) {
    if (existsSync(p)) {
      const family = p.includes('malgun') ? 'Malgun Gothic' : 'Gulim';
      return { path: p, family };
    }
  }
  return null;
}

/** W×630 SVG 문자열 생성 (1200×630) */
function makeSvg({ title, subtitle, accent = '#2563EB', font }) {
  const family = font?.family ?? 'sans-serif';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0F172A"/>
      <stop offset="100%" stop-color="#1E293B"/>
    </linearGradient>
    <linearGradient id="acc" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${accent}"/>
      <stop offset="100%" stop-color="#60A5FA"/>
    </linearGradient>
  </defs>

  <!-- 배경 -->
  <rect width="1200" height="630" fill="url(#bg)"/>

  <!-- 좌측 액센트 바 -->
  <rect x="64" y="160" width="6" height="120" rx="3" fill="url(#acc)"/>

  <!-- 사이트명 태그 -->
  <rect x="64" y="80" width="220" height="42" rx="8" fill="${accent}" opacity="0.15"/>
  <text x="84" y="109" font-family="${family}, sans-serif" font-size="22" font-weight="700" fill="${accent}">메디픽 MediPick</text>

  <!-- 메인 타이틀 -->
  <text x="88" y="230" font-family="${family}, sans-serif" font-size="58" font-weight="700" fill="#F8FAFC" letter-spacing="-1">${title}</text>

  <!-- 서브타이틀 -->
  <text x="88" y="310" font-family="${family}, sans-serif" font-size="32" font-weight="400" fill="#94A3B8">${subtitle}</text>

  <!-- 구분선 -->
  <rect x="64" y="380" width="1072" height="1" fill="#334155"/>

  <!-- 하단 정보 -->
  <text x="88" y="430" font-family="${family}, sans-serif" font-size="24" fill="#64748B">건강보험심사평가원(HIRA) 비급여 신고 데이터 기반</text>
  <text x="88" y="468" font-family="${family}, sans-serif" font-size="22" fill="#475569">전국 치과 비급여 가격 정보 공개 플랫폼</text>

  <!-- 우측 장식 원 -->
  <circle cx="1050" cy="315" r="180" fill="${accent}" opacity="0.04"/>
  <circle cx="1050" cy="315" r="110" fill="${accent}" opacity="0.06"/>
  <circle cx="1050" cy="315" r="55" fill="${accent}" opacity="0.10"/>

  <!-- URL 워터마크 -->
  <text x="1136" y="595" font-family="${family}, sans-serif" font-size="20" fill="#334155" text-anchor="end">xn--2z1bo3hsx1a.com</text>
</svg>`;
}

/** 지역별 SVG */
function makeSidoSvg({ sidoKr, font }) {
  const family = font?.family ?? 'sans-serif';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0F172A"/>
      <stop offset="100%" stop-color="#1E293B"/>
    </linearGradient>
    <linearGradient id="acc" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#2563EB"/>
      <stop offset="100%" stop-color="#60A5FA"/>
    </linearGradient>
  </defs>

  <!-- 배경 -->
  <rect width="1200" height="630" fill="url(#bg)"/>

  <!-- 좌측 액센트 바 -->
  <rect x="64" y="160" width="6" height="120" rx="3" fill="url(#acc)"/>

  <!-- 사이트명 태그 -->
  <rect x="64" y="80" width="220" height="42" rx="8" fill="#2563EB" opacity="0.15"/>
  <text x="84" y="109" font-family="${family}, sans-serif" font-size="22" font-weight="700" fill="#2563EB">메디픽 MediPick</text>

  <!-- 메인 타이틀 -->
  <text x="88" y="230" font-family="${family}, sans-serif" font-size="58" font-weight="700" fill="#F8FAFC" letter-spacing="-1">${sidoKr} 임플란트 가격 정보</text>

  <!-- 서브타이틀 -->
  <text x="88" y="310" font-family="${family}, sans-serif" font-size="32" font-weight="400" fill="#94A3B8">HIRA 신고 데이터 기준 · 치과별 비교</text>

  <!-- 구분선 -->
  <rect x="64" y="380" width="1072" height="1" fill="#334155"/>

  <!-- 하단 정보 -->
  <text x="88" y="430" font-family="${family}, sans-serif" font-size="24" fill="#64748B">건강보험심사평가원(HIRA) 비급여 신고 데이터 기반</text>
  <text x="88" y="468" font-family="${family}, sans-serif" font-size="22" fill="#475569">${sidoKr} 소재 치과 비급여 임플란트 가격 공개</text>

  <!-- 우측 장식 원 -->
  <circle cx="1050" cy="315" r="180" fill="#2563EB" opacity="0.04"/>
  <circle cx="1050" cy="315" r="110" fill="#2563EB" opacity="0.06"/>
  <circle cx="1050" cy="315" r="55" fill="#2563EB" opacity="0.10"/>

  <!-- URL 워터마크 -->
  <text x="1136" y="595" font-family="${family}, sans-serif" font-size="20" fill="#334155" text-anchor="end">xn--2z1bo3hsx1a.com</text>
</svg>`;
}

/** SVG 문자열 → PNG Buffer */
function svgToPng(svgStr, font) {
  const opts = { font: { loadSystemFonts: true } };
  if (font?.path && existsSync(font.path)) {
    opts.font.fontFiles = [font.path];
  }
  const resvg = new Resvg(svgStr, opts);
  return resvg.render().asPng();
}

/** 전체 OG 이미지 생성 (이미 존재하면 스킵) */
export async function generateOgImages({ force = false } = {}) {
  mkdirSync(ASSETS, { recursive: true });
  mkdirSync(OG_DIR, { recursive: true });
  mkdirSync(FONTS_DIR, { recursive: true });

  const font = resolveFont();
  if (font) {
    console.log(`  OG 폰트: ${font.path} (${font.family})`);
  } else {
    console.log('  OG 폰트: 시스템 기본 (sans-serif)');
  }

  // 기본 카드
  const defaultOut = join(ASSETS, 'og-default.png');
  if (force || !existsSync(defaultOut)) {
    const svg = makeSvg({
      title: '전국 치과 비급여 가격 정보',
      subtitle: 'HIRA 공공데이터 · 임플란트·크라운·스케일링',
      font,
    });
    const png = svgToPng(svg, font);
    writeFileSync(defaultOut, png);
    console.log(`  → assets/og-default.png (${(png.length / 1024).toFixed(0)}KB)`);
  } else {
    console.log(`  → assets/og-default.png (skip, exists)`);
  }

  // 지역별 카드
  const SIDOS = [
    { en: 'seoul',    kr: '서울' },
    { en: 'gyeonggi', kr: '경기' },
    { en: 'busan',   kr: '부산' },
    { en: 'incheon', kr: '인천' },
  ];

  for (const s of SIDOS) {
    const out = join(OG_DIR, `${s.en}.png`);
    if (force || !existsSync(out)) {
      const svg = makeSidoSvg({ sidoKr: s.kr, font });
      const png = svgToPng(svg, font);
      writeFileSync(out, png);
      console.log(`  → assets/og/${s.en}.png (${(png.length / 1024).toFixed(0)}KB)`);
    } else {
      console.log(`  → assets/og/${s.en}.png (skip, exists)`);
    }
  }
}

// 직접 실행 시 전체 생성 (node scripts/gen-og.js)
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  console.log('\n=== OG 이미지 생성 ===');
  generateOgImages({ force: true })
    .then(() => console.log('완료\n'))
    .catch(e => { console.error('오류:', e.message); process.exit(1); });
}
