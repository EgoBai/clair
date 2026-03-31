/**
 * 图表懒加载引擎
 * 支持组件级别的动态加载和虚拟滚动
 */

export interface LazyLoadConfig {
  threshold: number;      // 可见性阈值
  rootMargin: string;     // 根边距
  delay: number;          // 延迟加载(ms)
  retryCount: number;     // 重试次数
  priority: 'high' | 'medium' | 'low';
}

export interface LoadState {
  status: 'idle' | 'loading' | 'loaded' | 'error';
  progress: number;
  error?: string;
  retryAttempt: number;
}

export class LazyLoadEngine {
  private states: Map<string, LoadState> = new Map();
  private queue: Map<string, LazyLoadConfig> = new Map();
  private observers: Map<string, IntersectionObserver> = new Map();
  private batchTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingBatch: string[] = [];

  private defaultConfig: LazyLoadConfig = {
    threshold: 0.1,
    rootMargin: '200px',
    delay: 100,
    retryCount: 3,
    priority: 'medium',
  };

  /**
   * 注册懒加载元素
   */
  register(id: string, config: Partial<LazyLoadConfig> = {}): LoadState {
    const fullConfig = { ...this.defaultConfig, ...config };
    this.queue.set(id, fullConfig);

    const state: LoadState = {
      status: 'idle',
      progress: 0,
      retryAttempt: 0,
    };
    this.states.set(id, state);
    return state;
  }

  /**
   * 获取加载状态
   */
  getState(id: string): LoadState | undefined {
    return this.states.get(id);
  }

  /**
   * 开始加载
   */
  async load(id: string, loader: () => Promise<unknown>): Promise<unknown> {
    const state = this.states.get(id);
    if (!state) throw new Error(`Element ${id} not registered`);

    state.status = 'loading';
    state.progress = 0;

    const config = this.queue.get(id) || this.defaultConfig;

    for (let attempt = 0; attempt <= config.retryCount; attempt++) {
      try {
        state.retryAttempt = attempt;
        state.progress = 25;

        if (config.delay > 0 && attempt === 0) {
          await new Promise(r => setTimeout(r, config.delay));
        }

        state.progress = 50;
        const result = await loader();

        state.progress = 100;
        state.status = 'loaded';
        return result;
      } catch (err) {
        if (attempt === config.retryCount) {
          state.status = 'error';
          state.error = err instanceof Error ? err.message : '加载失败';
          throw err;
        }
        // 指数退避
        await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
      }
    }
  }

  /**
   * 批量预加载
   */
  batchPreload(ids: string[]): void {
    this.pendingBatch.push(...ids);

    if (this.batchTimer) return;

    this.batchTimer = setTimeout(() => {
      const batch = [...this.pendingBatch];
      this.pendingBatch = [];
      this.batchTimer = null;

      // 按优先级排序
      batch.sort((a, b) => {
        const configA = this.queue.get(a);
        const configB = this.queue.get(b);
        const priorityMap = { high: 0, medium: 1, low: 2 };
        return (priorityMap[configA?.priority || 'medium'] || 1) -
               (priorityMap[configB?.priority || 'medium'] || 1);
      });

      // 触发加载
      for (const id of batch) {
        const state = this.states.get(id);
        if (state && state.status === 'idle') {
          state.status = 'loading';
        }
      }
    }, 50);
  }

  /**
   * 虚拟滚动计算
   */
  calculateVirtualWindow(
    totalItems: number,
    scrollTop: number,
    containerHeight: number,
    itemHeight: number,
    overscan: number = 3
  ): { start: number; end: number; offsetY: number } {
    const start = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const visibleCount = Math.ceil(containerHeight / itemHeight);
    const end = Math.min(totalItems - 1, start + visibleCount + overscan * 2);
    const offsetY = start * itemHeight;

    return { start, end, offsetY };
  }

  /**
   * 重置状态
   */
  reset(id?: string): void {
    if (id) {
      this.states.delete(id);
      this.queue.delete(id);
    } else {
      this.states.clear();
      this.queue.clear();
    }
  }

  /**
   * 获取所有状态摘要
   */
  getSummary(): {
    total: number;
    idle: number;
    loading: number;
    loaded: number;
    error: number;
  } {
    const states = Array.from(this.states.values());
    return {
      total: states.length,
      idle: states.filter(s => s.status === 'idle').length,
      loading: states.filter(s => s.status === 'loading').length,
      loaded: states.filter(s => s.status === 'loaded').length,
      error: states.filter(s => s.status === 'error').length,
    };
  }
}

export const lazyLoadEngine = new LazyLoadEngine();
export default LazyLoadEngine;
