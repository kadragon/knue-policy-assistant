import request from 'supertest';
import express from 'express';
import { ConversationService } from '../../src/services/conversation';
import { LangChainService } from '../../src/services/langchain';
import { TelegramService } from '../../src/services/telegram';
import { FirestoreService } from '../../src/services/firestore';
import { OpenAIService } from '../../src/services/openai';
import { HealthController } from '../../src/controllers/health';
import { TelegramController } from '../../src/controllers/telegram';
import { RAGController } from '../../src/controllers/rag';
import { GitHubController } from '../../src/controllers/github';
import {
  TelegramContext,
  RAGSearchRequest,
  RAGQueryRequest,
  GitHubPushPayload
} from '../../src/types';

// Mock all external services
jest.mock('../../src/services/firestore');
jest.mock('../../src/services/openai');
jest.mock('../../src/services/langchain');
jest.mock('../../src/services/telegram');
jest.mock('../../src/services/logger');
jest.mock('../../src/services/metrics');
jest.mock('../../src/config', () => ({
  appConfig: {
    TELEGRAM_BOT_TOKEN: 'mock-bot-token',
    GITHUB_WEBHOOK_SECRET: 'mock-webhook-secret',
    OPENAI_API_KEY: 'mock-openai-key',
    QDRANT_URL: 'mock-qdrant-url',
    QDRANT_API_KEY: 'mock-qdrant-key',
    COLLECTION_NAME: 'mock-collection',
    PORT: 3000
  }
}));

describe('E2E Flow Tests', () => {
  let app: express.Application;
  let mockFirestoreService: jest.Mocked<FirestoreService>;
  let mockOpenAIService: jest.Mocked<OpenAIService>;
  let mockLangChainService: jest.Mocked<LangChainService>;
  let mockTelegramService: jest.Mocked<TelegramService>;

  beforeAll(() => {
    // Create Express app with all controllers
    app = express();
    app.use(express.json());

    // Setup routes using controller instances
    const healthCtrl = new HealthController();
    const healthRouter = express.Router();
    healthRouter.get('/', (req, res) => healthCtrl.healthCheck(req, res));
    app.use('/health', healthRouter);

    const telegramCtrl = new TelegramController();
    const telegramRouter = express.Router();
    telegramRouter.post('/webhook', (req, res) => telegramCtrl.handleWebhook(req, res));
    app.use('/telegram', telegramRouter);

    const ragCtrl = new RAGController();
    const ragRouter = express.Router();
    ragRouter.post('/query', (req, res) => ragCtrl.processQuery(req, res));
    ragRouter.post('/search', (req, res) => ragCtrl.performSearch(req, res));
    app.use('/rag', ragRouter);

    const githubCtrl = new GitHubController();
    const githubRouter = express.Router();
    githubRouter.post('/webhook', (req, res) => githubCtrl.handleWebhook(req, res));
    app.use('/github', githubRouter);
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock service instances
    mockFirestoreService = new FirestoreService() as jest.Mocked<FirestoreService>;
    mockOpenAIService = new OpenAIService() as jest.Mocked<OpenAIService>;
    mockLangChainService = new LangChainService() as jest.Mocked<LangChainService>;
    mockTelegramService = new TelegramService() as jest.Mocked<TelegramService>;

    // Setup default mocks
    setupDefaultMocks();
  });

  function setupDefaultMocks() {
    // Firestore mocks
    mockFirestoreService.getConversation.mockResolvedValue(null);
    mockFirestoreService.saveConversation.mockResolvedValue();
    mockFirestoreService.saveMessage.mockResolvedValue();
    mockFirestoreService.getRecentMessages.mockResolvedValue([]);
    mockFirestoreService.shouldTriggerSummary.mockResolvedValue(false);

    // OpenAI mocks
    mockOpenAIService.generateSummary.mockResolvedValue('Generated summary');
    mockOpenAIService.estimateTokens.mockReturnValue(50);

    // LangChain mocks
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

    mockLangChainService.healthCheck.mockResolvedValue({
      status: 'healthy',
      vectorStore: true,
      ragChain: true,
      conversationalChain: true
    });

    // Telegram mocks
    mockTelegramService.sendMessage.mockResolvedValue();
  }

  describe('헬스체크 E2E', () => {
    it('헬스체크 엔드포인트가 정상 작동해야 함', async () => {
      // Act
      const response = await request(app)
        .get('/health')
        .expect(200);

      // Assert
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('services');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body.services).toHaveProperty('firestore');
      expect(response.body.services).toHaveProperty('qdrant');
      expect(response.body.services).toHaveProperty('openai');
    });

    it('상세 헬스체크 엔드포인트가 정상 작동해야 함', async () => {
      // Act
      const response = await request(app)
        .get('/health/detailed')
        .expect(200);

      // Assert
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('services');
      expect(response.body).toHaveProperty('system');
      expect(response.body.system).toHaveProperty('memory');
      expect(response.body.system).toHaveProperty('uptime');
      expect(response.body.system).toHaveProperty('nodeVersion');
    });
  });

  describe('RAG 검색 E2E', () => {
    it('RAG 검색 API가 정상 작동해야 함', async () => {
      // Arrange
      const searchRequest: RAGSearchRequest = {
        query: '휴가 규정에 대해 알려주세요',
        k: 5,
        minScore: 0.80,
        lang: 'ko'
      };

      // Act
      const response = await request(app)
        .post('/rag/search')
        .send(searchRequest)
        .expect(200);

      // Assert
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('documents');
      expect(response.body.data).toHaveProperty('query', '휴가 규정에 대해 알려주세요');
      expect(response.body.data).toHaveProperty('total', 1);
      expect(response.body.data.documents).toHaveLength(1);
      expect(response.body.data.documents[0]).toHaveProperty('score', 0.95);
      expect(response.body.data.documents[0]).toHaveProperty('title', '휴가 규정');

      // LangChain 서비스 호출 확인
      expect(mockLangChainService.search).toHaveBeenCalledWith(searchRequest);
    });

    it('RAG 질의응답 API가 정상 작동해야 함', async () => {
      // Arrange
      const queryRequest: RAGQueryRequest = {
        question: '휴가는 몇 일까지 쓸 수 있나요?',
        lang: 'ko',
        chatId: 'test-chat-123'
      };

      // Act
      const response = await request(app)
        .post('/rag/query')
        .send(queryRequest)
        .expect(200);

      // Assert
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('answer');
      expect(response.body.data).toHaveProperty('sources');
      expect(response.body.data).toHaveProperty('question', '휴가는 몇 일까지 쓸 수 있나요?');
      expect(response.body.data).toHaveProperty('lang', 'ko');
      expect(response.body.data.sources).toHaveLength(1);
      expect(response.body.data.sources[0]).toHaveProperty('title', '휴가 규정');

      // LangChain 서비스 호출 확인
      expect(mockLangChainService.conversationalQuery).toHaveBeenCalledWith(
        queryRequest.question,
        expect.any(Array),
        queryRequest.lang
      );
    });

    it('잘못된 검색 요청에 대해 400 에러를 반환해야 함', async () => {
      // Arrange
      const invalidRequest = {
        // query가 누락됨
        k: 5,
        lang: 'ko'
      };

      // Act
      const response = await request(app)
        .post('/rag/search')
        .send(invalidRequest)
        .expect(400);

      // Assert
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('message');
    });
  });

  describe('텔레그램 웹훅 E2E', () => {
    it('텔레그램 사용자 메시지 웹훅을 처리해야 함', async () => {
      // Arrange
      const telegramWebhook = {
        update_id: 123456789,
        message: {
          message_id: 1,
          date: Math.floor(Date.now() / 1000),
          chat: {
            id: 987654321,
            type: 'private'
          },
          from: {
            id: 987654321,
            is_bot: false,
            first_name: 'Test',
            username: 'testuser',
            language_code: 'ko'
          },
          text: '휴가 규정에 대해 알려주세요'
        }
      };

      // Act
      const response = await request(app)
        .post('/telegram/webhook')
        .send(telegramWebhook)
        .expect(200);

      // Assert
      expect(response.body).toHaveProperty('success', true);
      
      // 대화 서비스 호출 확인
      expect(mockFirestoreService.saveMessage).toHaveBeenCalledTimes(2); // user + assistant
      expect(mockLangChainService.conversationalQuery).toHaveBeenCalled();
      expect(mockTelegramService.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          chatId: '987654321',
          text: expect.stringContaining('휴가 규정에 대해 안내드리겠습니다')
        })
      );
    });

    it('텔레그램 리셋 명령어를 처리해야 함', async () => {
      // Arrange
      const resetWebhook = {
        update_id: 123456790,
        message: {
          message_id: 2,
          date: Math.floor(Date.now() / 1000),
          chat: {
            id: 987654321,
            type: 'private'
          },
          from: {
            id: 987654321,
            is_bot: false,
            first_name: 'Test',
            username: 'testuser'
          },
          text: '/reset'
        }
      };

      mockFirestoreService.resetConversation.mockResolvedValue();

      // Act
      const response = await request(app)
        .post('/telegram/webhook')
        .send(resetWebhook)
        .expect(200);

      // Assert
      expect(response.body).toHaveProperty('success', true);
      expect(mockFirestoreService.resetConversation).toHaveBeenCalledWith('987654321');
      expect(mockTelegramService.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          chatId: '987654321',
          text: expect.stringContaining('대화 세션이 초기화되었습니다')
        })
      );
    });

    it('텔레그램 언어 변경 명령어를 처리해야 함', async () => {
      // Arrange
      const langWebhook = {
        update_id: 123456791,
        message: {
          message_id: 3,
          date: Math.floor(Date.now() / 1000),
          chat: {
            id: 987654321,
            type: 'private'
          },
          from: {
            id: 987654321,
            is_bot: false,
            first_name: 'Test',
            username: 'testuser'
          },
          text: '/lang en'
        }
      };

      // Act
      const response = await request(app)
        .post('/telegram/webhook')
        .send(langWebhook)
        .expect(200);

      // Assert
      expect(response.body).toHaveProperty('success', true);
      expect(mockTelegramService.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          chatId: '987654321',
          text: expect.stringContaining('Language changed to English')
        })
      );
    });

    it('잘못된 텔레그램 웹훅 형식에 대해 400 에러를 반환해야 함', async () => {
      // Arrange
      const invalidWebhook = {
        // message가 누락됨
        update_id: 123456792
      };

      // Act
      const response = await request(app)
        .post('/telegram/webhook')
        .send(invalidWebhook)
        .expect(400);

      // Assert
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GitHub 웹훅 E2E', () => {
    it('GitHub push 웹훅을 처리해야 함', async () => {
      // Arrange
      const pushPayload: GitHubPushPayload = {
        ref: 'refs/heads/main',
        repository: {
          id: 123456,
          name: 'KNUE-Policy-Hub',
          full_name: 'kadragon/KNUE-Policy-Hub',
          default_branch: 'main'
        },
        commits: [
          {
            id: 'abc123def456',
            message: 'Update vacation policy',
            added: ['policies/vacation-2024.md'],
            modified: ['policies/vacation.md'],
            removed: []
          }
        ],
        head_commit: {
          id: 'abc123def456',
          message: 'Update vacation policy',
          added: ['policies/vacation-2024.md'],
          modified: ['policies/vacation.md'],
          removed: []
        }
      };

      // GitHub 서비스 mock 설정
      jest.mock('../../src/services/github', () => ({
        GitHubService: jest.fn().mockImplementation(() => ({
          processWebhook: jest.fn().mockResolvedValue({
            success: true,
            jobId: 'job123',
            filesProcessed: 2
          })
        }))
      }));

      // Act
      const response = await request(app)
        .post('/github/webhook')
        .set('X-Hub-Signature-256', 'sha256=mock-signature')
        .send(pushPayload)
        .expect(200);

      // Assert
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
    });

    it('잘못된 서명의 GitHub 웹훅에 대해 401 에러를 반환해야 함', async () => {
      // Arrange
      const pushPayload = {
        ref: 'refs/heads/main',
        repository: {
          name: 'test-repo'
        }
      };

      // Act
      const response = await request(app)
        .post('/github/webhook')
        .set('X-Hub-Signature-256', 'sha256=invalid-signature')
        .send(pushPayload)
        .expect(401);

      // Assert
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error.message).toContain('Invalid signature');
    });
  });

  describe('전체 플로우 E2E', () => {
    it('완전한 사용자 상호작용 플로우를 시뮬레이션해야 함', async () => {
      // Arrange - 사용자가 처음 봇과 상호작용하는 시나리오
      const chatId = '999888777';
      
      // Setup conversation progression
      let conversationState = {
        messageCount: 0,
        hasHistory: false
      };

      mockFirestoreService.getConversation.mockImplementation(async () => {
        if (conversationState.messageCount === 0) return null;
        return {
          chatId,
          lang: 'ko',
          messageCount: conversationState.messageCount,
          lastMessageAt: { toDate: () => new Date() } as any,
          createdAt: { toDate: () => new Date() } as any,
          updatedAt: { toDate: () => new Date() } as any
        };
      });

      mockFirestoreService.getRecentMessages.mockImplementation(async () => {
        if (!conversationState.hasHistory) return [];
        return [
          {
            messageId: 'msg1',
            chatId,
            role: 'user',
            text: '휴가 규정에 대해 알려주세요',
            createdAt: { toDate: () => new Date() } as any
          },
          {
            messageId: 'msg2',
            chatId,
            role: 'assistant',
            text: '휴가 규정에 대해 안내드리겠습니다...',
            createdAt: { toDate: () => new Date() } as any
          }
        ];
      });

      // Act & Assert - Step by step flow

      // Step 1: 첫 번째 질문
      const firstMessage = {
        update_id: 1,
        message: {
          message_id: 1,
          date: Math.floor(Date.now() / 1000),
          chat: { id: parseInt(chatId), type: 'private' },
          from: { id: parseInt(chatId), is_bot: false, first_name: 'User' },
          text: '휴가 규정에 대해 알려주세요'
        }
      };

      const response1 = await request(app)
        .post('/telegram/webhook')
        .send(firstMessage)
        .expect(200);

      expect(response1.body.success).toBe(true);
      expect(mockLangChainService.conversationalQuery).toHaveBeenCalledWith(
        '휴가 규정에 대해 알려주세요',
        [], // 첫 번째 질문이므로 빈 히스토리
        'ko'
      );

      // Update state for next interaction
      conversationState.messageCount = 2;
      conversationState.hasHistory = true;

      // Step 2: 연속 질문 (맥락 포함)
      mockLangChainService.conversationalQuery.mockResolvedValueOnce({
        answer: '병가는 연차와 별도로 연 30일까지 사용 가능합니다.',
        sources: [{ title: '병가 규정', filePath: 'policies/sick-leave.md', url: 'https://example.com/sick-leave.md' }],
        question: '병가는 어떻게 되나요?',
        lang: 'ko',
        processingTime: 1200
      });

      const secondMessage = {
        update_id: 2,
        message: {
          message_id: 2,
          date: Math.floor(Date.now() / 1000),
          chat: { id: parseInt(chatId), type: 'private' },
          from: { id: parseInt(chatId), is_bot: false, first_name: 'User' },
          text: '병가는 어떻게 되나요?'
        }
      };

      const response2 = await request(app)
        .post('/telegram/webhook')
        .send(secondMessage)
        .expect(200);

      expect(response2.body.success).toBe(true);
      expect(mockLangChainService.conversationalQuery).toHaveBeenLastCalledWith(
        '병가는 어떻게 되나요?',
        expect.arrayContaining([
          expect.objectContaining({ role: 'user', text: '휴가 규정에 대해 알려주세요' }),
          expect.objectContaining({ role: 'assistant' })
        ]),
        'ko'
      );

      // Step 3: 세션 리셋
      const resetMessage = {
        update_id: 3,
        message: {
          message_id: 3,
          date: Math.floor(Date.now() / 1000),
          chat: { id: parseInt(chatId), type: 'private' },
          from: { id: parseInt(chatId), is_bot: false, first_name: 'User' },
          text: '/reset'
        }
      };

      const response3 = await request(app)
        .post('/telegram/webhook')
        .send(resetMessage)
        .expect(200);

      expect(response3.body.success).toBe(true);
      expect(mockFirestoreService.resetConversation).toHaveBeenCalledWith(chatId);

      // Reset state
      conversationState.messageCount = 0;
      conversationState.hasHistory = false;

      // Step 4: 리셋 후 새로운 질문
      const newMessage = {
        update_id: 4,
        message: {
          message_id: 4,
          date: Math.floor(Date.now() / 1000),
          chat: { id: parseInt(chatId), type: 'private' },
          from: { id: parseInt(chatId), is_bot: false, first_name: 'User' },
          text: '출장비 규정이 궁금합니다'
        }
      };

      mockLangChainService.conversationalQuery.mockResolvedValueOnce({
        answer: '출장비는 실비 정산을 원칙으로 합니다.',
        sources: [{ title: '출장비 규정', filePath: 'policies/travel.md', url: 'https://example.com/travel.md' }],
        question: '출장비 규정이 궁금합니다',
        lang: 'ko',
        processingTime: 1100
      });

      const response4 = await request(app)
        .post('/telegram/webhook')
        .send(newMessage)
        .expect(200);

      expect(response4.body.success).toBe(true);
      expect(mockLangChainService.conversationalQuery).toHaveBeenLastCalledWith(
        '출장비 규정이 궁금합니다',
        [], // 리셋 후이므로 다시 빈 히스토리
        'ko'
      );

      // Verify all interactions
      expect(mockTelegramService.sendMessage).toHaveBeenCalledTimes(5); // 4 responses + 1 reset confirmation
      expect(mockFirestoreService.saveMessage).toHaveBeenCalled();
      expect(mockFirestoreService.saveConversation).toHaveBeenCalled();
    });

    it('동시 다중 사용자 상호작용을 처리해야 함', async () => {
      // Arrange - 두 명의 다른 사용자가 동시에 상호작용
      const user1ChatId = '111111111';
      const user2ChatId = '222222222';

      // Setup separate conversation states
      mockFirestoreService.getConversation.mockImplementation(async (chatId) => {
        return null; // 모든 사용자는 새로운 세션부터 시작
      });

      mockFirestoreService.getRecentMessages.mockImplementation(async () => []);

      // Different responses for different users
      mockLangChainService.conversationalQuery
        .mockResolvedValueOnce({
          answer: 'User 1: 휴가 규정 답변',
          sources: [],
          question: 'User 1 question',
          lang: 'ko',
          processingTime: 1000
        })
        .mockResolvedValueOnce({
          answer: 'User 2: 출장비 규정 답변',
          sources: [],
          question: 'User 2 question',
          lang: 'ko',
          processingTime: 1100
        });

      // Act - 두 사용자가 동시에 요청
      const user1Message = {
        update_id: 100,
        message: {
          message_id: 1,
          date: Math.floor(Date.now() / 1000),
          chat: { id: parseInt(user1ChatId), type: 'private' },
          from: { id: parseInt(user1ChatId), is_bot: false, first_name: 'User1' },
          text: '휴가 규정 질문'
        }
      };

      const user2Message = {
        update_id: 101,
        message: {
          message_id: 1,
          date: Math.floor(Date.now() / 1000),
          chat: { id: parseInt(user2ChatId), type: 'private' },
          from: { id: parseInt(user2ChatId), is_bot: false, first_name: 'User2' },
          text: '출장비 규정 질문'
        }
      };

      const [response1, response2] = await Promise.all([
        request(app).post('/telegram/webhook').send(user1Message),
        request(app).post('/telegram/webhook').send(user2Message)
      ]);

      // Assert
      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);
      expect(response1.body.success).toBe(true);
      expect(response2.body.success).toBe(true);

      // 각 사용자별로 독립적인 세션이 처리되었는지 확인
      expect(mockFirestoreService.saveConversation).toHaveBeenCalledTimes(2);
      expect(mockTelegramService.sendMessage).toHaveBeenCalledTimes(2);
      
      // 사용자별로 다른 응답이 전송되었는지 확인
      const sentMessages = mockTelegramService.sendMessage.mock.calls;
      const user1Response = sentMessages.find(call => call[0].chatId === user1ChatId);
      const user2Response = sentMessages.find(call => call[0].chatId === user2ChatId);
      
      expect(user1Response).toBeDefined();
      expect(user2Response).toBeDefined();
      expect(user1Response![0].text).toContain('User 1');
      expect(user2Response![0].text).toContain('User 2');
    });
  });
});