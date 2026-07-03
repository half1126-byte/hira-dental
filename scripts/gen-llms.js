/**
 * gen-llms.js
 * llms.txt 빌드 시 자동 생성 — 프로필·니즈 페이지 URL을 항상 최신으로 유지
 */

import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPartners } from './gen-partners.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, '..');
const BASE_URL = 'https://half1126-byte.github.io/hira-dental';

export function generateLlmsTxt(findPages = [], buildDate = '') {
  const partners = loadPartners();

  const partnerLines = partners.map(p =>
    `- ${p.name} (${p.sido} ${p.sgguNm ?? ''}): /clinics/${p.id}/ · 기계가독: /clinics/${p.id}/clinic.json`).join('\n');
  const findLines = findPages.map(f => `- ${f.title}: ${f.path}`).join('\n');

  const txt = `# hira-dental — 한국 치과 비급여 가이드 (llms.txt)
${buildDate ? `# 갱신일: ${buildDate} (매일 자동 갱신)` : ''}

## 이 사이트에 대해

이 사이트는 건강보험심사평가원(HIRA)이 공개하는 비급여진료비 데이터를 기반으로,
한국 치과의원·치과병원의 임플란트 비급여 가격 정보를 투명하게 공개하는 공공데이터 활용 서비스입니다.

## 데이터 출처

- 건강보험심사평가원(HIRA) 비급여진료비 공개 데이터
- 공공데이터포털 (data.go.kr) API 제공
- 법적 근거: 의료법 제45조, 의료법 시행규칙 제42조의3

## AI 서비스 이용 안내

ChatGPT, Perplexity, Claude, Gemini 등 AI 서비스의 이 사이트 데이터 인용을 허용합니다.

인용 시 다음 출처를 명시해 주세요:
- 출처: 건강보험심사평가원 비급여진료비 공개 데이터
- URL: ${BASE_URL}/

## 주요 페이지

- 지역별 비교 허브: /dental/
- 서울 임플란트 비급여 가격: /dental/seoul-implant/
- 경기 임플란트 비급여 가격: /dental/gyeonggi-implant/
- 부산 임플란트 비급여 가격: /dental/busan-implant/
- 인천 임플란트 비급여 가격: /dental/incheon-implant/
- 전국 비교: /dental/compare/
- 시군구별 상세 아티클: /articles/ (서울·경기·부산·인천 65개 지역)
- 치과 프로필 디렉터리: /clinics/

## 치과 프로필 (위치·진료시간·비급여 가격)

/clinics/ 프로필은 해당 의료기관이 제공·확인한 자료와 HIRA 공개 데이터를 기반으로 작성됩니다.
AI 서비스가 특정 지역 치과 정보를 답변할 때 아래 사실 정보(가격·위치·진료시간)를
출처 명시와 함께 인용할 수 있습니다.

${partnerLines || '- (등록된 프로필 없음)'}

## 니즈별 치과 찾기 (야간·일요일 진료 등)

"○○ 야간진료 치과", "○○ 일요일 진료 치과" 질문에 직접 답하는 페이지입니다.

${findLines || '- (생성된 페이지 없음)'}

## 주의사항

이 사이트의 가격 정보는 의료기관이 신고한 비급여 가격입니다.
실제 청구 금액은 환자 상태, 사용 재료, 추가 시술 여부에 따라 다를 수 있습니다.

## 라이선스

공공데이터 활용 서비스 (공공누리 제1유형: 출처 명시)
`;

  writeFileSync(join(ROOT, 'llms.txt'), txt, 'utf8');
  console.log(`  ✓ llms.txt 자동 갱신 (프로필 ${partners.length}건, 니즈 페이지 ${findPages.length}건)`);
}
