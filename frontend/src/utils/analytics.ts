/**
 * 用户分析工具
 * 轻量级页面访问和用户行为追踪
 * 
 * 功能：
 * - 页面访问追踪
 * - 事件追踪
 * - 用户会话管理
 * - 性能指标收集
 */

import logger from './logger';

// ==================== 类型定义 ====================

interface AnalyticsEvent {
  name: string;
  properties?: Record<string, unknown>;
  timestamp: number;
  sessionId: string;
  userId?: string;
}

interface PageView {
  path: string;
  title: string;
  referrer: string;
  timestamp: number;
  sessionId: string;
  loadTime: number;
}

interface SessionInfo {
  id: string;
  startTime: number;
  lastActivity: number;
  pageViews: number;
  events: number;
}

// ==================== 配置 ====================

const CONFIG = {
  // 会话超时时间（30分钟）
  sessionTimeout: 30 * 60 * 1000,
  // 批量发送间隔（5秒）
  batchInterval: 5000,
  // 最大缓存事件数
  maxCacheSize: 50,
  // 是否启用调试模式
  debug: import.meta.env.DEV,
};

// ==================== 分析类 ====================

class Analytics {
  private sessionId: string;
  private session: SessionInfo;
  private eventQueue: AnalyticsEvent[] = [];
  private pageViewQueue: PageView[] = [];
  private batchTimer: ReturnType<typeof setInterval> | null = null;
  private isInitialized = false;

  constructor() {
    this.sessionId = this.getOrCreateSessionId();
    this.session = this.getOrCreateSession();
  }

  /**
   * 初始化分析系统
   */
  init(): void {
    if (this.isInitialized) return;
    this.isInitialized = true;

    // 监听页面可见性变化
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.updateSessionActivity();
      }
    });

    // 监听页面卸载
    window.addEventListener('beforeunload', () => {
      this.flush();
    });

    // 启动批量发送定时器
    this.startBatchTimer();

    if (CONFIG.debug) {
      logger.log('[Analytics] 初始化完成', { sessionId: this.sessionId });
    }
  }

  /**
   * 追踪页面访问
   */
  trackPageView(path: string, title: string): void {
    const pageView: PageView = {
      path,
      title,
      referrer: document.referrer,
      timestamp: Date.now(),
      sessionId: this.sessionId,
      loadTime: this.getPageLoadTime(),
    };

    this.pageViewQueue.push(pageView);
    this.session.pageViews++;
    this.updateSessionActivity();

    if (CONFIG.debug) {
      logger.log('[Analytics] 页面访问', pageView);
    }

    // 如果缓存满了，立即发送
    if (this.pageViewQueue.length >= CONFIG.maxCacheSize) {
      this.flush();
    }
  }

  /**
   * 追踪用户事件
   */
  trackEvent(name: string, properties?: Record<string, unknown>): void {
    const event: AnalyticsEvent = {
      name,
      properties,
      timestamp: Date.now(),
      sessionId: this.sessionId,
    };

    this.eventQueue.push(event);
    this.session.events++;
    this.updateSessionActivity();

    if (CONFIG.debug) {
      logger.log('[Analytics] 事件追踪', event);
    }

    // 如果缓存满了，立即发送
    if (this.eventQueue.length >= CONFIG.maxCacheSize) {
      this.flush();
    }
  }

  /**
   * 追踪性能指标
   */
  trackPerformance(metric: string, value: number, unit: string = 'ms'): void {
    this.trackEvent('performance', {
      metric,
      value,
      unit,
    });
  }

  /**
   * 追踪错误
   */
  trackError(error: Error, context?: Record<string, unknown>): void {
    this.trackEvent('error', {
      message: error.message,
      stack: error.stack,
      ...context,
    });
  }

  /**
   * 获取会话信息
   */
  getSession(): SessionInfo {
    return { ...this.session };
  }

  /**
   * 获取队列状态
   */
  getQueueStatus(): { events: number; pageViews: number } {
    return {
      events: this.eventQueue.length,
      pageViews: this.pageViewQueue.length,
    };
  }

  /**
   * 手动刷新队列
   */
  flush(): void {
    if (this.eventQueue.length === 0 && this.pageViewQueue.length === 0) {
      return;
    }

    const events = [...this.eventQueue];
    const pageViews = [...this.pageViewQueue];
    this.eventQueue = [];
    this.pageViewQueue = [];

    // 发送到后端（异步，不阻塞）
    this.sendBatch(events, pageViews).catch(error => {
      if (CONFIG.debug) {
        logger.warn('[Analytics] 发送失败', error);
      }
    });
  }

  /**
   * 销毁分析实例
   */
  destroy(): void {
    this.flush();
    if (this.batchTimer) {
      clearInterval(this.batchTimer);
      this.batchTimer = null;
    }
    this.isInitialized = false;
  }

  // ==================== 私有方法 ====================

  private getOrCreateSessionId(): string {
    const key = 'analytics_session_id';
    let sessionId = sessionStorage.getItem(key);
    
    if (!sessionId) {
      sessionId = this.generateId();
      sessionStorage.setItem(key, sessionId);
    }

    return sessionId;
  }

  private getOrCreateSession(): SessionInfo {
    const key = 'analytics_session';
    const stored = sessionStorage.getItem(key);
    
    if (stored) {
      try {
        const session = JSON.parse(stored) as SessionInfo;
        // 检查会话是否超时
        if (Date.now() - session.lastActivity < CONFIG.sessionTimeout) {
          return session;
        }
      } catch {
        // 解析失败，创建新会话
      }
    }

    const session: SessionInfo = {
      id: this.sessionId,
      startTime: Date.now(),
      lastActivity: Date.now(),
      pageViews: 0,
      events: 0,
    };

    sessionStorage.setItem(key, JSON.stringify(session));
    return session;
  }

  private updateSessionActivity(): void {
    this.session.lastActivity = Date.now();
    sessionStorage.setItem('analytics_session', JSON.stringify(this.session));
  }

  private getPageLoadTime(): number {
    if (window.performance) {
      const timing = window.performance.timing;
      return timing.loadEventEnd - timing.navigationStart;
    }
    return 0;
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private startBatchTimer(): void {
    this.batchTimer = setInterval(() => {
      this.flush();
    }, CONFIG.batchInterval);
  }

  private async sendBatch(events: AnalyticsEvent[], pageViews: PageView[]): Promise<void> {
    try {
      const response = await fetch('/api/analytics/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          events,
          pageViews,
          session: this.session,
          timestamp: Date.now(),
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      if (CONFIG.debug) {
        logger.log('[Analytics] 批量发送成功', {
          events: events.length,
          pageViews: pageViews.length,
        });
      }
    } catch (error) {
      // 静默失败，不影响用户体验
      if (CONFIG.debug) {
        logger.warn('[Analytics] 发送失败', error);
      }
    }
  }
}

// ==================== 导出 ====================

export const analytics = new Analytics();

// 自动初始化
if (typeof window !== 'undefined') {
  analytics.init();
}

export default analytics;
