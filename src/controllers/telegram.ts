import { Request, Response } from 'express';
import { 
  TelegramContext, 
  Language, 
  COMMANDS,
  DEFAULT_VALUES 
} from '../types';
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
   * Phase 4: RAG 검색 시스템과 연동
   */
  private async handleMessage(context: TelegramContext): Promise<void> {
    const services = getServices();
    const { chatId, text } = context;

    try {
      // 세션 초기화 및 언어 자동 감지
      const _conversation = await services.conversation.initializeSession(chatId);
      const detectedLang = await services.conversation.detectAndUpdateLanguage(chatId, text);
      
      // 사용자 메시지 저장
      await services.conversation.saveMessage(chatId, 'user', text);

      // RAG 검색 및 답변 생성
      const ragResponse = await this.processRAGQuery(chatId, text, detectedLang);

      await services.telegram.sendMessage({
        chatId,
        text: ragResponse.response,
        parseMode: 'HTML'
      });

      // Assistant 메시지 저장
      await services.conversation.saveMessage(chatId, 'assistant', ragResponse.response);

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
   * RAG 질의응답 처리 (LangChain 기반)
   * 단순화된 LangChain 서비스 호출
   */
  private async processRAGQuery(chatId: string, question: string, lang: Language): Promise<{
    response: string;
    hasEvidence: boolean;
    sources: Array<{title: string; filePath: string; url: string;}>;
  }> {
    const services = getServices();
    
    try {
      // 1. 대화 기록 조회 (LangChain용)
      const messages = await services.conversation.getRecentMessages(chatId, 10);

      // 2. LangChain 대화형 RAG 호출
      const ragResponse = await services.langchain.conversationalQuery(
        question,
        messages,
        lang
      );

      console.log(`LangChain RAG completed for ${chatId}: sources=${ragResponse.sources.length}`);

      return {
        response: ragResponse.answer,
        hasEvidence: ragResponse.sources.length > 0,
        sources: ragResponse.sources
      };

    } catch (error) {
      ErrorUtils.logError(error, `RAG Processing - ${chatId}`);
      
      // RAG 처리 실패 시 기본 응답
      const fallbackResponse = lang === 'en'
        ? '🔧 **System Error**\n\nI apologize, but I\'m experiencing technical difficulties. Please try again later or contact support if the problem persists.\n\n**Available Commands:**\n• `/help` - Show help\n• `/reset` - Reset conversation'
        : '🔧 **시스템 오류**\n\n죄송합니다. 기술적인 문제가 발생했습니다. 잠시 후 다시 시도해 주시거나 문제가 지속되면 지원팀에 연락해 주세요.\n\n**사용 가능한 명령어:**\n• `/help` - 도움말\n• `/reset` - 대화 초기화';

      return {
        response: fallbackResponse,
        hasEvidence: false,
        sources: []
      };
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

      const langInput = args[0]?.toLowerCase();
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
   * RAG 검색 수행
   */
  private async performRAGSearch(
    query: string,
    lang: Language,
    topK: number = DEFAULT_VALUES.RAG_TOP_K
  ): Promise<{
    documents: Array<{
      score: number;
      title?: string;
      text: string;
      filePath: string;
      url?: string;
      fileId: string;
      seq: number;
    }>;
    maxScore: number;
  }> {
    const services = getServices();

    try {
      // 1. 질문 전처리
      const processedQuery = this.preprocessQuery(query);
      
      // 2. 질문 임베딩 생성
      const queryEmbedding = await services.openai.createEmbedding(processedQuery);

      // 3. Qdrant 검색 수행
      const filter = lang !== DEFAULT_VALUES.LANG ? {
        must: [
          {
            key: 'lang',
            match: { value: lang }
          }
        ]
      } : undefined;
      
      const searchResults = await services.qdrant.search(queryEmbedding, {
        topK,
        filter
      });

      // 4. MMR(Maximal Marginal Relevance)로 중복 제거
      const diversifiedResults = searchResults; // applyMMR이 private이므로 임시로 원본 사용

      const maxScore = diversifiedResults.length > 0 ? diversifiedResults[0]?.score || 0 : 0;

      console.log(`RAG search completed: ${diversifiedResults.length} documents, max_score=${maxScore.toFixed(3)}`);

      return diversifiedResults.map(result => ({
        score: result.score || 0,
        title: result.payload?.title,
        text: result.payload?.text || '',
        filePath: result.payload?.filePath || '',
        url: result.payload?.url,
        fileId: result.payload?.fileId || '',
        seq: result.payload?.seq || 0
      }));

    } catch (error) {
      ErrorUtils.logError(error, 'RAG Search Performance');
      throw error;
    }
  }

  /**
   * 시스템 프롬프트 구성
   */
  private buildSystemPrompt(
    lang: Language,
    memoryContext: {
      summary?: string;
      recentMessages: Array<{ role: string; text: string; }>;
      tokenCount: number;
    },
    documents: Array<{
      title?: string;
      text: string;
      filePath: string;
      url?: string;
    }>,
    _userQuestion: string
  ): string {
    const basePrompt = lang === 'en' 
      ? this.getEnglishSystemPrompt()
      : this.getKoreanSystemPrompt();

    const sections = [basePrompt];

    // 대화 요약 추가 (있는 경우)
    if (memoryContext.summary) {
      const summarySection = lang === 'en'
        ? `\n[CONVERSATION SUMMARY]\n${memoryContext.summary}\n`
        : `\n[대화 요약]\n${memoryContext.summary}\n`;
      sections.push(summarySection);
    }

    // 최근 대화 추가 (있는 경우)
    if (memoryContext.recentMessages.length > 0) {
      const recentSection = lang === 'en' 
        ? '[RECENT CONVERSATION]\n'
        : '[최근 대화]\n';
      
      const recentMessages = memoryContext.recentMessages
        .slice(-5) // 최근 5개만
        .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.text}`)
        .join('\n');

      sections.push(`\n${recentSection}${recentMessages}\n`);
    }

    // RAG 검색 결과 추가
    const evidenceSection = lang === 'en'
      ? '\n[POLICY EVIDENCE]\n'
      : '\n[규정 근거]\n';

    const evidenceText = documents.map((doc, index) => {
      const header = doc.title ? `${index + 1}. ${doc.title}` : `${index + 1}. ${doc.filePath}`;
      return `${header}\n${doc.text}\n`;
    }).join('\n');

    sections.push(`${evidenceSection}${evidenceText}`);

    // 중요한 가드레일 재강조
    const guardRail = lang === 'en'
      ? '\nIMPORTANT: Base your answer ONLY on the [POLICY EVIDENCE] above. Do NOT use conversation context as evidence. If the evidence is insufficient, say "The policy does not contain this information."\n'
      : '\n중요: 답변은 반드시 위의 [규정 근거]에만 기반해야 합니다. 대화 맥락을 근거로 사용하지 마세요. 근거가 부족하면 "규정에 해당 내용이 없습니다"라고 답하세요.\n';

    sections.push(guardRail);

    return sections.join('');
  }

  /**
   * 근거 없음 응답 생성
   */
  private generateNoEvidenceResponse(_lang: Language): string {
    if (_lang === 'en') {
      return `❌ **Information Not Available**\n\nI apologize, but I cannot find relevant information in the KNUE regulations and guidelines for your question.\n\n**Possible reasons:**\n• The topic may not be covered in the current regulation documents\n• Different search terms might be needed\n• The information might be in documents not yet indexed\n\n**Suggestions:**\n• Try rephrasing your question with different keywords\n• Check the official KNUE website for the latest information\n• Contact the relevant department directly for specific inquiries\n\n**Available Commands:**\n• \`/help\` - Show usage instructions\n• \`/reset\` - Reset conversation session`;
    }

    return `❌ **규정에 해당 내용이 없습니다**\n\n죄송하지만 귀하의 질문과 관련된 내용을 KNUE 규정·업무지침에서 찾을 수 없습니다.\n\n**가능한 원인:**\n• 해당 주제가 현재 규정 문서에 포함되지 않았을 수 있습니다\n• 다른 검색 키워드가 필요할 수 있습니다\n• 아직 색인되지 않은 문서에 정보가 있을 수 있습니다\n\n**제안사항:**\n• 다른 키워드로 질문을 다시 작성해 보세요\n• 최신 정보는 KNUE 공식 홈페이지를 확인해 주세요\n• 구체적인 문의는 해당 부서에 직접 연락하시기 바랍니다\n\n**사용 가능한 명령어:**\n• \`/help\` - 사용법 안내\n• \`/reset\` - 대화 세션 초기화`;
  }

  /**
   * 답변 후처리
   */
  private postProcessResponse(
    aiResponse: string, 
    documents: Array<{
      title?: string;
      text: string;
      filePath: string;
      url?: string;
    }>,
    _lang: Language
  ): string {
    // 출처 정보 생성
    const _sourceHeader = _lang === 'en' ? '\n\n**📋 Sources:**' : '\n\n**📋 참고 자료:**';
    
    const _sources = documents.slice(0, 3).map((doc, index) => {
      const title = doc.title || doc.filePath.split('/').pop()?.replace('.md', '') || 'Document';
      const link = doc.url ? `[${title}](${doc.url})` : title;
      return `${index + 1}. ${link}`;
    }).join('\n');

    // 응답에 출처 추가
    return `${aiResponse}${sourceHeader}\n${sources}`;
  }

  /**
   * 질문 전처리
   */
  private preprocessQuery(query: string): string {
    // 기본적인 전처리: 불필요한 공백 제거, 소문자 변환 등
    return query.trim().replace(/\s+/g, ' ');
  }

  /**
   * 한국어 시스템 프롬프트
   */
  private getKoreanSystemPrompt(): string {
    return `너는 KNUE 규정·업무지침 전용 챗봇이다.

핵심 원칙:
1) 답변은 아래 [규정 근거]에만 기반한다.
2) [대화 요약/최근 대화]는 맥락 이해 보조용이며, 근거로 인용 금지.
3) 근거가 없거나 불충분하면 "규정에 해당 내용이 없습니다."라고 답한다.
4) 한국어로 간결하고 정확하게 답하라.
5) 출처를 명시하여 신뢰성을 높인다.

답변 형식:
- 핵심 내용을 먼저 제시
- 세부 사항은 단계별로 설명
- 관련 규정 조항이나 문서명 인용
- 불확실한 내용은 추측하지 말고 "확인 필요"라고 명시`;
  }

  /**
   * 영어 시스템 프롬프트
   */
  private getEnglishSystemPrompt(): string {
    return `You are a specialized chatbot for KNUE regulations and guidelines.

Core Principles:
1) Base answers ONLY on the [POLICY EVIDENCE] below.
2) [Conversation Summary/Recent Conversation] is for context understanding only, NOT for citation.
3) If evidence is lacking or insufficient, respond "This information is not available in the regulations."
4) Respond concisely and accurately in English.
5) Cite sources to enhance credibility.

Response Format:
- Present key information first
- Explain details step by step
- Cite relevant regulation articles or document names
- For uncertain content, state "verification needed" rather than guessing`;
  }

  /**
   * 도움말 텍스트 생성
   */
  private getHelpText(lang: Language): string {
    if (lang === 'en') {
      return `🤖 <b>KNUE Policy Assistant Bot</b>\n\n<b>📖 How to use:</b>\n• Ask questions about KNUE policies and guidelines freely.\n• More specific and clear questions will get better answers.\n\n<b>🔧 Commands:</b>\n• <code>/help</code> - Show this help message\n• <code>/reset</code> - Reset conversation session\n• <code>/lang ko|en</code> - Change response language\n\n<b>📝 Example questions:</b>\n• "What are the promotion criteria for professors?"\n• "Please explain the student grade processing procedures"\n• "Tell me about research fund usage regulations"\n\n<b>⚠️ Important notes:</b>\n• Answers are based only on documented policies\n• Personal or sensitive information is not handled\n• Please check the official website for the latest policy information\n\n<b>💡 Tips:</b>\n• Ask in complete sentences rather than keywords\n• Be specific about what you want to know\n• Ask about one topic at a time rather than multiple topics\n\n<i>✅ Current Status: Phase 4 - Full RAG system active with conversation memory.</i>`;
    }

    return `🤖 <b>KNUE 규정·업무지침 답변봇</b>\n\n<b>📖 사용법:</b>\n• KNUE 규정이나 업무지침에 대한 질문을 자유롭게 입력하세요.\n• 구체적이고 명확한 질문일수록 정확한 답변을 받을 수 있습니다.\n\n<b>🔧 명령어:</b>\n• <code>/help</code> - 이 도움말 보기\n• <code>/reset</code> - 대화 세션 초기화\n• <code>/lang ko|en</code> - 응답 언어 변경\n\n<b>📝 예시 질문:</b>\n• "교수 승진 기준은 무엇인가요?"\n• "학생 성적 처리 절차를 알려주세요"\n• "연구비 사용 규정에 대해 설명해 주세요"\n\n<b>⚠️ 주의사항:</b>\n• 규정에 명시된 내용만 답변합니다\n• 개인 정보나 민감한 내용은 다루지 않습니다\n• 최신 규정 정보는 공식 홈페이지를 확인해 주세요\n\n<b>💡 팁:</b>\n• 키워드보다는 완전한 문장으로 질문하세요\n• 궁금한 내용을 구체적으로 명시하세요\n• 여러 주제가 섞인 질문보다는 하나의 주제로 질문하세요\n\n<i>✅ 현재 상태: Phase 4 - 대화 메모리와 함께 완전한 RAG 시스템 활성화.</i>`;
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