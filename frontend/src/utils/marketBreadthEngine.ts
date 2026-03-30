/**
 * 市场宽度分析引擎
 * 涨跌家数、创新高/低、均线之上/之下、市场广度指标
 */

export interface StockSnapshot {
  ticker: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  ma5: number;
  ma20: number;
  ma60: number;
  high52w: number;
  low52w: number;
}

export interface BreadthData {
  advanceCount: number;    // 上涨家数
  declineCount: number;    // 下跌家数
  unchangedCount: number;  // 平盘家数
  newHighCount: number;    // 52周新高
  newLowCount: number;     // 52周新低
  aboveMA20: number;       // 在20日均线之上
  belowMA20: number;       // 在20日均线之下
  aboveMA60: number;       // 在60日均线之上
  belowMA60: number;       // 在60日均线之下
  adLine: number;          // 涨跌线 (累计涨跌差)
  mcclellanOscillator: number; // 麦克莱伦振荡器
}

export interface BreadthSignal {
  type: 'bullish' | 'bearish' | 'neutral' | 'divergence';
  strength: number;
  message: string;
}

/**
 * 市场宽度计算
 */
export function calculateBreadth(stocks: StockSnapshot[]): BreadthData {
  let advanceCount = 0;
  let declineCount = 0;
  let unchangedCount = 0;
  let newHighCount = 0;
  let newLowCount = 0;
  let aboveMA20 = 0;
  let belowMA20 = 0;
  let aboveMA60 = 0;
  let belowMA60 = 0;

  for (const stock of stocks) {
    if (stock.changePercent > 0.01) advanceCount++;
    else if (stock.changePercent < -0.01) declineCount++;
    else unchangedCount++;

    if (stock.price >= stock.high52w * 0.99) newHighCount++;
    if (stock.price <= stock.low52w * 1.01) newLowCount++;

    if (stock.price > stock.ma20) aboveMA20++;
    else belowMA20++;

    if (stock.price > stock.ma60) aboveMA60++;
    else belowMA60++;
  }

  // 涨跌线 = 上涨家数 - 下跌家数
  const adLine = advanceCount - declineCount;

  // 简化麦克莱伦振荡器 (使用涨跌差的EMA差)
  const advances = stocks.filter((s) => s.changePercent > 0).length;
  const declines = stocks.filter((s) => s.changePercent < 0).length;
  const netAdvances = advances - declines;
  const mcclellanOscillator = netAdvances; // 简化版

  return {
    advanceCount,
    declineCount,
    unchangedCount,
    newHighCount,
    newLowCount,
    aboveMA20,
    belowMA20,
    aboveMA60,
    belowMA60,
    adLine,
    mcclellanOscillator,
  };
}

/**
 * 广度指标分析
 */
export function breadthIndicators(data: BreadthData, totalStocks: number): {
  adRatio: number;        // 涨跌比
  adSpread: number;       // 涨跌差
  ma20Breadth: number;    // 20日均线广度 (0-1)
  ma60Breadth: number;    // 60日均线广度 (0-1)
  newHighLowRatio: number; // 新高新低比
  overallBreadth: number; // 综合广度 (0-100)
} {
  const adRatio = data.declineCount > 0 ? data.advanceCount / data.declineCount : data.advanceCount;
  const adSpread = data.advanceCount - data.declineCount;
  const ma20Breadth = totalStocks > 0 ? data.aboveMA20 / totalStocks : 0.5;
  const ma60Breadth = totalStocks > 0 ? data.aboveMA60 / totalStocks : 0.5;
  const newHighLowRatio = data.newLowCount > 0 ? data.newHighCount / data.newLowCount : data.newHighCount > 0 ? 10 : 1;

  // 综合广度
  const advDecScore = totalStocks > 0 ? data.advanceCount / totalStocks : 0.5;
  const overallBreadth = Math.round(
    (advDecScore * 0.4 + ma20Breadth * 0.25 + ma60Breadth * 0.25 +
      Math.min(1, newHighLowRatio / 3) * 0.1) * 100
  );

  return {
    adRatio: Math.round(adRatio * 100) / 100,
    adSpread,
    ma20Breadth: Math.round(ma20Breadth * 10000) / 10000,
    ma60Breadth: Math.round(ma60Breadth * 10000) / 10000,
    newHighLowRatio: Math.round(newHighLowRatio * 100) / 100,
    overallBreadth,
  };
}

/**
 * 市场宽度信号
 */
export function generateBreadthSignals(
  data: BreadthData,
  previousData: BreadthData,
  totalStocks: number
): BreadthSignal[] {
  const signals: BreadthSignal[] = [];
  const indicators = breadthIndicators(data, totalStocks);
  const prevIndicators = breadthIndicators(previousData, totalStocks);

  // 涨跌比信号
  if (indicators.adRatio > 3) {
    signals.push({
      type: 'bullish',
      strength: Math.min(90, 50 + indicators.adRatio * 10),
      message: `涨跌比${indicators.adRatio.toFixed(1)}:1，市场全面上涨`,
    });
  } else if (indicators.adRatio < 0.33) {
    signals.push({
      type: 'bearish',
      strength: Math.min(90, 50 + (1 / indicators.adRatio) * 5),
      message: `涨跌比${indicators.adRatio.toFixed(2)}:1，市场全面下跌`,
    });
  }

  // 均线广度改善
  if (indicators.ma20Breadth > 0.7 && prevIndicators.ma20Breadth < 0.5) {
    signals.push({
      type: 'bullish',
      strength: 75,
      message: `${(indicators.ma20Breadth * 100).toFixed(0)}%个股站上20日均线，市场转强`,
    });
  } else if (indicators.ma20Breadth < 0.3 && prevIndicators.ma20Breadth > 0.5) {
    signals.push({
      type: 'bearish',
      strength: 75,
      message: `仅${(indicators.ma20Breadth * 100).toFixed(0)}%个股站上20日均线，市场转弱`,
    });
  }

  // 新高新低背离 (指数涨但宽度收窄)
  if (data.newHighCount < previousData.newHighCount && data.advanceCount > data.declineCount) {
    signals.push({
      type: 'divergence',
      strength: 65,
      message: '指数上涨但新高个股减少，存在顶背离风险',
    });
  }

  // 综合广度
  if (indicators.overallBreadth > 70) {
    signals.push({
      type: 'bullish',
      strength: indicators.overallBreadth,
      message: `市场综合广度${indicators.overallBreadth}，多头格局`,
    });
  } else if (indicators.overallBreadth < 30) {
    signals.push({
      type: 'bearish',
      strength: 100 - indicators.overallBreadth,
      message: `市场综合广度${indicators.overallBreadth}，空头格局`,
    });
  }

  if (signals.length === 0) {
    signals.push({ type: 'neutral', strength: 50, message: '市场宽度指标平稳' });
  }

  return signals;
}

/**
 * 行业宽度分析
 */
export function sectorBreadth(
  stocksBySector: Map<string, StockSnapshot[]>
): { sector: string; breadth: number; advanceRatio: number; aboveMA20Ratio: number }[] {
  return Array.from(stocksBySector.entries())
    .map(([sector, stocks]) => {
      const advances = stocks.filter((s) => s.changePercent > 0).length;
      const aboveMA20 = stocks.filter((s) => s.price > s.ma20).length;
      const total = stocks.length;

      return {
        sector,
        breadth: Math.round((advances / total) * 100),
        advanceRatio: Math.round((advances / total) * 10000) / 10000,
        aboveMA20Ratio: Math.round((aboveMA20 / total) * 10000) / 10000,
      };
    })
    .sort((a, b) => b.breadth - a.breadth);
}
