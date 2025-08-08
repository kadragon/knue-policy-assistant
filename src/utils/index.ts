import { Language } from '../types';

export { TextUtils } from './text';
export { HashUtils } from './hash';

// Date/time utilities
export class DateUtils {
  static formatTimestamp(date: Date = new Date()): string {
    return date.toISOString();
  }

  static getTimestamp(): number {
    return Date.now();
  }

  static timeDiff(start: Date | number, end: Date | number = Date.now()): number {
    const startTime = typeof start === 'number' ? start : start.getTime();
    const endTime = typeof end === 'number' ? end : end.getTime();
    return endTime - startTime;
  }
}

// Validation utilities  
export class ValidationUtils {
  static isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  static isValidChatId(chatId: string): boolean {
    return /^-?\d+$/.test(chatId);
  }

  static isValidLanguage(lang: string): lang is Language {
    return lang === 'ko' || lang === 'en';
  }
}

// Error utilities
export class ErrorUtils {
  static getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'string') {
      return error;
    }
    return 'Unknown error occurred';
  }

  static logError(error: unknown, context: string): void {
    const message = this.getErrorMessage(error);
    console.error(`[${context}] Error: ${message}`, error);
  }
}