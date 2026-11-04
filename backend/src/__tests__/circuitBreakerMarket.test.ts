/**
 * Round 201 — Market Circuit Breaker（绑定真实生产实现）
 *
 * 绑定：backend/src/utils/circuitBreakerMarket.ts
 *   :7  CircuitState        :9  CircuitBreakerConfig
 *   :17 CircuitMetrics      :27 MarketCircuitBreaker
 *
 * 本文件此前是「影子测试」：把生产实现整段抄进测试文件，再断言这份副本。
 * 已改为 import 生产模块，测试对生产的真实行为负责。时间全部由
 * vi.useFakeTimers + vi.setSystemTime / advanceTimersByTime 驱动，且显式 fake 了
 * performance.now（生产用 performance.now 计算 responseTime），因此平均耗时是精确值。
 *
 * 旧断言与生产实现的差异（均以生产为准）：
 * 1. 旧用例「transitions to half-open after recovery timeout」用真实 setTimeout(150) 等待，
 *    再断言 ['half-open','closed'] 二选一，任何结果都能通过；生产在 execute() 内联判定
 *    Date.now() - lastStateChange >= recoveryTimeout（:52），此处用 999ms/1000ms 精确切分。
 * 2. 旧用例没有区分两个 failureCount：生产 metrics.failureCount（:91）是累计值，而私有
 *    failureCount 会被成功请求递减（:84 Math.max(0, failureCount - 1)）。
 * 3. 生产 half-open 阶段的成功不递减 failureCount（递减只在 else 分支，:83-85），旧用例未覆盖。
 * 4. 生产被拒绝的请求不会刷新 lastStateChange（只有 transitionTo :102-106 才刷新），
 *    所以连续被拒不推迟恢复时间点，旧用例未覆盖。
 * 5. 旧用例断言 avgResponseTime > 0（弱断言）；生产 responseTimes 只保留最近 100 条（:109）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MarketCircuitBreaker } from '../utils/circuitBreakerMarket';
import type { CircuitState, CircuitBreakerConfig, CircuitMetrics } from '../utils/circuitBreakerMarket';

const BASE_TIME = Date.UTC(2026, 0, 2, 1, 30, 0); // 2026-01-02T01:30:00Z，固定时钟
const RECOVERY_TIMEOUT = 1000;
const OPEN_ERROR = 'Circuit breaker is OPEN — request rejected';

type Outcome<T> = { ok: true; value: T } | { ok: false; error: Error };

async function settle<T>(promise: Promise<T>): Promise<Outcome<T>> {
  try {
    return { ok: true, value: await promise };
  } catch (error) {
    return { ok: false, error: error as Error };
  }
}

function installFakeTimers(): void {
  // performance 必须一起 fake，否则 responseTime 是真实耗时，平均值不可精确断言。
  vi.useFakeTimers({
    toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance'],
  });
  vi.setSystemTime(BASE_TIME);
}

function createBreaker(overrides: Partial<CircuitBreakerConfig> = {}): MarketCircuitBreaker {
  return new MarketCircuitBreaker({
    failureThreshold: 3,
    recoveryTimeout: RECOVERY_TIMEOUT,
    probeCount: 2,
    monitoringWindow: 60000,
    ...overrides,
  });
}

async function failTimes(breaker: MarketCircuitBreaker, times: number): Promise<void> {
  for (let i = 0; i < times; i++) {
    // 未拒绝时后续状态断言会失败，这里不重复断言
    await settle(
      breaker.execute(async () => {
        throw new Error(`source down #${i}`);
      }),
    );
  }
}

describe('Market Circuit Breaker — 生产实现契约', () => {
  beforeEach(() => {
    installFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('正常执行与指标', () => {
    it('closed 状态下透传结果并记录首次请求', async () => {
      const breaker = createBreaker();

      const result = await breaker.execute(async () => 'data');

      expect(result).toBe('data');
      expect(breaker.getState()).toBe('closed');
      expect(breaker.getMetrics().totalRequests).toBe(1);
      expect(breaker.getMetrics().successCount).toBe(1);
      expect(breaker.getMetrics().failureCount).toBe(0);
      expect(breaker.getMetrics().rejectedCount).toBe(0);
    });

    it('跨多次调用累计 totalRequests / successCount', async () => {
      const breaker = createBreaker();

      await breaker.execute(async () => 'ok');
      await breaker.execute(async () => 'ok');

      const metrics = breaker.getMetrics();
      expect(metrics.totalRequests).toBe(2);
      expect(metrics.successCount).toBe(2);
      expect(metrics.failureCount).toBe(0);
      // 未推进 fake 时钟 → 两次 responseTime 都是 0
      expect(metrics.avgResponseTime).toBe(0);
    });

    it('成功递减内部 failureCount，但累计 metrics.failureCount 不变', async () => {
      const breaker = createBreaker();

      await failTimes(breaker, 2);
      expect(breaker.getFailureCount()).toBe(2);
      expect(breaker.getMetrics().failureCount).toBe(2);
      expect(breaker.getState()).toBe('closed');

      await breaker.execute(async () => 'recovered');

      expect(breaker.getFailureCount()).toBe(1);
      expect(breaker.getMetrics().failureCount).toBe(2);
      expect(breaker.getMetrics().successCount).toBe(1);
    });

    it('用 fake 时钟精确测量并平均 responseTime', async () => {
      const breaker = createBreaker();

      const slow = breaker.execute(async () => {
        await new Promise((r) => setTimeout(r, 25));
        return 'slow';
      });
      await vi.advanceTimersByTimeAsync(25);
      await expect(slow).resolves.toBe('slow');
      expect(breaker.getMetrics().avgResponseTime).toBe(25);

      const fast = breaker.execute(async () => {
        await new Promise((r) => setTimeout(r, 5));
        return 'fast';
      });
      await vi.advanceTimersByTimeAsync(5);
      await fast;
      // (25 + 5) / 2
      expect(breaker.getMetrics().avgResponseTime).toBe(15);
    });

    it('平均值只取最近 100 条 responseTime', async () => {
      const breaker = createBreaker();

      for (let i = 1; i <= 105; i++) {
        const call = breaker.execute(async () => {
          await new Promise((r) => setTimeout(r, i));
          return i;
        });
        await vi.advanceTimersByTimeAsync(i);
        await call;
      }

      // 最近 100 条是 6..105，均值 (6 + 105) / 2 = 55.5；全部 105 条均值会是 53
      expect(breaker.getMetrics().avgResponseTime).toBe(55.5);
      expect(breaker.getMetrics().successCount).toBe(105);
    });
  });

  describe('熔断打开与回退', () => {
    it('阈值以内的失败保持 closed，第 3 次失败精确打开', async () => {
      const breaker = createBreaker();

      await failTimes(breaker, 2);
      expect(breaker.getState()).toBe('closed');
      expect(breaker.getFailureCount()).toBe(2);

      await failTimes(breaker, 1);
      expect(breaker.getState()).toBe('open');
      expect(breaker.getMetrics().stateChanges).toBe(1);
      expect(breaker.getMetrics().failureCount).toBe(3);
    });

    it('open 状态拒绝请求并给出精确错误文案与计数', async () => {
      const breaker = createBreaker();
      await failTimes(breaker, 3);

      const outcome = await settle(breaker.execute(async () => 'ok'));

      expect(outcome.ok).toBe(false);
      expect(outcome.ok ? '' : outcome.error.message).toBe(OPEN_ERROR);
      expect(breaker.getMetrics().rejectedCount).toBe(1);
      expect(breaker.getMetrics().totalRequests).toBe(4);
      expect(breaker.getMetrics().successCount).toBe(0);
    });

    it('open 且配置回退时返回回退值，同时仍计一次 rejected', async () => {
      const breaker = createBreaker();
      await failTimes(breaker, 3);

      const result = await breaker.execute(async () => 'primary', () => 'fallback');

      expect(result).toBe('fallback');
      expect(breaker.getState()).toBe('open');
      expect(breaker.getMetrics().rejectedCount).toBe(1);
      expect(breaker.getMetrics().successCount).toBe(0);
    });

    it('closed 状态下主操作抛错也走回退，并记一次失败', async () => {
      const breaker = createBreaker();

      const result = await breaker.execute(
        async () => {
          throw new Error('primary blew up');
        },
        () => 'fallback',
      );

      expect(result).toBe('fallback');
      expect(breaker.getState()).toBe('closed');
      expect(breaker.getFailureCount()).toBe(1);
      expect(breaker.getMetrics().failureCount).toBe(1);
      expect(breaker.getMetrics().successCount).toBe(0);
    });

    it('fallbackEnabled=false 时 closed 阶段抛原始错误', async () => {
      const breaker = createBreaker({ fallbackEnabled: false });

      const outcome = await settle(
        breaker.execute(async () => {
          throw new Error('source down');
        }, () => 'fallback'),
      );

      expect(outcome.ok).toBe(false);
      expect(outcome.ok ? '' : outcome.error.message).toBe('source down');
      expect(breaker.getState()).toBe('closed');
      expect(breaker.getFailureCount()).toBe(1);
    });

    it('fallbackEnabled=false 时 open 阶段抛 OPEN 错误', async () => {
      const breaker = createBreaker({ fallbackEnabled: false });
      breaker.forceOpen();

      const outcome = await settle(breaker.execute(async () => 'ok', () => 'fallback'));

      expect(outcome.ok).toBe(false);
      expect(outcome.ok ? '' : outcome.error.message).toBe(OPEN_ERROR);
      expect(breaker.getMetrics().rejectedCount).toBe(1);
    });
  });

  describe('恢复（fake timers 精确切分）', () => {
    it('恢复超时前 1ms 仍拒绝，正好到点才允许探测', async () => {
      const breaker = createBreaker();
      await failTimes(breaker, 3);

      vi.advanceTimersByTime(RECOVERY_TIMEOUT - 1);
      const rejected = await settle(breaker.execute(async () => 'probe'));
      expect(rejected.ok).toBe(false);
      expect(rejected.ok ? '' : rejected.error.message).toBe(OPEN_ERROR);
      expect(breaker.getState()).toBe('open');

      vi.advanceTimersByTime(1);
      const probe = await breaker.execute(async () => 'probe');
      expect(probe).toBe('probe');
      // probeCount=2，只成功 1 次仍在 half-open
      expect(breaker.getState()).toBe('half-open');
      expect(breaker.getMetrics().stateChanges).toBe(2);
    });

    it('half-open 的探测成功不递减 failureCount', async () => {
      const breaker = createBreaker();
      await failTimes(breaker, 3);
      vi.advanceTimersByTime(RECOVERY_TIMEOUT);

      await breaker.execute(async () => 'probe-1');

      expect(breaker.getState()).toBe('half-open');
      expect(breaker.getFailureCount()).toBe(3);
      expect(breaker.getMetrics().successCount).toBe(1);
    });

    it('累计 probeCount 次探测成功后关闭并清零 failureCount', async () => {
      const breaker = createBreaker();
      await failTimes(breaker, 3);
      vi.advanceTimersByTime(RECOVERY_TIMEOUT);

      await breaker.execute(async () => 'probe-1');
      await breaker.execute(async () => 'probe-2');

      expect(breaker.getState()).toBe('closed');
      expect(breaker.getFailureCount()).toBe(0);
      expect(breaker.getMetrics().stateChanges).toBe(3);
    });

    it('half-open 探测失败立即重开，并重置探测进度', async () => {
      const breaker = createBreaker();
      await failTimes(breaker, 3);
      vi.advanceTimersByTime(RECOVERY_TIMEOUT);
      await breaker.execute(async () => 'probe-1');
      expect(breaker.getState()).toBe('half-open');

      await failTimes(breaker, 1);

      expect(breaker.getState()).toBe('open');
      expect(breaker.getFailureCount()).toBe(4);
      expect(breaker.getMetrics().stateChanges).toBe(3);

      // 进度被清零：再次恢复后只成功 1 次不应直接 closed
      vi.advanceTimersByTime(RECOVERY_TIMEOUT);
      await breaker.execute(async () => 'probe-again');
      expect(breaker.getState()).toBe('half-open');
      expect(breaker.getMetrics().stateChanges).toBe(4);
    });

    it('被拒绝的请求不刷新 lastStateChange，不推迟恢复时间点', async () => {
      const breaker = createBreaker();
      await failTimes(breaker, 3);

      vi.advanceTimersByTime(RECOVERY_TIMEOUT - 400);
      const rejected = await settle(breaker.execute(async () => 'ok'));
      expect(rejected.ok).toBe(false);
      expect(breaker.getMetrics().rejectedCount).toBe(1);

      // 仍在原开闸时刻 + 1000ms 到点恢复
      vi.advanceTimersByTime(400);
      const probe = await breaker.execute(async () => 'ok');
      expect(probe).toBe('ok');
      expect(breaker.getState()).toBe('half-open');
      expect(breaker.getMetrics().stateChanges).toBe(2);
    });
  });

  describe('健康度与控制接口', () => {
    it('isHealthy 以阈值 50% 为界（3 → 1.5）', async () => {
      const breaker = createBreaker();
      expect(breaker.isHealthy()).toBe(true);

      await failTimes(breaker, 1);
      expect(breaker.isHealthy()).toBe(true); // 1 < 1.5

      await failTimes(breaker, 1);
      expect(breaker.isHealthy()).toBe(false); // 2 >= 1.5
      expect(breaker.getState()).toBe('closed');

      breaker.forceOpen();
      expect(breaker.isHealthy()).toBe(false);

      breaker.forceClosed();
      expect(breaker.isHealthy()).toBe(true);
    });

    it('forceOpen 保留 failureCount，forceClosed 清零', async () => {
      const breaker = createBreaker();
      await failTimes(breaker, 3);

      breaker.forceOpen();
      expect(breaker.getState()).toBe('open');
      expect(breaker.getFailureCount()).toBe(3);

      breaker.forceClosed();
      expect(breaker.getState()).toBe('closed');
      expect(breaker.getFailureCount()).toBe(0);
      expect(breaker.getMetrics().stateChanges).toBe(3);
    });

    it('reset 清理运行时状态但保留累计指标', async () => {
      const breaker = createBreaker();
      await failTimes(breaker, 3);
      expect(breaker.getState()).toBe('open');

      breaker.reset();

      expect(breaker.getState()).toBe('closed');
      expect(breaker.getFailureCount()).toBe(0);
      expect(breaker.getMetrics().failureCount).toBe(3);
      expect(breaker.getMetrics().stateChanges).toBe(1);

      await breaker.execute(async () => 'after-reset');
      expect(breaker.getMetrics().successCount).toBe(1);
      expect(breaker.getFailureCount()).toBe(0);
    });

    it('getConfig/getMetrics 返回防御性副本，键集合与接口一致', () => {
      const breaker = createBreaker();

      const config: CircuitBreakerConfig = breaker.getConfig();
      const metrics: CircuitMetrics = breaker.getMetrics();
      const state: CircuitState = breaker.getState();

      expect(state).toBe('closed');
      expect(Object.keys(config).sort()).toEqual([
        'failureThreshold',
        'fallbackEnabled',
        'monitoringWindow',
        'probeCount',
        'recoveryTimeout',
      ]);
      expect(Object.keys(metrics).sort()).toEqual([
        'avgResponseTime',
        'failureCount',
        'lastFailureTime',
        'rejectedCount',
        'stateChanges',
        'successCount',
        'totalRequests',
      ]);

      config.failureThreshold = 99;
      metrics.totalRequests = 99;
      expect(breaker.getConfig().failureThreshold).toBe(3);
      expect(breaker.getMetrics().totalRequests).toBe(0);
    });
  });

  describe('默认配置', () => {
    it('默认阈值/超时/探测数/窗口/回退开关', () => {
      const breaker = new MarketCircuitBreaker();
      const config = breaker.getConfig();

      expect(config.failureThreshold).toBe(5);
      expect(config.recoveryTimeout).toBe(30000);
      expect(config.probeCount).toBe(3);
      expect(config.monitoringWindow).toBe(60000);
      expect(config.fallbackEnabled).toBe(true);
    });

    it('默认实例在第 5 次失败打开，30000ms 后 3 次探测成功关闭', async () => {
      const breaker = new MarketCircuitBreaker();

      await failTimes(breaker, 4);
      expect(breaker.getState()).toBe('closed');

      await failTimes(breaker, 1);
      expect(breaker.getState()).toBe('open');

      vi.advanceTimersByTime(29999);
      const early = await settle(breaker.execute(async () => 'probe'));
      expect(early.ok).toBe(false);
      expect(breaker.getState()).toBe('open');

      vi.advanceTimersByTime(1);
      await breaker.execute(async () => 'probe-1');
      expect(breaker.getState()).toBe('half-open');
      await breaker.execute(async () => 'probe-2');
      expect(breaker.getState()).toBe('half-open');
      await breaker.execute(async () => 'probe-3');
      expect(breaker.getState()).toBe('closed');
      expect(breaker.getFailureCount()).toBe(0);
    });
  });
});
