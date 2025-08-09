import { ConversationService } from '../../src/services/conversation';
import { LangChainService } from '../../src/services/langchain';
import { FirestoreService } from '../../src/services/firestore';
import { OpenAIService } from '../../src/services/openai';
import { TelegramService } from '../../src/services/telegram';
import {
  Conversation,
  Message,
  MessageRole,
  Language,
  RAGQueryResponse,
  TelegramContext,
  DEFAULT_VALUES
} from '../../src/types';
import { Timestamp } from '@google-cloud/firestore';

// Mock external services
jest.mock('../../src/services/firestore');
jest.mock('../../src/services/openai');
jest.mock('../../src/services/langchain');
jest.mock('../../src/services/logger');
jest.mock('../../src/services/metrics');
jest.mock('../../src/services/telegram');

describe('Conversation Flow Integration Tests', () => {
  let conversationService: ConversationService;
  let langChainService: LangChainService;
  let telegramService: TelegramService;
  let mockFirestoreService: jest.Mocked<FirestoreService>;
  let mockOpenAIService: jest.Mocked<OpenAIService>;

  const mockChatId = 'integration-test-chat';
  const mockTimestamp = Timestamp.fromDate(new Date('2024-01-01T00:00:00Z'));

  beforeEach(() => {
    jest.clearAllMocks();

    mockFirestoreService = new FirestoreService() as jest.Mocked<FirestoreService>;
    mockOpenAIService = new OpenAIService() as jest.Mocked<OpenAIService>;
    langChainService = new LangChainService() as jest.Mocked<LangChainService>;
    telegramService = new TelegramService() as jest.Mocked<TelegramService>;

    conversationService = new ConversationService(
      mockFirestoreService,
      mockOpenAIService
    );

    // Setup default mocks
    mockFirestoreService.getConversation.mockResolvedValue(null);
    mockFirestoreService.saveConversation.mockResolvedValue();
    mockFirestoreService.saveMessage.mockResolvedValue();
    mockFirestoreService.getRecentMessages.mockResolvedValue([]);
    mockFirestoreService.shouldTriggerSummary.mockResolvedValue(false);
    mockOpenAIService.generateSummary.mockResolvedValue('Generated summary');
    mockOpenAIService.estimateTokens.mockReturnValue(50);
  });

  describe('연속 질문 시나리오', () => {
    it('연속된 질문이 맥락을 유지하며 처리되어야 함', async () => {
      // Arrange - 초기 세션 설정
      const conversation: Conversation = {
        chatId: mockChatId,
        lang: 'ko',
        messageCount: 0,
        lastMessageAt: mockTimestamp,
        createdAt: mockTimestamp,
        updatedAt: mockTimestamp
      };

      mockFirestoreService.getConversation
        .mockResolvedValueOnce(null) // 초기 세션 생성시
        .mockResolvedValue(conversation);

      // Mock LangChain responses
      const mockLangChainService = langChainService as jest.Mocked<LangChainService>;
      mockLangChainService.conversationalQuery
        .mockResolvedValueOnce({
          answer: '연차휴가는 1년에 15일까지 사용할 수 있습니다.',
          sources: [{ title: '휴가 규정', filePath: 'policies/vacation.md', url: 'https://example.com/vacation.md' }],
          question: '연차휴가는 몇 일까지 쓸 수 있나요?',
          lang: 'ko',
          processingTime: 1500
        })
        .mockResolvedValueOnce({
          answer: '병가는 연차와 별도로 1년에 30일까지 사용할 수 있습니다.',
          sources: [{ title: '병가 규정', filePath: 'policies/sick-leave.md', url: 'https://example.com/sick-leave.md' }],
          question: '병가는 어떻게 되나요?',
          lang: 'ko',
          processingTime: 1200
        })
        .mockResolvedValueOnce({
          answer: '휴가 신청은 최소 3일 전에 상급자에게 서면으로 신청해야 합니다.',
          sources: [{ title: '휴가 신청 절차', filePath: 'policies/vacation-process.md', url: 'https://example.com/vacation-process.md' }],
          question: '신청 절차는 어떻게 되나요?',
          lang: 'ko',
          processingTime: 1300
        });

      // Act - 연속된 3개의 질문 시뮬레이션
      
      // 1. 세션 초기화 및 첫 번째 질문
      await conversationService.initializeSession(mockChatId, 'ko');
      await conversationService.saveMessage(mockChatId, 'user', '연차휴가는 몇 일까지 쓸 수 있나요?');
      
      const context1 = await conversationService.loadConversationContext(mockChatId);
      const response1 = await mockLangChainService.conversationalQuery(
        '연차휴가는 몇 일까지 쓸 수 있나요?',
        context1.recentMessages,
        'ko'
      );
      await conversationService.saveMessage(mockChatId, 'assistant', response1.answer, {
        sources: response1.sources.map(s => s.title),
        processingTime: response1.processingTime
      });

      // 2. 두 번째 질문 (맥락 포함)
      await conversationService.saveMessage(mockChatId, 'user', '병가는 어떻게 되나요?');
      
      const context2 = await conversationService.loadConversationContext(mockChatId);
      const response2 = await mockLangChainService.conversationalQuery(
        '병가는 어떻게 되나요?',
        context2.recentMessages,
        'ko'
      );
      await conversationService.saveMessage(mockChatId, 'assistant', response2.answer);

      // 3. 세 번째 질문 (추가 맥락 포함)
      await conversationService.saveMessage(mockChatId, 'user', '신청 절차는 어떻게 되나요?');
      
      const context3 = await conversationService.loadConversationContext(mockChatId);
      const response3 = await mockLangChainService.conversationalQuery(
        '신청 절차는 어떻게 되나요?',
        context3.recentMessages,
        'ko'
      );
      await conversationService.saveMessage(mockChatId, 'assistant', response3.answer);

      // Assert - 각 단계별 확인
      expect(mockFirestoreService.saveMessage).toHaveBeenCalledTimes(6); // 3개 user + 3개 assistant
      
      // 첫 번째 conversational query는 빈 히스토리로 호출
      expect(mockLangChainService.conversationalQuery).toHaveBeenNthCalledWith(
        1,
        '연차휴가는 몇 일까지 쓸 수 있나요?',
        [],
        'ko'
      );

      // 두 번째 conversational query는 이전 대화를 포함
      expect(mockLangChainService.conversationalQuery).toHaveBeenNthCalledWith(
        2,
        '병가는 어떻게 되나요?',
        expect.any(Array),
        'ko'
      );

      // 세 번째 conversational query는 더 많은 대화 맥락을 포함
      expect(mockLangChainService.conversationalQuery).toHaveBeenNthCalledWith(
        3,
        '신청 절차는 어떻게 되나요?',
        expect.any(Array),
        'ko'
      );

      // 응답 검증
      expect(response1.answer).toContain('15일');
      expect(response2.answer).toContain('30일');
      expect(response3.answer).toContain('3일 전');
    });

    it('대화 중 언어 변경이 올바르게 처리되어야 함', async () => {
      // Arrange
      const conversation: Conversation = {
        chatId: mockChatId,
        lang: 'ko',
        messageCount: 2,
        lastMessageAt: mockTimestamp,
        createdAt: mockTimestamp,
        updatedAt: mockTimestamp
      };

      mockFirestoreService.getConversation
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(conversation)
        .mockResolvedValue({ ...conversation, lang: 'en' });

      const mockLangChainService = langChainService as jest.Mocked<LangChainService>;
      mockLangChainService.conversationalQuery
        .mockResolvedValueOnce({
          answer: '휴가 규정은 다음과 같습니다.',
          sources: [],
          question: '휴가 규정을 알려주세요',
          lang: 'ko',
          processingTime: 1000
        })
        .mockResolvedValueOnce({
          answer: 'Vacation policy allows up to 15 days per year.',
          sources: [],
          question: 'What about vacation policy?',
          lang: 'en',
          processingTime: 1100
        });

      // Act
      // 1. 한국어로 시작
      await conversationService.initializeSession(mockChatId, 'ko');
      await conversationService.saveMessage(mockChatId, 'user', '휴가 규정을 알려주세요');
      
      const context1 = await conversationService.loadConversationContext(mockChatId);
      const response1 = await mockLangChainService.conversationalQuery(
        '휴가 규정을 알려주세요',
        context1.recentMessages,
        'ko'
      );
      await conversationService.saveMessage(mockChatId, 'assistant', response1.answer);

      // 2. 언어를 영어로 변경
      await conversationService.updateLanguage(mockChatId, 'en');
      await conversationService.saveMessage(mockChatId, 'user', 'What about vacation policy?');
      
      const context2 = await conversationService.loadConversationContext(mockChatId);
      const response2 = await mockLangChainService.conversationalQuery(
        'What about vacation policy?',
        context2.recentMessages,
        'en'
      );
      await conversationService.saveMessage(mockChatId, 'assistant', response2.answer);

      // Assert
      expect(conversationService.updateLanguage).toHaveBeenCalledWith(mockChatId, 'en');
      expect(mockLangChainService.conversationalQuery).toHaveBeenNthCalledWith(
        1,
        '휴가 규정을 알려주세요',
        expect.any(Array),
        'ko'
      );
      expect(mockLangChainService.conversationalQuery).toHaveBeenNthCalledWith(
        2,
        'What about vacation policy?',
        expect.any(Array),
        'en'
      );

      expect(response1.lang).toBe('ko');
      expect(response2.lang).toBe('en');
    });
  });

  describe('맥락 유지 테스트', () => {
    it('긴 대화에서 요약이 자동으로 생성되고 맥락이 유지되어야 함', async () => {
      // Arrange
      const conversation: Conversation = {
        chatId: mockChatId,
        lang: 'ko',
        messageCount: 12,
        lastMessageAt: mockTimestamp,
        createdAt: mockTimestamp,
        updatedAt: mockTimestamp
      };

      // 기존 대화 메시지들 (요약 트리거를 위해 많은 메시지)
      const existingMessages: Message[] = Array.from({ length: 12 }, (_, i) => ({
        messageId: `msg${i}`,
        chatId: mockChatId,
        role: (i % 2 === 0 ? 'user' : 'assistant') as MessageRole,
        text: `메시지 내용 ${i}`,
        createdAt: mockTimestamp
      }));

      mockFirestoreService.getConversation.mockResolvedValue(conversation);
      mockFirestoreService.getRecentMessages
        .mockResolvedValue(existingMessages.slice(-DEFAULT_VALUES.MAX_RECENT_MESSAGES))
        .mockResolvedValueOnce(existingMessages.slice(-DEFAULT_VALUES.SUMMARY_TRIGGER_MESSAGES)); // 요약 생성용

      // 요약 트리거 활성화
      mockFirestoreService.shouldTriggerSummary.mockResolvedValue(true);
      mockFirestoreService.updateConversationSummary.mockResolvedValue();

      const mockLangChainService = langChainService as jest.Mocked<LangChainService>;
      mockLangChainService.conversationalQuery.mockResolvedValue({
        answer: '새로운 질문에 대한 답변입니다.',
        sources: [],
        question: '새로운 질문입니다',
        lang: 'ko',
        processingTime: 1400
      });

      // Act
      // 새로운 메시지 추가 (요약 트리거)
      await conversationService.saveMessage(mockChatId, 'user', '새로운 질문입니다');
      
      // 메모리 컨텍스트 구성
      const memoryContext = await conversationService.buildMemoryContext(mockChatId, 1500);
      
      // 대화형 질의 (요약된 맥락 포함)
      const response = await mockLangChainService.conversationalQuery(
        '새로운 질문입니다',
        memoryContext.recentMessages,
        'ko'
      );

      // Assert
      expect(mockFirestoreService.shouldTriggerSummary).toHaveBeenCalledWith(mockChatId);
      expect(mockOpenAIService.generateSummary).toHaveBeenCalledWith(
        existingMessages.slice(-DEFAULT_VALUES.SUMMARY_TRIGGER_MESSAGES)
      );
      expect(mockFirestoreService.updateConversationSummary).toHaveBeenCalledWith(
        mockChatId,
        'Generated summary'
      );

      // 메모리 컨텍스트가 토큰 제한 내에서 구성되었는지 확인
      expect(memoryContext.tokenCount).toBeLessThanOrEqual(1500);
      expect(memoryContext.recentMessages.length).toBeGreaterThan(0);

      expect(mockLangChainService.conversationalQuery).toHaveBeenCalledWith(
        '새로운 질문입니다',
        memoryContext.recentMessages,
        'ko'
      );
    });

    it('메모리 토큰 제한으로 인한 메시지 잘림이 올바르게 처리되어야 함', async () => {
      // Arrange
      const conversation: Conversation = {
        chatId: mockChatId,
        lang: 'ko',
        messageCount: 6,
        lastMessageAt: mockTimestamp,
        createdAt: mockTimestamp,
        updatedAt: mockTimestamp,
        summary: '이전 대화 요약'
      };

      const longMessages: Message[] = [
        {
          messageId: 'msg1',
          chatId: mockChatId,
          role: 'user',
          text: '매우 긴 첫 번째 메시지'.repeat(50), // 긴 메시지
          createdAt: mockTimestamp
        },
        {
          messageId: 'msg2',
          chatId: mockChatId,
          role: 'assistant',
          text: '매우 긴 첫 번째 응답'.repeat(50),
          createdAt: mockTimestamp
        },
        {
          messageId: 'msg3',
          chatId: mockChatId,
          role: 'user',
          text: '짧은 두 번째 메시지',
          createdAt: mockTimestamp
        },
        {
          messageId: 'msg4',
          chatId: mockChatId,
          role: 'assistant',
          text: '짧은 두 번째 응답',
          createdAt: mockTimestamp
        }
      ];

      mockFirestoreService.getConversation.mockResolvedValue(conversation);
      mockFirestoreService.getRecentMessages.mockResolvedValue(longMessages);

      // 토큰 추정: 요약 50, 긴 메시지 각각 500, 짧은 메시지 각각 20
      mockOpenAIService.estimateTokens
        .mockReturnValueOnce(50)   // summary
        .mockReturnValueOnce(500)  // long message 1
        .mockReturnValueOnce(500)  // long response 1  
        .mockReturnValueOnce(20)   // short message 2
        .mockReturnValueOnce(20)   // short response 2
        .mockReturnValue(50);      // summary for result calculation

      // Act
      const memoryContext = await conversationService.buildMemoryContext(mockChatId, 200);

      // Assert
      expect(memoryContext.summary).toBe('이전 대화 요약');
      expect(memoryContext.tokenCount).toBeLessThanOrEqual(200);
      
      // 토큰 제한으로 인해 긴 메시지는 제외되고 짧은 메시지만 포함되어야 함
      expect(memoryContext.recentMessages).toHaveLength(2);
      expect(memoryContext.recentMessages[0].text).toBe('짧은 두 번째 메시지');
      expect(memoryContext.recentMessages[1].text).toBe('짧은 두 번째 응답');
    });

    it('세션 리셋 후 맥락이 초기화되어야 함', async () => {
      // Arrange
      const conversation: Conversation = {
        chatId: mockChatId,
        lang: 'ko',
        messageCount: 5,
        lastMessageAt: mockTimestamp,
        createdAt: mockTimestamp,
        updatedAt: mockTimestamp,
        summary: '이전 대화 요약'
      };

      mockFirestoreService.getConversation
        .mockResolvedValueOnce(conversation) // 리셋 전
        .mockResolvedValueOnce(null);        // 리셋 후

      mockFirestoreService.resetConversation.mockResolvedValue();

      const mockLangChainService = langChainService as jest.Mocked<LangChainService>;
      mockLangChainService.conversationalQuery.mockResolvedValue({
        answer: '새로운 세션에서의 답변입니다.',
        sources: [],
        question: '리셋 후 첫 질문',
        lang: 'ko',
        processingTime: 800
      });

      // Act
      // 1. 기존 대화가 있는 상태에서 맥락 로드
      const contextBefore = await conversationService.loadConversationContext(mockChatId);
      
      // 2. 세션 리셋
      await conversationService.resetSession(mockChatId);
      
      // 3. 새 세션 초기화 및 맥락 로드
      await conversationService.initializeSession(mockChatId, 'ko');
      const contextAfter = await conversationService.loadConversationContext(mockChatId);
      
      // 4. 새 세션에서 질문
      await conversationService.saveMessage(mockChatId, 'user', '리셋 후 첫 질문');
      const response = await mockLangChainService.conversationalQuery(
        '리셋 후 첫 질문',
        contextAfter.recentMessages,
        'ko'
      );

      // Assert
      expect(mockFirestoreService.resetConversation).toHaveBeenCalledWith(mockChatId);
      
      // 리셋 전에는 요약이 있었지만, 리셋 후에는 없어야 함
      expect(contextBefore.conversation?.summary).toBe('이전 대화 요약');
      expect(contextAfter.conversation).toBeNull();
      
      // 새 세션에서는 빈 대화 히스토리로 시작
      expect(mockLangChainService.conversationalQuery).toHaveBeenCalledWith(
        '리셋 후 첫 질문',
        [],
        'ko'
      );
    });
  });

  describe('실제 플로우 시뮬레이션', () => {
    it('실제 텔레그램 대화 플로우를 시뮬레이션해야 함', async () => {
      // Arrange
      const mockTelegramService = telegramService as jest.Mocked<TelegramService>;
      
      // 텔레그램 컨텍스트 시뮬레이션
      const telegramContext: TelegramContext = {
        chatId: mockChatId,
        messageId: 1,
        userId: 12345,
        username: 'testuser',
        firstName: 'Test',
        text: '휴가 규정에 대해 알려주세요',
        isCommand: false
      };

      const conversation: Conversation = {
        chatId: mockChatId,
        lang: 'ko',
        messageCount: 0,
        lastMessageAt: mockTimestamp,
        createdAt: mockTimestamp,
        updatedAt: mockTimestamp
      };

      mockFirestoreService.getConversation
        .mockResolvedValueOnce(null)
        .mockResolvedValue(conversation);

      const mockLangChainService = langChainService as jest.Mocked<LangChainService>;
      mockLangChainService.conversationalQuery.mockResolvedValue({
        answer: '휴가 규정은 다음과 같습니다:\n- 연차휴가: 연 15일\n- 병가: 연 30일\n- 경조사휴가: 경우에 따라 3-5일',
        sources: [
          { title: '휴가 규정', filePath: 'policies/vacation.md', url: 'https://example.com/vacation.md' }
        ],
        question: '휴가 규정에 대해 알려주세요',
        lang: 'ko',
        processingTime: 1800
      });

      mockTelegramService.sendMessage.mockResolvedValue();

      // Act - 전체 플로우 시뮬레이션
      
      // 1. 세션 초기화
      await conversationService.initializeSession(telegramContext.chatId, 'ko');
      
      // 2. 사용자 메시지 저장
      await conversationService.saveMessage(
        telegramContext.chatId, 
        'user', 
        telegramContext.text
      );
      
      // 3. 대화 맥락 로드
      const context = await conversationService.loadConversationContext(telegramContext.chatId);
      
      // 4. RAG 질의응답
      const ragResponse = await mockLangChainService.conversationalQuery(
        telegramContext.text,
        context.recentMessages,
        'ko'
      );
      
      // 5. 응답 메시지 저장
      await conversationService.saveMessage(
        telegramContext.chatId,
        'assistant',
        ragResponse.answer,
        {
          sources: ragResponse.sources.map(s => s.title),
          processingTime: ragResponse.processingTime
        }
      );
      
      // 6. 텔레그램으로 응답 전송
      await mockTelegramService.sendMessage({
        text: ragResponse.answer,
        chatId: telegramContext.chatId,
        parseMode: 'Markdown'
      });

      // Assert - 전체 플로우 검증
      expect(mockFirestoreService.saveConversation).toHaveBeenCalled();
      expect(mockFirestoreService.saveMessage).toHaveBeenCalledTimes(2); // user + assistant
      expect(mockLangChainService.conversationalQuery).toHaveBeenCalledWith(
        '휴가 규정에 대해 알려주세요',
        expect.any(Array),
        'ko'
      );
      expect(mockTelegramService.sendMessage).toHaveBeenCalledWith({
        text: expect.stringContaining('휴가 규정은 다음과 같습니다'),
        chatId: mockChatId,
        parseMode: 'Markdown'
      });

      // 메타데이터 확인
      expect(mockFirestoreService.saveMessage).toHaveBeenLastCalledWith(
        expect.objectContaining({
          chatId: mockChatId,
          role: 'assistant',
          text: ragResponse.answer,
          metadata: expect.objectContaining({
            sources: ['휴가 규정'],
            processingTime: 1800
          })
        })
      );
    });

    it('명령어 처리가 올바르게 작동해야 함', async () => {
      // Arrange
      const resetCommand: TelegramContext = {
        chatId: mockChatId,
        messageId: 2,
        userId: 12345,
        username: 'testuser',
        text: '/reset',
        isCommand: true,
        commandName: 'reset',
        commandArgs: []
      };

      const langCommand: TelegramContext = {
        chatId: mockChatId,
        messageId: 3,
        userId: 12345,
        username: 'testuser',
        text: '/lang en',
        isCommand: true,
        commandName: 'lang',
        commandArgs: ['en']
      };

      mockFirestoreService.resetConversation.mockResolvedValue();
      mockFirestoreService.getConversation.mockResolvedValue(null);

      const mockTelegramService = telegramService as jest.Mocked<TelegramService>;
      mockTelegramService.sendMessage.mockResolvedValue();

      // Act
      // 1. 리셋 명령어 처리
      await conversationService.resetSession(resetCommand.chatId);
      await mockTelegramService.sendMessage({
        text: '대화 세션이 초기화되었습니다.',
        chatId: resetCommand.chatId
      });

      // 2. 언어 변경 명령어 처리  
      await conversationService.initializeSession(langCommand.chatId, 'en');
      await conversationService.updateLanguage(langCommand.chatId, 'en');
      await mockTelegramService.sendMessage({
        text: 'Language changed to English.',
        chatId: langCommand.chatId
      });

      // Assert
      expect(mockFirestoreService.resetConversation).toHaveBeenCalledWith(mockChatId);
      expect(conversationService.updateLanguage).toHaveBeenCalledWith(mockChatId, 'en');
      expect(mockTelegramService.sendMessage).toHaveBeenCalledTimes(2);
      expect(mockTelegramService.sendMessage).toHaveBeenNthCalledWith(1, {
        text: '대화 세션이 초기화되었습니다.',
        chatId: mockChatId
      });
      expect(mockTelegramService.sendMessage).toHaveBeenNthCalledWith(2, {
        text: 'Language changed to English.',
        chatId: mockChatId
      });
    });
  });
});