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
import { DateUtils, TextUtils } from '../utils';

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
    try {
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
        console.log(`Created new conversation session for ${chatId}`);
      }
      
      return conversation;
    } catch (error) {
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
    try {
      const message: Message = {
        messageId: '', // FirestoreService에서 설정됨
        chatId,
        role,
        text,
        metadata,
        createdAt: Timestamp.now()
      };

      await this.firestoreService.saveMessage(message);
      console.log(`Saved ${role} message for ${chatId}: ${TextUtils.truncate(text, 100)}`);
      
      // 요약 트리거 확인 및 실행
      if (await this.shouldTriggerSummary(chatId)) {
        await this.generateAndSaveSummary(chatId);
      }
    } catch (error) {
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
    try {
      return await this.firestoreService.getRecentMessages(chatId, limit);
    } catch (error) {
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
    try {
      const [conversation, recentMessages] = await Promise.all([
        this.firestoreService.getConversation(chatId),
        this.firestoreService.getRecentMessages(chatId, DEFAULT_VALUES.MAX_RECENT_MESSAGES)
      ]);

      return {
        conversation,
        recentMessages,
        summary: conversation?.summary
      };
    } catch (error) {
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
    try {
      await this.firestoreService.resetConversation(chatId);
      console.log(`Reset conversation session for ${chatId}`);
    } catch (error) {
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
    try {
      const conversation = await this.firestoreService.getConversation(chatId);
      if (!conversation) {
        // 새 세션 생성
        await this.initializeSession(chatId, lang);
        return;
      }

      conversation.lang = lang;
      conversation.updatedAt = Timestamp.now();
      await this.firestoreService.saveConversation(conversation);
      
      console.log(`Updated language to ${lang} for ${chatId}`);
    } catch (error) {
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
      return await this.firestoreService.shouldTriggerSummary(chatId);
    } catch (error) {
      // 요약 트리거 확인 실패 시 로그만 남기고 진행
      console.warn(`Failed to check summary trigger for ${chatId}:`, error);
      return false;
    }
  }

  /**
   * 대화 요약 생성 및 저장
   * OpenAI를 사용하여 rolling summary 생성
   */
  private async generateAndSaveSummary(chatId: string): Promise<void> {
    try {
      const recentMessages = await this.firestoreService.getRecentMessages(
        chatId, 
        DEFAULT_VALUES.SUMMARY_TRIGGER_MESSAGES
      );

      if (recentMessages.length === 0) {
        console.log(`No messages to summarize for ${chatId}`);
        return;
      }

      console.log(`Generating summary for ${chatId} with ${recentMessages.length} messages...`);

      // OpenAI를 사용하여 요약 생성
      const summary = await this.openaiService.generateSummary(recentMessages);
      
      // 요약을 Firestore에 저장
      await this.firestoreService.updateConversationSummary(chatId, summary);

      console.log(`Generated summary for ${chatId}: ${TextUtils.truncate(summary, 100)}`);
    } catch (error) {
      // 요약 생성 실패 시 기존 요약 유지하고 로그만 남김
      console.error(`Failed to generate summary for ${chatId}:`, error);
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
        lastMessageAt: conversation?.lastMessageAt?.toDate(),
        createdAt: conversation?.createdAt?.toDate()
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
    try {
      const context = await this.loadConversationContext(chatId);
      
      let tokenCount = 0;
      const summary = context.summary;
      
      // 요약 토큰 계산
      if (summary) {
        tokenCount += this.openaiService.estimateTokens(summary);
      }

      // 최근 메시지를 토큰 한도 내에서 선별
      const selectedMessages: Message[] = [];
      const remainingTokens = maxTokens - tokenCount;

      for (let i = context.recentMessages.length - 1; i >= 0; i--) {
        const message = context.recentMessages[i];
        const messageTokens = this.openaiService.estimateTokens(message.text);
        
        if (tokenCount + messageTokens > maxTokens) {
          break;
        }
        
        selectedMessages.unshift(message);
        tokenCount += messageTokens;
      }

      console.log(`Built memory context for ${chatId}: ${tokenCount} tokens (${selectedMessages.length} messages)`);

      return {
        summary,
        recentMessages: selectedMessages,
        tokenCount
      };
    } catch (error) {
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
    try {
      await this.generateAndSaveSummary(chatId);
      
      const conversation = await this.firestoreService.getConversation(chatId);
      const summary = conversation?.summary || 'No summary generated';
      
      console.log(`Forced summary generation for ${chatId}`);
      return summary;
    } catch (error) {
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
        console.log(`Auto-detected and updated language to ${detectedLang} for ${chatId}`);
      }
      
      return detectedLang;
    } catch (error) {
      console.warn(`Failed to detect/update language for ${chatId}:`, error);
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
      if (!conversation) return false;
      
      const now = Date.now();
      const lastMessageTime = conversation.lastMessageAt.toMillis();
      const idleTime = now - lastMessageTime;
      const maxIdleTime = maxIdleHours * 60 * 60 * 1000; // hours to milliseconds
      
      return idleTime < maxIdleTime;
    } catch (error) {
      console.warn(`Failed to check session activity for ${chatId}:`, error);
      return false;
    }
  }
}