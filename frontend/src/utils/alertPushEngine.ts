/**
 * 消息推送引擎
 * 价格预警/涨跌停提醒/大单异动/指标触发/多渠道推送
 */

export interface Alert {
  id: string;
  ticker: string;
  type: 'price' | 'change' | 'volume' | 'indicator' | 'news' | 'earnings' | 'pledge';
  condition: AlertCondition;
  status: 'active' | 'triggered' | 'expired' | 'disabled';
  createdAt: string;
  triggeredAt?: string;
  expiresAt?: string;
  message?: string;
  channels: PushChannel[];
  priority: 'low' | 'medium' | 'high' | 'critical';
  repeatable: boolean;
  cooldown: number; // 重复触发间隔(秒)
}

export interface AlertCondition {
  field: string;
  operator: 'gt' | 'lt' | 'gte' | 'lte' | 'eq' | 'cross_above' | 'cross_below';
  value: number;
  secondaryValue?: number; // 用于between类型
}

export type PushChannel = 'websocket' | 'push_notification' | 'email' | 'sms' | 'webhook';

export interface AlertEvent {
  alertId: string;
  ticker: string;
  type: Alert['type'];
  message: string;
  timestamp: string;
  data: Record<string, unknown>;
  delivered: PushChannel[];
  failed: PushChannel[];
}

export interface AlertEngineState {
  alerts: Map<string, Alert>;
  triggered: AlertEvent[];
  lastCheck: number;
  stats: {
    total: number;
    active: number;
    triggered: number;
    expired: number;
  };
}

export interface PriceData {
  ticker: string;
  price: number;
  prevClose: number;
  change: number;
  changePercent: number;
  volume: number;
  high: number;
  low: number;
  limitUp: number;
  limitDown: number;
}

/**
 * 检查条件是否满足
 */
export function checkCondition(
  condition: AlertCondition,
  currentValue: number,
  prevValue?: number
): boolean {
  switch (condition.operator) {
    case 'gt':
      return currentValue > condition.value;
    case 'lt':
      return currentValue < condition.value;
    case 'gte':
      return currentValue >= condition.value;
    case 'lte':
      return currentValue <= condition.value;
    case 'eq':
      return Math.abs(currentValue - condition.value) < 0.001;
    case 'cross_above':
      return prevValue !== undefined &&
        prevValue <= condition.value &&
        currentValue > condition.value;
    case 'cross_below':
      return prevValue !== undefined &&
        prevValue >= condition.value &&
        currentValue < condition.value;
    default:
      return false;
  }
}

/**
 * 处理价格数据，触发预警
 */
export function processAlerts(
  alerts: Alert[],
  priceData: PriceData,
  prevPriceData?: PriceData
): AlertEvent[] {
  const events: AlertEvent[] = [];
  const now = new Date().toISOString();

  for (const alert of alerts) {
    if (alert.status !== 'active') continue;
    if (alert.expiresAt && new Date(alert.expiresAt) < new Date(now)) continue;

    // 冷却检查
    if (alert.triggeredAt && alert.cooldown > 0) {
      const elapsed = (new Date(now).getTime() - new Date(alert.triggeredAt).getTime()) / 1000;
      if (elapsed < alert.cooldown) continue;
    }

    let triggered = false;
    let message = '';
    let data: Record<string, unknown> = {};

    switch (alert.type) {
      case 'price': {
        const prev = prevPriceData?.price;
        triggered = checkCondition(alert.condition, priceData.price, prev);
        if (triggered) {
          message = `${priceData.ticker} 价格 ${alert.condition.operator === 'gt' ? '突破' : '跌破'} ${alert.condition.value}，当前 ${priceData.price}`;
          data = { price: priceData.price, target: alert.condition.value };
        }
        break;
      }
      case 'change': {
        triggered = checkCondition(alert.condition, priceData.changePercent);
        if (triggered) {
          message = `${priceData.ticker} 涨跌幅 ${priceData.changePercent.toFixed(2)}%`;
          data = { changePercent: priceData.changePercent };
        }
        break;
      }
      case 'volume': {
        triggered = checkCondition(alert.condition, priceData.volume);
        if (triggered) {
          message = `${priceData.ticker} 成交量异常 ${(priceData.volume / 1e8).toFixed(2)}亿`;
          data = { volume: priceData.volume };
        }
        break;
      }
      case 'indicator': {
        // 通用指标检查
        const fieldVal = (priceData as Record<string, unknown>)[alert.condition.field] as number;
        if (fieldVal !== undefined) {
          triggered = checkCondition(alert.condition, fieldVal);
          if (triggered) {
            message = `${priceData.ticker} ${alert.condition.field} 触发条件`;
            data = { [alert.condition.field]: fieldVal };
          }
        }
        break;
      }
    }

    if (triggered) {
      events.push({
        alertId: alert.id,
        ticker: alert.ticker,
        type: alert.type,
        message: alert.message ?? message,
        timestamp: now,
        data,
        delivered: [],
        failed: [],
      });
    }
  }

  return events;
}

/**
 * 生成预警摘要
 */
export function generateAlertSummary(
  events: AlertEvent[],
  timeWindow: number = 3600000 // 1小时
): {
  total: number;
  byType: Record<string, number>;
  byTicker: Record<string, number>;
  byPriority: Record<string, number>;
  recentEvents: AlertEvent[];
} {
  const cutoff = new Date(Date.now() - timeWindow);
  const recent = events.filter(e => new Date(e.timestamp) >= cutoff);

  const byType: Record<string, number> = {};
  const byTicker: Record<string, number> = {};

  recent.forEach(e => {
    byType[e.type] = (byType[e.type] ?? 0) + 1;
    byTicker[e.ticker] = (byTicker[e.ticker] ?? 0) + 1;
  });

  return {
    total: recent.length,
    byType,
    byTicker,
    byPriority: {},
    recentEvents: recent.slice(-20),
  };
}

/**
 * 创建常见预警模板
 */
export function createAlertTemplates(ticker: string): Partial<Alert>[] {
  return [
    {
      ticker,
      type: 'price',
      condition: { field: 'price', operator: 'gt', value: 0 },
      priority: 'medium',
      channels: ['websocket', 'push_notification'],
      repeatable: false,
      cooldown: 60,
    },
    {
      ticker,
      type: 'change',
      condition: { field: 'changePercent', operator: 'gt', value: 5 },
      priority: 'high',
      channels: ['websocket', 'push_notification'],
      repeatable: false,
      cooldown: 300,
    },
    {
      ticker,
      type: 'change',
      condition: { field: 'changePercent', operator: 'lt', value: -5 },
      priority: 'high',
      channels: ['websocket', 'push_notification'],
      repeatable: false,
      cooldown: 300,
    },
    {
      ticker,
      type: 'volume',
      condition: { field: 'volume', operator: 'gt', value: 0 },
      priority: 'low',
      channels: ['websocket'],
      repeatable: true,
      cooldown: 600,
    },
  ];
}

/**
 * 验证预警规则
 */
export function validateAlert(alert: Partial<Alert>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!alert.ticker) errors.push('缺少股票代码');
  if (!alert.type) errors.push('缺少预警类型');
  if (!alert.condition) errors.push('缺少触发条件');
  if (alert.condition) {
    if (alert.condition.field === undefined) errors.push('条件缺少字段');
    if (alert.condition.value === undefined) errors.push('条件缺少值');
    if (!['gt', 'lt', 'gte', 'lte', 'eq', 'cross_above', 'cross_below'].includes(alert.condition.operator)) {
      errors.push('无效的比较操作符');
    }
  }
  if (alert.channels && alert.channels.length === 0) errors.push('至少需要一个推送渠道');
  if (alert.cooldown !== undefined && alert.cooldown < 0) errors.push('冷却时间不能为负数');

  return { valid: errors.length === 0, errors };
}
