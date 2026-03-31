/**
 * 大宗交易分析引擎
 * 折溢价分析/机构识别/交易意图/统计汇总/异常检测
 */

export interface BlockTrade {
  date: string;
  code: string;
  name: string;
  price: number;
  closePrice: number;      // 当日收盘价
  volume: number;          // 成交量(万股)
  amount: number;          // 成交金额(万元)
  buyer: string;           // 买方营业部
  seller: string;          // 卖方营业部
}

export interface BlockTradeAnalysis {
  code: string;
  totalAmount: number;
  totalVolume: number;
  avgDiscount: number;     // 平均折价率
  premiumCount: number;    // 溢价成交笔数
  discountCount: number;   // 折价成交笔数
  consecutiveDays: number; // 连续出现天数
  buyerPattern: 'institution' | 'hot_money' | 'unknown';
  sellerPattern: 'institution' | 'major_shareholder' | 'unknown';
  intentSignal: 'accumulation' | 'distribution' | 'transfer' | 'arbitrage';
  riskLevel: 'low' | 'medium' | 'high';
  implication: string;
}

export interface BlockTradeStats {
  period: string;
  totalTrades: number;
  totalAmount: number;
  avgDiscount: number;
  topBuyers: { name: string; amount: number; count: number }[];
  topSellers: { name: string; amount: number; count: number }[];
  industryDistribution: Map<string, number>;
  anomalyTrades: BlockTrade[];
}

// 已知机构席位
const INSTITUTIONAL_BUYERS = ['机构专用', '深股通专用', '沪股通专用'];
const HOT_MONEY_DEPTS = ['华泰证券深圳', '东方财富拉萨', '国盛证券宁波', '中国银河绍兴'];

export function analyzeBlockTrade(trade: BlockTrade): BlockTradeAnalysis {
  const discount = (trade.price - trade.closePrice) / trade.closePrice;
  const isPremium = discount > 0;

  // 买方识别
  let buyerPattern: BlockTradeAnalysis['buyerPattern'] = 'unknown';
  if (INSTITUTIONAL_BUYERS.some(b => trade.buyer.includes(b))) buyerPattern = 'institution';
  else if (HOT_MONEY_DEPTS.some(b => trade.buyer.includes(b))) buyerPattern = 'hot_money';

  // 卖方识别
  let sellerPattern: BlockTradeAnalysis['sellerPattern'] = 'unknown';
  if (trade.seller.includes('机构')) sellerPattern = 'institution';
  else if (trade.seller.includes('有限合伙') || trade.seller.includes('创投')) sellerPattern = 'major_shareholder';

  // 交易意图
  let intentSignal: BlockTradeAnalysis['intentSignal'];
  if (buyerPattern === 'institution' && !isPremium) intentSignal = 'accumulation';
  else if (sellerPattern === 'major_shareholder') intentSignal = 'distribution';
  else if (isPremium) intentSignal = 'arbitrage';
  else intentSignal = 'transfer';

  // 风险等级
  let riskLevel: BlockTradeAnalysis['riskLevel'];
  if (sellerPattern === 'major_shareholder' && trade.amount > 5000) riskLevel = 'high';
  else if (discount < -0.08) riskLevel = 'high';
  else if (discount < -0.05) riskLevel = 'medium';
  else riskLevel = 'low';

  let implication = '';
  if (intentSignal === 'accumulation') implication = '机构折价买入，中线看好信号';
  else if (intentSignal === 'distribution') implication = '大股东减持，注意抛压';
  else if (intentSignal === 'arbitrage') implication = '溢价成交，短期看多';
  else implication = '常规股权变动';

  return {
    code: trade.code,
    totalAmount: trade.amount,
    totalVolume: trade.volume,
    avgDiscount: roundTo(discount, 4),
    premiumCount: isPremium ? 1 : 0,
    discountCount: isPremium ? 0 : 1,
    consecutiveDays: 1,
    buyerPattern,
    sellerPattern,
    intentSignal,
    riskLevel,
    implication,
  };
}

export function aggregateBlockTrades(trades: BlockTrade[]): BlockTradeStats {
  const buyerMap = new Map<string, { amount: number; count: number }>();
  const sellerMap = new Map<string, { amount: number; count: number }>();

  for (const t of trades) {
    const b = buyerMap.get(t.buyer) || { amount: 0, count: 0 };
    b.amount += t.amount; b.count++;
    buyerMap.set(t.buyer, b);

    const s = sellerMap.get(t.seller) || { amount: 0, count: 0 };
    s.amount += t.amount; s.count++;
    sellerMap.set(t.seller, s);
  }

  const totalAmount = trades.reduce((a, t) => a + t.amount, 0);
  const avgDiscount = trades.length > 0
    ? trades.reduce((a, t) => a + (t.price - t.closePrice) / t.closePrice, 0) / trades.length : 0;

  const topBuyers = [...buyerMap.entries()]
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10);

  const topSellers = [...sellerMap.entries()]
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10);

  // 异常交易:折价超8%或单笔超1亿
  const anomalyTrades = trades.filter(t => {
    const discount = (t.price - t.closePrice) / t.closePrice;
    return discount < -0.08 || t.amount > 10000;
  });

  const period = trades.length > 0
    ? `${trades[0].date} ~ ${trades[trades.length - 1].date}` : '';

  return {
    period,
    totalTrades: trades.length,
    totalAmount: roundTo(totalAmount, 0),
    avgDiscount: roundTo(avgDiscount, 4),
    topBuyers,
    topSellers,
    industryDistribution: new Map(),
    anomalyTrades,
  };
}

export function detectBlockTradeAnomalies(trades: BlockTrade[]): string[] {
  const warnings: string[] = [];

  // 同一股票连续大宗
  const codeCount = new Map<string, number>();
  for (const t of trades) {
    codeCount.set(t.code, (codeCount.get(t.code) || 0) + 1);
  }
  for (const [code, count] of codeCount) {
    if (count >= 5) warnings.push(`${code} 连续${count}天出现大宗交易，密切关注`);
  }

  // 大额折价
  for (const t of trades) {
    const discount = (t.price - t.closePrice) / t.closePrice;
    if (discount < -0.1) warnings.push(`${t.code} 折价${(Math.abs(discount) * 100).toFixed(1)}%成交，金额${t.amount}万`);
  }

  // 机构频繁出现
  const instTrades = trades.filter(t => INSTITUTIONAL_BUYERS.some(b => t.buyer.includes(b)));
  if (instTrades.length > trades.length * 0.5) {
    warnings.push('机构席位活跃度异常偏高，可能有重大布局');
  }

  return warnings;
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
