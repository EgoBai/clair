/**
 * Pull-to-Refresh & Infinite Scroll Engine
 *
 * 原生手势驱动的下拉刷新和无限滚动逻辑
 */

// ==================== 下拉刷新 ====================

export interface PullRefreshConfig {
  threshold: number;       // 触发刷新的下拉距离(px)
  maxDistance: number;     // 最大下拉距离(px)
  resistance: number;      // 阻力系数 (0-1)
  snapBackDuration: number; // 回弹动画时间(ms)
  completeDelay: number;   // 刷新完成后的停留时间(ms)
}

export type PullRefreshState = 'idle' | 'pulling' | 'ready' | 'refreshing' | 'complete';

export class PullRefreshController {
  private config: PullRefreshConfig;
  private state: PullRefreshState = 'idle';
  private currentDistance = 0;
  private startY = 0;
  private isActive = false;

  constructor(config: Partial<PullRefreshConfig> = {}) {
    this.config = {
      threshold: config.threshold ?? 80,
      maxDistance: config.maxDistance ?? 150,
      resistance: config.resistance ?? 0.5,
      snapBackDuration: config.snapBackDuration ?? 300,
      completeDelay: config.completeDelay ?? 500,
    };
  }

  /**
   * 开始下拉手势
   */
  start(y: number, scrollTop: number): void {
    if (scrollTop > 0) return;
    this.startY = y;
    this.isActive = true;
    this.state = 'pulling';
    this.currentDistance = 0;
  }

  /**
   * 移动手势
   */
  move(y: number): { distance: number; state: PullRefreshState } {
    if (!this.isActive) return { distance: 0, state: this.state };

    const rawDelta = Math.max(0, y - this.startY);
    const resisted = rawDelta * this.config.resistance;
    this.currentDistance = Math.min(resisted, this.config.maxDistance);

    if (this.currentDistance >= this.config.threshold) {
      this.state = 'ready';
    } else {
      this.state = 'pulling';
    }

    return { distance: this.currentDistance, state: this.state };
  }

  /**
   * 结束手势
   */
  end(): { shouldRefresh: boolean; snapBackDuration: number } {
    if (!this.isActive) return { shouldRefresh: false, snapBackDuration: 0 };

    this.isActive = false;

    if (this.currentDistance >= this.config.threshold) {
      this.state = 'refreshing';
      return { shouldRefresh: true, snapBackDuration: this.config.snapBackDuration };
    }

    this.state = 'idle';
    this.currentDistance = 0;
    return { shouldRefresh: false, snapBackDuration: this.config.snapBackDuration };
  }

  /**
   * 刷新完成
   */
  complete(): { completeDelay: number } {
    this.state = 'complete';
    return { completeDelay: this.config.completeDelay };
  }

  /**
   * 重置状态
   */
  reset(): void {
    this.state = 'idle';
    this.currentDistance = 0;
    this.isActive = false;
  }

  getState(): PullRefreshState {
    return this.state;
  }

  getDistance(): number {
    return this.currentDistance;
  }

  /**
   * 计算进度 (0-1)
   */
  getProgress(): number {
    return Math.min(1, this.currentDistance / this.config.threshold);
  }

  /**
   * 获取下拉指示器样式
   */
  getIndicatorStyle(): { translateY: number; opacity: number; rotate: number } {
    const progress = this.getProgress();
    return {
      translateY: this.currentDistance,
      opacity: Math.min(1, progress * 1.5),
      rotate: progress * 360,
    };
  }
}

// ==================== 无限滚动 ====================

export interface InfiniteScrollConfig {
  threshold: number;        // 距底部多少px触发加载
  pageSize: number;         // 每页数量
  maxPages: number;         // 最大缓存页数
  debounceMs: number;       // 防抖时间
  retryLimit: number;       // 重试次数
  retryDelay: number;       // 重试延迟(ms)
}

export type InfiniteScrollStatus = 'idle' | 'loading' | 'error' | 'complete' | 'retrying';

export interface ScrollPage<T> {
  index: number;
  data: T[];
  loadedAt: number;
}

export class InfiniteScrollController<T = unknown> {
  private config: InfiniteScrollConfig;
  private status: InfiniteScrollStatus = 'idle';
  private pages: ScrollPage<T>[] = [];
  private currentPage = 0;
  private errorCount = 0;
  private lastTriggerTime = 0;

  constructor(config: Partial<InfiniteScrollConfig> = {}) {
    this.config = {
      threshold: config.threshold ?? 200,
      pageSize: config.pageSize ?? 20,
      maxPages: config.maxPages ?? 10,
      debounceMs: config.debounceMs ?? 300,
      retryLimit: config.retryLimit ?? 3,
      retryDelay: config.retryDelay ?? 1000,
    };
  }

  /**
   * 检查是否应该触发加载
   */
  shouldTrigger(
    scrollTop: number,
    scrollHeight: number,
    clientHeight: number,
    now: number = Date.now()
  ): boolean {
    if (this.status === 'loading' || this.status === 'complete' || this.status === 'retrying') {
      return false;
    }

    const distanceFromBottom = scrollHeight - clientHeight - scrollTop;
    if (distanceFromBottom > this.config.threshold) return false;

    // Debounce
    if (now - this.lastTriggerTime < this.config.debounceMs) return false;

    return true;
  }

  /**
   * 开始加载
   */
  startLoading(now?: number): void {
    this.status = 'loading';
    this.lastTriggerTime = now ?? Date.now();
  }

  /**
   * 加载成功
   */
  loadSuccess(data: T[]): { items: T[]; totalCount: number } {
    this.errorCount = 0;
    const page: ScrollPage<T> = {
      index: this.currentPage,
      data,
      loadedAt: Date.now(),
    };

    this.pages.push(page);
    this.currentPage++;

    // Evict old pages if over max
    while (this.pages.length > this.config.maxPages) {
      this.pages.shift();
    }

    if (data.length < this.config.pageSize) {
      this.status = 'complete';
    } else {
      this.status = 'idle';
    }

    return {
      items: this.getAllItems(),
      totalCount: this.currentPage * this.config.pageSize,
    };
  }

  /**
   * 加载失败
   */
  loadError(): { shouldRetry: boolean; retryDelay: number; status: InfiniteScrollStatus } {
    this.errorCount++;

    if (this.errorCount <= this.config.retryLimit) {
      this.status = 'retrying';
      return {
        shouldRetry: true,
        retryDelay: this.config.retryDelay * this.errorCount,
        status: 'retrying',
      };
    }

    this.status = 'error';
    return { shouldRetry: false, retryDelay: 0, status: 'error' };
  }

  /**
   * 获取所有已加载数据
   */
  getAllItems(): T[] {
    return this.pages.flatMap(p => p.data);
  }

  /**
   * 获取状态
   */
  getStatus(): InfiniteScrollStatus {
    return this.status;
  }

  /**
   * 获取分页信息
   */
  getPagination(): { page: number; totalLoaded: number; hasMore: boolean } {
    return {
      page: this.currentPage,
      totalLoaded: this.getAllItems().length,
      hasMore: this.status !== 'complete',
    };
  }

  /**
   * 重置
   */
  reset(): void {
    this.status = 'idle';
    this.pages = [];
    this.currentPage = 0;
    this.errorCount = 0;
    this.lastTriggerTime = 0;
  }

  /**
   * 手动标记为完成
   */
  markComplete(): void {
    this.status = 'complete';
  }

  /**
   * 获取已缓存页数
   */
  getCachedPageCount(): number {
    return this.pages.length;
  }
}

// ==================== 滚动位置记忆 ====================

export interface ScrollPosition {
  path: string;
  scrollTop: number;
  timestamp: number;
}

export class ScrollPositionManager {
  private positions = new Map<string, ScrollPosition>();
  private maxEntries: number;

  constructor(maxEntries: number = 50) {
    this.maxEntries = maxEntries;
  }

  save(path: string, scrollTop: number): void {
    this.positions.set(path, { path, scrollTop, timestamp: Date.now() });

    // Evict oldest entries
    if (this.positions.size > this.maxEntries) {
      const oldest = [...this.positions.entries()]
        .sort(([, a], [, b]) => a.timestamp - b.timestamp)[0];
      this.positions.delete(oldest[0]);
    }
  }

  restore(path: string): number | null {
    const pos = this.positions.get(path);
    return pos?.scrollTop ?? null;
  }

  clear(path?: string): void {
    if (path) {
      this.positions.delete(path);
    } else {
      this.positions.clear();
    }
  }

  getAll(): ScrollPosition[] {
    return [...this.positions.values()];
  }
}
