/**
 * 用户行为分析工具
 * 提供前端埋点、事件追踪和数据统计
 */

// ==================== 类型定义 ====================

export interface AnalyticsEvent {
  name: string;
  properties?: Record<string, any>;
  timestamp?: number;
  userId?: string;
  sessionId?: string;
}

export interface PageView {
  path: string;
  title?: string;
  referrer?: string;
  timestamp?: number;
  userId?: string;
  sessionId?: string;
}

export interface UserProperties {
  userId: string;
  [key: string]: any;
}

// ==================== 分析追踪器 ====================

import { safeGetItem, safeSetItem } from './safeStorage';

class Analytics {
  private sessionId: string;
  private userId?: string;
  private queue: AnalyticsEvent[] = [];
  private flushInterval: number = 30000; // 30秒
  private maxQueueSize: number = 50;
  private endpoint: string = '/api/analytics';
  private isInitialized: boolean = false;

  constructor() {
    this.sessionId = this.generateSessionId();
    this.init();
  }

  /**
   * 初始化分析追踪器
   */
  private init(): void {
    if (typeof window === 'undefined') return;

    // 从localStorage恢复userId
    this.userId = safeGetItem('analytics_user_id') || undefined;

    // 定期发送队列中的事件
    setInterval(() => this.flush(), this.flushInterval);

    // 页面卸载前发送剩余事件
    window.addEventListener('beforeunload', () => this.flush());

    // 监听页面可见性变化
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.trackEvent('page_visible');
      } else {
        this.trackEvent('page_hidden');
        this.flush();
      }
    });

    this.isInitialized = true;
  }

  /**
   * 设置用户ID
   */
  setUserId(userId: string): void {
    this.userId = userId;
    if (typeof window !== 'undefined') {
      safeSetItem('analytics_user_id', userId);
    }
  }

  /**
   * 追踪页面浏览
   */
  trackPageView(path: string, title?: string): void {
    const pageView: PageView = {
      path,
      title: title || document.title,
      referrer: document.referrer,
      timestamp: Date.now(),
      userId: this.userId,
      sessionId: this.sessionId
    };

    this.trackEvent('page_view', pageView);
  }

  /**
   * 追踪自定义事件
   */
  trackEvent(name: string, properties: Record<string, any> = {}): void {
    const event: AnalyticsEvent = {
      name,
      properties: {
        ...properties,
        url: typeof window !== 'undefined' ? window.location.href : undefined,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined
      },
      timestamp: Date.now(),
      userId: this.userId,
      sessionId: this.sessionId
    };

    this.queue.push(event);

    // 如果队列满了，立即发送
    if (this.queue.length >= this.maxQueueSize) {
      this.flush();
    }
  }

  /**
   * 追踪用户交互
   */
  trackInteraction(element: string, action: string, properties: Record<string, any> = {}): void {
    this.trackEvent('interaction', {
      element,
      action,
      ...properties
    });
  }

  /**
   * 追踪搜索
   */
  trackSearch(query: string, results: number): void {
    this.trackEvent('search', {
      query,
      results_count: results
    });
  }

  /**
   * 追踪股票查看
   */
  trackStockView(symbol: string, name: string): void {
    this.trackEvent('stock_view', {
      symbol,
      name
    });
  }

  /**
   * 追踪策略使用
   */
  trackStrategyUse(strategyId: string, strategyName: string): void {
    this.trackEvent('strategy_use', {
      strategy_id: strategyId,
      strategy_name: strategyName
    });
  }

  /**
   * 追踪AI对话
   */
  trackAIChat(action: 'start' | 'message' | 'error', properties: Record<string, any> = {}): void {
    this.trackEvent('ai_chat', {
      action,
      ...properties
    });
  }

  /**
   * 追踪性能指标
   */
  trackPerformance(metric: string, value: number, unit: string = 'ms'): void {
    this.trackEvent('performance', {
      metric,
      value,
      unit
    });
  }

  /**
   * 追踪错误
   */
  trackError(error: Error, context?: Record<string, any>): void {
    this.trackEvent('error', {
      error_name: error.name,
      error_message: error.message,
      error_stack: error.stack,
      ...context
    });
  }

  /**
   * 设置用户属性
   */
  setUserProperties(properties: UserProperties): void {
    this.trackEvent('user_properties', properties);
  }

  /**
   * 发送队列中的事件
   */
  private async flush(): Promise<void> {
    if (this.queue.length === 0) return;

    const events = [...this.queue];
    this.queue = [];

    try {
      await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          events,
          sessionId: this.sessionId,
          userId: this.userId
        }),
        keepalive: true
      });
    } catch (error) {
      // 发送失败，将事件放回队列
      console.warn('Analytics flush failed:', error);
      this.queue = [...events, ...this.queue];
    }
  }

  /**
   * 生成会话ID
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// 单例导出
export const analytics = new Analytics();

// ==================== React Hooks ====================

import { useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * 页面浏览追踪Hook
 */
export function usePageTracking(): void {
  const location = useLocation();

  useEffect(() => {
    analytics.trackPageView(location.pathname);
  }, [location.pathname]);
}

/**
 * 事件追踪Hook
 */
export function useEventTracking() {
  const trackEvent = useCallback((name: string, properties?: Record<string, any>) => {
    analytics.trackEvent(name, properties);
  }, []);

  const trackClick = useCallback((element: string, properties?: Record<string, any>) => {
    analytics.trackInteraction(element, 'click', properties);
  }, []);

  const trackSearch = useCallback((query: string, results: number) => {
    analytics.trackSearch(query, results);
  }, []);

  return { trackEvent, trackClick, trackSearch };
}

/**
 * 性能追踪Hook
 */
export function usePerformanceTracking(componentName: string) {
  const renderStart = useRef<number>(Date.now());
  const renderCount = useRef<number>(0);

  useEffect(() => {
    renderCount.current++;
    
    // 追踪首次渲染时间
    if (renderCount.current === 1) {
      const renderTime = Date.now() - renderStart.current;
      analytics.trackPerformance(`${componentName}_first_render`, renderTime);
    }
  });

  useEffect(() => {
    renderStart.current = Date.now();
  });
}

// ==================== 分析数据 API ====================

export interface AnalyticsSummary {
  totalEvents: number;
  uniqueUsers: number;
  topEvents: Array<{ name: string; count: number }>;
  pageViews: number;
  avgSessionDuration: number;
}

/**
 * 获取分析摘要（后端使用）
 */
export function getAnalyticsSummary(events: AnalyticsEvent[]): AnalyticsSummary {
  const uniqueUsers = new Set(events.map(e => e.userId).filter(Boolean)).size;
  const topEvents = getTopEvents(events, 10);
  const pageViews = events.filter(e => e.name === 'page_view').length;
  const avgSessionDuration = calculateAvgSessionDuration(events);

  return {
    totalEvents: events.length,
    uniqueUsers,
    topEvents,
    pageViews,
    avgSessionDuration
  };
}

function getTopEvents(events: AnalyticsEvent[], limit: number): Array<{ name: string; count: number }> {
  const counts: Record<string, number> = {};
  
  for (const event of events) {
    counts[event.name] = (counts[event.name] || 0) + 1;
  }

  return Object.entries(counts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

function calculateAvgSessionDuration(events: AnalyticsEvent[]): number {
  // 按会话分组
  const sessions: Record<string, number[]> = {};
  
  for (const event of events) {
    if (event.sessionId && event.timestamp) {
      if (!sessions[event.sessionId]) {
        sessions[event.sessionId] = [];
      }
      sessions[event.sessionId].push(event.timestamp);
    }
  }

  // 计算每个会话的持续时间
  const durations = Object.values(sessions)
    .map(timestamps => {
      if (timestamps.length < 2) return 0;
      const sorted = timestamps.sort((a, b) => a - b);
      return sorted[sorted.length - 1] - sorted[0];
    })
    .filter(d => d > 0);

  if (durations.length === 0) return 0;
  return durations.reduce((a, b) => a + b, 0) / durations.length;
}
