import { Timestamp } from '@google-cloud/firestore';
import { ConversationService } from '../../src/services/conversation';
import { FirestoreService } from '../../src/services/firestore';
import { OpenAIService } from '../../src/services/openai';
import {
  Conversation,
  Message,
  MessageRole,
  Language,
  DEFAULT_VALUES,
  ServiceError
} from '../../src/types';

// Mock dependencies
jest.mock('../../src/services/firestore');
jest.mock('../../src/services/openai');
jest.mock('../../src/services/logger');
jest.mock('../../src/services/metrics');

describe('ConversationService', () => {
  let conversationService: ConversationService;
  let mockFirestoreService: jest.Mocked<FirestoreService>;
  let mockOpenAIService: jest.Mocked<OpenAIService>;

  const mockChatId = 'test-chat-123';
  const mockTimestamp = Timestamp.fromDate(new Date('2024-01-01T00:00:00Z'));

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockFirestoreService = new FirestoreService() as jest.Mocked<FirestoreService>;
    mockOpenAIService = new OpenAIService() as jest.Mocked<OpenAIService>;
    
    conversationService = new ConversationService(
      mockFirestoreService,
      mockOpenAIService
    );
  });

  describe('세션 CRUD 테스트', () => {
    describe('initializeSession', () => {
      it('새로운 세션을 성공적으로 생성해야 함', async () => {
        // Arrange
        const expectedConversation: Conversation = {
          chatId: mockChatId,
          lang: 'ko',
          messageCount: 0,
          lastMessageAt: mockTimestamp,
          createdAt: mockTimestamp,
          updatedAt: mockTimestamp
        };

        mockFirestoreService.getConversation.mockResolvedValue(null);
        mockFirestoreService.saveConversation.mockResolvedValue();

        // Act
        const result = await conversationService.initializeSession(mockChatId, 'ko');

        // Assert
        expect(mockFirestoreService.getConversation).toHaveBeenCalledWith(mockChatId);
        expect(mockFirestoreService.saveConversation).toHaveBeenCalledWith(
          expect.objectContaining({
            chatId: mockChatId,
            lang: 'ko',
            messageCount: 0
          })
        );
        expect(result.chatId).toBe(mockChatId);
        expect(result.lang).toBe('ko');
        expect(result.messageCount).toBe(0);
      });

      it('기존 세션이 있으면 해당 세션을 반환해야 함', async () => {
        // Arrange
        const existingConversation: Conversation = {
          chatId: mockChatId,
          lang: 'en',
          messageCount: 5,
          lastMessageAt: mockTimestamp,
          createdAt: mockTimestamp,
          updatedAt: mockTimestamp,
          summary: '기존 요약'
        };

        mockFirestoreService.getConversation.mockResolvedValue(existingConversation);

        // Act
        const result = await conversationService.initializeSession(mockChatId, 'ko');

        // Assert
        expect(mockFirestoreService.getConversation).toHaveBeenCalledWith(mockChatId);
        expect(mockFirestoreService.saveConversation).not.toHaveBeenCalled();
        expect(result).toEqual(existingConversation);
      });

      it('세션 초기화 실패 시 ServiceError를 던져야 함', async () => {
        // Arrange
        const error = new Error('Database connection failed');
        mockFirestoreService.getConversation.mockRejectedValue(error);

        // Act & Assert
        await expect(
          conversationService.initializeSession(mockChatId, 'ko')
        ).rejects.toThrow(ServiceError);

        await expect(
          conversationService.initializeSession(mockChatId, 'ko')
        ).rejects.toThrow('Failed to initialize conversation session');
      });

      it('기본 언어로 세션을 생성해야 함', async () => {
        // Arrange
        mockFirestoreService.getConversation.mockResolvedValue(null);
        mockFirestoreService.saveConversation.mockResolvedValue();

        // Act
        const result = await conversationService.initializeSession(mockChatId);

        // Assert
        expect(result.lang).toBe(DEFAULT_VALUES.LANG);
      });
    });

    describe('resetSession', () => {
      it('세션을 성공적으로 리셋해야 함', async () => {
        // Arrange
        mockFirestoreService.resetConversation.mockResolvedValue();

        // Act
        await conversationService.resetSession(mockChatId);

        // Assert
        expect(mockFirestoreService.resetConversation).toHaveBeenCalledWith(mockChatId);
      });

      it('세션 리셋 실패 시 ServiceError를 던져야 함', async () => {
        // Arrange
        const error = new Error('Reset failed');
        mockFirestoreService.resetConversation.mockRejectedValue(error);

        // Act & Assert
        await expect(
          conversationService.resetSession(mockChatId)
        ).rejects.toThrow(ServiceError);
      });
    });

    describe('updateLanguage', () => {
      it('기존 세션의 언어를 성공적으로 변경해야 함', async () => {
        // Arrange
        const existingConversation: Conversation = {
          chatId: mockChatId,
          lang: 'ko',
          messageCount: 3,
          lastMessageAt: mockTimestamp,
          createdAt: mockTimestamp,
          updatedAt: mockTimestamp
        };

        mockFirestoreService.getConversation.mockResolvedValue(existingConversation);
        mockFirestoreService.saveConversation.mockResolvedValue();

        // Act
        await conversationService.updateLanguage(mockChatId, 'en');

        // Assert
        expect(mockFirestoreService.getConversation).toHaveBeenCalledWith(mockChatId);
        expect(mockFirestoreService.saveConversation).toHaveBeenCalledWith(
          expect.objectContaining({
            chatId: mockChatId,
            lang: 'en',
            messageCount: 3
          })
        );
      });

      it('세션이 없으면 새로운 세션을 생성해야 함', async () => {
        // Arrange
        mockFirestoreService.getConversation.mockResolvedValue(null);
        mockFirestoreService.saveConversation.mockResolvedValue();

        // Act
        await conversationService.updateLanguage(mockChatId, 'en');

        // Assert
        expect(mockFirestoreService.getConversation).toHaveBeenCalledWith(mockChatId);
        // initializeSession 호출로 인해 saveConversation이 호출됨
        expect(mockFirestoreService.saveConversation).toHaveBeenCalled();
      });

      it('언어 업데이트 실패 시 ServiceError를 던져야 함', async () => {
        // Arrange
        const error = new Error('Update failed');
        mockFirestoreService.getConversation.mockRejectedValue(error);

        // Act & Assert
        await expect(
          conversationService.updateLanguage(mockChatId, 'en')
        ).rejects.toThrow(ServiceError);
      });
    });
  });

  describe('메시지 관리 테스트', () => {
    describe('saveMessage', () => {
      it('사용자 메시지를 성공적으로 저장해야 함', async () => {
        // Arrange
        const messageText = '휴가 규정에 대해 알려주세요';
        mockFirestoreService.saveMessage.mockResolvedValue();
        mockFirestoreService.shouldTriggerSummary.mockResolvedValue(false);

        // Act
        await conversationService.saveMessage(mockChatId, 'user', messageText);

        // Assert
        expect(mockFirestoreService.saveMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            chatId: mockChatId,
            role: 'user',
            text: messageText
          })
        );
      });

      it('어시스턴트 메시지를 메타데이터와 함께 저장해야 함', async () => {
        // Arrange
        const messageText = '휴가 규정은 다음과 같습니다...';
        const metadata = { 
          sources: ['policy.md'], 
          searchScore: 0.95,
          processingTime: 1500
        };
        mockFirestoreService.saveMessage.mockResolvedValue();
        mockFirestoreService.shouldTriggerSummary.mockResolvedValue(false);

        // Act
        await conversationService.saveMessage(mockChatId, 'assistant', messageText, metadata);

        // Assert
        expect(mockFirestoreService.saveMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            chatId: mockChatId,
            role: 'assistant',
            text: messageText,
            metadata
          })
        );
      });

      it('메시지 저장 후 요약 트리거 조건을 확인해야 함', async () => {
        // Arrange
        mockFirestoreService.saveMessage.mockResolvedValue();
        mockFirestoreService.shouldTriggerSummary.mockResolvedValue(true);
        mockFirestoreService.getRecentMessages.mockResolvedValue([]);
        mockOpenAIService.generateSummary.mockResolvedValue('요약 내용');
        mockFirestoreService.updateConversationSummary.mockResolvedValue();

        // Act
        await conversationService.saveMessage(mockChatId, 'user', '테스트 메시지');

        // Assert
        expect(mockFirestoreService.shouldTriggerSummary).toHaveBeenCalledWith(mockChatId);
      });

      it('메시지 저장 실패 시 ServiceError를 던져야 함', async () => {
        // Arrange
        const error = new Error('Save failed');
        mockFirestoreService.saveMessage.mockRejectedValue(error);

        // Act & Assert
        await expect(
          conversationService.saveMessage(mockChatId, 'user', '테스트')
        ).rejects.toThrow(ServiceError);
      });
    });

    describe('getRecentMessages', () => {
      it('최근 메시지들을 성공적으로 조회해야 함', async () => {
        // Arrange
        const mockMessages: Message[] = [
          {
            messageId: 'msg1',
            chatId: mockChatId,
            role: 'user',
            text: '첫 번째 메시지',
            createdAt: mockTimestamp
          },
          {
            messageId: 'msg2',
            chatId: mockChatId,
            role: 'assistant',
            text: '두 번째 메시지',
            createdAt: mockTimestamp
          }
        ];
        mockFirestoreService.getRecentMessages.mockResolvedValue(mockMessages);

        // Act
        const result = await conversationService.getRecentMessages(mockChatId, 5);

        // Assert
        expect(mockFirestoreService.getRecentMessages).toHaveBeenCalledWith(mockChatId, 5);
        expect(result).toEqual(mockMessages);
      });

      it('기본 limit으로 메시지를 조회해야 함', async () => {
        // Arrange
        mockFirestoreService.getRecentMessages.mockResolvedValue([]);

        // Act
        await conversationService.getRecentMessages(mockChatId);

        // Assert
        expect(mockFirestoreService.getRecentMessages).toHaveBeenCalledWith(mockChatId, 10);
      });

      it('메시지 조회 실패 시 ServiceError를 던져야 함', async () => {
        // Arrange
        const error = new Error('Fetch failed');
        mockFirestoreService.getRecentMessages.mockRejectedValue(error);

        // Act & Assert
        await expect(
          conversationService.getRecentMessages(mockChatId)
        ).rejects.toThrow(ServiceError);
      });
    });
  });

  describe('요약 생성 테스트', () => {
    describe('forceSummaryGeneration', () => {
      it('요약을 수동으로 생성해야 함', async () => {
        // Arrange
        const mockMessages: Message[] = [
          {
            messageId: 'msg1',
            chatId: mockChatId,
            role: 'user',
            text: '휴가 규정 질문',
            createdAt: mockTimestamp
          }
        ];
        const expectedSummary = '사용자가 휴가 규정에 대해 문의함';
        
        mockFirestoreService.getRecentMessages.mockResolvedValue(mockMessages);
        mockOpenAIService.generateSummary.mockResolvedValue(expectedSummary);
        mockFirestoreService.updateConversationSummary.mockResolvedValue();
        
        const updatedConversation: Conversation = {
          chatId: mockChatId,
          lang: 'ko',
          messageCount: 1,
          lastMessageAt: mockTimestamp,
          createdAt: mockTimestamp,
          updatedAt: mockTimestamp,
          summary: expectedSummary
        };
        mockFirestoreService.getConversation.mockResolvedValue(updatedConversation);

        // Act
        const result = await conversationService.forceSummaryGeneration(mockChatId);

        // Assert
        expect(mockFirestoreService.getRecentMessages).toHaveBeenCalledWith(
          mockChatId,
          DEFAULT_VALUES.SUMMARY_TRIGGER_MESSAGES
        );
        expect(mockOpenAIService.generateSummary).toHaveBeenCalledWith(mockMessages);
        expect(mockFirestoreService.updateConversationSummary).toHaveBeenCalledWith(
          mockChatId,
          expectedSummary
        );
        expect(result).toBe(expectedSummary);
      });

      it('메시지가 없으면 요약 생성을 건너뛰어야 함', async () => {
        // Arrange
        mockFirestoreService.getRecentMessages.mockResolvedValue([]);
        mockFirestoreService.getConversation.mockResolvedValue({
          chatId: mockChatId,
          lang: 'ko',
          messageCount: 0,
          lastMessageAt: mockTimestamp,
          createdAt: mockTimestamp,
          updatedAt: mockTimestamp
        });

        // Act
        const result = await conversationService.forceSummaryGeneration(mockChatId);

        // Assert
        expect(mockOpenAIService.generateSummary).not.toHaveBeenCalled();
        expect(mockFirestoreService.updateConversationSummary).not.toHaveBeenCalled();
        expect(result).toBe('No summary generated');
      });

      it('요약 생성 실패 시 ServiceError를 던져야 함', async () => {
        // Arrange
        const error = new Error('Summary generation failed');
        mockFirestoreService.getRecentMessages.mockRejectedValue(error);

        // Act & Assert
        await expect(
          conversationService.forceSummaryGeneration(mockChatId)
        ).rejects.toThrow(ServiceError);
      });
    });
  });

  describe('턴 관리 테스트', () => {
    describe('buildMemoryContext', () => {
      it('토큰 제한 내에서 메모리 컨텍스트를 구성해야 함', async () => {
        // Arrange
        const mockConversation: Conversation = {
          chatId: mockChatId,
          lang: 'ko',
          messageCount: 5,
          lastMessageAt: mockTimestamp,
          createdAt: mockTimestamp,
          updatedAt: mockTimestamp,
          summary: '이전 대화 요약'
        };

        const mockMessages: Message[] = [
          {
            messageId: 'msg1',
            chatId: mockChatId,
            role: 'user',
            text: '짧은 메시지 1',
            createdAt: mockTimestamp
          },
          {
            messageId: 'msg2',
            chatId: mockChatId,
            role: 'assistant',
            text: '짧은 응답 1',
            createdAt: mockTimestamp
          }
        ];

        mockFirestoreService.getConversation.mockResolvedValue(mockConversation);
        mockFirestoreService.getRecentMessages.mockResolvedValue(mockMessages);
        mockOpenAIService.estimateTokens
          .mockReturnValueOnce(50)  // summary tokens
          .mockReturnValueOnce(20)  // first message tokens
          .mockReturnValueOnce(20)  // second message tokens
          .mockReturnValueOnce(50)  // summary tokens for result
          .mockReturnValueOnce(20); // message tokens for result

        // Act
        const result = await conversationService.buildMemoryContext(mockChatId, 200);

        // Assert
        expect(result.summary).toBe('이전 대화 요약');
        expect(result.recentMessages).toEqual(mockMessages);
        expect(result.tokenCount).toBe(90); // 50 + 20 + 20
        expect(mockOpenAIService.estimateTokens).toHaveBeenCalledTimes(5);
      });

      it('토큰 초과 시 메시지를 제한해야 함', async () => {
        // Arrange
        const mockConversation: Conversation = {
          chatId: mockChatId,
          lang: 'ko',
          messageCount: 3,
          lastMessageAt: mockTimestamp,
          createdAt: mockTimestamp,
          updatedAt: mockTimestamp,
          summary: '요약'
        };

        const mockMessages: Message[] = [
          {
            messageId: 'msg1',
            chatId: mockChatId,
            role: 'user',
            text: '긴 메시지 1',
            createdAt: mockTimestamp
          },
          {
            messageId: 'msg2',
            chatId: mockChatId,
            role: 'assistant',
            text: '긴 응답 1',
            createdAt: mockTimestamp
          }
        ];

        mockFirestoreService.getConversation.mockResolvedValue(mockConversation);
        mockFirestoreService.getRecentMessages.mockResolvedValue(mockMessages);
        mockOpenAIService.estimateTokens
          .mockReturnValueOnce(50)  // summary tokens
          .mockReturnValueOnce(60)  // first message tokens (too many)
          .mockReturnValueOnce(30)  // second message tokens
          .mockReturnValueOnce(50); // summary tokens for result

        // Act
        const result = await conversationService.buildMemoryContext(mockChatId, 100);

        // Assert
        expect(result.summary).toBe('요약');
        expect(result.recentMessages).toHaveLength(1); // Only one message fits
        expect(result.tokenCount).toBe(80); // 50 + 30
      });

      it('요약이 없어도 메모리 컨텍스트를 구성해야 함', async () => {
        // Arrange
        const mockConversation: Conversation = {
          chatId: mockChatId,
          lang: 'ko',
          messageCount: 2,
          lastMessageAt: mockTimestamp,
          createdAt: mockTimestamp,
          updatedAt: mockTimestamp
        };

        const mockMessages: Message[] = [
          {
            messageId: 'msg1',
            chatId: mockChatId,
            role: 'user',
            text: '메시지',
            createdAt: mockTimestamp
          }
        ];

        mockFirestoreService.getConversation.mockResolvedValue(mockConversation);
        mockFirestoreService.getRecentMessages.mockResolvedValue(mockMessages);
        mockOpenAIService.estimateTokens.mockReturnValue(20);

        // Act
        const result = await conversationService.buildMemoryContext(mockChatId, 100);

        // Assert
        expect(result.summary).toBeUndefined();
        expect(result.recentMessages).toEqual(mockMessages);
        expect(result.tokenCount).toBe(20);
      });

      it('메모리 컨텍스트 구성 실패 시 ServiceError를 던져야 함', async () => {
        // Arrange
        const error = new Error('Context build failed');
        mockFirestoreService.getConversation.mockRejectedValue(error);

        // Act & Assert
        await expect(
          conversationService.buildMemoryContext(mockChatId, 1000)
        ).rejects.toThrow(ServiceError);
      });
    });

    describe('getConversationStats', () => {
      it('대화 통계를 성공적으로 조회해야 함', async () => {
        // Arrange
        const mockConversation: Conversation = {
          chatId: mockChatId,
          lang: 'ko',
          messageCount: 10,
          lastMessageAt: mockTimestamp,
          createdAt: mockTimestamp,
          updatedAt: mockTimestamp,
          summary: '대화 요약'
        };

        mockFirestoreService.getConversation.mockResolvedValue(mockConversation);
        mockFirestoreService.getMessageCount.mockResolvedValue(15);

        // Act
        const result = await conversationService.getConversationStats(mockChatId);

        // Assert
        expect(result).toEqual({
          messageCount: 15,
          hasSummary: true,
          lastMessageAt: mockTimestamp.toDate(),
          createdAt: mockTimestamp.toDate()
        });
      });

      it('세션이 없을 때 통계를 조회해야 함', async () => {
        // Arrange
        mockFirestoreService.getConversation.mockResolvedValue(null);
        mockFirestoreService.getMessageCount.mockResolvedValue(0);

        // Act
        const result = await conversationService.getConversationStats(mockChatId);

        // Assert
        expect(result).toEqual({
          messageCount: 0,
          hasSummary: false,
          lastMessageAt: undefined,
          createdAt: undefined
        });
      });

      it('통계 조회 실패 시 ServiceError를 던져야 함', async () => {
        // Arrange
        const error = new Error('Stats failed');
        mockFirestoreService.getConversation.mockRejectedValue(error);

        // Act & Assert
        await expect(
          conversationService.getConversationStats(mockChatId)
        ).rejects.toThrow(ServiceError);
      });
    });

    describe('isSessionActive', () => {
      it('활성 세션을 올바르게 감지해야 함', async () => {
        // Arrange
        const recentTimestamp = Timestamp.fromDate(new Date(Date.now() - 30 * 60 * 1000)); // 30분 전
        const mockConversation: Conversation = {
          chatId: mockChatId,
          lang: 'ko',
          messageCount: 5,
          lastMessageAt: recentTimestamp,
          createdAt: mockTimestamp,
          updatedAt: mockTimestamp
        };

        mockFirestoreService.getConversation.mockResolvedValue(mockConversation);

        // Act
        const result = await conversationService.isSessionActive(mockChatId, 1); // 1시간

        // Assert
        expect(result).toBe(true);
      });

      it('비활성 세션을 올바르게 감지해야 함', async () => {
        // Arrange
        const oldTimestamp = Timestamp.fromDate(new Date(Date.now() - 25 * 60 * 60 * 1000)); // 25시간 전
        const mockConversation: Conversation = {
          chatId: mockChatId,
          lang: 'ko',
          messageCount: 5,
          lastMessageAt: oldTimestamp,
          createdAt: mockTimestamp,
          updatedAt: mockTimestamp
        };

        mockFirestoreService.getConversation.mockResolvedValue(mockConversation);

        // Act
        const result = await conversationService.isSessionActive(mockChatId, 24); // 24시간

        // Assert
        expect(result).toBe(false);
      });

      it('세션이 없으면 비활성으로 판단해야 함', async () => {
        // Arrange
        mockFirestoreService.getConversation.mockResolvedValue(null);

        // Act
        const result = await conversationService.isSessionActive(mockChatId);

        // Assert
        expect(result).toBe(false);
      });
    });
  });

  describe('언어 감지 테스트', () => {
    describe('detectAndUpdateLanguage', () => {
      it('한국어를 감지하고 업데이트해야 함', async () => {
        // Arrange
        const koreanText = '안녕하세요. 휴가 규정에 대해 알고 싶습니다.';
        const mockConversation: Conversation = {
          chatId: mockChatId,
          lang: 'en',
          messageCount: 1,
          lastMessageAt: mockTimestamp,
          createdAt: mockTimestamp,
          updatedAt: mockTimestamp
        };

        mockFirestoreService.getConversation.mockResolvedValue(mockConversation);
        mockFirestoreService.saveConversation.mockResolvedValue();

        // Mock TextUtils.detectLanguage
        jest.doMock('../../src/utils/text', () => ({
          TextUtils: {
            detectLanguage: jest.fn().mockReturnValue('ko')
          }
        }));

        // Act
        const result = await conversationService.detectAndUpdateLanguage(mockChatId, koreanText);

        // Assert
        expect(result).toBe('ko');
        expect(mockFirestoreService.saveConversation).toHaveBeenCalledWith(
          expect.objectContaining({
            lang: 'ko'
          })
        );
      });

      it('언어가 동일하면 업데이트하지 않아야 함', async () => {
        // Arrange
        const koreanText = '안녕하세요.';
        const mockConversation: Conversation = {
          chatId: mockChatId,
          lang: 'ko', // 이미 한국어
          messageCount: 1,
          lastMessageAt: mockTimestamp,
          createdAt: mockTimestamp,
          updatedAt: mockTimestamp
        };

        mockFirestoreService.getConversation.mockResolvedValue(mockConversation);

        // Mock TextUtils.detectLanguage
        jest.doMock('../../src/utils/text', () => ({
          TextUtils: {
            detectLanguage: jest.fn().mockReturnValue('ko')
          }
        }));

        // Act
        const result = await conversationService.detectAndUpdateLanguage(mockChatId, koreanText);

        // Assert
        expect(result).toBe('ko');
        expect(mockFirestoreService.saveConversation).not.toHaveBeenCalled();
      });

      it('감지 실패 시 기본 언어를 반환해야 함', async () => {
        // Arrange
        const error = new Error('Detection failed');
        mockFirestoreService.getConversation.mockRejectedValue(error);

        // Act
        const result = await conversationService.detectAndUpdateLanguage(mockChatId, 'test text');

        // Assert
        expect(result).toBe(DEFAULT_VALUES.LANG);
      });
    });
  });
});