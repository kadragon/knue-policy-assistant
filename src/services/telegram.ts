import { Telegraf } from 'telegraf';
import { Update } from 'telegraf/types';
import { 
  TelegramContext, 
  TelegramResponse, 
  Language,
  COMMANDS 
} from '../types';
import { ServiceError } from '../types';
import { appConfig } from '../config';

export class TelegramService {
  private bot: Telegraf;

  constructor() {
    this.bot = new Telegraf(appConfig.TELEGRAM_BOT_TOKEN);
    this.setupCommands();
  }

  private setupCommands(): void {
    // Help command
    this.bot.command('help', (ctx) => {
      const helpMessage = this.getHelpMessage();
      void ctx.reply(helpMessage, { parse_mode: 'HTML' });
    });

    // Reset command
    this.bot.command('reset', (ctx) => {
      // This will be handled by the main application logic
      void ctx.reply('대화 세션을 초기화합니다. 이전 대화 내용이 모두 삭제됩니다.');
    });

    // Language command
    this.bot.command('lang', (ctx) => {
      const args = ctx.message.text.split(' ').slice(1);
      if (args.length === 0) {
        void ctx.reply('사용법: /lang ko 또는 /lang en\n현재 지원 언어: 한국어(ko), English(en)');
        return;
      }

      const lang = args[0]?.toLowerCase();
      if (lang !== 'ko' && lang !== 'en') {
        void ctx.reply('지원하지 않는 언어입니다. ko 또는 en을 사용해주세요.');
        return;
      }

      // This will be handled by the main application logic
      const message = lang === 'ko' 
        ? '응답 언어를 한국어로 설정했습니다.'
        : 'Response language set to English.';
      void ctx.reply(message);
    });

    // Handle all text messages
    this.bot.on('text', (ctx) => {
      // This will be handled by the webhook endpoint
      // The bot instance here is just for command setup
    });

    // Error handling
    this.bot.catch((err, ctx) => {
      console.error(`Telegram bot error for ${ctx.updateType}:`, err);
    });
  }

  async setWebhook(url: string): Promise<void> {
    try {
      await this.bot.telegram.setWebhook(url);
    } catch (error) {
      throw new ServiceError(
        'Failed to set Telegram webhook',
        'telegram',
        'WEBHOOK_ERROR',
        500,
        error
      );
    }
  }

  async deleteWebhook(): Promise<void> {
    try {
      await this.bot.telegram.deleteWebhook();
    } catch (error) {
      throw new ServiceError(
        'Failed to delete Telegram webhook',
        'telegram',
        'DELETE_WEBHOOK_ERROR',
        500,
        error
      );
    }
  }

  async sendMessage(response: TelegramResponse): Promise<void> {
    try {
      const options: any = {
        parse_mode: response.parseMode || 'HTML',
        disable_web_page_preview: response.disableWebPagePreview || true
      };

      if (response.replyToMessageId) {
        options.reply_to_message_id = response.replyToMessageId;
      }

      await this.bot.telegram.sendMessage(response.chatId, response.text, options);
    } catch (error) {
      throw new ServiceError(
        'Failed to send Telegram message',
        'telegram',
        'SEND_MESSAGE_ERROR',
        500,
        error
      );
    }
  }

  async sendTypingAction(chatId: string): Promise<void> {
    try {
      await this.bot.telegram.sendChatAction(chatId, 'typing');
    } catch (error) {
      // Don't throw error for typing action failures
      console.warn('Failed to send typing action:', error);
    }
  }

  parseTelegramUpdate(update: Update): TelegramContext | null {
    try {
      if (!('message' in update) || !update.message) {
        return null;
      }

      const message = update.message;
      if (!('text' in message) || !message.text) {
        return null;
      }

      const chatId = message.chat.id.toString();
      const text = message.text.trim();
      const isCommand = text.startsWith('/');
      
      let commandName: string | undefined;
      let commandArgs: string[] | undefined;

      if (isCommand) {
        const parts = text.split(' ');
        commandName = parts[0].toLowerCase();
        commandArgs = parts.slice(1);
      }

      return {
        chatId,
        messageId: message.message_id,
        userId: message.from?.id || 0,
        username: message.from?.username || undefined,
        firstName: message.from?.first_name || undefined,
        lastName: message.from?.last_name || undefined,
        text,
        isCommand,
        commandName,
        commandArgs
      };
    } catch (error) {
      throw new ServiceError(
        'Failed to parse Telegram update',
        'telegram',
        'PARSE_UPDATE_ERROR',
        400,
        error
      );
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const me = await this.bot.telegram.getMe();
      return me.is_bot === true;
    } catch {
      return false;
    }
  }

  // Command validation
  isValidCommand(commandName: string): boolean {
    const validCommands = Object.values(COMMANDS);
    return validCommands.includes(commandName as any);
  }

  isResetCommand(commandName: string): boolean {
    return commandName === COMMANDS.RESET;
  }

  isLanguageCommand(commandName: string): boolean {
    return commandName === COMMANDS.LANG;
  }

  isHelpCommand(commandName: string): boolean {
    return commandName === COMMANDS.HELP;
  }

  // Language parsing for /lang command
  parseLanguageCommand(commandArgs: string[]): Language | null {
    if (commandArgs.length === 0) return null;
    
    const lang = commandArgs[0].toLowerCase();
    if (lang === 'ko' || lang === 'korean' || lang === '한국어') {
      return 'ko';
    } else if (lang === 'en' || lang === 'english' || lang === '영어') {
      return 'en';
    }
    
    return null;
  }

  // Response formatting
  formatResponse(text: string, sources?: string[], lang: Language = 'ko'): string {
    let formattedResponse = text;

    // Add sources if provided
    if (sources && sources.length > 0) {
      const sourcesTitle = lang === 'ko' ? '\n\n📚 참고 자료:' : '\n\n📚 References:';
      const sourcesList = sources.map((source, index) => 
        `${index + 1}. <a href="${source}">${this.extractFileNameFromUrl(source)}</a>`
      ).join('\n');
      
      formattedResponse += `${sourcesTitle}\n${sourcesList}`;
    }

    return formattedResponse;
  }

  formatErrorResponse(error: string, lang: Language = 'ko'): string {
    if (lang === 'en') {
      return `❌ <b>Error:</b> ${error}\n\nPlease try again or contact support if the problem persists.`;
    }
    
    return `❌ <b>오류:</b> ${error}\n\n다시 시도해 주시거나, 문제가 지속되면 관리자에게 문의해 주세요.`;
  }

  formatNoResultsResponse(lang: Language = 'ko'): string {
    if (lang === 'en') {
      return '📋 There is no relevant content in the regulations for your inquiry.\n\nPlease try rephrasing your question or ask about a different topic.';
    }
    
    return '📋 문의하신 내용에 해당하는 규정이 없습니다.\n\n질문을 다시 표현해 보시거나 다른 주제로 문의해 주세요.';
  }

  // Help message
  private getHelpMessage(): string {
    return `🤖 <b>KNUE 규정·업무지침 답변봇</b>

<b>📖 사용법:</b>
• KNUE 규정이나 업무지침에 대한 질문을 자유롭게 입력하세요.
• 구체적이고 명확한 질문일수록 정확한 답변을 받을 수 있습니다.

<b>🔧 명령어:</b>
• <code>/help</code> - 이 도움말 보기
• <code>/reset</code> - 대화 세션 초기화
• <code>/lang ko|en</code> - 응답 언어 변경

<b>📝 예시 질문:</b>
• "교수 승진 기준은 무엇인가요?"
• "학생 성적 처리 절차를 알려주세요"
• "연구비 사용 규정에 대해 설명해 주세요"

<b>⚠️ 주의사항:</b>
• 규정에 명시된 내용만 답변합니다
• 개인 정보나 민감한 내용은 다루지 않습니다
• 최신 규정 정보는 공식 홈페이지를 확인해 주세요

<b>💡 팁:</b>
• 키워드보다는 완전한 문장으로 질문하세요
• 궁금한 내용을 구체적으로 명시하세요
• 여러 주제가 섞인 질문보다는 하나의 주제로 질문하세요`;
  }

  // Utility methods
  private extractFileNameFromUrl(url: string): string {
    try {
      const urlParts = url.split('/');
      const fileName = urlParts[urlParts.length - 1];
      return fileName.replace(/\.(md|txt)$/i, '');
    } catch {
      return 'Document';
    }
  }

  // Rate limiting utilities
  private readonly rateLimits = new Map<string, { count: number; resetTime: number }>();

  isRateLimited(chatId: string, maxRequests: number = 10, windowMs: number = 60000): boolean {
    const now = Date.now();
    const userLimit = this.rateLimits.get(chatId);

    if (!userLimit || now > userLimit.resetTime) {
      // Reset or initialize rate limit
      this.rateLimits.set(chatId, { count: 1, resetTime: now + windowMs });
      return false;
    }

    if (userLimit.count >= maxRequests) {
      return true;
    }

    userLimit.count++;
    return false;
  }

  getRateLimitMessage(lang: Language = 'ko'): string {
    if (lang === 'en') {
      return '⏳ <b>Rate Limit Exceeded</b>\n\nYou have sent too many requests. Please wait a moment and try again.';
    }
    
    return '⏳ <b>요청 한도 초과</b>\n\n너무 많은 요청을 보내셨습니다. 잠시 후 다시 시도해 주세요.';
  }

  // Webhook processing
  async processWebhook(body: any): Promise<TelegramContext | null> {
    try {
      const update = body as Update;
      return this.parseTelegramUpdate(update);
    } catch (error) {
      throw new ServiceError(
        'Failed to process webhook',
        'telegram',
        'PROCESS_WEBHOOK_ERROR',
        400,
        error
      );
    }
  }
}