# KNUE 규정·업무지침 답변봇 개발 TODO (메모리 전략 반영)

## Phase 1: 프로젝트 설정 및 기본 구조

- [ ] Node.js/TypeScript 프로젝트 초기화
- [ ] package.json 및 tsconfig.json 설정
- [ ] 필요한 의존성 패키지 설치 (express, @google-cloud/firestore, @qdrant/js-client-rest, openai, telegraf, @octokit/rest, zod, winston)
- [ ] 개발 의존성 설치 (typescript, @types/node, @types/express, jest, eslint, prettier)
- [ ] 프로젝트 디렉터리 구조 생성 (src, tests, types)
- [ ] 환경변수 설정 파일(.env, config.ts) 작성
- [ ] Docker 설정 (Dockerfile, docker-compose.yml)
- [ ] ESLint, Prettier 설정 파일
- [ ] Jest 테스트 설정

## Phase 2: 외부 서비스 연동

- [ ] TypeScript 타입 정의 작성 (types/index.ts)
- [ ] **Firestore 대화 세션 모델 설계** (conversations, messages, user_prefs)
- [ ] Qdrant Cloud 연결 및 컬렉션 생성 (QdrantClient 클래스)
- [ ] Firestore 연결 및 데이터 모델 정의 (TypeScript 인터페이스)
- [ ] OpenAI API 연동 (임베딩, 채팅) - openai 클라이언트
- [ ] Telegram Bot API 연동 - Telegraf 프레임워크
- [ ] GitHub API 연동 - Octokit REST API
- [ ] 환경변수 및 비밀 관리 (Google Secret Manager)

## Phase 3: 대화 메모리 시스템 구현

### 대화 세션 관리

- [ ] **Firestore 세션 DAO 구현** (conversations/{chatId} CRUD)
- [ ] **메시지 이력 DAO 구현** (messages/{chatId}_{timestamp} CRUD)
- [ ] **대화 요약 생성 로직** (OpenAI를 사용한 rolling summary)
- [ ] **요약 트리거 조건** (매 10턴 또는 4000자 초과)
- [ ] **최근 N턴 조회 최적화** (토큰 상한 1000~1500토큰 내)
- [ ] **세션 초기화 기능** (`/reset` 명령어)

### 텔레그램 명령어

- [ ] `/reset` - 대화 세션 초기화 구현
- [ ] `/lang ko|en` - 응답 언어 변경 구현
- [ ] `/help` - 사용법 안내 구현

## Phase 4: RAG 검색 시스템

### 데이터 동기화

- [ ] GitHub Webhook 엔드포인트 구현 (`/github/webhook`)
- [ ] Webhook 서명 검증 로직
- [ ] 변경된 파일 감지 및 필터링 (*.md, README.md 제외)
- [ ] Markdown 파싱 및 청킹 로직
- [ ] OpenAI 임베딩 생성 및 배치 처리
- [ ] Qdrant 벡터 업서트/삭제 로직
- [ ] Firestore 메타데이터 관리

### 질의응답 시스템

- [ ] Telegram Webhook 엔드포인트 구현 (`/telegram/webhook`)
- [ ] **대화 맥락 로드** (세션 + 최근 N턴 메시지)
- [ ] 사용자 질문 전처리 및 언어 감지
- [ ] **RAG 검색 + 스코어 임계값** (0.80 미만 시 "규정에 없음")
- [ ] **프롬프트 구성** (시스템 + 대화요약 + 최근대화 + 규정근거)
- [ ] **가드레일 강화** (메모리는 맥락보조, 근거는 RAG만)
- [ ] OpenAI 채팅 완성 API 호출
- [ ] 답변 후처리 및 출처 정보 추가
- [ ] **대화 이력 저장** (user + assistant 메시지)
- [ ] Telegram 메시지 전송

### 폴링 워커 (대안)

- [ ] 폴링 워커 엔드포인트 구현 (`/worker/sync`)
- [ ] Cloud Scheduler + Pub/Sub 연동
- [ ] 주기적 GitHub 변경사항 확인

## Phase 5: 헬스체크 및 모니터링

- [ ] 헬스체크 엔드포인트 구현 (`/healthz`)
- [ ] **대화 메모리 상태 모니터링** (세션 수, 요약 실패율)
- [ ] 구조화된 로깅 시스템 (Winston)
- [ ] Error Reporting 연동
- [ ] 성능 메트릭 수집 (응답시간, 검색 0건 비율)
- [ ] 동기화 작업 로그 관리

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

## 우선순위 높은 작업

1. **Node.js/TypeScript 프로젝트 설정** (Phase 1)
2. **Firestore 대화 세션 모델 설계** (Phase 2)
3. **대화 메모리 시스템 구현** (Phase 3)
4. **RAG 검색 + 가드레일 강화** (Phase 4)
5. **대화 플로우 통합 테스트** (Phase 6)
6. **Firestore 인덱스 최적화** (Phase 7)

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

1. [ ] **Firestore 컬렉션/인덱스 생성**
2. [ ] **대화 세션 DAO 구현**
3. [ ] **메시지 이력 관리 구현**
4. [ ] **요약 생성 로직 구현**
5. [ ] **텔레그램 Webhook 구현** (파싱·저장)
6. [ ] **RAG 검색 + 스코어 임계값 적용**
7. [ ] **프롬프트 분리** (메모리=참고, 근거=필수)
8. [ ] **명령어 구현** (/reset, /lang, /help)
9. [ ] **로깅/알람** (요약 실패율, 응답 지연, 검색 0건 비율)
10. [ ] **성능 튜닝 및 모니터링**