/**
 * LangChain Service
 * LangChain 기반 RAG 체인 및 대화 메모리 시스템을 관리하는 서비스
 */

import { ChatOpenAI } from '@langchain/openai';
import { QdrantVectorStore } from '@langchain/qdrant';
import { OpenAIEmbeddings } from '@langchain/openai';
// 사용되지 않는 import들 제거
// import { Document } from '@langchain/core/documents';
// import { BaseMessage, HumanMessage, AIMessage } from '@langchain/core/messages';
// import { PromptTemplate } from '@langchain/core/prompts';

import type {
  Language,
  RAGSearchRequest,
  RAGSearchResponse,
  RAGQueryRequest,
  RAGQueryResponse,
  Message,
} from '../types/index.js';
import { appConfig } from '../config/index.js';
// import { logger } from '../utils/logger.js';

// 임시 로거 (실제 logger 파일 없음)
const logger = {
  info: (msg: string, ...args: any[]) => console.log(`[INFO] ${msg}`, ...args),
  error: (msg: string, ...args: any[]) => console.error(`[ERROR] ${msg}`, ...args),
  warn: (msg: string, ...args: any[]) => console.warn(`[WARN] ${msg}`, ...args),
};

export class LangChainService {
  private llm: ChatOpenAI;
  private embeddings: OpenAIEmbeddings;
  private vectorStore: QdrantVectorStore | null = null;
  // 체인 기반 구현은 나중에 추가 - 현재는 기본 RAG 구현
  // private ragChain: RetrievalQAChain | null = null;
  // private conversationalChain: ConversationalRetrievalQAChain | null = null;

  constructor() {
    // OpenAI LLM 초기화
    this.llm = new ChatOpenAI({
      openAIApiKey: appConfig.OPENAI_API_KEY,
      modelName: 'gpt-4-turbo-preview',
      temperature: 0,
      maxTokens: 1500,
    });

    // OpenAI 임베딩 초기화
    this.embeddings = new OpenAIEmbeddings({
      openAIApiKey: appConfig.OPENAI_API_KEY,
      modelName: 'text-embedding-3-small',
    });

    logger.info('LangChainService initialized');
  }

  /**
   * Qdrant 벡터 스토어 초기화
   */
  async initializeVectorStore(): Promise<void> {
    try {
      this.vectorStore = await QdrantVectorStore.fromExistingCollection(
        this.embeddings,
        {
          url: appConfig.QDRANT_URL,
          apiKey: appConfig.QDRANT_API_KEY,
          collectionName: appConfig.COLLECTION_NAME,
        }
      );

      logger.info('Qdrant vector store initialized');
    } catch (error) {
      logger.error('Failed to initialize vector store:', error);
      throw error;
    }
  }

  /**
   * RAG 체인 초기화 (기본 구현)
   */
  async initializeRAGChain(): Promise<void> {
    if (!this.vectorStore) {
      await this.initializeVectorStore();
    }

    // 기본 LLM과 벡터스토어만 초기화 - 체인은 런타임에 구성
    logger.info('RAG chain initialized (basic setup)');
  }

  /**
   * 대화형 RAG 체인 초기화 (기본 구현)
   */
  async initializeConversationalChain(): Promise<void> {
    if (!this.vectorStore) {
      await this.initializeVectorStore();
    }

    // 기본 설정만 완료 - 실제 대화 체인은 런타임에 구성
    logger.info('Conversational RAG chain initialized (basic setup)');
  }

  /**
   * RAG 검색 수행
   */
  async search(request: RAGSearchRequest): Promise<RAGSearchResponse> {
    try {
      if (!this.vectorStore) {
        await this.initializeVectorStore();
      }

      const filter = request.lang ? {
        must: [{ key: 'lang', match: { value: request.lang } }]
      } : undefined;

      const results = await this.vectorStore!.similaritySearchWithScore(
        request.query,
        request.k || 6,
        filter
      );

      const documents = results
        .filter(([, score]) => score >= (request.minScore || 0.80))
        .map(([doc, score]) => ({
          score,
          title: doc.metadata['title'] || '',
          text: doc.pageContent,
          filePath: doc.metadata['filePath'] || '',
          url: doc.metadata['url'] || '',
          fileId: doc.metadata['fileId'] || '',
          seq: doc.metadata['seq'] || 0,
        }));

      return {
        documents,
        query: request.query,
        total: documents.length,
        ...(request.lang && { lang: request.lang }),
      };
    } catch (error) {
      logger.error('LangChain search failed:', error);
      throw error;
    }
  }

  /**
   * RAG 질의응답 수행 (기본 구현)
   */
  async query(request: RAGQueryRequest): Promise<RAGQueryResponse> {
    try {
      if (!this.vectorStore) {
        await this.initializeVectorStore();
      }

      // 1. 벡터 검색
      const searchResults = await this.vectorStore!.similaritySearchWithScore(
        request.question,
        6,
        request.lang ? {
          must: [{ key: 'lang', match: { value: request.lang } }]
        } : undefined
      );

      // 2. 관련 문서가 없으면 기본 응답
      const relevantDocs = searchResults.filter(([, score]) => score >= 0.80);
      if (relevantDocs.length === 0) {
        return {
          answer: "규정에 해당 내용이 없습니다.",
          sources: [],
          question: request.question,
          lang: request.lang || 'ko',
          processingTime: 0,
        };
      }

      // 3. LLM에 전달할 컨텍스트 구성
      const context = relevantDocs
        .map(([doc]) => doc.pageContent)
        .join('\n\n');

      const systemPrompt = `너는 KNUE 규정·업무지침 전용 챗봇이다.

**중요한 규칙:**
1) 답변은 아래 [규정 근거]에만 기반한다.
2) 근거가 없으면 "규정에 해당 내용이 없습니다."라고 답한다.
3) 한국어로 간결하고 정확하게 답하라.
4) 출처를 반드시 포함하라.

[규정 근거]
${context}

질문: ${request.question}

답변:`;

      // 4. LLM 호출
      const result = await this.llm.invoke(systemPrompt);

      // 5. 출처 정보 구성
      const sources = relevantDocs.map(([doc]) => ({
        title: doc.metadata['title'] || '',
        filePath: doc.metadata['filePath'] || '',
        url: doc.metadata['url'] || '',
      }));

      return {
        answer: result.content as string,
        sources,
        question: request.question,
        lang: request.lang || 'ko',
        processingTime: 0,
      };
    } catch (error) {
      logger.error('LangChain query failed:', error);
      throw error;
    }
  }

  /**
   * 대화형 질의응답 수행 (메모리 포함, 기본 구현)
   */
  async conversationalQuery(
    question: string,
    chatHistory: Message[],
    lang: Language = 'ko'
  ): Promise<RAGQueryResponse> {
    try {
      if (!this.vectorStore) {
        await this.initializeVectorStore();
      }

      // 1. 대화 기록을 요약하여 컨텍스트 생성
      let conversationContext = '';
      if (chatHistory.length > 0) {
        const recentMessages = chatHistory.slice(-6); // 최근 6개 메시지
        conversationContext = recentMessages
          .map(msg => `${msg.role === 'user' ? '사용자' : '챗봇'}: ${msg.text}`)
          .join('\n');
      }

      // 2. 벡터 검색
      const searchResults = await this.vectorStore!.similaritySearchWithScore(
        question,
        6,
        lang ? {
          must: [{ key: 'lang', match: { value: lang } }]
        } : undefined
      );

      // 3. 관련 문서가 없으면 기본 응답
      const relevantDocs = searchResults.filter(([, score]) => score >= 0.80);
      if (relevantDocs.length === 0) {
        return {
          answer: "규정에 해당 내용이 없습니다.",
          sources: [],
          question,
          lang,
          processingTime: 0,
        };
      }

      // 4. LLM에 전달할 컨텍스트 구성
      const context = relevantDocs
        .map(([doc]) => doc.pageContent)
        .join('\n\n');

      const systemPrompt = `너는 KNUE 규정·업무지침 전용 챗봇이다.

**중요한 규칙:**
1) 답변은 아래 [규정 근거]에만 기반한다.
2) [최근 대화]는 맥락 이해 보조용이며, 근거로 인용 금지.
3) 근거가 없으면 "규정에 해당 내용이 없습니다."라고 답한다.
4) 한국어로 간결하고 정확하게 답하라.
5) 출처를 반드시 포함하라.

[최근 대화]
${conversationContext}

[규정 근거]
${context}

질문: ${question}

답변:`;

      // 5. LLM 호출
      const result = await this.llm.invoke(systemPrompt);

      // 6. 출처 정보 구성
      const sources = relevantDocs.map(([doc]) => ({
        title: doc.metadata['title'] || '',
        filePath: doc.metadata['filePath'] || '',
        url: doc.metadata['url'] || '',
      }));

      return {
        answer: result.content as string,
        sources,
        question,
        lang,
        processingTime: 0,
      };
    } catch (error) {
      logger.error('LangChain conversational query failed:', error);
      throw error;
    }
  }

  /**
   * 대화 요약 생성 (기본 구현)
   */
  async summarizeConversation(messages: Message[]): Promise<string> {
    try {
      // 메시지 텍스트 결합
      const conversationText = messages
        .map(msg => `${msg.role === 'user' ? '사용자' : '챗봇'}: ${msg.text}`)
        .join('\n');

      const summaryPrompt = `다음 대화를 5~8줄로 요약하되:
- 사용자의 지속되는 의도/조건/제약(예: "휴가 규정만", "결론 먼저")을 남기고
- 특정 사실은 규정 근거가 확인된 항목만 유지
- 불필요한 소회·잡담 제거
- 한국어로 간결하게

대화 내용:
${conversationText}

요약:`;

      const result = await this.llm.invoke(summaryPrompt);
      return result.content as string;
    } catch (error) {
      logger.error('Failed to summarize conversation:', error);
      throw error;
    }
  }

  /**
   * 서비스 상태 확인
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    vectorStore: boolean;
    ragChain: boolean;
    conversationalChain: boolean;
  }> {
    try {
      const vectorStoreReady = this.vectorStore !== null;
      const ragChainReady = true; // 기본 구현에서는 항상 true
      const conversationalChainReady = true; // 기본 구현에서는 항상 true

      const status = vectorStoreReady ? 'healthy' : 'unhealthy';

      return {
        status,
        vectorStore: vectorStoreReady,
        ragChain: ragChainReady,
        conversationalChain: conversationalChainReady,
      };
    } catch (error) {
      logger.error('LangChain health check failed:', error);
      return {
        status: 'unhealthy',
        vectorStore: false,
        ragChain: false,
        conversationalChain: false,
      };
    }
  }

  /**
   * 리소스 정리
   */
  async cleanup(): Promise<void> {
    try {
      this.vectorStore = null;
      logger.info('LangChain service cleaned up');
    } catch (error) {
      logger.error('Failed to cleanup LangChain service:', error);
    }
  }
}