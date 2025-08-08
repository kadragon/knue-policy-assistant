import { DEFAULT_VALUES, Language } from '../types';

export class TextUtils {
  // Split text into chunks for embedding
  static chunkText(text: string, maxChunkSize: number = DEFAULT_VALUES.MAX_CHUNK_SIZE, overlap: number = DEFAULT_VALUES.CHUNK_OVERLAP): string[] {
    if (text.length <= maxChunkSize) {
      return [text];
    }

    const chunks: string[] = [];
    let startIndex = 0;

    while (startIndex < text.length) {
      let endIndex = startIndex + maxChunkSize;
      
      // If we're not at the end, try to break at a natural boundary
      if (endIndex < text.length) {
        // Look for paragraph breaks first
        const paragraphBreak = text.lastIndexOf('\n\n', endIndex);
        if (paragraphBreak > startIndex) {
          endIndex = paragraphBreak;
        } else {
          // Look for sentence endings
          const sentenceBreak = text.lastIndexOf('. ', endIndex);
          if (sentenceBreak > startIndex) {
            endIndex = sentenceBreak + 1;
          } else {
            // Look for any line break
            const lineBreak = text.lastIndexOf('\n', endIndex);
            if (lineBreak > startIndex) {
              endIndex = lineBreak;
            }
          }
        }
      }

      const chunk = text.substring(startIndex, endIndex).trim();
      if (chunk.length > 0) {
        chunks.push(chunk);
      }

      // Move start index, accounting for overlap
      startIndex = Math.max(startIndex + 1, endIndex - overlap);
    }

    return chunks;
  }

  // Clean and normalize text
  static cleanText(text: string): string {
    return text
      .replace(/\r\n/g, '\n') // Normalize line endings
      .replace(/\n{3,}/g, '\n\n') // Collapse multiple newlines
      .replace(/[ \t]+/g, ' ') // Collapse multiple spaces/tabs
      .trim();
  }

  // Extract title from markdown content
  static extractTitle(content: string): string | undefined {
    const lines = content.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('# ') && trimmed.length > 2) {
        return trimmed.substring(2).trim();
      }
    }
    
    return undefined;
  }

  // Detect language from text content
  static detectLanguage(text: string): Language {
    // Count Korean characters
    const koreanChars = (text.match(/[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/g) || []).length;
    const totalChars = text.replace(/\s/g, '').length;
    
    // If more than 10% Korean characters, consider it Korean
    return totalChars > 0 && (koreanChars / totalChars) > 0.1 ? 'ko' : 'en';
  }

  // Truncate text to specified length
  static truncate(text: string, maxLength: number, suffix: string = '...'): string {
    if (text.length <= maxLength) {
      return text;
    }
    
    return text.substring(0, maxLength - suffix.length) + suffix;
  }
}