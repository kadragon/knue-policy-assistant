import OpenAI from 'openai';
import { 
  ChatContext, 
  Message,
  Language,
  DEFAULT_VALUES 
} from '../types';
import { ServiceError } from '../types';
import { appConfig } from '../config';
import { createLogger } from './logger';
import { metricsService } from './metrics';

// OpenAI 서비스 전용 로거
const logger = createLogger('openai-service');

export class OpenAIService {
  private client: OpenAI;
  private embeddingModel: string = 'text-embedding-3-small';
  private chatModel: string = 'gpt-4-turbo-preview';
  private maxTokens = {
    embedding: 8191, // text-embedding-3-small limit
    chat: 4096,
    memory: DEFAULT_VALUES.MAX_MEMORY_TOKENS
  };

  constructor() {
    this.client = new OpenAI({
      apiKey: appConfig.OPENAI_API_KEY,
    });
  }

  async createEmbedding(text: string): Promise<number[]> {
    const startTime = Date.now();
    
    try {
      // Truncate text if it's too long for embedding model
      const truncatedText = this.truncateText(text, this.maxTokens.embedding);
      
      logger.debug('embedding-create', 'Creating single embedding', {
        originalLength: text.length,
        truncatedLength: truncatedText.length,
        model: this.embeddingModel
      });
      
      const response = await this.client.embeddings.create({
        model: this.embeddingModel,
        input: truncatedText,
        encoding_format: 'float'
      });

      const duration = Date.now() - startTime;
      const embedding = response.data[0].embedding;
      
      logger.logPerformance('embedding-create', duration, {
        model: this.embeddingModel,
        inputLength: truncatedText.length,
        embeddingDimensions: embedding.length,
        tokensUsed: response.usage?.total_tokens
      });
      
      metricsService.recordPerformance({
        operation: 'embedding-create',
        service: 'openai',
        duration,
        success: true,
        metadata: { embeddingDimensions: embedding.length }
      });

      return embedding;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('embedding-create-error', 'Failed to create embedding', error as Error, {
        textLength: text.length,
        model: this.embeddingModel,
        duration
      });
      
      metricsService.recordPerformance({
        operation: 'embedding-create',
        service: 'openai',
        duration,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      throw new ServiceError(
        'Failed to create embedding',
        'openai',
        'EMBEDDING_ERROR',
        500,
        error
      );
    }
  }

  async createEmbeddings(texts: string[]): Promise<number[][]> {
    const startTime = Date.now();
    
    try {
      // Process in batches to avoid rate limits
      const batchSize = DEFAULT_VALUES.EMBEDDING_BATCH_SIZE;
      const embeddings: number[][] = [];
      const totalBatches = Math.ceil(texts.length / batchSize);

      logger.info('batch-embedding-start', `Creating embeddings for ${texts.length} texts in ${totalBatches} batches`, {
        totalTexts: texts.length,
        batchSize,
        totalBatches,
        model: this.embeddingModel
      });

      for (let i = 0; i < texts.length; i += batchSize) {
        const batchStartTime = Date.now();
        const batchIndex = Math.floor(i / batchSize) + 1;
        const batch = texts.slice(i, i + batchSize);
        const truncatedBatch = batch.map(text => this.truncateText(text, this.maxTokens.embedding));

        const response = await this.client.embeddings.create({
          model: this.embeddingModel,
          input: truncatedBatch,
          encoding_format: 'float'
        });

        embeddings.push(...response.data.map(item => item.embedding));
        
        const batchDuration = Date.now() - batchStartTime;
        logger.debug('batch-embedding-progress', `Completed batch ${batchIndex}/${totalBatches}`, {
          batchIndex,
          totalBatches,
          batchSize: batch.length,
          batchDuration,
          tokensUsed: response.usage?.total_tokens
        });
        
        // Add delay between batches to respect rate limits
        if (i + batchSize < texts.length) {
          await this.delay(100);
        }
      }

      const duration = Date.now() - startTime;
      logger.logPerformance('batch-embedding-complete', duration, {
        totalTexts: texts.length,
        totalBatches,
        embeddingsCreated: embeddings.length,
        averageTimePerBatch: Math.round(duration / totalBatches)
      });
      
      metricsService.recordPerformance({
        operation: 'batch-embedding-create',
        service: 'openai',
        duration,
        success: true,
        metadata: { 
          totalTexts: texts.length, 
          batchCount: totalBatches,
          embeddingsCreated: embeddings.length
        }
      });

      return embeddings;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('batch-embedding-error', 'Failed to create batch embeddings', error as Error, {
        totalTexts: texts.length,
        batchSize: DEFAULT_VALUES.EMBEDDING_BATCH_SIZE,
        duration
      });
      
      metricsService.recordPerformance({
        operation: 'batch-embedding-create',
        service: 'openai',
        duration,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      throw new ServiceError(
        'Failed to create batch embeddings',
        'openai',
        'BATCH_EMBEDDING_ERROR',
        500,
        error
      );
    }
  }

  async generateChatCompletion(context: ChatContext): Promise<string> {
    const startTime = Date.now();
    
    try {
      const messages: OpenAI.ChatCompletionMessageParam[] = [
        {
          role: 'system',
          content: context.systemPrompt
        }
      ];

      // Add conversation summary if available
      if (context.conversationSummary) {
        messages.push({
          role: 'system',
          content: `[대화 요약]\n${context.conversationSummary}`
        });
      }

      // Add recent messages (conversation context)
      let truncatedMessages: Message[] = [];
      if (context.recentMessages && context.recentMessages.length > 0) {
        // Truncate messages if they exceed memory token limit
        truncatedMessages = this.truncateMessages(context.recentMessages, this.maxTokens.memory);
        
        for (const msg of truncatedMessages) {
          messages.push({
            role: msg.role === 'user' ? 'user' : 'assistant',
            content: msg.text
          });
        }
      }

      // Add RAG context (규정 근거)
      if (context.ragContext) {
        messages.push({
          role: 'system',
          content: `[규정 근거]\n${context.ragContext}`
        });
      }

      logger.debug('chat-completion-start', 'Generating chat completion', {
        model: this.chatModel,
        messageCount: messages.length,
        hasConversationSummary: !!context.conversationSummary,
        recentMessageCount: context.recentMessages?.length || 0,
        truncatedMessageCount: truncatedMessages.length,
        hasRAGContext: !!context.ragContext,
        ragContextLength: context.ragContext?.length || 0,
        maxTokens: context.maxTokens || this.maxTokens.chat,
        temperature: context.temperature || 0.1
      });

      const completion = await this.client.chat.completions.create({
        model: this.chatModel,
        messages,
        max_tokens: context.maxTokens || this.maxTokens.chat,
        temperature: context.temperature || 0.1,
        top_p: 0.95,
        frequency_penalty: 0,
        presence_penalty: 0
      });

      const response = completion.choices[0]?.message?.content;
      if (!response) {
        throw new Error('No response content from OpenAI');
      }

      const duration = Date.now() - startTime;
      logger.logPerformance('chat-completion', duration, {
        model: this.chatModel,
        inputTokens: completion.usage?.prompt_tokens,
        outputTokens: completion.usage?.completion_tokens,
        totalTokens: completion.usage?.total_tokens,
        responseLength: response.length,
        finishReason: completion.choices[0]?.finish_reason
      });
      
      metricsService.recordPerformance({
        operation: 'chat-completion',
        service: 'openai',
        duration,
        success: true,
        metadata: {
          model: this.chatModel,
          totalTokens: completion.usage?.total_tokens,
          responseLength: response.length
        }
      });

      return response.trim();
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('chat-completion-error', 'Failed to generate chat completion', error as Error, {
        model: this.chatModel,
        duration,
        hasRAGContext: !!context.ragContext,
        messageCount: context.recentMessages?.length || 0
      });
      
      metricsService.recordPerformance({
        operation: 'chat-completion',
        service: 'openai',
        duration,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      throw new ServiceError(
        'Failed to generate chat completion',
        'openai',
        'CHAT_COMPLETION_ERROR',
        500,
        error
      );
    }
  }

  async generateSummary(messages: Message[]): Promise<string> {
    const startTime = Date.now();
    
    try {
      const conversationText = messages
        .map(msg => `${msg.role}: ${msg.text}`)
        .join('\n');

      const summaryPrompt = this.getSummaryPrompt();

      logger.debug('summary-generation-start', 'Generating conversation summary', {
        messageCount: messages.length,
        conversationLength: conversationText.length,
        model: this.chatModel
      });

      const completion = await this.client.chat.completions.create({
        model: this.chatModel,
        messages: [
          {
            role: 'system',
            content: summaryPrompt
          },
          {
            role: 'user',
            content: `다음 대화를 요약해 주세요:\n\n${conversationText}`
          }
        ],
        max_tokens: 800,
        temperature: 0.1
      });

      const summary = completion.choices[0]?.message?.content;
      if (!summary) {
        throw new Error('No summary content from OpenAI');
      }

      const duration = Date.now() - startTime;
      logger.logPerformance('summary-generation', duration, {
        model: this.chatModel,
        inputMessages: messages.length,
        inputLength: conversationText.length,
        outputLength: summary.length,
        inputTokens: completion.usage?.prompt_tokens,
        outputTokens: completion.usage?.completion_tokens,
        totalTokens: completion.usage?.total_tokens
      });
      
      metricsService.recordPerformance({
        operation: 'summary-generation',
        service: 'openai',
        duration,
        success: true,
        metadata: {
          messageCount: messages.length,
          summaryLength: summary.length,
          totalTokens: completion.usage?.total_tokens
        }
      });

      return summary.trim();
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('summary-generation-error', 'Failed to generate conversation summary', error as Error, {
        messageCount: messages.length,
        model: this.chatModel,
        duration
      });
      
      metricsService.recordPerformance({
        operation: 'summary-generation',
        service: 'openai',
        duration,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      throw new ServiceError(
        'Failed to generate conversation summary',
        'openai',
        'SUMMARY_ERROR',
        500,
        error
      );
    }
  }

  async healthCheck(): Promise<boolean> {
    const startTime = Date.now();
    
    try {
      logger.debug('health-check', 'Starting OpenAI service health check', {
        embeddingModel: this.embeddingModel
      });
      
      // Test with a simple embedding request
      await this.client.embeddings.create({
        model: this.embeddingModel,
        input: 'health check test',
        encoding_format: 'float'
      });
      
      const duration = Date.now() - startTime;
      logger.logHealthCheck(
        'health-check',
        'openai-api',
        'healthy',
        duration
      );
      
      return true;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.logHealthCheck(
        'health-check',
        'openai-api',
        'unhealthy',
        duration,
        error as Error
      );
      
      return false;
    }
  }

  // Helper methods

  private truncateText(text: string, maxTokens: number): string {
    // Simple estimation: ~4 characters per token for Korean/English mixed text
    const maxChars = maxTokens * 4;
    if (text.length <= maxChars) return text;
    
    return text.substring(0, maxChars - 100) + '...'; // Leave some buffer
  }

  private truncateMessages(messages: Message[], maxTokens: number): Message[] {
    const maxChars = maxTokens * 4; // Rough token estimation
    let totalChars = 0;
    const result: Message[] = [];

    // Start from most recent messages and work backwards
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      const messageLength = message.text.length;
      
      if (totalChars + messageLength > maxChars) {
        // If this message would exceed limit, truncate it
        const remainingChars = maxChars - totalChars;
        if (remainingChars > 100) { // Only include if we have meaningful space left
          result.unshift({
            ...message,
            text: message.text.substring(0, remainingChars - 10) + '...'
          });
        }
        break;
      }
      
      result.unshift(message);
      totalChars += messageLength;
    }

    return result;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Prompt templates
  getSystemPrompt(lang: Language = 'ko'): string {
    if (lang === 'en') {
      return `You are a specialized chatbot for KNUE regulations and business guidelines.

IMPORTANT RULES:
1) Base your answers ONLY on the [Regulation Evidence] provided below.
2) [Conversation Summary/Recent Messages] are for context understanding only - NEVER cite them as evidence.
3) If there's no evidence in the regulations, respond: "There is no relevant content in the regulations."
4) Answer concisely and accurately in English.
5) Always cite the source of your information.

When regulations conflict, present both and refer to higher-level regulations.`;
    }

    return `너는 KNUE 규정·업무지침 전용 챗봇이다.

중요한 규칙:
1) 답변은 아래 [규정 근거]에만 기반한다.
2) [대화 요약/최근 대화]는 맥락 이해 보조용이며, 근거로 인용 금지.
3) 근거가 없으면 "규정에 해당 내용이 없습니다."라고 답한다.
4) 한국어로 간결하고 정확하게 답하라.
5) 항상 정보의 출처를 명시하라.

상충하는 규정 발견 시 둘 다 제시하고 상위 규정을 안내하라.`;
  }

  private getSummaryPrompt(): string {
    return `최근 대화를 5~8줄로 요약하되:

- 사용자의 지속되는 의도/조건/제약(예: "휴가 규정만", "결론 먼저")을 남기고
- 특정 사실은 규정 근거가 확인된 항목만 유지
- 불필요한 소회·잡담 제거
- 한국어로 간결하게 작성

요약은 향후 대화의 맥락 이해에 도움이 되도록 작성하라.`;
  }

  // Token estimation utilities
  estimateTokens(text: string): number {
    // Rough estimation for Korean/English mixed text
    return Math.ceil(text.length / 4);
  }

  canFitInContext(texts: string[], maxTokens: number): boolean {
    const totalChars = texts.reduce((sum, text) => sum + text.length, 0);
    return this.estimateTokens(totalChars.toString()) <= maxTokens;
  }
}