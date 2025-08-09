import { createLogger } from './logger';

const logger = createLogger('metrics');

// Metrics collection interfaces
export interface PerformanceMetric {
  timestamp: number;
  operation: string;
  service: string;
  duration: number;
  success: boolean;
  error?: string;
  metadata?: Record<string, any>;
}

export interface RequestMetric {
  timestamp: number;
  method: string;
  path: string;
  statusCode: number;
  duration: number;
  correlationId: string;
  userId?: string;
  chatId?: string;
}

export interface RAGMetric {
  timestamp: number;
  query: string;
  documentsFound: number;
  maxScore: number;
  hasEvidence: boolean;
  duration: number;
  chatId?: string;
  correlationId?: string;
  metadata?: {
    searchType?: 'similarity' | 'conversational' | 'direct';
    minScoreThreshold?: number;
    topK?: number;
    language?: string;
    totalCandidates?: number;
    averageScore?: number;
    scoreDistribution?: {
      excellent: number; // >= 0.95
      good: number;      // 0.85-0.94
      fair: number;      // 0.80-0.84
      poor: number;      // < 0.80
    };
    queryComplexity?: 'simple' | 'medium' | 'complex';
    evidenceQuality?: 'high' | 'medium' | 'low' | 'none';
  };
}

export interface ConversationMetric {
  timestamp: number;
  chatId: string;
  operation: 'message' | 'summary' | 'reset' | 'session-create' | 'session-reset' | 'language-update' | 'context-load' | 'memory-build';
  messageCount?: number;
  duration?: number;
  success: boolean;
  correlationId?: string;
  metadata?: {
    messageRole?: 'user' | 'assistant';
    summaryLength?: number;
    summaryGenerated?: boolean;
    tokenCount?: number;
    memoryContextSize?: number;
    languageChanged?: boolean;
    sessionActive?: boolean;
  };
}

export interface SyncMetric {
  timestamp: number;
  jobId: string;
  operation: 'start' | 'progress' | 'complete' | 'fail';
  filesProcessed: number;
  duration?: number;
  success: boolean;
  error?: string;
}

/**
 * Metrics Collection Service
 * Collects and aggregates performance metrics for monitoring and alerting
 */
export class MetricsService {
  private performanceMetrics: PerformanceMetric[] = [];
  private requestMetrics: RequestMetric[] = [];
  private ragMetrics: RAGMetric[] = [];
  private conversationMetrics: ConversationMetric[] = [];
  private syncMetrics: SyncMetric[] = [];
  
  // Metric retention settings
  private readonly MAX_METRICS_PER_TYPE = 1000;
  private readonly METRIC_RETENTION_MS = 24 * 60 * 60 * 1000; // 24 hours

  constructor() {
    // Clean up old metrics every hour
    setInterval(() => {
      this.cleanupOldMetrics();
    }, 60 * 60 * 1000);
  }

  // Record performance metrics
  recordPerformance(metric: Omit<PerformanceMetric, 'timestamp'>): void {
    const performanceMetric: PerformanceMetric = {
      ...metric,
      timestamp: Date.now()
    };
    
    this.performanceMetrics.push(performanceMetric);
    this.trimArray(this.performanceMetrics, this.MAX_METRICS_PER_TYPE);
    
    // Log slow operations
    if (metric.duration > 2000) {
      logger.warn('slow-operation', `Slow operation detected: ${metric.service}:${metric.operation}`, {
        duration: metric.duration,
        service: metric.service,
        operation: metric.operation,
        metadata: metric.metadata
      });
    }
  }

  // Record HTTP request metrics
  recordRequest(metric: Omit<RequestMetric, 'timestamp'>): void {
    const requestMetric: RequestMetric = {
      ...metric,
      timestamp: Date.now()
    };
    
    this.requestMetrics.push(requestMetric);
    this.trimArray(this.requestMetrics, this.MAX_METRICS_PER_TYPE);
  }

  // Record RAG operation metrics
  recordRAG(metric: Omit<RAGMetric, 'timestamp'>): void {
    const ragMetric: RAGMetric = {
      ...metric,
      timestamp: Date.now()
    };
    
    this.ragMetrics.push(ragMetric);
    this.trimArray(this.ragMetrics, this.MAX_METRICS_PER_TYPE);
    
    // Log important RAG events
    if (!metric.hasEvidence) {
      logger.info('no-evidence-query', `No evidence found for query`, {
        query: metric.query.substring(0, 100),
        documentsFound: metric.documentsFound,
        maxScore: metric.maxScore,
        chatId: metric.chatId,
        searchType: metric.metadata?.searchType,
        topK: metric.metadata?.topK
      });
    }
    
    // Log low-quality evidence
    if (metric.hasEvidence && metric.maxScore < 0.85) {
      logger.warn('low-quality-evidence', `Low quality evidence for query`, {
        query: metric.query.substring(0, 100),
        maxScore: metric.maxScore,
        documentsFound: metric.documentsFound,
        chatId: metric.chatId,
        evidenceQuality: metric.metadata?.evidenceQuality
      });
    }
    
    // Log slow searches
    if (metric.duration > 3000) {
      logger.warn('slow-rag-search', `Slow RAG search detected`, {
        query: metric.query.substring(0, 100),
        duration: metric.duration,
        documentsFound: metric.documentsFound,
        searchType: metric.metadata?.searchType,
        chatId: metric.chatId
      });
    }
  }

  // Record conversation operation metrics
  recordConversation(metric: Omit<ConversationMetric, 'timestamp'>): void {
    const conversationMetric: ConversationMetric = {
      ...metric,
      timestamp: Date.now()
    };
    
    this.conversationMetrics.push(conversationMetric);
    this.trimArray(this.conversationMetrics, this.MAX_METRICS_PER_TYPE);
    
    // Log important conversation events
    if (metric.operation === 'summary' && !metric.success) {
      logger.warn('summary-generation-failed', `Summary generation failed for chat ${metric.chatId}`, {
        chatId: metric.chatId,
        duration: metric.duration,
        messageCount: metric.messageCount
      });
    }
    
    if (metric.operation === 'session-create') {
      logger.info('new-conversation-session', `New conversation session created`, {
        chatId: metric.chatId,
        success: metric.success,
        metadata: metric.metadata
      });
    }
  }

  // Record sync operation metrics
  recordSync(metric: Omit<SyncMetric, 'timestamp'>): void {
    const syncMetric: SyncMetric = {
      ...metric,
      timestamp: Date.now()
    };
    
    this.syncMetrics.push(syncMetric);
    this.trimArray(this.syncMetrics, this.MAX_METRICS_PER_TYPE);
    
    // Log sync failures
    if (!metric.success && metric.error) {
      logger.error('sync-operation-failed', `Sync operation failed: ${metric.jobId}`, 
        new Error(metric.error), {
          jobId: metric.jobId,
          operation: metric.operation,
          filesProcessed: metric.filesProcessed
        }
      );
    }
  }

  // Get performance statistics
  getPerformanceStats(timeWindowMs: number = 60 * 60 * 1000): {
    averageResponseTime: number;
    requestCount: number;
    errorRate: number;
    slowRequestRate: number;
  } {
    const cutoff = Date.now() - timeWindowMs;
    const recentRequests = this.requestMetrics.filter(m => m.timestamp > cutoff);
    
    if (recentRequests.length === 0) {
      return {
        averageResponseTime: 0,
        requestCount: 0,
        errorRate: 0,
        slowRequestRate: 0
      };
    }
    
    const totalDuration = recentRequests.reduce((sum, m) => sum + m.duration, 0);
    const errorCount = recentRequests.filter(m => m.statusCode >= 400).length;
    const slowRequests = recentRequests.filter(m => m.duration > 2000).length;
    
    return {
      averageResponseTime: Math.round(totalDuration / recentRequests.length),
      requestCount: recentRequests.length,
      errorRate: Math.round((errorCount / recentRequests.length) * 100),
      slowRequestRate: Math.round((slowRequests / recentRequests.length) * 100)
    };
  }

  // Get RAG statistics
  getRAGStats(timeWindowMs: number = 60 * 60 * 1000): {
    totalQueries: number;
    averageResponseTime: number;
    noEvidenceRate: number;
    averageDocuments: number;
    averageScore: number;
  } {
    const cutoff = Date.now() - timeWindowMs;
    const recentRAG = this.ragMetrics.filter(m => m.timestamp > cutoff);
    
    if (recentRAG.length === 0) {
      return {
        totalQueries: 0,
        averageResponseTime: 0,
        noEvidenceRate: 0,
        averageDocuments: 0,
        averageScore: 0
      };
    }
    
    const totalDuration = recentRAG.reduce((sum, m) => sum + m.duration, 0);
    const noEvidenceCount = recentRAG.filter(m => !m.hasEvidence).length;
    const totalDocs = recentRAG.reduce((sum, m) => sum + m.documentsFound, 0);
    const totalScore = recentRAG.reduce((sum, m) => sum + m.maxScore, 0);
    
    return {
      totalQueries: recentRAG.length,
      averageResponseTime: Math.round(totalDuration / recentRAG.length),
      noEvidenceRate: Math.round((noEvidenceCount / recentRAG.length) * 100),
      averageDocuments: Math.round(totalDocs / recentRAG.length),
      averageScore: Math.round((totalScore / recentRAG.length) * 100) / 100
    };
  }
  
  // Get detailed RAG monitoring statistics
  getRAGMonitoringStats(timeWindowMs: number = 60 * 60 * 1000): {
    searchPerformance: {
      totalQueries: number;
      successfulQueries: number;
      successRate: number;
      averageResponseTime: number;
      slowQueryRate: number;
    };
    evidenceQuality: {
      excellentRate: number;  // >= 0.95
      goodRate: number;       // 0.85-0.94
      fairRate: number;       // 0.80-0.84
      poorRate: number;       // < 0.80
      noEvidenceRate: number;
      averageMaxScore: number;
      averageDocumentsFound: number;
    };
    searchTypes: {
      similarity: number;
      conversational: number;
      direct: number;
    };
    queryComplexity: {
      simple: number;
      medium: number;
      complex: number;
    };
    languageDistribution: Record<string, number>;
    topKDistribution: Record<string, number>;
  } {
    const cutoff = Date.now() - timeWindowMs;
    const recentRAG = this.ragMetrics.filter(m => m.timestamp > cutoff);
    
    if (recentRAG.length === 0) {
      return {
        searchPerformance: {
          totalQueries: 0,
          successfulQueries: 0,
          successRate: 100,
          averageResponseTime: 0,
          slowQueryRate: 0
        },
        evidenceQuality: {
          excellentRate: 0,
          goodRate: 0,
          fairRate: 0,
          poorRate: 0,
          noEvidenceRate: 0,
          averageMaxScore: 0,
          averageDocumentsFound: 0
        },
        searchTypes: { similarity: 0, conversational: 0, direct: 0 },
        queryComplexity: { simple: 0, medium: 0, complex: 0 },
        languageDistribution: {},
        topKDistribution: {}
      };
    }
    
    // Search performance metrics
    const successfulQueries = recentRAG.filter(m => m.hasEvidence);
    const slowQueries = recentRAG.filter(m => m.duration > 2000);
    const totalDuration = recentRAG.reduce((sum, m) => sum + m.duration, 0);
    
    // Evidence quality metrics
    const scoreRanges = {
      excellent: recentRAG.filter(m => m.maxScore >= 0.95),
      good: recentRAG.filter(m => m.maxScore >= 0.85 && m.maxScore < 0.95),
      fair: recentRAG.filter(m => m.maxScore >= 0.80 && m.maxScore < 0.85),
      poor: recentRAG.filter(m => m.maxScore > 0 && m.maxScore < 0.80),
      noEvidence: recentRAG.filter(m => !m.hasEvidence)
    };
    
    const totalScore = recentRAG.reduce((sum, m) => sum + m.maxScore, 0);
    const totalDocs = recentRAG.reduce((sum, m) => sum + m.documentsFound, 0);
    
    // Search type distribution
    const searchTypes = { similarity: 0, conversational: 0, direct: 0 };
    const queryComplexity = { simple: 0, medium: 0, complex: 0 };
    const languageDistribution: Record<string, number> = {};
    const topKDistribution: Record<string, number> = {};
    
    recentRAG.forEach(metric => {
      // Search types
      const searchType = metric.metadata?.searchType || 'similarity';
      if (searchType in searchTypes) {
        searchTypes[searchType as keyof typeof searchTypes]++;
      }
      
      // Query complexity
      const complexity = metric.metadata?.queryComplexity || 'medium';
      if (complexity in queryComplexity) {
        queryComplexity[complexity as keyof typeof queryComplexity]++;
      }
      
      // Language distribution
      const language = metric.metadata?.language || 'unknown';
      languageDistribution[language] = (languageDistribution[language] || 0) + 1;
      
      // TopK distribution
      const topK = (metric.metadata?.topK || 6).toString();
      topKDistribution[topK] = (topKDistribution[topK] || 0) + 1;
    });
    
    return {
      searchPerformance: {
        totalQueries: recentRAG.length,
        successfulQueries: successfulQueries.length,
        successRate: Math.round((successfulQueries.length / recentRAG.length) * 100),
        averageResponseTime: Math.round(totalDuration / recentRAG.length),
        slowQueryRate: Math.round((slowQueries.length / recentRAG.length) * 100)
      },
      evidenceQuality: {
        excellentRate: Math.round((scoreRanges.excellent.length / recentRAG.length) * 100),
        goodRate: Math.round((scoreRanges.good.length / recentRAG.length) * 100),
        fairRate: Math.round((scoreRanges.fair.length / recentRAG.length) * 100),
        poorRate: Math.round((scoreRanges.poor.length / recentRAG.length) * 100),
        noEvidenceRate: Math.round((scoreRanges.noEvidence.length / recentRAG.length) * 100),
        averageMaxScore: Math.round((totalScore / recentRAG.length) * 100) / 100,
        averageDocumentsFound: Math.round(totalDocs / recentRAG.length)
      },
      searchTypes,
      queryComplexity,
      languageDistribution,
      topKDistribution
    };
  }

  // Get conversation statistics
  getConversationStats(timeWindowMs: number = 60 * 60 * 1000): {
    totalOperations: number;
    uniqueChats: number;
    averageResponseTime: number;
    operationBreakdown: Record<string, number>;
    successRate: number;
  } {
    const cutoff = Date.now() - timeWindowMs;
    const recentConversations = this.conversationMetrics.filter(m => m.timestamp > cutoff);
    
    if (recentConversations.length === 0) {
      return {
        totalOperations: 0,
        uniqueChats: 0,
        averageResponseTime: 0,
        operationBreakdown: {},
        successRate: 100
      };
    }
    
    const uniqueChatIds = new Set(recentConversations.map(m => m.chatId));
    const withDuration = recentConversations.filter(m => m.duration !== undefined);
    const totalDuration = withDuration.reduce((sum, m) => sum + (m.duration || 0), 0);
    const successCount = recentConversations.filter(m => m.success).length;
    
    const operationBreakdown = recentConversations.reduce((acc, m) => {
      acc[m.operation] = (acc[m.operation] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    return {
      totalOperations: recentConversations.length,
      uniqueChats: uniqueChatIds.size,
      averageResponseTime: withDuration.length > 0 ? Math.round(totalDuration / withDuration.length) : 0,
      operationBreakdown,
      successRate: Math.round((successCount / recentConversations.length) * 100)
    };
  }

  // Get detailed conversation memory monitoring
  getConversationMemoryStats(timeWindowMs: number = 60 * 60 * 1000): {
    activeSessions: number;
    newSessions: number;
    summariesGenerated: number;
    summarySuccessRate: number;
    averageSummaryLength: number;
    memoryContextStats: {
      averageTokens: number;
      averageMessageCount: number;
      memoryBuilds: number;
    };
    sessionActivity: {
      totalSessions: number;
      resets: number;
      languageChanges: number;
    };
    messageStats: {
      totalMessages: number;
      userMessages: number;
      assistantMessages: number;
    };
  } {
    const cutoff = Date.now() - timeWindowMs;
    const recentConversations = this.conversationMetrics.filter(m => m.timestamp > cutoff);
    
    // Session tracking
    const sessionCreates = recentConversations.filter(m => m.operation === 'session-create');
    const sessionResets = recentConversations.filter(m => m.operation === 'session-reset');
    const languageUpdates = recentConversations.filter(m => m.operation === 'language-update');
    
    // Summary tracking
    const summaryOperations = recentConversations.filter(m => m.operation === 'summary');
    const successfulSummaries = summaryOperations.filter(m => m.success);
    const summaryLengths = successfulSummaries
      .map(m => m.metadata?.summaryLength)
      .filter((length): length is number => length !== undefined);
    
    // Memory context tracking
    const memoryBuilds = recentConversations.filter(m => m.operation === 'memory-build');
    const memoryTokens = memoryBuilds
      .map(m => m.metadata?.tokenCount)
      .filter((count): count is number => count !== undefined);
    const memoryMessageCounts = memoryBuilds
      .map(m => m.metadata?.memoryContextSize)
      .filter((count): count is number => count !== undefined);
    
    // Message tracking
    const messageOperations = recentConversations.filter(m => m.operation === 'message');
    const userMessages = messageOperations.filter(m => m.metadata?.messageRole === 'user');
    const assistantMessages = messageOperations.filter(m => m.metadata?.messageRole === 'assistant');
    
    // Active sessions (unique chat IDs in recent activity)
    const activeChatIds = new Set(recentConversations.map(m => m.chatId));
    
    return {
      activeSessions: activeChatIds.size,
      newSessions: sessionCreates.length,
      summariesGenerated: successfulSummaries.length,
      summarySuccessRate: summaryOperations.length > 0 
        ? Math.round((successfulSummaries.length / summaryOperations.length) * 100) 
        : 100,
      averageSummaryLength: summaryLengths.length > 0 
        ? Math.round(summaryLengths.reduce((sum, len) => sum + len, 0) / summaryLengths.length)
        : 0,
      memoryContextStats: {
        averageTokens: memoryTokens.length > 0 
          ? Math.round(memoryTokens.reduce((sum, tokens) => sum + tokens, 0) / memoryTokens.length)
          : 0,
        averageMessageCount: memoryMessageCounts.length > 0 
          ? Math.round(memoryMessageCounts.reduce((sum, count) => sum + count, 0) / memoryMessageCounts.length)
          : 0,
        memoryBuilds: memoryBuilds.length
      },
      sessionActivity: {
        totalSessions: activeChatIds.size,
        resets: sessionResets.length,
        languageChanges: languageUpdates.length
      },
      messageStats: {
        totalMessages: messageOperations.length,
        userMessages: userMessages.length,
        assistantMessages: assistantMessages.length
      }
    };
  }

  // Get sync statistics
  getSyncStats(timeWindowMs: number = 24 * 60 * 60 * 1000): {
    totalJobs: number;
    completedJobs: number;
    failedJobs: number;
    averageProcessingTime: number;
    filesProcessed: number;
    successRate: number;
  } {
    const cutoff = Date.now() - timeWindowMs;
    const recentSync = this.syncMetrics.filter(m => m.timestamp > cutoff);
    
    if (recentSync.length === 0) {
      return {
        totalJobs: 0,
        completedJobs: 0,
        failedJobs: 0,
        averageProcessingTime: 0,
        filesProcessed: 0,
        successRate: 100
      };
    }
    
    const completedJobs = recentSync.filter(m => m.operation === 'complete');
    const failedJobs = recentSync.filter(m => m.operation === 'fail');
    const withDuration = recentSync.filter(m => m.duration !== undefined);
    const totalDuration = withDuration.reduce((sum, m) => sum + (m.duration || 0), 0);
    const totalFiles = recentSync.reduce((sum, m) => sum + m.filesProcessed, 0);
    const successCount = recentSync.filter(m => m.success).length;
    
    return {
      totalJobs: recentSync.length,
      completedJobs: completedJobs.length,
      failedJobs: failedJobs.length,
      averageProcessingTime: withDuration.length > 0 ? Math.round(totalDuration / withDuration.length) : 0,
      filesProcessed: totalFiles,
      successRate: Math.round((successCount / recentSync.length) * 100)
    };
  }

  // Get system health score
  getHealthScore(): {
    score: number;
    status: 'healthy' | 'degraded' | 'unhealthy';
    factors: Record<string, number>;
  } {
    const perfStats = this.getPerformanceStats();
    const ragStats = this.getRAGStats();
    const convStats = this.getConversationStats();
    
    // Calculate individual factor scores (0-100)
    const factors = {
      responseTime: Math.max(0, 100 - (perfStats.averageResponseTime / 50)), // 50ms = 1 point deduction
      errorRate: Math.max(0, 100 - perfStats.errorRate * 10), // 1% error = 10 point deduction
      ragPerformance: Math.max(0, 100 - ragStats.noEvidenceRate), // 1% no evidence = 1 point deduction
      conversationSuccess: convStats.successRate
    };
    
    // Weighted average
    const weights = {
      responseTime: 0.3,
      errorRate: 0.4,
      ragPerformance: 0.2,
      conversationSuccess: 0.1
    };
    
    const score = Object.entries(factors).reduce((sum, [key, value]) => {
      return sum + (value * weights[key as keyof typeof weights]);
    }, 0);
    
    let status: 'healthy' | 'degraded' | 'unhealthy';
    if (score >= 90) status = 'healthy';
    else if (score >= 70) status = 'degraded';
    else status = 'unhealthy';
    
    return { score: Math.round(score), status, factors };
  }

  // Clean up old metrics
  private cleanupOldMetrics(): void {
    const cutoff = Date.now() - this.METRIC_RETENTION_MS;
    
    this.performanceMetrics = this.performanceMetrics.filter(m => m.timestamp > cutoff);
    this.requestMetrics = this.requestMetrics.filter(m => m.timestamp > cutoff);
    this.ragMetrics = this.ragMetrics.filter(m => m.timestamp > cutoff);
    this.conversationMetrics = this.conversationMetrics.filter(m => m.timestamp > cutoff);
    this.syncMetrics = this.syncMetrics.filter(m => m.timestamp > cutoff);
    
    logger.debug('cleanup', 'Old metrics cleaned up', {
      performanceMetrics: this.performanceMetrics.length,
      requestMetrics: this.requestMetrics.length,
      ragMetrics: this.ragMetrics.length,
      conversationMetrics: this.conversationMetrics.length,
      syncMetrics: this.syncMetrics.length
    });
  }

  // Utility method to trim arrays to max size
  private trimArray<T>(array: T[], maxSize: number): void {
    if (array.length > maxSize) {
      array.splice(0, array.length - maxSize);
    }
  }

  // Get all metrics for debugging/monitoring
  getAllMetrics() {
    return {
      performance: [...this.performanceMetrics],
      requests: [...this.requestMetrics],
      rag: [...this.ragMetrics],
      conversations: [...this.conversationMetrics],
      sync: [...this.syncMetrics]
    };
  }
}

// Global metrics service instance
export const metricsService = new MetricsService();