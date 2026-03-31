/**
 * 大宗交易分析引擎
 * 折溢价分析、机构行为追踪、异常检测
 */

export interface BlockTrade {
  date: string;
  stockCode: string;
  stockName: string;
  price: number;
  volume: number;
  amount: number;
  closePrice: number;
  buyer: string;
  seller: string;
  is机构Buy: boolean;
  is机构Sell: boolean;
}

export interface BlockTradeAnalysis {
  totalAmount: number;
  tradeCount: number;
  avgDiscount: number;
  discountTrades: number;
  premiumTrades: number;
  institutionNet: number;
  topStocks: { stock: string; amount: number; avgDiscount: number }[];
  signals: { type: string; description: string }[];
  anomalyTrades: BlockTrade[];
  buyerProfile: { name: string; totalAmount: number; trades: number }[];
}

/**
 * 分析大宗交易
 */
export function analyzeBlockTrades(trades: BlockTrade[]): BlockTradeAnalysis {
  if (trades.length === 0) {
    return {
      totalAmount: 0, tradeCount: 0, avgDiscount: 0, discountTrades: 0,
      premiumTrades: 0, institutionNet: 0, topStocks: [], signals: [],
      anomalyTrades: [], buyerProfile: [],
    };
  }

  const totalAmount = trades.reduce((s, t) => s + t.amount, 0);

  // 折溢价
  const discounts = trades.map(t => t.closePrice > 0 ? (t.price - t.closePrice) / t.closePrice : 0);
  const avgDiscount = discounts.reduce((a, b) => a + b, 0) / discounts.length;
  const discountTrades = discounts.filter(d => d < -0.01).length;
  const premiumTrades = discounts.filter(d => d > 0.01).length;

  // 机构净额
  const instBuy = trades.filter(t => t.is机构Buy).reduce((s, t) => s + t.amount, 0);
  const instSell = trades.filter(t => t.is机构Sell).reduce((s, t) => s + t.amount, 0);
  const institutionNet = instBuy - instSell;

  // 股票排名
  const stockMap = new Map<string, { amount: number; discounts: number[] }>();
  trades.forEach(t => {
    if (!stockMap.has(t.stockName)) stockMap.set(t.stockName, { amount: 0, discounts: [] });
    const entry = stockMap.get(t.stockName)!;
    entry.amount += t.amount;
    entry.discounts.push(t.closePrice > 0 ? (t.price - t.closePrice) / t.closePrice : 0);
  });
  const topStocks = Array.from(stockMap.entries())
    .map(([stock, { amount, discounts }]) => ({
      stock,
      amount: Math.round(amount),
      avgDiscount: Math.round(discounts.reduce((a, b) => a + b, 0) / discounts.length * 10000) / 10000,
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10);

  // 买家画像
  const buyerMap = new Map<string, { totalAmount: number; trades: number }>();
  trades.forEach(t => {
    if (!buyerMap.has(t.buyer)) buyerMap.set(t.buyer, { totalAmount: 0, trades: 0 });
    const b = buyerMap.get(t.buyer)!;
    b.totalAmount += t.amount;
    b.trades++;
  });
  const buyerProfile = Array.from(buyerMap.entries())
    .map(([name, { totalAmount, trades: count }]) => ({ name, totalAmount: Math.round(totalAmount), trades: count }))
    .sort((a, b) => b.totalAmount - a.totalAmount)
    .slice(0, 10);

  // 异常交易
  const amounts = trades.map(t => t.amount);
  const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
  const anomalyTrades = trades.filter(t => t.amount > avgAmount * 3 || discounts[trades.indexOf(t)] < -0.08);

  // 信号
  const signals: { type: string; description: string }[] = [];
  if (institutionNet > 0) signals.push({ type: '机构买入', description: `机构净买入 ${(institutionNet / 1e8).toFixed(2)}亿` });
  if (avgDiscount < -0.05) signals.push({ type: '大幅折价', description: `平均折价 ${(avgDiscount * 100).toFixed(1)}%` });
  if (anomalyTrades.length > 0) signals.push({ type: '异常交易', description: `${anomalyTrades.length}笔异常大宗交易` });
  if (premiumTrades > discountTrades * 2) signals.push({ type: '溢价交易多', description: '溢价大宗交易占比偏高，看好信号' });

  return {
    totalAmount: Math.round(totalAmount),
    tradeCount: trades.length,
    avgDiscount: Math.round(avgDiscount * 10000) / 10000,
    discountTrades,
    premiumTrades,
    institutionNet: Math.round(institutionNet),
    topStocks,
    signals,
    anomalyTrades: anomalyTrades.slice(0, 10),
    buyerProfile,
  };
}
