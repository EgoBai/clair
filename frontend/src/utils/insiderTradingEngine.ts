/**
 * 内部人交易信号引擎
 * - 内部人买卖行为分析
 * - 异常交易检测
 * - 信号强度评分
 * - 历史准确率追踪
 */

export interface InsiderTrade {
  insider: string;
  role: 'ceo' | 'cfo' | 'director' | 'officer' | 'largeShareholder';
  type: 'buy' | 'sell';
  shares: number;
  price: number;
  date: string; // YYYY-MM-DD
  isDerivative: boolean; // 是否为衍生品交易
}

export interface InsiderSignal {
  direction: 'bullish' | 'bearish' | 'neutral';
  strength: number; // 0-100
  netShares: number;
  buyVolume: number;
  sellVolume: number;
  clusterBuying: boolean; // 是否多人同时买入
  highLevelBuying: boolean; // 高管是否买入
  confidence: number;
  reasoning: string[];
}

export interface InsiderTrend {
  period: string;
  buyCount: number;
  sellCount: number;
  netShares: number;
  avgBuyPrice: number;
  avgSellPrice: number;
  signal: 'bullish' | 'bearish' | 'neutral';
}

export class InsiderTradingEngine {
  /**
   * 分析内部人交易信号
   */
  analyzeSignal(trades: InsiderTrade[], lookbackDays: number = 90): InsiderSignal {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - lookbackDays);

    const recent = trades.filter(t => new Date(t.date) >= cutoff);

    const buys = recent.filter(t => t.type === 'buy' && !t.isDerivative);
    const sells = recent.filter(t => t.type === 'sell' && !t.isDerivative);

    const buyVolume = buys.reduce((s, t) => s + t.shares, 0);
    const sellVolume = sells.reduce((s, t) => s + t.shares, 0);
    const netShares = buyVolume - sellVolume;

    const reasoning: string[] = [];

    // 集群买入检测
    const uniqueBuyers = new Set(buys.map(b => b.insider));
    const clusterBuying = uniqueBuyers.size >= 2 && buys.length >= 3;
    if (clusterBuying) reasoning.push('多人集群买入');

    // 高管买入
    const highLevelRoles = new Set(['ceo', 'cfo']);
    const highLevelBuying = buys.some(b => highLevelRoles.has(b.role));
    if (highLevelBuying) reasoning.push('高管(C级)买入');

    // 计算强度
    let strength = 50;
    if (netShares > 0) {
      strength += Math.min(30, (buys.length - sells.length) * 10);
      if (clusterBuying) strength += 15;
      if (highLevelBuying) strength += 10;
      reasoning.push(`净买入${netShares}股`);
    } else if (netShares < 0) {
      strength -= Math.min(30, (sells.length - buys.length) * 10);
      reasoning.push(`净卖出${Math.abs(netShares)}股`);
    }

    strength = Math.max(0, Math.min(100, strength));

    let direction: 'bullish' | 'bearish' | 'neutral';
    if (strength > 65) direction = 'bullish';
    else if (strength < 35) direction = 'bearish';
    else direction = 'neutral';

    if (recent.length === 0) reasoning.push('近期无内部人交易');

    const confidence = Math.min(1, 0.2 + recent.length * 0.15);

    return {
      direction,
      strength: Math.round(strength),
      netShares,
      buyVolume,
      sellVolume,
      clusterBuying,
      highLevelBuying,
      confidence: Math.round(confidence * 100) / 100,
      reasoning,
    };
  }

  /**
   * 按季度统计趋势
   */
  quarterlyTrend(trades: InsiderTrade[]): InsiderTrend[] {
    const quarters: Record<string, { buys: InsiderTrade[]; sells: InsiderTrade[] }> = {};

    for (const t of trades) {
      const d = new Date(t.date);
      const q = `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`;
      if (!quarters[q]) quarters[q] = { buys: [], sells: [] };
      if (t.type === 'buy') quarters[q].buys.push(t);
      else quarters[q].sells.push(t);
    }

    return Object.entries(quarters).sort(([a], [b]) => a.localeCompare(b)).map(([period, data]) => {
      const buyShares = data.buys.reduce((s, t) => s + t.shares, 0);
      const sellShares = data.sells.reduce((s, t) => s + t.shares, 0);
      const netShares = buyShares - sellShares;

      const avgBuyPrice = data.buys.length > 0 ? data.buys.reduce((s, t) => s + t.price, 0) / data.buys.length : 0;
      const avgSellPrice = data.sells.length > 0 ? data.sells.reduce((s, t) => s + t.price, 0) / data.sells.length : 0;

      let signal: 'bullish' | 'bearish' | 'neutral';
      if (netShares > 0 && data.buys.length > data.sells.length) signal = 'bullish';
      else if (netShares < 0 && data.sells.length > data.buys.length) signal = 'bearish';
      else signal = 'neutral';

      return {
        period,
        buyCount: data.buys.length,
        sellCount: data.sells.length,
        netShares,
        avgBuyPrice: Math.round(avgBuyPrice * 100) / 100,
        avgSellPrice: Math.round(avgSellPrice * 100) / 100,
        signal,
      };
    });
  }

  /**
   * 检测异常交易
   */
  detectAnomalies(trades: InsiderTrade[]): Array<{ trade: InsiderTrade; reason: string; severity: 'low' | 'medium' | 'high' }> {
    if (trades.length < 3) return [];

    const anomalies: Array<{ trade: InsiderTrade; reason: string; severity: 'low' | 'medium' | 'high' }> = [];

    const avgShares = trades.reduce((s, t) => s + t.shares, 0) / trades.length;
    const sortedByDate = [...trades].sort((a, b) => a.date.localeCompare(b.date));

    for (const t of trades) {
      // 超大交易
      if (t.shares > avgShares * 5) {
        anomalies.push({ trade: t, reason: '交易量异常大(超均值5倍)', severity: 'high' });
      }

      // 期末集中交易
      const d = new Date(t.date);
      const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      const daysToEnd = (monthEnd.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
      if (daysToEnd <= 3) {
        anomalies.push({ trade: t, reason: '月末集中交易', severity: 'medium' });
      }
    }

    // 密集交易
    for (let i = 1; i < sortedByDate.length; i++) {
      const diff = new Date(sortedByDate[i].date).getTime() - new Date(sortedByDate[i - 1].date).getTime();
      if (diff < 7 * 24 * 60 * 60 * 1000) { // 一周内
        anomalies.push({ trade: sortedByDate[i], reason: '密集交易(一周内多次)', severity: 'medium' });
      }
    }

    return anomalies;
  }
}

export default new InsiderTradingEngine();
