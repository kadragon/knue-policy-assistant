import { Request, Response } from 'express';
import { getServices } from '../services';
import { 
  HealthCheckResponse, 
  DetailedHealthResponse,
  SystemMetrics,
  HealthStatus,
  FirestoreHealth,
  QdrantHealth,
  OpenAIHealth,
  LangChainHealth
} from '../types';
import { DateUtils } from '../utils';

export class HealthController {
  private startTime: number;

  constructor() {
    this.startTime = Date.now();
  }

  // Health check endpoint
  async healthCheck(_req: Request, res: Response): Promise<void> {
    try {
      const services = getServices();
      const healthStatus = await services.healthCheck();

      const response: HealthCheckResponse = {
        status: healthStatus.overall ? 'healthy' : 'unhealthy',
        services: {
          firestore: healthStatus.firestore ? 'connected' : 'disconnected',
          qdrant: healthStatus.qdrant ? 'connected' : 'disconnected',
          openai: healthStatus.openai ? 'connected' : 'disconnected'
        },
        version: process.env['npm_package_version'] || '1.0.0',
        uptime: Date.now() - this.startTime,
        timestamp: DateUtils.formatTimestamp()
      };

      const statusCode = response.status === 'healthy' ? 200 : 503;
      res.status(statusCode).json(response);
    } catch (error) {
      console.error('Health check error:', error);
      
      const response: HealthCheckResponse = {
        status: 'unhealthy',
        services: {
          firestore: 'error',
          qdrant: 'error',
          openai: 'error'
        },
        version: process.env['npm_package_version'] || '1.0.0',
        uptime: Date.now() - this.startTime,
        timestamp: DateUtils.formatTimestamp()
      };

      res.status(503).json(response);
    }
  }

  // Detailed health check with service-specific diagnostics
  async detailedHealth(_req: Request, res: Response): Promise<void> {
    try {
      const services = getServices();
      
      // Run detailed checks in parallel
      const [firestoreHealth, qdrantHealth, openaiHealth, langchainHealth] = await Promise.all([
        this.checkFirestoreHealth(services),
        this.checkQdrantHealth(services),
        this.checkOpenAIHealth(services),
        this.checkLangChainHealth(services)
      ]);

      // System metrics
      const memUsage = process.memoryUsage();
      const systemMemory = {
        used: memUsage.heapUsed,
        total: memUsage.heapTotal,
        percentage: (memUsage.heapUsed / memUsage.heapTotal) * 100
      };

      // Determine overall status
      const allServices = [firestoreHealth, qdrantHealth, openaiHealth, langchainHealth];
      const overallStatus = this.determineOverallStatus(allServices);

      const response: DetailedHealthResponse = {
        status: overallStatus,
        services: {
          firestore: firestoreHealth,
          qdrant: qdrantHealth,
          openai: openaiHealth,
          langchain: langchainHealth
        },
        system: {
          memory: systemMemory,
          uptime: Date.now() - this.startTime,
          nodeVersion: process.version,
          version: process.env['npm_package_version'] || '1.0.0'
        },
        timestamp: DateUtils.formatTimestamp()
      };

      const statusCode = overallStatus === 'healthy' ? 200 : overallStatus === 'degraded' ? 200 : 503;
      res.status(statusCode).json(response);

    } catch (error) {
      console.error('Detailed health check error:', error);
      res.status(503).json({ 
        error: 'Health check failed', 
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // System metrics endpoint
  async systemMetrics(_req: Request, res: Response): Promise<void> {
    try {
      const services = getServices();

      // Collect metrics in parallel
      const [conversationMetrics, ragMetrics, syncMetrics] = await Promise.all([
        this.getConversationMetrics(services),
        this.getRAGMetrics(services),
        this.getSyncMetrics(services)
      ]);

      const response: SystemMetrics = {
        conversation: conversationMetrics,
        rag: ragMetrics,
        sync: syncMetrics,
        performance: {
          averageResponseTime: 0, // TODO: Implement response time tracking
          requestsPerMinute: 0,   // TODO: Implement request tracking
          errorRate: 0            // TODO: Implement error rate tracking
        },
        timestamp: DateUtils.formatTimestamp()
      };

      res.json(response);

    } catch (error) {
      console.error('System metrics error:', error);
      res.status(500).json({ 
        error: 'Failed to collect metrics', 
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // Private helper methods
  private async checkFirestoreHealth(services: any): Promise<FirestoreHealth> {
    const startTime = Date.now();
    let status: HealthStatus = 'healthy';
    let lastError: string | undefined;

    try {
      // Test basic connectivity
      const basicHealth = await services.firestore.healthCheck();
      
      // Test collections existence
      const collections = {
        conversations: true, // TODO: Implement actual checks
        messages: true,
        jobs: true,
        repositories: true,
        files: true
      };

      // Test read/write operations
      const operations = {
        read: basicHealth,
        write: basicHealth // TODO: Add write test
      };

      if (!basicHealth) {
        status = 'unhealthy';
        lastError = 'Basic health check failed';
      }

      return {
        status,
        responseTime: Date.now() - startTime,
        lastError: lastError || undefined,
        lastChecked: DateUtils.formatTimestamp(),
        collections,
        operations
      };

    } catch (error) {
      return {
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
        lastError: error instanceof Error ? error.message : 'Unknown error',
        lastChecked: DateUtils.formatTimestamp(),
        collections: {
          conversations: false,
          messages: false,
          jobs: false,
          repositories: false,
          files: false
        },
        operations: {
          read: false,
          write: false
        }
      };
    }
  }

  private async checkQdrantHealth(services: any): Promise<QdrantHealth> {
    const startTime = Date.now();
    let status: HealthStatus = 'healthy';
    let lastError: string | undefined;

    try {
      const basicHealth = await services.qdrant.healthCheck();
      
      // TODO: Get actual collection info
      const collection = {
        exists: basicHealth,
        vectorCount: 0,
        indexedVectors: 0
      };

      const operations = {
        search: basicHealth,
        upsert: basicHealth
      };

      if (!basicHealth) {
        status = 'unhealthy';
        lastError = 'Qdrant service unavailable';
      }

      return {
        status,
        responseTime: Date.now() - startTime,
        lastError,
        lastChecked: DateUtils.formatTimestamp(),
        collection,
        operations
      };

    } catch (error) {
      return {
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
        lastError: error instanceof Error ? error.message : 'Unknown error',
        lastChecked: DateUtils.formatTimestamp(),
        collection: {
          exists: false,
          vectorCount: 0,
          indexedVectors: 0
        },
        operations: {
          search: false,
          upsert: false
        }
      };
    }
  }

  private async checkOpenAIHealth(services: any): Promise<OpenAIHealth> {
    const startTime = Date.now();
    let status: HealthStatus = 'healthy';
    let lastError: string | undefined;

    try {
      const basicHealth = await services.openai.healthCheck();
      
      // Test embedding and chat separately
      const embeddingStartTime = Date.now();
      const embeddingHealth = basicHealth; // TODO: Test actual embedding
      const embeddingTime = Date.now() - embeddingStartTime;

      const chatStartTime = Date.now();  
      const chatHealth = basicHealth; // TODO: Test actual chat
      const chatTime = Date.now() - chatStartTime;

      if (!basicHealth) {
        status = 'unhealthy';
        lastError = 'OpenAI service unavailable';
      }

      return {
        status,
        responseTime: Date.now() - startTime,
        lastError,
        lastChecked: DateUtils.formatTimestamp(),
        embedding: {
          available: embeddingHealth,
          responseTime: embeddingTime
        },
        chat: {
          available: chatHealth,
          responseTime: chatTime
        },
        quotaStatus: 'normal' // TODO: Check actual quota
      };

    } catch (error) {
      return {
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
        lastError: error instanceof Error ? error.message : 'Unknown error',
        lastChecked: DateUtils.formatTimestamp(),
        embedding: {
          available: false,
          responseTime: 0
        },
        chat: {
          available: false,
          responseTime: 0
        },
        quotaStatus: 'normal'
      };
    }
  }

  private async checkLangChainHealth(services: any): Promise<LangChainHealth> {
    const startTime = Date.now();
    let status: HealthStatus = 'healthy';
    let lastError: string | undefined;

    try {
      const basicHealth = await services.langchain.healthCheck();
      
      // Test LangChain components
      const vectorStore = basicHealth;
      const chains = {
        search: basicHealth,
        conversational: basicHealth,
        summary: basicHealth
      };
      const models = {
        embedding: basicHealth,
        chat: basicHealth
      };

      if (!basicHealth) {
        status = 'unhealthy';
        lastError = 'LangChain service unavailable';
      }

      return {
        status,
        responseTime: Date.now() - startTime,
        lastError,
        lastChecked: DateUtils.formatTimestamp(),
        vectorStore,
        chains,
        models
      };

    } catch (error) {
      return {
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
        lastError: error instanceof Error ? error.message : 'Unknown error',
        lastChecked: DateUtils.formatTimestamp(),
        vectorStore: false,
        chains: {
          search: false,
          conversational: false,
          summary: false
        },
        models: {
          embedding: false,
          chat: false
        }
      };
    }
  }

  private determineOverallStatus(services: Array<{ status: HealthStatus }>): HealthStatus {
    const statuses = services.map(s => s.status);
    
    if (statuses.includes('unhealthy')) {
      return 'unhealthy';
    }
    if (statuses.includes('degraded')) {
      return 'degraded';
    }
    return 'healthy';
  }

  // Placeholder metric collection methods
  private async getConversationMetrics(_services: any) {
    // TODO: Implement actual conversation metrics collection
    return {
      activeSessions: 0,
      totalMessages: 0,
      averageSessionLength: 0,
      summaryGeneration: {
        successRate: 100,
        averageTime: 0,
        failedInLast24h: 0
      },
      memoryUsage: {
        totalTokens: 0,
        averageTokensPerSession: 0,
        tokenLimitExceeded: 0
      },
      languages: {
        ko: 0,
        en: 0
      }
    };
  }

  private async getRAGMetrics(_services: any) {
    // TODO: Implement actual RAG metrics collection
    return {
      searchQueries: {
        total: 0,
        successRate: 100,
        averageResponseTime: 0,
        noEvidenceRate: 0
      },
      documentRetrieval: {
        averageDocuments: 0,
        averageScore: 0,
        lowScoreQueries: 0
      },
      langchainPerformance: {
        chainExecutionTime: 0,
        errorRate: 0
      }
    };
  }

  private async getSyncMetrics(services: any) {
    // TODO: Implement actual sync metrics collection
    try {
      const recentJobs = await services.firestore.getRecentSyncJobs('kadragon/KNUE-Policy-Hub', 50);
      
      const completed = recentJobs.filter((job: any) => job.status === 'completed').length;
      const failed = recentJobs.filter((job: any) => job.status === 'failed').length;
      const running = recentJobs.filter((job: any) => job.status === 'running').length;
      const pending = recentJobs.filter((job: any) => job.status === 'pending').length;

      const lastSuccessful = recentJobs.find((job: any) => job.status === 'completed');

      return {
        recentJobs: {
          completed,
          failed,
          running,
          pending
        },
        performance: {
          averageSyncTime: 0, // TODO: Calculate from job data
          filesPerSecond: 0,
          lastSuccessfulSync: lastSuccessful ? lastSuccessful.completedAt?.toDate().toISOString() : null
        },
        dataIntegrity: {
          totalFiles: 0,      // TODO: Get from Firestore
          totalChunks: 0,     // TODO: Get from Qdrant
          orphanedChunks: 0   // TODO: Calculate orphaned chunks
        }
      };
    } catch (error) {
      console.error('Error getting sync metrics:', error);
      return {
        recentJobs: {
          completed: 0,
          failed: 0,
          running: 0,
          pending: 0
        },
        performance: {
          averageSyncTime: 0,
          filesPerSecond: 0,
          lastSuccessfulSync: null
        },
        dataIntegrity: {
          totalFiles: 0,
          totalChunks: 0,
          orphanedChunks: 0
        }
      };
    }
  }
}