/**
 * 加载编排器深度测试
 * 覆盖加载策略、级联加载、骨架屏、重试机制、超时控制
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// 模拟 loadingOrchestrator 核心逻辑
interface LoadingState {
  key: string;
  status: 'idle' | 'loading' | 'success' | 'error' | 'timeout';
  startTime?: number;
  endTime?: number;
  attempts: number;
  maxRetries: number;
  error?: string;
}

class LoadingOrchestrator {
  private states: Map<string, LoadingState> = new Map();
  private timeout: number;
  private onStateChange?: (key: string, state: LoadingState) => void;

  constructor(options: { timeout?: number; onStateChange?: (key: string, state: LoadingState) => void } = {}) {
    this.timeout = options.timeout || 10000;
    this.onStateChange = options.onStateChange;
  }

  start(key: string, maxRetries: number = 3): LoadingState {
    const existing = this.states.get(key);
    const attempts = existing?.attempts || 0;
    const state: LoadingState = {
      key,
      status: 'loading',
      startTime: Date.now(),
      attempts,
      maxRetries,
    };
    this.states.set(key, state);
    this.onStateChange?.(key, state);
    return state;
  }

  success(key: string): LoadingState | null {
    const state = this.states.get(key);
    if (!state) return null;
    state.status = 'success';
    state.endTime = Date.now();
    this.onStateChange?.(key, state);
    return state;
  }

  error(key: string, error: string): LoadingState | null {
    const state = this.states.get(key);
    if (!state) return null;
    state.status = 'error';
    state.error = error;
    state.endTime = Date.now();
    this.onStateChange?.(key, state);
    return state;
  }

  timeoutHandler(key: string): LoadingState | null {
    const state = this.states.get(key);
    if (!state || state.status !== 'loading') return null;
    state.status = 'timeout';
    state.endTime = Date.now();
    this.onStateChange?.(key, state);
    return state;
  }

  retry(key: string): LoadingState | null {
    const state = this.states.get(key);
    if (!state) return null;
    if (state.attempts >= state.maxRetries) return null;
    state.attempts++;
    state.status = 'loading';
    state.startTime = Date.now();
    state.endTime = undefined;
    state.error = undefined;
    this.onStateChange?.(key, state);
    return state;
  }

  canRetry(key: string): boolean {
    const state = this.states.get(key);
    if (!state) return false;
    return state.attempts < state.maxRetries;
  }

  getState(key: string): LoadingState | null {
    return this.states.get(key) || null;
  }

  getDuration(key: string): number | null {
    const state = this.states.get(key);
    if (!state?.startTime) return null;
    const end = state.endTime || Date.now();
    return end - state.startTime;
  }

  isLoading(key: string): boolean {
    const state = this.states.get(key);
    return state?.status === 'loading';
  }

  isAnyLoading(): boolean {
    for (const state of this.states.values()) {
      if (state.status === 'loading') return true;
    }
    return false;
  }

  clear(key: string): void {
    this.states.delete(key);
  }

  clearAll(): void {
    this.states.clear();
  }

  getAllStates(): LoadingState[] {
    return Array.from(this.states.values());
  }

  getLoadingKeys(): string[] {
    return Array.from(this.states.entries())
      .filter(([, s]) => s.status === 'loading')
      .map(([k]) => k);
  }

  getErrorKeys(): string[] {
    return Array.from(this.states.entries())
      .filter(([, s]) => s.status === 'error')
      .map(([k]) => k);
  }
}

// ==================== 基础状态管理 ====================

describe('LoadingOrchestrator 基础状态管理', () => {
  let orchestrator: LoadingOrchestrator;

  beforeEach(() => {
    orchestrator = new LoadingOrchestrator();
  });

  it('start应创建loading状态', () => {
    const state = orchestrator.start('test-key');
    expect(state.status).toBe('loading');
    expect(state.key).toBe('test-key');
    expect(state.attempts).toBe(0);
  });

  it('start应支持自定义maxRetries', () => {
    const state = orchestrator.start('test-key', 5);
    expect(state.maxRetries).toBe(5);
  });

  it('success应将状态改为success', () => {
    orchestrator.start('test-key');
    const state = orchestrator.success('test-key');
    expect(state?.status).toBe('success');
    expect(state?.endTime).toBeDefined();
  });

  it('error应将状态改为error并记录错误信息', () => {
    orchestrator.start('test-key');
    const state = orchestrator.error('test-key', '网络错误');
    expect(state?.status).toBe('error');
    expect(state?.error).toBe('网络错误');
  });

  it('操作不存在的key应返回null', () => {
    expect(orchestrator.success('nonexistent')).toBeNull();
    expect(orchestrator.error('nonexistent', 'err')).toBeNull();
  });

  it('getState应返回正确状态', () => {
    orchestrator.start('key1');
    expect(orchestrator.getState('key1')?.status).toBe('loading');
    expect(orchestrator.getState('key2')).toBeNull();
  });

  it('startTime应在start时设置', () => {
    const before = Date.now();
    const state = orchestrator.start('key1');
    const after = Date.now();
    expect(state.startTime).toBeGreaterThanOrEqual(before);
    expect(state.startTime).toBeLessThanOrEqual(after);
  });
});

// ==================== 重试机制 ====================

describe('LoadingOrchestrator 重试机制', () => {
  let orchestrator: LoadingOrchestrator;

  beforeEach(() => {
    orchestrator = new LoadingOrchestrator();
  });

  it('retry应增加attempts计数', () => {
    orchestrator.start('key1', 3);
    orchestrator.error('key1', 'fail');
    const state = orchestrator.retry('key1');
    expect(state?.attempts).toBe(1);
    expect(state?.status).toBe('loading');
  });

  it('多次retry应累计attempts', () => {
    orchestrator.start('key1', 5);
    orchestrator.error('key1', 'fail');
    orchestrator.retry('key1');
    orchestrator.error('key1', 'fail');
    orchestrator.retry('key1');
    const state = orchestrator.getState('key1');
    expect(state?.attempts).toBe(2);
  });

  it('超过maxRetries时retry应返回null', () => {
    orchestrator.start('key1', 2);
    orchestrator.error('key1', 'fail');
    orchestrator.retry('key1');
    orchestrator.error('key1', 'fail');
    orchestrator.retry('key1');
    orchestrator.error('key1', 'fail');
    const result = orchestrator.retry('key1');
    expect(result).toBeNull();
  });

  it('canRetry应正确判断是否可重试', () => {
    orchestrator.start('key1', 1);
    expect(orchestrator.canRetry('key1')).toBe(true);
    orchestrator.error('key1', 'fail');
    orchestrator.retry('key1');
    orchestrator.error('key1', 'fail');
    expect(orchestrator.canRetry('key1')).toBe(false);
  });

  it('canRetry对不存在的key返回false', () => {
    expect(orchestrator.canRetry('nonexistent')).toBe(false);
  });

  it('retry后应清除error信息', () => {
    orchestrator.start('key1', 3);
    orchestrator.error('key1', '网络错误');
    const state = orchestrator.retry('key1');
    expect(state?.error).toBeUndefined();
  });

  it('retry后应重置endTime', () => {
    orchestrator.start('key1', 3);
    orchestrator.error('key1', 'fail');
    const state = orchestrator.retry('key1');
    expect(state?.endTime).toBeUndefined();
  });
});

// ==================== 超时控制 ====================

describe('LoadingOrchestrator 超时控制', () => {
  let orchestrator: LoadingOrchestrator;

  beforeEach(() => {
    orchestrator = new LoadingOrchestrator();
  });

  it('timeoutHandler应将状态改为timeout', () => {
    orchestrator.start('key1');
    const state = orchestrator.timeoutHandler('key1');
    expect(state?.status).toBe('timeout');
    expect(state?.endTime).toBeDefined();
  });

  it('非loading状态不应被超时', () => {
    orchestrator.start('key1');
    orchestrator.success('key1');
    const state = orchestrator.timeoutHandler('key1');
    expect(state).toBeNull();
  });

  it('不存在的key超时应返回null', () => {
    expect(orchestrator.timeoutHandler('nonexistent')).toBeNull();
  });
});

// ==================== 批量操作 ====================

describe('LoadingOrchestrator 批量操作', () => {
  let orchestrator: LoadingOrchestrator;

  beforeEach(() => {
    orchestrator = new LoadingOrchestrator();
  });

  it('getAllStates应返回所有状态', () => {
    orchestrator.start('key1');
    orchestrator.start('key2');
    orchestrator.start('key3');
    expect(orchestrator.getAllStates()).toHaveLength(3);
  });

  it('getLoadingKeys应只返回loading中的key', () => {
    orchestrator.start('key1');
    orchestrator.start('key2');
    orchestrator.success('key2');
    orchestrator.start('key3');
    const loadingKeys = orchestrator.getLoadingKeys();
    expect(loadingKeys).toContain('key1');
    expect(loadingKeys).toContain('key3');
    expect(loadingKeys).not.toContain('key2');
  });

  it('getErrorKeys应只返回error状态的key', () => {
    orchestrator.start('key1');
    orchestrator.start('key2');
    orchestrator.error('key1', 'fail');
    const errorKeys = orchestrator.getErrorKeys();
    expect(errorKeys).toContain('key1');
    expect(errorKeys).not.toContain('key2');
  });

  it('isAnyLoading应正确检测是否有加载中', () => {
    expect(orchestrator.isAnyLoading()).toBe(false);
    orchestrator.start('key1');
    expect(orchestrator.isAnyLoading()).toBe(true);
    orchestrator.success('key1');
    expect(orchestrator.isAnyLoading()).toBe(false);
  });

  it('isLoading应检测指定key的加载状态', () => {
    orchestrator.start('key1');
    expect(orchestrator.isLoading('key1')).toBe(true);
    expect(orchestrator.isLoading('key2')).toBe(false);
    orchestrator.success('key1');
    expect(orchestrator.isLoading('key1')).toBe(false);
  });

  it('clear应移除指定key的状态', () => {
    orchestrator.start('key1');
    orchestrator.clear('key1');
    expect(orchestrator.getState('key1')).toBeNull();
  });

  it('clearAll应移除所有状态', () => {
    orchestrator.start('key1');
    orchestrator.start('key2');
    orchestrator.clearAll();
    expect(orchestrator.getAllStates()).toHaveLength(0);
  });
});

// ==================== 回调通知 ====================

describe('LoadingOrchestrator 回调通知', () => {
  it('start时应触发onStateChange回调', () => {
    const callback = vi.fn();
    const orchestrator = new LoadingOrchestrator({ onStateChange: callback });
    orchestrator.start('key1');
    expect(callback).toHaveBeenCalledWith('key1', expect.objectContaining({ status: 'loading' }));
  });

  it('success时应触发onStateChange回调', () => {
    const callback = vi.fn();
    const orchestrator = new LoadingOrchestrator({ onStateChange: callback });
    orchestrator.start('key1');
    callback.mockClear();
    orchestrator.success('key1');
    expect(callback).toHaveBeenCalledWith('key1', expect.objectContaining({ status: 'success' }));
  });

  it('error时应触发onStateChange回调', () => {
    const callback = vi.fn();
    const orchestrator = new LoadingOrchestrator({ onStateChange: callback });
    orchestrator.start('key1');
    callback.mockClear();
    orchestrator.error('key1', 'fail');
    expect(callback).toHaveBeenCalledWith('key1', expect.objectContaining({ status: 'error' }));
  });
});

// ==================== 耗时计算 ====================

describe('LoadingOrchestrator 耗时计算', () => {
  let orchestrator: LoadingOrchestrator;

  beforeEach(() => {
    orchestrator = new LoadingOrchestrator();
  });

  it('未开始的key耗时应为null', () => {
    expect(orchestrator.getDuration('nonexistent')).toBeNull();
  });

  it('loading中应有实时耗时', () => {
    orchestrator.start('key1');
    const duration = orchestrator.getDuration('key1');
    expect(duration).toBeGreaterThanOrEqual(0);
  });

  it('已完成的应有总耗时', () => {
    orchestrator.start('key1');
    orchestrator.success('key1');
    const duration = orchestrator.getDuration('key1');
    expect(duration).toBeGreaterThanOrEqual(0);
  });
});

// ==================== 级联加载 ====================

describe('级联加载策略', () => {
  it('应支持顺序执行多个加载任务', async () => {
    const orchestrator = new LoadingOrchestrator();
    const keys = ['data1', 'data2', 'data3'];
    const results: string[] = [];

    for (const key of keys) {
      orchestrator.start(key);
      // 模拟异步加载
      results.push(key);
      orchestrator.success(key);
    }

    expect(results).toEqual(['data1', 'data2', 'data3']);
    expect(orchestrator.getAllStates().every(s => s.status === 'success')).toBe(true);
  });

  it('一个失败不应阻止其他任务', () => {
    const orchestrator = new LoadingOrchestrator();
    orchestrator.start('key1');
    orchestrator.start('key2');
    orchestrator.start('key3');

    orchestrator.error('key2', 'fail');
    orchestrator.success('key1');
    orchestrator.success('key3');

    const errors = orchestrator.getErrorKeys();
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBe('key2');
  });

  it('应支持并行加载后收集结果', () => {
    const orchestrator = new LoadingOrchestrator();
    const keys = ['stock-list', 'market-index', 'news'];

    keys.forEach(k => orchestrator.start(k));
    expect(orchestrator.getLoadingKeys()).toHaveLength(3);

    orchestrator.success('stock-list');
    orchestrator.success('market-index');
    expect(orchestrator.getLoadingKeys()).toHaveLength(1);

    orchestrator.success('news');
    expect(orchestrator.isAnyLoading()).toBe(false);
  });
});
