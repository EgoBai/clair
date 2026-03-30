import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Round 201 — Market Circuit Breaker Engine
 * Implements circuit breaker pattern for market data sources
 * with configurable thresholds, recovery probing, and fallback routing.
 */

type CircuitState = 'closed' | 'open' | 'half-open';

interface CircuitBreakerConfig {
  failureThreshold: number;
  recoveryTimeout: number;
  probeCount: number;
  monitoringWindow: number;
  fallbackEnabled: boolean;
}

interface CircuitMetrics {
  totalRequests: number;
  successCount: number;
  failureCount: number;
  rejectedCount: number;
  avgResponseTime: number;
  lastFailureTime: number;
  stateChanges: number;
}

class MarketCircuitBreaker {
  private state: CircuitState = 'closed';
  private failureCount: number = 0;
  private successCount: number = 0;
  private probeSuccesses: number = 0;
  private lastStateChange: number = Date.now();
  private metrics: CircuitMetrics = {
    totalRequests: 0, successCount: 0, failureCount: 0,
    rejectedCount: 0, avgResponseTime: 0, lastFailureTime: 0, stateChanges: 0,
  };
  private responseTimes: number[] = [];
  private config: CircuitBreakerConfig;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = {
      failureThreshold: config.failureThreshold ?? 5,
      recoveryTimeout: config.recoveryTimeout ?? 30000,
      probeCount: config.probeCount ?? 3,
      monitoringWindow: config.monitoringWindow ?? 60000,
      fallbackEnabled: config.fallbackEnabled ?? true,
    };
  }

  async execute<T>(operation: () => Promise<T>, fallback?: () => T): Promise<T> {
    this.metrics.totalRequests++;

    if (this.state === 'open') {
      if (this.shouldAttemptRecovery()) {
        this.transitionTo('half-open');
      } else {
        this.metrics.rejectedCount++;
        if (fallback && this.config.fallbackEnabled) {
          return fallback();
        }
        throw new Error('Circuit breaker is OPEN — request rejected');
      }
    }

    const start = performance.now();
    try {
      const result = await operation();
      this.recordSuccess(performance.now() - start);
      return result;
    } catch (error) {
      this.recordFailure(performance.now() - start);
      if (fallback && this.config.fallbackEnabled) {
        return fallback();
      }
      throw error;
    }
  }

  private recordSuccess(responseTime: number): void {
    this.responseTimes.push(responseTime);
    this.metrics.successCount++;
    this.metrics.avgResponseTime = this.calculateAvgResponseTime();

    if (this.state === 'half-open') {
      this.probeSuccesses++;
      if (this.probeSuccesses >= this.config.probeCount) {
        this.transitionTo('closed');
        this.failureCount = 0;
        this.probeSuccesses = 0;
      }
    } else {
      this.failureCount = Math.max(0, this.failureCount - 1);
    }
  }

  private recordFailure(responseTime: number): void {
    this.responseTimes.push(responseTime);
    this.failureCount++;
    this.metrics.failureCount++;
    this.metrics.lastFailureTime = Date.now();
    this.metrics.avgResponseTime = this.calculateAvgResponseTime();

    if (this.state === 'half-open') {
      this.transitionTo('open');
      this.probeSuccesses = 0;
    } else if (this.failureCount >= this.config.failureThreshold) {
      this.transitionTo('open');
    }
  }

  private shouldAttemptRecovery(): boolean {
    return Date.now() - this.lastStateChange >= this.config.recoveryTimeout;
  }

  private transitionTo(newState: CircuitState): void {
    this.state = newState;
    this.lastStateChange = Date.now();
    this.metrics.stateChanges++;
  }

  private calculateAvgResponseTime(): number {
    const recent = this.responseTimes.slice(-100);
    return recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : 0;
  }

  getState(): CircuitState { return this.state; }
  getMetrics(): CircuitMetrics { return { ...this.metrics }; }
  getConfig(): CircuitBreakerConfig { return { ...this.config }; }
  getFailureCount(): number { return this.failureCount; }

  reset(): void {
    this.state = 'closed';
    this.failureCount = 0;
    this.probeSuccesses = 0;
    this.lastStateChange = Date.now();
  }

  forceOpen(): void { this.transitionTo('open'); }
  forceClosed(): void { this.transitionTo('closed'); this.failureCount = 0; }

  isHealthy(): boolean {
    return this.state === 'closed' && this.failureCount < this.config.failureThreshold * 0.5;
  }
}

describe('Round 201: Market Circuit Breaker', () => {
  let breaker: MarketCircuitBreaker;

  beforeEach(() => {
    breaker = new MarketCircuitBreaker({ failureThreshold: 3, recoveryTimeout: 100, probeCount: 2 });
  });

  describe('Basic Operation', () => {
    it('executes successfully when circuit is closed', async () => {
      const result = await breaker.execute(async () => 'data');
      expect(result).toBe('data');
      expect(breaker.getState()).toBe('closed');
    });

    it('tracks success metrics', async () => {
      await breaker.execute(async () => 'ok');
      await breaker.execute(async () => 'ok');
      const m = breaker.getMetrics();
      expect(m.totalRequests).toBe(2);
      expect(m.successCount).toBe(2);
      expect(m.failureCount).toBe(0);
    });

    it('tracks failure metrics', async () => {
      try { await breaker.execute(async () => { throw new Error('fail'); }); } catch {}
      const m = breaker.getMetrics();
      expect(m.failureCount).toBe(1);
    });
  });

  describe('Circuit Opening', () => {
    it('opens after threshold failures', async () => {
      for (let i = 0; i < 3; i++) {
        try { await breaker.execute(async () => { throw new Error('fail'); }); } catch {}
      }
      expect(breaker.getState()).toBe('open');
    });

    it('rejects requests when open', async () => {
      for (let i = 0; i < 3; i++) {
        try { await breaker.execute(async () => { throw new Error('fail'); }); } catch {}
      }
      await expect(breaker.execute(async () => 'ok')).rejects.toThrow('Circuit breaker is OPEN');
      expect(breaker.getMetrics().rejectedCount).toBe(1);
    });

    it('uses fallback when open and fallback enabled', async () => {
      for (let i = 0; i < 3; i++) {
        try { await breaker.execute(async () => { throw new Error('fail'); }); } catch {}
      }
      const result = await breaker.execute(async () => 'primary', () => 'fallback');
      expect(result).toBe('fallback');
    });
  });

  describe('Recovery', () => {
    it('transitions to half-open after recovery timeout', async () => {
      for (let i = 0; i < 3; i++) {
        try { await breaker.execute(async () => { throw new Error('fail'); }); } catch {}
      }
      expect(breaker.getState()).toBe('open');
      await new Promise(r => setTimeout(r, 150));
      try { await breaker.execute(async () => 'probe'); } catch {}
      // should have moved to half-open or closed
      expect(['half-open', 'closed']).toContain(breaker.getState());
    });

    it('closes after enough probe successes in half-open', async () => {
      for (let i = 0; i < 3; i++) {
        try { await breaker.execute(async () => { throw new Error('fail'); }); } catch {}
      }
      await new Promise(r => setTimeout(r, 150));
      await breaker.execute(async () => 'probe1');
      await breaker.execute(async () => 'probe2');
      expect(breaker.getState()).toBe('closed');
    });

    it('re-opens if probe fails in half-open', async () => {
      for (let i = 0; i < 3; i++) {
        try { await breaker.execute(async () => { throw new Error('fail'); }); } catch {}
      }
      await new Promise(r => setTimeout(r, 150));
      try { await breaker.execute(async () => { throw new Error('still broke'); }); } catch {}
      expect(breaker.getState()).toBe('open');
    });
  });

  describe('Health & Control', () => {
    it('reports healthy when below 50% of threshold', async () => {
      expect(breaker.isHealthy()).toBe(true);
      try { await breaker.execute(async () => { throw new Error('x'); }); } catch {}
      expect(breaker.isHealthy()).toBe(true);
    });

    it('forceOpen and forceClosed work', () => {
      breaker.forceOpen();
      expect(breaker.getState()).toBe('open');
      breaker.forceClosed();
      expect(breaker.getState()).toBe('closed');
    });

    it('reset clears all state', async () => {
      for (let i = 0; i < 3; i++) {
        try { await breaker.execute(async () => { throw new Error('fail'); }); } catch {}
      }
      breaker.reset();
      expect(breaker.getState()).toBe('closed');
      expect(breaker.getFailureCount()).toBe(0);
    });

    it('tracks state changes count', () => {
      breaker.forceOpen();
      breaker.forceClosed();
      breaker.forceOpen();
      expect(breaker.getMetrics().stateChanges).toBe(3);
    });

    it('tracks avg response time', async () => {
      await breaker.execute(async () => {
        await new Promise(r => setTimeout(r, 10));
        return 'slow';
      });
      expect(breaker.getMetrics().avgResponseTime).toBeGreaterThan(0);
    });
  });

  describe('Default Config', () => {
    it('uses sensible defaults', () => {
      const b = new MarketCircuitBreaker();
      const c = b.getConfig();
      expect(c.failureThreshold).toBe(5);
      expect(c.recoveryTimeout).toBe(30000);
      expect(c.probeCount).toBe(3);
      expect(c.fallbackEnabled).toBe(true);
    });
  });
});
