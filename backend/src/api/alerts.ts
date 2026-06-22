/**
 * 行情预警系统 API
 * 支持价格预警、涨跌幅预警、成交量异动预警
 * 参考同花顺预警功能
 */

import { Request, Response, Router } from 'express';
import { db } from '../db/dbFactory';
import { validateQuery, validateBody, validateParams, schemas } from '../middleware/validation';
import { asyncHandler, sendSuccess, sendNotFound, sendInternalError } from '../utils/apiResponse';
import type { NotificationPayload, NotificationPriority, NotificationChannel, NotificationStatus } from '../services/notification/types';
import type { DailyQuote } from '../models/Stock';
import { wsPushEngine } from '../services/notification/wsPushEngine';
import { notificationRouter } from '../services/notification/priorityRouter';

const router = Router();

// ==================== 类型定义 ====================

/** 告警触发模式 (对标TradingView) */
type AlertTriggerMode = 'once' | 'once_per_bar' | 'every_time';

/** 指标条件类型 */
type IndicatorCondition = 'macd_cross_up' | 'macd_cross_down' | 'rsi_above' | 'rsi_below' | 
  'bollinger_upper' | 'bollinger_lower' | 'ma_cross_up' | 'ma_cross_down' | 'volume_ma_above';

interface AlertRule {
  id: number;
  userId: number;
  symbol: string;
  alertType: 'price_above' | 'price_below' | 'change_above' | 'change_below' | 
    'volume_surge' | 'indicator' | 'composite';
  threshold: number;
  // 指标告警字段
  indicatorType?: IndicatorCondition;
  indicatorParams?: Record<string, number>;
  // 复合条件 (AND/OR逻辑)
  compositeOperator?: 'and' | 'or';
  subConditions?: Array<{ alertType: string; threshold: number; indicatorType?: string }>;
  // 触发模式
  triggerMode: AlertTriggerMode;
  // 通知渠道
  channels: Array<'websocket' | 'email' | 'sms'>;
  isActive: boolean;
  isTriggered: boolean;
  triggeredAt?: string;
  triggeredValue?: number;
  message?: string;
  // 统计
  triggerCount: number;
  lastTriggerBar?: string; // 用于 once_per_bar
  createdAt: string;
  updatedAt: string;
}

// 内存存储（生产环境应使用数据库）
const alertRules: Map<number, AlertRule> = new Map();
let alertIdCounter = 1;

// 预警触发历史
const alertHistory: Array<{
  id: number;
  alertId: number;
  userId: number;
  symbol: string;
  alertType: string;
  threshold: number;
  actualValue: number;
  triggeredAt: string;
  message: string;
  channels: string[];
}> = [];

// 已推送的预警ID（避免重复推送）
const pushedAlerts: Set<number> = new Set();

/**
 * 创建预警规则
 * POST /api/alerts
 */
router.post('/alerts', validateBody(schemas.alertCreate), async (req: Request, res: Response) => {
  try {
    const { symbol, alertType, threshold, message, indicatorType, indicatorParams,
      compositeOperator, subConditions, triggerMode, channels } = req.body;

    // 验证必填字段
    if (!symbol || !alertType || threshold === undefined) {
      return res.status(400).json({
        success: false,
        error: '缺少必填字段: symbol, alertType, threshold',
      });
    }

    // 验证 alertType
    const validTypes = ['price_above', 'price_below', 'change_above', 'change_below', 
      'volume_surge', 'indicator', 'composite'];
    if (!validTypes.includes(alertType)) {
      return res.status(400).json({
        success: false,
        error: `无效的预警类型，支持: ${validTypes.join(', ')}`,
      });
    }

    // 验证指标告警
    if (alertType === 'indicator' && !indicatorType) {
      return res.status(400).json({
        success: false,
        error: '指标告警必须指定 indicatorType',
      });
    }

    // 验证 threshold
    if (typeof threshold !== 'number' || isNaN(threshold)) {
      return res.status(400).json({
        success: false,
        error: 'threshold 必须是数字',
      });
    }

    const userId = parseInt(req.body.userId as string) || 1;

    // 验证股票是否存在
    const stock = await db.getStockBySymbol(symbol);
    if (!stock) {
      return res.status(404).json({
        success: false,
        error: `股票 ${symbol} 不存在`,
      });
    }

    const alert: AlertRule = {
      id: alertIdCounter++,
      userId,
      symbol,
      alertType,
      threshold,
      indicatorType,
      indicatorParams: indicatorParams || {},
      compositeOperator: compositeOperator || 'and',
      subConditions: subConditions || [],
      triggerMode: triggerMode || 'once',
      channels: channels || ['websocket'],
      isActive: true,
      isTriggered: false,
      triggerCount: 0,
      message: message || generateAlertMessage(symbol, alertType, threshold),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    alertRules.set(alert.id, alert);

    res.status(201).json({
      success: true,
      data: alert,
    });
  } catch (error) {
    console.error('创建预警失败:', error);
    res.status(500).json({
      success: false,
      error: '创建预警失败',
    });
  }
});

/**
 * 查询预警列表
 * GET /api/alerts
 */
router.get('/alerts', validateQuery(schemas.alertQuery), async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.query.userId as string) || 1;
    const isActive = req.query.isActive !== undefined ? req.query.isActive === 'true' : undefined;
    const symbol = req.query.symbol as string | undefined;
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = Math.min(parseInt(req.query.pageSize as string) || 20, 100);

    let alerts = Array.from(alertRules.values())
      .filter((a) => a.userId === userId);

    if (isActive !== undefined) {
      alerts = alerts.filter((a) => a.isActive === isActive);
    }
    if (symbol) {
      alerts = alerts.filter((a) => a.symbol === symbol);
    }

    // 按创建时间倒序
    alerts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const totalCount = alerts.length;
    const start = (page - 1) * pageSize;
    const pagedAlerts = alerts.slice(start, start + pageSize);

    res.json({
      success: true,
      data: {
        alerts: pagedAlerts,
        pagination: {
          page,
          pageSize,
          totalCount,
          totalPages: Math.ceil(totalCount / pageSize),
        },
      },
    });
  } catch (error) {
    console.error('查询预警列表失败:', error);
    res.status(500).json({
      success: false,
      error: '查询预警列表失败',
    });
  }
});

/**
 * 获取预警详情
 * GET /api/alerts/:id
 */
router.get('/alerts/:id', validateParams(schemas.alertId), async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const alert = alertRules.get(id);

  if (!alert) {
    return res.status(404).json({
      success: false,
      error: '预警规则不存在',
    });
  }

  res.json({
    success: true,
    data: alert,
  });
});

/**
 * 更新预警规则
 * PUT /api/alerts/:id
 */
router.put('/alerts/:id', validateParams(schemas.alertId), validateBody(schemas.alertUpdate), async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const alert = alertRules.get(id);

  if (!alert) {
    return res.status(404).json({
      success: false,
      error: '预警规则不存在',
    });
  }

  const { threshold, isActive, message, triggerMode, channels, indicatorType, indicatorParams } = req.body;

  if (threshold !== undefined) {
    if (typeof threshold !== 'number' || isNaN(threshold)) {
      return res.status(400).json({
        success: false,
        error: 'threshold 必须是数字',
      });
    }
    alert.threshold = threshold;
  }
  if (isActive !== undefined) {
    alert.isActive = isActive;
    // 重新激活时清除触发状态
    if (isActive) {
      alert.isTriggered = false;
      alert.triggeredAt = undefined;
      alert.triggeredValue = undefined;
      pushedAlerts.delete(id);
    }
  }
  if (message !== undefined) {
    alert.message = message;
  }
  if (triggerMode !== undefined) {
    const validModes = ['once', 'once_per_bar', 'every_time'];
    if (validModes.includes(triggerMode)) {
      alert.triggerMode = triggerMode;
      // 切换到可重复触发模式时重置状态
      if (triggerMode !== 'once') {
        alert.isTriggered = false;
      }
    }
  }
  if (channels !== undefined && Array.isArray(channels)) {
    alert.channels = channels;
  }
  if (indicatorType !== undefined) alert.indicatorType = indicatorType;
  if (indicatorParams !== undefined) alert.indicatorParams = indicatorParams;
  alert.updatedAt = new Date().toISOString();

  alertRules.set(id, alert);

  res.json({
    success: true,
    data: alert,
  });
});

/**
 * 删除预警规则
 * DELETE /api/alerts/:id
 */
router.delete('/alerts/:id', validateParams(schemas.alertId), async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);

  if (!alertRules.has(id)) {
    return res.status(404).json({
      success: false,
      error: '预警规则不存在',
    });
  }

  alertRules.delete(id);
  pushedAlerts.delete(id);

  res.json({
    success: true,
    data: { deleted: true, id },
  });
});

/**
 * 批量删除预警
 * POST /api/alerts/batch-delete
 */
router.post('/alerts/batch-delete', validateBody(schemas.alertBatchDelete), async (req: Request, res: Response) => {
  const { ids } = req.body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'ids 必须是非空数组',
    });
  }

  let deleted = 0;
  for (const id of ids) {
    if (alertRules.has(id)) {
      alertRules.delete(id);
      pushedAlerts.delete(id);
      deleted++;
    }
  }

  res.json({
    success: true,
    data: { deleted, total: ids.length },
  });
});

/**
 * 获取预警触发历史
 * GET /api/alerts/history
 */
router.get('/alerts/history', validateQuery(schemas.alertHistory), async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const pageSize = Math.min(parseInt(req.query.pageSize as string) || 20, 100);
  const symbol = req.query.symbol as string | undefined;

  let history = [...alertHistory];
  if (symbol) {
    history = history.filter((h) => h.symbol === symbol);
  }

  // 按触发时间倒序
  history.sort((a, b) => new Date(b.triggeredAt).getTime() - new Date(a.triggeredAt).getTime());

  const totalCount = history.length;
  const start = (page - 1) * pageSize;
  const pagedHistory = history.slice(start, start + pageSize);

  res.json({
    success: true,
    data: {
      history: pagedHistory,
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages: Math.ceil(totalCount / pageSize),
      },
    },
  });
});

/**
 * 手动检查预警（测试用）
 * POST /api/alerts/check
 */
router.post('/alerts/check', async (req: Request, res: Response) => {
  try {
    const triggered = await checkAlerts();

    res.json({
      success: true,
      data: {
        checked: alertRules.size,
        triggered: triggered.length,
        alerts: triggered,
      },
    });
  } catch (error) {
    console.error('预警检查失败:', error);
    res.status(500).json({
      success: false,
      error: '预警检查失败',
    });
  }
});

/**
 * 获取预警统计
 * GET /api/alerts/stats
 */
router.get('/alerts/stats', async (req: Request, res: Response) => {
  const userId = parseInt(req.query.userId as string) || 1;
  const userAlerts = Array.from(alertRules.values())
    .filter((a) => a.userId === userId);

  const stats = {
    total: userAlerts.length,
    active: userAlerts.filter((a) => a.isActive).length,
    triggered: userAlerts.filter((a) => a.isTriggered).length,
    byType: {
      price_above: userAlerts.filter((a) => a.alertType === 'price_above').length,
      price_below: userAlerts.filter((a) => a.alertType === 'price_below').length,
      change_above: userAlerts.filter((a) => a.alertType === 'change_above').length,
      change_below: userAlerts.filter((a) => a.alertType === 'change_below').length,
      volume_surge: userAlerts.filter((a) => a.alertType === 'volume_surge').length,
    },
    historyCount: alertHistory.length,
  };

  res.json({
    success: true,
    data: stats,
  });
});

// ==================== 工具函数 ====================

function generateAlertMessage(symbol: string, alertType: string, threshold: number): string {
  const typeMap: Record<string, string> = {
    price_above: `价格突破`,
    price_below: `价格跌破`,
    change_above: `涨幅超过`,
    change_below: `跌幅超过`,
    volume_surge: `成交量超过`,
    indicator: `指标触发`,
    composite: `复合条件触发`,
  };
  const unitMap: Record<string, string> = {
    price_above: '元',
    price_below: '元',
    change_above: '%',
    change_below: '%',
    volume_surge: '倍（均量）',
  };
  return `${symbol} ${typeMap[alertType]} ${threshold}${unitMap[alertType]}`;
}

/**
 * 检查所有活跃预警规则
 * 返回被触发的预警列表
 */
export async function checkAlerts(): Promise<AlertRule[]> {
  const triggeredAlerts: AlertRule[] = [];
  const now = new Date().toISOString();
  const todayBar = now.substring(0, 10); // YYYY-MM-DD 用于 once_per_bar

  for (const [id, alert] of alertRules) {
    if (!alert.isActive) continue;
    // once 模式：已触发则跳过
    if (alert.triggerMode === 'once' && alert.isTriggered) continue;
    // once_per_bar：同日已触发则跳过
    if (alert.triggerMode === 'once_per_bar' && alert.lastTriggerBar === todayBar) continue;

    try {
      const stock = await db.getStockBySymbol(alert.symbol);
      if (!stock) continue;

      const quote = await db.getLatestDailyQuote(stock.id);
      if (!quote) continue;

      let isTriggered = false;
      let actualValue = 0;

      if (alert.alertType === 'composite') {
        // 复合条件评估
        isTriggered = evaluateCompositeCondition(alert, quote);
        actualValue = isTriggered ? 1 : 0;
      } else if (alert.alertType === 'indicator') {
        // 指标告警评估
        const result = evaluateIndicatorCondition(alert, quote);
        isTriggered = result.triggered;
        actualValue = result.value;
      } else {
        // 基础告警评估
        switch (alert.alertType) {
          case 'price_above':
            actualValue = quote.closePrice;
            isTriggered = actualValue >= alert.threshold;
            break;
          case 'price_below':
            actualValue = quote.closePrice;
            isTriggered = actualValue <= alert.threshold;
            break;
          case 'change_above':
            actualValue = quote.changePercent;
            isTriggered = actualValue >= alert.threshold;
            break;
          case 'change_below':
            actualValue = quote.changePercent;
            isTriggered = actualValue <= alert.threshold;
            break;
          case 'volume_surge': {
            // 改进：获取平均成交量进行对比
            const avgVolume = await getAverageVolume(stock.id, 20);
            actualValue = avgVolume > 0 ? quote.volume / avgVolume : quote.volume;
            isTriggered = actualValue >= alert.threshold;
            break;
          }
        }
      }

      if (isTriggered) {
        // 更新触发状态
        alert.isTriggered = true;
        alert.triggeredAt = now;
        alert.triggeredValue = actualValue;
        alert.triggerCount = (alert.triggerCount || 0) + 1;
        alert.lastTriggerBar = todayBar;
        alertRules.set(id, alert);

        // 记录触发历史
        const historyEntry = {
          id: alertHistory.length + 1,
          alertId: id,
          userId: alert.userId,
          symbol: alert.symbol,
          alertType: alert.alertType,
          threshold: alert.threshold,
          actualValue,
          triggeredAt: now,
          message: alert.message || generateAlertMessage(alert.symbol, alert.alertType, alert.threshold),
          channels: alert.channels || ['websocket'],
        };
        alertHistory.push(historyEntry);

        // WebSocket 推送通知
        pushAlertNotification(alert, actualValue);

        triggeredAlerts.push(alert);
      }
    } catch (err) {
      console.error(`检查预警 ${id} 失败:`, err);
    }
  }

  return triggeredAlerts;
}

/**
 * 评估复合条件 (AND/OR逻辑)
 */
function evaluateCompositeCondition(alert: AlertRule, quote: DailyQuote): boolean {
  if (!alert.subConditions || alert.subConditions.length === 0) return false;
  
  const results = alert.subConditions.map(cond => {
    switch (cond.alertType) {
      case 'price_above': return quote.closePrice >= cond.threshold;
      case 'price_below': return quote.closePrice <= cond.threshold;
      case 'change_above': return quote.changePercent >= cond.threshold;
      case 'change_below': return quote.changePercent <= cond.threshold;
      default: return false;
    }
  });
  
  return alert.compositeOperator === 'and' 
    ? results.every(r => r) 
    : results.some(r => r);
}

/**
 * 评估指标条件
 */
function evaluateIndicatorCondition(alert: AlertRule, quote: DailyQuote): { triggered: boolean; value: number } {
  const params = alert.indicatorParams || {};
  const value = quote.closePrice;
  
  switch (alert.indicatorType) {
    case 'rsi_above':
      // 简化RSI计算：用涨跌幅近似
      return { triggered: Math.abs(quote.changePercent) > (params.threshold || 70), value: Math.abs(quote.changePercent) };
    case 'rsi_below':
      return { triggered: Math.abs(quote.changePercent) < (params.threshold || 30), value: Math.abs(quote.changePercent) };
    case 'ma_cross_up':
    case 'ma_cross_down':
      // 简化：用价格与阈值对比
      return { triggered: alert.indicatorType === 'ma_cross_up' ? value >= alert.threshold : value <= alert.threshold, value };
    case 'bollinger_upper':
      return { triggered: value >= alert.threshold, value };
    case 'bollinger_lower':
      return { triggered: value <= alert.threshold, value };
    case 'volume_ma_above': {
      const avgVol = params.avgVolume || alert.threshold;
      return { triggered: quote.volume >= avgVol, value: quote.volume };
    }
    default:
      return { triggered: false, value: 0 };
  }
}

/**
 * 获取平均成交量
 */
async function getAverageVolume(stockId: number, days: number = 20): Promise<number> {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const quotes = await db.getDailyQuotes(stockId, startDate);
    if (!quotes || quotes.length === 0) return 0;
    const total = quotes.reduce((sum: number, q: DailyQuote) => sum + (q.volume || 0), 0);
    return total / quotes.length;
  } catch {
    return 0;
  }
}

/**
 * WebSocket 推送告警通知
 */
function pushAlertNotification(alert: AlertRule, actualValue: number): void {
  try {
    const priority = alert.alertType === 'composite' ? 'urgent' : 
      (Math.abs(actualValue - alert.threshold) / Math.max(Math.abs(alert.threshold), 1) > 0.1 ? 'high' : 'medium');
    
    const notification: NotificationPayload = {
      id: `alert_push_${alert.id}_${Date.now()}`,
      type: 'price_alert',
      priority: priority as NotificationPriority,
      title: `预警触发: ${alert.symbol}`,
      body: alert.message || `${alert.symbol} 触发 ${alert.alertType} 告警`,
      data: {
        alertId: alert.id,
        symbol: alert.symbol,
        alertType: alert.alertType,
        threshold: alert.threshold,
        actualValue,
        triggerCount: alert.triggerCount,
      },
      channels: alert.channels as NotificationChannel[] || ['websocket'],
      userId: String(alert.userId),
      read: false,
      status: 'sent' as NotificationStatus,
      createdAt: Date.now(),
    };
    
    // 通过优先级路由器分发
    const routingResult = notificationRouter.route(notification);
    
    // WebSocket推送
    if (routingResult.channels.includes('websocket')) {
      wsPushEngine.pushToUser(String(alert.userId), notification);
    }
  } catch (err) {
    // 静默失败，不影响告警主流程
    console.warn('WebSocket推送失败:', err);
  }
}

/**
 * 重置所有预警触发状态（开盘时调用）
 */
export function resetAlerts(): void {
  for (const [id, alert] of alertRules) {
    if (alert.isTriggered) {
      alert.isTriggered = false;
      alert.triggeredAt = undefined;
      alert.triggeredValue = undefined;
      alertRules.set(id, alert);
    }
  }
  pushedAlerts.clear();
}

// 导出数据供外部访问
export function getAlertRules() { return alertRules; }
export function getAlertHistory() { return alertHistory; }
export function getPushedAlerts() { return pushedAlerts; }
export function getAlertStats() { return { totalRules: alertRules.size, historyCount: alertHistory.length }; }
export { AlertRule, AlertTriggerMode, IndicatorCondition };

export default router;
