import { FirestoreService } from './firestore';
import { QdrantService } from './qdrant';
import { OpenAIService } from './openai';
import { TelegramService } from './telegram';
import { GitHubService } from './github';
import { ConversationService } from './conversation';
import { LangChainService } from './langchain';
import { ServiceError } from '../types';

export class ServiceContainer {
  private static instance: ServiceContainer;
  
  public readonly firestore: FirestoreService;
  public readonly qdrant: QdrantService;
  public readonly openai: OpenAIService;
  public readonly telegram: TelegramService;
  public readonly github: GitHubService;
  public readonly conversation: ConversationService;
  public readonly langchain: LangChainService;

  private constructor() {
    try {
      this.firestore = new FirestoreService();
      this.qdrant = new QdrantService();
      this.openai = new OpenAIService();
      this.telegram = new TelegramService();
      this.github = new GitHubService();
      this.langchain = new LangChainService();
      
      // ConversationService는 다른 서비스들에 의존하므로 나중에 초기화
      this.conversation = new ConversationService(this.firestore, this.openai);
    } catch (error) {
      throw new ServiceError(
        'Failed to initialize services',
        'container',
        'INIT_ERROR',
        500,
        error
      );
    }
  }

  public static getInstance(): ServiceContainer {
    if (!ServiceContainer.instance) {
      ServiceContainer.instance = new ServiceContainer();
    }
    return ServiceContainer.instance;
  }

  // Initialize all services
  async initialize(): Promise<void> {
    try {
      // Initialize Qdrant collection
      await this.qdrant.initializeCollection();
      
      // Initialize LangChain services
      await this.langchain.initializeVectorStore();
      await this.langchain.initializeRAGChain();
      await this.langchain.initializeConversationalChain();
      
      console.log('All services initialized successfully');
    } catch (error) {
      throw new ServiceError(
        'Failed to initialize service container',
        'container',
        'INITIALIZATION_ERROR',
        500,
        error
      );
    }
  }

  // Health check for all services
  async healthCheck(): Promise<{
    firestore: boolean;
    qdrant: boolean;
    openai: boolean;
    telegram: boolean;
    github: boolean;
    langchain: boolean;
    overall: boolean;
  }> {
    const results = {
      firestore: false,
      qdrant: false,
      openai: false,
      telegram: false,
      github: false,
      langchain: false,
      overall: false
    };

    try {
      // Run all health checks in parallel
      const [
        firestoreHealth,
        qdrantHealth,
        openaiHealth,
        telegramHealth,
        githubHealth,
        langchainHealth
      ] = await Promise.allSettled([
        this.firestore.healthCheck(),
        this.qdrant.healthCheck(),
        this.openai.healthCheck(),
        this.telegram.healthCheck(),
        this.github.healthCheck(),
        this.langchain.healthCheck()
      ]);

      results.firestore = firestoreHealth.status === 'fulfilled' && firestoreHealth.value;
      results.qdrant = qdrantHealth.status === 'fulfilled' && qdrantHealth.value;
      results.openai = openaiHealth.status === 'fulfilled' && openaiHealth.value;
      results.telegram = telegramHealth.status === 'fulfilled' && telegramHealth.value;
      results.github = githubHealth.status === 'fulfilled' && githubHealth.value;
      results.langchain = langchainHealth.status === 'fulfilled' && langchainHealth.value.status === 'healthy';

      // Overall health is true if all critical services are healthy
      results.overall = results.firestore && results.langchain;

    } catch (error) {
      console.error('Health check error:', error);
    }

    return results;
  }

  // Graceful shutdown
  async shutdown(): Promise<void> {
    try {
      // Cleanup LangChain resources
      await this.langchain.cleanup();
      
      console.log('Services shutting down gracefully');
    } catch (error) {
      console.error('Error during shutdown:', error);
    }
  }
}

// Convenience exports
export { FirestoreService } from './firestore';
export { QdrantService } from './qdrant';
export { OpenAIService } from './openai';
export { TelegramService } from './telegram';
export { GitHubService } from './github';
export { ConversationService } from './conversation';
export { LangChainService } from './langchain';

// Global service instance getter
export const getServices = (): ServiceContainer => ServiceContainer.getInstance();