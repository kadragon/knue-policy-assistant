import { QdrantClient } from '@qdrant/js-client-rest';
import { 
  QdrantPayload, 
  SearchResult, 
  RAGSearchResponse, 
  SearchContext,
  DEFAULT_VALUES 
} from '../types';
import { ServiceError } from '../types';
import { appConfig } from '../config';

export class QdrantService {
  private client: QdrantClient;
  private collectionName: string;

  constructor() {
    this.client = new QdrantClient({
      url: appConfig.QDRANT_URL,
      apiKey: appConfig.QDRANT_API_KEY,
    });
    this.collectionName = appConfig.COLLECTION_NAME;
  }

  async initializeCollection(): Promise<void> {
    try {
      // Check if collection exists
      const collections = await this.client.getCollections();
      const collectionExists = collections.collections.some(
        collection => collection.name === this.collectionName
      );

      if (!collectionExists) {
        // Create collection with text-embedding-3-small dimensions (1536)
        await this.client.createCollection(this.collectionName, {
          vectors: {
            size: 1536,
            distance: 'Cosine'
          },
          optimizers_config: {
            default_segment_number: 2
          },
          replication_factor: 1
        });
        
        // Create payload indexes for efficient filtering
        await this.createPayloadIndexes();
      }
    } catch (error) {
      throw new ServiceError(
        'Failed to initialize Qdrant collection',
        'qdrant',
        'INIT_COLLECTION_ERROR',
        500,
        error
      );
    }
  }

  async createPayloadIndexes(): Promise<void> {
    try {
      const indexes = [
        { field: 'repoId', type: 'keyword' },
        { field: 'fileId', type: 'keyword' },
        { field: 'lang', type: 'keyword' },
        { field: 'commit', type: 'keyword' }
      ];

      for (const index of indexes) {
        await this.client.createPayloadIndex(this.collectionName, {
          field_name: index.field,
          field_schema: index.type
        });
      }
    } catch (error) {
      throw new ServiceError(
        'Failed to create payload indexes',
        'qdrant',
        'CREATE_INDEX_ERROR',
        500,
        error
      );
    }
  }

  async upsertPoints(points: Array<{
    id: string;
    vector: number[];
    payload: QdrantPayload;
  }>): Promise<void> {
    try {
      await this.client.upsert(this.collectionName, {
        wait: true,
        points: points.map(point => ({
          id: point.id,
          vector: point.vector,
          payload: point.payload
        }))
      });
    } catch (error) {
      throw new ServiceError(
        'Failed to upsert points to Qdrant',
        'qdrant',
        'UPSERT_ERROR',
        500,
        error
      );
    }
  }

  async deletePoints(pointIds: string[]): Promise<void> {
    try {
      if (pointIds.length === 0) return;
      
      await this.client.delete(this.collectionName, {
        wait: true,
        points: pointIds
      });
    } catch (error) {
      throw new ServiceError(
        'Failed to delete points from Qdrant',
        'qdrant',
        'DELETE_ERROR',
        500,
        error
      );
    }
  }

  async deletePointsByFilter(filter: Record<string, any>): Promise<void> {
    try {
      await this.client.delete(this.collectionName, {
        wait: true,
        filter: this.buildQdrantFilter(filter)
      });
    } catch (error) {
      throw new ServiceError(
        'Failed to delete points by filter',
        'qdrant',
        'DELETE_FILTER_ERROR',
        500,
        error
      );
    }
  }

  async search(context: SearchContext, queryVector: number[]): Promise<RAGSearchResponse> {
    const startTime = Date.now();
    
    try {
      const topK = context.topK || DEFAULT_VALUES.TOP_K;
      const minScore = context.minScore || DEFAULT_VALUES.MIN_SCORE;
      
      const searchResult = await this.client.search(this.collectionName, {
        vector: queryVector,
        limit: topK,
        score_threshold: minScore,
        filter: context.filters ? this.buildQdrantFilter(context.filters) : undefined,
        with_payload: true,
        with_vector: false
      });

      const results: SearchResult[] = searchResult.map(point => ({
        id: point.id,
        score: point.score,
        payload: point.payload as unknown as QdrantPayload,
        vector: point.vector as number[] | undefined
      }));

      // Apply MMR (Maximal Marginal Relevance) for diversity if we have multiple results
      const diversifiedResults = this.applyMMR(results, 0.7); // 70% relevance, 30% diversity

      const processingTime = Date.now() - startTime;

      return {
        results: diversifiedResults,
        totalResults: results.length,
        processingTime,
        usedQuery: context.query
      };
    } catch (error) {
      throw new ServiceError(
        'Failed to search in Qdrant',
        'qdrant',
        'SEARCH_ERROR',
        500,
        error
      );
    }
  }

  async scrollPoints(filter?: Record<string, any>, limit: number = 100): Promise<SearchResult[]> {
    try {
      const scrollResult = await this.client.scroll(this.collectionName, {
        filter: filter ? this.buildQdrantFilter(filter) : undefined,
        limit,
        with_payload: true,
        with_vector: false
      });

      return scrollResult.points.map(point => ({
        id: point.id,
        score: 1.0, // scroll doesn't provide scores
        payload: point.payload as unknown as QdrantPayload
      }));
    } catch (error) {
      throw new ServiceError(
        'Failed to scroll points in Qdrant',
        'qdrant',
        'SCROLL_ERROR',
        500,
        error
      );
    }
  }

  async getCollectionInfo(): Promise<any> {
    try {
      return await this.client.getCollection(this.collectionName);
    } catch (error) {
      throw new ServiceError(
        'Failed to get collection info',
        'qdrant',
        'GET_INFO_ERROR',
        500,
        error
      );
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const collections = await this.client.getCollections();
      return collections.collections.some(
        collection => collection.name === this.collectionName
      );
    } catch {
      return false;
    }
  }

  // Helper methods

  private buildQdrantFilter(filters: Record<string, any>): any {
    const must: any[] = [];

    for (const [key, value] of Object.entries(filters)) {
      if (Array.isArray(value)) {
        // Array values use 'any' condition (OR)
        must.push({
          key,
          any: value
        });
      } else {
        // Single values use 'match' condition
        must.push({
          key,
          match: { value }
        });
      }
    }

    return must.length > 1 ? { must } : must[0] || {};
  }

  private applyMMR(results: SearchResult[], lambda: number = 0.7): SearchResult[] {
    if (results.length <= 1) return results;

    const selected: SearchResult[] = [];
    const candidates = [...results];

    // Always select the highest scoring result first
    const firstResult = candidates.shift()!;
    selected.push(firstResult);

    // Select remaining results using MMR
    while (candidates.length > 0 && selected.length < DEFAULT_VALUES.TOP_K) {
      let maxScore = -Infinity;
      let maxIndex = -1;

      for (let i = 0; i < candidates.length; i++) {
        const candidate = candidates[i];
        const relevanceScore = candidate.score;
        
        // Calculate maximum similarity to already selected documents
        let maxSimilarity = 0;
        for (const selectedResult of selected) {
          const similarity = this.calculateTextSimilarity(
            candidate.payload.title || '',
            selectedResult.payload.title || ''
          );
          maxSimilarity = Math.max(maxSimilarity, similarity);
        }

        // MMR score: λ * relevance - (1-λ) * max_similarity
        const mmrScore = lambda * relevanceScore - (1 - lambda) * maxSimilarity;
        
        if (mmrScore > maxScore) {
          maxScore = mmrScore;
          maxIndex = i;
        }
      }

      if (maxIndex >= 0) {
        const candidate = candidates.splice(maxIndex, 1)[0];
        if (candidate) {
          selected.push(candidate);
        }
      }
    }

    return selected;
  }

  private calculateTextSimilarity(text1: string, text2: string): number {
    // Simple Jaccard similarity for text diversity
    const set1 = new Set(text1.toLowerCase().split(/\s+/));
    const set2 = new Set(text2.toLowerCase().split(/\s+/));
    
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    
    return union.size === 0 ? 0 : intersection.size / union.size;
  }

  // Utility methods for point management
  generatePointId(fileId: string, chunkSeq: number): string {
    return `${fileId}_${chunkSeq}`;
  }

  async countPoints(filter?: Record<string, any>): Promise<number> {
    try {
      const result = await this.client.count(this.collectionName, {
        filter: filter ? this.buildQdrantFilter(filter) : undefined
      });
      return result.count;
    } catch (error) {
      throw new ServiceError(
        'Failed to count points in Qdrant',
        'qdrant',
        'COUNT_ERROR',
        500,
        error
      );
    }
  }

  async optimize(): Promise<void> {
    try {
      await this.client.createSnapshot(this.collectionName);
    } catch (error) {
      throw new ServiceError(
        'Failed to optimize Qdrant collection',
        'qdrant',
        'OPTIMIZE_ERROR',
        500,
        error
      );
    }
  }
}