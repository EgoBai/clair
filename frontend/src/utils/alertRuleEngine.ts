/**
 * 监控告警规则引擎
 * 自定义规则/条件组合/告警级别/频率控制/通知渠道
 */

export type AlertOperator = 'gt' | 'lt' | 'gte' | 'lte' | 'eq' | 'neq' | 'cross_above' | 'cross_below' | 'change_pct';

export interface AlertRule {
  id: string;
  name: string;
  stockCode: string;
  field: string;            // price, volume, turnover, rsi, macd...
  operator: AlertOperator;
  threshold: number;
  secondaryThreshold?: number;
  level: 'info' | 'warning' | 'critical';
  cooldownMinutes: number;
  enabled: boolean;
  notificationChannels: ('push' | 'email' | 'sms')[];
  description: string;
}

export interface AlertTrigger {
  ruleId: string;
  ruleName: string;
  stockCode: string;
  triggeredAt: string;
  currentValue: number;
  threshold: number;
  level: 'info' | 'warning' | 'critical';
  message: string;
  acknowledged: boolean;
}

export interface AlertStats {
  totalRules: number;
  activeRules: number;
  totalTriggersToday: number;
  triggersByLevel: { info: number; warning: number; critical: number };
  topTriggeredRules: { ruleId: string; name: string; count: number }[];
  recentTriggers: AlertTrigger[];
}

// ── 条件评估 ──

export function evaluateCondition(
  currentValue: number,
  previousValue: number | undefined,
  operator: AlertOperator,
  threshold: number,
  secondaryThreshold?: number
): boolean {
  switch (operator) {
    case 'gt': return currentValue > threshold;
    case 'lt': return currentValue < threshold;
    case 'gte': return currentValue >= threshold;
    case 'lte': return currentValue <= threshold;
    case 'eq': return Math.abs(currentValue - threshold) < 0.0001;
    case 'neq': return Math.abs(currentValue - threshold) >= 0.0001;
    case 'cross_above': return previousValue !== undefined && previousValue <= threshold && currentValue > threshold;
    case 'cross_below': return previousValue !== undefined && previousValue >= threshold && currentValue < threshold;
    case 'change_pct': {
      if (previousValue === undefined || previousValue === 0) return false;
      const changePct = (currentValue - previousValue) / previousValue * 100;
      return secondaryThreshold !== undefined
        ? changePct >= threshold || changePct <= secondaryThreshold
        : Math.abs(changePct) >= threshold;
    }
    default: return false;
  }
}

// ── 规则评估 ──

export function evaluateRule(
  rule: AlertRule,
  data: Record<string, number>,
  previousData?: Record<string, number>
): AlertTrigger | null {
  if (!rule.enabled) return null;

  const currentValue = data[rule.field];
  const previousValue = previousData?.[rule.field];

  if (currentValue === undefined) return null;

  const triggered = evaluateCondition(currentValue, previousValue, rule.operator, rule.threshold, rule.secondaryThreshold);

  if (!triggered) return null;

  return {
    ruleId: rule.id,
    ruleName: rule.name,
    stockCode: rule.stockCode,
    triggeredAt: new Date().toISOString(),
    currentValue,
    threshold: rule.threshold,
    level: rule.level,
    message: generateMessage(rule, currentValue),
    acknowledged: false,
  };
}

// ── 批量评估 ──

export function evaluateRules(
  rules: AlertRule[],
  stockData: Map<string, Record<string, number>>,
  previousData?: Map<string, Record<string, number>>,
  lastTriggerTimes?: Map<string, number>
): AlertTrigger[] {
  const triggers: AlertTrigger[] = [];
  const now = Date.now();

  for (const rule of rules) {
    const data = stockData.get(rule.stockCode);
    if (!data) continue;

    // 冷却检查
    if (lastTriggerTimes) {
      const lastTime = lastTriggerTimes.get(rule.id) || 0;
      if (now - lastTime < rule.cooldownMinutes * 60 * 1000) continue;
    }

    const prevData = previousData?.get(rule.stockCode);
    const trigger = evaluateRule(rule, data, prevData);
    if (trigger) {
      triggers.push(trigger);
      if (lastTriggerTimes) lastTriggerTimes.set(rule.id, now);
    }
  }

  return triggers.sort((a, b) => {
    const levelOrder = { critical: 0, warning: 1, info: 2 };
    return levelOrder[a.level] - levelOrder[b.level];
  });
}

// ── 常用规则模板 ──

export function createPriceAlertTemplate(stockCode: string, price: number, direction: 'up' | 'down', pct: number): AlertRule {
  const threshold = direction === 'up' ? price * (1 + pct / 100) : price * (1 - pct / 100);
  return {
    id: `price_${stockCode}_${Date.now()}`,
    name: `${stockCode} 价格${direction === 'up' ? '涨' : '跌'}破${pct}%`,
    stockCode,
    field: 'price',
    operator: direction === 'up' ? 'gte' : 'lte',
    threshold,
    level: Math.abs(pct) > 5 ? 'critical' : 'warning',
    cooldownMinutes: 30,
    enabled: true,
    notificationChannels: ['push'],
    description: `${stockCode}价格${direction === 'up' ? '上涨' : '下跌'}超过${pct}%时触发`,
  };
}

export function createVolumeAlertTemplate(stockCode: string, avgVolume: number, multiple: number): AlertRule {
  return {
    id: `volume_${stockCode}_${Date.now()}`,
    name: `${stockCode} 放量${multiple}倍`,
    stockCode,
    field: 'volume',
    operator: 'gte',
    threshold: avgVolume * multiple,
    level: multiple >= 3 ? 'critical' : multiple >= 2 ? 'warning' : 'info',
    cooldownMinutes: 60,
    enabled: true,
    notificationChannels: ['push'],
    description: `${stockCode}成交量超过${multiple}倍均量时触发`,
  };
}

export function createIndicatorAlertTemplate(
  stockCode: string, indicator: string, operator: AlertOperator, threshold: number
): AlertRule {
  return {
    id: `${indicator}_${stockCode}_${Date.now()}`,
    name: `${stockCode} ${indicator}${operator === 'gt' ? '>' : operator === 'lt' ? '<' : '穿越'}${threshold}`,
    stockCode,
    field: indicator,
    operator,
    threshold,
    level: 'warning',
    cooldownMinutes: 15,
    enabled: true,
    notificationChannels: ['push'],
    description: `${stockCode}的${indicator}指标满足条件时触发`,
  };
}

// ── 统计 ──

export function calculateAlertStats(rules: AlertRule[], triggers: AlertTrigger[]): AlertStats {
  const today = new Date().toISOString().split('T')[0];
  const todayTriggers = triggers.filter(t => t.triggeredAt.startsWith(today));

  const triggerCounts = new Map<string, number>();
  for (const t of triggers) {
    triggerCounts.set(t.ruleId, (triggerCounts.get(t.ruleId) || 0) + 1);
  }

  const topTriggered = [...triggerCounts.entries()]
    .map(([ruleId, count]) => {
      const rule = rules.find(r => r.id === ruleId);
      return { ruleId, name: rule?.name || ruleId, count };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    totalRules: rules.length,
    activeRules: rules.filter(r => r.enabled).length,
    totalTriggersToday: todayTriggers.length,
    triggersByLevel: {
      info: todayTriggers.filter(t => t.level === 'info').length,
      warning: todayTriggers.filter(t => t.level === 'warning').length,
      critical: todayTriggers.filter(t => t.level === 'critical').length,
    },
    topTriggeredRules: topTriggered,
    recentTriggers: triggers.slice(-20),
  };
}

function generateMessage(rule: AlertRule, currentValue: number): string {
  const formatted = typeof currentValue === 'number' ? currentValue.toFixed(2) : currentValue;
  switch (rule.operator) {
    case 'gt': case 'gte': return `${rule.name}: 当前值${formatted} ≥ 阈值${rule.threshold}`;
    case 'lt': case 'lte': return `${rule.name}: 当前值${formatted} ≤ 阈值${rule.threshold}`;
    case 'cross_above': return `${rule.name}: 向上突破${rule.threshold}，当前${formatted}`;
    case 'cross_below': return `${rule.name}: 向下跌破${rule.threshold}，当前${formatted}`;
    case 'change_pct': return `${rule.name}: 变动幅度${formatted}%`;
    default: return `${rule.name}: 条件满足，当前值${formatted}`;
  }
}
