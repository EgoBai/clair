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
 * 诚实数据契约发送器（本文件统一出口）：顶层 dataSource 与 data 内同源。
 *
 * 本文件的规则集合**存于进程内存**（见上方 alertRules / alertHistory，注释自承
 * 「生产环境应使用数据库」）。返回的内容确实是用户真实创建的（不是造数），
 * 但**不具持久性**：服务重启即丢失。故成功路径标 'real'，同时用 `storageNote`
 * 写明存储性质，避免调用方把它当成已落库的持久数据。
 */
function sendHonest(
  res: Response,
  dataSource: 'real' | 'unavailable',
  data: Record<string, unknown>,
  statusCode = 200,
): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(statusCode).json({
    success: true,
    dataSource,
    data: { ...data, dataSource },
    timestamp: new Date().toISOString(),
  });
}

/** 成功响应统一附带的存储性质说明（内存态、未落库） */
const STORAGE_NOTE = '预警规则与触发历史存于服务进程内存（未落库），服务重启即丢失；返回的是当前进程内的真实数据';

/**
 * 失败响应统一出口：**保留原 HTTP 语义**（400/404/500 不变），
 * 但补上顶层 `dataSource`，避免前端在拿不到数据时无从判定诚实级别。
 */
function sendUnavailable(res: Response, statusCode: number, error: string): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(statusCode).json({
    success: false,
    dataSource: 'unavailable',
    error,
    timestamp: new Date().toISOString(),
  });
}

/**
 * 最近一次 `checkAlerts()` 的可观测计数。
 *
 * 动机：旧实现在「股票不存在 / 最新行情取不到」时是**静默 `continue`**，
 * 而 `/api/alerts/check` 仍回报 `checked: alertRules.size`，调用方无法区分
 * 「真的逐条判过了、结论是 0 条触发」与「行情全不可得、一条也没判成」——
 * 后者被当成前者就是伪结论。故把判定覆盖率显式记下来并由端点如实披露。
 */
let lastCheckStats = { rulesScanned: 0, quotesResolved: 0, quotesMissing: 0, unevaluable: 0 };

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
      return sendUnavailable(res, 400, '缺少必填字段: symbol, alertType, threshold');
    }

    // 验证 alertType
    const validTypes = ['price_above', 'price_below', 'change_above', 'change_below', 
      'volume_surge', 'indicator', 'composite'];
    if (!validTypes.includes(alertType)) {
      return sendUnavailable(res, 400, `无效的预警类型，支持: ${validTypes.join(', ')}`);
    }

    // 验证指标告警
    if (alertType === 'indicator' && !indicatorType) {
      return sendUnavailable(res, 400, '指标告警必须指定 indicatorType');
    }

    // 验证 threshold
    if (typeof threshold !== 'number' || isNaN(threshold)) {
      return sendUnavailable(res, 400, 'threshold 必须是数字');
    }

    const userId = parseInt(req.body.userId as string) || 1;

    // 验证股票是否存在
    const stock = await db.getStockBySymbol(symbol);
    if (!stock) {
      // 该标的在库中不可得 → 无法为其建立可判定的预警，诚实降级而非静默失败
      return sendUnavailable(res, 404, `股票 ${symbol} 不存在`);
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

    sendHonest(res, 'real', { ...alert, storageNote: STORAGE_NOTE }, 201);
  } catch (error) {
    console.error('创建预警失败:', error);
    sendUnavailable(res, 500, '创建预警失败');
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

    // 列表为空是**真实结论**（该用户确实没有匹配规则），不是数据不可得 → real
    sendHonest(res, 'real', {
      alerts: pagedAlerts,
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages: Math.ceil(totalCount / pageSize),
      },
      storageNote: STORAGE_NOTE,
    });
  } catch (error) {
    console.error('查询预警列表失败:', error);
    sendUnavailable(res, 500, '查询预警列表失败');
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
    return sendUnavailable(res, 404, '预警规则不存在');
  }

  sendHonest(res, 'real', { ...alert, storageNote: STORAGE_NOTE });
});

/**
 * 更新预警规则
 * PUT /api/alerts/:id
 */
router.put('/alerts/:id', validateParams(schemas.alertId), validateBody(schemas.alertUpdate), async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const alert = alertRules.get(id);

  if (!alert) {
    return sendUnavailable(res, 404, '预警规则不存在');
  }

  const { threshold, isActive, message, triggerMode, channels, indicatorType, indicatorParams } = req.body;

  if (threshold !== undefined) {
    if (typeof threshold !== 'number' || isNaN(threshold)) {
      return sendUnavailable(res, 400, 'threshold 必须是数字');
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

  sendHonest(res, 'real', { ...alert, storageNote: STORAGE_NOTE });
});

/**
 * 删除预警规则
 * DELETE /api/alerts/:id
 */
router.delete('/alerts/:id', validateParams(schemas.alertId), async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);

  if (!alertRules.has(id)) {
    return sendUnavailable(res, 404, '预警规则不存在');
  }

  alertRules.delete(id);
  pushedAlerts.delete(id);

  sendHonest(res, 'real', { deleted: true, id, storageNote: STORAGE_NOTE });
});

/**
 * 批量删除预警
 * POST /api/alerts/batch-delete
 */
router.post('/alerts/batch-delete', validateBody(schemas.alertBatchDelete), async (req: Request, res: Response) => {
  const { ids } = req.body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return sendUnavailable(res, 400, 'ids 必须是非空数组');
  }

  let deleted = 0;
  for (const id of ids) {
    if (alertRules.has(id)) {
      alertRules.delete(id);
      pushedAlerts.delete(id);
      deleted++;
    }
  }

  sendHonest(res, 'real', { deleted, total: ids.length, storageNote: STORAGE_NOTE });
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

  sendHonest(res, 'real', {
    history: pagedHistory,
    pagination: {
      page,
      pageSize,
      totalCount,
      totalPages: Math.ceil(totalCount / pageSize),
    },
    storageNote: STORAGE_NOTE,
  });
});

/**
 * 手动检查预警（测试用）
 * POST /api/alerts/check
 *
 * 诚实要点：触发判定**消费真实行情**（checkAlerts → db.getLatestDailyQuote）。
 * 行情不可得时，旧实现静默跳过却仍回报 `checked: alertRules.size`，
 * 等价于把「一条都没判成」伪装成「判过了、0 条触发」。现在按判定覆盖率分流：
 *   - 无规则可判            → unavailable（没做判定）
 *   - 有规则但行情全不可得  → unavailable（判不了）
 *   - 部分标的行情缺失      → real，但在 data 里如实带上缺失数
 */
router.post('/alerts/check', async (req: Request, res: Response) => {
  try {
    const triggered = await checkAlerts();
    const { rulesScanned, quotesResolved, quotesMissing, unevaluable } = lastCheckStats;

    let dataSource: 'real' | 'unavailable' = 'real';
    let message: string;
    if (rulesScanned === 0) {
      dataSource = 'unavailable';
      message = '当前没有处于可判定状态的预警规则（无规则 / 全部未启用 / 均已在触发模式下跳过），未执行任何触发判定';
    } else if (quotesResolved === 0) {
      dataSource = 'unavailable';
      message = `共 ${rulesScanned} 条规则待判，但所有对应标的最新行情均不可得，无法完成触发判定`;
    } else if (quotesMissing > 0 || unevaluable > 0) {
      message = `已基于真实行情判定 ${quotesResolved} 条规则，触发 ${triggered.length} 条；另有 ${quotesMissing} 条因最新行情不可得、${unevaluable} 条因均量不可得而未参与判定`;
    } else {
      message = `已基于真实行情判定 ${quotesResolved} 条规则，触发 ${triggered.length} 条`;
    }

    sendHonest(res, dataSource, {
      checked: rulesScanned,
      quotesResolved,
      quotesMissing,
      unevaluable,
      triggered: triggered.length,
      alerts: triggered,
      message,
    });
  } catch (error) {
    console.error('预警检查失败:', error);
    sendUnavailable(res, 500, '预警检查失败');
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

  // 全 0 是**真实计数结论**（该用户确实没建规则/没触发过），不是拿不到数据 → real
  sendHonest(res, 'real', { ...stats, storageNote: STORAGE_NOTE });
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

  // 判定覆盖率计数：让「没判成」与「判过了、结论是不触发」可被区分
  lastCheckStats = { rulesScanned: 0, quotesResolved: 0, quotesMissing: 0, unevaluable: 0 };

  for (const [id, alert] of alertRules) {
    if (!alert.isActive) continue;
    // once 模式：已触发则跳过
    if (alert.triggerMode === 'once' && alert.isTriggered) continue;
    // once_per_bar：同日已触发则跳过
    if (alert.triggerMode === 'once_per_bar' && alert.lastTriggerBar === todayBar) continue;

    lastCheckStats.rulesScanned++;
    try {
      const stock = await db.getStockBySymbol(alert.symbol);
      if (!stock) { lastCheckStats.quotesMissing++; continue; }

      const quote = await db.getLatestDailyQuote(stock.id);
      if (!quote) { lastCheckStats.quotesMissing++; continue; }
      lastCheckStats.quotesResolved++;

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
            // 诚实红线（P0-HONESTY2）：均量取不到（null）或真实为 0 时，
            // 「倍数」这个业务量**无法计算**。旧实现把取不到当成 0，于是
            // actualValue 退化成 quote.volume（成交量绝对值），再拿它去和
            // 以「倍」为单位的阈值比——只要有成交量就必然误触发。
            // 现在按「不可评估」处理：不触发，且不写入伪造的 actualValue。
            if (avgVolume === null || avgVolume <= 0) {
              // 均量不可得（含真实为 0 的除零）→ 倍数无从计算，记为「不可评估」
              lastCheckStats.unevaluable++;
              isTriggered = false;
              break;
            }
            actualValue = quote.volume / avgVolume;
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
 *
 * 诚实红线（P0-HONESTY2）：**0 是合法真实值**（某天确实可能零成交），
 * 因此绝不能用 0 表达「拿不到均量」——那会让调用方无法区分
 * 「均量真的是 0」与「没取到均量」。
 *
 * 返回 `number | null`：
 *   - number：真实算出的均量（**允许为 0**，即该窗口确实零成交）
 *   - null  ：取不到（查询失败 / 窗口内无任何行情记录）
 *
 * 注意：均量为 0 时同样**无法评估倍数**（除零），调用方须一并按
 * 「不可评估」处理，不可退化成拿原始成交量去比倍数阈值。
 */
async function getAverageVolume(stockId: number, days: number = 20): Promise<number | null> {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const quotes = await db.getDailyQuotes(stockId, startDate);
    // 「窗口内无任何行情记录」= 取不到，而非均量为 0
    if (!quotes || quotes.length === 0) return null;
    const total = quotes.reduce((sum: number, q: DailyQuote) => sum + (q.volume || 0), 0);
    return total / quotes.length;
  } catch (e) {
    // 「查询失败」= 取不到，而非均量为 0
    console.warn('[Alerts] 计算平均成交量失败:', e);
    return null;
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
