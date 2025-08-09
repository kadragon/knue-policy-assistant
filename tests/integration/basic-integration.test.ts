/**
 * 기본 통합 테스트
 */

import { TextUtils, ValidationUtils } from '../../src/utils';
import { DEFAULT_VALUES } from '../../src/types';

describe('Basic Integration Tests', () => {
  describe('Utils Integration', () => {
    it('should work together with text processing and validation', () => {
      const testText = '  Hello World  ';
      const cleanedText = TextUtils.cleanText(testText);
      const chunks = TextUtils.chunkText(cleanedText, 50, 10);
      
      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toMatch(/Hello World/);
    });

    it('should validate chat IDs with different formats', () => {
      const validChatIds = ['123456', '-987654321', '0'];
      const invalidChatIds = ['abc', '', 'test123'];
      
      validChatIds.forEach(chatId => {
        expect(ValidationUtils.isValidChatId(chatId)).toBe(true);
      });
      
      invalidChatIds.forEach(chatId => {
        expect(ValidationUtils.isValidChatId(chatId)).toBe(false);
      });
    });

    it('should handle language validation consistently', () => {
      expect(ValidationUtils.isValidLanguage(DEFAULT_VALUES.LANG)).toBe(true);
      expect(ValidationUtils.isValidLanguage('ko')).toBe(true);
      expect(ValidationUtils.isValidLanguage('en')).toBe(true);
      expect(ValidationUtils.isValidLanguage('invalid')).toBe(false);
    });
  });

  describe('Configuration Integration', () => {
    it('should have consistent default values', () => {
      expect(DEFAULT_VALUES.LANG).toBeDefined();
      expect(DEFAULT_VALUES.TOP_K).toBeGreaterThan(0);
      expect(DEFAULT_VALUES.MAX_CHUNK_SIZE).toBeGreaterThan(DEFAULT_VALUES.CHUNK_OVERLAP);
    });

    it('should have reasonable parameter relationships', () => {
      expect(DEFAULT_VALUES.RAG_TOP_K).toBeLessThanOrEqual(DEFAULT_VALUES.TOP_K);
      expect(DEFAULT_VALUES.MIN_SCORE).toBeLessThanOrEqual(1);
      expect(DEFAULT_VALUES.MIN_SCORE).toBeGreaterThan(0);
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle text utilities with edge cases', () => {
      // Empty text
      expect(TextUtils.cleanText('')).toBe('');
      expect(TextUtils.chunkText('', 100, 10)).toEqual(['']);
      
      // Very short text
      const shortText = 'Hi';
      expect(TextUtils.cleanText(shortText)).toBe(shortText);
      expect(TextUtils.chunkText(shortText, 100, 10)).toEqual([shortText]);
    });

    it('should handle validation edge cases', () => {
      // Edge cases for chat ID validation
      expect(ValidationUtils.isValidChatId('0')).toBe(true);
      expect(ValidationUtils.isValidChatId('-0')).toBe(true);
      
      // Edge cases for URL validation
      expect(ValidationUtils.isValidUrl('https://test.com')).toBe(true);
      expect(ValidationUtils.isValidUrl('not-a-url')).toBe(false);
    });
  });
});