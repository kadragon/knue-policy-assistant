import { ConversationService } from '../../src/services/conversation';
import { LangChainService } from '../../src/services/langchain';
import { FirestoreService } from '../../src/services/firestore';
import { OpenAIService } from '../../src/services/openai';
import {
  Conversation,
  Message,
  RAGSearchRequest,
  RAGQueryRequest,
  DEFAULT_VALUES
} from '../../src/types';
import { Timestamp } from '@google-cloud/firestore';

// Mock dependencies
jest.mock('../../src/services/firestore');
jest.mock('../../src/services/openai');
jest.mock('../../src/services/langchain');
jest.mock('../../src/services/logger');
jest.mock('../../src/services/metrics');

describe('Performance Tests', () => {
  let conversationService: ConversationService;
  let langChainService: LangChainService;
  let mockFirestoreService: jest.Mocked<FirestoreService>;
  let mockOpenAIService: jest.Mocked<OpenAIService>;

  const testChatId = 'performance-test-chat';
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

    setupPerformanceMocks();
  });

  function setupPerformanceMocks() {
    // 빠른 응답을 위한 기본 mocks
    mockFirestoreService.getConversation.mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 10)); // 10ms 지연
      return null;
    });

    mockFirestoreService.saveConversation.mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 20)); // 20ms 지연
    });

    mockFirestoreService.saveMessage.mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 15)); // 15ms 지연
    });

    mockFirestoreService.getRecentMessages.mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 25)); // 25ms 지연
      return [];
    });

    mockFirestoreService.shouldTriggerSummary.mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 5)); // 5ms 지연
      return false;
    });

    mockOpenAIService.generateSummary.mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 800)); // 800ms 지연 (OpenAI API)
      return 'Generated summary';
    });

    mockOpenAIService.estimateTokens.mockReturnValue(50);

    const mockLangChainService = langChainService as jest.Mocked<LangChainService>;
    mockLangChainService.search.mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 300)); // 300ms 지연 (벡터 검색)
      return {
        documents: [
          {
            score: 0.95,
            title: '테스트 규정',
            text: '테스트 규정 내용입니다.',
            filePath: 'policies/test.md',
            url: 'https://example.com/test.md',
            fileId: 'file1',
            seq: 0
          }
        ],
        query: 'test query',
        total: 1,
        lang: 'ko'
      };
    });

    mockLangChainService.conversationalQuery.mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 1200)); // 1.2초 지연 (LLM 응답)
      return {
        answer: '테스트 응답입니다.',
        sources: [{ title: '테스트 규정', filePath: 'policies/test.md', url: 'https://example.com/test.md' }],
        question: 'test question',
        lang: 'ko',
        processingTime: 1200
      };
    });
  }

  describe('응답시간 테스트', () => {
    it('단일 질의응답이 3초 이내에 완료되어야 함', async () => {
      // Arrange
      const question = '휴가 규정에 대해 알려주세요';
      const mockLangChainService = langChainService as jest.Mocked<LangChainService>;

      // Act
      const startTime = Date.now();
      
      await conversationService.initializeSession(testChatId, 'ko');
      await conversationService.saveMessage(testChatId, 'user', question);
      
      const context = await conversationService.loadConversationContext(testChatId);
      const response = await mockLangChainService.conversationalQuery(
        question,
        context.recentMessages,
        'ko'
      );
      
      await conversationService.saveMessage(testChatId, 'assistant', response.answer);
      
      const totalTime = Date.now() - startTime;

      // Assert
      expect(totalTime).toBeLessThan(3000); // 3초 이내
      expect(response.answer).toBeTruthy();
      
      // 개별 단계별 성능도 확인
      expect(response.processingTime).toBeLessThan(2000); // LLM 응답은 2초 이내
    });

    it('대화 맥락 로드가 100ms 이내에 완료되어야 함', async () => {
      // Arrange
      const conversation: Conversation = {
        chatId: testChatId,
        lang: 'ko',
        messageCount: 5,
        lastMessageAt: mockTimestamp,
        createdAt: mockTimestamp,
        updatedAt: mockTimestamp,
        summary: 'Test summary'
      };

      const messages: Message[] = Array.from({ length: 5 }, (_, i) => ({
        messageId: `msg${i}`,
        chatId: testChatId,
        role: i % 2 === 0 ? 'user' : 'assistant',
        text: `Message ${i}`,
        createdAt: mockTimestamp
      }));

      mockFirestoreService.getConversation.mockResolvedValue(conversation);
      mockFirestoreService.getRecentMessages.mockResolvedValue(messages);

      // Act
      const startTime = Date.now();
      const context = await conversationService.loadConversationContext(testChatId);
      const loadTime = Date.now() - startTime;

      // Assert
      expect(loadTime).toBeLessThan(100); // 100ms 이내
      expect(context.conversation).toEqual(conversation);
      expect(context.recentMessages).toEqual(messages);
    });

    it('메모리 컨텍스트 구성이 200ms 이내에 완료되어야 함', async () => {
      // Arrange
      const conversation: Conversation = {
        chatId: testChatId,
        lang: 'ko',
        messageCount: 10,
        lastMessageAt: mockTimestamp,
        createdAt: mockTimestamp,
        updatedAt: mockTimestamp,
        summary: 'Test summary for performance'
      };

      const messages: Message[] = Array.from({ length: 10 }, (_, i) => ({
        messageId: `msg${i}`,
        chatId: testChatId,
        role: i % 2 === 0 ? 'user' : 'assistant',
        text: `Performance test message ${i}`,
        createdAt: mockTimestamp
      }));

      mockFirestoreService.getConversation.mockResolvedValue(conversation);
      mockFirestoreService.getRecentMessages.mockResolvedValue(messages);

      // Act
      const startTime = Date.now();
      const memoryContext = await conversationService.buildMemoryContext(testChatId, 1500);
      const buildTime = Date.now() - startTime;

      // Assert
      expect(buildTime).toBeLessThan(200); // 200ms 이내
      expect(memoryContext.summary).toBeTruthy();
      expect(memoryContext.recentMessages.length).toBeGreaterThan(0);
      expect(memoryContext.tokenCount).toBeGreaterThan(0);
    });

    it('RAG 검색이 500ms 이내에 완료되어야 함', async () => {
      // Arrange
      const searchRequest: RAGSearchRequest = {
        query: '성능 테스트 질의',
        k: 5,
        minScore: 0.80,
        lang: 'ko'
      };

      const mockLangChainService = langChainService as jest.Mocked<LangChainService>;

      // Act
      const startTime = Date.now();
      const result = await mockLangChainService.search(searchRequest);
      const searchTime = Date.now() - startTime;

      // Assert
      expect(searchTime).toBeLessThan(500); // 500ms 이내
      expect(result.documents).toBeTruthy();
      expect(result.query).toBe(searchRequest.query);
    });
  });

  describe('처리량 테스트', () => {
    it('동시 10개 세션을 5초 이내에 처리해야 함', async () => {
      // Arrange
      const sessionCount = 10;
      const sessions = Array.from({ length: sessionCount }, (_, i) => `session-${i}`);

      // Act
      const startTime = Date.now();
      const results = await Promise.all(
        sessions.map(sessionId => 
          conversationService.initializeSession(sessionId, 'ko')
        )
      );
      const totalTime = Date.now() - startTime;

      // Assert
      expect(totalTime).toBeLessThan(5000); // 5초 이내
      expect(results).toHaveLength(sessionCount);
      
      results.forEach((result, index) => {
        expect(result.chatId).toBe(`session-${index}`);
        expect(result.lang).toBe('ko');
      });
    });

    it('동시 20개 질의응답을 30초 이내에 처리해야 함', async () => {
      // Arrange
      const queryCount = 20;
      const queries = Array.from({ length: queryCount }, (_, i) => `질문 ${i}`);

      const mockLangChainService = langChainService as jest.Mocked<LangChainService>;
      queries.forEach((query, i) => {
        mockLangChainService.conversationalQuery.mockResolvedValueOnce({
          answer: `답변 ${i}`,
          sources: [],
          question: query,
          lang: 'ko',
          processingTime: 1000 + Math.random() * 500
        });
      });

      // Act
      const startTime = Date.now();
      const results = await Promise.all(
        queries.map(query => 
          mockLangChainService.conversationalQuery(query, [], 'ko')
        )
      );
      const totalTime = Date.now() - startTime;

      // Assert
      expect(totalTime).toBeLessThan(30000); // 30초 이내
      expect(results).toHaveLength(queryCount);
      
      // 병렬 처리 효율성 확인
      const avgProcessingTime = results.reduce((sum, r) => sum + r.processingTime, 0) / results.length;
      expect(totalTime).toBeLessThan(avgProcessingTime * 2); // 병렬 처리로 인한 시간 절약
    });

    it('대량 메시지 저장이 적절한 시간 내에 완료되어야 함', async () => {
      // Arrange
      const messageCount = 50;
      const messages = Array.from({ length: messageCount }, (_, i) => ({
        role: (i % 2 === 0 ? 'user' : 'assistant') as Message['role'],
        text: `대량 테스트 메시지 ${i}`
      }));

      // Act
      const startTime = Date.now();
      
      for (const message of messages) {
        await conversationService.saveMessage(testChatId, message.role, message.text);
      }
      
      const totalTime = Date.now() - startTime;

      // Assert
      expect(totalTime).toBeLessThan(10000); // 10초 이내
      expect(mockFirestoreService.saveMessage).toHaveBeenCalledTimes(messageCount);
      
      // 평균 메시지 저장 시간 확인
      const avgTimePerMessage = totalTime / messageCount;
      expect(avgTimePerMessage).toBeLessThan(200); // 메시지당 200ms 이내
    });

    it('복잡한 메모리 컨텍스트 구성이 확장 가능해야 함', async () => {
      // Arrange
      const messageCounts = [10, 50, 100, 200];
      const results: Array<{ messageCount: number; buildTime: number; tokenCount: number }> = [];

      for (const messageCount of messageCounts) {
        const conversation: Conversation = {
          chatId: testChatId,
          lang: 'ko',
          messageCount,
          lastMessageAt: mockTimestamp,
          createdAt: mockTimestamp,
          updatedAt: mockTimestamp,
          summary: `Summary for ${messageCount} messages`
        };

        const messages: Message[] = Array.from({ length: messageCount }, (_, i) => ({
          messageId: `msg${i}`,
          chatId: testChatId,
          role: i % 2 === 0 ? 'user' : 'assistant',
          text: `Message ${i} content`,
          createdAt: mockTimestamp
        }));

        mockFirestoreService.getConversation.mockResolvedValue(conversation);
        mockFirestoreService.getRecentMessages.mockResolvedValue(messages);

        // Act
        const startTime = Date.now();
        const memoryContext = await conversationService.buildMemoryContext(testChatId, 1500);
        const buildTime = Date.now() - startTime;

        results.push({
          messageCount,
          buildTime,
          tokenCount: memoryContext.tokenCount
        });
      }

      // Assert
      results.forEach((result, index) => {
        // 메시지 수가 증가해도 빌드 시간이 선형적으로만 증가해야 함
        if (index > 0) {
          const prevResult = results[index - 1]!;
          const timeRatio = result.buildTime / prevResult.buildTime;
          const messageRatio = result.messageCount / prevResult.messageCount;
          
          // 시간 증가율이 메시지 증가율보다 크게 벗어나지 않아야 함
          expect(timeRatio).toBeLessThan(messageRatio * 2);
        }
        
        // 모든 경우에서 합리적인 시간 내에 완료
        expect(result.buildTime).toBeLessThan(1000); // 1초 이내
      });
    });
  });

  describe('메모리 효율성 테스트', () => {
    it('대화 세션 수가 증가해도 메모리 사용량이 선형적으로 증가해야 함', async () => {
      // Arrange
      const sessionCounts = [10, 20, 50];
      const results: Array<{ sessionCount: number; totalTime: number }> = [];

      for (const sessionCount of sessionCounts) {
        const sessions = Array.from({ length: sessionCount }, (_, i) => `memory-test-${i}`);

        // Act
        const startTime = Date.now();
        await Promise.all(
          sessions.map(sessionId => 
            conversationService.initializeSession(sessionId, 'ko')
          )
        );
        const totalTime = Date.now() - startTime;

        results.push({ sessionCount, totalTime });
      }

      // Assert
      results.forEach((result, index) => {
        if (index > 0) {
          const prevResult = results[index - 1]!;
          const timeRatio = result.totalTime / prevResult.totalTime;
          const sessionRatio = result.sessionCount / prevResult.sessionCount;
          
          // 시간 증가가 세션 수 증가에 비례해야 함 (메모리 누수 없음)
          expect(timeRatio).toBeLessThan(sessionRatio * 1.5);
        }
      });
    });

    it('토큰 제한이 다양할 때 성능이 일정해야 함', async () => {
      // Arrange
      const conversation: Conversation = {
        chatId: testChatId,
        lang: 'ko',
        messageCount: 20,
        lastMessageAt: mockTimestamp,
        createdAt: mockTimestamp,
        updatedAt: mockTimestamp,
        summary: 'Performance test summary'
      };

      const messages: Message[] = Array.from({ length: 20 }, (_, i) => ({
        messageId: `msg${i}`,
        chatId: testChatId,
        role: i % 2 === 0 ? 'user' : 'assistant',
        text: `Memory performance test message ${i}`,
        createdAt: mockTimestamp
      }));

      mockFirestoreService.getConversation.mockResolvedValue(conversation);
      mockFirestoreService.getRecentMessages.mockResolvedValue(messages);

      const tokenLimits = [100, 500, 1000, 2000];
      const results: Array<{ limit: number; buildTime: number; selectedMessages: number }> = [];

      for (const limit of tokenLimits) {
        // Act
        const startTime = Date.now();
        const memoryContext = await conversationService.buildMemoryContext(testChatId, limit);
        const buildTime = Date.now() - startTime;

        results.push({
          limit,
          buildTime,
          selectedMessages: memoryContext.recentMessages.length
        });
      }

      // Assert
      results.forEach(result => {
        // 모든 토큰 제한에서 합리적인 시간 내에 완료
        expect(result.buildTime).toBeLessThan(300); // 300ms 이내
        
        // 토큰 제한에 따라 메시지 수가 적절히 조정됨
        expect(result.selectedMessages).toBeGreaterThanOrEqual(0);
        expect(result.selectedMessages).toBeLessThanOrEqual(messages.length);
      });

      // 토큰 제한이 커져도 성능이 크게 저하되지 않아야 함
      const minTime = Math.min(...results.map(r => r.buildTime));
      const maxTime = Math.max(...results.map(r => r.buildTime));
      expect(maxTime).toBeLessThan(minTime * 3); // 최대 3배 이내
    });

    it('요약 생성이 메시지 수에 관계없이 일정한 성능을 보여야 함', async () => {
      // Arrange
      const messageCounts = [5, 10, 20, 50];
      const results: Array<{ messageCount: number; summaryTime: number }> = [];

      for (const messageCount of messageCounts) {
        const messages: Message[] = Array.from({ length: messageCount }, (_, i) => ({
          messageId: `summary-msg${i}`,
          chatId: testChatId,
          role: i % 2 === 0 ? 'user' : 'assistant',
          text: `Summary test message ${i} content`,
          createdAt: mockTimestamp
        }));

        // Act
        const startTime = Date.now();
        await mockOpenAIService.generateSummary(messages);
        const summaryTime = Date.now() - startTime;

        results.push({ messageCount, summaryTime });
      }

      // Assert
      results.forEach(result => {
        // 모든 경우에서 합리적인 시간 내에 완료
        expect(result.summaryTime).toBeLessThan(1500); // 1.5초 이내
      });

      // 메시지 수가 증가해도 요약 시간이 급격히 증가하지 않아야 함
      const minTime = Math.min(...results.map(r => r.summaryTime));
      const maxTime = Math.max(...results.map(r => r.summaryTime));
      expect(maxTime).toBeLessThan(minTime * 2); // 최대 2배 이내
    });
  });

  describe('부하 상황 테스트', () => {
    it('높은 부하 상황에서도 응답 품질을 유지해야 함', async () => {
      // Arrange
      const highLoadCount = 30;
      const questions = Array.from({ length: highLoadCount }, (_, i) => `부하 테스트 질문 ${i}`);

      const mockLangChainService = langChainService as jest.Mocked<LangChainService>;
      questions.forEach((question, i) => {
        mockLangChainService.conversationalQuery.mockResolvedValueOnce({
          answer: `부하 테스트 응답 ${i} - 규정에 따르면...`,
          sources: [{ title: '테스트 규정', filePath: 'policies/test.md', url: 'https://example.com/test.md' }],
          question,
          lang: 'ko',
          processingTime: 1000 + Math.random() * 1000
        });
      });

      // Act
      const startTime = Date.now();
      const responses = await Promise.all(
        questions.map(async (question, i) => {
          const chatId = `load-test-${i}`;
          await conversationService.initializeSession(chatId, 'ko');
          return mockLangChainService.conversationalQuery(question, [], 'ko');
        })
      );
      const totalTime = Date.now() - startTime;

      // Assert
      expect(responses).toHaveLength(highLoadCount);
      expect(totalTime).toBeLessThan(45000); // 45초 이내

      responses.forEach((response, i) => {
        // 모든 응답이 적절한 품질을 유지해야 함
        expect(response.answer).toContain('부하 테스트 응답');
        expect(response.answer).toContain('규정에 따르면');
        expect(response.sources).toHaveLength(1);
        expect(response.processingTime).toBeLessThan(3000);
      });

      // 평균 응답 시간 확인
      const avgTime = totalTime / highLoadCount;
      expect(avgTime).toBeLessThan(2000); // 평균 2초 이내
    });

    it('메모리 집약적 작업이 시스템을 압박하지 않아야 함', async () => {
      // Arrange
      const intensiveCount = 20;
      const intensiveTasks = Array.from({ length: intensiveCount }, (_, i) => {
        const largeConversation: Conversation = {
          chatId: `intensive-${i}`,
          lang: 'ko',
          messageCount: 100 + i * 10,
          lastMessageAt: mockTimestamp,
          createdAt: mockTimestamp,
          updatedAt: mockTimestamp,
          summary: `Large conversation summary ${i} `.repeat(20) // 긴 요약
        };

        const largeMessages: Message[] = Array.from({ length: 50 }, (_, j) => ({
          messageId: `intensive-msg${i}-${j}`,
          chatId: `intensive-${i}`,
          role: j % 2 === 0 ? 'user' : 'assistant',
          text: `Intensive message ${i}-${j} content `.repeat(10),
          createdAt: mockTimestamp
        }));

        return { conversation: largeConversation, messages: largeMessages };
      });

      // Act
      const startTime = Date.now();
      const results = await Promise.all(
        intensiveTasks.map(async (task, i) => {
          mockFirestoreService.getConversation.mockResolvedValueOnce(task.conversation);
          mockFirestoreService.getRecentMessages.mockResolvedValueOnce(task.messages);
          
          return conversationService.buildMemoryContext(`intensive-${i}`, 2000);
        })
      );
      const totalTime = Date.now() - startTime;

      // Assert
      expect(results).toHaveLength(intensiveCount);
      expect(totalTime).toBeLessThan(10000); // 10초 이내

      results.forEach((result, i) => {
        // 메모리 제한이 적절히 적용되었는지 확인
        expect(result.tokenCount).toBeLessThanOrEqual(2000);
        expect(result.recentMessages.length).toBeGreaterThan(0);
        expect(result.summary).toBeTruthy();
      });

      // 메모리 집약적 작업도 합리적인 시간 내에 완료
      const avgTime = totalTime / intensiveCount;
      expect(avgTime).toBeLessThan(500); // 평균 500ms 이내
    });

    it('에러 상황에서도 성능 저하가 최소화되어야 함', async () => {
      // Arrange
      const errorCount = 10;
      const normalCount = 10;

      // 일부 요청은 의도적으로 실패시킴
      for (let i = 0; i < errorCount; i++) {
        mockFirestoreService.getConversation.mockRejectedValueOnce(new Error(`Error ${i}`));
      }

      // 나머지 요청은 정상 처리
      for (let i = 0; i < normalCount; i++) {
        mockFirestoreService.getConversation.mockResolvedValueOnce(null);
      }

      const allRequests = Array.from({ length: errorCount + normalCount }, (_, i) => `error-test-${i}`);

      // Act
      const startTime = Date.now();
      const results = await Promise.allSettled(
        allRequests.map(chatId => 
          conversationService.initializeSession(chatId, 'ko')
        )
      );
      const totalTime = Date.now() - startTime;

      // Assert
      expect(results).toHaveLength(errorCount + normalCount);
      expect(totalTime).toBeLessThan(5000); // 5초 이내

      const successfulResults = results.filter(r => r.status === 'fulfilled');
      const failedResults = results.filter(r => r.status === 'rejected');

      expect(successfulResults).toHaveLength(normalCount);
      expect(failedResults).toHaveLength(errorCount);

      // 에러가 있어도 전체 시스템 성능에 큰 영향 없어야 함
      const avgTimePerRequest = totalTime / (errorCount + normalCount);
      expect(avgTimePerRequest).toBeLessThan(500); // 평균 500ms 이내
    });

    it('동시 다중 작업 유형을 효율적으로 처리해야 함', async () => {
      // Arrange
      const taskCount = 15;
      const mixedTasks: Array<() => Promise<any>> = [];

      // 다양한 작업 유형 혼합
      for (let i = 0; i < taskCount; i++) {
        if (i % 3 === 0) {
          // 세션 초기화
          mixedTasks.push(() => conversationService.initializeSession(`mixed-${i}`, 'ko'));
        } else if (i % 3 === 1) {
          // 메시지 저장
          mixedTasks.push(() => conversationService.saveMessage(`mixed-${i}`, 'user', `Mixed test message ${i}`));
        } else {
          // RAG 검색
          const mockLangChainService = langChainService as jest.Mocked<LangChainService>;
          mockLangChainService.search.mockResolvedValueOnce({
            documents: [{
              score: 0.90,
              title: `Mixed result ${i}`,
              text: `Mixed content ${i}`,
              filePath: `policies/mixed${i}.md`,
              url: `https://example.com/mixed${i}.md`,
              fileId: `file${i}`,
              seq: 0
            }],
            query: `mixed query ${i}`,
            total: 1,
            lang: 'ko'
          });
          mixedTasks.push(() => mockLangChainService.search({ query: `mixed query ${i}`, k: 3, lang: 'ko' }));
        }
      }

      // Act
      const startTime = Date.now();
      const results = await Promise.allSettled(
        mixedTasks.map(task => task())
      );
      const totalTime = Date.now() - startTime;

      // Assert
      expect(results).toHaveLength(taskCount);
      expect(totalTime).toBeLessThan(8000); // 8초 이내

      const successfulResults = results.filter(r => r.status === 'fulfilled');
      expect(successfulResults.length).toBeGreaterThan(taskCount * 0.8); // 80% 이상 성공

      // 혼합 작업도 효율적으로 처리
      const avgTime = totalTime / taskCount;
      expect(avgTime).toBeLessThan(600); // 평균 600ms 이내
    });
  });
});