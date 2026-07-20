# 탭탭! 개발자 가이드

## 1. 프로젝트 한눈에 보기

`탭탭!`은 React + Vite로 만든 방치형 클릭 게임이다. 한 번의 탭으로 포인트를 얻고, 포인트를 코인으로 바꿔 생산 수단을 구매한다. 환생, 세대 연구, 보물·방해꾼 이벤트, 적금, 설계도로 장기 성장을 만든다.

| 구분 | 사용 기술 | 역할 |
| --- | --- | --- |
| 화면·게임 로직 | React / TypeScript | `src/App.tsx` 한 파일에서 상태와 화면을 관리 |
| 스타일 | CSS | `src/App.css` |
| 저장 | Supabase Auth + Postgres | 익명 사용자별 `game_states` 행 저장 |
| 웹 배포 | Vercel | `npm run build:web` 결과인 `dist` 배포 |
| 앱인토스 빌드 | Granite / AIT | `npm run build`로 `.ait` 패키지 생성 |
| 설치형 웹앱 | vite-plugin-pwa | 오프라인 셸과 앱 설치 지원 |

중요 파일은 다음과 같다.

```text
src/App.tsx             게임 규칙, 상태, 화면, 저장 호출
src/App.css             게임 화면과 바텀시트 UI
src/lib/supabase.ts     Supabase 클라이언트 생성
supabase/schema.sql     테이블, 컬럼, RLS 정책
vite.config.ts          PWA 설정
vercel.json             Vercel 웹 빌드 설정
```

## 2. 로컬 실행과 빌드

```bash
npm install
npm run dev       # Granite 개발 서버
npm run lint      # ESLint
npm run build:web # Vercel/PWA용 웹 빌드
npm run build     # 앱인토스 AIT 빌드
```

`8081` 포트가 이미 사용 중이면 기존 개발 서버를 종료하거나 해당 프로세스를 확인한 뒤 다시 실행한다.

```bash
lsof -nP -iTCP:8081 -sTCP:LISTEN
kill <PID>
```

## 3. 환경 변수와 Supabase 연결

프로젝트 최상단 `.env.local`에 아래 값을 둔다. `.env.local`은 Git에 올리지 않는다.

```env
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable-key>
```

Vercel에도 같은 이름의 환경 변수를 `Production`과 `Preview`에 등록한다. Publishable/anon key는 브라우저에 노출되는 공개용 키다. `service_role` 키는 절대 클라이언트나 Vercel의 `VITE_` 변수에 넣지 않는다.

초기 설정 또는 스키마 변경 뒤에는 Supabase SQL Editor에서 `supabase/schema.sql` 전체를 실행한다. 이 SQL은 `game_states`, `rebirth_history`, 필요한 컬럼, RLS 정책을 멱등적으로 만든다.

인증은 `signInAnonymously()`를 사용한다. Supabase Dashboard의 **Authentication → Sign In / Providers**에서 **Allow anonymous sign-ins**가 켜져 있어야 한다. 사용자는 브라우저/앱 설치본의 익명 세션 단위로 저장된다. 다른 기기나 브라우저로 자동 이전되지는 않는다.

## 4. 저장 흐름

1. 앱 시작 시 기존 세션을 찾고, 없으면 익명 세션을 만든다.
2. `game_states`에서 해당 `user_id` 상태를 읽는다.
3. 마지막 접속 시각과 현재 시각 차이로 최대 8시간의 오프라인 보상을 계산한다.
4. 10초마다, 화면 이탈 시, 탭이 백그라운드로 갈 때 현재 상태를 upsert한다.

`gameStateRef`는 비동기 저장 함수가 오래된 React state를 잡지 않도록 하는 현재 상태 스냅샷이다. 신규 상태를 추가할 때는 반드시 다음 네 곳을 함께 수정한다.

1. `useState`
2. `gameStateRef` 초기값과 갱신 `useEffect`
3. `loadGame`의 읽기·기본값 처리
4. `saveGame`의 upsert 및 `supabase/schema.sql`

이 중 하나라도 빠지면 새 기능이 새로고침 또는 환생 후 사라질 수 있다.

## 5. 게임 규칙 요약

### 기본 재화

- 탭: `activeTapPower`만큼 포인트를 얻는다.
- 환전: 포인트 10점마다 코인 1개를 얻는다.
- 코인: 탭, 작업자, 보호막, 환생 구매에 사용한다.
- 표기: 1,000 이상은 K / M / B 단위로 축약한다.

### 생산과 작업자

| 수단 | 해금 조건 | 기본 효과 |
| --- | --- | --- |
| 자동 탭퍼 | 즉시 | 1명당 `autoTapPower`/s |
| 탭 작업대 | 자동 탭퍼 10명 | 자동 탭퍼 전체 생산에 작업대당 +5% |
| 탭 공장 | 작업대 5개 | 공장당 +20/s |
| 탭 연구소 | 공장 3개 | 연구소당 +80/s, 자동 생산 3배 보물 해금 |
| 수호 작업자 | 즉시 | 방해꾼 약탈 비율 감소 |

자동 탭퍼·작업대·공장·연구소는 보유 수가 10/25/50일 때마다 각각 ×2 마일스톤을 받는다. 최종 생산에는 환생 보너스, 세대 연구, 직접 탭 업적 보너스, 일시 버프가 곱해진다.

### 이벤트

- 보물은 첫 등장 60~90초 후, 이후 120~180초 간격으로 생성된다.
- 보물 보상은 탭 2배(15초), 탭 10배(5초), 자동 생산 3배(10초, 연구소 필요), 행운의 보물 중 하나다.
- 행운의 보물 보상은 현재 탭·자동 생산 기준이며, 적금 금액에 따른 추가 보상이 붙는다.
- 방해꾼은 10초마다 점수 구간에 따라 1~5마리 나타나 탭 버튼 가장자리로 접근한다. 도착 전 처치하면 코인을 얻는다.
- `축적 방해꾼`은 등장 즉시 일부 포인트를 보관하고, 처치하면 보관분의 120%를 돌려준다. 일반 방해꾼은 도착 시 점수를 약탈한다.
- 보호막은 일반 방해꾼의 약탈을 1회 막는다.

### 적금·환생·세대 연구

- 적금은 현재 포인트의 절반을 넣는다. 원금은 환생 후에도 남고, 행운의 보물 추가 보상을 키운다.
- 환생 비용은 `(환생 횟수 + 1) × 1,000 코인`이다.
- 환생은 포인트, 코인, 탭·작업자·작업대·공장·연구소 강화, 보호막, 진행 중 이벤트를 초기화한다.
- 환생마다 전체 탭·자동 생산에 +5%가 붙는다.
- 누적 포인트에서 기억을 얻고, 기억으로 전체 생산·오프라인 보상·처치 보상·보물 대기·시작 코인·적금 보상·업적 보너스를 영구 강화한다.
- 기억 총량은 현재 `floor(cuberoot(lifetimePoints / 10,000,000))`이다. 이 수식은 장기 밸런스의 핵심 값이다.

### 설계도

- 24시간마다 1개를 얻고, 최대 3개까지만 보관한다.
- 설계도는 보유 중인 자동 탭퍼/작업대/공장/연구소 중 하나에 사용한다.
- 적용한 대상의 생산 또는 보너스가 영구적으로 1% 증가한다.
- 설계도와 적용 레벨은 환생으로 초기화되지 않는다.

## 6. 밸런스 수정 위치

대부분의 수치는 `src/App.tsx` 상단 및 컴포넌트 초반의 상수·계산식에 있다.

| 변경 대상 | 주요 위치/값 |
| --- | --- |
| 방해꾼 수 | `getEnemyCount` |
| 마일스톤 | `getMilestoneMultiplier`, 현재 10/25/50 |
| 탭·작업자·시설 가격 | `powerUpgradeCost`, `autoTapperCost`, `workshopCost` 등 |
| 환생 비용 | `rebirthCost` |
| 환생·연구 생산 배율 | `generationMultiplier` |
| 기억 획득 곡선 | `getLegacyTotal` |
| 오프라인 보상 상한 | `offlineSeconds`, 현재 8시간 |
| 보물 주기와 효과 | `FIRST_TREASURE_DELAY`, `TREASURE_DELAY`, `collectTreasure` |
| 적금 보물 보상 | `baseFortuneReward`, `savingsFortuneBonus` |
| 설계도 주기·보관량 | `BLUEPRINT_INTERVAL`, `BLUEPRINT_STORAGE_LIMIT` |

밸런스를 수정할 때는 자동 생산 계산과 오프라인 생산 계산을 함께 맞춘다. 특히 신규 생산 배율을 `activeAutoRate`에만 넣으면, 앱을 닫았을 때 그 보너스가 사라진 것처럼 보인다.

## 7. 배포

### Vercel 웹 배포

GitHub `main` 브랜치에 push하면 Vercel이 자동 배포한다. `vercel.json`에 따라 다음 명령을 사용한다.

```bash
npm run build:web
```

Vercel은 브라우저용 배포이며 `@toss/tds-mobile` 런타임을 직접 실행하지 않는다. 현재 게임 UI는 React와 CSS로 구현되어 있어 Vercel에서 동작한다.

### 앱인토스 배포

```bash
npm run build
npm run deploy
```

앱인토스 콘솔의 앱 정보, 배포 버전, 게임 분류·정책 요구사항은 웹 배포와 별도로 관리한다.

## 8. 변경 전 체크리스트

- [ ] 신규 상태를 로드·저장·스키마까지 연결했는가?
- [ ] 환생 시 초기화/유지 여부를 명시했는가?
- [ ] 실시간 생산과 오프라인 생산 수식이 같은가?
- [ ] 큰 수에서도 가격·보상·표기가 깨지지 않는가?
- [ ] `npm run lint`, `npm run build:web`, `npm run build`를 모두 통과했는가?
- [ ] Supabase 스키마 변경이면 SQL을 실행했는가?
- [ ] Vercel 환경 변수에 공개 키만 들어 있는가?

## 9. 운영상 한계와 다음 개선 후보

현재 계산과 저장은 클라이언트 중심이다. 소규모 지인용 게임에는 단순하고 충분하지만, 경쟁 요소·리더보드·재화 판매를 붙이면 클라이언트 조작을 막을 수 없다. 그 단계에서는 포인트 지급, 환생, 보상 판정을 Supabase Edge Function 또는 별도 서버에서 검증해야 한다.

또한 저장 요청 실패는 현재 사용자에게 자세히 노출하지 않는다. 운영 규모가 커지면 Sentry 같은 오류 수집, 저장 재시도, 데이터 버전·마이그레이션, 서버 시간 기준 쿨다운을 추가한다.
