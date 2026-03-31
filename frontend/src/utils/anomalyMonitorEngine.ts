/**
 * 异动监控引擎 (Stock Anomaly Monitor Engine)
 * - 涨跌停监控
 * - 放量异动检测
 * - 盘中急拉急跌
 * - 尾盘异动
 * - 大宗交易异动
 * - 龙虎榜追踪
 */

export interface StockSnapshot {
  code: string;
  name: string;
  price: number;
  preClose: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  avgVolume20: number;
  amount: number;
  time: string; // HH:MM
  turnover: number;
  buy1: number;
  sell1: number;
  pe: number;
  pb: number;
}

export interface AnomalyAlert {
  code: string;
  name: string;
  type: 'limit_up' | 'limit_down' | 'volume_surge' | 'price_spike' | 'price_crash'
    | 'tail_move' | 'block_trade' | 'auction_anomaly' | 'spread_widening';
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  time: string;
  data: Record<string, number>;
}

export interface VolumeSurgeResult {
  code: string;
  volumeRatio: number;
  amountRatio: number;
  isAbnormal: boolean;
  type: 'up_surge' | 'down_surge' | 'neutral_surge';
}

export interface PriceMovement {
  code: string;
  type: 'spike' | 'crash' | 'flash_crash';
  priceChange: number;
  timeWindow: string;
  recoverySpeed: number; // 0-1
}

export interface TailMovement {
  code: string;
  direction: 'up' | 'down';
  magnitude: number;
  last30MinChange: number;
  volumeRatio: number;
}

/**
 * 检测涨跌停
 */
export function detectLimitMove(stock: StockSnapshot): AnomalyAlert | null {
  const limitPct = stock.code.startsWith('3') ? 20 : 10; // 创业板20%，主板10%
  const changePct = (stock.price - stock.preClose) / stock.preClose * 100;

  if (Math.abs(changePct) >= limitPct - 0.1) {
    const isUp = changePct > 0;
    return {
      code: stock.code,
      name: stock.name,
      type: isUp ? 'limit_up' : 'limit_down',
      severity: 'critical',
      description: `${stock.name}${isUp ? '涨停' : '跌停'}${Math.abs(changePct).toFixed(1)}%`,
      time: stock.time,
      data: { changePct, price: stock.price, volume: stock.volume },
    };
  }
  return null;
}

/**
 * 检测放量异动
 */
export function detectVolumeSurge(stock: StockSnapshot): VolumeSurgeResult {
  const volumeRatio = stock.avgVolume20 > 0 ? stock.volume / stock.avgVolume20 : 0;
  const changePct = (stock.price - stock.preClose) / stock.preClose * 100;

  let type: VolumeSurgeResult['type'];
  if (changePct > 2) type = 'up_surge';
  else if (changePct < -2) type = 'down_surge';
  else type = 'neutral_surge';

  return {
    code: stock.code,
    volumeRatio: Math.round(volumeRatio * 100) / 100,
    amountRatio: Math.round(volumeRatio * 100) / 100,
    isAbnormal: volumeRatio > 3,
    type,
  };
}

/**
 * 检测盘中急拉急跌
 */
export function detectPriceMovement(
  stock: StockSnapshot,
  previousPrice: number,
  timeWindowMinutes: number = 5
): PriceMovement | null {
  const changePct = (stock.price - previousPrice) / previousPrice * 100;

  if (changePct > 3) {
    return {
      code: stock.code,
      type: 'spike',
      priceChange: changePct,
      timeWindow: `${timeWindowMinutes}分钟`,
      recoverySpeed: 0, // 需要后续数据计算
    };
  }

  if (changePct < -3) {
    return {
      code: stock.code,
      type: stock.price < stock.low * 1.01 ? 'flash_crash' : 'crash',
      priceChange: changePct,
      timeWindow: `${timeWindowMinutes}分钟`,
      recoverySpeed: 0,
    };
  }

  return null;
}

/**
 * 检测尾盘异动
 */
export function detectTailMovement(
  stock: StockSnapshot,
  last30MinPrice: number,
  last30MinVolume: number
): TailMovement | null {
  const isNearClose = stock.time >= '14:30';
  if (!isNearClose) return null;

  const last30MinChange = (stock.price - last30MinPrice) / last30MinPrice * 100;
  const avgHalfHourVolume = stock.avgVolume20 / 8; // 假设一天8个30分钟
  const volumeRatio = avgHalfHourVolume > 0 ? last30MinVolume / avgHalfHourVolume : 0;

  if (Math.abs(last30MinChange) > 1.5 || volumeRatio > 2) {
    return {
      code: stock.code,
      direction: last30MinChange > 0 ? 'up' : 'down',
      magnitude: Math.abs(last30MinChange),
      last30MinChange,
      volumeRatio: Math.round(volumeRatio * 100) / 100,
    };
  }
  return null;
}

/**
 * 综合异动扫描
 */
export function scanAnomalies(
  stocks: StockSnapshot[],
  previousPrices?: Map<string, number>
): AnomalyAlert[] {
  const alerts: AnomalyAlert[] = [];

  for (const stock of stocks) {
    // 涨跌停
    const limitAlert = detectLimitMove(stock);
    if (limitAlert) alerts.push(limitAlert);

    // 放量异动
    const volumeResult = detectVolumeSurge(stock);
    if (volumeResult.isAbnormal) {
      alerts.push({
        code: stock.code,
        name: stock.name,
        type: 'volume_surge',
        severity: volumeResult.volumeRatio > 5 ? 'high' : 'medium',
        description: `${stock.name}放量${volumeResult.volumeRatio}倍，${volumeResult.type === 'up_surge' ? '放量上涨' : volumeResult.type === 'down_surge' ? '放量下跌' : '放量震荡'}`,
        time: stock.time,
        data: { volumeRatio: volumeResult.volumeRatio },
      });
    }

    // 盘中急拉急跌
    if (previousPrices?.has(stock.code)) {
      const prevPrice = previousPrices.get(stock.code)!;
      const movement = detectPriceMovement(stock, prevPrice);
      if (movement) {
        alerts.push({
          code: stock.code,
          name: stock.name,
          type: movement.type === 'spike' ? 'price_spike' : 'price_crash',
          severity: Math.abs(movement.priceChange) > 5 ? 'high' : 'medium',
          description: `${stock.name}${movement.timeWindow}内${movement.type === 'spike' ? '急拉' : '急跌'}${Math.abs(movement.priceChange).toFixed(1)}%`,
          time: stock.time,
          data: { priceChange: movement.priceChange },
        });
      }
    }

    // 买卖价差异常
    if (stock.buy1 > 0 && stock.sell1 > 0) {
      const spread = (stock.sell1 - stock.buy1) / stock.price * 100;
      if (spread > 1) {
        alerts.push({
          code: stock.code,
          name: stock.name,
          type: 'spread_widening',
          severity: 'low',
          description: `${stock.name}买卖价差${spread.toFixed(2)}%`,
          time: stock.time,
          data: { spread },
        });
      }
    }
  }

  // 按严重性排序
  const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  return alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
}

/**
 * 异动统计汇总
 */
export function summarizeAnomalies(alerts: AnomalyAlert[]): {
  total: number;
  byType: Record<string, number>;
  bySeverity: Record<string, number>;
  criticalList: AnomalyAlert[];
} {
  const byType: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};

  for (const alert of alerts) {
    byType[alert.type] = (byType[alert.type] || 0) + 1;
    bySeverity[alert.severity] = (bySeverity[alert.severity] || 0) + 1;
  }

  return {
    total: alerts.length,
    byType,
    bySeverity,
    criticalList: alerts.filter(a => a.severity === 'critical' || a.severity === 'high'),
  };
}
