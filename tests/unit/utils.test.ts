/**
 * 유틸리티 함수 테스트
 */

import { TextUtils, ValidationUtils, DateUtils, ErrorUtils } from '../../src/utils';

describe('Utils Tests', () => {
  describe('TextUtils', () => {
    it('should chunk text properly', () => {
      const text = 'A'.repeat(1000); // 1000자 텍스트
      const chunks = TextUtils.chunkText(text, 300, 50);
      
      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks[0]).toHaveLength(300);
    });

    it('should handle short text', () => {
      const text = 'Short text';
      const chunks = TextUtils.chunkText(text, 300, 50);
      
      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toBe(text);
    });

    it('should clean text', () => {
      const dirtyText = '  Hello\n\nWorld  \n  ';
      const cleanedText = TextUtils.cleanText(dirtyText);
      
      expect(cleanedText).toMatch(/Hello/);
      expect(cleanedText).toMatch(/World/);
      expect(cleanedText).not.toMatch(/^\s+/); // 앞에 공백 없음
      expect(cleanedText).not.toMatch(/\s+$/); // 뒤에 공백 없음
    });

    it('should truncate text', () => {
      const longText = 'A'.repeat(1000);
      const truncated = TextUtils.truncate(longText, 100);
      
      expect(truncated.length).toBeLessThanOrEqual(103); // 100 + '...'
      expect(truncated).toMatch(/\.\.\.$/);
    });
  });

  describe('ValidationUtils', () => {
    it('should validate chat IDs', () => {
      expect(ValidationUtils.isValidChatId('123456789')).toBe(true);
      expect(ValidationUtils.isValidChatId('-123456789')).toBe(true);
      expect(ValidationUtils.isValidChatId('')).toBe(false);
      expect(ValidationUtils.isValidChatId('abc')).toBe(false);
    });

    it('should validate language codes', () => {
      expect(ValidationUtils.isValidLanguage('ko')).toBe(true);
      expect(ValidationUtils.isValidLanguage('en')).toBe(true);
      expect(ValidationUtils.isValidLanguage('fr')).toBe(false);
      expect(ValidationUtils.isValidLanguage('')).toBe(false);
    });

    it('should validate URLs', () => {
      expect(ValidationUtils.isValidUrl('https://example.com')).toBe(true);
      expect(ValidationUtils.isValidUrl('http://test.org')).toBe(true);
      expect(ValidationUtils.isValidUrl('invalid-url')).toBe(false);
      expect(ValidationUtils.isValidUrl('')).toBe(false);
    });
  });

  describe('DateUtils', () => {
    it('should format timestamp', () => {
      const date = new Date('2024-01-01T00:00:00Z');
      const formatted = DateUtils.formatTimestamp(date);
      
      expect(formatted).toBe('2024-01-01T00:00:00.000Z');
    });

    it('should get timestamp', () => {
      const timestamp = DateUtils.getTimestamp();
      
      expect(typeof timestamp).toBe('number');
      expect(timestamp).toBeGreaterThan(0);
    });

    it('should calculate time difference', () => {
      const start = new Date('2024-01-01T00:00:00Z');
      const end = new Date('2024-01-01T00:00:01Z');
      const diff = DateUtils.timeDiff(start, end);
      
      expect(diff).toBe(1000); // 1초 = 1000ms
    });
  });

  describe('ErrorUtils', () => {
    it('should get error message from Error object', () => {
      const error = new Error('Test error');
      const message = ErrorUtils.getErrorMessage(error);
      
      expect(message).toBe('Test error');
    });

    it('should get error message from string', () => {
      const message = ErrorUtils.getErrorMessage('String error');
      
      expect(message).toBe('String error');
    });

    it('should handle unknown error types', () => {
      const message = ErrorUtils.getErrorMessage({ unknown: true });
      
      expect(message).toBe('Unknown error occurred');
    });
  });
});