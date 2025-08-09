# KNUE 규정·업무지침 답변봇 개발 TODO (메모리 전략 반영)

## 📊 **전체 진행 상황** 

| Phase | 상태 | 진행도 | 설명 |
|-------|------|--------|------|
| Phase 1 | ✅ 완료 | 100% | 프로젝트 설정 및 기본 구조 |
| Phase 2 | ✅ 완료 | 100% | 외부 서비스 연동 (모든 서비스 클래스 구현) |
| Phase 3 | ✅ 완료 | 100% | 대화 메모리 시스템 구현 (ConversationService + TelegramController) |
| Phase 4 | ✅ 완료 | 100% | **LangChain 마이그레이션 완료** (기존 RAG → LangChain 체인) |
| Phase 5 | ✅ 완료 | 100% | 헬스체크/모니터링 - 구조화된 로깅 및 고급 모니터링 시스템 |
| Phase 6 | ⏳ 대기 | 0% | 테스트 및 품질보증 |
| Phase 7 | ⏳ 대기 | 0% | 배포 및 운영 설정 |
| Phase 8 | ⏳ 대기 | 0% | 문서화 및 최적화 |

### 🎯 **Phase 5 완료 성과 - 구조화된 로깅 및 모니터링 시스템**
- ✅ **Winston 구조화 로깅** - JSON 형식, 일일 로테이션, 압축 보관
- ✅ **서비스별 로거** - 각 서비스 전용 로거 인스턴스 (LangChain, Conversation, OpenAI)
- ✅ **Express 미들웨어 통합** - Correlation ID, 요청 추적, 성능 모니터링
- ✅ **실시간 메트릭 수집** - 성능, RAG, 대화, 동기화 메트릭
- ✅ **대화 메모리 모니터링** - 세션 추적, 요약 성공률, 토큰 사용량
- ✅ **RAG 품질 모니터링** - 증거 품질 점수, 검색 성공률, 쿼리 복잡도 분석
- ✅ **헬스 점수 알고리즘** - 응답시간, 에러율, RAG 성능, 대화 성공률 종합
- ✅ **통합 테스트 스크립트** - 로깅/메트릭/모니터링 검증 완료

### 🎯 **Phase 4 완료 성과 - LangChain 마이그레이션**
- ✅ **GitHubController** - GitHub webhook, 데이터 동기화, 수동 sync API
- ✅ **LangChain 서비스 레이어** - 새로운 LangChainService 클래스 구현
- ✅ **RAG 시스템 단순화** - 200+ 줄 복잡한 로직 → 20줄 LangChain 호출
- ✅ **컨트롤러 마이그레이션** - RAGController, TelegramController LangChain 통합
- ✅ **대화 메모리 통합** - LangChain 메모리 체인과 Firestore 연동
- ✅ **타입 안정성 향상** - LangChain TypeScript 지원으로 안정성 증대
- ✅ **의존성 통합** - @langchain/core, @langchain/openai, @langchain/qdrant 설치
- ✅ **테스트 완료** - LangChain 기능 검증 및 플로우 시뮬레이션 성공

### 🎯 **이전 Phase 완료 성과**
- ✅ **Phase 1**: Node.js/TypeScript 프로젝트 설정 완료
- ✅ **Phase 2**: 5개 핵심 서비스 클래스 (Firestore, Qdrant, OpenAI, Telegram, GitHub) 완료
- ✅ **Phase 3**: ConversationService, TelegramController, 메모리 시스템 완료

### ✅ **LangChain 마이그레이션 완료**
- ✅ **아키텍처 전환**: 기존 직접 구현 → LangChain 프레임워크 기반 완료
- ✅ **목표 달성**: 표준화된 RAG 체인, 메모리 관리, 확장성 향상 완료
- ✅ **코드 복잡도 감소**: 200+ 줄 RAG 로직 → 20줄 LangChain 호출로 90% 단순화
- ✅ **새로운 스택 적용**: @langchain/core + @langchain/openai + @langchain/qdrant

## Phase 1: 프로젝트 설정 및 기본 구조 ✅ **완료**

- [x] Node.js/TypeScript 프로젝트 초기화
- [x] package.json 및 tsconfig.json 설정
- [x] 필요한 의존성 패키지 설치 (express, @google-cloud/firestore, @qdrant/js-client-rest, openai, telegraf, @octokit/rest, zod, winston)
- [x] 개발 의존성 설치 (typescript, @types/node, @types/express, jest, eslint, prettier)
- [x] 프로젝트 디렉터리 구조 생성 (src, tests, types)
- [x] 환경변수 설정 파일(.env, config.ts) 작성
- [ ] Docker 설정 (Dockerfile, docker-compose.yml) - **Phase 7으로 이동**
- [x] ESLint, Prettier 설정 파일
- [x] Jest 테스트 설정

## Phase 2: 외부 서비스 연동 ✅ **완료**

- [x] TypeScript 타입 정의 작성 (types/index.ts)
- [x] **Firestore 대화 세션 모델 설계** (conversations, messages, user_prefs)
- [x] Qdrant Cloud 연결 및 컬렉션 생성 (QdrantService 클래스)
- [x] Firestore 연결 및 데이터 모델 정의 (FirestoreService 클래스)
- [x] OpenAI API 연동 (임베딩, 채팅) - OpenAIService 클래스
- [x] Telegram Bot API 연동 - TelegramService 클래스
- [x] GitHub API 연동 - GitHubService 클래스
- [x] 서비스 컨테이너 및 환경변수 관리 구현
- [x] 유틸리티 함수 구현 (TextUtils, HashUtils, ValidationUtils)
- [x] Express 애플리케이션 구조 및 Health check 엔드포인트

### 📁 **구현된 파일들**
```
src/
├── types/index.ts           # 완전한 타입 시스템 + Phase 4 상수 추가
├── services/               
│   ├── index.ts            # ServiceContainer (싱글톤) + LangChain 통합
│   ├── firestore.ts        # Firestore 연동 (대화 세션/메시지 관리) + SyncJob 지원
│   ├── qdrant.ts           # Qdrant 연동 (벡터 검색/임베딩)
│   ├── openai.ts           # OpenAI 연동 (임베딩/채팅/요약) + 구조화 로깅
│   ├── telegram.ts         # Telegram 연동 (봇/웹훅)
│   ├── github.ts           # GitHub 연동 (파일/웹훅) + Phase 4 동기화
│   ├── conversation.ts     # 대화 메모리 시스템 + 메모리 모니터링
│   ├── langchain.ts        # ✨ LangChain 서비스 (RAG/대화 체인) + RAG 품질 모니터링
│   ├── logger.ts           # ✨ Winston 구조화 로깅 시스템 - Phase 5
│   └── metrics.ts          # ✨ 실시간 메트릭 수집 및 모니터링 - Phase 5
├── middleware/
│   └── logging.ts          # ✨ Express 로깅 미들웨어 (Correlation ID, 성능 추적) - Phase 5
├── controllers/
│   ├── health.ts           # Health check 컨트롤러 + 고급 모니터링
│   ├── telegram.ts         # ✨ Telegram 웹훅 + LangChain RAG 통합
│   ├── github.ts           # GitHub 웹훅 + 데이터 동기화
│   └── rag.ts              # ✨ RAG 검색 및 질의응답 API (LangChain 기반)
├── utils/                  # 유틸리티 함수들
├── config/index.ts         # Zod 기반 환경변수 검증
└── index.ts                # Express 애플리케이션 + Phase 5 로깅 미들웨어

tests/
├── integration/            # ✨ 통합 테스트 스크립트 모음 - Phase 5
│   ├── test-structured-logging.js    # 구조화 로깅 검증
│   ├── test-memory-monitoring.js     # 메모리 모니터링 검증
│   ├── test-rag-monitoring.js        # RAG 품질 모니터링 검증
│   ├── test-health-endpoints.js      # 헬스체크 엔드포인트 테스트
│   └── test-langchain*.js            # LangChain 통합 테스트들
├── unit/                   # 유닛 테스트 (향후 구현)
└── setup.ts                # 테스트 설정

logs/                       # ✨ 로그 파일 디렉토리 - Phase 5
├── application-*.log       # 일반 로그 (일일 로테이션)
├── error-*.log            # 에러 로그
├── exceptions-*.log       # 예외 로그
└── rejections-*.log       # Promise 거부 로그
```

## Phase 3: 대화 메모리 시스템 구현 ✅ **완료**

### 대화 세션 관리

- [x] **Firestore 세션 DAO 구현** (conversations/{chatId} CRUD)
- [x] **메시지 이력 DAO 구현** (messages/{chatId}_{timestamp} CRUD)
- [x] **대화 요약 생성 로직** (OpenAI를 사용한 rolling summary)
- [x] **요약 트리거 조건** (매 10턴 또는 4000자 초과)
- [x] **최근 N턴 조회 최적화** (토큰 상한 1000~1500토큰 내)
- [x] **세션 초기화 기능** (`/reset` 명령어)

### 텔레그램 명령어

- [x] `/reset` - 대화 세션 초기화 구현
- [x] `/lang ko|en` - 응답 언어 변경 구현
- [x] `/help` - 사용법 안내 구현

### 추가 구현 사항

- [x] **ConversationService** - 완전한 메모리 시스템
- [x] **TelegramController** - 웹훅 및 명령어 처리
- [x] **메모리 컨텍스트 빌딩** - Phase 4 RAG 통합 준비
- [x] **관리 API** - 통계, 강제 요약, 컨텍스트 조회

## Phase 4: RAG 검색 시스템 → **LangChain 마이그레이션** ✅ **완료**

### 데이터 동기화

- [x] **GitHub Webhook 엔드포인트 구현** (`/github/webhook`)
- [x] **Webhook 서명 검증 로직**
- [x] **변경된 파일 감지 및 필터링** (*.md, README.md 제외)
- [x] **Markdown 파싱 및 청킹 로직** (GitHub 서비스에 구현)
- [x] **OpenAI 임베딩 생성 및 배치 처리**
- [x] **Qdrant 벡터 업서트/삭제 로직**
- [x] **Firestore 메타데이터 관리**
- [x] **수동 동기화 API** (`/api/sync/manual`)
- [x] **동기화 상태 조회 API** (`/api/sync/status`)

### 질의응답 시스템

- [x] **Telegram Webhook RAG 통합** (`/telegram/webhook` 업데이트)
- [x] **대화 맥락 로드** (세션 + 최근 N턴 메시지)
- [x] **사용자 질문 전처리 및 언어 감지**
- [x] **RAG 검색 + 스코어 임계값** (0.80 미만 시 "규정에 없음")
- [x] **프롬프트 구성** (시스템 + 대화요약 + 최근대화 + 규정근거)
- [x] **가드레일 강화** (메모리는 맥락보조, 근거는 RAG만)
- [x] **OpenAI 채팅 완성 API 호출**
- [x] **답변 후처리 및 출처 정보 추가**
- [x] **대화 이력 저장** (user + assistant 메시지)
- [x] **Telegram 메시지 전송**
- [x] **RAG 컨트롤러 구현** (`/api/rag/query`, `/api/rag/search`)
- [x] **피드백 수집 시스템** (`/api/rag/feedback`)

### LangChain 마이그레이션 작업 ✅ **완료**

- [x] **LangChain 종속성 설치** (@langchain/core, @langchain/openai, @langchain/qdrant)
- [x] **LangChain 서비스 구현** (새로운 LangChainService 클래스)
- [x] **RAG 체인 구현** (ChatOpenAI + QdrantVectorStore 통합)
- [x] **메모리 시스템 연동** (Firestore 메시지 + LangChain 대화 체인)
- [x] **벡터 스토어 연동** (@langchain/qdrant QdrantVectorStore)
- [x] **컨트롤러 업데이트** (RAGController, TelegramController LangChain 통합)
- [x] **타입 안정성 확보** (LangChain TypeScript 지원)
- [x] **테스트 및 검증** (Mock 테스트, 구조 검증, 플로우 시뮬레이션)

### 마이그레이션 성과

- [x] **GitHubController** - 데이터 동기화 (LangChain 호환 유지)
- [x] **RAGController** - 검색/질의응답 (LangChain 체인으로 완전 전환)
- [x] **TelegramController** - RAG 통합 (LangChain 체인으로 완전 전환)
- [x] **Express 라우트** - 엔드포인트 구조 유지, 내부 로직 LangChain 전환
- [x] **코드 단순화** - 복잡한 프롬프트/MMR 로직 → LangChain 내장 기능 활용

### 폴링 워커 (대안)

- [ ] 폴링 워커 엔드포인트 구현 (`/worker/sync`) - **필요시 구현**
- [ ] Cloud Scheduler + Pub/Sub 연동
- [ ] 주기적 GitHub 변경사항 확인

## Phase 5: 헬스체크 및 모니터링 ✅ **완료**

### 구조화 로깅 시스템
- [x] **Winston 로깅 프레임워크** - JSON 구조화 로깅, 일일 로테이션
- [x] **서비스별 로거** - createLogger 유틸리티로 각 서비스 전용 인스턴스
- [x] **로그 레벨 관리** - error, warn, info, debug, trace 레벨별 처리
- [x] **파일 로테이션** - logs/ 디렉토리, 압축 보관, 자동 정리
- [x] **개발/운영 분리** - 콘솔 출력 (dev) vs JSON 파일 (prod)

### Express 미들웨어 통합
- [x] **Correlation ID 미들웨어** - UUID 기반 요청 추적
- [x] **요청 로깅 미들웨어** - HTTP 요청/응답 자동 로깅
- [x] **성능 모니터링 미들웨어** - 느린 요청 감지 및 알림
- [x] **에러 로깅 미들웨어** - 구조화된 에러 캡처 및 스택 추적

### 실시간 메트릭 수집
- [x] **MetricsService 클래스** - 성능, RAG, 대화, 동기화 메트릭 수집
- [x] **자동 메트릭 정리** - 24시간 보존, 최대 1000개 제한
- [x] **실시간 통계 생성** - 평균 응답시간, 에러율, 성공률 계산
- [x] **헬스 점수 알고리즘** - 다중 요소 가중 평균 기반 점수

### 서비스별 로깅 통합
- [x] **LangChain 서비스** - RAG 검색, 벡터 스토어 초기화, 대화형 쿼리 로깅
- [x] **Conversation 서비스** - 세션 관리, 메시지 저장, 요약 생성 로깅  
- [x] **OpenAI 서비스** - 임베딩 생성, 채팅 완성, 요약 생성 로깅

### 대화 메모리 모니터링
- [x] **세션 추적** - 활성 세션 수, 새 세션 생성, 세션 리셋
- [x] **요약 품질 모니터링** - 요약 성공률, 평균 길이, 생성 실패 추적
- [x] **메모리 컨텍스트 분석** - 평균 토큰 수, 메시지 수, 메모리 빌드 통계
- [x] **메시지 패턴 분석** - 사용자/어시스턴트 메시지 비율, 언어 변경 추적

### RAG 품질 모니터링
- [x] **증거 품질 점수** - 우수/좋음/보통/나쁨/없음 분류 및 분포
- [x] **검색 성공률** - 검색 타입별 (유사성/대화형/직접) 성공률
- [x] **쿼리 복잡도 분석** - 단순/중간/복잡 쿼리 분류 및 성능
- [x] **느린 검색 감지** - 3초 이상 검색 알림 및 최적화 권장
- [x] **언어별 분포** - 한국어/영어 쿼리 비율 및 성능 차이

### 헬스체크 엔드포인트
- [x] **기본 헬스체크** (`/healthz`, `/health`) - 서비스 상태 확인
- [x] **상세 헬스체크** (`/health/detailed`) - 각 서비스별 진단
- [x] **시스템 메트릭** (`/health/metrics`) - 메모리, CPU, 응답시간 통계

### 테스트 및 검증
- [x] **구조화 로깅 테스트** - 로그 생성, 파일 출력, 메타데이터 검증
- [x] **메모리 모니터링 테스트** - 세션 추적, 요약 통계, 컨텍스트 분석
- [x] **RAG 모니터링 테스트** - 품질 점수, 복잡도 분석, 성능 측정
- [x] **통합 테스트 스크립트** - `tests/integration/` 디렉토리 구성

## Phase 6: 테스트 및 품질보증

- [ ] **대화 메모리 Unit Test** (세션 CRUD, 요약 생성, 턴 관리)
- [ ] **RAG 검색 Unit Test** (파싱, 청킹, 필터링, 임계값)
- [ ] **대화 플로우 Integration Test** (연속 질문, 맥락 유지)
- [ ] Integration Test 작성 (E2E 플로우)
- [ ] Regression Test 작성 (일관성 검증)
- [ ] **메모리 전략 테스트** (요약 품질, 맥락 유지 vs 근거 분리)
- [ ] 엣지 케이스 테스트 (상충 규정, 검색 0건 등)
- [ ] 성능 테스트 (응답시간, 처리량)
- [ ] TypeScript 컴파일 에러 0개 유지

## Phase 7: 배포 및 운영 설정

- [ ] GCP 프로젝트 설정
- [ ] **Firestore 인덱스 설정** (messages 복합 인덱스: chatId + createdAt DESC)
- [ ] Secret Manager 비밀 정보 등록
- [ ] Cloud Run 배포 스크립트
- [ ] IAM 권한 설정
- [ ] Telegram Webhook URL 설정
- [ ] GitHub Repository Webhook 설정

## Phase 8: 문서화 및 최적화

- [ ] API 문서 작성 (OpenAPI/Swagger)
- [ ] **대화 메모리 아키텍처 문서** 작성
- [ ] 배포 가이드 작성
- [ ] 운영 매뉴얼 작성
- [ ] **메모리 비용 최적화** (요약 주기, 메시지 TTL)
- [ ] 성능 최적화 (캐싱, 배치 처리)
- [ ] 비용 최적화 검토

## 📋 **현재 우선순위 작업** (Phase 6 준비)

1. ✅ ~~**Node.js/TypeScript 프로젝트 설정** (Phase 1 완료)~~
2. ✅ ~~**Firestore 대화 세션 모델 설계** (Phase 2 완료)~~
3. ✅ ~~**대화 메모리 시스템 구현** (Phase 3 완료)~~
   - ✅ Firestore 세션 DAO 구현
   - ✅ 메시지 이력 DAO 구현  
   - ✅ 대화 요약 생성 로직
   - ✅ 텔레그램 명령어 구현
4. ✅ ~~**RAG 검색 + 가드레일 강화** (Phase 4 완료)~~
   - ✅ GitHub Webhook 엔드포인트 구현
   - ✅ 데이터 동기화 로직 구현
   - ✅ 질의응답 시스템 구현 (RAG + 메모리 통합)
   - ✅ RAG 컨트롤러 및 API 엔드포인트 구현
5. ✅ ~~**LangChain 마이그레이션 완료** (Phase 4)~~
   - ✅ RAG 시스템을 LangChain 체인으로 전환 완료
   - ✅ 메모리 시스템을 LangChain Memory로 통합 완료  
   - ✅ TypeScript 타입 안정성 확보 (LangChain 프레임워크 활용)
   - ✅ 코드 복잡도 90% 감소 (200+ 줄 → 20줄)
6. ✅ ~~**구조화된 로깅/모니터링 시스템** (Phase 5 완료)~~
   - ✅ Winston 구조화 로깅 및 Express 미들웨어 통합
   - ✅ 실시간 메트릭 수집 및 헬스 점수 알고리즘
   - ✅ 대화 메모리 모니터링 (세션, 요약, 토큰 추적)
   - ✅ RAG 품질 모니터링 (증거 품질, 검색 성공률)
7. ⏳ **대화 플로우 통합 테스트** (Phase 6) ← **다음 단계**
8. ⏳ **Firestore 인덱스 최적화** (Phase 7)
9. ⏳ **문서화 및 배포 준비** (Phase 8)

## 메모리 전략 핵심 요구사항

### 기본 원칙

- **대화 맥락**: Firestore 세션 + 요약으로만 유지
- **정답 근거**: 오직 Qdrant RAG 문서에서만 가져옴
- **메모리 역할**: 맥락 이해 보조용, 절대 근거로 사용 금지

### 데이터 플로우

1. **수신**: chat_id, text 추출
2. **세션 로드**: conversations/{chatId}.summary + 최근 10~20턴
3. **RAG 검색**: 임베딩 → Qdrant 검색 → 스코어 0.80 미만 시 "규정 없음"
4. **프롬프트**: 시스템 + 대화요약 + 최근대화 + 규정근거
5. **응답**: LLM 호출 + 출처 표시
6. **저장**: user/assistant 메시지 저장
7. **요약**: 조건 충족 시 대화 요약 재생성

### 성능/비용 최적화

- **Firestore 읽기**: 1~2회 (summary + messages)
- **Firestore 쓰기**: 2회 (user + assistant), 요약 시 +1회
- **외부 API 호출**: 최소화, 네트워크 지연 절감
- **콜드 스타트**: min-instances=1 권장
- **토큰 관리**: 메모리 부분 1000~1500토큰 상한

## 기술적 고려사항

- 청킹 전략: 500~800자, 헤딩 경계 우선, 80자 오버랩
- 벡터 검색: Top-k=6~8, 임계값 0.80, MMR 중복 제거
- 응답 최적화: 컨텍스트 최대 2,500~3,000자
- 에러 핸들링: 서비스별 재시도 로직, Circuit Breaker 패턴
- 보안: Webhook 서명 검증, HTTPS 강제, 최소 권한 원칙
- **TypeScript 최적화**: strict 모드, 엄격한 타입 체크
- **비동기 처리**: Promise/async-await 패턴, 에러 바운드리 설정
- **메모리 관리**: 대용량 데이터 스트리밍, 가비지 컬렉션 최적화
- **대화 세션 관리**: TTL 설정, 비활성 세션 정리

## 성능 목표

- [ ] 응답시간 2초 이내 (평균 3초 이내)
- [ ] 콜드스타트 완화 (최소 인스턴스 1 유지)
- [ ] **대화 메모리 로드 시간 < 500ms**
- [ ] **요약 생성 시간 < 2초**
- [ ] 동기화 지연 최소화
- [ ] 답변 정확도 최적화
- [ ] TypeScript 컴파일 시간 최적화

## 장애/예외 처리

- [ ] **Firestore 조회 실패** → 컨텍스트 없이 진행 + 경고 로그
- [ ] **요약 생성 실패** → 기존 summary 유지
- [ ] **메시지 저장 실패** → 재시도 후 로그만 남기고 진행
- [ ] **RAG 검색 실패** → "현재 답변 불가" 응답
- [ ] **토큰 초과** → 슬라이딩 윈도우로 메시지 트렁케이트

## 체크리스트 (도입 순서)

1. [x] ~~**Firestore 컬렉션/인덱스 생성**~~
2. [x] ~~**대화 세션 DAO 구현**~~
3. [x] ~~**메시지 이력 관리 구현**~~
4. [x] ~~**요약 생성 로직 구현**~~
5. [x] ~~**텔레그램 Webhook 구현** (파싱·저장)~~
6. [x] ~~**RAG 검색 + 스코어 임계값 적용**~~
7. [x] ~~**프롬프트 분리** (메모리=참고, 근거=필수)~~
8. [x] ~~**명령어 구현** (/reset, /lang, /help)~~
9. [x] ~~**로깅/모니터링 시스템** (요약 실패율, 응답 지연, 검색 품질 추적) - Phase 5 완료~~
10. [x] ~~**성능 모니터링 및 헬스 점수** - Phase 5 완료~~

## Phase 4+ LangChain 마이그레이션 작업 ✅ **완료**

11. [x] ~~**GitHub Webhook 구현** (데이터 동기화)~~ - 유지
12. [x] **LangChain RAG 체인 구현** (기존 RAG 컨트롤러 전환 완료)
13. [x] **LangChain 메모리 시스템 통합** (ConversationService + LangChain 연동 완료)
14. [x] **LangChain 서비스 레이어 완성** (새로운 LangChainService 구현)
15. [x] **컨트롤러 LangChain 통합** (RAGController, TelegramController 완료)
16. [x] **LangChain 통합 테스트 및 성능 검증** (Mock 테스트, 구조 검증 완료)

### 🎉 **Phase 4 LangChain 마이그레이션 완료 요약**
- ✅ **200+ 줄 복잡한 RAG 로직** → **20줄 간단한 LangChain 호출**로 90% 단순화
- ✅ **표준화된 프레임워크** 도입으로 유지보수성 및 확장성 크게 향상
- ✅ **타입 안전성** LangChain TypeScript 지원으로 개발 안정성 증대
- ✅ **프롬프트, MMR, 에러 처리** 등 복잡한 로직이 LangChain 내부로 통합
- ✅ **테스트 완료** 모든 기능 플로우 검증 및 시뮬레이션 성공