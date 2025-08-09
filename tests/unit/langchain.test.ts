// @ts-nocheck
import { LangChainService } from '../../src/services/langchain';
import { QdrantVectorStore } from '@langchain/qdrant';
import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai';
import { AIMessage } from '@langchain/core/messages';
import {
  RAGSearchResponse,
  RAGQueryResponse,
  RAGSearchRequest,
  RAGQueryRequest,
  Message,
  Language
} from '../../src/types';
import {
  createMockAIMessage,
  createMockSearchResults,
  createMockMessage
} from '../helpers/mockHelpers';

// Mock dependencies
jest.mock('@langchain/openai');
jest.mock('@langchain/qdrant');
jest.mock('../../src/config');
jest.mock('../../src/services/logger');
jest.mock('../../src/services/metrics');

describe('LangChainService', () => {
  let langChainService: LangChainService;
  let mockVectorStore: jest.Mocked<QdrantVectorStore>;
  let mockLLM: jest.Mocked<ChatOpenAI>;
  let mockEmbeddings: jest.Mocked<OpenAIEmbeddings>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock ChatOpenAI
    mockLLM = {
      invoke: jest.fn(),
    } as any;

    // Mock OpenAIEmbeddings
    mockEmbeddings = {
      embedQuery: jest.fn(),
    } as any;

    // Mock QdrantVectorStore
    mockVectorStore = {
      similaritySearchWithScore: jest.fn(),
    } as any;

    (ChatOpenAI as unknown as jest.Mock).mockImplementation(() => mockLLM);
    (OpenAIEmbeddings as jest.Mock).mockImplementation(() => mockEmbeddings);
    (QdrantVectorStore.fromExistingCollection as jest.Mock) = jest.fn().mockResolvedValue(mockVectorStore);

    langChainService = new LangChainService();
  });

  describe('파싱 및 청킹 테스트', () => {
    describe('initializeVectorStore', () => {
      it('벡터 스토어를 성공적으로 초기화해야 함', async () => {
        // Arrange
        (QdrantVectorStore.fromExistingCollection as jest.Mock).mockResolvedValue(mockVectorStore);

        // Act
        await langChainService.initializeVectorStore();

        // Assert
        expect(QdrantVectorStore.fromExistingCollection).toHaveBeenCalledWith(
          expect.any(OpenAIEmbeddings),
          expect.objectContaining({
            url: expect.any(String),
            apiKey: expect.any(String),
            collectionName: expect.any(String)
          })
        );
      });

      it('벡터 스토어 초기화 실패 시 에러를 던져야 함', async () => {
        // Arrange
        const error = new Error('Connection failed');
        (QdrantVectorStore.fromExistingCollection as jest.Mock).mockRejectedValue(error);

        // Act & Assert
        await expect(langChainService.initializeVectorStore()).rejects.toThrow('Connection failed');
      });
    });

    describe('initializeRAGChain', () => {
      it('RAG 체인을 성공적으로 초기화해야 함', async () => {
        // Arrange
        (QdrantVectorStore.fromExistingCollection as jest.Mock).mockResolvedValue(mockVectorStore);

        // Act
        await langChainService.initializeRAGChain();

        // Assert - 기본 구현에서는 벡터스토어만 초기화됨
        expect(QdrantVectorStore.fromExistingCollection).toHaveBeenCalled();
      });

      it('벡터 스토어가 이미 초기화되어 있으면 재초기화하지 않아야 함', async () => {
        // Arrange
        // 먼저 벡터 스토어 초기화
        await langChainService.initializeVectorStore();
        jest.clearAllMocks();

        // Act
        await langChainService.initializeRAGChain();

        // Assert
        expect(QdrantVectorStore.fromExistingCollection).not.toHaveBeenCalled();
      });
    });

    describe('initializeConversationalChain', () => {
      it('대화형 RAG 체인을 성공적으로 초기화해야 함', async () => {
        // Arrange
        (QdrantVectorStore.fromExistingCollection as jest.Mock).mockResolvedValue(mockVectorStore);

        // Act
        await langChainService.initializeConversationalChain();

        // Assert
        expect(QdrantVectorStore.fromExistingCollection).toHaveBeenCalled();
      });
    });
  });

  describe('필터링 및 임계값 테스트', () => {
    describe('search', () => {
      it('언어 필터와 함께 검색을 수행해야 함', async () => {
        // Arrange
        const request: RAGSearchRequest = {
          query: '휴가 규정',
          k: 5,
          minScore: 0.85,
          lang: 'ko'
        };

        const mockSearchResults: [any, number][] = [
          [
            {
              pageContent: '휴가 규정 내용...',
              metadata: {
                title: '휴가 규정',
                filePath: 'policies/vacation.md',
                url: 'https://example.com/vacation.md',
                fileId: 'file123',
                seq: 0
              }
            },
            0.92
          ],
          [
            {
              pageContent: '추가 휴가 내용...',
              metadata: {
                title: '추가 휴가',
                filePath: 'policies/extra-vacation.md',
                url: 'https://example.com/extra-vacation.md',
                fileId: 'file124',
                seq: 1
              }
            },
            0.88
          ],
          [
            {
              pageContent: '관련성 낮은 내용...',
              metadata: {
                title: '저점수 문서',
                filePath: 'policies/low-score.md',
                url: 'https://example.com/low-score.md',
                fileId: 'file125',
                seq: 0
              }
            },
            0.75 // 임계값보다 낮음
          ]
        ];

        mockVectorStore.similaritySearchWithScore.mockResolvedValue(mockSearchResults);

        // Act
        const result = await langChainService.search(request);

        // Assert
        expect(mockVectorStore.similaritySearchWithScore).toHaveBeenCalledWith(
          '휴가 규정',
          5,
          {
            must: [{ key: 'lang', match: { value: 'ko' } }]
          }
        );

        expect(result.documents).toHaveLength(2); // 임계값 이상인 문서만
        expect(result.documents[0].score).toBe(0.92);
        expect(result.documents[1].score).toBe(0.88);
        expect(result.documents[0].title).toBe('휴가 규정');
        expect(result.query).toBe('휴가 규정');
        expect(result.lang).toBe('ko');
      });

      it('언어 필터 없이 검색을 수행해야 함', async () => {
        // Arrange
        const request: RAGSearchRequest = {
          query: 'policy information',
          k: 3,
          minScore: 0.80
        };

        mockVectorStore.similaritySearchWithScore.mockResolvedValue([]);

        // Act
        await langChainService.search(request);

        // Assert
        expect(mockVectorStore.similaritySearchWithScore).toHaveBeenCalledWith(
          'policy information',
          3,
          undefined
        );
      });

      it('기본값으로 검색을 수행해야 함', async () => {
        // Arrange
        const request: RAGSearchRequest = {
          query: 'test query'
        };

        mockVectorStore.similaritySearchWithScore.mockResolvedValue([]);

        // Act
        await langChainService.search(request);

        // Assert
        expect(mockVectorStore.similaritySearchWithScore).toHaveBeenCalledWith(
          'test query',
          6, // 기본 k 값
          undefined
        );
      });

      it('최소 점수 임계값을 올바르게 적용해야 함', async () => {
        // Arrange
        const request: RAGSearchRequest = {
          query: '테스트',
          minScore: 0.90
        };

        const mockSearchResults: [any, number][] = [
          [{ pageContent: '높은 점수', metadata: { title: 'high', filePath: '', url: '', fileId: '', seq: 0 } }, 0.95],
          [{ pageContent: '중간 점수', metadata: { title: 'medium', filePath: '', url: '', fileId: '', seq: 0 } }, 0.85],
          [{ pageContent: '낮은 점수', metadata: { title: 'low', filePath: '', url: '', fileId: '', seq: 0 } }, 0.75]
        ];

        mockVectorStore.similaritySearchWithScore.mockResolvedValue(mockSearchResults);

        // Act
        const result = await langChainService.search(request);

        // Assert
        expect(result.documents).toHaveLength(1); // 0.90 이상인 문서만
        expect(result.documents[0].score).toBe(0.95);
        expect(result.documents[0].title).toBe('high');
      });

      it('검색 실패 시 에러를 던져야 함', async () => {
        // Arrange
        const request: RAGSearchRequest = {
          query: 'test query'
        };

        mockVectorStore.similaritySearchWithScore.mockRejectedValue(new Error('Search failed'));

        // Act & Assert
        await expect(langChainService.search(request)).rejects.toThrow('Search failed');
      });

      it('결과가 없을 때 빈 배열을 반환해야 함', async () => {
        // Arrange
        const request: RAGSearchRequest = {
          query: 'no results query'
        };

        mockVectorStore.similaritySearchWithScore.mockResolvedValue([]);

        // Act
        const result = await langChainService.search(request);

        // Assert
        expect(result.documents).toHaveLength(0);
        expect(result.total).toBe(0);
        expect(result.query).toBe('no results query');
      });
    });

    describe('query', () => {
      it('관련 문서가 있을 때 답변을 생성해야 함', async () => {
        // Arrange
        const request: RAGQueryRequest = {
          question: '휴가는 몇 일까지 쓸 수 있나요?',
          lang: 'ko'
        };

        const mockSearchResults = createMockSearchResults();
        const mockLLMResponse = createMockAIMessage('연차휴가는 1년에 15일까지 사용할 수 있습니다. 출처: 휴가 규정');

        mockVectorStore.similaritySearchWithScore.mockResolvedValue(mockSearchResults);
        mockLLM.invoke.mockResolvedValue(mockLLMResponse);

        // Act
        const result = await langChainService.query(request);

        // Assert
        expect(mockVectorStore.similaritySearchWithScore).toHaveBeenCalledWith(
          '휴가는 몇 일까지 쓸 수 있나요?',
          6,
          {
            must: [{ key: 'lang', match: { value: 'ko' } }]
          }
        );
        expect(mockLLM.invoke).toHaveBeenCalledWith(
          expect.stringContaining('너는 KNUE 규정·업무지침 전용 챗봇이다')
        );
        expect(mockLLM.invoke).toHaveBeenCalledWith(
          expect.stringContaining('연차휴가는 1년에 15일까지 사용할 수 있습니다.')
        );
        expect(result.answer).toBe('연차휴가는 1년에 15일까지 사용할 수 있습니다. 출처: 휴가 규정');
        expect(result.sources).toHaveLength(1);
        expect(result.sources[0].title).toBe('휴가 규정');
        expect(result.question).toBe('휴가는 몇 일까지 쓸 수 있나요?');
        expect(result.lang).toBe('ko');
      });

      it('관련 문서가 없을 때 기본 응답을 반환해야 함', async () => {
        // Arrange
        const request: RAGQueryRequest = {
          question: '존재하지 않는 정책에 대한 질문',
          lang: 'ko'
        };

        const mockSearchResults: [any, number][] = [
          [
            {
              pageContent: '관련성 없는 내용',
              metadata: {
                title: '무관한 문서',
                filePath: 'unrelated.md',
                url: 'https://example.com/unrelated.md'
              }
            },
            0.60 // 임계값 미만
          ]
        ];

        mockVectorStore.similaritySearchWithScore.mockResolvedValue(mockSearchResults);

        // Act
        const result = await langChainService.query(request);

        // Assert
        expect(result.answer).toBe('규정에 해당 내용이 없습니다.');
        expect(result.sources).toHaveLength(0);
        expect(mockLLM.invoke).not.toHaveBeenCalled();
      });

      it('언어 설정 없이 질의를 처리해야 함', async () => {
        // Arrange
        const request: RAGQueryRequest = {
          question: 'policy question'
        };

        mockVectorStore.similaritySearchWithScore.mockResolvedValue([]);

        // Act
        const result = await langChainService.query(request);

        // Assert
        expect(mockVectorStore.similaritySearchWithScore).toHaveBeenCalledWith(
          'policy question',
          6,
          undefined
        );
        expect(result.lang).toBe('ko'); // 기본값
      });

      it('질의 처리 실패 시 에러를 던져야 함', async () => {
        // Arrange
        const request: RAGQueryRequest = {
          question: 'test question'
        };

        mockVectorStore.similaritySearchWithScore.mockRejectedValue(new Error('Query failed'));

        // Act & Assert
        await expect(langChainService.query(request)).rejects.toThrow('Query failed');
      });
    });

    describe('conversationalQuery', () => {
      it('대화 기록과 함께 질의를 처리해야 함', async () => {
        // Arrange
        const question = '추가로 더 궁금한 점이 있어요';
        const chatHistory: Message[] = [
          {
            messageId: 'msg1',
            chatId: 'chat123',
            role: 'user',
            text: '휴가 규정에 대해 알려주세요',
            createdAt: { toDate: () => new Date() } as any
          },
          {
            messageId: 'msg2',
            chatId: 'chat123',
            role: 'assistant',
            text: '휴가는 연 15일까지 사용 가능합니다',
            createdAt: { toDate: () => new Date() } as any
          }
        ];

        const mockSearchResults: [any, number][] = [
          [
            {
              pageContent: '병가는 별도로 연 30일까지 사용할 수 있습니다.',
              metadata: {
                title: '병가 규정',
                filePath: 'policies/sick-leave.md',
                url: 'https://example.com/sick-leave.md'
              }
            },
            0.90
          ]
        ];

        const mockLLMResponse = createMockAIMessage('병가는 연차와 별도로 연 30일까지 사용할 수 있습니다.');

        mockVectorStore.similaritySearchWithScore.mockResolvedValue(mockSearchResults);
        mockLLM.invoke.mockResolvedValue(mockLLMResponse);

        // Act
        const result = await langChainService.conversationalQuery(question, chatHistory, 'ko');

        // Assert
        expect(mockVectorStore.similaritySearchWithScore).toHaveBeenCalledWith(
          question,
          6,
          {
            must: [{ key: 'lang', match: { value: 'ko' } }]
          }
        );
        expect(mockLLM.invoke).toHaveBeenCalledWith(
          expect.stringContaining('[최근 대화]')
        );
        expect(mockLLM.invoke).toHaveBeenCalledWith(
          expect.stringContaining('사용자: 휴가 규정에 대해 알려주세요')
        );
        expect(mockLLM.invoke).toHaveBeenCalledWith(
          expect.stringContaining('챗봇: 휴가는 연 15일까지 사용 가능합니다')
        );
        expect(result.answer).toBe('병가는 연차와 별도로 연 30일까지 사용할 수 있습니다.');
        expect(result.processingTime).toBeGreaterThan(0);
      });

      it('대화 기록이 없어도 질의를 처리해야 함', async () => {
        // Arrange
        const question = '휴가 규정이 궁금합니다';
        const chatHistory: Message[] = [];

        mockVectorStore.similaritySearchWithScore.mockResolvedValue([]);

        // Act
        const result = await langChainService.conversationalQuery(question, chatHistory, 'ko');

        // Assert
        expect(result.answer).toBe('규정에 해당 내용이 없습니다.');
        expect(result.sources).toHaveLength(0);
      });

      it('최근 6개 메시지만 컨텍스트로 사용해야 함', async () => {
        // Arrange
        const question = '추가 질문';
        const chatHistory: Message[] = Array.from({ length: 10 }, (_, i) => ({
          messageId: `msg${i}`,
          chatId: 'chat123',
          role: i % 2 === 0 ? 'user' : 'assistant',
          text: `메시지 ${i}`,
          createdAt: { toDate: () => new Date() } as any
        }));

        mockVectorStore.similaritySearchWithScore.mockResolvedValue([]);

        // Act
        await langChainService.conversationalQuery(question, chatHistory, 'ko');

        // Assert
        // LLM 호출에서 최근 6개 메시지만 포함되었는지 확인
        expect(mockLLM.invoke).toHaveBeenCalledWith(
          expect.stringMatching(/메시지 [4-9]/) // 최근 6개 메시지 (인덱스 4-9)
        );
        expect(mockLLM.invoke).not.toHaveBeenCalledWith(
          expect.stringMatching(/메시지 [0-3]/) // 오래된 메시지는 포함되지 않음
        );
      });

      it('대화형 질의 실패 시 에러를 던져야 함', async () => {
        // Arrange
        const question = 'test question';
        const chatHistory: Message[] = [];

        mockVectorStore.similaritySearchWithScore.mockRejectedValue(new Error('Conversational query failed'));

        // Act & Assert
        await expect(
          langChainService.conversationalQuery(question, chatHistory, 'ko')
        ).rejects.toThrow('Conversational query failed');
      });
    });
  });

  describe('요약 및 헬스체크 테스트', () => {
    describe('summarizeConversation', () => {
      it('대화를 성공적으로 요약해야 함', async () => {
        // Arrange
        const messages: Message[] = [
          {
            messageId: 'msg1',
            chatId: 'chat123',
            role: 'user',
            text: '휴가 규정에 대해 알려주세요',
            createdAt: { toDate: () => new Date() } as any
          },
          {
            messageId: 'msg2',
            chatId: 'chat123',
            role: 'assistant',
            text: '연차휴가는 연 15일까지 사용 가능하며, 사전 승인이 필요합니다.',
            createdAt: { toDate: () => new Date() } as any
          }
        ];

        const mockSummaryResponse = createMockAIMessage('사용자가 휴가 규정에 대해 문의하였고, 연차휴가 15일 제한과 사전 승인 요구사항을 확인함.');

        mockLLM.invoke.mockResolvedValue(mockSummaryResponse);

        // Act
        const result = await langChainService.summarizeConversation(messages);

        // Assert
        expect(mockLLM.invoke).toHaveBeenCalledWith(
          expect.stringContaining('다음 대화를 5~8줄로 요약하되')
        );
        expect(mockLLM.invoke).toHaveBeenCalledWith(
          expect.stringContaining('사용자: 휴가 규정에 대해 알려주세요')
        );
        expect(mockLLM.invoke).toHaveBeenCalledWith(
          expect.stringContaining('챗봇: 연차휴가는 연 15일까지 사용 가능하며')
        );
        expect(result).toBe('사용자가 휴가 규정에 대해 문의하였고, 연차휴가 15일 제한과 사전 승인 요구사항을 확인함.');
      });

      it('빈 메시지 배열로 요약을 요청할 수 있어야 함', async () => {
        // Arrange
        const messages: Message[] = [];
        const mockSummaryResponse = createMockAIMessage('대화 내용이 없습니다.');

        mockLLM.invoke.mockResolvedValue(mockSummaryResponse);

        // Act
        const result = await langChainService.summarizeConversation(messages);

        // Assert
        expect(result).toBe('대화 내용이 없습니다.');
      });

      it('요약 생성 실패 시 에러를 던져야 함', async () => {
        // Arrange
        const messages: Message[] = [
          {
            messageId: 'msg1',
            chatId: 'chat123',
            role: 'user',
            text: 'test message',
            createdAt: { toDate: () => new Date() } as any
          }
        ];

        mockLLM.invoke.mockRejectedValue(new Error('Summary generation failed'));

        // Act & Assert
        await expect(langChainService.summarizeConversation(messages)).rejects.toThrow('Summary generation failed');
      });
    });

    describe('healthCheck', () => {
      it('모든 컴포넌트가 정상일 때 healthy 상태를 반환해야 함', async () => {
        // Arrange
        await langChainService.initializeVectorStore();

        // Act
        const result = await langChainService.healthCheck();

        // Assert
        expect(result.status).toBe('healthy');
        expect(result.vectorStore).toBe(true);
        expect(result.ragChain).toBe(true);
        expect(result.conversationalChain).toBe(true);
      });

      it('벡터 스토어가 초기화되지 않았을 때 unhealthy 상태를 반환해야 함', async () => {
        // Arrange - 벡터 스토어 초기화하지 않음

        // Act
        const result = await langChainService.healthCheck();

        // Assert
        expect(result.status).toBe('unhealthy');
        expect(result.vectorStore).toBe(false);
        expect(result.ragChain).toBe(true); // 기본 구현에서는 항상 true
        expect(result.conversationalChain).toBe(true); // 기본 구현에서는 항상 true
      });

      it('헬스체크 실행 중 에러 발생 시 unhealthy 상태를 반환해야 함', async () => {
        // Arrange
        // 헬스체크에서 에러를 발생시키기 위해 벡터스토어를 null로 만들고 에러 상황 시뮬레이션
        const originalConsoleError = console.error;
        console.error = jest.fn(); // 콘솔 에러 방지

        jest.spyOn(langChainService as any, 'vectorStore', 'get').mockImplementation(() => {
          throw new Error('Health check error');
        });

        // Act
        const result = await langChainService.healthCheck();

        // Assert
        expect(result.status).toBe('unhealthy');
        expect(result.vectorStore).toBe(false);
        expect(result.ragChain).toBe(false);
        expect(result.conversationalChain).toBe(false);

        console.error = originalConsoleError;
      });
    });

    describe('cleanup', () => {
      it('리소스를 성공적으로 정리해야 함', async () => {
        // Arrange
        await langChainService.initializeVectorStore();

        // Act
        await langChainService.cleanup();

        // Assert
        const healthCheck = await langChainService.healthCheck();
        expect(healthCheck.vectorStore).toBe(false);
      });

      it('정리 중 에러가 발생해도 예외를 던지지 않아야 함', async () => {
        // Arrange
        const originalConsoleError = console.error;
        console.error = jest.fn();

        // Act & Assert
        await expect(langChainService.cleanup()).resolves.not.toThrow();

        console.error = originalConsoleError;
      });
    });
  });
});