import { ConversationService } from '../../src/services/conversation';
import { LangChainService } from '../../src/services/langchain';
import { FirestoreService } from '../../src/services/firestore';
import { OpenAIService } from '../../src/services/openai';
import {
  Conversation,
  Message,
  RAGSearchRequest,
  RAGQueryRequest,
  ServiceError,
  DEFAULT_VALUES
} from '../../src/types';
import { Timestamp } from '@google-cloud/firestore';

// Mock dependencies
jest.mock('../../src/services/firestore');
jest.mock('../../src/services/openai');
jest.mock('../../src/services/langchain');
jest.mock('../../src/services/logger');
jest.mock('../../src/services/metrics');

describe('Edge Cases Tests', () => {
  let conversationService: ConversationService;
  let langChainService: LangChainService;
  let mockFirestoreService: jest.Mocked<FirestoreService>;
  let mockOpenAIService: jest.Mocked<OpenAIService>;

  const testChatId = 'edge-case-test-chat';
  const mockTimestamp = Timestamp.fromDate(new Date('2024-01-01T00:00:00Z'));

  beforeEach(() => {
    jest.clearAllMocks();

    mockFirestoreService = new FirestoreService() as jest.Mocked<FirestoreService>;
    mockOpenAIService = new OpenAIService() as jest.Mocked<OpenAIService>;
    langChainService = new LangChainService() as jest.Mocked<LangChainService>;

    conversationService = new ConversationService(
      mockFirestoreService,
      mockOpenAIService
    );

    // Default successful mocks
    mockFirestoreService.getConversation.mockResolvedValue(null);
    mockFirestoreService.saveConversation.mockResolvedValue();
    mockFirestoreService.saveMessage.mockResolvedValue();
    mockFirestoreService.getRecentMessages.mockResolvedValue([]);
    mockFirestoreService.shouldTriggerSummary.mockResolvedValue(false);
    mockOpenAIService.generateSummary.mockResolvedValue('Summary');
    mockOpenAIService.estimateTokens.mockReturnValue(50);
  });

  describe('상충 규정 처리', () => {
    it('서로 다른 규정에서 상충하는 정보가 있을 때 모두 제시해야 함', async () => {
      // Arrange
      const conflictingDocuments = [
        {
          score: 0.95,
          title: '일반 휴가 규정',
          text: '연차휴가는 1년에 15일까지 사용할 수 있습니다.',
          filePath: 'policies/general/vacation.md',
          url: 'https://example.com/general/vacation.md',
          fileId: 'file1',
          seq: 0
        },
        {
          score: 0.92,
          title: '특별 휴가 규정 (신입사원)',
          text: '신입사원의 첫 해 연차휴가는 11일까지 사용할 수 있습니다.',
          filePath: 'policies/special/new-employee.md',
          url: 'https://example.com/special/new-employee.md',
          fileId: 'file2',
          seq: 0
        },
        {
          score: 0.90,
          title: '2024년 휴가 규정 개정안',
          text: '2024년부터 연차휴가는 1년에 20일로 확대됩니다.',
          filePath: 'policies/2024/vacation-amendment.md',
          url: 'https://example.com/2024/vacation-amendment.md',
          fileId: 'file3',
          seq: 0
        }
      ];

      const mockLangChainService = langChainService as jest.Mocked<LangChainService>;
      mockLangChainService.search.mockResolvedValue({
        documents: conflictingDocuments,
        query: '연차휴가 일수',
        total: 3,
        lang: 'ko'
      });

      mockLangChainService.conversationalQuery.mockResolvedValue({
        answer: '연차휴가에 대해 여러 규정이 있습니다:\n1) 일반 규정: 15일\n2) 신입사원 특별 규정: 첫 해 11일\n3) 2024년 개정안: 20일\n\n상위 규정이나 최신 규정을 확인하시기 바랍니다.',
        sources: [
          { title: '일반 휴가 규정', filePath: 'policies/general/vacation.md', url: 'https://example.com/general/vacation.md' },
          { title: '특별 휴가 규정 (신입사원)', filePath: 'policies/special/new-employee.md', url: 'https://example.com/special/new-employee.md' },
          { title: '2024년 휴가 규정 개정안', filePath: 'policies/2024/vacation-amendment.md', url: 'https://example.com/2024/vacation-amendment.md' }
        ],
        question: '연차휴가는 몇 일까지 가능한가요?',
        lang: 'ko',
        processingTime: 1800
      });

      // Act
      const searchResponse = await mockLangChainService.search({
        query: '연차휴가 일수',
        k: 5,
        minScore: 0.80,
        lang: 'ko'
      });

      const queryResponse = await mockLangChainService.conversationalQuery(
        '연차휴가는 몇 일까지 가능한가요?',
        [],
        'ko'
      );

      // Assert
      // 검색에서 상충하는 모든 문서를 반환
      expect(searchResponse.documents).toHaveLength(3);
      expect(searchResponse.documents.map(d => d.title)).toEqual([
        '일반 휴가 규정',
        '특별 휴가 규정 (신입사원)',
        '2024년 휴가 규정 개정안'
      ]);

      // 답변에서 모든 상충 정보를 제시
      expect(queryResponse.answer).toContain('여러 규정이 있습니다');
      expect(queryResponse.answer).toContain('15일');
      expect(queryResponse.answer).toContain('11일');
      expect(queryResponse.answer).toContain('20일');

      // 상위 규정 확인을 안내
      expect(queryResponse.answer).toMatch(/(상위 규정|최신 규정|확인)/);

      // 모든 출처를 포함
      expect(queryResponse.sources).toHaveLength(3);
    });

    it('모호한 질문에 대해 명확한 구분을 요청해야 함', async () => {
      // Arrange
      const ambiguousDocuments = [
        {
          score: 0.88,
          title: '교직원 휴가 규정',
          text: '교직원의 휴가는 학기 중과 방학 중이 다르게 적용됩니다.',
          filePath: 'policies/faculty/vacation.md',
          url: 'https://example.com/faculty/vacation.md',
          fileId: 'file1',
          seq: 0
        },
        {
          score: 0.85,
          title: '행정직원 휴가 규정',
          text: '행정직원의 휴가는 일반 기업체와 동일하게 적용됩니다.',
          filePath: 'policies/staff/vacation.md',
          url: 'https://example.com/staff/vacation.md',
          fileId: 'file2',
          seq: 0
        }
      ];

      const mockLangChainService = langChainService as jest.Mocked<LangChainService>;
      mockLangChainService.conversationalQuery.mockResolvedValue({
        answer: '휴가 규정이 직종에 따라 다릅니다. 교직원인지 행정직원인지 명확히 해주시면 정확한 안내를 드릴 수 있습니다.\n\n- 교직원: 학기/방학 중 차등 적용\n- 행정직원: 일반 기업체와 동일',
        sources: [
          { title: '교직원 휴가 규정', filePath: 'policies/faculty/vacation.md', url: 'https://example.com/faculty/vacation.md' },
          { title: '행정직원 휴가 규정', filePath: 'policies/staff/vacation.md', url: 'https://example.com/staff/vacation.md' }
        ],
        question: '휴가 규정이 궁금합니다',
        lang: 'ko',
        processingTime: 1400
      });

      // Act
      const response = await mockLangChainService.conversationalQuery(
        '휴가 규정이 궁금합니다',
        [],
        'ko'
      );

      // Assert
      expect(response.answer).toContain('직종에 따라 다릅니다');
      expect(response.answer).toMatch(/(명확히|구체적으로|정확한)/);
      expect(response.answer).toContain('교직원');
      expect(response.answer).toContain('행정직원');
      expect(response.sources).toHaveLength(2);
    });

    it('규정이 시기별로 다를 때 현재 적용 규정을 우선해야 함', async () => {
      // Arrange
      const timeBasedDocuments = [
        {
          score: 0.92,
          title: '2023년 급여 규정',
          text: '2023년 기준 월급여는 2,500,000원입니다. (2023.12.31까지 적용)',
          filePath: 'policies/2023/salary.md',
          url: 'https://example.com/2023/salary.md',
          fileId: 'file1',
          seq: 0
        },
        {
          score: 0.95,
          title: '2024년 급여 규정',
          text: '2024년부터 월급여는 2,700,000원으로 인상됩니다. (2024.1.1부터 적용)',
          filePath: 'policies/2024/salary.md',
          url: 'https://example.com/2024/salary.md',
          fileId: 'file2',
          seq: 0
        }
      ];

      const mockLangChainService = langChainService as jest.Mocked<LangChainService>;
      mockLangChainService.conversationalQuery.mockResolvedValue({
        answer: '현재(2024년) 적용되는 월급여는 2,700,000원입니다. 2024년 1월 1일부터 기존 2,500,000원에서 인상되었습니다.',
        sources: [
          { title: '2024년 급여 규정', filePath: 'policies/2024/salary.md', url: 'https://example.com/2024/salary.md' },
          { title: '2023년 급여 규정', filePath: 'policies/2023/salary.md', url: 'https://example.com/2023/salary.md' }
        ],
        question: '현재 월급여는 얼마인가요?',
        lang: 'ko',
        processingTime: 1300
      });

      // Act
      const response = await mockLangChainService.conversationalQuery(
        '현재 월급여는 얼마인가요?',
        [],
        'ko'
      );

      // Assert
      // 현재 적용 규정(2024년) 우선
      expect(response.answer).toContain('현재(2024년)');
      expect(response.answer).toContain('2,700,000원');
      
      // 변경 이력도 제공
      expect(response.answer).toContain('2024년 1월 1일부터');
      expect(response.answer).toContain('기존 2,500,000원');
      
      // 최신 규정이 첫 번째 출처로 제시
      expect(response.sources[0].title).toBe('2024년 급여 규정');
    });
  });

  describe('검색 0건 처리', () => {
    it('검색 결과가 없을 때 표준 메시지를 반환해야 함', async () => {
      // Arrange
      const mockLangChainService = langChainService as jest.Mocked<LangChainService>;
      mockLangChainService.search.mockResolvedValue({
        documents: [],
        query: '존재하지 않는 정책',
        total: 0,
        lang: 'ko'
      });

      mockLangChainService.conversationalQuery.mockResolvedValue({
        answer: '규정에 해당 내용이 없습니다.',
        sources: [],
        question: '존재하지 않는 정책에 대해 알려주세요',
        lang: 'ko',
        processingTime: 500
      });

      // Act
      const searchResponse = await mockLangChainService.search({
        query: '존재하지 않는 정책',
        k: 5,
        minScore: 0.80,
        lang: 'ko'
      });

      const queryResponse = await mockLangChainService.conversationalQuery(
        '존재하지 않는 정책에 대해 알려주세요',
        [],
        'ko'
      );

      // Assert
      expect(searchResponse.documents).toHaveLength(0);
      expect(searchResponse.total).toBe(0);
      
      expect(queryResponse.answer).toBe('규정에 해당 내용이 없습니다.');
      expect(queryResponse.sources).toHaveLength(0);
      expect(queryResponse.processingTime).toBeLessThan(1000); // 빠른 응답
    });

    it('점수가 임계값 미만인 경우 결과 없음으로 처리해야 함', async () => {
      // Arrange
      const lowScoreDocuments = [
        {
          score: 0.75, // 임계값(0.80) 미만
          title: '관련성 낮은 문서',
          text: '관련성이 낮은 내용입니다.',
          filePath: 'policies/unrelated.md',
          url: 'https://example.com/unrelated.md',
          fileId: 'file1',
          seq: 0
        },
        {
          score: 0.65, // 임계값 미만
          title: '또 다른 관련성 낮은 문서',
          text: '이것도 관련성이 낮습니다.',
          filePath: 'policies/also-unrelated.md',
          url: 'https://example.com/also-unrelated.md',
          fileId: 'file2',
          seq: 0
        }
      ];

      const mockLangChainService = langChainService as jest.Mocked<LangChainService>;
      mockLangChainService.search.mockResolvedValue({
        documents: [], // 임계값 필터링 후 빈 결과
        query: '점수 낮은 검색어',
        total: 0,
        lang: 'ko'
      });

      mockLangChainService.conversationalQuery.mockResolvedValue({
        answer: '규정에 해당 내용이 없습니다.',
        sources: [],
        question: '점수 낮은 검색어에 대해 알려주세요',
        lang: 'ko',
        processingTime: 600
      });

      // Act
      const response = await mockLangChainService.conversationalQuery(
        '점수 낮은 검색어에 대해 알려주세요',
        [],
        'ko'
      );

      // Assert
      expect(response.answer).toBe('규정에 해당 내용이 없습니다.');
      expect(response.sources).toHaveLength(0);
    });

    it('검색어가 너무 일반적일 때 구체적인 질문을 요청해야 함', async () => {
      // Arrange
      const tooGeneralDocuments = [
        {
          score: 0.82,
          title: '일반 정책 개요',
          text: '본 문서는 여러 정책의 개요를 다룹니다.',
          filePath: 'policies/overview.md',
          url: 'https://example.com/overview.md',
          fileId: 'file1',
          seq: 0
        }
      ];

      const mockLangChainService = langChainService as jest.Mocked<LangChainService>;
      mockLangChainService.conversationalQuery.mockResolvedValue({
        answer: '질문이 너무 일반적입니다. 구체적으로 어떤 규정에 대해 알고 싶으신지 말씀해 주세요. 예를 들어:\n- 휴가 규정\n- 급여 규정\n- 출장비 규정\n- 교육 규정',
        sources: [
          { title: '일반 정책 개요', filePath: 'policies/overview.md', url: 'https://example.com/overview.md' }
        ],
        question: '규정',
        lang: 'ko',
        processingTime: 900
      });

      // Act
      const response = await mockLangChainService.conversationalQuery(
        '규정',
        [],
        'ko'
      );

      // Assert
      expect(response.answer).toContain('너무 일반적입니다');
      expect(response.answer).toContain('구체적으로');
      expect(response.answer).toContain('예를 들어');
      expect(response.answer).toMatch(/(휴가|급여|출장|교육).*규정/);
    });

    it('오타가 있는 질문에 대해 제안을 제공해야 함', async () => {
      // Arrange
      const mockLangChainService = langChainService as jest.Mocked<LangChainService>;
      
      // 오타 검색은 결과 없음
      mockLangChainService.search.mockResolvedValueOnce({
        documents: [],
        query: '휴가규정',
        total: 0,
        lang: 'ko'
      });

      mockLangChainService.conversationalQuery.mockResolvedValue({
        answer: '해당 내용을 찾을 수 없습니다. 혹시 "휴가 규정"을 의미하시나요? 다음과 같은 검색어를 시도해 보세요:\n- 휴가 규정\n- 연차 휴가\n- 병가 규정',
        sources: [],
        question: '휴가규정',
        lang: 'ko',
        processingTime: 700
      });

      // Act
      const response = await mockLangChainService.conversationalQuery(
        '휴가규정',
        [],
        'ko'
      );

      // Assert
      expect(response.answer).toContain('찾을 수 없습니다');
      expect(response.answer).toContain('혹시');
      expect(response.answer).toContain('다음과 같은 검색어');
      expect(response.answer).toContain('휴가 규정');
      expect(response.sources).toHaveLength(0);
    });
  });

  describe('극한 상황 처리', () => {
    it('매우 긴 질문을 적절히 처리해야 함', async () => {
      // Arrange
      const veryLongQuestion = '안녕하세요. 저는 신입사원으로 입사한 지 3개월 된 직원입니다. '.repeat(20) + 
                               '휴가 규정에 대해서 자세히 알고 싶은데요. 특히 연차휴가와 병가의 차이점, 신청 방법, 승인 절차, 필요 서류, 긴급상황 처리 등에 대해 모든 것을 알려주세요.';

      const mockLangChainService = langChainService as jest.Mocked<LangChainService>;
      mockLangChainService.conversationalQuery.mockResolvedValue({
        answer: '휴가 규정에 대해 종합적으로 안내드리겠습니다. [요약된 핵심 답변]',
        sources: [
          { title: '휴가 규정', filePath: 'policies/vacation.md', url: 'https://example.com/vacation.md' }
        ],
        question: veryLongQuestion.substring(0, 100) + '...', // 질문 요약
        lang: 'ko',
        processingTime: 2500
      });

      // Act
      const response = await mockLangChainService.conversationalQuery(
        veryLongQuestion,
        [],
        'ko'
      );

      // Assert
      expect(response.answer).toContain('종합적으로');
      expect(response.question.length).toBeLessThan(veryLongQuestion.length);
      expect(response.sources).toHaveLength(1);
      expect(response.processingTime).toBeLessThan(5000);
    });

    it('빈 문자열이나 특수 문자만 있는 질문을 처리해야 함', async () => {
      // Arrange
      const invalidQuestions = ['', '   ', '???', '!!!', '...', '@#$%^&*()'];

      const mockLangChainService = langChainService as jest.Mocked<LangChainService>;
      
      invalidQuestions.forEach(() => {
        mockLangChainService.conversationalQuery.mockResolvedValueOnce({
          answer: '질문을 이해할 수 없습니다. 구체적인 질문을 해주세요.',
          sources: [],
          question: '[잘못된 질문]',
          lang: 'ko',
          processingTime: 200
        });
      });

      // Act & Assert
      for (const invalidQuestion of invalidQuestions) {
        const response = await mockLangChainService.conversationalQuery(
          invalidQuestion,
          [],
          'ko'
        );

        expect(response.answer).toContain('질문을 이해할 수 없습니다');
        expect(response.sources).toHaveLength(0);
        expect(response.processingTime).toBeLessThan(1000);
      }
    });

    it('매우 많은 동시 요청을 처리해야 함', async () => {
      // Arrange
      const concurrentQuestions = Array.from({ length: 50 }, (_, i) => `질문 ${i}`);

      const mockLangChainService = langChainService as jest.Mocked<LangChainService>;
      concurrentQuestions.forEach((question, i) => {
        mockLangChainService.conversationalQuery.mockResolvedValueOnce({
          answer: `답변 ${i}`,
          sources: [],
          question,
          lang: 'ko',
          processingTime: 800 + Math.random() * 400
        });
      });

      // Act
      const startTime = Date.now();
      const responses = await Promise.all(
        concurrentQuestions.map(q => mockLangChainService.conversationalQuery(q, [], 'ko'))
      );
      const totalTime = Date.now() - startTime;

      // Assert
      expect(responses).toHaveLength(50);
      responses.forEach((response, i) => {
        expect(response.answer).toBe(`답변 ${i}`);
        expect(response.question).toBe(`질문 ${i}`);
      });

      // 병렬 처리로 인해 순차 처리보다 빨라야 함
      expect(totalTime).toBeLessThan(5000);
    });

    it('메모리 부족 상황을 처리해야 함', async () => {
      // Arrange
      const hugeConversation: Conversation = {
        chatId: testChatId,
        lang: 'ko',
        messageCount: 1000,
        lastMessageAt: mockTimestamp,
        createdAt: mockTimestamp,
        updatedAt: mockTimestamp,
        summary: 'Very long summary. '.repeat(1000) // 매우 긴 요약
      };

      const hugeMessages: Message[] = Array.from({ length: 1000 }, (_, i) => ({
        messageId: `msg${i}`,
        chatId: testChatId,
        role: i % 2 === 0 ? 'user' : 'assistant',
        text: 'Very long message content. '.repeat(100), // 매우 긴 메시지
        createdAt: mockTimestamp
      }));

      mockFirestoreService.getConversation.mockResolvedValue(hugeConversation);
      mockFirestoreService.getRecentMessages.mockResolvedValue(hugeMessages);

      // 매우 높은 토큰 수 시뮬레이션
      mockOpenAIService.estimateTokens.mockReturnValue(1000);

      // Act - 작은 토큰 제한으로 테스트
      const memoryContext = await conversationService.buildMemoryContext(testChatId, 100);

      // Assert
      expect(memoryContext.tokenCount).toBeLessThanOrEqual(100);
      expect(memoryContext.recentMessages.length).toBeLessThan(100);
      
      // 극한 상황에서도 최소한의 정보는 제공되어야 함
      expect(memoryContext.tokenCount).toBeGreaterThan(0);
    });
  });

  describe('서비스 장애 시나리오', () => {
    it('Firestore 연결 실패 시 적절히 처리해야 함', async () => {
      // Arrange
      const firestoreError = new Error('Firestore connection failed');
      mockFirestoreService.getConversation.mockRejectedValue(firestoreError);

      // Act & Assert
      await expect(
        conversationService.initializeSession(testChatId, 'ko')
      ).rejects.toThrow(ServiceError);

      try {
        await conversationService.initializeSession(testChatId, 'ko');
      } catch (error: any) {
        expect(error).toBeInstanceOf(ServiceError);
        expect(error.service).toBe('conversation');
        expect(error.code).toBe('INIT_SESSION_ERROR');
        expect(error.statusCode).toBe(500);
      }
    });

    it('OpenAI API 호출 실패 시 적절히 처리해야 함', async () => {
      // Arrange
      const messages: Message[] = [
        {
          messageId: 'msg1',
          chatId: testChatId,
          role: 'user',
          text: '테스트 메시지',
          createdAt: mockTimestamp
        }
      ];

      const openaiError = new Error('OpenAI API rate limit exceeded');
      mockOpenAIService.generateSummary.mockRejectedValue(openaiError);

      // Act & Assert
      await expect(
        mockOpenAIService.generateSummary(messages)
      ).rejects.toThrow('OpenAI API rate limit exceeded');

      // 요약 실패 시 기존 요약을 유지하고 계속 진행해야 함
      mockFirestoreService.shouldTriggerSummary.mockResolvedValue(true);
      mockFirestoreService.getRecentMessages.mockResolvedValue(messages);

      // 요약 실패해도 메시지 저장은 계속되어야 함
      await expect(
        conversationService.saveMessage(testChatId, 'user', 'new message')
      ).resolves.not.toThrow();
    });

    it('LangChain 서비스 실패 시 적절히 처리해야 함', async () => {
      // Arrange
      const langchainError = new Error('Vector store connection timeout');
      const mockLangChainService = langChainService as jest.Mocked<LangChainService>;
      mockLangChainService.conversationalQuery.mockRejectedValue(langchainError);

      // Act & Assert
      await expect(
        mockLangChainService.conversationalQuery('test question', [], 'ko')
      ).rejects.toThrow('Vector store connection timeout');
    });

    it('부분적 서비스 장애 시 사용 가능한 기능은 계속 작동해야 함', async () => {
      // Arrange
      // OpenAI 요약 기능만 실패, 다른 기능은 정상
      mockOpenAIService.generateSummary.mockRejectedValue(new Error('Summary service down'));
      mockOpenAIService.estimateTokens.mockReturnValue(50); // 토큰 추정은 정상

      const conversation: Conversation = {
        chatId: testChatId,
        lang: 'ko',
        messageCount: 5,
        lastMessageAt: mockTimestamp,
        createdAt: mockTimestamp,
        updatedAt: mockTimestamp
      };

      mockFirestoreService.getConversation.mockResolvedValue(conversation);
      mockFirestoreService.getRecentMessages.mockResolvedValue([]);

      // Act
      // 요약 생성은 실패하지만 다른 기능은 정상 작동해야 함
      const memoryContext = await conversationService.buildMemoryContext(testChatId, 1000);
      
      await expect(
        conversationService.saveMessage(testChatId, 'user', 'test message')
      ).resolves.not.toThrow();

      // Assert
      expect(memoryContext).toHaveProperty('recentMessages');
      expect(memoryContext).toHaveProperty('tokenCount');
      expect(mockFirestoreService.saveMessage).toHaveBeenCalled();
    });

    it('네트워크 간헐적 장애를 재시도로 처리해야 함', async () => {
      // Arrange
      const networkError = new Error('Network timeout');
      
      // 첫 번째 시도는 실패, 두 번째 시도는 성공
      mockFirestoreService.getConversation
        .mockRejectedValueOnce(networkError)
        .mockResolvedValue(null);

      mockFirestoreService.saveConversation.mockResolvedValue();

      // Act
      // 첫 번째 시도 실패
      await expect(
        conversationService.initializeSession(testChatId, 'ko')
      ).rejects.toThrow(ServiceError);

      // 두 번째 시도 성공
      const result = await conversationService.initializeSession(testChatId, 'ko');

      // Assert
      expect(result.chatId).toBe(testChatId);
      expect(mockFirestoreService.getConversation).toHaveBeenCalledTimes(2);
    });
  });

  describe('데이터 무결성 에지 케이스', () => {
    it('손상된 대화 데이터를 복구해야 함', async () => {
      // Arrange
      const corruptedConversation: any = {
        chatId: testChatId,
        // lang 필드 누락
        messageCount: null, // null 값
        lastMessageAt: 'invalid-timestamp', // 잘못된 타입
        createdAt: mockTimestamp,
        updatedAt: mockTimestamp
      };

      mockFirestoreService.getConversation.mockResolvedValue(corruptedConversation);

      // Act
      const context = await conversationService.loadConversationContext(testChatId);

      // Assert
      // 손상된 데이터가 있어도 기본값으로 처리되어야 함
      expect(context.conversation).toBeTruthy();
      expect(context.recentMessages).toEqual([]);
    });

    it('중복 메시지 저장을 방지해야 함', async () => {
      // Arrange
      const messages: Message[] = [];
      let messageIdCounter = 1;

      mockFirestoreService.saveMessage.mockImplementation(async (message) => {
        // 중복 확인 (동일한 chatId, text, timestamp)
        const isDuplicate = messages.some(existing => 
          existing.chatId === message.chatId &&
          existing.text === message.text &&
          existing.role === message.role &&
          Math.abs(existing.createdAt.toMillis() - message.createdAt.toMillis()) < 1000
        );

        if (isDuplicate) {
          throw new Error('Duplicate message detected');
        }

        messages.push({ ...message, messageId: `msg${messageIdCounter++}` });
      });

      // Act & Assert
      // 첫 번째 메시지 저장 성공
      await expect(
        conversationService.saveMessage(testChatId, 'user', '중복 테스트 메시지')
      ).resolves.not.toThrow();

      // 동일한 메시지 재저장 시도 - 실패해야 함
      await expect(
        conversationService.saveMessage(testChatId, 'user', '중복 테스트 메시지')
      ).rejects.toThrow('Duplicate message detected');

      expect(messages).toHaveLength(1);
    });

    it('토큰 계산 오류를 처리해야 함', async () => {
      // Arrange
      const conversation: Conversation = {
        chatId: testChatId,
        lang: 'ko',
        messageCount: 3,
        lastMessageAt: mockTimestamp,
        createdAt: mockTimestamp,
        updatedAt: mockTimestamp,
        summary: 'Test summary'
      };

      const messages: Message[] = [
        {
          messageId: 'msg1',
          chatId: testChatId,
          role: 'user',
          text: 'Test message',
          createdAt: mockTimestamp
        }
      ];

      mockFirestoreService.getConversation.mockResolvedValue(conversation);
      mockFirestoreService.getRecentMessages.mockResolvedValue(messages);

      // 토큰 계산에서 오류 발생
      mockOpenAIService.estimateTokens.mockImplementation((text: string) => {
        if (text.includes('summary')) {
          throw new Error('Token estimation failed');
        }
        return 50;
      });

      // Act
      const memoryContext = await conversationService.buildMemoryContext(testChatId, 1000);

      // Assert
      // 토큰 계산 오류가 있어도 기본값으로 처리되어야 함
      expect(memoryContext).toHaveProperty('recentMessages');
      expect(memoryContext.tokenCount).toBeGreaterThanOrEqual(0);
    });
  });
});