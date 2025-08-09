import { Timestamp } from '@google-cloud/firestore';
import { 
  Conversation, 
  Message, 
  Language, 
  MessageRole,
  DEFAULT_VALUES 
} from '../types';
import { ServiceError } from '../types';
import { FirestoreService } from './firestore';
import { OpenAIService } from './openai';
import { TextUtils } from '../utils';
import { createLogger } from './logger';
import { metricsService } from './metrics';

// 대화 서비스 전용 로거
const logger = createLogger('conversation-service');

/**
 * 대화 메모리 시스템을 관리하는 서비스
 * 
 * 핵심 기능:
 * 1. 대화 세션 생성/관리
 * 2. 메시지 저장 및 조회
 * 3. 자동 요약 생성 (rolling summary)
 * 4. 메모리 컨텍스트 구성
 * 5. 토큰 관리 및 최적화
 */
export class ConversationService {
  constructor(
    private firestoreService: FirestoreService,
    private openaiService: OpenAIService
  ) {}

  /**
   * 대화 세션 초기화 또는 조회
   * 세션이 없으면 새로 생성하고, 있으면 기존 세션 반환
   */
  async initializeSession(chatId: string, lang: Language = DEFAULT_VALUES.LANG): Promise<Conversation> {
    const startTime = Date.now();
    
    try {
      logger.info('session-init', `Initializing session for ${chatId}`, {
        chatId,
        lang
      });
      
      let conversation = await this.firestoreService.getConversation(chatId);
      
      if (!conversation) {
        // 새 세션 생성
        conversation = {
          chatId,
          lang,
          messageCount: 0,
          lastMessageAt: Timestamp.now(),
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now()
        };
        
        await this.firestoreService.saveConversation(conversation);
        
        const duration = Date.now() - startTime;
        logger.logConversationOperation(
          'session-created',
          chatId,
          0,
          duration,
          { lang, newSession: true }
        );
        
        metricsService.recordConversation({
          chatId,
          operation: 'session-create',
          messageCount: 0,
          duration,
          success: true,
          metadata: {
            languageChanged: false,
            sessionActive: true
          }
        });
      } else {
        const duration = Date.now() - startTime;
        logger.logConversationOperation(
          'session-retrieved',
          chatId,
          conversation.messageCount || 0,
          duration,
          { lang: conversation.lang, existingSession: true }
        );
      }
      
      return conversation;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('session-init-error', `Failed to initialize session for ${chatId}`, error as Error, {
        chatId,
        lang,
        duration
      });
      
      metricsService.recordConversation({
        chatId,
        operation: 'session-create',
        messageCount: 0,
        duration,
        success: false,
        metadata: {
          sessionActive: false
        }
      });
      
      throw new ServiceError(
        'Failed to initialize conversation session',
        'conversation',
        'INIT_SESSION_ERROR',
        500,
        error
      );
    }
  }

  /**
   * 메시지 저장 및 세션 업데이트
   * 저장 후 자동으로 요약 트리거 조건을 확인
   */
  async saveMessage(chatId: string, role: MessageRole, text: string, metadata?: any): Promise<void> {
    const startTime = Date.now();
    
    try {
      logger.debug('message-save-start', `Saving ${role} message for ${chatId}`, {
        chatId,
        role,
        textLength: text.length,
        hasMetadata: !!metadata
      });
      
      const message: Message = {
        messageId: '', // FirestoreService에서 설정됨
        chatId,
        role,
        text,
        metadata,
        createdAt: Timestamp.now()
      };

      await this.firestoreService.saveMessage(message);
      
      const duration = Date.now() - startTime;
      logger.logConversationOperation(
        'message-saved',
        chatId,
        1,
        duration,
        {
          role,
          textLength: text.length,
          messagePreview: TextUtils.truncate(text, 100)
        }
      );
      
      metricsService.recordConversation({
        chatId,
        operation: 'message',
        messageCount: 1,
        duration,
        success: true,
        metadata: {
          messageRole: role
        }
      });
      
      // 요약 트리거 확인 및 실행
      if (await this.shouldTriggerSummary(chatId)) {
        await this.generateAndSaveSummary(chatId);
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('message-save-error', `Failed to save ${role} message for ${chatId}`, error as Error, {
        chatId,
        role,
        textLength: text.length,
        duration
      });
      
      metricsService.recordConversation({
        chatId,
        operation: 'message',
        messageCount: 1,
        duration,
        success: false,
        metadata: {
          messageRole: role
        }
      });
      
      throw new ServiceError(
        'Failed to save message',
        'conversation',
        'SAVE_MESSAGE_ERROR',
        500,
        error
      );
    }
  }

  /**
   * 최근 메시지 조회 (LangChain 대화 메모리용)
   */
  async getRecentMessages(chatId: string, limit: number = 10): Promise<Message[]> {
    const startTime = Date.now();
    
    try {
      logger.debug('messages-fetch', `Fetching ${limit} recent messages for ${chatId}`, {
        chatId,
        limit
      });
      
      const messages = await this.firestoreService.getRecentMessages(chatId, limit);
      
      const duration = Date.now() - startTime;
      logger.logConversationOperation(
        'messages-retrieved',
        chatId,
        messages.length,
        duration,
        { requestedLimit: limit, actualCount: messages.length }
      );
      
      return messages;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('messages-fetch-error', `Failed to get recent messages for ${chatId}`, error as Error, {
        chatId,
        limit,
        duration
      });
      
      throw new ServiceError(
        'Failed to get recent messages',
        'conversation',
        'GET_MESSAGES_ERROR',
        500,
        error
      );
    }
  }

  /**
   * 대화 맥락 로드 (요약 + 최근 메시지)
   * Phase 4에서 RAG 검색과 함께 사용됨
   */
  async loadConversationContext(chatId: string): Promise<{
    conversation: Conversation | null;
    recentMessages: Message[];
    summary?: string;
  }> {
    const startTime = Date.now();
    
    try {
      logger.debug('context-load', `Loading conversation context for ${chatId}`, {
        chatId,
        maxRecentMessages: DEFAULT_VALUES.MAX_RECENT_MESSAGES
      });
      
      const [conversation, recentMessages] = await Promise.all([
        this.firestoreService.getConversation(chatId),
        this.firestoreService.getRecentMessages(chatId, DEFAULT_VALUES.MAX_RECENT_MESSAGES)
      ]);

      const duration = Date.now() - startTime;
      logger.logConversationOperation(
        'context-loaded',
        chatId,
        recentMessages.length,
        duration,
        {
          hasConversation: !!conversation,
          hasSummary: !!conversation?.summary,
          summaryLength: conversation?.summary?.length || 0
        }
      );
      
      return {
        conversation,
        recentMessages,
        ...(conversation?.summary && { summary: conversation.summary })
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('context-load-error', `Failed to load conversation context for ${chatId}`, error as Error, {
        chatId,
        duration
      });
      
      throw new ServiceError(
        'Failed to load conversation context',
        'conversation',
        'LOAD_CONTEXT_ERROR',
        500,
        error
      );
    }
  }

  /**
   * 세션 리셋 (/reset 명령어)
   * 모든 메시지와 요약을 삭제하고 세션을 초기화
   */
  async resetSession(chatId: string): Promise<void> {
    const startTime = Date.now();
    
    try {
      logger.info('session-reset', `Resetting conversation session for ${chatId}`, {
        chatId
      });
      
      await this.firestoreService.resetConversation(chatId);
      
      const duration = Date.now() - startTime;
      logger.logConversationOperation(
        'session-reset',
        chatId,
        0,
        duration,
        { resetComplete: true }
      );
      
      metricsService.recordConversation({
        chatId,
        operation: 'session-reset',
        messageCount: 0,
        duration,
        success: true
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('session-reset-error', `Failed to reset session for ${chatId}`, error as Error, {
        chatId,
        duration
      });
      
      metricsService.recordConversation({
        chatId,
        operation: 'session-reset',
        messageCount: 0,
        duration,
        success: false
      });
      
      throw new ServiceError(
        'Failed to reset conversation session',
        'conversation',
        'RESET_SESSION_ERROR',
        500,
        error
      );
    }
  }

  /**
   * 언어 설정 변경 (/lang 명령어)
   */
  async updateLanguage(chatId: string, lang: Language): Promise<void> {
    const startTime = Date.now();
    
    try {
      logger.info('language-update', `Updating language to ${lang} for ${chatId}`, {
        chatId,
        newLang: lang
      });
      
      const conversation = await this.firestoreService.getConversation(chatId);
      if (!conversation) {
        // 새 세션 생성
        await this.initializeSession(chatId, lang);
        return;
      }

      const oldLang = conversation.lang;
      conversation.lang = lang;
      conversation.updatedAt = Timestamp.now();
      await this.firestoreService.saveConversation(conversation);
      
      const duration = Date.now() - startTime;
      logger.logConversationOperation(
        'language-updated',
        chatId,
        conversation.messageCount || 0,
        duration,
        { oldLang, newLang: lang }
      );
      
      metricsService.recordConversation({
        chatId,
        operation: 'language-update',
        messageCount: 0,
        duration,
        success: true
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('language-update-error', `Failed to update language for ${chatId}`, error as Error, {
        chatId,
        lang,
        duration
      });
      
      metricsService.recordConversation({
        chatId,
        operation: 'language-update',
        messageCount: 0,
        duration,
        success: false
      });
      
      throw new ServiceError(
        'Failed to update language setting',
        'conversation',
        'UPDATE_LANGUAGE_ERROR',
        500,
        error
      );
    }
  }

  /**
   * 요약 트리거 조건 확인
   * 1. 메시지 수가 SUMMARY_TRIGGER_MESSAGES 이상
   * 2. 또는 총 텍스트 길이가 SUMMARY_TRIGGER_CHARS 이상
   */
  private async shouldTriggerSummary(chatId: string): Promise<boolean> {
    try {
      const shouldTrigger = await this.firestoreService.shouldTriggerSummary(chatId);
      
      logger.debug('summary-trigger-check', `Summary trigger check for ${chatId}: ${shouldTrigger}`, {
        chatId,
        shouldTrigger
      });
      
      return shouldTrigger;
    } catch (error) {
      // 요약 트리거 확인 실패 시 로그만 남기고 진행
      logger.warn('summary-trigger-check-error', `Failed to check summary trigger for ${chatId}`, {
        chatId,
        error: (error as Error).message
      });
      return false;
    }
  }

  /**
   * 대화 요약 생성 및 저장
   * OpenAI를 사용하여 rolling summary 생성
   */
  private async generateAndSaveSummary(chatId: string): Promise<void> {
    const startTime = Date.now();
    
    try {
      logger.info('summary-generation', `Starting summary generation for ${chatId}`, {
        chatId
      });
      
      const recentMessages = await this.firestoreService.getRecentMessages(
        chatId, 
        DEFAULT_VALUES.SUMMARY_TRIGGER_MESSAGES
      );

      if (recentMessages.length === 0) {
        logger.debug('summary-skip', `No messages to summarize for ${chatId}`, {
          chatId
        });
        return;
      }

      logger.debug('summary-messages-loaded', `Loaded ${recentMessages.length} messages for summary`, {
        chatId,
        messageCount: recentMessages.length
      });

      // OpenAI를 사용하여 요약 생성
      const summary = await this.openaiService.generateSummary(recentMessages);
      
      // 요약을 Firestore에 저장
      await this.firestoreService.updateConversationSummary(chatId, summary);

      const duration = Date.now() - startTime;
      logger.logConversationOperation(
        'summary-generated',
        chatId,
        recentMessages.length,
        duration,
        {
          summaryLength: summary.length,
          summaryPreview: TextUtils.truncate(summary, 100)
        }
      );
      
      metricsService.recordConversation({
        chatId,
        operation: 'summary',
        messageCount: recentMessages.length,
        duration,
        success: true,
        metadata: {
          summaryLength: summary.length,
          summaryGenerated: true
        }
      });
    } catch (error) {
      // 요약 생성 실패 시 기존 요약 유지하고 로그만 남김
      const duration = Date.now() - startTime;
      logger.error('summary-generation-error', `Failed to generate summary for ${chatId}`, error as Error, {
        chatId,
        duration
      });
      
      metricsService.recordConversation({
        chatId,
        operation: 'summary',
        messageCount: 0,
        duration,
        success: false,
        metadata: {
          summaryGenerated: false
        }
      });
    }
  }

  /**
   * 대화 통계 조회 (관리자/디버깅용)
   */
  async getConversationStats(chatId: string): Promise<{
    messageCount: number;
    hasSummary: boolean;
    lastMessageAt?: Date;
    createdAt?: Date;
  }> {
    try {
      const conversation = await this.firestoreService.getConversation(chatId);
      const messageCount = await this.firestoreService.getMessageCount(chatId);

      return {
        messageCount,
        hasSummary: !!conversation?.summary,
        ...(conversation?.lastMessageAt && { lastMessageAt: conversation.lastMessageAt.toDate() }),
        ...(conversation?.createdAt && { createdAt: conversation.createdAt.toDate() })
      };
    } catch (error) {
      throw new ServiceError(
        'Failed to get conversation statistics',
        'conversation',
        'GET_STATS_ERROR',
        500,
        error
      );
    }
  }

  /**
   * 메모리 컨텍스트 구성
   * 요약 + 최근 메시지를 토큰 제한 내에서 구성
   * Phase 4에서 RAG 검색과 함께 LLM 프롬프트에 사용
   */
  async buildMemoryContext(chatId: string, maxTokens: number = DEFAULT_VALUES.MAX_MEMORY_TOKENS): Promise<{
    summary?: string;
    recentMessages: Message[];
    tokenCount: number;
  }> {
    const startTime = Date.now();
    
    try {
      logger.debug('memory-context-build', `Building memory context for ${chatId}`, {
        chatId,
        maxTokens
      });
      
      const context = await this.loadConversationContext(chatId);
      
      let tokenCount = 0;
      const summary = context.summary;
      
      // 요약 토큰 계산
      if (summary) {
        tokenCount += this.openaiService.estimateTokens(summary);
      }

      // 최근 메시지를 토큰 한도 내에서 선별
      const selectedMessages: Message[] = [];
      // const remainingTokens = maxTokens - tokenCount; // 향후 사용을 위해 남겨둠

      for (let i = context.recentMessages.length - 1; i >= 0; i--) {
        const message = context.recentMessages[i];
        if (!message) continue;
        const messageTokens = this.openaiService.estimateTokens(message.text);
        
        if (tokenCount + messageTokens > maxTokens) {
          break;
        }
        
        selectedMessages.unshift(message);
        tokenCount += messageTokens;
      }

      const duration = Date.now() - startTime;
      logger.logConversationOperation(
        'memory-context-built',
        chatId,
        selectedMessages.length,
        duration,
        {
          totalTokens: tokenCount,
          maxTokens,
          summaryTokens: summary ? this.openaiService.estimateTokens(summary) : 0,
          messageTokens: tokenCount - (summary ? this.openaiService.estimateTokens(summary) : 0),
          totalAvailableMessages: context.recentMessages.length,
          selectedMessageCount: selectedMessages.length
        }
      );

      // Record memory context metrics
      metricsService.recordConversation({
        chatId,
        operation: 'memory-build',
        messageCount: selectedMessages.length,
        duration,
        success: true,
        metadata: {
          tokenCount,
          memoryContextSize: selectedMessages.length
        }
      });

      const result: any = {
        recentMessages: selectedMessages,
        tokenCount
      };
      
      if (summary) {
        result.summary = summary;
      }
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('memory-context-build-error', `Failed to build memory context for ${chatId}`, error as Error, {
        chatId,
        maxTokens,
        duration
      });
      
      throw new ServiceError(
        'Failed to build memory context',
        'conversation',
        'BUILD_CONTEXT_ERROR',
        500,
        error
      );
    }
  }

  /**
   * 수동 요약 생성 (관리자용)
   * /force-summary 등의 관리자 명령어에서 사용
   */
  async forceSummaryGeneration(chatId: string): Promise<string> {
    const startTime = Date.now();
    
    try {
      logger.info('force-summary', `Forcing summary generation for ${chatId}`, {
        chatId
      });
      
      await this.generateAndSaveSummary(chatId);
      
      const conversation = await this.firestoreService.getConversation(chatId);
      const summary = conversation?.summary || 'No summary generated';
      
      const duration = Date.now() - startTime;
      logger.logConversationOperation(
        'force-summary-completed',
        chatId,
        0,
        duration,
        {
          summaryGenerated: !!conversation?.summary,
          summaryLength: summary.length
        }
      );
      
      metricsService.recordConversation({
        chatId,
        operation: 'summary',
        messageCount: 0,
        duration,
        success: true
      });
      
      return summary;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('force-summary-error', `Failed to force summary generation for ${chatId}`, error as Error, {
        chatId,
        duration
      });
      
      metricsService.recordConversation({
        chatId,
        operation: 'summary',
        messageCount: 0,
        duration,
        success: false
      });
      
      throw new ServiceError(
        'Failed to force summary generation',
        'conversation',
        'FORCE_SUMMARY_ERROR',
        500,
        error
      );
    }
  }

  /**
   * 대화 언어 감지
   * 사용자 메시지를 분석하여 자동으로 언어를 감지하고 업데이트
   */
  async detectAndUpdateLanguage(chatId: string, text: string): Promise<Language> {
    try {
      const detectedLang = TextUtils.detectLanguage(text);
      const conversation = await this.firestoreService.getConversation(chatId);
      
      // 현재 설정된 언어와 다르면 업데이트
      if (conversation && conversation.lang !== detectedLang) {
        await this.updateLanguage(chatId, detectedLang);
        logger.info('language-auto-detected', `Auto-detected and updated language to ${detectedLang} for ${chatId}`, {
          chatId,
          oldLang: conversation.lang,
          detectedLang,
          textSample: text.substring(0, 50) + (text.length > 50 ? '...' : '')
        });
      }
      
      return detectedLang;
    } catch (error) {
      logger.warn('language-detect-error', `Failed to detect/update language for ${chatId}`, {
        chatId,
        error: (error as Error).message,
        textLength: text.length
      });
      return DEFAULT_VALUES.LANG;
    }
  }

  /**
   * 세션 활성도 체크
   * 비활성 세션 정리를 위한 유틸리티
   */
  async isSessionActive(chatId: string, maxIdleHours: number = 24): Promise<boolean> {
    try {
      const conversation = await this.firestoreService.getConversation(chatId);
      if (!conversation) {
        logger.debug('session-activity-check', `No conversation found for ${chatId}`, {
          chatId,
          maxIdleHours
        });
        return false;
      }
      
      const now = Date.now();
      const lastMessageTime = conversation.lastMessageAt.toMillis();
      const idleTime = now - lastMessageTime;
      const maxIdleTime = maxIdleHours * 60 * 60 * 1000; // hours to milliseconds
      const isActive = idleTime < maxIdleTime;
      
      logger.debug('session-activity-check', `Session activity check for ${chatId}: ${isActive}`, {
        chatId,
        isActive,
        idleTimeHours: Math.round(idleTime / (60 * 60 * 1000) * 100) / 100,
        maxIdleHours,
        lastMessageTime: new Date(lastMessageTime).toISOString()
      });
      
      return isActive;
    } catch (error) {
      logger.warn('session-activity-check-error', `Failed to check session activity for ${chatId}`, {
        chatId,
        maxIdleHours,
        error: (error as Error).message
      });
      return false;
    }
  }
}