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
│   └── build.js           # 빌드 오케스트레이터
├── dental/                # 지역별 비교 페이지 (빌드 결과)
│   ├── seoul-implant/
│   ├── gyeonggi-implant/
│   ├── busan-implant/
│   └── incheon-implant/
├── articles/              # 시군구별 아티클 (빌드 결과, 65개)
├── data/                  # HIRA API 원본 JSON (빌드 시 생성, git 제외)
├── .github/workflows/
│   └── build.yml          # 매일 KST 01:00 자동 빌드
├── index.html             # 메인 허브
├── style.css
└── article.css
```

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
