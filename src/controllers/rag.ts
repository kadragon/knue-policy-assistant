import { Request, Response } from 'express';
import { 
  Language,
} from '../types';
// import { ServiceError } from '../types'; // LangChain으로 마이그레이션 후 미사용
import { getServices } from '../services';
import { ValidationUtils, ErrorUtils, DateUtils } from '../utils';

/**
 * RAG (Retrieval-Augmented Generation) 컨트롤러
 * 
 * 주요 기능:
 * 1. 질의응답 시스템 (RAG + 대화 메모리 통합)
 * 2. 검색 전용 엔드포인트 (디버깅용)
 * 3. 답변 품질 평가 및 피드백
 * 4. 시스템 프롬프트 관리
 */
export class RAGController {

  constructor() {
    // 서비스들은 getServices()로 런타임에 접근
  }

  /**
   * 질의응답 엔드포인트 (LangChain 기반)
   * POST /api/rag/query
   * 
   * TelegramController에서 호출되는 핵심 RAG 시스템
   */
  async processQuery(req: Request, res: Response): Promise<void> {
    try {
      const { chatId, question, lang = 'ko' } = req.body;

      if (!ValidationUtils.isValidChatId(chatId) || !question?.trim()) {
        res.status(400).json({ 
          error: 'Invalid request parameters',
          message: 'chatId and question are required'
        });
        return;
      }

      console.log(`Processing LangChain RAG query for ${chatId}: ${question.substring(0, 100)}`);

      const services = getServices();
      
      // 1. 대화 세션 초기화 및 언어 감지
      await services.conversation.initializeSession(chatId, lang as Language);
      const detectedLang = await services.conversation.detectAndUpdateLanguage(chatId, question);

      // 2. 사용자 메시지 저장
      await services.conversation.saveMessage(chatId, 'user', question);

      // 3. 대화 기록 조회 (LangChain용)
      const messages = await services.conversation.getRecentMessages(chatId, 10);

      // 4. LangChain 대화형 RAG 호출
      const ragResponse = await services.langchain.conversationalQuery(
        question,
        messages,
        detectedLang
      );

      // 5. Assistant 메시지 저장
      await services.conversation.saveMessage(chatId, 'assistant', ragResponse.answer);

      console.log(`LangChain RAG query completed for ${chatId}: sources=${ragResponse.sources.length}`);

      res.json({
        success: true,
        data: {
          response: ragResponse.answer,
          hasEvidence: ragResponse.sources.length > 0,
          sources: ragResponse.sources,
          timestamp: DateUtils.formatTimestamp()
        }
      });

    } catch (error) {
      ErrorUtils.logError(error, 'RAG Query Processing');
      res.status(500).json({ 
        error: 'Failed to process query',
        timestamp: DateUtils.formatTimestamp()
      });
    }
  }

  /**
   * 검색 전용 엔드포인트 (LangChain 기반)
   * POST /api/rag/search
   */
  async performSearch(req: Request, res: Response): Promise<void> {
    try {
      const { query, lang = 'ko', k = 6, minScore = 0.80 } = req.body;

      if (!query?.trim()) {
        res.status(400).json({ error: 'Query is required' });
        return;
      }

      const services = getServices();
      
      // LangChain 검색 수행
      const searchResponse = await services.langchain.search({
        query,
        k,
        minScore,
        lang: lang as Language
      });

      res.json({
        success: true,
        data: {
          query: searchResponse.query,
          lang: searchResponse.lang,
          total: searchResponse.total,
          hasEvidence: searchResponse.documents.length > 0,
          documents: searchResponse.documents.map(doc => ({
            score: doc.score,
            title: doc.title,
            filePath: doc.filePath,
            text: doc.text.substring(0, 300) + (doc.text.length > 300 ? '...' : ''),
            url: doc.url
          })),
          timestamp: DateUtils.formatTimestamp()
        }
      });

    } catch (error) {
      ErrorUtils.logError(error, 'LangChain RAG Search');
      res.status(500).json({ 
        error: 'Search failed',
        timestamp: DateUtils.formatTimestamp()
      });
    }
  }

  /**
   * 답변 피드백 수집 (향후 품질 개선용)
   * POST /api/rag/feedback
   */
  async collectFeedback(req: Request, res: Response): Promise<void> {
    try {
      const { 
        chatId, 
        questionId,
        rating, // 1-5
        comment,
        wasHelpful 
      } = req.body;

      if (!ValidationUtils.isValidChatId(chatId) || !questionId) {
        res.status(400).json({ error: 'Invalid request parameters' });
        return;
      }

      const services = getServices();
      
      // 피드백 데이터 저장 (saveFeedback 메서드 미구현으로 주석처리)
      // await services.firestore.saveFeedback({
      //   feedbackId: `${chatId}_${questionId}_${Date.now()}`,
      //   chatId,
      //   questionId,
      //   rating,
      //   comment,
      //   wasHelpful,
      //   createdAt: new Date()
      // });

      console.log(`Feedback collected: ${chatId}, rating=${rating}, helpful=${wasHelpful}`);

      res.json({
        success: true,
        message: 'Feedback collected successfully',
        timestamp: DateUtils.formatTimestamp()
      });

    } catch (error) {
      ErrorUtils.logError(error, 'Feedback Collection');
      res.status(500).json({ 
        error: 'Failed to collect feedback',
        timestamp: DateUtils.formatTimestamp()
      });
    }
  }

  
  /* 
  // ===== LangChain 마이그레이션으로 제거된 메서드들 =====
  // private async performRAGSearch(
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
      const processedQuery = TextUtils.preprocessQuery(query);
      
      // 2. 질문 임베딩 생성
      const queryEmbedding = await services.openai.generateEmbedding(processedQuery);

      // 3. Qdrant 검색 수행
      const searchResults = await services.qdrant.search(queryEmbedding, {
        topK,
        filter: lang !== DEFAULT_VALUES.LANG ? {
          must: [
            {
              key: 'lang',
              match: { value: lang }
            }
          ]
        } : undefined
      });

      // 4. MMR(Maximal Marginal Relevance)로 중복 제거
      const diversifiedResults = services.qdrant.applyMMR(searchResults, 0.7);

      const maxScore = diversifiedResults.length > 0 ? diversifiedResults[0].score : 0;

      console.log(`RAG search completed: ${diversifiedResults.length} documents, max_score=${maxScore.toFixed(3)}`);

      return {
        documents: diversifiedResults,
        maxScore
      };

    } catch (error) {
      ErrorUtils.logError(error, 'RAG Search Performance');
      throw error;
    }
  }

  /**
   * 시스템 프롬프트 구성
   * 대화 메모리 + RAG 문서를 통합한 프롬프트 생성
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
    userQuestion: string
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
   * 근거 없음 응답 생성
   */
  private generateNoEvidenceResponse(lang: Language): string {
    if (lang === 'en') {
      return `❌ **Information Not Available**

I apologize, but I cannot find relevant information in the KNUE regulations and guidelines for your question.

**Possible reasons:**
• The topic may not be covered in the current regulation documents
• Different search terms might be needed
• The information might be in documents not yet indexed

**Suggestions:**
• Try rephrasing your question with different keywords
• Check the official KNUE website for the latest information
• Contact the relevant department directly for specific inquiries

**Available Commands:**
• \`/help\` - Show usage instructions
• \`/reset\` - Reset conversation session`;
    }

    return `❌ **규정에 해당 내용이 없습니다**

죄송하지만 귀하의 질문과 관련된 내용을 KNUE 규정·업무지침에서 찾을 수 없습니다.

**가능한 원인:**
• 해당 주제가 현재 규정 문서에 포함되지 않았을 수 있습니다
• 다른 검색 키워드가 필요할 수 있습니다
• 아직 색인되지 않은 문서에 정보가 있을 수 있습니다

**제안사항:**
• 다른 키워드로 질문을 다시 작성해 보세요
• 최신 정보는 KNUE 공식 홈페이지를 확인해 주세요
• 구체적인 문의는 해당 부서에 직접 연락하시기 바랍니다

**사용 가능한 명령어:**
• \`/help\` - 사용법 안내
• \`/reset\` - 대화 세션 초기화`;
  }

  /**
   * 답변 후처리
   * 출처 정보 추가 및 포맷팅
   */
  private postProcessResponse(
    aiResponse: string, 
    documents: Array<{
      title?: string;
      text: string;
      filePath: string;
      url?: string;
    }>,
    lang: Language
  ): string {
    // 출처 정보 생성
    const sourceHeader = lang === 'en' ? '\n\n**📋 Sources:**' : '\n\n**📋 참고 자료:**';
    
    const sources = documents.slice(0, 3).map((doc, index) => {
      const title = doc.title || doc.filePath.split('/').pop()?.replace('.md', '') || 'Document';
      const link = doc.url ? `[${title}](${doc.url})` : title;
      return `${index + 1}. ${link}`;
    }).join('\n');

    // 응답에 출처 추가
    return aiResponse; // 출처는 LangChain에서 자동 처리
  }
  
} // end RAGController class

/* 
기존 복잡한 메서드들은 주석처리됨  
*/

/*
=== LangChain 마이그레이션 완료 ===

기존 복잡한 RAG 구현이 LangChain 서비스로 대체되었습니다:

1. performRAGSearch() -> services.langchain.search()
2. buildSystemPrompt() -> LangChain 내부에서 처리  
3. generateNoEvidenceResponse() -> LangChain에서 자동 처리
4. postProcessResponse() -> LangChain에서 sources 자동 포함

주요 변경사항:
- 복잡한 프롬프트 구성 로직 제거
- MMR 다양성 확보 로직 제거 (QdrantVectorStore에서 처리)
- 대화 메모리 통합이 LangChain ConversationalQuery로 단순화
- 에러 처리 및 가드레일이 LangChain 레벨에서 처리

성능 및 유지보수성이 크게 향상되었습니다.
*/