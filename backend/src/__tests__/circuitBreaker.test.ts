import { describe, it, expect } from 'vitest';

// 熔断器模式测试
describe('Circuit Breaker Pattern', () => {
  type State = 'closed' | 'open' | 'half-open';

  class CircuitBreaker {
    state: State = 'closed';
    failures = 0;
    successes = 0;
    lastFailureTime = 0;
    private threshold: number;
    private resetTimeout: number;

    constructor(threshold: number = 5, resetTimeout: number = 30000) {
      this.threshold = threshold;
      this.resetTimeout = resetTimeout;
    }

    recordFailure() {
      this.failures++;
      this.lastFailureTime = Date.now();
      if (this.failures >= this.threshold) {
        this.state = 'open';
      }
    }

    recordSuccess() {
      this.successes++;
      if (this.state === 'half-open') {
        this.state = 'closed';
        this.failures = 0;
      }
    }

    canExecute(): boolean {
      if (this.state === 'closed') return true;
      if (this.state === 'open') {
        if (Date.now() - this.lastFailureTime >= this.resetTimeout) {
          this.state = 'half-open';
          return true;
        }
        return false;
      }
      return true; // half-open
    }

    getState(): State {
      return this.state;
    }
  }

  // 基础状态
  describe('Basic States', () => {
    it('should start in closed state', () => {
      const cb = new CircuitBreaker();
      expect(cb.getState()).toBe('closed');
    });

    it('should stay closed below threshold', () => {
      const cb = new CircuitBreaker(5);
      cb.recordFailure();
      cb.recordFailure();
      cb.recordFailure();
      expect(cb.getState()).toBe('closed');
    });

    it('should open at threshold', () => {
      const cb = new CircuitBreaker(3);
      cb.recordFailure();
      cb.recordFailure();
      cb.recordFailure();
      expect(cb.getState()).toBe('open');
    });

    it('should remain open after additional failures', () => {
      const cb = new CircuitBreaker(2);
      cb.recordFailure();
      cb.recordFailure();
      cb.recordFailure();
      expect(cb.getState()).toBe('open');
    });
  });

  // 执行权限
  describe('Execution Permission', () => {
    it('should allow execution when closed', () => {
      const cb = new CircuitBreaker();
      expect(cb.canExecute()).toBe(true);
    });

    it('should block execution when open', () => {
      const cb = new CircuitBreaker(1);
      cb.recordFailure();
      expect(cb.canExecute()).toBe(false);
    });

    it('should allow execution in half-open', () => {
      const cb = new CircuitBreaker(1, 0); // instant reset
      cb.recordFailure();
      expect(cb.canExecute()).toBe(true); // transitions to half-open
      expect(cb.getState()).toBe('half-open');
    });
  });

  // 恢复逻辑
  describe('Recovery Logic', () => {
    it('should recover from half-open on success', () => {
      const cb = new CircuitBreaker(1, 0);
      cb.recordFailure();
      cb.canExecute(); // -> half-open
      cb.recordSuccess();
      expect(cb.getState()).toBe('closed');
    });

    it('should reset failure count on recovery', () => {
      const cb = new CircuitBreaker(3, 0);
      cb.recordFailure();
      cb.recordFailure();
      cb.recordFailure(); // -> open
      cb.canExecute(); // -> half-open
      cb.recordSuccess();
      expect(cb.failures).toBe(0);
    });

    it('should go back to open on failure in half-open', () => {
      const cb = new CircuitBreaker(1, 0);
      cb.recordFailure();
      cb.canExecute(); // -> half-open
      cb.recordFailure();
      expect(cb.getState()).toBe('open');
    });
  });

  // 阈值配置
  describe('Threshold Configuration', () => {
    it('should respect custom threshold', () => {
      const cb = new CircuitBreaker(10);
      for (let i = 0; i < 9; i++) cb.recordFailure();
      expect(cb.getState()).toBe('closed');
      cb.recordFailure();
      expect(cb.getState()).toBe('open');
    });

    it('should handle threshold of 1', () => {
      const cb = new CircuitBreaker(1);
      cb.recordFailure();
      expect(cb.getState()).toBe('open');
    });
  });

  // 超时配置
  describe('Timeout Configuration', () => {
    it('should respect reset timeout', () => {
      const cb = new CircuitBreaker(1, 1000);
      cb.recordFailure();
      expect(cb.canExecute()).toBe(false);
    });

    it('should allow execution after timeout', () => {
      const cb = new CircuitBreaker(1, 0); // 0ms timeout
      cb.recordFailure();
      expect(cb.canExecute()).toBe(true);
    });
  });

  // 统计信息
  describe('Statistics', () => {
    it('should track failure count', () => {
      const cb = new CircuitBreaker();
      cb.recordFailure();
      cb.recordFailure();
      expect(cb.failures).toBe(2);
    });

    it('should track success count', () => {
      const cb = new CircuitBreaker();
      cb.recordSuccess();
      cb.recordSuccess();
      cb.recordSuccess();
      expect(cb.successes).toBe(3);
    });

    it('should track last failure time', () => {
      const cb = new CircuitBreaker();
      const before = Date.now();
      cb.recordFailure();
      const after = Date.now();
      expect(cb.lastFailureTime).toBeGreaterThanOrEqual(before);
      expect(cb.lastFailureTime).toBeLessThanOrEqual(after);
    });
  });

  // 批量请求
  describe('Batch Requests', () => {
    it('should block all requests when open', () => {
      const cb = new CircuitBreaker(2);
      cb.recordFailure();
      cb.recordFailure();
      const results = [1, 2, 3, 4, 5].map(() => cb.canExecute());
      expect(results.every(r => r === false)).toBe(true);
    });

    it('should allow partial requests in half-open', () => {
      const cb = new CircuitBreaker(2, 0);
      cb.recordFailure();
      cb.recordFailure();
      // After timeout -> half-open
      expect(cb.canExecute()).toBe(true);
    });
  });
});
