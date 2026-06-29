/**
 * 尾盘异动检测引擎
 * 尾盘拉升/打压/集合竞价异常/资金博弈/次日预测信号
 */

export interface IntradaySnapshot {
  ticker: string;
  time: string;        // HH:mm
  price: number;
  volume: number;
  amount: number;
  high: number;
  low: number;
  prevClose: number;
  bid1: number;
  ask1: number;
  bidVol1: number;
  askVol1: number;
}

export interface EndOfDayPattern {
  ticker: string;
  date: string;
  pattern: 'pull_up' | 'push_down' | 'auction_surge' | 'auction_collapse'
    | 'volume_spike' | 'price_match' | 'normal';
  severity: 'mild' | 'moderate' | 'extreme';
  details: string;
  last5minReturn: number;
  last5minVolumeRatio: number; // vs 5min average
  auctionPrice: number;
  auctionVolume: number;
  closePrice: number;
  closeVsVwap: number;
}

export interface EodSignal {
  ticker: string;
  signal: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  pattern: string;
  reasoning: string;
  nextDayExpectation: string;
}

export interface AuctionAnalysis {
  ticker: string;
  auctionPrice: number;
  auctionImbalance: number; // 买卖不平衡比
  auctionVolume: number;
  priceDeviation: number;   // 与收盘价偏离
  type: 'buying_pressure' | 'selling_pressure' | 'balanced';
  institutionalSignal: 'accumulating' | 'distributing' | 'neutral';
}

/**
 * 检测尾盘模式
 */
export function detectEndOfDayPattern(
  snapshots: IntradaySnapshot[],
  _prevDayClose: number
): EndOfDayPattern | null {
  if (snapshots.length < 10) return null;

  const latest = snapshots[snapshots.length - 1];
  const ticker = latest.ticker;
  const date = new Date().toISOString().slice(0, 10);

  // 取最后5分钟数据 (假设每条1分钟)
  const last5 = snapshots.slice(-5);
  const beforeLast5 = snapshots.slice(-30, -5);

  if (last5.length < 3 || beforeLast5.length < 5) return null;

  // 最后5分钟收益
  const last5Return = (last5[last5.length - 1].price - last5[0].price) / last5[0].price;

  // 最后5分钟平均成交量 vs 之前5分钟均量
  const last5Vol = last5.reduce((s, d) => s + d.volume, 0) / last5.length;
  const prev5Vol = beforeLast5.slice(-5).reduce((s, d) => s + d.volume, 0) / 5;
  const volumeRatio = prev5Vol > 0 ? last5Vol / prev5Vol : 1;

  // VWAP
  const totalAmount = snapshots.reduce((s, d) => s + d.amount, 0);
  const totalVol = snapshots.reduce((s, d) => s + d.volume, 0);
  const vwap = totalVol > 0 ? totalAmount / totalVol : latest.price;
  const closeVsVwap = (latest.price - vwap) / vwap;

  // 集合竞价数据 (简化为最后一笔)
  const auctionPrice = latest.price;
  const auctionVolume = latest.volume;

  let pattern: EndOfDayPattern['pattern'];
  let severity: EndOfDayPattern['severity'];
  let details = '';

  if (last5Return > 0.01 && volumeRatio > 1.5) {
    pattern = 'pull_up';
    severity = last5Return > 0.03 ? 'extreme' : last5Return > 0.02 ? 'moderate' : 'mild';
    details = `尾盘拉升 ${(last5Return * 100).toFixed(2)}%，量比${volumeRatio.toFixed(1)}`;
  } else if (last5Return < -0.01 && volumeRatio > 1.5) {
    pattern = 'push_down';
    severity = last5Return < -0.03 ? 'extreme' : last5Return < -0.02 ? 'moderate' : 'mild';
    details = `尾盘打压 ${(last5Return * 100).toFixed(2)}%，量比${volumeRatio.toFixed(1)}`;
  } else if (volumeRatio > 3) {
    pattern = 'volume_spike';
    severity = volumeRatio > 5 ? 'extreme' : 'moderate';
    details = `尾盘放量，量比${volumeRatio.toFixed(1)}`;
  } else if (Math.abs(closeVsVwap) > 0.02) {
    pattern = 'price_match';
    severity = 'mild';
    details = `收盘价偏离VWAP ${(closeVsVwap * 100).toFixed(2)}%`;
  } else {
    pattern = 'normal';
    severity = 'mild';
    details = '尾盘表现正常';
  }

  return {
    ticker,
    date,
    pattern,
    severity,
    details,
    last5minReturn: last5Return,
    last5minVolumeRatio: volumeRatio,
    auctionPrice,
    auctionVolume,
    closePrice: latest.price,
    closeVsVwap,
  };
}

/**
 * 集合竞价分析
 */
export function analyzeAuction(
  ticker: string,
  auctionPrice: number,
  auctionVolume: number,
  prevClose: number,
  buyVolume: number,
  sellVolume: number
): AuctionAnalysis {
  const totalVol = buyVolume + sellVolume;
  const imbalance = totalVol > 0 ? (buyVolume - sellVolume) / totalVol : 0;
  const priceDeviation = (auctionPrice - prevClose) / prevClose;

  let type: AuctionAnalysis['type'];
  if (imbalance > 0.2) type = 'buying_pressure';
  else if (imbalance < -0.2) type = 'selling_pressure';
  else type = 'balanced';

  let institutionalSignal: AuctionAnalysis['institutionalSignal'];
  if (auctionVolume > 1e6 && imbalance > 0.3) institutionalSignal = 'accumulating';
  else if (auctionVolume > 1e6 && imbalance < -0.3) institutionalSignal = 'distributing';
  else institutionalSignal = 'neutral';

  return {
    ticker,
    auctionPrice,
    auctionImbalance: imbalance,
    auctionVolume,
    priceDeviation,
    type,
    institutionalSignal,
  };
}

/**
 * 生成尾盘信号
 */
export function generateEodSignal(
  pattern: EndOfDayPattern,
  auction?: AuctionAnalysis
): EodSignal {
  let signal: EodSignal['signal'];
  let confidence: number;
  let reasoning: string;
  let nextDayExpectation: string;

  switch (pattern.pattern) {
    case 'pull_up':
      signal = pattern.severity === 'extreme' ? 'bearish' : 'bullish';
      confidence = pattern.severity === 'extreme' ? 0.6 : 0.55;
      reasoning = `尾盘拉升${pattern.last5minReturn > 0.02 ? '幅度较大' : '温和'}，${
        pattern.severity === 'extreme' ? '可能为诱多' : '有资金介入'
      }`;
      nextDayExpectation = pattern.severity === 'extreme'
        ? '高开后可能回落'
        : '可能延续强势';
      break;

    case 'push_down':
      signal = pattern.severity === 'extreme' ? 'bullish' : 'bearish';
      confidence = pattern.severity === 'extreme' ? 0.6 : 0.55;
      reasoning = `尾盘打压${pattern.last5minReturn < -0.02 ? '幅度较大' : '温和'}，${
        pattern.severity === 'extreme' ? '可能为洗盘' : '抛压明显'
      }`;
      nextDayExpectation = pattern.severity === 'extreme'
        ? '低开后可能反弹'
        : '可能延续弱势';
      break;

    case 'volume_spike':
      signal = 'neutral';
      confidence = 0.4;
      reasoning = '尾盘放量，方向不明确';
      nextDayExpectation = '需结合竞价和消息面判断';
      break;

    default:
      signal = 'neutral';
      confidence = 0.3;
      reasoning = '尾盘表现正常';
      nextDayExpectation = '大概率延续当前趋势';
  }

  // 集合竞价修正
  if (auction) {
    if (auction.type === 'buying_pressure' && signal === 'bullish') {
      confidence += 0.1;
      reasoning += '，竞价买压确认';
    } else if (auction.type === 'selling_pressure' && signal === 'bearish') {
      confidence += 0.1;
      reasoning += '，竞价卖压确认';
    }
  }

  return {
    ticker: pattern.ticker,
    signal,
    confidence: Math.min(0.9, confidence),
    pattern: pattern.pattern,
    reasoning,
    nextDayExpectation,
  };
}

/**
 * 批量尾盘扫描
 */
export function batchEodScan(
  snapshotsByTicker: Map<string, IntradaySnapshot[]>
): { patterns: EndOfDayPattern[]; signals: EodSignal[] } {
  const patterns: EndOfDayPattern[] = [];
  const signals: EodSignal[] = [];

  snapshotsByTicker.forEach((snapshots, _ticker) => {
    if (snapshots.length < 10) return;

    const prevClose = snapshots[0].prevClose;
    const pattern = detectEndOfDayPattern(snapshots, prevClose);

    if (pattern && pattern.pattern !== 'normal') {
      patterns.push(pattern);
      signals.push(generateEodSignal(pattern));
    }
  });

  // 按严重度排序
  const severityOrder = { extreme: 3, moderate: 2, mild: 1 };
  patterns.sort((a, b) => severityOrder[b.severity] - severityOrder[a.severity]);

  return { patterns, signals };
}
