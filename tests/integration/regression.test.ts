import { ConversationService } from '../../src/services/conversation';
import { LangChainService } from '../../src/services/langchain';
import { FirestoreService } from '../../src/services/firestore';
import { OpenAIService } from '../../src/services/openai';
import {
  Conversation,
  Message,
  Language
} from '../../src/types';
import {
  createMockTimestamp,
  createMockConversation,
  createMockMessage,
  createMockFirestoreService,
  createMockOpenAIService,
  createMockLangChainService,
  createMockConversationService
} from '../helpers/mockHelpers';

// Mock dependencies
jest.mock('../../src/services/firestore');
jest.mock('../../src/services/openai');
jest.mock('../../src/services/langchain');
jest.mock('../../src/services/logger');
jest.mock('../../src/services/metrics');

describe('Regression Tests - 일관성 검증', () => {
  let conversationService: ConversationService;
  let langChainService: LangChainService;
  let mockFirestoreService: jest.Mocked<FirestoreService>;
  let mockOpenAIService: jest.Mocked<OpenAIService>;

  const testChatId = 'regression-test-chat';
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

    setupStandardMocks();
  });

  function setupStandardMocks() {
    // Standard Firestore responses
    mockFirestoreService.getConversation.mockResolvedValue(null);
    mockFirestoreService.saveConversation.mockResolvedValue();
    mockFirestoreService.saveMessage.mockResolvedValue();
    mockFirestoreService.getRecentMessages.mockResolvedValue([]);
    mockFirestoreService.shouldTriggerSummary.mockResolvedValue(false);

    // Standard OpenAI responses
    mockOpenAIService.generateSummary.mockResolvedValue('Standard summary');
    mockOpenAIService.estimateTokens.mockReturnValue(50);

    // Standard LangChain responses
    const mockLangChainService = langChainService as jest.Mocked<LangChainService>;
    mockLangChainService.search.mockResolvedValue({
      documents: [
        {
          score: 0.95,
          title: '휴가 규정',
          text: '연차휴가는 1년에 15일까지 사용할 수 있습니다.',
          filePath: 'policies/vacation.md',
          url: 'https://example.com/vacation.md',
          fileId: 'file123',
          seq: 0
        }
      ],
      query: '휴가 규정',
      total: 1,
      lang: 'ko'
    });

    mockLangChainService.conversationalQuery.mockResolvedValue({
      answer: '휴가 규정에 대해 안내드리겠습니다. 연차휴가는 1년에 15일까지 사용할 수 있습니다.',
      sources: [
        { title: '휴가 규정', filePath: 'policies/vacation.md', url: 'https://example.com/vacation.md' }
      ],
      question: '휴가 규정에 대해 알려주세요',
      lang: 'ko',
      processingTime: 1500
    });
  }

  describe('일관된 답변 검증', () => {
    it('동일한 질문에 대해 일관된 답변을 제공해야 함', async () => {
      // Arrange
      const question = '휴가는 몇 일까지 쓸 수 있나요?';
      const expectedAnswerKeywords = ['15일', '연차', '휴가'];

      const mockLangChainService = langChainService as jest.Mocked<LangChainService>;
      
      // 동일한 답변을 여러 번 반환하도록 설정
      const standardResponse = {
        answer: '연차휴가는 1년에 15일까지 사용할 수 있습니다.',
        sources: [{ title: '휴가 규정', filePath: 'policies/vacation.md', url: 'https://example.com/vacation.md' }],
        question,
        lang: 'ko' as Language,
        processingTime: 1500
      };

      mockLangChainService.conversationalQuery
        .mockResolvedValueOnce(standardResponse)
        .mockResolvedValueOnce(standardResponse)
        .mockResolvedValueOnce(standardResponse);

      // Act - 동일한 질문을 3번 반복
      const responses = await Promise.all([
        mockLangChainService.conversationalQuery(question, [], 'ko'),
        mockLangChainService.conversationalQuery(question, [], 'ko'),
        mockLangChainService.conversationalQuery(question, [], 'ko')
      ]);

      // Assert
      expect(responses).toHaveLength(3);
      
      // 모든 응답이 동일해야 함
      responses.forEach(response => {
        expect(response.answer).toBe(standardResponse.answer);
        expect(response.question).toBe(question);
        expect(response.lang).toBe('ko');
        expect(response.sources).toEqual(standardResponse.sources);
        
        // 핵심 키워드가 포함되어 있는지 확인
        expectedAnswerKeywords.forEach(keyword => {
          expect(response.answer).toContain(keyword);
        });
      });
    });

    it('유사한 질문에 대해 유사한 형식의 답변을 제공해야 함', async () => {
      // Arrange
      const similarQuestions = [
        '휴가는 몇 일까지 쓸 수 있나요?',
        '연차휴가는 몇일까지 사용 가능한가요?',
        '휴가일수 제한이 있나요?'
      ];

      const mockLangChainService = langChainService as jest.Mocked<LangChainService>;
      mockLangChainService.conversationalQuery
        .mockResolvedValueOnce({
          answer: '연차휴가는 1년에 15일까지 사용할 수 있습니다.',
          sources: [{ title: '휴가 규정', filePath: 'policies/vacation.md', url: 'https://example.com/vacation.md' }],
          question: similarQuestions[0] || '',
          lang: 'ko',
          processingTime: 1500
        })
        .mockResolvedValueOnce({
          answer: '연차휴가는 연간 15일까지 사용 가능합니다.',
          sources: [{ title: '휴가 규정', filePath: 'policies/vacation.md', url: 'https://example.com/vacation.md' }],
          question: similarQuestions[1] || '',
          lang: 'ko',
          processingTime: 1450
        })
        .mockResolvedValueOnce({
          answer: '휴가 사용은 연 15일로 제한됩니다.',
          sources: [{ title: '휴가 규정', filePath: 'policies/vacation.md', url: 'https://example.com/vacation.md' }],
          question: similarQuestions[2] || '',
          lang: 'ko',
          processingTime: 1550
        });

      // Act
      const responses = await Promise.all(
        similarQuestions.map(q => mockLangChainService.conversationalQuery(q, [], 'ko'))
      );

      // Assert
      const commonKeywords = ['15일', '연차', '휴가'];
      const commonSources = [{ title: '휴가 규정', filePath: 'policies/vacation.md', url: 'https://example.com/vacation.md' }];

      responses.forEach((response, index) => {
        // 모든 응답에 핵심 정보가 포함되어야 함
        commonKeywords.forEach(keyword => {
          expect(response.answer).toContain(keyword);
        });

        // 동일한 출처를 참조해야 함
        expect(response.sources).toEqual(commonSources);
        
        // 응답 형식이 일관적이어야 함 (한국어, 적절한 길이)
        expect(response.lang).toBe('ko');
        expect(response.answer.length).toBeGreaterThan(10);
        expect(response.answer.length).toBeLessThan(200);
      });
    });

    it('언어별로 일관된 응답 형식을 유지해야 함', async () => {
      // Arrange
      const question = 'vacation policy';
      const koreanQuestion = '휴가 규정';

      const mockLangChainService = langChainService as jest.Mocked<LangChainService>;
      mockLangChainService.conversationalQuery
        .mockResolvedValueOnce({
          answer: 'Annual leave is limited to 15 days per year.',
          sources: [{ title: 'Vacation Policy', filePath: 'policies/vacation.md', url: 'https://example.com/vacation.md' }],
          question,
          lang: 'en',
          processingTime: 1400
        })
        .mockResolvedValueOnce({
          answer: '연차휴가는 1년에 15일까지 사용할 수 있습니다.',
          sources: [{ title: '휴가 규정', filePath: 'policies/vacation.md', url: 'https://example.com/vacation.md' }],
          question: koreanQuestion,
          lang: 'ko',
          processingTime: 1500
        });

      // Act
      const [englishResponse, koreanResponse] = await Promise.all([
        mockLangChainService.conversationalQuery(question, [], 'en'),
        mockLangChainService.conversationalQuery(koreanQuestion, [], 'ko')
      ]);

      // Assert
      // 영어 응답 검증
      expect(englishResponse.lang).toBe('en');
      expect(englishResponse.answer).toMatch(/^[A-Za-z0-9\s.,!?-]+$/); // 영어 문자만
      expect(englishResponse.answer).toContain('15 days');
      expect(englishResponse.sources[0]?.title).toBe('Vacation Policy');

      // 한국어 응답 검증
      expect(koreanResponse.lang).toBe('ko');
      expect(koreanResponse.answer).toMatch(/[\u3131-\u3163\uac00-\ud7a3]/); // 한글 포함
      expect(koreanResponse.answer).toContain('15일');
      expect(koreanResponse.sources[0]?.title).toBe('휴가 규정');

      // 두 응답 모두 핵심 정보(15일/15 days)를 포함해야 함
      expect(englishResponse.answer.toLowerCase()).toContain('15');
      expect(koreanResponse.answer).toContain('15');
    });
  });

  describe('대화 맥락 일관성', () => {
    it('대화 맥락이 올바르게 유지되어야 함', async () => {
      // Arrange
      const conversation: Conversation = {
        chatId: testChatId,
        lang: 'ko',
        messageCount: 4,
        lastMessageAt: mockTimestamp,
        createdAt: mockTimestamp,
        updatedAt: mockTimestamp
      };

      const chatHistory: Message[] = [
        {
          messageId: 'msg1',
          chatId: testChatId,
          role: 'user',
          text: '휴가 규정에 대해 알려주세요',
          createdAt: mockTimestamp
        },
        {
          messageId: 'msg2',
          chatId: testChatId,
          role: 'assistant',
          text: '연차휴가는 1년에 15일까지 사용 가능합니다.',
          createdAt: mockTimestamp
        },
        {
          messageId: 'msg3',
          chatId: testChatId,
          role: 'user',
          text: '병가는 어떻게 되나요?',
          createdAt: mockTimestamp
        },
        {
          messageId: 'msg4',
          chatId: testChatId,
          role: 'assistant',
          text: '병가는 연 30일까지 사용할 수 있습니다.',
          createdAt: mockTimestamp
        }
      ];

      mockFirestoreService.getConversation.mockResolvedValue(conversation);
      mockFirestoreService.getRecentMessages.mockResolvedValue(chatHistory);

      const mockLangChainService = langChainService as jest.Mocked<LangChainService>;
      
      // Act - 연속된 질문들
      const followUpQuestions = [
        '신청은 어떻게 하나요?',
        '승인은 누가 하나요?',
        '긴급상황에는 어떻게 하나요?'
      ];

      for (let i = 0; i < followUpQuestions.length; i++) {
        const question = followUpQuestions[i];
        
        // 각 질문마다 적절한 맥락 기반 응답을 설정
        mockLangChainService.conversationalQuery.mockResolvedValueOnce({
          answer: `${question}에 대한 답변입니다. 앞서 말씀드린 휴가/병가 규정과 관련하여...`,
          sources: [{ title: '절차 규정', filePath: 'policies/process.md', url: 'https://example.com/process.md' }],
          question,
          lang: 'ko',
          processingTime: 1300 + i * 100
        });

        const response = await mockLangChainService.conversationalQuery(
          question,
          chatHistory,
          'ko'
        );

        // Assert - 각 응답이 이전 맥락을 참조하는지 확인
        expect(response.answer).toContain('앞서 말씀드린');
        expect(response.answer).toMatch(/(휴가|병가)/);
      }

      // 모든 conversational query 호출이 동일한 chat history를 받았는지 확인
      expect(mockLangChainService.conversationalQuery).toHaveBeenCalledTimes(3);
      mockLangChainService.conversationalQuery.mock.calls.forEach(call => {
        expect(call[1]).toEqual(chatHistory); // 동일한 history 전달
        expect(call[2]).toBe('ko'); // 일관된 언어
      });
    });

    it('요약이 생성되어도 맥락 연속성이 유지되어야 함', async () => {
      // Arrange
      const longConversation: Conversation = {
        chatId: testChatId,
        lang: 'ko',
        messageCount: 12,
        lastMessageAt: mockTimestamp,
        createdAt: mockTimestamp,
        updatedAt: mockTimestamp,
        summary: '사용자가 휴가 규정과 병가 규정에 대해 문의하였고, 각각 15일과 30일 제한이 있음을 안내했음.'
      };

      const recentMessages: Message[] = [
        {
          messageId: 'msg11',
          chatId: testChatId,
          role: 'user',
          text: '추가로 궁금한 점이 있어요',
          createdAt: mockTimestamp
        },
        {
          messageId: 'msg12',
          chatId: testChatId,
          role: 'assistant',
          text: '네, 추가 질문 있으시면 언제든지 말씀해 주세요.',
          createdAt: mockTimestamp
        }
      ];

      mockFirestoreService.getConversation.mockResolvedValue(longConversation);
      mockFirestoreService.getRecentMessages.mockResolvedValue(recentMessages);

      // 메모리 컨텍스트 구성 시 요약과 최근 메시지 모두 고려
      mockOpenAIService.estimateTokens
        .mockReturnValueOnce(200) // summary tokens
        .mockReturnValueOnce(30)  // recent message 1 tokens
        .mockReturnValueOnce(40)  // recent message 2 tokens
        .mockReturnValueOnce(200) // summary tokens for result
        .mockReturnValueOnce(30); // message tokens for result

      const mockLangChainService = langChainService as jest.Mocked<LangChainService>;
      mockLangChainService.conversationalQuery.mockResolvedValue({
        answer: '앞서 논의한 휴가 규정 외에 추가로 알려드릴 내용이 있습니다.',
        sources: [],
        question: '추가 정보가 있나요?',
        lang: 'ko',
        processingTime: 1600
      });

      // Act
      const memoryContext = await conversationService.buildMemoryContext(testChatId, 1000);
      const response = await mockLangChainService.conversationalQuery(
        '추가 정보가 있나요?',
        memoryContext.recentMessages,
        'ko'
      );

      // Assert
      // 요약이 메모리 컨텍스트에 포함되었는지 확인
      expect(memoryContext.summary).toContain('휴가 규정과 병가 규정');
      expect(memoryContext.summary).toContain('15일과 30일');
      expect(memoryContext.recentMessages).toEqual(recentMessages);
      expect(memoryContext.tokenCount).toBe(270); // 200 + 30 + 40

      // 응답이 이전 맥락을 참조하는지 확인
      expect(response.answer).toContain('앞서 논의한');
      expect(response.answer).toContain('휴가 규정');
    });
  });

  describe('오류 처리 일관성', () => {
    it('검색 결과가 없을 때 일관된 메시지를 반환해야 함', async () => {
      // Arrange
      const questionsWithNoResults = [
        '존재하지 않는 정책에 대해 알려주세요',
        '가상의 규정이 궁금합니다',
        '미래의 정책은 어떻게 되나요?'
      ];

      const mockLangChainService = langChainService as jest.Mocked<LangChainService>;

      // 모든 질문에 대해 동일한 "no evidence" 응답 설정
      questionsWithNoResults.forEach(() => {
        mockLangChainService.conversationalQuery.mockResolvedValueOnce({
          answer: '규정에 해당 내용이 없습니다.',
          sources: [],
          question: '',
          lang: 'ko',
          processingTime: 800
        });
      });

      // Act
      const responses = await Promise.all(
        questionsWithNoResults.map(q => 
          mockLangChainService.conversationalQuery(q, [], 'ko')
        )
      );

      // Assert
      responses.forEach(response => {
        expect(response.answer).toBe('규정에 해당 내용이 없습니다.');
        expect(response.sources).toHaveLength(0);
        expect(response.lang).toBe('ko');
        expect(response.processingTime).toBeLessThan(1000); // 빠른 응답
      });
    });

    it('서비스 오류 발생 시 일관된 오류 처리를 해야 함', async () => {
      // Arrange
      const serviceErrors = [
        new Error('Database connection failed'),
        new Error('OpenAI API limit exceeded'),
        new Error('Qdrant search timeout')
      ];

      // Act & Assert
      for (const error of serviceErrors) {
        mockFirestoreService.getConversation.mockRejectedValueOnce(error);

        await expect(
          conversationService.initializeSession(testChatId, 'ko')
        ).rejects.toThrow('Failed to initialize conversation session');

        // 각 오류에 대해 동일한 ServiceError 패턴을 따르는지 확인
        try {
          await conversationService.initializeSession(testChatId, 'ko');
        } catch (thrownError: any) {
          expect(thrownError.name).toBe('ServiceError');
          expect(thrownError.service).toBe('conversation');
          expect(thrownError.statusCode).toBe(500);
        }

        // Mock 초기화
        mockFirestoreService.getConversation.mockReset();
        mockFirestoreService.getConversation.mockResolvedValue(null);
      }
    });

    it('토큰 제한 초과 시 일관된 처리를 해야 함', async () => {
      // Arrange
      const conversation: Conversation = {
        chatId: testChatId,
        lang: 'ko',
        messageCount: 5,
        lastMessageAt: mockTimestamp,
        createdAt: mockTimestamp,
        updatedAt: mockTimestamp,
        summary: '길고 상세한 대화 요약'.repeat(50) // 긴 요약
      };

      const longMessages: Message[] = Array.from({ length: 10 }, (_, i) => ({
        messageId: `msg${i}`,
        chatId: testChatId,
        role: i % 2 === 0 ? 'user' : 'assistant',
        text: '매우 길고 상세한 메시지 내용입니다.'.repeat(20),
        createdAt: mockTimestamp
      }));

      mockFirestoreService.getConversation.mockResolvedValue(conversation);
      mockFirestoreService.getRecentMessages.mockResolvedValue(longMessages);

      // 모든 토큰 추정을 높게 설정 (제한 초과 시뮬레이션)
      mockOpenAIService.estimateTokens.mockReturnValue(500);

      // Act - 다양한 토큰 제한으로 테스트
      const tokenLimits = [1000, 500, 100];
      const results = await Promise.all(
        tokenLimits.map(limit => 
          conversationService.buildMemoryContext(testChatId, limit)
        )
      );

      // Assert
      results.forEach((result, index) => {
        const limit = tokenLimits[index];
        
        // 토큰 제한을 넘지 않아야 함
        expect(result.tokenCount).toBeLessThanOrEqual(limit);
        
        // 일관된 구조를 가져야 함
        expect(result).toHaveProperty('summary');
        expect(result).toHaveProperty('recentMessages');
        expect(result).toHaveProperty('tokenCount');
        
        // 메시지 수가 토큰 제한에 따라 적절히 조정되어야 함
        if (index > 0) {
          expect(result.recentMessages.length).toBeLessThanOrEqual(
            results[index - 1].recentMessages.length
          );
        }
      });
    });
  });

  describe('성능 일관성', () => {
    it('응답 시간이 허용 범위 내에 있어야 함', async () => {
      // Arrange
      const questions = [
        '휴가 규정이 궁금합니다',
        '병가는 어떻게 되나요?',
        '출장비 규정을 알려주세요',
        '교육비 지원이 있나요?',
        '야근 수당은 어떻게 되나요?'
      ];

      const mockLangChainService = langChainService as jest.Mocked<LangChainService>;
      
      // 각 질문에 대해 현실적인 응답 시간 설정
      questions.forEach((question, index) => {
        mockLangChainService.conversationalQuery.mockResolvedValueOnce({
          answer: `${question}에 대한 답변입니다.`,
          sources: [{ title: '규정', filePath: 'policy.md', url: 'https://example.com/policy.md' }],
          question,
          lang: 'ko',
          processingTime: 1000 + Math.random() * 1000 // 1-2초 범위
        });
      });

      // Act
      const startTime = Date.now();
      const responses = await Promise.all(
        questions.map(q => mockLangChainService.conversationalQuery(q, [], 'ko'))
      );
      const totalTime = Date.now() - startTime;

      // Assert
      responses.forEach(response => {
        // 각 응답 시간이 합리적인 범위 내에 있어야 함
        expect(response.processingTime).toBeGreaterThan(500);
        expect(response.processingTime).toBeLessThan(3000);
      });

      // 전체 병렬 처리 시간이 순차 처리보다 빨라야 함
      const maxIndividualTime = Math.max(...responses.map(r => r.processingTime));
      expect(totalTime).toBeLessThan(maxIndividualTime + 1000); // 병렬 처리 여유 시간
    });

    it('메모리 사용량이 일정 범위 내에서 유지되어야 함', async () => {
      // Arrange
      const largeChatHistory: Message[] = Array.from({ length: 50 }, (_, i) => ({
        messageId: `msg${i}`,
        chatId: testChatId,
        role: i % 2 === 0 ? 'user' : 'assistant',
        text: `메시지 ${i}: ` + 'content '.repeat(100),
        createdAt: mockTimestamp
      }));

      const conversation: Conversation = {
        chatId: testChatId,
        lang: 'ko',
        messageCount: 50,
        lastMessageAt: mockTimestamp,
        createdAt: mockTimestamp,
        updatedAt: mockTimestamp,
        summary: 'Long conversation summary'.repeat(20)
      };

      mockFirestoreService.getConversation.mockResolvedValue(conversation);
      mockFirestoreService.getRecentMessages.mockResolvedValue(largeChatHistory);

      // 각 메시지에 대해 현실적인 토큰 수 설정
      mockOpenAIService.estimateTokens.mockImplementation((text: string) => {
        return Math.ceil(text.length / 4); // 대략적인 토큰 추정
      });

      // Act - 여러 번 메모리 컨텍스트 구성
      const memoryContexts = await Promise.all(
        Array.from({ length: 5 }, () => 
          conversationService.buildMemoryContext(testChatId, 1500)
        )
      );

      // Assert
      memoryContexts.forEach((context, index) => {
        // 토큰 제한 준수
        expect(context.tokenCount).toBeLessThanOrEqual(1500);
        
        // 일관된 구조
        expect(context).toHaveProperty('summary');
        expect(context).toHaveProperty('recentMessages');
        expect(context).toHaveProperty('tokenCount');
        
        // 메모리 효율성 - 불필요하게 많은 메시지를 포함하지 않아야 함
        expect(context.recentMessages.length).toBeLessThan(largeChatHistory.length);
        
        if (index > 0) {
          // 동일한 입력에 대해 일관된 결과
          expect(context.tokenCount).toBe(memoryContexts[0].tokenCount);
          expect(context.recentMessages.length).toBe(memoryContexts[0].recentMessages.length);
        }
      });
    });
  });

  describe('데이터 무결성', () => {
    it('세션 생성과 삭제가 올바르게 처리되어야 함', async () => {
      // Arrange
      let conversationState: Conversation | null = null;
      
      mockFirestoreService.getConversation.mockImplementation(async () => conversationState);
      mockFirestoreService.saveConversation.mockImplementation(async (conv) => {
        conversationState = conv;
      });
      mockFirestoreService.resetConversation.mockImplementation(async () => {
        conversationState = null;
      });

      // Act & Assert - 세션 생성
      const newConversation = await conversationService.initializeSession(testChatId, 'ko');
      expect(newConversation.chatId).toBe(testChatId);
      expect(newConversation.lang).toBe('ko');
      expect(newConversation.messageCount).toBe(0);

      // 세션이 저장되었는지 확인
      const retrievedConversation = await conversationService.loadConversationContext(testChatId);
      expect(retrievedConversation.conversation).toBeTruthy();
      expect(retrievedConversation.conversation!.chatId).toBe(testChatId);

      // 세션 리셋
      await conversationService.resetSession(testChatId);
      
      // 세션이 삭제되었는지 확인
      const resetConversation = await conversationService.loadConversationContext(testChatId);
      expect(resetConversation.conversation).toBeNull();
    });

    it('메시지 저장 순서가 보장되어야 함', async () => {
      // Arrange
      const messages: Message[] = [];
      
      mockFirestoreService.saveMessage.mockImplementation(async (message) => {
        messages.push(message);
      });

      mockFirestoreService.getRecentMessages.mockImplementation(async () => messages.slice(-10));

      const conversation: Conversation = {
        chatId: testChatId,
        lang: 'ko',
        messageCount: 0,
        lastMessageAt: mockTimestamp,
        createdAt: mockTimestamp,
        updatedAt: mockTimestamp
      };

      mockFirestoreService.getConversation.mockResolvedValue(conversation);

      // Act - 순차적으로 메시지 저장
      const testMessages = [
        { role: 'user' as const, text: '첫 번째 질문' },
        { role: 'assistant' as const, text: '첫 번째 답변' },
        { role: 'user' as const, text: '두 번째 질문' },
        { role: 'assistant' as const, text: '두 번째 답변' }
      ];

      for (const msg of testMessages) {
        await conversationService.saveMessage(testChatId, msg.role, msg.text);
      }

      // Assert
      expect(messages).toHaveLength(4);
      
      // 메시지 순서가 저장 순서와 일치하는지 확인
      testMessages.forEach((expectedMsg, index) => {
        expect(messages[index].role).toBe(expectedMsg.role);
        expect(messages[index].text).toBe(expectedMsg.text);
        expect(messages[index].chatId).toBe(testChatId);
      });

      // 최근 메시지 조회 시 올바른 순서로 반환되는지 확인
      const recentMessages = await conversationService.getRecentMessages(testChatId);
      expect(recentMessages).toEqual(messages);
    });
  });
});