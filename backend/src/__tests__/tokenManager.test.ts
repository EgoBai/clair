import { describe, it, expect } from 'vitest';
import crypto from 'crypto';

/**
 * Token管理器测试
 * 测试JWT-like token生成、验证、刷新、黑名单
 */

interface TokenPayload {
  userId: number;
  username: string;
  role: 'user' | 'admin';
}

interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
}

class SimpleTokenManager {
  private secret: string;
  private accessExpiresIn: number;
  private refreshExpiresIn: number;
  private blacklist = new Set<string>();

  constructor(secret: string, accessExpiresIn = 3600, refreshExpiresIn = 604800) {
    this.secret = secret;
    this.accessExpiresIn = accessExpiresIn;
    this.refreshExpiresIn = refreshExpiresIn;
  }

  generateTokenPair(payload: TokenPair extends any ? TokenPayload : never): TokenPair {
    const accessToken = this.sign(payload, this.accessExpiresIn);
    const refreshToken = this.sign({ ...payload, type: 'refresh' }, this.refreshExpiresIn);
    return {
      accessToken,
      refreshToken,
      expiresIn: this.accessExpiresIn,
      tokenType: 'Bearer',
    };
  }

  private sign(payload: any, expiresIn: number): string {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const now = Math.floor(Date.now() / 1000);
    const body = { ...payload, iat: now, exp: now + expiresIn };
    const bodyStr = Buffer.from(JSON.stringify(body)).toString('base64url');
    const signature = crypto.createHmac('sha256', this.secret).update(`${header}.${bodyStr}`).digest('base64url');
    return `${header}.${bodyStr}.${signature}`;
  }

  verify(token: string): TokenPayload | null {
    if (this.blacklist.has(token)) return null;
    
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    try {
      const [header, body, sig] = parts;
      const expectedSig = crypto.createHmac('sha256', this.secret).update(`${header}.${body}`).digest('base64url');
      if (sig !== expectedSig) return null;

      const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
      if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
      
      return { userId: payload.userId, username: payload.username, role: payload.role };
    } catch {
      return null;
    }
  }

  revoke(token: string): void {
    this.blacklist.add(token);
  }

  isRevoked(token: string): boolean {
    return this.blacklist.has(token);
  }
}

describe('Token管理器', () => {
  const manager = new SimpleTokenManager('test-secret-key-for-unit-tests');

  describe('Token生成', () => {
    it('应该生成包含access和refresh的token对', () => {
      const tokens = manager.generateTokenPair({ userId: 1, username: 'test', role: 'user' });
      expect(tokens.accessToken).toBeDefined();
      expect(tokens.refreshToken).toBeDefined();
      expect(tokens.expiresIn).toBe(3600);
      expect(tokens.tokenType).toBe('Bearer');
    });

    it('token应该是三段式格式 (header.payload.signature)', () => {
      const tokens = manager.generateTokenPair({ userId: 1, username: 'test', role: 'user' });
      const parts = tokens.accessToken.split('.');
      expect(parts.length).toBe(3);
      parts.forEach((p) => expect(p.length).toBeGreaterThan(0));
    });

    it('不同用户应该生成不同token', () => {
      const t1 = manager.generateTokenPair({ userId: 1, username: 'alice', role: 'user' });
      const t2 = manager.generateTokenPair({ userId: 2, username: 'bob', role: 'admin' });
      expect(t1.accessToken).not.toBe(t2.accessToken);
    });
  });

  describe('Token验证', () => {
    it('应该验证有效token并返回payload', () => {
      const tokens = manager.generateTokenPair({ userId: 42, username: 'admin', role: 'admin' });
      const payload = manager.verify(tokens.accessToken);
      expect(payload).not.toBeNull();
      expect(payload!.userId).toBe(42);
      expect(payload!.username).toBe('admin');
      expect(payload!.role).toBe('admin');
    });

    it('应该拒绝被篡改的token', () => {
      const tokens = manager.generateTokenPair({ userId: 1, username: 'test', role: 'user' });
      const tampered = tokens.accessToken.slice(0, -5) + 'xxxxx';
      expect(manager.verify(tampered)).toBeNull();
    });

    it('应该拒绝格式错误的token', () => {
      expect(manager.verify('invalid')).toBeNull();
      expect(manager.verify('')).toBeNull();
      expect(manager.verify('a.b')).toBeNull();
    });

    it('应该拒绝不同密钥签名的token', () => {
      const otherManager = new SimpleTokenManager('other-secret');
      const tokens = otherManager.generateTokenPair({ userId: 1, username: 'test', role: 'user' });
      expect(manager.verify(tokens.accessToken)).toBeNull();
    });
  });

  describe('Token撤销', () => {
    it('应该能撤销token', () => {
      const tokens = manager.generateTokenPair({ userId: 1, username: 'test', role: 'user' });
      expect(manager.verify(tokens.accessToken)).not.toBeNull();
      
      manager.revoke(tokens.accessToken);
      expect(manager.isRevoked(tokens.accessToken)).toBe(true);
      expect(manager.verify(tokens.accessToken)).toBeNull();
    });

    it('未撤销的token不应该被标记', () => {
      const freshManager = new SimpleTokenManager('test-secret-key-for-unit-tests');
      const tokens = freshManager.generateTokenPair({ userId: 1, username: 'test', role: 'user' });
      expect(freshManager.isRevoked(tokens.accessToken)).toBe(false);
    });
  });

  describe('Token安全性', () => {
    it('应该使用HMAC-SHA256签名', () => {
      const tokens = manager.generateTokenPair({ userId: 1, username: 'test', role: 'user' });
      const parts = tokens.accessToken.split('.');
      // base64url解码header
      const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
      expect(header.alg).toBe('HS256');
      expect(header.typ).toBe('JWT');
    });

    it('token应该包含iat和exp字段', () => {
      const tokens = manager.generateTokenPair({ userId: 1, username: 'test', role: 'user' });
      const body = JSON.parse(Buffer.from(tokens.accessToken.split('.')[1], 'base64url').toString());
      expect(body.iat).toBeDefined();
      expect(body.exp).toBeDefined();
      expect(body.exp - body.iat).toBe(3600);
    });
  });
});
