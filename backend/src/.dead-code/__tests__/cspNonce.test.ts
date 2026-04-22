/**
 * CSP Nonce 中间件测试
 */
import { describe, it, expect, vi } from 'vitest';
import { generateNonce, cspNonceMiddleware, getCspMetaContent, nonceAttr } from '../middleware/cspNonce';

describe('CSP Nonce 中间件', () => {
  describe('generateNonce', () => {
    it('应生成 base64 格式的随机 nonce', () => {
      const nonce = generateNonce();
      expect(nonce).toBeTruthy();
      expect(typeof nonce).toBe('string');
      // base64 编码的 16 字节应为 24 字符（含填充）
      expect(nonce.length).toBeGreaterThanOrEqual(16);
    });

    it('每次应生成不同的 nonce', () => {
      const nonces = new Set(Array.from({ length: 100 }, () => generateNonce()));
      expect(nonces.size).toBe(100);
    });

    it('应支持自定义长度', () => {
      const short = generateNonce(8);
      const long = generateNonce(32);
      expect(long.length).toBeGreaterThan(short.length);
    });

    it('生成的 nonce 应仅包含 base64 字符', () => {
      const nonce = generateNonce(32);
      expect(nonce).toMatch(/^[A-Za-z0-9+/]+=*$/);
    });
  });

  describe('cspNonceMiddleware', () => {
    function mockReqRes() {
      const req: any = { headers: {} };
      const res: any = {
        setHeader: vi.fn(),
        getHeader: vi.fn(),
      };
      const next = vi.fn();
      return { req, res, next };
    }

    it('应将 nonce 挂载到 req.cspNonce', () => {
      const { req, res, next } = mockReqRes();
      const middleware = cspNonceMiddleware();
      middleware(req, res, next);

      expect(req.cspNonce).toBeTruthy();
      expect(typeof req.cspNonce).toBe('string');
      expect(next).toHaveBeenCalledOnce();
    });

    it('应设置包含 nonce 的 CSP 头', () => {
      const { req, res, next } = mockReqRes();
      const middleware = cspNonceMiddleware();
      middleware(req, res, next);

      const cspHeader = res.setHeader.mock.calls.find(
        (c: any[]) => c[0] === 'Content-Security-Policy'
      );
      expect(cspHeader).toBeTruthy();
      expect(cspHeader[1]).toContain(`'nonce-${req.cspNonce}'`);
      expect(cspHeader[1]).toContain("default-src 'self'");
      expect(cspHeader[1]).toContain("frame-ancestors 'none'");
    });

    it('应设置 X-CSP-Nonce 响应头（默认）', () => {
      const { req, res, next } = mockReqRes();
      const middleware = cspNonceMiddleware();
      middleware(req, res, next);

      const nonceHeader = res.setHeader.mock.calls.find(
        (c: any[]) => c[0] === 'X-CSP-Nonce'
      );
      expect(nonceHeader).toBeTruthy();
      expect(nonceHeader[1]).toBe(req.cspNonce);
    });

    it('应支持禁用 exposeNonce', () => {
      const { req, res, next } = mockReqRes();
      const middleware = cspNonceMiddleware({ exposeNonce: false });
      middleware(req, res, next);

      const nonceHeader = res.setHeader.mock.calls.find(
        (c: any[]) => c[0] === 'X-CSP-Nonce'
      );
      expect(nonceHeader).toBeUndefined();
    });

    it('CSP 不应包含 unsafe-inline', () => {
      const { req, res, next } = mockReqRes();
      const middleware = cspNonceMiddleware();
      middleware(req, res, next);

      const cspHeader = res.setHeader.mock.calls.find(
        (c: any[]) => c[0] === 'Content-Security-Policy'
      );
      expect(cspHeader[1]).not.toContain("'unsafe-inline'");
      expect(cspHeader[1]).not.toContain("'unsafe-eval'");
    });
  });

  describe('getCspMetaContent', () => {
    it('应返回包含 nonce 的 CSP meta 内容', () => {
      const meta = getCspMetaContent('test-nonce-123');
      expect(meta).toContain("'nonce-test-nonce-123'");
      expect(meta).toContain('script-src');
      expect(meta).toContain('style-src');
    });
  });

  describe('nonceAttr', () => {
    it('应返回 nonce 属性字符串', () => {
      const attr = nonceAttr('abc123');
      expect(attr).toBe('nonce="abc123"');
    });
  });
});
