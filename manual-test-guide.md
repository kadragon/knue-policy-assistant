# 🧪 KNUE Policy Assistant 수동 테스트 가이드

## 현재 상태
- ✅ 62개 테스트 통과 (유닛 테스트, 통합 테스트)
- ❌ 개발 서버 실행 불가 (TypeScript 오류 다수)
- ✅ 핵심 서비스 로직 작동 확인됨

## 1. Jest를 통한 컴포넌트별 테스트

### 📝 대화 서비스 테스트
```bash
npm test -- tests/unit/conversation.test.ts
```
- 32개 테스트 모두 통과
- 세션 관리, 메시지 저장, 요약 생성 등 핵심 기능 검증

### 🔧 유틸리티 함수 테스트
```bash
npm test -- tests/unit/utils.test.ts
```
- 13개 테스트 모두 통과
- 텍스트 처리, 검증, 날짜, 오류 처리 기능 검증

### 🧩 통합 테스트
```bash
npm test -- tests/integration/basic-integration.test.ts
```
- 7개 테스트 모두 통과
- 컴포넌트 간 상호작용 검증

## 2. 개별 기능 단위 테스트

### TypeScript 컴파일 검사
```bash
npm run type-check
```
- 타입 안전성 검증
- 현재 다수 오류 있음 (주로 optional 타입 관련)

### 린트 검사
```bash
npm run lint
```
- 코드 품질 검증

### 빌드 테스트
```bash
npm run build
```
- 프로덕션 빌드 가능 여부 확인

## 3. 핵심 서비스 로직 검증 완료 항목

### ✅ ConversationService (대화 관리)
- 세션 초기화/관리
- 메시지 저장 및 조회
- 자동 요약 생성
- 언어 감지 및 업데이트
- 메모리 컨텍스트 구성
- 토큰 관리 및 최적화

### ✅ 유틸리티 함수들
- 텍스트 청킹 및 정제
- 채팅 ID, URL, 언어 검증
- 타임스탬프 처리
- 오류 처리

### ✅ 기본 설정 및 타입
- 환경변수 처리
- 기본값 검증
- 타입 상수 검증

## 4. 아직 검증되지 않은 항목

### ❌ 서버 실행 관련
- Express 서버 시작
- 미들웨어 동작
- 라우트 핸들링

### ❌ 외부 서비스 연동
- Telegram Bot API
- GitHub Webhook
- OpenAI API
- Qdrant 벡터 데이터베이스
- Firestore 데이터베이스

### ❌ RAG 시스템
- 문서 임베딩
- 벡터 검색
- LangChain 체인 동작

## 5. 수동 테스트 권장 순서

1. **기본 테스트 실행**
   ```bash
   npm test
   ```

2. **개별 서비스 테스트**
   ```bash
   npm test -- tests/unit/conversation.test.ts
   npm test -- tests/unit/utils.test.ts
   ```

3. **통합 테스트**
   ```bash
   npm test -- tests/integration/basic-integration.test.ts
   ```

4. **타입 체크**
   ```bash
   npm run type-check
   ```

5. **코드 품질 체크**
   ```bash
   npm run lint
   ```

## 6. 현재 테스트 커버리지 요약

- **전체**: 62개 테스트 통과
- **대화 관리**: 32개 테스트 (100% 통과)
- **유틸리티**: 13개 테스트 (100% 통과)
- **기본 기능**: 5개 테스트 (100% 통과)
- **타입 검증**: 5개 테스트 (100% 통과)
- **통합**: 7개 테스트 (100% 통과)

## 7. 다음 단계 개발 권장사항

1. TypeScript 오류 수정 (주로 optional 타입 처리)
2. 서버 실행 문제 해결
3. 외부 서비스 연동 테스트 환경 구성
4. E2E 테스트 시나리오 구성

## 8. Mock 데이터로 로직 검증

현재 Jest 테스트를 통해 다음 시나리오들이 검증됨:
- 새 사용자 대화 시작
- 메시지 저장 및 조회
- 자동 요약 트리거
- 언어 감지 및 변경
- 세션 리셋
- 토큰 제한 내 컨텍스트 구성
- 오류 상황 처리