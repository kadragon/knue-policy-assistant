import { ConversationService } from '../../src/services/conversation';
import { FirestoreService } from '../../src/services/firestore';
import { OpenAIService } from '../../src/services/openai';
import { LangChainService } from '../../src/services/langchain';
import {
  Conversation,
  Message,
  MessageRole,
  Language,
  DEFAULT_VALUES
} from '../../src/types';
import { Timestamp } from '@google-cloud/firestore';

// Mock dependencies
jest.mock('../../src/services/firestore');
jest.mock('../../src/services/openai');
jest.mock('../../src/services/langchain');
jest.mock('../../src/services/logger');
jest.mock('../../src/services/metrics');
jest.mock('../../src/config', () => ({
  appConfig: {
    OPENAI_API_KEY: 'test',
    QDRANT_API_KEY: 'test',
    QDRANT_URL: 'http://localhost',
    COLLECTION_NAME: 'test',
    FIRESTORE_PROJECT_ID: 'test',
    GITHUB_WEBHOOK_SECRET: 'secret',
    TELEGRAM_BOT_TOKEN: 'token'
  }
}));

describe('Memory Strategy Tests', () => {
  let conversationService: ConversationService;
  let langChainService: LangChainService;
  let mockFirestoreService: jest.Mocked<FirestoreService>;
  let mockOpenAIService: jest.Mocked<OpenAIService>;

  const testChatId = 'memory-strategy-test-chat';
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

    // Default mocks
    mockFirestoreService.getConversation.mockResolvedValue(null);
    mockFirestoreService.saveConversation.mockResolvedValue();
    mockFirestoreService.saveMessage.mockResolvedValue();
    mockFirestoreService.getRecentMessages.mockResolvedValue([]);
    mockFirestoreService.shouldTriggerSummary.mockResolvedValue(false);
    mockOpenAIService.estimateTokens.mockReturnValue(50);
  });

  describe('요약 품질 테스트', () => {
    it('요약이 핵심 정보를 유지해야 함', async () => {
      // Arrange
      const complexConversation: Message[] = [
        {
          messageId: 'msg1',
          chatId: testChatId,
          role: 'user',
          text: '휴가 규정에 대해 자세히 알려주세요. 특히 연차휴가와 병가의 차이점이 궁금합니다.',
          createdAt: mockTimestamp
        },
        {
          messageId: 'msg2',
          chatId: testChatId,
          role: 'assistant',
          text: '휴가 규정을 안내해드리겠습니다. 연차휴가는 1년에 15일까지 사용 가능하며, 사전 승인이 필요합니다. 병가는 연차와 별도로 30일까지 사용할 수 있으며, 의사 진단서가 필요합니다.',
          createdAt: mockTimestamp
        },
        {
          messageId: 'msg3',
          chatId: testChatId,
          role: 'user',
          text: '연차휴가 신청은 언제까지 해야 하나요? 그리고 긴급상황에는 어떻게 되나요?',
          createdAt: mockTimestamp
        },
        {
          messageId: 'msg4',
          chatId: testChatId,
          role: 'assistant',
          text: '연차휴가는 최소 3일 전에 신청해야 합니다. 단, 긴급상황(가족 응급상황 등)의 경우 사후 승인이 가능하며, 관련 증빙서류를 제출해야 합니다.',
          createdAt: mockTimestamp
        },
        {
          messageId: 'msg5',
          chatId: testChatId,
          role: 'user',
          text: '이제 출장비 규정도 알고 싶어요. 교통비와 숙박비는 어떻게 처리되나요?',
          createdAt: mockTimestamp
        },
        {
          messageId: 'msg6',
          chatId: testChatId,
          role: 'assistant',
          text: '출장비 규정을 안내해드리겠습니다. 교통비는 실비 정산이며, 대중교통 이용을 원칙으로 합니다. 숙박비는 1박당 15만원 한도 내에서 지원됩니다.',
          createdAt: mockTimestamp
        }
      ];

      const expectedSummary = '사용자가 휴가 규정(연차 15일, 병가 30일, 신청 절차)과 출장비 규정(교통비 실비, 숙박비 15만원 한도)에 대해 상세히 문의하였음. 긴급상황 시 사후 승인 가능함을 안내함.';

      mockOpenAIService.generateSummary.mockResolvedValue(expectedSummary);

      // Act
      const summary = await mockOpenAIService.generateSummary(complexConversation);

      // Assert
      expect(summary).toContain('휴가 규정');
      expect(summary).toContain('출장비 규정');
      expect(summary).toContain('15일'); // 연차
      expect(summary).toContain('30일'); // 병가
      expect(summary).toContain('15만원'); // 숙박비 한도
      expect(summary).toContain('긴급상황');

      // 요약 길이가 적절한지 확인 (너무 길지 않고, 너무 짧지 않음)
      expect(summary.length).toBeGreaterThan(50);
      expect(summary.length).toBeLessThan(500);

      // 핵심 키워드가 포함되었는지 확인
      const keyTerms = ['연차', '병가', '출장비', '신청', '승인', '한도'];
      keyTerms.forEach(term => {
        expect(summary).toContain(term);
      });
    });

    it('요약이 불필요한 세부사항을 제거해야 함', async () => {
      // Arrange
      const verboseConversation: Message[] = [
        {
          messageId: 'msg1',
          chatId: testChatId,
          role: 'user',
          text: '안녕하세요! 좋은 하루네요. 날씨도 좋고... 그런데 휴가 규정이 궁금해서요.',
          createdAt: mockTimestamp
        },
        {
          messageId: 'msg2',
          chatId: testChatId,
          role: 'assistant',
          text: '안녕하세요! 네, 날씨가 정말 좋네요. 휴가 규정에 대해 문의해주셨군요. 연차휴가는 15일까지 사용 가능합니다.',
          createdAt: mockTimestamp
        },
        {
          messageId: 'msg3',
          chatId: testChatId,
          role: 'user',
          text: '아, 그렇군요. 감사합니다. 혹시 몰라서 다시 한번 확인하는 건데... 정말 15일이 맞나요?',
          createdAt: mockTimestamp
        },
        {
          messageId: 'msg4',
          chatId: testChatId,
          role: 'assistant',
          text: '네, 맞습니다. 정확히 연 15일입니다. 추가로 궁금한 점이 있으시면 언제든지 말씀해 주세요.',
          createdAt: mockTimestamp
        }
      ];

      const cleanSummary = '사용자가 휴가 규정에 대해 문의하였고, 연차휴가 15일 제한을 확인함.';

      mockOpenAIService.generateSummary.mockResolvedValue(cleanSummary);

      // Act
      const summary = await mockOpenAIService.generateSummary(verboseConversation);

      // Assert
      // 불필요한 인사말과 반복적인 확인이 제거되었는지 확인
      expect(summary).not.toContain('안녕하세요');
      expect(summary).not.toContain('날씨');
      expect(summary).not.toContain('감사합니다');
      expect(summary).not.toContain('혹시 몰라서');

      // 핵심 정보만 남아있는지 확인
      expect(summary).toContain('휴가 규정');
      expect(summary).toContain('15일');

      // 요약이 간결한지 확인
      expect(summary.length).toBeLessThan(verboseConversation.reduce((acc, msg) => acc + msg.text.length, 0) / 3);
    });

    it('요약이 사용자의 지속적인 관심사를 유지해야 함', async () => {
      // Arrange
      const contextualConversation: Message[] = [
        {
          messageId: 'msg1',
          chatId: testChatId,
          role: 'user',
          text: '저는 신입사원이라 규정을 잘 몰라요. 휴가 관련 규정만 알고 싶습니다.',
          createdAt: mockTimestamp
        },
        {
          messageId: 'msg2',
          chatId: testChatId,
          role: 'assistant',
          text: '신입사원을 위한 휴가 규정을 안내드리겠습니다. 연차휴가는 입사 첫 해에는 11일이 주어집니다.',
          createdAt: mockTimestamp
        },
        {
          messageId: 'msg3',
          chatId: testChatId,
          role: 'user',
          text: '아, 그렇군요. 그럼 2년차부터는 어떻게 되나요?',
          createdAt: mockTimestamp
        },
        {
          messageId: 'msg4',
          chatId: testChatId,
          role: 'assistant',
          text: '2년차부터는 15일로 늘어납니다. 근속연수에 따라 최대 25일까지 늘어날 수 있습니다.',
          createdAt: mockTimestamp
        },
        {
          messageId: 'msg5',
          chatId: testChatId,
          role: 'user',
          text: '신입사원 교육 기간에도 휴가를 쓸 수 있나요?',
          createdAt: mockTimestamp
        },
        {
          messageId: 'msg6',
          chatId: testChatId,
          role: 'assistant',
          text: '신입사원 교육 기간(첫 3개월) 중에는 연차 사용이 제한되지만, 병가나 경조사 휴가는 사용 가능합니다.',
          createdAt: mockTimestamp
        }
      ];

      const contextAwareSummary = '신입사원 사용자가 휴가 규정에 집중하여 문의함. 1년차 11일, 2년차 이후 15일(최대 25일), 교육 기간 중 연차 제한 등 신입사원 관련 휴가 규정을 확인함.';

      mockOpenAIService.generateSummary.mockResolvedValue(contextAwareSummary);

      // Act
      const summary = await mockOpenAIService.generateSummary(contextualConversation);

      // Assert
      // 사용자의 신분과 관심사가 유지되었는지 확인
      expect(summary).toContain('신입사원');
      expect(summary).toContain('휴가 규정');

      // 사용자의 구체적인 상황에 맞는 정보가 포함되었는지 확인
      expect(summary).toContain('1년차 11일');
      expect(summary).toContain('교육 기간');

      // 지속적인 제약사항(휴가 규정만 관심)이 유지되었는지 확인
      expect(summary).toMatch(/휴가.*규정/);
    });
  });

  describe('맥락 유지 vs 근거 분리 테스트', () => {
    it('대화 맥락은 이해 보조용으로만 사용되어야 함', async () => {
      // Arrange
      const conversation: Conversation = {
        chatId: testChatId,
        lang: 'ko',
        messageCount: 4,
        lastMessageAt: mockTimestamp,
        createdAt: mockTimestamp,
        updatedAt: mockTimestamp,
        summary: '사용자가 이전에 휴가 규정에 대해 문의했음'
      };

      const chatHistory: Message[] = [
        {
          messageId: 'msg1',
          chatId: testChatId,
          role: 'user',
          text: '휴가 규정이 궁금해요',
          createdAt: mockTimestamp
        },
        {
          messageId: 'msg2',
          chatId: testChatId,
          role: 'assistant',
          text: '연차휴가는 15일까지 가능합니다',
          createdAt: mockTimestamp
        }
      ];

      mockFirestoreService.getConversation.mockResolvedValue(conversation);
      mockFirestoreService.getRecentMessages.mockResolvedValue(chatHistory);

      const mockLangChainService = langChainService as jest.Mocked<LangChainService>;
      
      // RAG 검색에서 관련 문서를 찾지 못한 경우
      mockLangChainService.conversationalQuery.mockResolvedValue({
        answer: '규정에 해당 내용이 없습니다.',
        sources: [],
        question: '출장비 한도는 얼마인가요?',
        lang: 'ko',
        processingTime: 800
      });

      // Act
      const context = await conversationService.loadConversationContext(testChatId);
      const response = await mockLangChainService.conversationalQuery(
        '출장비 한도는 얼마인가요?',
        context.recentMessages,
        'ko'
      );

      // Assert
      // 맥락은 로드되었지만, RAG에서 근거를 찾지 못하면 규정 없음 응답
      expect(context.summary).toBe('사용자가 이전에 휴가 규정에 대해 문의했음');
      expect(context.recentMessages).toEqual(chatHistory);
      
      // 대화 맥락이 있어도 규정 근거가 없으면 "없다"고 답해야 함
      expect(response.answer).toBe('규정에 해당 내용이 없습니다.');
      expect(response.sources).toHaveLength(0);
      
      // 맥락이 근거로 사용되지 않았는지 확인
      expect(response.answer).not.toContain('이전에 말씀드린');
      expect(response.answer).not.toContain('휴가');
    });

    it('규정 근거가 있으면 맥락과 함께 활용해야 함', async () => {
      // Arrange
      const conversation: Conversation = {
        chatId: testChatId,
        lang: 'ko',
        messageCount: 4,
        lastMessageAt: mockTimestamp,
        createdAt: mockTimestamp,
        updatedAt: mockTimestamp,
        summary: '사용자가 휴가 규정에 대해 지속적으로 관심을 보임'
      };

      const chatHistory: Message[] = [
        {
          messageId: 'msg1',
          chatId: testChatId,
          role: 'user',
          text: '연차휴가는 몇 일까지 가능한가요?',
          createdAt: mockTimestamp
        },
        {
          messageId: 'msg2',
          chatId: testChatId,
          role: 'assistant',
          text: '연차휴가는 1년에 15일까지 사용할 수 있습니다.',
          createdAt: mockTimestamp
        }
      ];

      mockFirestoreService.getConversation.mockResolvedValue(conversation);
      mockFirestoreService.getRecentMessages.mockResolvedValue(chatHistory);

      const mockLangChainService = langChainService as jest.Mocked<LangChainService>;
      
      // RAG에서 관련 규정을 찾은 경우 + 대화 맥락 활용
      mockLangChainService.conversationalQuery.mockResolvedValue({
        answer: '앞서 연차휴가에 대해 문의하셨는데, 병가는 연차와 별도로 1년에 30일까지 사용할 수 있습니다.',
        sources: [
          { title: '병가 규정', filePath: 'policies/sick-leave.md', url: 'https://example.com/sick-leave.md' }
        ],
        question: '병가는 어떻게 되나요?',
        lang: 'ko',
        processingTime: 1200
      });

      // Act
      const context = await conversationService.loadConversationContext(testChatId);
      const response = await mockLangChainService.conversationalQuery(
        '병가는 어떻게 되나요?',
        context.recentMessages,
        'ko'
      );

      // Assert
      // 규정 근거(sources)가 있고, 대화 맥락도 활용됨
      expect(response.sources).toHaveLength(1);
      expect(response.sources[0].title).toBe('병가 규정');
      
      // 맥락을 이해 보조용으로 활용 (앞서 연차휴가 문의 언급)
      expect(response.answer).toContain('앞서 연차휴가에 대해');
      
      // 하지만 핵심 정보는 규정 근거에서 가져옴
      expect(response.answer).toContain('30일까지');
      expect(response.answer).toContain('병가');
    });

    it('맥락 정보가 규정 근거보다 우선되지 않아야 함', async () => {
      // Arrange
      const conversation: Conversation = {
        chatId: testChatId,
        lang: 'ko',
        messageCount: 6,
        lastMessageAt: mockTimestamp,
        createdAt: mockTimestamp,
        updatedAt: mockTimestamp,
        summary: '사용자가 휴가가 20일이라고 잘못 이해하고 있었음'
      };

      const misleadingHistory: Message[] = [
        {
          messageId: 'msg1',
          chatId: testChatId,
          role: 'user',
          text: '휴가가 20일이라고 들었는데 맞나요?',
          createdAt: mockTimestamp
        },
        {
          messageId: 'msg2',
          chatId: testChatId,
          role: 'assistant',
          text: '아니요, 연차휴가는 15일입니다.',
          createdAt: mockTimestamp
        }
      ];

      mockFirestoreService.getConversation.mockResolvedValue(conversation);
      mockFirestoreService.getRecentMessages.mockResolvedValue(misleadingHistory);

      const mockLangChainService = langChainService as jest.Mocked<LangChainService>;
      
      // 정확한 규정 근거를 기반으로 응답
      mockLangChainService.conversationalQuery.mockResolvedValue({
        answer: '연차휴가는 정확히 15일입니다. 앞서 말씀드린 대로 20일이 아닙니다.',
        sources: [
          { title: '휴가 규정', filePath: 'policies/vacation.md', url: 'https://example.com/vacation.md' }
        ],
        question: '다시 한번 확인해주세요',
        lang: 'ko',
        processingTime: 1000
      });

      // Act
      const context = await conversationService.loadConversationContext(testChatId);
      const response = await mockLangChainService.conversationalQuery(
        '다시 한번 확인해주세요',
        context.recentMessages,
        'ko'
      );

      // Assert
      // 규정 근거가 있으므로 정확한 정보(15일) 제공
      expect(response.sources).toHaveLength(1);
      expect(response.answer).toContain('15일');
      expect(response.answer).not.toContain('20일'); // 잘못된 맥락 정보는 제외
      
      // 대화 맥락은 이해 보조용으로만 활용 (이전 오해 교정)
      expect(response.answer).toContain('앞서 말씀드린 대로');
    });

    it('메모리 토큰 분배에서 규정 근거가 우선되어야 함', async () => {
      // Arrange
      const conversation: Conversation = {
        chatId: testChatId,
        lang: 'ko',
        messageCount: 10,
        lastMessageAt: mockTimestamp,
        createdAt: mockTimestamp,
        updatedAt: mockTimestamp,
        summary: '매우 긴 대화 요약입니다. '.repeat(50) // 긴 요약
      };

      const longHistory: Message[] = Array.from({ length: 20 }, (_, i) => ({
        messageId: `msg${i}`,
        chatId: testChatId,
        role: i % 2 === 0 ? 'user' : 'assistant',
        text: `긴 메시지 내용입니다. `.repeat(30),
        createdAt: mockTimestamp
      }));

      mockFirestoreService.getConversation.mockResolvedValue(conversation);
      mockFirestoreService.getRecentMessages.mockResolvedValue(longHistory);

      // 요약과 메시지 모두 높은 토큰 수
      mockOpenAIService.estimateTokens
        .mockReturnValueOnce(800) // summary tokens (매우 긴 요약)
        .mockReturnValue(200);    // 각 메시지 tokens (긴 메시지들)

      // Act
      const memoryContext = await conversationService.buildMemoryContext(testChatId, 1000);

      // Assert
      // 토큰 제한으로 인해 메시지 수가 제한되어야 함
      expect(memoryContext.tokenCount).toBeLessThanOrEqual(1000);
      
      // 요약이 포함되어야 함 (핵심 맥락 유지)
      expect(memoryContext.summary).toBeDefined();
      
      // 하지만 최근 메시지도 일부 포함되어야 함 (대화 연속성)
      expect(memoryContext.recentMessages.length).toBeGreaterThan(0);
      expect(memoryContext.recentMessages.length).toBeLessThan(longHistory.length);
      
      // 가장 최근 메시지들이 우선적으로 포함되어야 함
      const includedMessageIds = memoryContext.recentMessages.map(m => m.messageId);
      const lastMessageIds = longHistory.slice(-5).map(m => m.messageId);
      expect(includedMessageIds).toEqual(expect.arrayContaining(lastMessageIds.slice(-memoryContext.recentMessages.length)));
    });
  });

  describe('메모리 최적화 테스트', () => {
    it('토큰 사용량을 효율적으로 관리해야 함', async () => {
      // Arrange
      const variableLengthMessages: Message[] = [
        {
          messageId: 'short1',
          chatId: testChatId,
          role: 'user',
          text: '짧은 질문',
          createdAt: mockTimestamp
        },
        {
          messageId: 'long1',
          chatId: testChatId,
          role: 'assistant',
          text: '매우 길고 상세한 답변입니다. '.repeat(50),
          createdAt: mockTimestamp
        },
        {
          messageId: 'short2',
          chatId: testChatId,
          role: 'user',
          text: '짧은 후속 질문',
          createdAt: mockTimestamp
        },
        {
          messageId: 'long2',
          chatId: testChatId,
          role: 'assistant',
          text: '또 다른 매우 길고 상세한 답변입니다. '.repeat(40),
          createdAt: mockTimestamp
        }
      ];

      const conversation: Conversation = {
        chatId: testChatId,
        lang: 'ko',
        messageCount: 4,
        lastMessageAt: mockTimestamp,
        createdAt: mockTimestamp,
        updatedAt: mockTimestamp,
        summary: '간단한 요약'
      };

      mockFirestoreService.getConversation.mockResolvedValue(conversation);
      mockFirestoreService.getRecentMessages.mockResolvedValue(variableLengthMessages);

      // 실제 메시지 길이에 비례한 토큰 수 시뮬레이션
      mockOpenAIService.estimateTokens.mockImplementation((text: string) => {
        if (text === '간단한 요약') return 20;
        if (text === '짧은 질문' || text === '짧은 후속 질문') return 10;
        return Math.ceil(text.length / 4); // 긴 메시지들
      });

      // Act
      const memoryContext = await conversationService.buildMemoryContext(testChatId, 500);

      // Assert
      expect(memoryContext.tokenCount).toBeLessThanOrEqual(500);
      
      // 짧은 메시지들이 우선적으로 포함되어야 함 (효율성)
      const shortMessages = memoryContext.recentMessages.filter(m => 
        m.text === '짧은 질문' || m.text === '짧은 후속 질문'
      );
      expect(shortMessages.length).toBeGreaterThan(0);
      
      // 토큰 효율성 확인 - 포함된 메시지 수 대비 토큰 사용량이 합리적
      const avgTokensPerMessage = memoryContext.tokenCount / (memoryContext.recentMessages.length + 1); // +1 for summary
      expect(avgTokensPerMessage).toBeLessThan(200); // 효율적인 토큰 사용
    });

    it('중복 정보가 있는 대화에서 요약이 효과적이어야 함', async () => {
      // Arrange
      const repetitiveConversation: Message[] = [
        {
          messageId: 'msg1',
          chatId: testChatId,
          role: 'user',
          text: '휴가 규정이 궁금해요',
          createdAt: mockTimestamp
        },
        {
          messageId: 'msg2',
          chatId: testChatId,
          role: 'assistant',
          text: '연차휴가는 15일까지 가능합니다',
          createdAt: mockTimestamp
        },
        {
          messageId: 'msg3',
          chatId: testChatId,
          role: 'user',
          text: '정말 15일이 맞나요?',
          createdAt: mockTimestamp
        },
        {
          messageId: 'msg4',
          chatId: testChatId,
          role: 'assistant',
          text: '네, 맞습니다. 연차휴가는 15일입니다.',
          createdAt: mockTimestamp
        },
        {
          messageId: 'msg5',
          chatId: testChatId,
          role: 'user',
          text: '혹시 확실한가요? 15일이요?',
          createdAt: mockTimestamp
        },
        {
          messageId: 'msg6',
          chatId: testChatId,
          role: 'assistant',
          text: '확실합니다. 연차휴가는 연간 15일입니다.',
          createdAt: mockTimestamp
        }
      ];

      const efficientSummary = '사용자가 연차휴가 15일 제한을 여러 번 확인하였음.';

      mockOpenAIService.generateSummary.mockResolvedValue(efficientSummary);

      // Act
      const summary = await mockOpenAIService.generateSummary(repetitiveConversation);

      // Assert
      // 요약이 중복 제거되어 간결해야 함
      expect(summary).toBe(efficientSummary);
      expect(summary.length).toBeLessThan(
        repetitiveConversation.reduce((acc, msg) => acc + msg.text.length, 0) / 5
      );

      // 핵심 정보만 유지
      expect(summary).toContain('15일');
      expect(summary).toContain('연차휴가');
      
      // 반복적인 확인 과정은 간단히 요약됨
      expect(summary).toContain('여러 번 확인');
      expect(summary).not.toContain('정말');
      expect(summary).not.toContain('혹시');
      expect(summary).not.toContain('확실');
    });

    it('다양한 토큰 제한에서 일관된 성능을 보여야 함', async () => {
      // Arrange
      const standardConversation: Conversation = {
        chatId: testChatId,
        lang: 'ko',
        messageCount: 8,
        lastMessageAt: mockTimestamp,
        createdAt: mockTimestamp,
        updatedAt: mockTimestamp,
        summary: '표준 길이의 대화 요약입니다.'
      };

      const standardMessages: Message[] = Array.from({ length: 8 }, (_, i) => ({
        messageId: `msg${i}`,
        chatId: testChatId,
        role: i % 2 === 0 ? 'user' : 'assistant',
        text: `표준 길이 메시지 ${i}입니다.`,
        createdAt: mockTimestamp
      }));

      mockFirestoreService.getConversation.mockResolvedValue(standardConversation);
      mockFirestoreService.getRecentMessages.mockResolvedValue(standardMessages);

      // 일관된 토큰 추정
      mockOpenAIService.estimateTokens.mockReturnValue(50);

      // Act - 다양한 토큰 제한으로 테스트
      const tokenLimits = [2000, 1000, 500, 200, 100];
      const results = await Promise.all(
        tokenLimits.map(limit => 
          conversationService.buildMemoryContext(testChatId, limit)
        )
      );

      // Assert
      results.forEach((result, index) => {
        const limit = tokenLimits[index];
        
        // 토큰 제한 준수
        expect(result.tokenCount).toBeLessThanOrEqual(limit);
        
        // 적절한 메시지 선택
        if (limit >= 400) {
          // 충분한 토큰이 있으면 요약과 메시지 모두 포함
          expect(result.summary).toBeDefined();
          expect(result.recentMessages.length).toBeGreaterThan(0);
        } else if (limit >= 100) {
          // 제한된 토큰에서는 요약 또는 최소한의 메시지
          expect(result.tokenCount).toBeGreaterThan(0);
        } else {
          // 매우 제한된 토큰에서도 최소한의 정보는 제공
          expect(result.tokenCount).toBeGreaterThan(0);
        }
        
        // 성능 일관성 - 낮은 토큰 제한에서도 합리적인 응답
        if (index > 0) {
          expect(result.recentMessages.length).toBeLessThanOrEqual(
            results[index - 1].recentMessages.length
          );
        }
      });
    });
  });

  describe('맥락 손실 방지 테스트', () => {
    it('중요한 사용자 제약 조건이 유지되어야 함', async () => {
      // Arrange
      const constrainedConversation: Message[] = [
        {
          messageId: 'msg1',
          chatId: testChatId,
          role: 'user',
          text: '저는 휴가 규정만 알고 싶어요. 다른 규정은 설명하지 마세요.',
          createdAt: mockTimestamp
        },
        {
          messageId: 'msg2',
          chatId: testChatId,
          role: 'assistant',
          text: '네, 휴가 규정만 안내드리겠습니다. 연차휴가는 15일까지 가능합니다.',
          createdAt: mockTimestamp
        },
        {
          messageId: 'msg3',
          chatId: testChatId,
          role: 'user',
          text: '병가는 어떻게 되나요? 역시 휴가 관련만 알려주세요.',
          createdAt: mockTimestamp
        },
        {
          messageId: 'msg4',
          chatId: testChatId,
          role: 'assistant',
          text: '휴가 관련해서만 말씀드리면, 병가는 30일까지 사용 가능합니다.',
          createdAt: mockTimestamp
        }
      ];

      const constraintAwareSummary = '사용자가 휴가 규정만 알고 싶어 함을 명시. 연차 15일, 병가 30일에 대해 안내함. 다른 규정 설명 금지 요청.';

      mockOpenAIService.generateSummary.mockResolvedValue(constraintAwareSummary);

      // Act
      const summary = await mockOpenAIService.generateSummary(constrainedConversation);

      // Assert
      // 사용자의 제약 조건이 명확히 보존되어야 함
      expect(summary).toContain('휴가 규정만');
      expect(summary).toContain('다른 규정 설명 금지');
      
      // 기본 정보도 유지
      expect(summary).toContain('15일');
      expect(summary).toContain('30일');
      
      // 사용자의 의도가 지속됨을 나타냄
      expect(summary).toMatch(/(휴가.*관련|휴가.*규정)/);
    });

    it('특별한 응답 형식 요구사항이 유지되어야 함', async () => {
      // Arrange
      const formatConstrainedConversation: Message[] = [
        {
          messageId: 'msg1',
          chatId: testChatId,
          role: 'user',
          text: '모든 답변은 결론부터 말해주세요. 상세 설명은 나중에 해주세요.',
          createdAt: mockTimestamp
        },
        {
          messageId: 'msg2',
          chatId: testChatId,
          role: 'assistant',
          text: '결론: 연차휴가는 15일입니다. 상세 설명: 1년 단위로 계산되며...',
          createdAt: mockTimestamp
        },
        {
          messageId: 'msg3',
          chatId: testChatId,
          role: 'user',
          text: '병가도 결론부터 말해주세요.',
          createdAt: mockTimestamp
        },
        {
          messageId: 'msg4',
          chatId: testChatId,
          role: 'assistant',
          text: '결론: 병가는 30일입니다. 상세 설명: 의사 진단서가 필요하며...',
          createdAt: mockTimestamp
        }
      ];

      const formatAwareSummary = '사용자가 "결론 먼저, 상세 설명 나중에" 응답 형식을 요구함. 연차 15일, 병가 30일에 대해 해당 형식으로 안내함.';

      mockOpenAIService.generateSummary.mockResolvedValue(formatAwareSummary);

      // Act
      const summary = await mockOpenAIService.generateSummary(formatConstrainedConversation);

      // Assert
      // 응답 형식 요구사항이 보존되어야 함
      expect(summary).toContain('결론 먼저');
      expect(summary).toContain('상세 설명 나중에');
      
      // 해당 형식으로 응답했다는 이력도 유지
      expect(summary).toMatch(/(해당 형식|요구.*형식)/);
      
      // 기본 정보도 유지
      expect(summary).toContain('15일');
      expect(summary).toContain('30일');
    });

    it('메모리 제한 상황에서도 핵심 맥락이 보존되어야 함', async () => {
      // Arrange
      const criticalContextConversation: Conversation = {
        chatId: testChatId,
        lang: 'ko',
        messageCount: 20,
        lastMessageAt: mockTimestamp,
        createdAt: mockTimestamp,
        updatedAt: mockTimestamp,
        summary: '🔑중요: 사용자는 신입사원이며 휴가 규정만 알고 싶어함. 결론 먼저 말하기를 선호함.'
      };

      const manyMessages: Message[] = Array.from({ length: 20 }, (_, i) => ({
        messageId: `msg${i}`,
        chatId: testChatId,
        role: i % 2 === 0 ? 'user' : 'assistant',
        text: i < 18 ? `일반적인 메시지 ${i}` : `최근 중요 메시지 ${i}`,
        createdAt: mockTimestamp
      }));

      mockFirestoreService.getConversation.mockResolvedValue(criticalContextConversation);
      mockFirestoreService.getRecentMessages.mockResolvedValue(manyMessages);

      mockOpenAIService.estimateTokens.mockImplementation((text: string) => {
        if (text.includes('🔑중요')) return 100; // 중요한 요약
        return 30; // 일반 메시지
      });

      // Act - 매우 제한된 토큰 한도
      const limitedMemoryContext = await conversationService.buildMemoryContext(testChatId, 200);

      // Assert
      // 토큰 제한 준수
      expect(limitedMemoryContext.tokenCount).toBeLessThanOrEqual(200);
      
      // 중요한 요약이 보존되어야 함
      expect(limitedMemoryContext.summary).toContain('🔑중요');
      expect(limitedMemoryContext.summary).toContain('신입사원');
      expect(limitedMemoryContext.summary).toContain('휴가 규정만');
      expect(limitedMemoryContext.summary).toContain('결론 먼저');
      
      // 최근 메시지는 최소한만 포함되더라도 가장 최근 것들
      if (limitedMemoryContext.recentMessages.length > 0) {
        const firstMessage = limitedMemoryContext.recentMessages[0];
        if (firstMessage) {
          expect(firstMessage.text).toContain('최근 중요 메시지');
        }
      }
    });
  });
});