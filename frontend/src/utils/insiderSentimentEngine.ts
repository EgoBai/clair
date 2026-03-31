/**
 * 内部人情绪引擎
 * - 增减持统计
 * - 内部人类型分析
 * - 交易时机分析
 * - 内部人行为模式
 * - 信号强度评分
 */
export interface InsiderTrade {
  date: string;
  insider: string;
  role: 'ceo' | 'cfo' | 'director' | 'executive' | 'large_shareholder';
  type: 'buy' | 'sell';
  shares: number;
  price: number;
  amount: number;
  isDirect: boolean; // 是否直接持股
}

export interface InsiderSentimentResult {
  totalBuyAmount: number;
  totalSellAmount: number;
  netAmount: number;
  buyCount: number;
  sellCount: number;
  sentiment: 'bullish' | 'neutral' | 'bearish';
  ceoSignal: 'buy' | 'sell' | 'neutral';
  signalStrength: number; // 0-100
  clusteredBuying: boolean; // 集中买入
  clusteredSelling: boolean;
  averageBuyPrice: number;
  averageSellPrice: number;
  buyingInsiders: string[];
  sellingInsiders: string[];
  insights: string[];
}

export function analyzeInsiderSentiment(trades: InsiderTrade[]): InsiderSentimentResult {
  if (trades.length === 0) throw new Error('没有交易数据');
  const insights: string[] = [];

  const buys = trades.filter(t => t.type === 'buy');
  const sells = trades.filter(t => t.type === 'sell');

  const totalBuyAmount = buys.reduce((s, t) => s + t.amount, 0);
  const totalSellAmount = sells.reduce((s, t) => s + t.amount, 0);
  const netAmount = totalBuyAmount - totalSellAmount;

  // CEO信号
  const ceoTrades = trades.filter(t => t.role === 'ceo');
  const ceoBuys = ceoTrades.filter(t => t.type === 'buy');
  const ceoSells = ceoTrades.filter(t => t.type === 'sell');
  let ceoSignal: InsiderSentimentResult['ceoSignal'];
  if (ceoBuys.length > ceoSells.length) ceoSignal = 'buy';
  else if (ceoSells.length > ceoBuys.length) { ceoSignal = 'sell'; insights.push('CEO净减持'); }
  else ceoSignal = 'neutral';

  // 集中交易检测
  const buyDates = new Set(buys.map(t => t.date));
  const sellDates = new Set(sells.map(t => t.date));
  const clusteredBuying = buyDates.size > 0 && buys.length / buyDates.size > 2;
  const clusteredSelling = sellDates.size > 0 && sells.length / sellDates.size > 2;
  if (clusteredBuying) insights.push('检测到集中买入行为');
  if (clusteredSelling) insights.push('检测到集中卖出行为');

  // 平均价格
  const averageBuyPrice = buys.length > 0 ? buys.reduce((s, t) => s + t.price, 0) / buys.length : 0;
  const averageSellPrice = sells.length > 0 ? sells.reduce((s, t) => s + t.price, 0) / sells.length : 0;

  // 情绪
  let sentiment: InsiderSentimentResult['sentiment'];
  if (netAmount > 0 && buys.length > sells.length) sentiment = 'bullish';
  else if (netAmount < 0 && sells.length > buys.length) { sentiment = 'bearish'; insights.push('内部人净卖出'); }
  else sentiment = 'neutral';

  // 信号强度
  let strength = 50;
  if (netAmount > 0) strength += Math.min(30, netAmount / 10000);
  else strength -= Math.min(30, Math.abs(netAmount) / 10000);
  if (ceoSignal === 'buy') strength += 15;
  else if (ceoSignal === 'sell') strength -= 15;
  if (clusteredBuying) strength += 10;
  if (clusteredSelling) strength -= 10;
  strength = Math.max(0, Math.min(100, Math.round(strength)));

  const buyingInsiders = [...new Set(buys.map(t => t.insider))];
  const sellingInsiders = [...new Set(sells.map(t => t.insider))];

  return {
    totalBuyAmount,
    totalSellAmount,
    netAmount,
    buyCount: buys.length,
    sellCount: sells.length,
    sentiment,
    ceoSignal,
    signalStrength: strength,
    clusteredBuying,
    clusteredSelling,
    averageBuyPrice: Math.round(averageBuyPrice * 100) / 100,
    averageSellPrice: Math.round(averageSellPrice * 100) / 100,
    buyingInsiders,
    sellingInsiders,
    insights,
  };
}
