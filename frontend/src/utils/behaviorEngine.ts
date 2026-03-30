/**
 * 用户行为分析引擎
 * 事件追踪、行为序列、用户画像、A/B测试
 */

export type EventCategory = 'page_view' | 'click' | 'scroll' | 'search' | 'trade' | 'watch' | 'custom';

export interface TrackingEvent {
  id: string;
  category: EventCategory;
  action: string;
  label?: string;
  value?: number;
  timestamp: number;
  sessionId: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}

export interface SessionInfo {
  id: string;
  startTime: number;
  lastActivity: number;
  pageViews: number;
  events: number;
  duration: number;
}

export interface UserBehavior {
  totalEvents: number;
  categories: Record<string, number>;
  topActions: Array<{ action: string; count: number }>;
  avgSessionDuration: number;
  pageViewDepth: number;
  conversionFunnel: Record<string, number>;
}

export interface ABTestVariant {
  id: string;
  name: string;
  weight: number;
  data?: Record<string, unknown>;
}

export interface ABTestConfig {
  id: string;
  name: string;
  variants: ABTestVariant[];
  active: boolean;
}

// ==================== 事件追踪 ====================

let eventIdCounter = 0;

export function createEvent(
  category: EventCategory,
  action: string,
  options?: { label?: string; value?: number; metadata?: Record<string, unknown> },
): TrackingEvent {
  eventIdCounter++;
  return {
    id: `evt-${eventIdCounter}-${Date.now()}`,
    category,
    action,
    label: options?.label,
    value: options?.value,
    timestamp: Date.now(),
    sessionId: '',
    metadata: options?.metadata,
  };
}

/**
 * 事件追踪器
 */
export function createEventTracker(
  sessionId: string,
  userId?: string,
): {
  track: (category: EventCategory, action: string, options?: { label?: string; value?: number; metadata?: Record<string, unknown> }) => TrackingEvent;
  getEvents: () => TrackingEvent[];
  getByCategory: (category: EventCategory) => TrackingEvent[];
  getByAction: (action: string) => TrackingEvent[];
  clear: () => void;
  getSession: () => SessionInfo;
} {
  const events: TrackingEvent[] = [];
  const startTime = Date.now();

  function track(category: EventCategory, action: string, options?: { label?: string; value?: number; metadata?: Record<string, unknown> }): TrackingEvent {
    const event = createEvent(category, action, options);
    event.sessionId = sessionId;
    event.userId = userId;
    events.push(event);
    return event;
  }

  return {
    track,
    getEvents: () => [...events],
    getByCategory: (category) => events.filter(e => e.category === category),
    getByAction: (action) => events.filter(e => e.action === action),
    clear: () => { events.length = 0; },
    getSession: () => ({
      id: sessionId,
      startTime,
      lastActivity: events.length > 0 ? events[events.length - 1].timestamp : startTime,
      pageViews: events.filter(e => e.category === 'page_view').length,
      events: events.length,
      duration: Date.now() - startTime,
    }),
  };
}

// ==================== 行为分析 ====================

/**
 * 分析用户行为
 */
export function analyzeBehavior(events: TrackingEvent[]): UserBehavior {
  const categories: Record<string, number> = {};
  const actionCounts: Record<string, number> = {};
  const funnel: Record<string, number> = {};

  for (const event of events) {
    categories[event.category] = (categories[event.category] || 0) + 1;
    actionCounts[event.action] = (actionCounts[event.action] || 0) + 1;
  }

  const topActions = Object.entries(actionCounts)
    .map(([action, count]) => ({ action, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const pageViews = events.filter(e => e.category === 'page_view');
  const uniquePages = new Set(pageViews.map(e => e.action)).size;

  // 会话时长
  const sessions = new Map<string, { start: number; end: number }>();
  for (const event of events) {
    if (!sessions.has(event.sessionId)) {
      sessions.set(event.sessionId, { start: event.timestamp, end: event.timestamp });
    }
    const session = sessions.get(event.sessionId)!;
    session.end = Math.max(session.end, event.timestamp);
  }
  const durations = Array.from(sessions.values()).map(s => s.end - s.start);
  const avgSessionDuration = durations.length > 0
    ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;

  // 转化漏斗
  funnel['view'] = events.filter(e => e.category === 'page_view').length;
  funnel['click'] = events.filter(e => e.category === 'click').length;
  funnel['search'] = events.filter(e => e.category === 'search').length;
  funnel['trade'] = events.filter(e => e.category === 'trade').length;

  return {
    totalEvents: events.length,
    categories,
    topActions,
    avgSessionDuration: Math.round(avgSessionDuration),
    pageViewDepth: uniquePages,
    conversionFunnel: funnel,
  };
}

/**
 * 计算事件频率
 */
export function calculateEventFrequency(
  events: TrackingEvent[],
  intervalMs: number = 60000,
): Array<{ time: number; count: number }> {
  if (events.length === 0) return [];

  const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);
  const start = sorted[0].timestamp;
  const end = sorted[sorted.length - 1].timestamp;
  const buckets: Array<{ time: number; count: number }> = [];

  for (let t = start; t <= end; t += intervalMs) {
    const count = events.filter(e => e.timestamp >= t && e.timestamp < t + intervalMs).length;
    buckets.push({ time: t, count });
  }

  return buckets;
}

/**
 * 检测异常行为
 */
export function detectAnomalousBehavior(
  events: TrackingEvent[],
  threshold: number = 3, // 标准差倍数
): Array<{ type: string; event: TrackingEvent; reason: string }> {
  const anomalies: Array<{ type: string; event: TrackingEvent; reason: string }> = [];

  // 高频点击检测
  const clickEvents = events.filter(e => e.category === 'click');
  if (clickEvents.length > 1) {
    const intervals = [];
    for (let i = 1; i < clickEvents.length; i++) {
      intervals.push(clickEvents[i].timestamp - clickEvents[i - 1].timestamp);
    }
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const std = Math.sqrt(intervals.reduce((sum, v) => sum + (v - avgInterval) ** 2, 0) / intervals.length);

    for (let i = 0; i < intervals.length; i++) {
      if (std > 0 && intervals[i] < avgInterval - threshold * std) {
        anomalies.push({
          type: 'rapid_click',
          event: clickEvents[i + 1],
          reason: `点击间隔${intervals[i]}ms，远低于平均${Math.round(avgInterval)}ms`,
        });
      }
    }
  }

  return anomalies;
}

// ==================== A/B测试 ====================

/**
 * A/B测试分配
 */
export function createABTestManager(
  configs: ABTestConfig[],
): {
  assign: (testId: string, userId: string) => ABTestVariant | null;
  getVariant: (testId: string, userId: string) => ABTestVariant | null;
  getActiveTests: () => ABTestConfig[];
  recordConversion: (testId: string, variantId: string) => void;
  getResults: (testId: string) => { variant: ABTestVariant; impressions: number; conversions: number; rate: number }[] | null;
} {
  const assignments = new Map<string, Map<string, string>>(); // testId -> userId -> variantId
  const impressions = new Map<string, Map<string, number>>(); // testId -> variantId -> count
  const conversions = new Map<string, Map<string, number>>();

  for (const config of configs) {
    assignments.set(config.id, new Map());
    impressions.set(config.id, new Map());
    conversions.set(config.id, new Map());
    for (const v of config.variants) {
      impressions.get(config.id)!.set(v.id, 0);
      conversions.get(config.id)!.set(v.id, 0);
    }
  }

  function assign(testId: string, userId: string): ABTestVariant | null {
    const config = configs.find(c => c.id === testId && c.active);
    if (!config) return null;

    const testAssignments = assignments.get(testId)!;
    if (testAssignments.has(userId)) {
      const variantId = testAssignments.get(userId)!;
      return config.variants.find(v => v.id === variantId) || null;
    }

    // 基于权重分配
    const totalWeight = config.variants.reduce((sum, v) => sum + v.weight, 0);
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      hash = ((hash << 5) - hash) + userId.charCodeAt(i);
      hash |= 0;
    }
    const random = Math.abs(hash % 1000) / 1000 * totalWeight;

    let cumulative = 0;
    for (const variant of config.variants) {
      cumulative += variant.weight;
      if (random < cumulative) {
        testAssignments.set(userId, variant.id);
        const impMap = impressions.get(testId)!;
        impMap.set(variant.id, (impMap.get(variant.id) || 0) + 1);
        return variant;
      }
    }

    const fallback = config.variants[config.variants.length - 1];
    testAssignments.set(userId, fallback.id);
    return fallback;
  }

  function getVariant(testId: string, userId: string): ABTestVariant | null {
    const config = configs.find(c => c.id === testId);
    if (!config) return null;
    const variantId = assignments.get(testId)?.get(userId);
    return config.variants.find(v => v.id === variantId) || null;
  }

  function getActiveTests(): ABTestConfig[] {
    return configs.filter(c => c.active);
  }

  function recordConversion(testId: string, variantId: string): void {
    const convMap = conversions.get(testId);
    if (convMap) {
      convMap.set(variantId, (convMap.get(variantId) || 0) + 1);
    }
  }

  function getResults(testId: string) {
    const config = configs.find(c => c.id === testId);
    if (!config) return null;
    const impMap = impressions.get(testId)!;
    const convMap = conversions.get(testId)!;

    return config.variants.map(v => {
      const imp = impMap.get(v.id) || 0;
      const conv = convMap.get(v.id) || 0;
      return {
        variant: v,
        impressions: imp,
        conversions: conv,
        rate: imp > 0 ? Math.round((conv / imp) * 10000) / 10000 : 0,
      };
    });
  }

  return { assign, getVariant, getActiveTests, recordConversion, getResults };
}
