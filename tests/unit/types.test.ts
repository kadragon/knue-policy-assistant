/**
 * Types 및 상수 테스트
 */

import { DEFAULT_VALUES, Language, MessageRole } from '../../src/types';

describe('Types Tests', () => {
  describe('DEFAULT_VALUES', () => {
    it('should have expected default values', () => {
      expect(DEFAULT_VALUES.LANG).toBe('ko');
      expect(DEFAULT_VALUES.MAX_CHUNK_SIZE).toBeGreaterThan(0);
      expect(DEFAULT_VALUES.CHUNK_OVERLAP).toBeGreaterThan(0);
      expect(DEFAULT_VALUES.TOP_K).toBeGreaterThan(0);
      expect(DEFAULT_VALUES.MIN_SCORE).toBeGreaterThan(0);
    });

    it('should have reasonable token limits', () => {
      expect(DEFAULT_VALUES.MAX_MEMORY_TOKENS).toBeGreaterThan(100);
      expect(DEFAULT_VALUES.MAX_RECENT_MESSAGES).toBeGreaterThan(0);
      expect(DEFAULT_VALUES.RESPONSE_TIMEOUT).toBeGreaterThan(1000);
    });

    it('should have reasonable RAG parameters', () => {
      expect(DEFAULT_VALUES.RAG_TOP_K).toBeGreaterThan(0);
      expect(DEFAULT_VALUES.RAG_TOP_K).toBeLessThanOrEqual(20);
      expect(DEFAULT_VALUES.EMBEDDING_BATCH_SIZE).toBeGreaterThan(0);
    });
  });

  describe('Language type', () => {
    it('should accept valid language codes', () => {
      const koLang: Language = 'ko';
      const enLang: Language = 'en';
      
      expect(koLang).toBe('ko');
      expect(enLang).toBe('en');
    });
  });

  describe('MessageRole type', () => {
    it('should accept valid message roles', () => {
      const userRole: MessageRole = 'user';
      const assistantRole: MessageRole = 'assistant';
      
      expect(userRole).toBe('user');
      expect(assistantRole).toBe('assistant');
    });
  });
});