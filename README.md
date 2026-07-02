# HIRA 치과 비급여 가격 비교 허브

건강보험심사평가원(HIRA) 공공데이터 기반 치과 임플란트 비급여 가격 비교 사이트.

**라이브:** https://half1126-byte.github.io/hira-dental/

---

## 구조

```
hira-dental/
├── scripts/
│   ├── fetch-hira.js      # HIRA API 호출 → data/*.json
│   ├── gen-pages.js       # 지역별 비교 페이지 생성
│   ├── gen-articles.js    # 시군구별 아티클 자동 생성 (65개)
│   ├── add-partner.js     # 거래처 등록 CLI (HIRA API 자동 조사)
│   ├── hira-lookup.js     # HIRA 병원정보 검색 공용 모듈
│   ├── enrich-partners.js # 빌드 시 거래처 HIRA 자동 보강 (CI Secret 키)
│   ├── gen-partners.js    # 거래처 프로필 페이지 생성
│   └── build.js           # 빌드 오케스트레이터
├── partners/
│   └── partners.json      # 거래처(제휴 치과) DB
├── clinics/               # 거래처 프로필 (빌드 결과, HTML + clinic.json)
├── dental/                # 지역별 비교 페이지 (빌드 결과)
│   ├── seoul-implant/
│   ├── gyeonggi-implant/
│   ├── busan-implant/
│   └── incheon-implant/
├── articles/              # 시군구별 아티클 (빌드 결과, 65개)
├── data/                  # HIRA API 원본 JSON (빌드 시 생성, git 제외)
├── docs/
│   └── GEO-PLAYBOOK.md    # AI 인용(GEO/AEO) 규칙 + 거래처 운영 플로우
├── .github/workflows/
│   └── build.yml          # 매일 KST 01:00 자동 빌드
├── index.html             # 메인 허브
├── style.css
└── article.css
```

## 거래처(제휴 치과) 시스템

AI 검색(GPT·Gemini·Claude·Perplexity·Grok)에서 인용되는 거래처 프로필을 자동 생성한다.
자세한 규칙·운영법은 [docs/GEO-PLAYBOOK.md](docs/GEO-PLAYBOOK.md) 참고.

### 원클릭 운영 (GitHub Actions)

**Actions 탭 → "Partner 원클릭 등록·해지" → Run workflow** 폼에서 버튼 하나로 처리:

| 작업 | 입력 | 결과 |
|------|------|------|
| `add` | 기관명 + 시도 (id는 자동생성 가능) | HIRA 자동 조사 → active 등록 → 커밋 → 빌드·배포 → `/clinics/<id>/` 노출 |
| `pause` | id | 계약 해지 — 해지일 기록, 페이지 자동 제거 |
| `activate` | id | 재활성화 — 페이지 재생성 |
| `remove` | id | DB 완전 삭제 |

CLI로도 동일 작업 가능:

```bash
# 1. 거래처 등록 (HIRA API에서 주소·전화·좌표 자동 조사 → status: paused)
npm run partner:add -- --name "OO치과의원" --sido 서울 --id gangnam-oo-dental

# 2. partners/partners.json에서 진료시간·가격·FAQ 보완 후 status를 "active"로 변경

# 3. 빌드 → /clinics/<id>/ 프로필 생성 + 지역 아티클 65곳 자동 링크 + sitemap 등록
npm run build

# 계약 해지 / 재활성화 / 삭제 / 목록
node scripts/set-partner.js --id <slug> --status paused
node scripts/set-partner.js --id <slug> --status active
node scripts/set-partner.js --id <slug> --remove
node scripts/set-partner.js --list
```

- 프로필: 답변우선 요약, Dentist·FAQPage JSON-LD, HIRA 신고가 자동 병합, 기계가독 `clinic.json`
- 로컬에 API 키가 없어도 됨: CI 빌드가 `HIRA_API_KEY` Secret으로 매일 거래처의 좌표·기관코드·주소를 자동 보강(3.4단계)
- 계약 종료 시 `status: "paused"` → 다음 빌드에서 페이지 자동 제거
- 의료광고법 금지어·제휴 고지 자동 검사 (위반 시 빌드 실패)

## 데이터 소스

| API | 용도 |
|-----|------|
| `getNonPaymentItemHospDtlList` | 치과병원(clCd=41) 비급여 임플란트 가격 |
| `getHospBasisList` | 치과 기관 기본정보 |

- sidoCd: 구 행정코드 체계 (서울=110000, 경기=310000, 부산=210000, 인천=220000)
- npayKorNm 파라미터는 API가 무시 → 클라이언트 키워드 필터 적용

## 생성 페이지

- 지역별 비교 페이지: 4개 (서울·경기·부산·인천)
- 시군구별 아티클: 65개
  - 서울 20개, 경기 27개, 부산 11개, 인천 7개

## 빌드

```bash
# 로컬 (Avast MITM 환경)
NODE_TLS_REJECT_UNAUTHORIZED=0 node --env-file=.env.local scripts/build.js

# .env.local (git 제외)
HIRA_API_KEY=<발급받은 Encoding 키>
```

GitHub Actions가 매일 자동으로 HIRA 데이터를 갱신하고 재배포합니다.

## 보안

- `HIRA_API_KEY`: GitHub Repository Secret으로만 관리 (코드 하드코딩 금지)
- 의료광고법 제56조 LAW_HARD 준수: 최고/1위/유일/완치/보장/100%/최상급 0건
- 배포 전 시크릿·광고법 자동 스캔 (build.js 5단계)
