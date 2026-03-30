/**
 * 行情预警系统 API
 * 支持价格预警、涨跌幅预警、成交量异动预警
 * 参考同花顺预警功能
 */

import { Request, Response, Router } from 'express';
import { db } from '../db/Database';
import { validateQuery, validateBody, validateParams, schemas } from '../middleware/validation';
import { asyncHandler, sendSuccess, sendNotFound, sendInternalError } from '../utils/apiResponse';

const router = Router();

// ==================== 类型定义 ====================

interface AlertRule {
  id: number;
  userId: number;
  symbol: string;
  alertType: 'price_above' | 'price_below' | 'change_above' | 'change_below' | 'volume_surge';
  threshold: number;
  isActive: boolean;
  isTriggered: boolean;
  triggeredAt?: string;
  triggeredValue?: number;
  message?: string;
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
  symbol: string;
  alertType: string;
  threshold: number;
  actualValue: number;
  triggeredAt: string;
  message: string;
}> = [];

// 已推送的预警ID（避免重复推送）
const pushedAlerts: Set<number> = new Set();

/**
 * 创建预警规则
 * POST /api/alerts
 */
router.post('/alerts', async (req: Request, res: Response) => {
  try {
    const { symbol, alertType, threshold, message } = req.body;

    // 验证必填字段
    if (!symbol || !alertType || threshold === undefined) {
      return res.status(400).json({
        success: false,
        error: '缺少必填字段: symbol, alertType, threshold',
      });
    }

    // 验证 alertType
    const validTypes = ['price_above', 'price_below', 'change_above', 'change_below', 'volume_surge'];
    if (!validTypes.includes(alertType)) {
      return res.status(400).json({
        success: false,
        error: `无效的预警类型，支持: ${validTypes.join(', ')}`,
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
      isActive: true,
      isTriggered: false,
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
router.get('/alerts', async (req: Request, res: Response) => {
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
router.get('/alerts/:id', async (req: Request, res: Response) => {
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
router.put('/alerts/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const alert = alertRules.get(id);

  if (!alert) {
    return res.status(404).json({
      success: false,
      error: '预警规则不存在',
    });
  }

  const { threshold, isActive, message } = req.body;

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
router.delete('/alerts/:id', async (req: Request, res: Response) => {
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
router.post('/alerts/batch-delete', async (req: Request, res: Response) => {
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
router.get('/alerts/history', async (req: Request, res: Response) => {
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

  for (const [id, alert] of alertRules) {
    if (!alert.isActive || alert.isTriggered) continue;

    try {
      const stock = await db.getStockBySymbol(alert.symbol);
      if (!stock) continue;

      const quote = await db.getLatestDailyQuote(stock.id);
      if (!quote) continue;

      let isTriggered = false;
      let actualValue = 0;

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
        case 'volume_surge':
          // volume_surge threshold 是倍数，需要对比平均成交量
          // 简化处理：直接用当日成交量与 threshold 比较
          actualValue = quote.volume;
          isTriggered = actualValue >= alert.threshold;
          break;
      }

      if (isTriggered) {
        alert.isTriggered = true;
        alert.triggeredAt = now;
        alert.triggeredValue = actualValue;
        alertRules.set(id, alert);

        // 记录触发历史
        const historyEntry = {
          id: alertHistory.length + 1,
          alertId: id,
          symbol: alert.symbol,
          alertType: alert.alertType,
          threshold: alert.threshold,
          actualValue,
          triggeredAt: now,
          message: alert.message || generateAlertMessage(alert.symbol, alert.alertType, alert.threshold),
        };
        alertHistory.push(historyEntry);

        triggeredAlerts.push(alert);
      }
    } catch (err) {
      console.error(`检查预警 ${id} 失败:`, err);
    }
  }

  return triggeredAlerts;
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

export default router;
