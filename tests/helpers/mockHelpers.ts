import { Timestamp } from '@google-cloud/firestore';
import { AIMessage } from '@langchain/core/messages';
import { Conversation, Message, Language } from '../../src/types';

/**
 * 테스트용 공통 Mock 헬퍼 함수들
 */

export const createMockTimestamp = (date = new Date()): Timestamp => ({
  seconds: Math.floor(date.getTime() / 1000),
  nanoseconds: 0,
  toDate: () => date,
  toMillis: () => date.getTime(),
  isEqual: jest.fn(),
  valueOf: jest.fn()
} as any);

export const createMockConversation = (
  chatId: string,
  lang: Language = 'ko',
  overrides: Partial<Conversation> = {}
): Conversation => ({
  chatId,
  lang,
  messageCount: 0,
  lastMessageAt: createMockTimestamp(),
  createdAt: createMockTimestamp(),
  updatedAt: createMockTimestamp(),
  ...overrides
});

export const createMockMessage = (
  text: string,
  role: 'user' | 'assistant' = 'user',
  overrides: Partial<Message> = {}
): Message => ({
  messageId: `msg_${Date.now()}_${Math.random()}`,
  chatId: 'test_chat',
  role,
  text,
  createdAt: createMockTimestamp(),
  ...overrides
});

export const createMockAIMessage = (content: string): AIMessage => 
  new AIMessage({ content });

export const createMockSearchResults = () => [
  [
    {
      pageContent: '연차휴가는 1년에 15일까지 사용할 수 있습니다.',
      metadata: {
        title: '휴가 규정',
        filePath: 'policies/vacation.md',
        url: 'https://example.com/vacation.md'
      }
    },
    0.95
  ]
];

/**
 * 서비스 Mock 팩토리 함수들
 */
export const createMockFirestoreService = () => ({
  // Conversation methods
  getConversation: jest.fn(),
  saveConversation: jest.fn(),
  saveMessage: jest.fn(),
  getRecentMessages: jest.fn(),
  getMessageCount: jest.fn(),
  getSummary: jest.fn(),
  saveSummary: jest.fn(),
  resetConversation: jest.fn(),
  updateConversationSummary: jest.fn(),
  // Repository methods
  getRepository: jest.fn(),
  saveRepository: jest.fn(),
  // File methods
  getFileMetadata: jest.fn(),
  saveFileMetadata: jest.fn(),
  deleteFileMetadata: jest.fn(),
  // Chunk methods
  saveChunk: jest.fn(),
  deleteChunk: jest.fn(),
  getChunks: jest.fn(),
  // Sync job methods
  createSyncJob: jest.fn(),
  updateSyncJobProgress: jest.fn(),
  completeSyncJob: jest.fn(),
  failSyncJob: jest.fn(),
  getSyncJobs: jest.fn(),
  // Utility methods
  shouldTriggerSummary: jest.fn(),
  healthCheck: jest.fn()
});

export const createMockOpenAIService = () => ({
  createEmbedding: jest.fn(),
  createEmbeddings: jest.fn(),
  generateResponse: jest.fn(),
  generateChatCompletion: jest.fn(),
  generateSummary: jest.fn(),
  estimateTokens: jest.fn(),
  truncateToMaxTokens: jest.fn(),
  getSystemPrompt: jest.fn(),
  canFitInContext: jest.fn(),
  healthCheck: jest.fn()
});

export const createMockLangChainService = () => ({
  query: jest.fn(),
  conversationalQuery: jest.fn(),
  search: jest.fn(),
  summarizeConversation: jest.fn()
});

export const createMockConversationService = () => ({
  initializeSession: jest.fn(),
  saveMessage: jest.fn(),
  getConversationContext: jest.fn(),
  buildMemoryContext: jest.fn(),
  detectAndUpdateLanguage: jest.fn(),
  getSessionStats: jest.fn(),
  resetSession: jest.fn(),
  shouldTriggerSummary: jest.fn()
});

// Mock logger service
export const createMockLogger = () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
  trace: jest.fn(),
  logPerformance: jest.fn(),
  logRequest: jest.fn(),
  logRAGOperation: jest.fn(),
  logConversationOperation: jest.fn(),
  logSyncOperation: jest.fn(),
  logHealthCheck: jest.fn()
});

// Mock metricsService
export const mockMetricsService = {
  recordConversation: jest.fn(),
  recordRAGOperation: jest.fn(),
  recordSyncOperation: jest.fn(),
  recordHealthCheck: jest.fn(),
  recordTelegramMessage: jest.fn(),
  recordGithubWebhook: jest.fn(),
  getMetrics: jest.fn().mockResolvedValue({}),
  reset: jest.fn()
};

// Mock createLogger function
export const mockCreateLogger = jest.fn(() => createMockLogger());