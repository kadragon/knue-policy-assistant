import { Timestamp } from '@google-cloud/firestore';

// Common Types
export type Language = 'ko' | 'en';
export type MessageRole = 'user' | 'assistant';

// Firestore Data Models

// Repository metadata
export interface Repository {
  repoId: string;
  name: string;
  defaultBranch: string;
  lastSyncCommit?: string;
  lastSyncAt?: Timestamp;
  isActive: boolean;
  description?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// File metadata
export interface FileMetadata {
  fileId: string;
  repoId: string;
  filePath: string;
  fileName: string;
  commit: string;
  contentHash: string;
  size: number;
  lang: Language;
  title?: string;
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// Text chunks for embedding
export interface TextChunk {
  chunkId: string;
  fileId: string;
  repoId: string;
  filePath: string;
  commit: string;
  seq: number;
  text: string;
  textHash: string;
  lang: Language;
  title?: string;
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// Sync job metadata
export interface SyncJob {
  jobId: string;
  repoId: string;
  type: 'webhook' | 'polling' | 'manual';
  status: 'pending' | 'running' | 'completed' | 'failed';
  commit?: string;
  filesAdded: number;
  filesModified: number;
  filesDeleted: number;
  chunksCreated: number;
  chunksUpdated: number;
  chunksDeleted: number;
  startedAt: Timestamp;
  completedAt?: Timestamp;
  error?: string;
  metadata?: Record<string, any>;
}

// Conversation session
export interface Conversation {
  chatId: string;
  summary?: string;
  lang: Language;
  messageCount: number;
  lastMessageAt: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// Message history
export interface Message {
  messageId: string;
  chatId: string;
  role: MessageRole;
  text: string;
  metadata?: {
    sources?: string[];
    searchScore?: number;
    processingTime?: number;
  };
  createdAt: Timestamp;
}

// User preferences (optional)
export interface UserPreferences {
  chatId: string;
  lang: Language;
  notificationsEnabled: boolean;
  timezone?: string;
  metadata?: Record<string, any>;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// Qdrant Payload Types

// Payload for vector points in Qdrant
export interface QdrantPayload {
  [key: string]: unknown;
  repoId: string;
  fileId: string;
  filePath: string;
  commit: string;
  seq: number;
  lang: Language;
  hash: string;
  title?: string;
  url: string;
}

// Search result from Qdrant
export interface SearchResult {
  id: string | number;
  score: number;
  payload: QdrantPayload;
  vector?: number[] | undefined;
}

// RAG Search Types

// Search context for RAG
export interface SearchContext {
  query: string;
  lang: Language;
  chatId: string;
  topK?: number;
  minScore?: number;
  filters?: Record<string, any>;
}

// RAG search request
export interface RAGSearchRequest {
  query: string;
  k?: number;
  minScore?: number;
  lang?: Language;
}

// RAG search response
export interface RAGSearchResponse {
  documents: Array<{
    score: number;
    title?: string;
    text: string;
    filePath: string;
    url?: string;
    fileId: string;
    seq: number;
  }>;
  query: string;
  total: number;
  lang?: Language;
}

// RAG query request  
export interface RAGQueryRequest {
  question: string;
  lang?: Language;
  chatId?: string;
}

// RAG query response
export interface RAGQueryResponse {
  answer: string;
  sources: Array<{
    title: string;
    filePath: string;
    url: string;
  }>;
  question: string;
  lang: Language;
  processingTime: number;
}

// Telegram Types

// Telegram message context
export interface TelegramContext {
  chatId: string;
  messageId: number;
  userId: number;
  username?: string | undefined;
  firstName?: string | undefined;
  lastName?: string | undefined;
  text: string;
  isCommand: boolean;
  commandName?: string | undefined;
  commandArgs?: string[] | undefined;
}

// Telegram response
export interface TelegramResponse {
  text: string;
  chatId: string;
  replyToMessageId?: number;
  parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2';
  disableWebPagePreview?: boolean;
}

// GitHub Types

// GitHub webhook payload (push event)
export interface GitHubPushPayload {
  ref: string;
  repository: {
    id: number;
    name: string;
    full_name: string;
    default_branch: string;
  };
  commits: Array<{
    id: string;
    message: string;
    added: string[];
    modified: string[];
    removed: string[];
  }>;
  head_commit: {
    id: string;
    message: string;
    added: string[];
    modified: string[];
    removed: string[];
  };
}

// File change information
export interface FileChange {
  path: string;
  status: 'added' | 'modified' | 'removed';
  content?: string;
}

// OpenAI Types

// OpenAI embedding response
export interface EmbeddingResponse {
  data: Array<{
    embedding: number[];
    index: number;
  }>;
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

// Chat completion context
export interface ChatContext {
  systemPrompt: string;
  conversationSummary?: string;
  recentMessages: Message[];
  ragContext: string;
  maxTokens?: number;
  temperature?: number;
}

// API Response Types

// Generic API response
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  metadata?: {
    requestId: string;
    processingTime: number;
    timestamp: string;
  };
}

// Health check response
export interface HealthCheckResponse {
  status: 'healthy' | 'unhealthy';
  services: {
    firestore: 'connected' | 'disconnected' | 'error';
    qdrant: 'connected' | 'disconnected' | 'error';
    openai: 'connected' | 'disconnected' | 'error';
  };
  version: string;
  uptime: number;
  timestamp: string;
}

// Enhanced health monitoring types
export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface ServiceHealthDetail {
  status: HealthStatus;
  responseTime: number;
  lastError?: string | undefined;
  lastChecked: string;
}

export interface FirestoreHealth extends ServiceHealthDetail {
  collections: {
    conversations: boolean;
    messages: boolean;
    jobs: boolean;
    repositories: boolean;
    files: boolean;
  };
  operations: {
    read: boolean;
    write: boolean;
  };
}

export interface QdrantHealth extends ServiceHealthDetail {
  collection: {
    exists: boolean;
    vectorCount: number;
    indexedVectors: number;
  };
  operations: {
    search: boolean;
    upsert: boolean;
  };
}

export interface OpenAIHealth extends ServiceHealthDetail {
  embedding: {
    available: boolean;
    responseTime: number;
  };
  chat: {
    available: boolean;
    responseTime: number;
  };
  quotaStatus: 'normal' | 'limited' | 'exceeded';
}

export interface LangChainHealth extends ServiceHealthDetail {
  vectorStore: boolean;
  chains: {
    search: boolean;
    conversational: boolean;
    summary: boolean;
  };
  models: {
    embedding: boolean;
    chat: boolean;
  };
}

export interface DetailedHealthResponse {
  status: HealthStatus;
  services: {
    firestore: FirestoreHealth;
    qdrant: QdrantHealth;
    openai: OpenAIHealth;
    langchain: LangChainHealth;
  };
  system: {
    memory: {
      used: number;
      total: number;
      percentage: number;
    };
    uptime: number;
    nodeVersion: string;
    version: string;
  };
  timestamp: string;
}

export interface ConversationMetrics {
  activeSessions: number;
  totalMessages: number;
  averageSessionLength: number;
  summaryGeneration: {
    successRate: number;
    averageTime: number;
    failedInLast24h: number;
  };
  memoryUsage: {
    totalTokens: number;
    averageTokensPerSession: number;
    tokenLimitExceeded: number;
  };
  languages: {
    [key in Language]: number;
  };
}

export interface RAGMetrics {
  searchQueries: {
    total: number;
    successRate: number;
    averageResponseTime: number;
    noEvidenceRate: number;
  };
  documentRetrieval: {
    averageDocuments: number;
    averageScore: number;
    lowScoreQueries: number;
  };
  langchainPerformance: {
    chainExecutionTime: number;
    errorRate: number;
    cacheHitRate?: number;
  };
}

export interface SyncMetrics {
  recentJobs: {
    completed: number;
    failed: number;
    running: number;
    pending: number;
  };
  performance: {
    averageSyncTime: number;
    filesPerSecond: number;
    lastSuccessfulSync: string | null;
  };
  dataIntegrity: {
    totalFiles: number;
    totalChunks: number;
    orphanedChunks: number;
  };
}

export interface SystemMetrics {
  conversation: ConversationMetrics;
  rag: RAGMetrics;
  sync: SyncMetrics;
  performance: {
    averageResponseTime: number;
    requestsPerMinute: number;
    errorRate: number;
  };
  timestamp: string;
}

// Configuration Types

// Service configuration
export interface ServiceConfig {
  openai: {
    apiKey: string;
    model: {
      embedding: string;
      chat: string;
    };
    maxTokens: {
      embedding: number;
      chat: number;
      memory: number;
    };
  };
  qdrant: {
    url: string;
    apiKey: string;
    collectionName: string;
    vectorSize: number;
    distance: string;
  };
  firestore: {
    projectId: string;
    keyFilename?: string;
  };
  telegram: {
    botToken: string;
  };
  github: {
    webhookSecret: string;
    repoId: string;
    defaultBranch: string;
  };
  app: {
    port: number;
    environment: string;
    logLevel: string;
    defaultLang: Language;
    minInstances: number;
  };
}

// Error Types

// Custom error for service failures
export class ServiceError extends Error {
  constructor(
    message: string,
    public service: string,
    public code: string,
    public statusCode?: number,
    public details?: any
  ) {
    super(message);
    this.name = 'ServiceError';
  }
}

// Validation error
export class ValidationError extends Error {
  constructor(
    message: string,
    public field: string,
    public value: any
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

// Constants

export const COLLECTION_NAMES = {
  REPOSITORIES: 'repos',
  FILES: 'files', 
  CHUNKS: 'chunks',
  JOBS: 'jobs',
  CONVERSATIONS: 'conversations',
  MESSAGES: 'messages',
  USER_PREFS: 'user_prefs'
} as const;

export const DEFAULT_VALUES = {
  LANG: 'ko' as Language,
  TOP_K: 8,
  RAG_TOP_K: 6,
  MIN_SCORE: 0.80,
  MIN_SEARCH_SCORE: 0.80,
  MAX_CHUNK_SIZE: 800,
  CHUNK_OVERLAP: 80,
  MAX_RECENT_MESSAGES: 20,
  SUMMARY_TRIGGER_MESSAGES: 10,
  SUMMARY_TRIGGER_CHARS: 4000,
  MAX_MEMORY_TOKENS: 1500,
  RESPONSE_TIMEOUT: 30000,
  EMBEDDING_BATCH_SIZE: 50
} as const;

export const COMMANDS = {
  RESET: '/reset',
  LANG: '/lang',
  HELP: '/help'
} as const;