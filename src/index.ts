import express from 'express';
import { appConfig } from './config';
import { getServices } from './services';
import { HealthController, TelegramController, GitHubController, RAGController } from './controllers';
import { ErrorUtils, DateUtils } from './utils';
import { 
  correlationIdMiddleware, 
  requestLoggingMiddleware, 
  errorLoggingMiddleware, 
  performanceMiddleware 
} from './middleware/logging';
import {
  generalRateLimit,
  webhookRateLimit,
  ragRateLimit,
  healthRateLimit,
  syncRateLimit
} from './middleware/rate-limit';

class App {
  private app: express.Application;
  private healthController: HealthController;
  private telegramController: TelegramController;
  private githubController: GitHubController;
  private ragController: RAGController;

  constructor() {
    this.app = express();
    this.healthController = new HealthController();
    this.telegramController = new TelegramController();
    this.githubController = new GitHubController();
    this.ragController = new RAGController();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  private setupMiddleware(): void {
    // Phase 5.2: Structured logging and monitoring middleware
    this.app.use(correlationIdMiddleware);
    this.app.use(performanceMiddleware);
    this.app.use(requestLoggingMiddleware);

    // Rate limiting middleware - applied globally as a baseline
    this.app.use(generalRateLimit);

    // Parse JSON bodies
    this.app.use(express.json({ limit: '10mb' }));
    
    // Parse URL-encoded bodies
    this.app.use(express.urlencoded({ extended: true }));

    // Security headers and CORS configuration
    this.app.use((req, res, next) => {
      // Security headers
      res.header('X-Content-Type-Options', 'nosniff');
      res.header('X-Frame-Options', 'DENY');
      res.header('X-XSS-Protection', '1; mode=block');
      res.header('Referrer-Policy', 'strict-origin-when-cross-origin');
      res.header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'");
      
      // Restrictive CORS - only allow specific origins in production
      const allowedOrigins = appConfig.NODE_ENV === 'production' 
        ? ['https://your-frontend-domain.com'] // Update with actual frontend domains
        : ['http://localhost:3000', 'http://localhost:3001']; // Development origins
      
      const origin = req.headers.origin;
      if (origin && allowedOrigins.includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin);
      } else if (appConfig.NODE_ENV === 'development') {
        res.header('Access-Control-Allow-Origin', '*'); // Allow all in development
      }
      
      res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Correlation-ID');
      res.header('Access-Control-Max-Age', '86400'); // Cache preflight for 24 hours
      
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
        return;
      }
      
      next();
    });
  }

  private setupRoutes(): void {
    // Phase 5: Enhanced health check endpoints with rate limiting
    this.app.get('/healthz', healthRateLimit, this.healthController.healthCheck.bind(this.healthController));
    this.app.get('/health', healthRateLimit, this.healthController.healthCheck.bind(this.healthController));
    this.app.get('/health/detailed', healthRateLimit, this.healthController.detailedHealth.bind(this.healthController));
    this.app.get('/health/metrics', healthRateLimit, this.healthController.systemMetrics.bind(this.healthController));

    // Phase 3: Telegram webhook endpoint with rate limiting
    this.app.post('/telegram/webhook', webhookRateLimit, this.telegramController.handleWebhook.bind(this.telegramController));
    
    // Phase 3: Conversation management API endpoints
    this.app.get('/api/conversations/:chatId/stats', generalRateLimit, this.telegramController.getConversationStats.bind(this.telegramController));
    this.app.post('/api/conversations/:chatId/force-summary', generalRateLimit, this.telegramController.forceSummary.bind(this.telegramController));
    this.app.get('/api/conversations/:chatId/context', generalRateLimit, this.telegramController.getMemoryContext.bind(this.telegramController));

    // Phase 4: GitHub webhook endpoints with rate limiting
    this.app.post('/github/webhook', webhookRateLimit, this.githubController.handleWebhook.bind(this.githubController));
    this.app.post('/api/sync/manual', syncRateLimit, this.githubController.triggerManualSync.bind(this.githubController));
    this.app.get('/api/sync/status', generalRateLimit, this.githubController.getSyncStatus.bind(this.githubController));

    // Phase 4: RAG search endpoints with stricter rate limiting
    this.app.post('/api/rag/query', ragRateLimit, this.ragController.processQuery.bind(this.ragController));
    this.app.post('/api/rag/search', ragRateLimit, this.ragController.performSearch.bind(this.ragController));
    this.app.post('/api/rag/feedback', ragRateLimit, this.ragController.collectFeedback.bind(this.ragController));

    // Phase 4: Polling worker (alternative to webhook)
    this.app.post('/worker/sync', (_req, res) => {
      res.status(501).json({ error: 'Polling worker not implemented yet - will be added if needed' });
    });

    // Default route
    this.app.get('/', (_req, res) => {
      res.json({
        name: 'KNUE Policy Assistant',
        version: '1.0.0',
        status: 'Phase 4 - Full RAG System Active',
        endpoints: [
          'GET /healthz - Health check',
          'POST /telegram/webhook - Telegram webhook (Active)',
          'GET /api/conversations/:chatId/stats - Conversation statistics',
          'POST /api/conversations/:chatId/force-summary - Force summary generation',
          'GET /api/conversations/:chatId/context - Memory context',
          'POST /github/webhook - GitHub webhook (Active)',
          'POST /api/sync/manual - Manual sync trigger',
          'GET /api/sync/status - Sync status',
          'POST /api/rag/query - RAG query processing',
          'POST /api/rag/search - Search documents',
          'POST /api/rag/feedback - Collect feedback',
          'POST /worker/sync - Polling worker (if needed)'
        ]
      });
    });

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Not Found',
        message: `Route ${req.method} ${req.originalUrl} not found`,
        availableEndpoints: ['/healthz', '/telegram/webhook', '/github/webhook', '/api/rag/query', '/api/sync/manual']
      });
    });
  }

  private setupErrorHandling(): void {
    // Global error handler
    this.app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      ErrorUtils.logError(error, 'Express App');

      // Don't send error details in production
      const isDevelopment = appConfig.NODE_ENV === 'development';
      
      const errorResponse = {
        error: 'Internal Server Error',
        message: isDevelopment ? ErrorUtils.getErrorMessage(error) : 'Something went wrong',
        timestamp: DateUtils.formatTimestamp(),
        ...(isDevelopment && { stack: error.stack })
      };

      res.status(error.status || error.statusCode || 500).json(errorResponse);
    });

    // Phase 5.2: Add structured error logging middleware
    this.app.use(errorLoggingMiddleware);
  }

  async initialize(): Promise<void> {
    try {
      console.log('Initializing KNUE Policy Assistant...');
      
      // Initialize services
      const services = getServices();
      await services.initialize();
      
      console.log('Services initialized successfully');
    } catch (error) {
      ErrorUtils.logError(error, 'App Initialization');
      throw error;
    }
  }

  async start(): Promise<void> {
    try {
      await this.initialize();

      const server = this.app.listen(appConfig.PORT, () => {
        console.log(`Server running on port ${appConfig.PORT}`);
        console.log(`Environment: ${appConfig.NODE_ENV}`);
        console.log(`Health check: http://localhost:${appConfig.PORT}/healthz`);
      });

      // Graceful shutdown handling
      process.on('SIGTERM', async () => {
        console.log('SIGTERM received, shutting down gracefully');
        
        server.close(() => {
          console.log('HTTP server closed');
          this.shutdown();
        });
      });

      process.on('SIGINT', async () => {
        console.log('SIGINT received, shutting down gracefully');
        
        server.close(() => {
          console.log('HTTP server closed');
          this.shutdown();
        });
      });

    } catch (error) {
      ErrorUtils.logError(error, 'App Startup');
      process.exit(1);
    }
  }

  private async shutdown(): Promise<void> {
    try {
      const services = getServices();
      await services.shutdown();
      console.log('Services shutdown complete');
      process.exit(0);
    } catch (error) {
      ErrorUtils.logError(error, 'App Shutdown');
      process.exit(1);
    }
  }
}

// Start the application
if (require.main === module) {
  const app = new App();
  app.start();
}

export default App;