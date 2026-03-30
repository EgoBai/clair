import { describe, it, expect, beforeEach, vi } from 'vitest';

// Performance Benchmarking Framework
interface BenchmarkConfig {
  name: string;
  iterations: number;
  warmupIterations: number;
  timeout: number;
  tags: string[];
}

interface BenchmarkResult {
  name: string;
  iterations: number;
  totalTime: number;
  averageTime: number;
  minTime: number;
  maxTime: number;
  p50: number;
  p95: number;
  p99: number;
  opsPerSecond: number;
  memoryUsed: number;
  tags: string[];
  timestamp: Date;
}

interface BenchmarkSuite {
  name: string;
  results: BenchmarkResult[];
  totalTime: number;
  passed: number;
  failed: number;
}

interface ComparisonResult {
  baseline: BenchmarkResult;
  current: BenchmarkResult;
  speedup: number;
  regression: boolean;
  percentChange: number;
}

class PerformanceBenchmark {
  private benchmarks: Map<string, BenchmarkConfig & { fn: () => void | Promise<void> }> = new Map();
  private results: Map<string, BenchmarkResult> = new Map();
  private baselines: Map<string, BenchmarkResult> = new Map();
  private suites: BenchmarkSuite[] = [];

  register(name: string, fn: () => void | Promise<void>, config?: Partial<BenchmarkConfig>): void {
    this.benchmarks.set(name, {
      name,
      iterations: config?.iterations ?? 1000,
      warmupIterations: config?.warmupIterations ?? 10,
      timeout: config?.timeout ?? 30000,
      tags: config?.tags ?? [],
      fn,
    });
  }

  async run(name: string): Promise<BenchmarkResult> {
    const bench = this.benchmarks.get(name);
    if (!bench) throw new Error(`Benchmark not found: ${name}`);

    // Warmup
    for (let i = 0; i < bench.warmupIterations; i++) {
      await bench.fn();
    }

    // Run benchmark
    const times: number[] = [];
    const startTotal = performance.now();

    for (let i = 0; i < bench.iterations; i++) {
      const start = performance.now();
      await bench.fn();
      times.push(performance.now() - start);
    }

    const totalTime = performance.now() - startTotal;
    times.sort((a, b) => a - b);

    const result: BenchmarkResult = {
      name,
      iterations: bench.iterations,
      totalTime,
      averageTime: times.reduce((a, b) => a + b, 0) / times.length,
      minTime: times[0],
      maxTime: times[times.length - 1],
      p50: this.percentile(times, 50),
      p95: this.percentile(times, 95),
      p99: this.percentile(times, 99),
      opsPerSecond: (bench.iterations / totalTime) * 1000,
      memoryUsed: process.memoryUsage?.()?.heapUsed ?? 0,
      tags: bench.tags,
      timestamp: new Date(),
    };

    this.results.set(name, result);
    return result;
  }

  async runAll(): Promise<BenchmarkSuite> {
    const suiteStart = performance.now();
    const results: BenchmarkResult[] = [];
    let passed = 0;
    let failed = 0;

    for (const [name] of this.benchmarks) {
      try {
        const result = await this.run(name);
        results.push(result);
        passed++;
      } catch {
        failed++;
      }
    }

    const suite: BenchmarkSuite = {
      name: `suite_${Date.now()}`,
      results,
      totalTime: performance.now() - suiteStart,
      passed,
      failed,
    };
    this.suites.push(suite);
    return suite;
  }

  private percentile(sorted: number[], p: number): number {
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
  }

  setBaseline(name: string): void {
    const result = this.results.get(name);
    if (result) {
      this.baselines.set(name, { ...result });
    }
  }

  setAllBaselines(): void {
    for (const [name, result] of this.results) {
      this.baselines.set(name, { ...result });
    }
  }

  compare(name: string): ComparisonResult | null {
    const baseline = this.baselines.get(name);
    const current = this.results.get(name);
    if (!baseline || !current) return null;

    const speedup = baseline.averageTime / current.averageTime;
    const percentChange = ((current.averageTime - baseline.averageTime) / baseline.averageTime) * 100;

    return {
      baseline,
      current,
      speedup,
      regression: percentChange > 5,
      percentChange,
    };
  }

  compareAll(): ComparisonResult[] {
    const comparisons: ComparisonResult[] = [];
    for (const name of this.baselines.keys()) {
      const comp = this.compare(name);
      if (comp) comparisons.push(comp);
    }
    return comparisons;
  }

  async stressTest(name: string, duration: number): Promise<{ ops: number; errors: number; avgTime: number }> {
    const bench = this.benchmarks.get(name);
    if (!bench) throw new Error(`Benchmark not found: ${name}`);

    let ops = 0;
    let errors = 0;
    const times: number[] = [];
    const end = Date.now() + duration;

    while (Date.now() < end) {
      try {
        const start = performance.now();
        await bench.fn();
        times.push(performance.now() - start);
        ops++;
      } catch {
        errors++;
      }
    }

    return {
      ops,
      errors,
      avgTime: times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0,
    };
  }

  getResults(): BenchmarkResult[] {
    return Array.from(this.results.values());
  }

  getResult(name: string): BenchmarkResult | undefined {
    return this.results.get(name);
  }

  getSuites(): BenchmarkSuite[] {
    return [...this.suites];
  }

  exportReport(): string {
    const results = this.getResults();
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      results: results.map(r => ({
        name: r.name,
        avgMs: r.averageTime.toFixed(3),
        p95Ms: r.p95.toFixed(3),
        p99Ms: r.p99.toFixed(3),
        opsPerSec: r.opsPerSecond.toFixed(0),
        iterations: r.iterations,
      })),
    }, null, 2);
  }

  clear(): void {
    this.results.clear();
  }
}

describe('Performance Benchmark Framework', () => {
  let bench: PerformanceBenchmark;

  beforeEach(() => {
    bench = new PerformanceBenchmark();
  });

  it('should register benchmark', () => {
    bench.register('simple', () => { 1 + 1; });
    expect(bench.getResults()).toHaveLength(0);
  });

  it('should run benchmark', async () => {
    bench.register('arithmetic', () => { let x = 0; for (let i = 0; i < 100; i++) x += i; }, { iterations: 100 });
    const result = await bench.run('arithmetic');
    expect(result.name).toBe('arithmetic');
    expect(result.iterations).toBe(100);
    expect(result.averageTime).toBeGreaterThan(0);
    expect(result.minTime).toBeGreaterThan(0);
    expect(result.maxTime).toBeGreaterThanOrEqual(result.minTime);
    expect(result.opsPerSecond).toBeGreaterThan(0);
  });

  it('should calculate percentiles', async () => {
    bench.register('percentile_test', () => { Math.random(); }, { iterations: 200 });
    const result = await bench.run('percentile_test');
    expect(result.p50).toBeGreaterThan(0);
    expect(result.p95).toBeGreaterThanOrEqual(result.p50);
    expect(result.p99).toBeGreaterThanOrEqual(result.p95);
  });

  it('should run all benchmarks', async () => {
    bench.register('b1', () => { 1 + 1; }, { iterations: 50 });
    bench.register('b2', () => { 2 * 2; }, { iterations: 50 });
    const suite = await bench.runAll();
    expect(suite.passed).toBe(2);
    expect(suite.failed).toBe(0);
    expect(suite.results).toHaveLength(2);
  });

  it('should set baseline', async () => {
    bench.register('baseline_test', () => { 1 + 1; }, { iterations: 50 });
    await bench.run('baseline_test');
    bench.setBaseline('baseline_test');
    const result = bench.getResult('baseline_test');
    expect(result).toBeTruthy();
  });

  it('should compare with baseline', async () => {
    bench.register('cmp', () => { 1 + 1; }, { iterations: 50 });
    await bench.run('cmp');
    bench.setBaseline('cmp');
    await bench.run('cmp');
    const comparison = bench.compare('cmp');
    expect(comparison).toBeTruthy();
    expect(comparison!.speedup).toBeGreaterThan(0);
  });

  it('should detect regression', async () => {
    bench.register('regression', () => { 1 + 1; }, { iterations: 50 });
    await bench.run('regression');
    bench.setBaseline('regression');
    const comparison = bench.compare('regression');
    expect(typeof comparison?.regression).toBe('boolean');
  });

  it('should run stress test', async () => {
    bench.register('stress', () => { 1 + 1; });
    const result = await bench.stressTest('stress', 100);
    expect(result.ops).toBeGreaterThan(0);
    expect(result.errors).toBe(0);
    expect(result.avgTime).toBeGreaterThan(0);
  });

  it('should export report', async () => {
    bench.register('export_test', () => { 1 + 1; }, { iterations: 50 });
    await bench.run('export_test');
    const report = bench.exportReport();
    const parsed = JSON.parse(report);
    expect(parsed.results).toHaveLength(1);
    expect(parsed.results[0].name).toBe('export_test');
  });

  it('should handle non-existent benchmark', async () => {
    await expect(() => bench.run('nonexistent')).rejects.toThrow();
  });

  it('should set all baselines', async () => {
    bench.register('ab1', () => { 1 + 1; }, { iterations: 50 });
    bench.register('ab2', () => { 2 * 2; }, { iterations: 50 });
    await bench.runAll();
    bench.setAllBaselines();
    const comparisons = bench.compareAll();
    expect(comparisons).toHaveLength(2);
  });

  it('should clear results', async () => {
    bench.register('clear_test', () => { 1 + 1; }, { iterations: 50 });
    await bench.run('clear_test');
    expect(bench.getResults()).toHaveLength(1);
    bench.clear();
    expect(bench.getResults()).toHaveLength(0);
  });

  it('should get suites', async () => {
    bench.register('suite_test', () => { 1 + 1; }, { iterations: 50 });
    await bench.runAll();
    const suites = bench.getSuites();
    expect(suites).toHaveLength(1);
  });

  it('should support tags', async () => {
    bench.register('tagged', () => { 1 + 1; }, { iterations: 50, tags: ['api', 'fast'] });
    const result = await bench.run('tagged');
    expect(result.tags).toContain('api');
    expect(result.tags).toContain('fast');
  });

  it('should include timestamp', async () => {
    bench.register('timed', () => { 1 + 1; }, { iterations: 50 });
    const result = await bench.run('timed');
    expect(result.timestamp).toBeInstanceOf(Date);
  });
});
