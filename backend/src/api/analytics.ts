/**
 * 用户分析 API
 * 接收和查询前端埋点数据
 */

import { Router, Request, Response } from 'express';
import { asyncHandler, sendSuccess } from '../utils/apiResponse';
import { createLogger } from '../utils/logger';

const router = Router();
const log = createLogger('AnalyticsAPI');

// ==================== 内存存储 (生产环境应使用数据库) ====================

interface AnalyticsEvent {
  name: string;
  properties?: Record<string, any>;
  timestamp: number;
  userId?: string;
  sessionId?: string;
  ip?: string;
  userAgent?: string;
}

const events: AnalyticsEvent[] = [];
const MAX_EVENTS = 100000;

// ==================== API 端点 ====================

/**
 * 接收前端埋点数据
 */
router.post('/analytics', asyncHandler(async (req: Request, res: Response) => {
  const { events: batchEvents, sessionId, userId } = req.body;

  if (!Array.isArray(batchEvents)) {
    res.status(400).json({ success: false, error: 'Invalid events format' });
    return;
  }

  const ip = req.ip || req.socket.remoteAddress;
  const userAgent = req.get('user-agent');

  // 存储事件
  for (const event of batchEvents) {
    events.push({
      ...event,
      sessionId,
      userId,
      ip,
      userAgent
    });
  }

  // 限制存储大小
  if (events.length > MAX_EVENTS) {
    events.splice(0, events.length - MAX_EVENTS);
  }

  log.info(`Received ${batchEvents.length} analytics events`, { sessionId, userId });

  sendSuccess(res, { received: batchEvents.length });
}));

/**
 * 获取分析摘要
 */
router.get('/analytics/summary', asyncHandler(async (_req: Request, res: Response) => {
  const now = Date.now();
  const last24h = events.filter(e => now - e.timestamp < 24 * 60 * 60 * 1000);
  const last7d = events.filter(e => now - e.timestamp < 7 * 24 * 60 * 60 * 1000);

  // 统计指标
  const totalEvents = events.length;
  const uniqueUsers = new Set(events.map(e => e.userId).filter(Boolean)).size;
  const pageViews = events.filter(e => e.name === 'page_view').length;

  // 热门事件
  const eventCounts: Record<string, number> = {};
  for (const event of last24h) {
    eventCounts[event.name] = (eventCounts[event.name] || 0) + 1;
  }
  const topEvents = Object.entries(eventCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }));

  // 热门页面
  const pageCounts: Record<string, number> = {};
  for (const event of last24h) {
    if (event.name === 'page_view' && event.properties?.path) {
      pageCounts[event.properties.path] = (pageCounts[event.properties.path] || 0) + 1;
    }
  }
  const topPages = Object.entries(pageCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([path, count]) => ({ path, count }));

  // 会话统计
  const sessions = new Set(events.map(e => e.sessionId).filter(Boolean)).size;
  const avgEventsPerSession = sessions > 0 ? totalEvents / sessions : 0;

  sendSuccess(res, {
    totalEvents,
    uniqueUsers,
    pageViews,
    sessions,
    avgEventsPerSession: Math.round(avgEventsPerSession),
    topEvents,
    topPages,
    last24h: last24h.length,
    last7d: last7d.length
  });
}));

/**
 * 获取实时事件流
 */
router.get('/analytics/events', asyncHandler(async (req: Request, res: Response) => {
  const { limit = 50, event_name, user_id } = req.query;

  let filtered = [...events];

  if (event_name) {
    filtered = filtered.filter(e => e.name === event_name);
  }

  if (user_id) {
    filtered = filtered.filter(e => e.userId === user_id);
  }

  const limitNum = parseInt(limit as string, 10);
  const recent = filtered.slice(-limitNum).reverse();

  sendSuccess(res, { events: recent });
}));

/**
 * 获取用户行为漏斗
 */
router.get('/analytics/funnel', asyncHandler(async (_req: Request, res: Response) => {
  const now = Date.now();
  const last24h = events.filter(e => now - e.timestamp < 24 * 60 * 60 * 1000);

  // 定义漏斗步骤
  const funnel = [
    { name: '访问首页', event: 'page_view', filter: (e: AnalyticsEvent) => e.properties?.path === '/' },
    { name: '查看股票', event: 'stock_view' },
    { name: '使用筛选器', event: 'strategy_use' },
    { name: '加入自选', event: 'interaction', filter: (e: AnalyticsEvent) => e.properties?.element === 'watchlist_button' },
    { name: 'AI对话', event: 'ai_chat' }
  ];

  const results = funnel.map(step => {
    const stepEvents = last24h.filter(e => {
      if (e.name !== step.event) return false;
      if (step.filter && !step.filter(e)) return false;
      return true;
    });

    const uniqueUsers = new Set(stepEvents.map(e => e.userId).filter(Boolean)).size;

    return {
      name: step.name,
      event: step.event,
      totalEvents: stepEvents.length,
      uniqueUsers
    };
  });

  sendSuccess(res, { funnel: results });
}));

/**
 * 获取性能指标
 */
router.get('/analytics/performance', asyncHandler(async (_req: Request, res: Response) => {
  const perfEvents = events.filter(e => e.name === 'performance');

  const metrics: Record<string, number[]> = {};
  for (const event of perfEvents) {
    const metric = event.properties?.metric;
    const value = event.properties?.value;
    if (metric && typeof value === 'number') {
      if (!metrics[metric]) metrics[metric] = [];
      metrics[metric].push(value);
    }
  }

  const stats = Object.entries(metrics).map(([metric, values]) => ({
    metric,
    count: values.length,
    avg: values.reduce((a, b) => a + b, 0) / values.length,
    min: Math.min(...values),
    max: Math.max(...values),
    p50: percentile(values, 50),
    p95: percentile(values, 95),
    p99: percentile(values, 99)
  }));

  sendSuccess(res, { metrics: stats });
}));

// ==================== 辅助函数 ====================

function percentile(values: number[], p: number): number {
  const sorted = values.sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[index] || 0;
}

export default router;
