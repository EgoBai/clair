/**
 * Encrypted Storage
 * 加密存储 - 本地存储加密工具
 */

// Simple obfuscation (not true encryption, but prevents casual reading)
// For real encryption, use Web Crypto API

function simpleEncrypt(text: string, key: string): string {
  let result = '';
  for (let i = 0; i < text.length; i++) {
    result += String.fromCharCode(
      text.charCodeAt(i) ^ key.charCodeAt(i % key.length)
    );
  }
  return btoa(result);
}

function simpleDecrypt(encoded: string, key: string): string {
  const text = atob(encoded);
  let result = '';
  for (let i = 0; i < text.length; i++) {
    result += String.fromCharCode(
      text.charCodeAt(i) ^ key.charCodeAt(i % key.length)
    );
  }
  return result;
}

export interface EncryptedStorageConfig {
  prefix: string;
  secretKey: string;
}

export class EncryptedStorage {
  private prefix: string;
  private secretKey: string;

  constructor(config: EncryptedStorageConfig) {
    this.prefix = config.prefix;
    this.secretKey = config.secretKey;
  }

  private getFullKey(key: string): string {
    return `${this.prefix}${key}`;
  }

  set<T>(key: string, value: T): boolean {
    try {
      const json = JSON.stringify(value);
      const encrypted = simpleEncrypt(json, this.secretKey);
      localStorage.setItem(this.getFullKey(key), encrypted);
      return true;
    } catch {
      return false;
    }
  }

  get<T>(key: string): T | null {
    try {
      const encrypted = localStorage.getItem(this.getFullKey(key));
      if (!encrypted) return null;
      const json = simpleDecrypt(encrypted, this.secretKey);
      return JSON.parse(json) as T;
    } catch {
      return null;
    }
  }

  remove(key: string): void {
    localStorage.removeItem(this.getFullKey(key));
  }

  has(key: string): boolean {
    return localStorage.getItem(this.getFullKey(key)) !== null;
  }

  clear(): void {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(this.prefix)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
  }

  keys(): string[] {
    const result: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(this.prefix)) {
        result.push(key.slice(this.prefix.length));
      }
    }
    return result;
  }

  size(): number {
    return this.keys().length;
  }
}

/**
 * Session Storage wrapper with expiry
 */
export interface SessionEntry<T> {
  value: T;
  expiresAt: number;
}

export class SessionStorage {
  private prefix: string;

  constructor(prefix: string = 'a_stock_session_') {
    this.prefix = prefix;
  }

  set<T>(key: string, value: T, ttlMs: number = 30 * 60 * 1000): void {
    const entry: SessionEntry<T> = {
      value,
      expiresAt: Date.now() + ttlMs,
    };
    sessionStorage.setItem(this.prefix + key, JSON.stringify(entry));
  }

  get<T>(key: string): T | null {
    try {
      const raw = sessionStorage.getItem(this.prefix + key);
      if (!raw) return null;
      const entry: SessionEntry<T> = JSON.parse(raw);
      if (Date.now() > entry.expiresAt) {
        sessionStorage.removeItem(this.prefix + key);
        return null;
      }
      return entry.value;
    } catch {
      return null;
    }
  }

  remove(key: string): void {
    sessionStorage.removeItem(this.prefix + key);
  }

  clearExpired(): number {
    let cleared = 0;
    const now = Date.now();
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(this.prefix)) {
        try {
          const entry = JSON.parse(sessionStorage.getItem(key)!);
          if (now > entry.expiresAt) {
            sessionStorage.removeItem(key);
            cleared++;
          }
        } catch {
          sessionStorage.removeItem(key);
          cleared++;
        }
      }
    }
    return cleared;
  }
}

export const encryptedStorage = new EncryptedStorage({
  prefix: 'a_stock_enc_',
  secretKey: 'a-stock-2024',
});

export const sessionStore = new SessionStorage();
