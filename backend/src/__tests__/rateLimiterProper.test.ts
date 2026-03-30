import { describe, it, expect } from 'vitest';
import { rateLimit, apiRateLimit, syncRateLimit } from '../middleware/rateLimit';

describe('Rate Limiter Proper', () => {
  describe('rateLimit factory', () => {
    it('should create rate limit middleware', () => {
      const middleware = rateLimit({ windowMs: 60000, max: 100 });
      expect(typeof middleware).toBe('function');
    });

    it('should create with default options', () => {
      const middleware = rateLimit();
      expect(typeof middleware).toBe('function');
    });

    it('should create API rate limit', () => {
      expect(typeof apiRateLimit).toBe('function');
    });

    it('should create sync rate limit', () => {
      expect(typeof syncRateLimit).toBe('function');
    });

    it('should accept custom window and max', () => {
      const middleware = rateLimit({ windowMs: 10000, max: 5 });
      expect(typeof middleware).toBe('function');
    });

    it('should accept custom message', () => {
      const middleware = rateLimit({ windowMs: 60000, max: 100, message: 'Too many requests' });
      expect(typeof middleware).toBe('function');
    });

    it('should accept custom keyGenerator', () => {
      const middleware = rateLimit({
        windowMs: 60000,
        max: 100,
        keyGenerator: (req: any) => req.ip || 'unknown',
      });
      expect(typeof middleware).toBe('function');
    });

    it('should accept skip function', () => {
      const middleware = rateLimit({
        windowMs: 60000,
        max: 100,
        skip: () => false,
      });
      expect(typeof middleware).toBe('function');
    });

    it('should accept onLimitReached callback', () => {
      const middleware = rateLimit({
        windowMs: 60000,
        max: 100,
        onLimitReached: () => {},
      });
      expect(typeof middleware).toBe('function');
    });

    it('should handle zero max', () => {
      const middleware = rateLimit({ windowMs: 60000, max: 0 });
      expect(typeof middleware).toBe('function');
    });

    it('should handle very large window', () => {
      const middleware = rateLimit({ windowMs: 86400000, max: 10000 });
      expect(typeof middleware).toBe('function');
    });
  });
});
