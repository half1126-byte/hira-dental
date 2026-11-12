/**
 * gen-chart.js
 * 지역 아티클용 가격 분포 차트 PNG (1200×630, 이미지 검색·OG 카드 겸용)
 *
 * - 기관명은 넣지 않는다: 이미지가 단독으로 퍼져도 특정 치과 비교 광고로 읽히지 않게 함
 * - 막대 = 기관별 신고가(낮은 순), 점선 = 중앙값, 하단에 출처·기준월
 */
import { Resvg } from '@resvg/resvg-js';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FONT = join(ROOT, 'assets', 'fonts', 'Pretendard-Bold.ttf');
export const CHART_DIR = join(ROOT, 'assets', 'charts');

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const man = n => n >= 100000 ? `${Math.round(n / 10000).toLocaleString('ko-KR')}만원` : `${(n / 10000).toFixed(1).replace(/\.0$/, '')}만원`;

function svg({ title, subtitle, values, median, source }) {
  const W = 1200, H = 630, L = 110, R = 60, T = 150, B = 120;
  const sorted = [...values].sort((a, b) => a - b);
  // 축 눈금을 1·2·5 × 10^n 단위로 맞춰 '202만원' 같은 어색한 값 방지
  const rough = (Math.max(...sorted) * 1.1) / 4;
  const p10 = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map(m => m * p10).find(v => v >= rough);
  const max = step * 4;
  const cw = W - L - R, ch = H - T - B;
  const gap = 10;
  const bw = Math.max(8, Math.min(90, (cw - gap * (sorted.length - 1)) / sorted.length));
  const total = bw * sorted.length + gap * (sorted.length - 1);
  const x0 = L + (cw - total) / 2;
  const y = v => T + ch - (v / max) * ch;
  const bars = sorted.map((v, i) => {
    const x = x0 + i * (bw + gap);
    const label = sorted.length <= 14
      ? `<text x="${x + bw / 2}" y="${y(v) - 10}" font-size="18" fill="#334155" text-anchor="middle">${man(v)}</text>` : '';
    return `<rect x="${x}" y="${y(v)}" width="${bw}" height="${T + ch - y(v)}" rx="6" fill="#3B82F6"/>${label}`;
  }).join('');
  const ticks = [0, 1, 2, 3, 4].map(k => {
    const v = step * k;
    return `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="#E2E8F0"/>` +
      `<text x="${L - 12}" y="${y(v) + 6}" font-size="17" fill="#64748B" text-anchor="end">${man(v)}</text>`;
  }).join('');
  const my = y(median);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#FFFFFF"/>
  <text x="${L}" y="62" font-size="38" font-weight="700" fill="#0F172A">${esc(title)}</text>
  <text x="${L}" y="104" font-size="22" fill="#475569">${esc(subtitle)}</text>
  ${ticks}${bars}
  <line x1="${L}" x2="${W - R}" y1="${my}" y2="${my}" stroke="#F97316" stroke-width="3" stroke-dasharray="10 8"/>
  <text x="${W - R}" y="${my - 10}" font-size="20" fill="#C2410C" text-anchor="end">중앙값 ${man(median)}</text>
  <text x="${L}" y="${H - 50}" font-size="18" fill="#64748B">막대 하나 = 치과병원 1곳의 신고가 (낮은 순, 기관명 비표시)</text>
  <text x="${L}" y="${H - 22}" font-size="18" fill="#64748B">${esc(source)}</text>
</svg>`;
}

/** 차트 PNG 저장 → 사이트 상대경로 반환 (값이 3개 미만이면 null) */
export function renderPriceChart({ slug, title, subtitle, values, median, source }) {
  const vals = values.map(Number).filter(n => n > 0);
  if (vals.length < 3) return null;
  mkdirSync(CHART_DIR, { recursive: true });
  const opts = { font: { loadSystemFonts: true, defaultFontFamily: 'Pretendard' } };
  if (existsSync(FONT)) opts.font.fontFiles = [FONT];
  const png = new Resvg(svg({ title, subtitle, values: vals, median, source }), opts).render().asPng();
  writeFileSync(join(CHART_DIR, `${slug}.png`), png);
  return `/assets/charts/${slug}.png`;
}
