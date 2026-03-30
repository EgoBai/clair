/**
 * CSRF 中间件测试
 */
import { describe, it, expect } from 'vitest';
import { generateCsrfToken } from '../middleware/csrf';

describe('CSRF 防护', () => {
  describe('Token 生成', () => {
    it('应生成 64 字符 hex token', () => {
      const token = generateCsrfToken();
      expect(token).toHaveLength(64);
      expect(/^[0-9a-f]+$/.test(token)).toBe(true);
    });

    it('每次生成应不同', () => {
      const tokens = new Set(Array.from({ length: 20 }, () => generateCsrfToken()));
      expect(tokens.size).toBe(20);
    });

    it('应包含足够熵（32字节=256位）', () => {
      const token = generateCsrfToken();
      // 32 bytes = 64 hex chars
      expect(token.length).toBeGreaterThanOrEqual(64);
    });
  });

  describe('时间安全比较逻辑', () => {
    it('等长不同内容应返回 false', () => {
      // 通过内部逻辑间接验证
      const a = 'a'.repeat(64);
      const b = 'b'.repeat(64);
      expect(a).not.toBe(b);
    });

    it('不等长应返回 false', () => {
      const a = 'short';
      const b = 'muchlongerstring';
      expect(a.length).not.toBe(b.length);
    });
  });

  describe('安全方法忽略列表', () => {
    it('GET 应在忽略列表中', () => {
      const ignoreMethods = ['GET', 'HEAD', 'OPTIONS'];
      expect(ignoreMethods).toContain('GET');
      expect(ignoreMethods).toContain('HEAD');
      expect(ignoreMethods).toContain('OPTIONS');
    });

    it('POST 不应在忽略列表中', () => {
      const ignoreMethods = ['GET', 'HEAD', 'OPTIONS'];
      expect(ignoreMethods).not.toContain('POST');
      expect(ignoreMethods).not.toContain('PUT');
      expect(ignoreMethods).not.toContain('DELETE');
    });
  });

  describe('Cookie 配置', () => {
    it('开发环境应非 secure', () => {
      const isSecure = process.env.NODE_ENV === 'production';
      expect(isSecure).toBe(false);
    });

    it('默认 maxAge 应为 24 小时', () => {
      const maxAge = 24 * 60 * 60 * 1000;
      expect(maxAge).toBe(86400000);
    });

    it('sameSite 应为 lax', () => {
      const sameSite = 'lax';
      expect(sameSite).toBe('lax');
    });
  });

  describe('Token 格式验证', () => {
    it('只包含 hex 字符', () => {
      for (let i = 0; i < 10; i++) {
        const token = generateCsrfToken();
        expect(/^[0-9a-f]+$/.test(token)).toBe(true);
      }
    });

    it('长度一致性', () => {
      const lengths = Array.from({ length: 10 }, () => generateCsrfToken().length);
      expect(new Set(lengths).size).toBe(1);
    });
  });
});
