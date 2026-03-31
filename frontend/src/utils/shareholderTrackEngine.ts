/**
 * 大股东增减持跟踪引擎
 * - 增持/减持事件检测
 * - 累计增减持金额统计
 * - 增减持比例分析
 * - 机构行为模式
 * - 信号生成
 */
export interface ShareholderChange {
  stockCode: string;
  stockName: string;
  shareholderName: string;
  changeType: 'increase' | 'decrease';
  changeShares: number;
  changeRatio: number; // 占总股本比例
  prevHolding: number;
  currHolding: number;
  avgPrice: number;
  totalAmount: number;
  date: string;
}

export interface ShareholderBehavior {
  name: string;
  totalIncrease: number;
  totalDecrease: number;
  netChange: number;
  eventCount: number;
  avgChangeRatio: number;
  pattern: 'active_buyer' | 'active_seller' | 'swing_trader' | 'passive';
}

export interface ShareholderAnalysis {
  events: ShareholderChange[];
  behaviors: ShareholderBehavior[];
  totalNetChange: number;
  marketSentiment: 'bullish' | 'bearish' | 'neutral';
  significantEvents: ShareholderChange[];
  alerts: string[];
}

export function analyzeShareholderChanges(
  events: ShareholderChange[]
): ShareholderAnalysis {
  const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date));
  
  // 行为分析
  const behaviorMap = new Map<string, ShareholderBehavior>();
  for (const e of sorted) {
    let b = behaviorMap.get(e.shareholderName);
    if (!b) {
      b = { name: e.shareholderName, totalIncrease: 0, totalDecrease: 0, netChange: 0, eventCount: 0, avgChangeRatio: 0, pattern: 'passive' };
      behaviorMap.set(e.shareholderName, b);
    }
    b.eventCount++;
    b.avgChangeRatio = (b.avgChangeRatio * (b.eventCount - 1) + e.changeRatio) / b.eventCount;
    if (e.changeType === 'increase') {
      b.totalIncrease += e.totalAmount;
    } else {
      b.totalDecrease += e.totalAmount;
    }
    b.netChange = b.totalIncrease - b.totalDecrease;
    
    if (b.eventCount >= 3) {
      const increaseEvents = sorted.filter(s => s.shareholderName === e.shareholderName && s.changeType === 'increase').length;
      const ratio = increaseEvents / b.eventCount;
      b.pattern = ratio > 0.7 ? 'active_buyer' : ratio < 0.3 ? 'active_seller' : 'swing_trader';
    }
  }

  const behaviors = [...behaviorMap.values()];
  const totalIncrease = sorted.filter(e => e.changeType === 'increase').reduce((s, e) => s + e.totalAmount, 0);
  const totalDecrease = sorted.filter(e => e.changeType === 'decrease').reduce((s, e) => s + e.totalAmount, 0);
  const totalNetChange = totalIncrease - totalDecrease;

  const significantEvents = sorted.filter(e => e.changeRatio > 0.01 || e.totalAmount > 100000000);

  const marketSentiment = totalNetChange > 0 ? 'bullish' : totalNetChange < 0 ? 'bearish' : 'neutral';

  const alerts: string[] = [];
  const largeDecreases = sorted.filter(e => e.changeType === 'decrease' && e.changeRatio > 0.05);
  if (largeDecreases.length > 0) alerts.push(`${largeDecreases.length}笔大额减持`);
  const rapidChanges = sorted.filter(e => e.changeRatio > 0.02);
  if (rapidChanges.length > 3) alerts.push('密集增减持');

  return { events: sorted, behaviors, totalNetChange, marketSentiment, significantEvents, alerts };
}
