import { Request, Response } from 'express';
import { 
  TelegramContext, 
  Language, 
  COMMANDS,
  DEFAULT_VALUES 
} from '../types';
import { ServiceError } from '../types';
import { getServices } from '../services';
import { ValidationUtils, ErrorUtils, DateUtils } from '../utils';

/**
 * 텔레그램 봇 컨트롤러
 * 
 * 주요 기능:
 * 1. 웹훅 메시지 처리
 * 2. 명령어 처리 (/help, /reset, /lang)
 * 3. 일반 메시지 처리 (Phase 4에서 RAG 연동)
 * 4. 대화 메모리 관리
 * 5. 에러 처리 및 사용자 피드백
 */
export class TelegramController {

  constructor() {
    // 서비스들은 getServices()로 런타임에 접근
  }

  /**
   * 텔레그램 웹훅 엔드포인트
   * POST /telegram/webhook
   */
  async handleWebhook(req: Request, res: Response): Promise<void> {
    try {
      const services = getServices();
      
      // 웹훅 데이터 파싱
      const telegramContext = services.telegram.parseTelegramUpdate(req.body);
      
      if (!telegramContext) {
        res.status(200).json({ ok: true, message: 'Ignored non-text message' });
        return;
      }

      console.log(`Received message from ${telegramContext.chatId}: ${telegramContext.text.substring(0, 100)}`);

      // Rate limiting 체크
      if (services.telegram.isRateLimited(telegramContext.chatId)) {
        const rateLimitMessage = services.telegram.getRateLimitMessage();
        await services.telegram.sendMessage({
          chatId: telegramContext.chatId,
          text: rateLimitMessage,
          parseMode: 'HTML'
        });
        res.status(200).json({ ok: true, message: 'Rate limited' });
        return;
      }

      // Typing indicator 표시
      await services.telegram.sendTypingAction(telegramContext.chatId);

      // 명령어 처리 또는 일반 메시지 처리
      if (telegramContext.isCommand) {
        await this.handleCommand(telegramContext);
      } else {
        await this.handleMessage(telegramContext);
      }

      res.status(200).json({ ok: true });
    } catch (error) {
      ErrorUtils.logError(error, 'Telegram Webhook');
      
      // 사용자에게 에러 메시지 전송 시도
      try {
        const services = getServices();
        const telegramContext = services.telegram.parseTelegramUpdate(req.body);
        
        if (telegramContext) {
          const errorMessage = services.telegram.formatErrorResponse(
            'Processing failed. Please try again.',
            'ko'
          );
          
          await services.telegram.sendMessage({
            chatId: telegramContext.chatId,
            text: errorMessage,
            parseMode: 'HTML'
          });
        }
      } catch (sendError) {
        ErrorUtils.logError(sendError, 'Error Message Send');
      }

      res.status(500).json({ 
        error: 'Internal server error',
        timestamp: DateUtils.formatTimestamp()
      });
    }
  }

  /**
   * 명령어 처리
   */
  private async handleCommand(context: TelegramContext): Promise<void> {
    const services = getServices();
    const { chatId, commandName, commandArgs } = context;

    if (!commandName) return;

    console.log(`Processing command ${commandName} for ${chatId}`);

    switch (commandName) {
      case COMMANDS.HELP:
        await this.handleHelpCommand(chatId);
        break;

      case COMMANDS.RESET:
        await this.handleResetCommand(chatId);
        break;

      case COMMANDS.LANG:
        await this.handleLanguageCommand(chatId, commandArgs || []);
        break;

      default:
        const response = services.telegram.formatErrorResponse(
          'Unknown command. Use /help for available commands.',
          'ko'
        );
        await services.telegram.sendMessage({
          chatId,
          text: response,
          parseMode: 'HTML'
        });
        break;
    }
  }

  /**
   * 일반 메시지 처리
   * Phase 4에서 RAG 검색 연동 예정
   */
  private async handleMessage(context: TelegramContext): Promise<void> {
    const services = getServices();
    const { chatId, text } = context;

    try {
      // 세션 초기화 및 언어 자동 감지
      const conversation = await services.conversation.initializeSession(chatId);
      await services.conversation.detectAndUpdateLanguage(chatId, text);
      
      // 사용자 메시지 저장
      await services.conversation.saveMessage(chatId, 'user', text);

      // Phase 4에서 RAG 검색 및 응답 생성 예정
      // 현재는 기본 응답만 제공
      const response = this.generateTemporaryResponse(conversation.lang, text);

      await services.telegram.sendMessage({
        chatId,
        text: response,
        parseMode: 'HTML'
      });

      // Assistant 메시지 저장
      await services.conversation.saveMessage(chatId, 'assistant', response);

    } catch (error) {
      ErrorUtils.logError(error, `Message Processing - ${chatId}`);
      
      const services = getServices();
      const errorResponse = services.telegram.formatErrorResponse(
        'Failed to process your message. Please try again.',
        'ko'
      );
      
      await services.telegram.sendMessage({
        chatId,
        text: errorResponse,
        parseMode: 'HTML'
      });
    }
  }

  /**
   * /help 명령어 처리
   */
  private async handleHelpCommand(chatId: string): Promise<void> {
    const services = getServices();
    
    try {
      const conversation = await services.conversation.initializeSession(chatId);
      const lang = conversation.lang;
      
      const helpText = this.getHelpText(lang);
      
      await services.telegram.sendMessage({
        chatId,
        text: helpText,
        parseMode: 'HTML'
      });

      // 명령어 사용 기록 저장
      await services.conversation.saveMessage(chatId, 'user', '/help');
      await services.conversation.saveMessage(chatId, 'assistant', helpText);
      
    } catch (error) {
      ErrorUtils.logError(error, `Help Command - ${chatId}`);
    }
  }

  /**
   * /reset 명령어 처리
   */
  private async handleResetCommand(chatId: string): Promise<void> {
    const services = getServices();
    
    try {
      // 대화 세션 리셋
      await services.conversation.resetSession(chatId);
      
      const resetMessage = '✅ <b>대화 세션 초기화 완료</b>\n\n이전 대화 내용이 모두 삭제되었습니다. 새로운 대화를 시작해 주세요.';

      await services.telegram.sendMessage({
        chatId,
        text: resetMessage,
        parseMode: 'HTML'
      });

      // 새 세션 시작 메시지 저장 (리셋 후 첫 메시지)
      await services.conversation.saveMessage(chatId, 'user', '/reset');
      await services.conversation.saveMessage(chatId, 'assistant', resetMessage);
      
    } catch (error) {
      ErrorUtils.logError(error, `Reset Command - ${chatId}`);
      
      const errorResponse = services.telegram.formatErrorResponse(
        'Failed to reset session. Please try again.',
        'ko'
      );
      
      await services.telegram.sendMessage({
        chatId,
        text: errorResponse,
        parseMode: 'HTML'
      });
    }
  }

  /**
   * /lang 명령어 처리
   */
  private async handleLanguageCommand(chatId: string, args: string[]): Promise<void> {
    const services = getServices();
    
    try {
      if (args.length === 0) {
        const usage = `🌐 <b>언어 설정</b>\n\n사용법: <code>/lang ko</code> 또는 <code>/lang en</code>\n\nUsage: <code>/lang ko</code> or <code>/lang en</code>`;
        await services.telegram.sendMessage({
          chatId,
          text: usage,
          parseMode: 'HTML'
        });
        return;
      }

      const langInput = args[0].toLowerCase();
      let targetLang: Language;
      
      if (langInput === 'ko' || langInput === 'korean' || langInput === '한국어') {
        targetLang = 'ko';
      } else if (langInput === 'en' || langInput === 'english' || langInput === '영어') {
        targetLang = 'en';
      } else {
        const errorMessage = `❌ <b>지원하지 않는 언어:</b> ${langInput}\n<b>Unsupported language:</b> ${langInput}\n\n✅ <b>지원 언어 / Supported languages:</b> ko, en`;
        await services.telegram.sendMessage({
          chatId,
          text: errorMessage,
          parseMode: 'HTML'
        });
        return;
      }

      // 언어 설정 업데이트
      await services.conversation.updateLanguage(chatId, targetLang);
      
      const successMessage = targetLang === 'ko'
        ? '✅ <b>언어 설정 완료</b>\n\n응답 언어를 한국어로 설정했습니다.'
        : '✅ <b>Language Setting Updated</b>\n\nResponse language set to English.';

      await services.telegram.sendMessage({
        chatId,
        text: successMessage,
        parseMode: 'HTML'
      });

      // 명령어 사용 기록 저장
      await services.conversation.saveMessage(chatId, 'user', `/lang ${args[0]}`);
      await services.conversation.saveMessage(chatId, 'assistant', successMessage);
      
    } catch (error) {
      ErrorUtils.logError(error, `Language Command - ${chatId}`);
      
      const errorResponse = services.telegram.formatErrorResponse(
        'Failed to change language setting. Please try again.',
        'ko'
      );
      
      await services.telegram.sendMessage({
        chatId,
        text: errorResponse,
        parseMode: 'HTML'
      });
    }
  }

  /**
   * Phase 4 이전 임시 응답 생성
   */
  private generateTemporaryResponse(lang: Language, userText: string): string {
    if (lang === 'en') {
      return `🤖 <b>Message Received</b>\n\nThank you for your message! The RAG-based response system will be implemented in Phase 4.\n\n<i>Your message: "${userText.substring(0, 200)}${userText.length > 200 ? '...' : ''}"</i>\n\n<b>💡 Available commands:</b>\n• <code>/help</code> - Show help\n• <code>/reset</code> - Reset conversation\n• <code>/lang ko|en</code> - Change language`;
    }

    return `🤖 <b>메시지 수신 완료</b>\n\n메시지를 잘 받았습니다! RAG 기반 질의응답 시스템은 Phase 4에서 구현될 예정입니다.\n\n<i>귀하의 메시지: "${userText.substring(0, 200)}${userText.length > 200 ? '...' : ''}"</i>\n\n<b>💡 사용 가능한 명령어:</b>\n• <code>/help</code> - 도움말\n• <code>/reset</code> - 대화 초기화\n• <code>/lang ko|en</code> - 언어 변경`;
  }

  /**
   * 도움말 텍스트 생성
   */
  private getHelpText(lang: Language): string {
    if (lang === 'en') {
      return `🤖 <b>KNUE Policy Assistant Bot</b>\n\n<b>📖 How to use:</b>\n• Ask questions about KNUE policies and guidelines freely.\n• More specific and clear questions will get better answers.\n\n<b>🔧 Commands:</b>\n• <code>/help</code> - Show this help message\n• <code>/reset</code> - Reset conversation session\n• <code>/lang ko|en</code> - Change response language\n\n<b>📝 Example questions:</b>\n• "What are the promotion criteria for professors?"\n• "Please explain the student grade processing procedures"\n• "Tell me about research fund usage regulations"\n\n<b>⚠️ Important notes:</b>\n• Answers are based only on documented policies\n• Personal or sensitive information is not handled\n• Please check the official website for the latest policy information\n\n<b>💡 Tips:</b>\n• Ask in complete sentences rather than keywords\n• Be specific about what you want to know\n• Ask about one topic at a time rather than multiple topics\n\n<i>🚧 Current Status: Phase 3 - Memory system active. RAG search will be available in Phase 4.</i>`;
    }

    return `🤖 <b>KNUE 규정·업무지침 답변봇</b>\n\n<b>📖 사용법:</b>\n• KNUE 규정이나 업무지침에 대한 질문을 자유롭게 입력하세요.\n• 구체적이고 명확한 질문일수록 정확한 답변을 받을 수 있습니다.\n\n<b>🔧 명령어:</b>\n• <code>/help</code> - 이 도움말 보기\n• <code>/reset</code> - 대화 세션 초기화\n• <code>/lang ko|en</code> - 응답 언어 변경\n\n<b>📝 예시 질문:</b>\n• "교수 승진 기준은 무엇인가요?"\n• "학생 성적 처리 절차를 알려주세요"\n• "연구비 사용 규정에 대해 설명해 주세요"\n\n<b>⚠️ 주의사항:</b>\n• 규정에 명시된 내용만 답변합니다\n• 개인 정보나 민감한 내용은 다루지 않습니다\n• 최신 규정 정보는 공식 홈페이지를 확인해 주세요\n\n<b>💡 팁:</b>\n• 키워드보다는 완전한 문장으로 질문하세요\n• 궁금한 내용을 구체적으로 명시하세요\n• 여러 주제가 섞인 질문보다는 하나의 주제로 질문하세요\n\n<i>🚧 현재 상태: Phase 3 - 메모리 시스템 활성화. RAG 검색은 Phase 4에서 제공됩니다.</i>`;
  }

  /**
   * 대화 통계 조회 (관리자용 API)
   * GET /api/conversations/:chatId/stats
   */
  async getConversationStats(req: Request, res: Response): Promise<void> {
    try {
      const { chatId } = req.params;
      
      if (!ValidationUtils.isValidChatId(chatId)) {
        res.status(400).json({ error: 'Invalid chat ID format' });
        return;
      }

      const services = getServices();
      const stats = await services.conversation.getConversationStats(chatId);
      
      res.json({
        success: true,
        data: stats,
        timestamp: DateUtils.formatTimestamp()
      });
      
    } catch (error) {
      ErrorUtils.logError(error, 'Get Conversation Stats');
      res.status(500).json({ 
        error: 'Failed to get conversation statistics',
        timestamp: DateUtils.formatTimestamp()
      });
    }
  }

  /**
   * 수동 요약 생성 (관리자용 API)
   * POST /api/conversations/:chatId/force-summary
   */
  async forceSummary(req: Request, res: Response): Promise<void> {
    try {
      const { chatId } = req.params;
      
      if (!ValidationUtils.isValidChatId(chatId)) {
        res.status(400).json({ error: 'Invalid chat ID format' });
        return;
      }

      const services = getServices();
      const summary = await services.conversation.forceSummaryGeneration(chatId);
      
      res.json({ 
        success: true, 
        data: { summary },
        timestamp: DateUtils.formatTimestamp()
      });
      
    } catch (error) {
      ErrorUtils.logError(error, 'Force Summary');
      res.status(500).json({ 
        error: 'Failed to generate summary',
        timestamp: DateUtils.formatTimestamp()
      });
    }
  }

  /**
   * 메모리 컨텍스트 조회 (관리자용 API)
   * GET /api/conversations/:chatId/context
   */
  async getMemoryContext(req: Request, res: Response): Promise<void> {
    try {
      const { chatId } = req.params;
      const { maxTokens } = req.query;
      
      if (!ValidationUtils.isValidChatId(chatId)) {
        res.status(400).json({ error: 'Invalid chat ID format' });
        return;
      }

      const services = getServices();
      const context = await services.conversation.buildMemoryContext(
        chatId, 
        maxTokens ? parseInt(maxTokens as string) : DEFAULT_VALUES.MAX_MEMORY_TOKENS
      );
      
      res.json({
        success: true,
        data: context,
        timestamp: DateUtils.formatTimestamp()
      });
      
    } catch (error) {
      ErrorUtils.logError(error, 'Get Memory Context');
      res.status(500).json({ 
        error: 'Failed to get memory context',
        timestamp: DateUtils.formatTimestamp()
      });
    }
  }
}