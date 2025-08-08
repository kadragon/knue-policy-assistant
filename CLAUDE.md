# KNUE 규정·업무지침 답변봇 프로젝트

## 프로젝트 개요

- **목표**: KNUE 규정·업무지침을 실시간 동기화하여 사용자 질문에 정확한 답변 제공
- **스택**: Telegram Bot + Cloud Run(Node.js/Express) + OpenAI + Qdrant Cloud + Firestore
- **원칙**: 규정 근거가 있는 내용만 답변, 추측 금지

## 아키텍처

- **백엔드**: Cloud Run에서 Node.js/Express + TypeScript로 구현
- **벡터DB**: Qdrant Cloud (text-embedding-3-small, dim=1536)
- **메타데이터**: Firestore (문서형 메타데이터)
- **AI**: OpenAI (임베딩 + 챗 완성)

## 주요 기능

1. GitHub 변경사항 자동 동기화 (Webhook/Polling)
2. Telegram 챗봇 인터페이스
3. **대화 맥락 유지** (Firestore 세션 + 요약)
4. 규정 기반 질의응답 (한국어/영어)
5. 출처 정보 제공

## 환경변수

```bash
OPENAI_API_KEY=<Secret Manager 참조>
QDRANT_API_KEY=<Qdrant Cloud API Key>
QDRANT_URL=<Qdrant Cloud URL>
FIRESTORE_PROJECT_ID=<GCP Project ID>
REPO_ID=kadragon/KNUE-Policy-Hub
DEFAULT_BRANCH=main
GITHUB_WEBHOOK_SECRET=<Secret Manager 참조>
COLLECTION_NAME=knue_policy_hub_v1
TELEGRAM_BOT_TOKEN=<Secret Manager 참조>
LANG_DEFAULT=ko
MIN_INSTANCES=1
```

## 엔드포인트

- `POST /telegram/webhook` - 텔레그램 메시지 수신
- `POST /github/webhook` - GitHub push 이벤트 수신
- `POST /worker/sync` - 폴링 워커 (대안)
- `GET /healthz` - 헬스체크

## 성능 목표

- 응답시간: 2초 내 (콜드스타트 제외), 평균 3초 이내
- Top-k: 6~8, MMR로 중복 제거
- 최소 인스턴스 1 유지

## 데이터 모델

### Firestore 컬렉션

1. **repos/{repoId}** - 리포지토리 메타데이터
2. **files/{repoId}_{pathHash}** - 파일 메타데이터
3. **chunks/{fileId}_{seq}** - 청킹된 텍스트 조각
4. **jobs/{jobId}** - 동기화 작업 로그
5. **conversations/{chatId}** - 대화 세션 (요약, 언어 설정)
6. **messages/{chatId}_{timestamp}** - 대화 메시지 이력
7. **user_prefs/{chatId}** - 사용자 선호 설정 (선택적)

### Firestore 대화 세션 모델

```json
{
  "conversations/{chatId}": {
    "summary": "최근 대화 요약 (500-800자)",
    "lang": "ko | en",
    "updatedAt": "timestamp"
  },
  "messages/{chatId}_{timestamp}": {
    "chatId": "telegram_chat_id",
    "role": "user | assistant",
    "text": "메시지 내용",
    "createdAt": "timestamp"
  }
}
```

### Qdrant 페이로드

```json
{
  "repoId": "kadragon/KNUE-Policy-Hub",
  "fileId": "...",
  "filePath": "policies/.../...md",
  "commit": "abcdef1",
  "seq": 0,
  "lang": "ko",
  "hash": "contentHash",
  "title": "문서의 h1/h2 제목",
  "url": "https://github.com/kadragon/KNUE-Policy-Hub/blob/abcdef1/path.md"
}
```

## 시스템 프롬프트

### 질의응답용 프롬프트

```
너는 KNUE 규정·업무지침 전용 챗봇이다.
1) 답변은 아래 [규정 근거]에만 기반한다.
2) [대화 요약/최근 대화]는 맥락 이해 보조용이며, 근거로 인용 금지.
3) 근거가 없으면 "규정에 해당 내용이 없습니다."라고 답한다.
4) 한국어로 간결하고 정확하게 답하라.
```

### 대화 요약용 프롬프트

```
최근 대화를 5~8줄로 요약하되,
- 사용자의 지속되는 의도/조건/제약(예: "휴가 규정만", "결론 먼저")을 남기고
- 특정 사실은 규정 근거가 확인된 항목만 유지
- 불필요한 소회·잡담 제거
- 한국어로 간결하게
```

## 파라미터 권장값

### RAG 검색

- 청킹: 500~800자, 오버랩 80자
- Top-k: 6~8
- Min score threshold: 0.80 (미만 시 "no evidence")
- 답변 길이: 800~1200자 상한

### 대화 메모리

- 최근 대화 보전: 10~20턴
- 요약 길이: 500~800자
- 요약 트리거: 매 10턴 또는 4000자 초과시
- 토큰 상한: 1000~1500토큰 (메모리 부분)

## 테스트 전략

1. **Unit Test**: 파싱·청킹, 파일 필터링
2. **Integration Test**: Webhook→임베딩→질의응답 E2E
3. **Regression Test**: 일관성 있는 답변 확인

## 배포 순서

1. Qdrant Cloud 설정
2. Firestore 설정
3. Secret Manager 설정
4. Cloud Run 배포
5. Telegram/GitHub Webhook 설정
6. (선택) Cloud Scheduler + Pub/Sub 폴링 설정

## 모니터링

- 구조화된 로깅 (Cloud Logging)
- Error Reporting 연동
- 응답 지연 SLO 모니터링
- 파이프라인 실패 알람

## 대화 명령어

- `/reset` - 대화 세션 초기화 (messages 삭제, summary 리셋)
- `/lang ko|en` - 응답 언어 변경
- `/help` - 사용법 안내

## 개발 명령어

- **설치**: `npm install`
- **개발 서버**: `npm run dev`
- **빌드**: `npm run build`
- **시작**: `npm start`
- **린트**: `npm run lint`
- **타입체크**: `npm run type-check`
- **테스트**: `npm test`
- **테스트 (watch)**: `npm run test:watch`

## TypeScript 설정

- **런타임**: Node.js 18+
- **프레임워크**: Express.js
- **타입체킹**: TypeScript strict mode
- **테스트**: Jest + Supertest
- **린팅**: ESLint + Prettier
- **빌드**: tsc (TypeScript Compiler)

## 패키지 의존성

### 프로덕션

- `express` - 웹 프레임워크
- `@google-cloud/firestore` - Firestore 클라이언트
- `@qdrant/js-client-rest` - Qdrant 클라이언트
- `openai` - OpenAI API 클라이언트
- `telegraf` - Telegram Bot 프레임워크
- `@octokit/rest` - GitHub API 클라이언트
- `zod` - 스키마 검증
- `dotenv` - 환경변수 관리
- `winston` - 로깅
- `crypto` - 웹훅 서명 검증

### 개발 의존성

- `typescript` - TypeScript 컴파일러
- `@types/node`, `@types/express` - 타입 정의
- `jest`, `@types/jest` - 테스트 프레임워크
- `supertest`, `@types/supertest` - HTTP 테스트
- `eslint`, `@typescript-eslint/parser` - 린팅
- `prettier` - 코드 포맷팅
- `nodemon`, `ts-node` - 개발 서버

## 대화 맥락 전략

### 기본 원칙

- **대화 맥락**: Firestore 세션 + 요약으로 유지
- **정답 근거**: 오직 Qdrant RAG 문서에서만 가져옴
- **메모리 역할**: 맥락 보조용, 근거 아님

### 성능/비용 최적화

- Firestore 읽기: 최근 N턴 + summary (1~2회)
- Firestore 쓰기: 메시지 2건 (요약 시 +1건)
- 외부 메모리 호출 없음 → 네트워크 대기시간 절감
- 콜드 스타트 완화: min-instances=1 권장

## 참고사항

- README.md는 처리 대상에서 제외
- 파일 삭제/이동 시 이전 인덱스 정리 필수
- 서로 상충하는 규정 발견 시 둘 다 제시하고 상위 규정 안내
- TypeScript strict mode 사용으로 타입 안정성 보장