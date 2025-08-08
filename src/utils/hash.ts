import crypto from 'crypto';

export class HashUtils {
  // Generate MD5 hash
  static md5(text: string): string {
    return crypto.createHash('md5').update(text).digest('hex');
  }

  // Generate SHA256 hash
  static sha256(text: string): string {
    return crypto.createHash('sha256').update(text).digest('hex');
  }

  // Generate short hash (first 8 characters of SHA256)
  static shortHash(text: string): string {
    return this.sha256(text).substring(0, 8);
  }

  // Generate unique ID from multiple inputs
  static generateId(...inputs: string[]): string {
    const combined = inputs.join('|');
    return this.sha256(combined);
  }
}