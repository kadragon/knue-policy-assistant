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
}

export interface ConversationMetric {
  timestamp: number;
  chatId: string;
  operation: 'message' | 'summary' | 'reset';
  messageCount?: number;
  duration?: number;
  success: boolean;
  correlationId?: string;
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
    
    // Log no evidence cases
    if (!metric.hasEvidence) {
      logger.info('no-evidence-query', `No evidence found for query`, {
        query: metric.query.substring(0, 100),
        documentsFound: metric.documentsFound,
        maxScore: metric.maxScore,
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