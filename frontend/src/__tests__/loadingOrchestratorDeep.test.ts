/**
 * 加载编排器深度测试 — 影子测试迁移（本文件）
 *
 * 旧文件内联了一份与生产同名的假 LoadingOrchestrator（458 行里 130 行是副本）：
 * 自带 per-key states: Map、start(key,maxRetries) 返回状态、success/error/timeoutHandler、
 * retry/canRetry、getDuration(key)、isLoading/isAnyLoading、clear(key) 等，断言全部打在副本上。
 * 现改为 import 生产实现；生产 frontend/src/utils/loadingOrchestrator.ts 的契约不同，逐条订正如下。
 *
 * 已绑定生产实现：
 * - frontend/src/utils/loadingOrchestrator.ts:36-184  LoadingOrchestrator
 *     :45-53   register(id, label, priority='normal', timeout=10000)
 *     :58-70   start(id): void（必须先 register；首次 start 启 1s 轮询）
 *     :75-82   complete(id): void        （对应旧 success）
 *     :87-95   fail(id, error): void     （对应旧 error）
 *     :100-118 getState(): { phase, tasks, progress, elapsed, isStale }
 *              progress = round(done/total*100)，done 只算 success|error；空任务集 => 100
 *     :123-126 subscribe(listener): 退订函数
 *     :131-141 reset()（任务对象保留，状态归 idle；不删除）
 *     :146-148 getCriticalTasks()
 *     :155-161 checkAllDone（timeout 也算完成，用于停轮询）
 *     :163-176 超时轮询 setInterval 1000ms：loading 且 now-startTime > timeout => timeout
 * - frontend/src/utils/loadingOrchestrator.ts:188-229  FirstPaintTimer
 *     :192-195 start / :197-199 mark / :201-205 getDuration(from='start', to?) /
 *     :221-223 meetsTarget / :225-228 reset
 * - frontend/src/services/retryUtility.ts:31-60  withRetry
 *     :22-29   DEFAULT_CONFIG（maxRetries 3 / baseDelay 1000 / backoffFactor 2 / jitter true）
 *     :39      循环 attempt=0..maxRetries（含首调用）
 *     :44      RetryResult.attempts = attempt + 1（总调用次数）
 *     :50      attempt >= maxRetries 时 break
 *     :53-55   calculateDelay + onRetry(attempt+1, error, delay) + sleep
 *     :59      最终 throw lastError
 * - frontend/src/utils/loadingOrchestrator.ts:233-304  FeedbackManager / :308-309 默认单例
 *     FeedbackManager 的行为已在 loadingOrchestrator.test.ts:102、errorRecovery.test.ts:409、
 *     loadingAndErrorProper.test.ts:270 三处覆盖，本文件不重复造第四份；只做导出单例的绑定断言。
 *
 * 口径订正（旧内联 → 生产真源）：
 * | 旧内联 | 生产 |
 * | start(key, maxRetries) 返回 LoadingState | start(id): void，且必须先 register(id,label,priority,timeout)（:45,:58） |
 * | 状态含 key/attempts/maxRetries 字段 | LoadingTask 只有 id/label/priority/timeout/status/startTime/endTime/error（:15-24） |
 * | success(key) | complete(id)（:75） |
 * | error(key, msg) | fail(id, msg)（:87） |
 * | timeoutHandler(key) 手动置 timeout | 生产无手动入口，由 1s 轮询自动置 timeout（:164-175） |
 * | getState(key) 取单 key | getState() 返回聚合视图，单 key 需 tasks.find（:100-118） |
 * | getDuration(key) | 无 per-key 耗时；由 FirstPaintTimer.getDuration(from,to) 计时（:201-205） |
 * | isLoading/isAnyLoading | task.status==='loading' / state.phase==='loading'（:111-115） |
 * | clear(key)/clearAll() 删除状态 | reset() 不删除任务，只归 idle 并停轮询（:131-141） |
 * | onStateChange(key, state) 双参 | subscribe(state) 单参（:123-126） |
 * | retry(key) 返回 null 表示超限 | withRetry 抛最后错误（retryUtility.ts:59），attempts 为总调用次数（:44） |
 * | canRetry(key) 布尔 | retryCondition(error) + maxRetries；maxRetries=0 => 零重试（:39,:50-51） |
 * | getDuration('nonexistent') === null | getDuration(from,to) 缺 mark 时取 0，同一缺失点返回 0（:202-204） |
 *
 * 未迁移（生产无同契约 API，已改绑生产等价行为，不保留内联副本）：
 * 1) per-key 手动 retry()/canRetry()：生产 LoadingOrchestrator 无重试概念；
 *    仓库唯一带 attempts 的重试实现是 services/retryUtility.ts:31 withRetry，重试段整体改绑它。
 * 2) per-key 删除 clear(key)：生产 reset() 只归零不删除（:131-141），
 *    用例改为断言 reset() 后该 key 归 idle（对象仍在）。
 * 3) timeoutHandler 手动触发：生产是内部 1s 轮询，改用假定时器驱动，不再手调。
 *
 * 第二轮补测（batch43 迁移后追加；全部对应生产真实可观测行为，未新增任何本地 mock）：
 * 1) 空态初始化：tasks=[], phase='idle', progress=100, elapsed=0, isStale=false（:100-118）。
 * 2) elapsed 从首个 start 的 startTime 起算；第二个任务 start 不重置起点（:64-67, :105）。
 * 3) isStale 负例：仅 priority='critical' 且 status='loading' 才可能为 true（:108-109）；
 *    普通任务超时、critical 已置 timeout 后均为 false。
 * 4) 全部任务完成 => checkAllDone 停轮询（:155-161）；此后 start 的新任务不会重启轮询
 *    （:64-67 仅在 startTime===0 时启动），新任务在 reset() 前永不超时。
 * 5) phase 优先级 loading > error > timeout > success > idle（:111-115）；
 *    error 与 timeout 并存取 error；timeout 不计入 progress（:102）。
 * 6) 同 id 重复 register 覆盖为全新 idle 任务且不 notify（:45-53）。
 * 7) FirstPaintTimer.getReport()/reset()（:210-216, :225-228）。
 *
 * 本地保留业务规则：无。
 *
 * 发现的生产缺陷（只记录不修）：
 * 1) progress 的 done 只算 success|error（:102），但 checkAllDone 把 timeout 当完成（:157）：
 *    任务全部超时后轮询已停、phase='timeout'，progress 却停在 <100（本文件用例固定该行为）。
 * 2) 超时检测粒度 1s（:175），且 isStale 只对 priority='critical' 且 status='loading' 生效（:108-109）：
 *    普通任务照样会被轮询置 timeout，而 critical 的 isStale 只在 timeout 到期与下一次 tick 之间可观测。
 * 3) fail 后再次 start 不清 error、不重置 endTime（:58-70 只写 status/startTime）：
 *    手动重试成功后任务仍带着上一次的 error。
 * 4) FirstPaintTimer.getDuration 在 from 未 mark 时 fromTime=0，to 缺省取 performance.now()（:202-204）：
 *    未 start 就调用返回「进程启动至今」的毫秒数而非 0；meetsTarget 此时几乎恒为 true。
 * 5) reset() 不删除任务（:131-141），reset 后 tasks.length 不变，与「clear」语义不符；
 *    register 对同一 id 重复注册会直接覆盖，旧状态丢失且不通知。
 * 6) notify() 每次状态变更都全量 getState()（:150-153），内部多次遍历 tasks 并各取一次当前时间戳，O(n) 重复计算。
 * 7) checkAllDone 停轮询后，start 新任务不会重启轮询（:64-67 仅 startTime===0 才启动）：
 *    长生命周期单例 defaultOrchestrator 一旦全量完成，后续新任务永不超时，必须手动 reset()。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  LoadingOrchestrator,
  FirstPaintTimer,
  FeedbackManager,
  defaultOrchestrator,
  defaultFeedback,
} from '../utils/loadingOrchestrator';
import { withRetry } from '../services/retryUtility';

const T0 = 1_700_000_000_000;

// ==================== 基础状态管理 ====================

describe('LoadingOrchestrator 基础状态管理', () => {
  let orchestrator: LoadingOrchestrator;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['performance', 'Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(T0);
    orchestrator = new LoadingOrchestrator();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('start应创建loading状态', () => {
    orchestrator.register('test-key', '测试任务');
    orchestrator.start('test-key');

    const state = orchestrator.getState();
    const task = state.tasks.find((t) => t.id === 'test-key');
    expect(task?.status).toBe('loading');
    expect(task?.id).toBe('test-key');
    expect(state.phase).toBe('loading');
  });

  it('start应支持自定义maxRetries', () => {
    // 生产无 maxRetries，等价配置是 register 的 priority + 单任务 timeout
    orchestrator.register('key1', '任务1', 'critical', 500);
    orchestrator.start('key1');

    const task = orchestrator.getState().tasks.find((t) => t.id === 'key1');
    expect(task?.timeout).toBe(500);
    expect(task?.priority).toBe('critical');
  });

  it('success应将状态改为success', () => {
    orchestrator.register('key1', '任务1');
    orchestrator.start('key1');
    vi.setSystemTime(T0 + 500);
    orchestrator.complete('key1');

    const state = orchestrator.getState();
    const task = state.tasks.find((t) => t.id === 'key1');
    expect(task?.status).toBe('success');
    expect(task?.endTime).toBe(T0 + 500);
    expect(state.phase).toBe('success');
  });

  it('error应将状态改为error并记录错误信息', () => {
    orchestrator.register('key1', '任务1');
    orchestrator.start('key1');
    orchestrator.fail('key1', '网络错误');

    const state = orchestrator.getState();
    const task = state.tasks.find((t) => t.id === 'key1');
    expect(task?.status).toBe('error');
    expect(task?.error).toBe('网络错误');
    expect(state.phase).toBe('error');
  });

  it('操作不存在的key应返回null', () => {
    // 生产方法签名是 void，未注册 id 静默 no-op（不是返回 null）
    expect(() => orchestrator.start('nonexistent')).not.toThrow();
    expect(() => orchestrator.complete('nonexistent')).not.toThrow();
    expect(() => orchestrator.fail('nonexistent', 'err')).not.toThrow();
    expect(orchestrator.getState().tasks).toHaveLength(0);
    expect(orchestrator.getState().phase).toBe('idle');
  });

  it('getState应返回正确状态', () => {
    orchestrator.register('key1', '任务1');
    orchestrator.start('key1');

    expect(orchestrator.getState().tasks.find((t) => t.id === 'key1')?.status).toBe('loading');
    expect(orchestrator.getState().tasks.find((t) => t.id === 'key2')).toBeUndefined();
  });

  it('startTime应在start时设置', () => {
    orchestrator.register('key1', '任务1');
    orchestrator.start('key1');

    const task = orchestrator.getState().tasks.find((t) => t.id === 'key1');
    expect(task?.startTime).toBe(T0);

    vi.setSystemTime(T0 + 250);
    orchestrator.complete('key1');
    expect(orchestrator.getState().tasks.find((t) => t.id === 'key1')?.endTime).toBe(T0 + 250);
  });
});

// ==================== 重试机制（生产唯一实现：services/retryUtility.withRetry） ====================

describe('LoadingOrchestrator 重试机制', () => {
  const fastConfig = { baseDelay: 0, backoffFactor: 1, jitter: false } as const;

  it('retry应增加attempts计数', async () => {
    let calls = 0;
    const onRetry = vi.fn();
    const result = await withRetry(
      async () => {
        calls += 1;
        if (calls === 1) throw new Error('fail');
        return 'ok';
      },
      { ...fastConfig, maxRetries: 3, onRetry }
    );

    // 生产 attempts = 总调用次数（首次 + 1 次重试 = 2），不是重试次数
    expect(result.attempts).toBe(2);
    expect(calls).toBe(2);
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error), 0);
    expect(result.result).toBe('ok');
  });

  it('多次retry应累计attempts', async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls += 1;
        if (calls <= 2) throw new Error('fail');
        return 'ok';
      },
      { ...fastConfig, maxRetries: 5 }
    );

    expect(result.attempts).toBe(3);
    expect(calls).toBe(3);
  });

  it('超过maxRetries时retry应返回null', async () => {
    // 旧内联返回 null；生产抛出最后一次错误（retryUtility.ts:59），maxRetries=2 => 共 3 次调用
    let calls = 0;
    const run = withRetry(
      async () => {
        calls += 1;
        throw new Error('boom');
      },
      { ...fastConfig, maxRetries: 2 }
    );

    await expect(run).rejects.toThrow('boom');
    expect(calls).toBe(3);
  });

  it('canRetry应正确判断是否可重试', async () => {
    // 生产用 retryCondition 决定是否继续，而不是 canRetry(key)
    let blockedCalls = 0;
    const blocked = withRetry(
      async () => {
        blockedCalls += 1;
        throw new Error('blocked');
      },
      { ...fastConfig, maxRetries: 5, retryCondition: () => false }
    );
    await expect(blocked).rejects.toThrow('blocked');
    expect(blockedCalls).toBe(1);

    let retryableCalls = 0;
    const retryable = await withRetry(
      async () => {
        retryableCalls += 1;
        if (retryableCalls === 1) throw new Error('again');
        return 'ok';
      },
      { ...fastConfig, maxRetries: 1, retryCondition: () => true }
    );
    expect(retryableCalls).toBe(2);
    expect(retryable.attempts).toBe(2);
  });

  it('canRetry对不存在的key返回false', async () => {
    // 生产没有 key 概念；不可重试等价于 maxRetries=0（零次重试，只调用 1 次）
    const fn = vi.fn(async () => {
      throw new Error('no-retry');
    });
    await expect(withRetry(fn, { ...fastConfig, maxRetries: 0 })).rejects.toThrow('no-retry');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retry后应清除error信息', async () => {
    // 生产成功时 RetryResult 不含 error 字段，重试期间的错误只经 onRetry 外抛
    const onRetry = vi.fn();
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls += 1;
        if (calls === 1) throw new Error('网络错误');
        return 'ok';
      },
      { ...fastConfig, maxRetries: 3, onRetry }
    );

    expect(result).not.toHaveProperty('error');
    expect(result.result).toBe('ok');
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect((onRetry.mock.calls[0][1] as Error).message).toBe('网络错误');
  });

  it('retry后应重置endTime', async () => {
    // 生产无 endTime，只有一个跨全部尝试的 totalTime（retryUtility.ts:45）
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls += 1;
        if (calls === 1) throw new Error('fail');
        return 'ok';
      },
      { ...fastConfig, maxRetries: 3 }
    );

    expect(result.attempts).toBe(2);
    expect(typeof result.totalTime).toBe('number');
    expect(result.totalTime).toBeGreaterThanOrEqual(0);
  });
});

// ==================== 超时控制（生产 1s 轮询） ====================

describe('LoadingOrchestrator 超时控制', () => {
  let orchestrator: LoadingOrchestrator;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['performance', 'Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(T0);
    orchestrator = new LoadingOrchestrator();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('timeoutHandler应将状态改为timeout', () => {
    // 生产由 setInterval(1000) 自动置 timeout（:168-172），timeout=500 时 1s tick 即命中
    orchestrator.register('key1', '任务1', 'normal', 500);
    orchestrator.start('key1');
    vi.advanceTimersByTime(1000);

    const task = orchestrator.getState().tasks.find((t) => t.id === 'key1');
    expect(task?.status).toBe('timeout');
    expect(task?.endTime).toBeDefined();
  });

  it('非loading状态不应被超时', () => {
    orchestrator.register('key1', '任务1', 'normal', 500);
    orchestrator.start('key1');
    orchestrator.complete('key1');
    vi.advanceTimersByTime(5000);

    expect(orchestrator.getState().tasks.find((t) => t.id === 'key1')?.status).toBe('success');
  });

  it('不存在的key超时应返回null', () => {
    // 未注册 id 的 start 是 no-op，也不会有轮询产生
    orchestrator.start('nonexistent');
    vi.advanceTimersByTime(5000);

    const state = orchestrator.getState();
    expect(state.tasks).toHaveLength(0);
    expect(state.phase).toBe('idle');
  });

  it('critical任务到期但未到下一个tick时应标记isStale', () => {
    // 生产 isStale 只对 critical + loading 生效（:108-109）；timeout=1500，
    // 1600ms 时 1s tick 尚未把它置 timeout，isStale 为 true
    orchestrator.register('critical-key', '关键任务', 'critical', 1500);
    orchestrator.start('critical-key');
    vi.advanceTimersByTime(1600);

    const state = orchestrator.getState();
    const task = state.tasks.find((t) => t.id === 'critical-key');
    expect(task?.status).toBe('loading');
    expect(state.isStale).toBe(true);
  });

  it('超时任务不计入progress（生产口径，见文件头缺陷 1）', () => {
    orchestrator.register('key1', '任务1', 'normal', 500);
    orchestrator.register('key2', '任务2', 'normal', 500);
    orchestrator.start('key1');
    orchestrator.start('key2');
    orchestrator.complete('key1');
    vi.advanceTimersByTime(1000);

    const state = orchestrator.getState();
    expect(state.tasks.find((t) => t.id === 'key2')?.status).toBe('timeout');
    expect(state.progress).toBe(50);
    expect(state.phase).toBe('timeout');
  });
});

// ==================== 批量操作 ====================

describe('LoadingOrchestrator 批量操作', () => {
  let orchestrator: LoadingOrchestrator;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['performance', 'Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(T0);
    orchestrator = new LoadingOrchestrator();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('getAllStates应返回所有状态', () => {
    orchestrator.register('key1', '任务1');
    orchestrator.register('key2', '任务2');
    orchestrator.register('key3', '任务3');

    const tasks = orchestrator.getState().tasks;
    expect(tasks).toHaveLength(3);
    expect(tasks.every((t) => t.status === 'idle')).toBe(true);
  });

  it('getLoadingKeys应只返回loading中的key', () => {
    orchestrator.register('key1', '任务1');
    orchestrator.register('key2', '任务2');
    orchestrator.register('key3', '任务3');
    orchestrator.start('key1');
    orchestrator.start('key2');
    orchestrator.start('key3');
    orchestrator.complete('key2');

    const loadingKeys = orchestrator
      .getState()
      .tasks.filter((t) => t.status === 'loading')
      .map((t) => t.id);
    expect(loadingKeys).toContain('key1');
    expect(loadingKeys).toContain('key3');
    expect(loadingKeys).not.toContain('key2');
  });

  it('getErrorKeys应只返回error状态的key', () => {
    orchestrator.register('key1', '任务1');
    orchestrator.register('key2', '任务2');
    orchestrator.start('key1');
    orchestrator.start('key2');
    orchestrator.fail('key1', 'fail');

    const errorKeys = orchestrator
      .getState()
      .tasks.filter((t) => t.status === 'error')
      .map((t) => t.id);
    expect(errorKeys).toContain('key1');
    expect(errorKeys).not.toContain('key2');
  });

  it('isAnyLoading应正确检测是否有加载中', () => {
    orchestrator.register('key1', '任务1');
    expect(orchestrator.getState().phase).toBe('idle');
    orchestrator.start('key1');
    expect(orchestrator.getState().phase).toBe('loading');
    orchestrator.complete('key1');
    expect(orchestrator.getState().phase).toBe('success');
  });

  it('isLoading应检测指定key的加载状态', () => {
    orchestrator.register('key1', '任务1');
    orchestrator.start('key1');
    expect(orchestrator.getState().tasks.find((t) => t.id === 'key1')?.status).toBe('loading');
    expect(orchestrator.getState().tasks.find((t) => t.id === 'key2')).toBeUndefined();
    orchestrator.complete('key1');
    expect(orchestrator.getState().tasks.find((t) => t.id === 'key1')?.status).toBe('success');
  });

  it('clear应移除指定key的状态', () => {
    // 生产无 per-key 删除；reset() 把任务归 idle 但保留对象（:131-141）
    orchestrator.register('key1', '任务1');
    orchestrator.start('key1');
    orchestrator.reset();

    const task = orchestrator.getState().tasks.find((t) => t.id === 'key1');
    expect(task).toBeDefined();
    expect(task?.status).toBe('idle');
    expect(orchestrator.getState().phase).toBe('idle');
    expect(orchestrator.getState().elapsed).toBe(0);
  });

  it('clearAll应移除所有状态', () => {
    // 旧断言 tasks 长度归 0；生产 reset 后任务对象仍在（全部 idle）
    orchestrator.register('key1', '任务1');
    orchestrator.register('key2', '任务2');
    orchestrator.start('key1');
    orchestrator.start('key2');
    orchestrator.reset();

    const state = orchestrator.getState();
    expect(state.tasks).toHaveLength(2);
    expect(state.tasks.every((t) => t.status === 'idle')).toBe(true);
    expect(state.progress).toBe(0);
    expect(state.elapsed).toBe(0);
  });
});

// ==================== 回调通知 ====================

describe('LoadingOrchestrator 回调通知', () => {
  let orchestrator: LoadingOrchestrator;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['performance', 'Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(T0);
    orchestrator = new LoadingOrchestrator();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('start时应触发onStateChange回调', () => {
    const callback = vi.fn();
    orchestrator.subscribe(callback);
    orchestrator.register('key1', '任务1');
    orchestrator.start('key1');

    expect(callback).toHaveBeenCalled();
    const lastState = callback.mock.calls[callback.mock.calls.length - 1][0];
    expect(lastState.tasks.find((t: { id: string }) => t.id === 'key1')?.status).toBe('loading');
  });

  it('success时应触发onStateChange回调', () => {
    const callback = vi.fn();
    orchestrator.subscribe(callback);
    orchestrator.register('key1', '任务1');
    orchestrator.start('key1');
    callback.mockClear();
    orchestrator.complete('key1');

    const lastState = callback.mock.calls[callback.mock.calls.length - 1][0];
    expect(lastState.phase).toBe('success');
  });

  it('error时应触发onStateChange回调', () => {
    const callback = vi.fn();
    orchestrator.subscribe(callback);
    orchestrator.register('key1', '任务1');
    orchestrator.start('key1');
    callback.mockClear();
    orchestrator.fail('key1', 'fail');

    const lastState = callback.mock.calls[callback.mock.calls.length - 1][0];
    expect(lastState.phase).toBe('error');
  });

  it('subscribe返回的退订函数应停止通知', () => {
    const callback = vi.fn();
    const unsubscribe = orchestrator.subscribe(callback);
    unsubscribe();
    orchestrator.register('key1', '任务1');
    orchestrator.start('key1');

    expect(callback).not.toHaveBeenCalled();
  });
});

// ==================== 耗时计算（FirstPaintTimer） ====================

describe('LoadingOrchestrator 耗时计算', () => {
  let now = 0;

  beforeEach(() => {
    now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('未开始的key耗时应为null', () => {
    // 生产 getDuration 缺 mark 时 from/to 都取 0（:202-204），返回 0 而不是 null
    now = 1000;
    const timer = new FirstPaintTimer();
    expect(timer.getDuration('nonexistent', 'nonexistent')).toBe(0);
  });

  it('loading中应有实时耗时', () => {
    now = 1000;
    const timer = new FirstPaintTimer();
    timer.start();
    now = 1500;

    const duration = timer.getDuration();
    expect(duration).toBe(500);
    expect(duration).toBeGreaterThanOrEqual(0);
  });

  it('已完成的应有总耗时', () => {
    now = 1000;
    const timer = new FirstPaintTimer();
    timer.start();
    now = 1600;
    timer.mark('done');
    now = 2000;

    expect(timer.getDuration('start', 'done')).toBe(600);
  });

  it('meetsTarget应按3秒阈值判定首屏目标', () => {
    now = 1000;
    const timer = new FirstPaintTimer();
    timer.start();
    now = 2000;
    expect(timer.meetsTarget()).toBe(true);
    now = 5000;
    expect(timer.meetsTarget()).toBe(false);
  });
});

// ==================== 级联加载 ====================

describe('级联加载策略', () => {
  let orchestrator: LoadingOrchestrator;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['performance', 'Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(T0);
    orchestrator = new LoadingOrchestrator();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('应支持顺序执行多个加载任务', () => {
    const keys = ['data1', 'data2', 'data3'];
    keys.forEach((key) => orchestrator.register(key, key));

    const results: string[] = [];
    for (const key of keys) {
      orchestrator.start(key);
      results.push(key);
      orchestrator.complete(key);
    }

    expect(results).toEqual(['data1', 'data2', 'data3']);
    const state = orchestrator.getState();
    expect(state.tasks.every((t) => t.status === 'success')).toBe(true);
    expect(state.phase).toBe('success');
    expect(state.progress).toBe(100);
  });

  it('一个失败不应阻止其他任务', () => {
    ['key1', 'key2', 'key3'].forEach((key) => orchestrator.register(key, key));
    ['key1', 'key2', 'key3'].forEach((key) => orchestrator.start(key));

    orchestrator.fail('key2', 'fail');
    orchestrator.complete('key1');
    orchestrator.complete('key3');

    const state = orchestrator.getState();
    const errors = state.tasks.filter((t) => t.status === 'error');
    expect(errors).toHaveLength(1);
    expect(errors[0].id).toBe('key2');
    expect(state.phase).toBe('error');
    expect(state.progress).toBe(100);
  });

  it('应支持并行加载后收集结果', () => {
    const keys = ['stock-list', 'market-index', 'news'];
    keys.forEach((key) => orchestrator.register(key, key));
    keys.forEach((key) => orchestrator.start(key));

    let state = orchestrator.getState();
    expect(state.tasks.filter((t) => t.status === 'loading')).toHaveLength(3);
    expect(state.phase).toBe('loading');
    expect(state.progress).toBe(0);

    orchestrator.complete('stock-list');
    orchestrator.complete('market-index');
    state = orchestrator.getState();
    expect(state.tasks.filter((t) => t.status === 'loading')).toHaveLength(1);
    expect(state.progress).toBe(67);

    orchestrator.complete('news');
    state = orchestrator.getState();
    expect(state.phase).toBe('success');
    expect(state.progress).toBe(100);
  });

  it('进度聚合应把失败计入已完成', () => {
    ['a', 'b', 'c', 'd'].forEach((key) => orchestrator.register(key, key));
    orchestrator.start('a');
    orchestrator.start('b');
    orchestrator.start('c');
    orchestrator.complete('a');
    orchestrator.complete('b');
    orchestrator.fail('c', 'boom');

    // done = success|error = 3 / 4 => 75；idle 的 d 不计入
    expect(orchestrator.getState().progress).toBe(75);
    expect(orchestrator.getState().phase).toBe('error');
  });

  it('getCriticalTasks应只返回关键任务', () => {
    orchestrator.register('n1', '普通1');
    orchestrator.register('c1', '关键1', 'critical');
    orchestrator.register('n2', '普通2', 'low');

    const critical = orchestrator.getCriticalTasks();
    expect(critical).toHaveLength(1);
    expect(critical[0].id).toBe('c1');
  });
});

// ==================== 初始化与 elapsed（补测） ====================

describe('LoadingOrchestrator 初始化与 elapsed', () => {
  let orchestrator: LoadingOrchestrator;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['performance', 'Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(T0);
    orchestrator = new LoadingOrchestrator();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('新建实例应为空态idle且progress为100', () => {
    const state = orchestrator.getState();
    expect(state.phase).toBe('idle');
    expect(state.tasks).toEqual([]);
    expect(state.progress).toBe(100);
    expect(state.elapsed).toBe(0);
    expect(state.isStale).toBe(false);
  });

  it('elapsed应从首个start起算且不被后续start重置', () => {
    orchestrator.register('a', 'A');
    orchestrator.register('b', 'B');

    orchestrator.start('a');
    vi.advanceTimersByTime(250);
    expect(orchestrator.getState().elapsed).toBe(250);

    orchestrator.start('b');
    vi.advanceTimersByTime(750);
    expect(orchestrator.getState().elapsed).toBe(1000);

    orchestrator.complete('a');
    orchestrator.complete('b');
    vi.advanceTimersByTime(500);
    expect(orchestrator.getState().elapsed).toBe(1500);
  });

  it('reset后elapsed归零且再次start重新计时', () => {
    orchestrator.register('a', 'A', 'normal', 10000);
    orchestrator.start('a');
    vi.advanceTimersByTime(800);
    expect(orchestrator.getState().elapsed).toBe(800);

    orchestrator.reset();
    expect(orchestrator.getState().elapsed).toBe(0);

    orchestrator.start('a');
    vi.advanceTimersByTime(300);
    expect(orchestrator.getState().elapsed).toBe(300);
  });
});

// ==================== isStale 负例与轮询边界（补测） ====================

describe('LoadingOrchestrator isStale 与轮询边界', () => {
  let orchestrator: LoadingOrchestrator;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['performance', 'Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(T0);
    orchestrator = new LoadingOrchestrator();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('isStale仅对critical且loading的任务成立', () => {
    orchestrator.register('normal', '普通', 'normal', 500);
    orchestrator.register('critical', '关键', 'critical', 1500);
    orchestrator.start('normal');
    orchestrator.start('critical');

    vi.advanceTimersByTime(1000);
    let state = orchestrator.getState();
    expect(state.tasks.find((t) => t.id === 'normal')?.status).toBe('timeout');
    expect(state.tasks.find((t) => t.id === 'critical')?.status).toBe('loading');
    expect(state.isStale).toBe(false);

    vi.advanceTimersByTime(600);
    state = orchestrator.getState();
    expect(state.tasks.find((t) => t.id === 'critical')?.status).toBe('loading');
    expect(state.isStale).toBe(true);

    vi.advanceTimersByTime(400);
    state = orchestrator.getState();
    expect(state.tasks.find((t) => t.id === 'critical')?.status).toBe('timeout');
    expect(state.isStale).toBe(false);
  });

  it('全部完成后轮询停止，新start的任务在reset前不会超时', () => {
    orchestrator.register('done', '已完成', 'normal', 10000);
    orchestrator.start('done');
    orchestrator.complete('done');

    orchestrator.register('late', '迟到任务', 'normal', 100);
    orchestrator.start('late');
    vi.advanceTimersByTime(5000);

    let state = orchestrator.getState();
    expect(state.tasks.find((t) => t.id === 'late')?.status).toBe('loading');
    expect(state.phase).toBe('loading');
    expect(state.isStale).toBe(false);

    orchestrator.reset();
    orchestrator.start('late');
    vi.advanceTimersByTime(1000);

    state = orchestrator.getState();
    expect(state.tasks.find((t) => t.id === 'late')?.status).toBe('timeout');
    expect(state.phase).toBe('timeout');
  });
});

// ==================== phase 优先级与进度口径（补测） ====================

describe('LoadingOrchestrator phase 优先级', () => {
  let orchestrator: LoadingOrchestrator;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['performance', 'Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(T0);
    orchestrator = new LoadingOrchestrator();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('error与timeout并存时phase取error且timeout不计入progress', () => {
    orchestrator.register('t', '超时任务', 'normal', 100);
    orchestrator.register('e', '失败任务', 'normal', 10000);
    orchestrator.start('t');
    orchestrator.start('e');
    vi.advanceTimersByTime(1000);
    orchestrator.fail('e', 'boom');

    const state = orchestrator.getState();
    expect(state.tasks.find((x) => x.id === 't')?.status).toBe('timeout');
    expect(state.tasks.find((x) => x.id === 'e')?.status).toBe('error');
    expect(state.phase).toBe('error');
    expect(state.progress).toBe(50);
  });

  it('success与idle并存时phase仍为idle', () => {
    orchestrator.register('a', 'A');
    orchestrator.register('b', 'B');
    orchestrator.start('a');
    orchestrator.complete('a');

    const state = orchestrator.getState();
    expect(state.phase).toBe('idle');
    expect(state.progress).toBe(50);
  });
});

// ==================== 注册与订阅边界（补测） ====================

describe('LoadingOrchestrator 注册与订阅边界', () => {
  let orchestrator: LoadingOrchestrator;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['performance', 'Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(T0);
    orchestrator = new LoadingOrchestrator();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('同id重复register覆盖为全新idle任务且不通知', () => {
    const listener = vi.fn();
    orchestrator.subscribe(listener);
    orchestrator.register('k', '旧标签', 'low', 1000);
    orchestrator.start('k');
    listener.mockClear();

    orchestrator.register('k', '新标签', 'critical', 200);

    const state = orchestrator.getState();
    expect(state.tasks).toHaveLength(1);
    expect(state.tasks[0].label).toBe('新标签');
    expect(state.tasks[0].priority).toBe('critical');
    expect(state.tasks[0].timeout).toBe(200);
    expect(state.tasks[0].status).toBe('idle');
    expect(state.tasks[0].startTime).toBeUndefined();
    expect(listener).not.toHaveBeenCalled();
  });

  it('多订阅者互不影响且重复退订安全', () => {
    const first = vi.fn();
    const second = vi.fn();
    const unsubscribeFirst = orchestrator.subscribe(first);
    orchestrator.subscribe(second);

    orchestrator.register('k', 'K');
    orchestrator.start('k');
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);

    unsubscribeFirst();
    expect(() => unsubscribeFirst()).not.toThrow();

    orchestrator.complete('k');
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);
  });
});

// ==================== FirstPaintTimer 报告与重置（补测） ====================

describe('FirstPaintTimer 报告与重置', () => {
  let now = 0;

  beforeEach(() => {
    now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('getReport应返回各mark相对startMark的取整毫秒', () => {
    now = 1000;
    const timer = new FirstPaintTimer();
    timer.start();
    now = 1250.6;
    timer.mark('api');
    now = 1800.2;
    timer.mark('render');

    expect(timer.getReport()).toEqual({ start: 0, api: 251, render: 800 });
  });

  it('reset应清空marks且未start时getDuration退化为绝对时间', () => {
    now = 1000;
    const timer = new FirstPaintTimer();
    timer.start();
    now = 3000;
    timer.reset();

    expect(timer.getReport()).toEqual({});
    expect(timer.getDuration('start', 'start')).toBe(0);
    expect(timer.getDuration()).toBe(3000);
  });
});

// ==================== 模块默认导出（补测） ====================

describe('模块默认导出绑定', () => {
  it('默认单例应为生产类实例且与新建实例独立', () => {
    expect(defaultOrchestrator).toBeInstanceOf(LoadingOrchestrator);
    expect(defaultFeedback).toBeInstanceOf(FeedbackManager);
    expect(defaultOrchestrator).not.toBe(new LoadingOrchestrator());
    expect(defaultFeedback).not.toBe(new FeedbackManager());
  });
});
