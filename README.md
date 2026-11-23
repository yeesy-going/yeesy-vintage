# Yeesy's Vintage Chart

Wine Enthusiast, Wine Advocate, Wine Spectator의 공개 빈티지 차트를 모아 같은 눈금으로 맞춘 뒤 평균한 산지별 빈티지 점수표입니다. 원래 엑셀로 손으로 하던 작업을 자동화했습니다.

## 실행

```bash
npm install
npx playwright install chromium   # Wine Advocate 수집에 필요 (처음 한 번)
npm run update                    # 수집 + 차트 생성
npm run serve                     # http://localhost:8080 에서 확인
npm test
```

| 명령 | 하는 일 |
|---|---|
| `npm run collect` | 세 평론지 차트를 `data/raw/`에 저장합니다. 점수가 바뀐 경우에만 파일을 고치고, 바뀐 내용은 `data/changes.json`에 쌓습니다. `npm run collect -- we`처럼 한 곳만 받을 수도 있습니다. |
| `npm run build` | `data/raw/`와 `config/regions.json`으로 `web/data/chart.json`을 만듭니다. |
| `npm run serve` | `web/` 폴더를 로컬에서 띄웁니다. `web/`은 빌드 과정이 없는 정적 페이지입니다. |

## 점수 계산

산지마다 다음을 수행합니다 (`src/score.js`).

1. **하위 산지 평균**: 평론지가 산지를 더 잘게 나눠 놓았으면 하위 점수를 평균해 상위 산지 점수로 씁니다. 예: Wine Advocate의 좌안 = St-Julien/Pauillac/St-Estèphe, Margaux, Graves/Pessac-Léognan의 평균.
2. **눈금 맞추기**: `보정 점수 = 전체평균 + (점수 − 평론지평균) × (전체표준편차 ÷ 평론지표준편차)`. 평균과 표준편차는 `startYear`부터 최신 빈티지까지의 구간에서 계산합니다.
3. **평균**: 그 해를 평가한 평론지의 보정 점수를 평균합니다.
4. **순위**: 평론지 수에 따라 다르게 취급합니다.

| 상태 | 조건 | 순위 |
|---|---|---|
| 전원 평가 | 그 산지를 다루는 평론지가 모두 평가 | 포함 |
| 1곳 빠짐 | 한 곳만 빠졌고 두 곳 이상 평가 | 포함, 표시 |
| 잠정 | 그보다 적음 (보통 한 곳만 평가) | 제외, 점수만 표시 |

구간에 새 빈티지가 추가되거나 평론지가 과거 점수를 고치면 평균과 표준편차가 달라지므로 과거 연도의 점수도 조금씩 움직입니다.

## 산지 추가·수정

`config/regions.json`에서 산지마다 평론지별 출처 항목을 지정합니다. 항목 이름은 `data/raw/*.json`의 키와 같아야 하고, 없는 이름을 쓰면 `npm run build`가 어떤 항목이 없는지 알려주며 실패합니다. 평론지가 한 산지를 다루지 않으면 그 평론지를 빼면 됩니다 (예: Amarone은 Wine Spectator 없음).

## 점수 읽는 규칙

- `93I`처럼 숙성도 문자가 붙은 값은 숫자만 씁니다.
- `90-92R` 같은 범위는 중간값(91)으로 씁니다.
- `NT`, `NV`, `NR`, 빈칸은 평가 없음으로 봅니다.

## 자동 갱신

`.github/workflows/update.yml`이 매주 월요일에 수집과 빌드를 돌리고, 점수가 바뀌었으면 커밋합니다. 예약 실행은 기본 브랜치에 병합된 뒤부터 동작합니다.
