/**
 * 用户分析 API
 * 接收前端发送的页面访问和用户行为数据
 */

import { Request, Response, Router } from 'express';
import { asyncHandler } from '../utils/apiResponse';

const router = Router();

// 内存存储（生产环境应使用数据库）
const analyticsStore = {
  events: [] as any[],
  pageViews: [] as any[],
  sessions: new Map<string, any>(),
};

// 批量接收分析数据
router.post('/analytics/batch', asyncHandler(async (req: Request, res: Response) => {
  const { events, pageViews, session, timestamp } = req.body;

  // 验证数据
  if (!Array.isArray(events) || !Array.isArray(pageViews)) {
    res.status(400).json({ success: false, error: 'Invalid data format' });
    return;
  }

  // 存储数据（生产环境应写入数据库）
  analyticsStore.events.push(...events.map((e: any) => ({
    ...e,
    receivedAt: Date.now(),
  })));

  analyticsStore.pageViews.push(...pageViews.map((pv: any) => ({
    ...pv,
    receivedAt: Date.now(),
  })));

  if (session?.id) {
    analyticsStore.sessions.set(session.id, {
      ...session,
      lastUpdated: Date.now(),
    });
  }

  // 限制内存使用（保留最近1000条）
  if (analyticsStore.events.length > 1000) {
    analyticsStore.events = analyticsStore.events.slice(-1000);
  }
  if (analyticsStore.pageViews.length > 1000) {
    analyticsStore.pageViews = analyticsStore.pageViews.slice(-1000);
  }

  res.json({
    success: true,
    received: {
      events: events.length,
      pageViews: pageViews.length,
    },
  });
}));

// 获取分析统计
router.get('/analytics/stats', asyncHandler(async (_req: Request, res: Response) => {
  const now = Date.now();
  const last24h = now - 24 * 60 * 60 * 1000;
  const last1h = now - 60 * 60 * 1000;

  const recentEvents = analyticsStore.events.filter(e => e.timestamp > last24h);
  const recentPageViews = analyticsStore.pageViews.filter(pv => pv.timestamp > last24h);
  const activeSessions = Array.from(analyticsStore.sessions.values())
    .filter(s => s.lastUpdated > last1h);

  // 统计热门页面
  const pageViewCounts: Record<string, number> = {};
  recentPageViews.forEach(pv => {
    pageViewCounts[pv.path] = (pageViewCounts[pv.path] || 0) + 1;
  });

  const topPages = Object.entries(pageViewCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([path, count]) => ({ path, count }));

  // 统计热门事件
  const eventCounts: Record<string, number> = {};
  recentEvents.forEach(e => {
    eventCounts[e.name] = (eventCounts[e.name] || 0) + 1;
  });

  const topEvents = Object.entries(eventCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }));

  res.json({
    success: true,
    data: {
      period: '24h',
      totalEvents: recentEvents.length,
      totalPageViews: recentPageViews.length,
      activeSessions: activeSessions.length,
      topPages,
      topEvents,
      timestamp: now,
    },
  });
}));

// 获取性能指标
router.get('/analytics/performance', asyncHandler(async (_req: Request, res: Response) => {
  const now = Date.now();
  const last1h = now - 60 * 60 * 1000;

  const performanceEvents = analyticsStore.events
    .filter(e => e.name === 'performance' && e.timestamp > last1h);

  const metrics: Record<string, number[]> = {};
  performanceEvents.forEach(e => {
    const metric = e.properties?.metric;
    const value = e.properties?.value;
    if (metric && typeof value === 'number') {
      if (!metrics[metric]) metrics[metric] = [];
      metrics[metric].push(value);
    }
  });

  const stats: Record<string, { avg: number; min: number; max: number; count: number }> = {};
  Object.entries(metrics).forEach(([metric, values]) => {
    stats[metric] = {
      avg: values.reduce((a, b) => a + b, 0) / values.length,
      min: Math.min(...values),
      max: Math.max(...values),
      count: values.length,
    };
  });

  res.json({
    success: true,
    data: {
      period: '1h',
      metrics: stats,
      timestamp: now,
    },
  });
}));

export default router;
