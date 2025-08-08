import express from 'express';
import { appConfig } from './config';
import { getServices } from './services';
import { HealthController, TelegramController } from './controllers';
import { ErrorUtils, DateUtils } from './utils';

class App {
  private app: express.Application;
  private healthController: HealthController;
  private telegramController: TelegramController;

  constructor() {
    this.app = express();
    this.healthController = new HealthController();
    this.telegramController = new TelegramController();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  private setupMiddleware(): void {
    // Parse JSON bodies
    this.app.use(express.json({ limit: '10mb' }));
    
    // Parse URL-encoded bodies
    this.app.use(express.urlencoded({ extended: true }));

    // Add request logging
    this.app.use((req, _res, next) => {
      console.log(`${DateUtils.formatTimestamp()} - ${req.method} ${req.path}`);
      next();
    });

    // Add CORS headers if needed
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
      
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
        return;
      }
      
      next();
    });
  }

  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/healthz', this.healthController.healthCheck.bind(this.healthController));
    this.app.get('/health', this.healthController.healthCheck.bind(this.healthController));

    // Phase 3: Telegram webhook endpoint
    this.app.post('/telegram/webhook', this.telegramController.handleWebhook.bind(this.telegramController));
    
    // Phase 3: Management API endpoints
    this.app.get('/api/conversations/:chatId/stats', this.telegramController.getConversationStats.bind(this.telegramController));
    this.app.post('/api/conversations/:chatId/force-summary', this.telegramController.forceSummary.bind(this.telegramController));
    this.app.get('/api/conversations/:chatId/context', this.telegramController.getMemoryContext.bind(this.telegramController));

    this.app.post('/github/webhook', (_req, res) => {
      res.status(501).json({ error: 'GitHub webhook not implemented yet' });
    });

    this.app.post('/worker/sync', (_req, res) => {
      res.status(501).json({ error: 'Worker sync not implemented yet' });
    });

    // Default route
    this.app.get('/', (_req, res) => {
      res.json({
        name: 'KNUE Policy Assistant',
        version: '1.0.0',
        status: 'Phase 3 - Memory System Active',
        endpoints: [
          'GET /healthz - Health check',
          'POST /telegram/webhook - Telegram webhook (Active)',
          'GET /api/conversations/:chatId/stats - Conversation statistics',
          'POST /api/conversations/:chatId/force-summary - Force summary generation',
          'GET /api/conversations/:chatId/context - Memory context',
          'POST /github/webhook - GitHub webhook (coming in Phase 4)',
          'POST /worker/sync - Sync worker (coming in Phase 4)'
        ]
      });
    });

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Not Found',
        message: `Route ${req.method} ${req.originalUrl} not found`,
        availableEndpoints: ['/healthz', '/telegram/webhook', '/github/webhook', '/worker/sync']
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

      res.status(500).json(errorResponse);
    });
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