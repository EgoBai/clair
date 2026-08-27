/**
 * 暗池分析引擎 - 大宗交易/暗池成交量/机构交易追踪
 */

export interface DarkPoolTrade {
  ticker: string;
  date: string;
  volume: number;
  value: number;
  price: number;
  vwap: number;
  discount: number; // 折价率(%)
  buyerType: 'institution' | 'hedge_fund' | 'pension' | 'sovereign' | 'unknown';
  sellerType: 'institution' | 'hedge_fund' | 'pension' | 'sovereign' | 'unknown';
}

export interface DarkPoolAnalysis {
  ticker: string;
  period: string;
  totalVolume: number;
  totalValue: number;
  avgDiscount: number;
  participationRate: number; // 暗池参与率(%)
  institutionalActivity: {
    buying: number;
    selling: number;
    netFlow: number;
    dominantSide: 'buy' | 'sell' | 'balanced';
  };
  priceImpact: {
    preTrade: number;
    postTrade1d: number;
    postTrade5d: number;
    postTrade20d: number;
  };
  signal: 'accumulation' | 'distribution' | 'neutral';
  confidence: number;
}

export interface BlockTradeAlert {
  ticker: string;
  date: string;
  volume: number;
  value: number;
  premium: number; // 溢价/折价
  significance: 'high' | 'medium' | 'low';
  implication: string;
}

export interface VWAPAnalysis {
  ticker: string;
  date: string;
  vwap: number;
  close: number;
  deviation: number; // 偏离度(%)
  participationPct: number;
  signal: 'buy_below' | 'sell_above' | 'neutral';
}

/**
 * 分析暗池交易
 */
export function analyzeDarkPool(trades: DarkPoolTrade[]): DarkPoolAnalysis {
  const ticker = trades[0]?.ticker || '';

  if (trades.length === 0) {
    return {
      ticker, period: '', totalVolume: 0, totalValue: 0, avgDiscount: 0,
      participationRate: 0,
      institutionalActivity: { buying: 0, selling: 0, netFlow: 0, dominantSide: 'balanced' },
      priceImpact: { preTrade: 0, postTrade1d: 0, postTrade5d: 0, postTrade20d: 0 },
      signal: 'neutral', confidence: 0,
    };
  }

  const totalVolume = trades.reduce((s, t) => s + t.volume, 0);
  const totalValue = trades.reduce((s, t) => s + t.value, 0);
  const avgDiscount = trades.reduce((s, t) => s + t.discount, 0) / trades.length;

  // 参与率 (假设总交易量的一定比例)
  const participationRate = Math.min(30, totalVolume / 1e6 * 0.5);

  // 机构活动
  const instTrades = trades.filter(t =>
    ['institution', 'pension', 'sovereign'].includes(t.buyerType) ||
    ['institution', 'pension', 'sovereign'].includes(t.sellerType));

  const buying = instTrades.filter(t => ['institution', 'pension', 'sovereign'].includes(t.buyerType))
    .reduce((s, t) => s + t.value, 0);
  const selling = instTrades.filter(t => ['institution', 'pension', 'sovereign'].includes(t.sellerType))
    .reduce((s, t) => s + t.value, 0);
  const netFlow = buying - selling;

  let dominantSide: DarkPoolAnalysis['institutionalActivity']['dominantSide'];
  if (netFlow > totalValue * 0.1) dominantSide = 'buy';
  else if (netFlow < -totalValue * 0.1) dominantSide = 'sell';
  else dominantSide = 'balanced';

  // 价格影响 (简化)
  const priceImpact = {
    preTrade: trades.length > 1 ? (trades[0].price / trades[trades.length - 1].price - 1) * 100 : 0,
    postTrade1d: avgDiscount < 0 ? 0.5 : -0.3,
    postTrade5d: avgDiscount < 0 ? 1.2 : -0.8,
    postTrade20d: avgDiscount < 0 ? 2.0 : -1.5,
  };

  // 信号
  let signal: DarkPoolAnalysis['signal'];
  const buyPressure = buying / (buying + selling || 1);
  if (buyPressure > 0.6 && avgDiscount < -0.5) signal = 'accumulation';
  else if (buyPressure < 0.4 && avgDiscount > 0.5) signal = 'distribution';
  else signal = 'neutral';

  const confidence = Math.min(1, trades.length / 20 * 0.5 + Math.abs(buyPressure - 0.5) * 2);

  const dates = trades.map(t => t.date).sort();
  const period = dates.length >= 2
    ? `${dates[0]} ~ ${dates[dates.length - 1]}`
    : dates[0] || '';

  return {
    ticker,
    period,
    totalVolume: Math.round(totalVolume),
    totalValue: Math.round(totalValue),
    avgDiscount: Math.round(avgDiscount * 100) / 100,
    participationRate: Math.round(participationRate * 100) / 100,
    institutionalActivity: {
      buying: Math.round(buying),
      selling: Math.round(selling),
      netFlow: Math.round(netFlow),
      dominantSide,
    },
    priceImpact,
    signal,
    confidence: Math.round(confidence * 100) / 100,
  };
}

/**
 * 大宗交易预警
 */
export function detectBlockTradeAlerts(
  trades: DarkPoolTrade[],
  valueThreshold: number = 1e8,
  premiumThreshold: number = 2,
): BlockTradeAlert[] {
  return trades
    .filter(t => t.value >= valueThreshold || Math.abs(t.discount) >= premiumThreshold)
    .map(t => {
      let significance: BlockTradeAlert['significance'];
      if (t.value >= valueThreshold * 5) significance = 'high';
      else if (t.value >= valueThreshold * 2) significance = 'medium';
      else significance = 'low';

      let implication = '';
      if (t.discount < -premiumThreshold) implication = '大幅折价成交，可能有利空预期';
      else if (t.discount > premiumThreshold) implication = '溢价成交，买方积极';
      else if (t.value >= valueThreshold * 5) implication = '超大额交易，关注后续走势';
      else implication = '大宗交易，关注机构动向';

      return {
        ticker: t.ticker,
        date: t.date,
        volume: t.volume,
        value: Math.round(t.value),
        premium: Math.round(t.discount * 100) / 100,
        significance,
        implication,
      };
    })
    .sort((a, b) => b.value - a.value);
}

/**
 * VWAP分析
 */
export function analyzeVWAP(
  ticker: string,
  date: string,
  trades: Array<{ price: number; volume: number }>,
  close: number,
): VWAPAnalysis {
  const totalValue = trades.reduce((s, t) => s + t.price * t.volume, 0);
  const totalVolume = trades.reduce((s, t) => s + t.volume, 0);
  const vwap = totalVolume > 0 ? totalValue / totalVolume : close;

  const deviation = ((close - vwap) / vwap) * 100;
  const participationPct = 100; // 假设全部参与

  let signal: VWAPAnalysis['signal'];
  if (close < vwap - 0.2) signal = 'buy_below';
  else if (close > vwap + 0.2) signal = 'sell_above';
  else signal = 'neutral';

  return {
    ticker,
    date,
    vwap: Math.round(vwap * 100) / 100,
    close,
    deviation: Math.round(deviation * 100) / 100,
    participationPct,
    signal,
  };
}
