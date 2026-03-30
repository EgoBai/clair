/**
 * Market Circuit Breaker
 * Prevents cascade failures when market data sources become unavailable.
 * Implements closed → open → half-open state transitions with fallback routing.
 */

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerConfig {
  failureThreshold: number;
  recoveryTimeout: number;
  probeCount: number;
  monitoringWindow: number;
  fallbackEnabled: boolean;
}

export interface CircuitMetrics {
  totalRequests: number;
  successCount: number;
  failureCount: number;
  rejectedCount: number;
  avgResponseTime: number;
  lastFailureTime: number;
  stateChanges: number;
}

export class MarketCircuitBreaker {
  private state: CircuitState = 'closed';
  private failureCount = 0;
  private probeSuccesses = 0;
  private lastStateChange = Date.now();
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
      if (Date.now() - this.lastStateChange >= this.config.recoveryTimeout) {
        this.transitionTo('half-open');
      } else {
        this.metrics.rejectedCount++;
        if (fallback && this.config.fallbackEnabled) return fallback();
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
      if (fallback && this.config.fallbackEnabled) return fallback();
      throw error;
    }
  }

  private recordSuccess(rt: number): void {
    this.responseTimes.push(rt);
    this.metrics.successCount++;
    this.updateAvgResponseTime();
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

  private recordFailure(rt: number): void {
    this.responseTimes.push(rt);
    this.failureCount++;
    this.metrics.failureCount++;
    this.metrics.lastFailureTime = Date.now();
    this.updateAvgResponseTime();
    if (this.state === 'half-open') {
      this.transitionTo('open');
      this.probeSuccesses = 0;
    } else if (this.failureCount >= this.config.failureThreshold) {
      this.transitionTo('open');
    }
  }

  private transitionTo(newState: CircuitState): void {
    this.state = newState;
    this.lastStateChange = Date.now();
    this.metrics.stateChanges++;
  }

  private updateAvgResponseTime(): void {
    const recent = this.responseTimes.slice(-100);
    this.metrics.avgResponseTime = recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : 0;
  }

  getState(): CircuitState { return this.state; }
  getMetrics(): CircuitMetrics { return { ...this.metrics }; }
  getConfig(): CircuitBreakerConfig { return { ...this.config }; }
  getFailureCount(): number { return this.failureCount; }
  reset(): void { this.state = 'closed'; this.failureCount = 0; this.probeSuccesses = 0; this.lastStateChange = Date.now(); }
  forceOpen(): void { this.transitionTo('open'); }
  forceClosed(): void { this.transitionTo('closed'); this.failureCount = 0; }
  isHealthy(): boolean { return this.state === 'closed' && this.failureCount < this.config.failureThreshold * 0.5; }
}
