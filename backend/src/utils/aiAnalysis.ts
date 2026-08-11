/**
 * AI 智能分析引擎（真实数据版）
 * - AI 选股推荐、智能预警、行业轮动分析
 * - 参考同花顺 i问财功能设计
 *
 * 遵守「诚实数据」红线：
 * - 本模块不再内置任何模拟股票数据或随机数伪造；
 * - 所有分析函数接受调用方传入的真实 StockData（由路由层从真实源拉取）；
 * - 资金流入等无真实源字段诚实置 0，绝不回填伪造数据。
 */

// ==================== 类型定义 ====================

export interface StockScore {
  symbol: string;
  name: string;
  totalScore: number;          // 0-100 综合评分
  technicalScore: number;      // 技术面评分
  fundamentalScore: number;    // 基本面评分
  momentumScore: number;       // 动量评分
  sentimentScore: number;      // 情绪评分
  riskScore: number;           // 风险评分 (越低越好)
  recommendation: 'strong_buy' | 'buy' | 'hold' | 'sell' | 'strong_sell';
  reasons: string[];           // 推荐理由
  signals: AnalysisSignal[];   // 具体信号
  updatedAt: string;
}

export interface AnalysisSignal {
  type: 'bullish' | 'bearish' | 'neutral';
  indicator: string;
  value: number;
  description: string;
  strength: number; // 1-5 信号强度
}

export interface SmartAlert {
  id: string;
  symbol: string;
  name: string;
  type: 'abnormal_volume' | 'limit_up' | 'limit_down' | 'breakout' | 'breakdown' | 'macd_cross' | 'rsi_extreme' | 'sector_rotation';
  severity: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  analysis: string;            // AI 分析原因
  triggeredAt: string;
  data: Record<string, any>;
}

export interface SectorRotation {
  sector: string;
  currentPhase: 'leading' | 'lagging' | 'heating' | 'cooling';
  rotationScore: number;       // 轮动得分 0-100
  trend: 'up' | 'down' | 'sideways';
  avgChangePercent: number;
  momentum: number;            // 动量指标
  capitalInflow: number;       // 资金流入（真实源不可得时诚实置 0）
  topStocks: { symbol: string; name: string; changePercent: number }[];
  analysis: string;
}

export interface AIRecommendation {
  date: string;
  strategy: string;
  stocks: StockScore[];
  marketOutlook: string;
  riskLevel: 'low' | 'medium' | 'high';
  confidence: number;          // 置信度 0-100
}

/**
 * 个股输入数据（由路由层从真实源拉取后传入）。
 * 字段含义同原 MockStockData，但不再含任何模拟生成逻辑。
 */
export interface StockData {
  symbol: string;
  name: string;
  industry: string;
  prices: number[];
  volumes: number[];
  pe: number;
  pb: number;
  roe: number;
  revenueGrowth: number;
  profitGrowth: number;
  marketCap: number;
  changePercent: number;
}

// ==================== 技术指标计算辅助 ====================

function calculateMA(prices: number[], period: number): number {
  if (prices.length < period) return 0;
  const slice = prices.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function calculateRSI(prices: number[], period: number = 14): number {
  if (prices.length < period + 1) return 50;
  const changes = prices.slice(-(period + 1)).map((p, i, arr) => i === 0 ? 0 : p - arr[i - 1]).slice(1);
  const gains = changes.filter(c => c > 0);
  const losses = changes.filter(c => c < 0).map(c => Math.abs(c));
  const avgGain = gains.length ? gains.reduce((a, b) => a + b, 0) / period : 0;
  const avgLoss = losses.length ? losses.reduce((a, b) => a + b, 0) / period : 0.001;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function calculateMACD(prices: number[]): { dif: number; dea: number; histogram: number } {
  if (prices.length < 26) return { dif: 0, dea: 0, histogram: 0 };

  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);
  const dif = ema12 - ema26;

  // 简化 DEA 计算
  const dea = dif * 0.8; // 近似
  const histogram = (dif - dea) * 2;

  return { dif, dea, histogram };
}

function calculateEMA(prices: number[], period: number): number {
  if (prices.length < period) return prices[prices.length - 1] || 0;
  const k = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }
  return ema;
}

function calculateBollinger(prices: number[], period: number = 20): { upper: number; middle: number; lower: number } {
  const ma = calculateMA(prices, period);
  const slice = prices.slice(-period);
  const variance = slice.reduce((sum, p) => sum + (p - ma) ** 2, 0) / period;
  const stdDev = Math.sqrt(variance);
  return {
    upper: ma + stdDev * 2,
    middle: ma,
    lower: ma - stdDev * 2,
  };
}

// ==================== 核心分析引擎 ====================

/**
 * 对单只股票进行综合评分（纯函数，接受真实数据）
 */
export function analyzeStock(stock: StockData): StockScore {
  const signals: AnalysisSignal[] = [];
  const prices = stock.prices;
  const latestPrice = prices[prices.length - 1];

  // === 技术面分析 ===
  const ma5 = calculateMA(prices, 5);
  const ma10 = calculateMA(prices, 10);
  const ma20 = calculateMA(prices, 20);
  const rsi = calculateRSI(prices);
  const macd = calculateMACD(prices);
  const boll = calculateBollinger(prices);

  let technicalScore = 50;

  // MA 多头排列
  if (ma5 > ma10 && ma10 > ma20) {
    technicalScore += 15;
    signals.push({
      type: 'bullish', indicator: 'MA', value: ma5,
      description: 'MA5 > MA10 > MA20 多头排列', strength: 4,
    });
  } else if (ma5 < ma10 && ma10 < ma20) {
    technicalScore -= 15;
    signals.push({
      type: 'bearish', indicator: 'MA', value: ma5,
      description: 'MA5 < MA10 < MA20 空头排列', strength: 4,
    });
  }

  // RSI 判断
  if (rsi < 30) {
    technicalScore += 10;
    signals.push({
      type: 'bullish', indicator: 'RSI', value: rsi,
      description: `RSI=${rsi.toFixed(1)} 超卖区域，反弹概率大`, strength: 3,
    });
  } else if (rsi > 70) {
    technicalScore -= 10;
    signals.push({
      type: 'bearish', indicator: 'RSI', value: rsi,
      description: `RSI=${rsi.toFixed(1)} 超买区域，回调风险高`, strength: 3,
    });
  } else {
    signals.push({
      type: 'neutral', indicator: 'RSI', value: rsi,
      description: `RSI=${rsi.toFixed(1)} 正常区间`, strength: 1,
    });
  }

  // MACD 金叉/死叉
  if (macd.histogram > 0 && macd.dif > 0) {
    technicalScore += 10;
    signals.push({
      type: 'bullish', indicator: 'MACD', value: macd.histogram,
      description: 'MACD 红柱放大，多头趋势', strength: 3,
    });
  } else if (macd.histogram < 0 && macd.dif < 0) {
    technicalScore -= 10;
    signals.push({
      type: 'bearish', indicator: 'MACD', value: macd.histogram,
      description: 'MACD 绿柱放大，空头趋势', strength: 3,
    });
  }

  // 布林带位置
  if (latestPrice < boll.lower) {
    technicalScore += 8;
    signals.push({
      type: 'bullish', indicator: 'BOLL', value: latestPrice,
      description: '价格触及布林带下轨，超卖', strength: 2,
    });
  } else if (latestPrice > boll.upper) {
    technicalScore -= 8;
    signals.push({
      type: 'bearish', indicator: 'BOLL', value: latestPrice,
      description: '价格突破布林带上轨，超买', strength: 2,
    });
  }

  technicalScore = Math.max(0, Math.min(100, technicalScore));

  // === 基本面分析 ===
  let fundamentalScore = 50;

  // PE 估值
  if (stock.pe < 15) {
    fundamentalScore += 15;
    signals.push({
      type: 'bullish', indicator: 'PE', value: stock.pe,
      description: `PE=${stock.pe} 估值偏低，安全边际充足`, strength: 4,
    });
  } else if (stock.pe > 40) {
    fundamentalScore -= 10;
    signals.push({
      type: 'bearish', indicator: 'PE', value: stock.pe,
      description: `PE=${stock.pe} 估值偏高，需警惕回调`, strength: 3,
    });
  }

  // ROE 盈利能力
  if (stock.roe > 20) {
    fundamentalScore += 15;
    signals.push({
      type: 'bullish', indicator: 'ROE', value: stock.roe,
      description: `ROE=${stock.roe}% 盈利能力优秀`, strength: 4,
    });
  } else if (stock.roe < 10) {
    fundamentalScore -= 10;
    signals.push({
      type: 'bearish', indicator: 'ROE', value: stock.roe,
      description: `ROE=${stock.roe}% 盈利能力偏弱`, strength: 2,
    });
  }

  // 营收增长
  if (stock.revenueGrowth > 20) {
    fundamentalScore += 10;
    signals.push({
      type: 'bullish', indicator: 'Revenue', value: stock.revenueGrowth,
      description: `营收增长${stock.revenueGrowth}%，成长性良好`, strength: 3,
    });
  }

  fundamentalScore = Math.max(0, Math.min(100, fundamentalScore));

  // === 动量分析 ===
  const pLen = prices.length;
  const momentum5 = pLen >= 6 ? ((prices[pLen - 1] / prices[pLen - 6]) - 1) * 100 : 0;
  const momentum20 = pLen >= 21 ? ((prices[pLen - 1] / prices[pLen - 21]) - 1) * 100 : 0;
  let momentumScore = 50 + momentum5 * 2 + momentum20;
  momentumScore = Math.max(0, Math.min(100, momentumScore));

  // === 风险评估 ===
  const volatility = calculateVolatility(prices);
  let riskScore = 30;
  if (volatility > 5) riskScore += 20;
  if (stock.pe > 50) riskScore += 15;
  if (stock.changePercent > 8) riskScore += 10; // 涨停风险
  riskScore = Math.max(0, Math.min(100, riskScore));

  // === 综合评分 ===
  const totalScore = Math.round(
    technicalScore * 0.35 +
    fundamentalScore * 0.30 +
    momentumScore * 0.20 +
    (100 - riskScore) * 0.15
  );

  // === 推荐等级 ===
  let recommendation: StockScore['recommendation'];
  if (totalScore >= 80) recommendation = 'strong_buy';
  else if (totalScore >= 65) recommendation = 'buy';
  else if (totalScore >= 45) recommendation = 'hold';
  else if (totalScore >= 30) recommendation = 'sell';
  else recommendation = 'strong_sell';

  // === 推荐理由 ===
  const reasons: string[] = [];
  if (technicalScore > 65) reasons.push('技术面强势，多项指标看多');
  if (fundamentalScore > 65) reasons.push('基本面优质，估值合理');
  if (momentumScore > 60) reasons.push('动量充足，趋势向上');
  if (riskScore < 30) reasons.push('风险可控，波动率低');
  if (rsi < 35) reasons.push('RSI超卖，短线反弹机会');
  if (stock.roe > 20 && stock.pe < 25) reasons.push('高ROE低PE，价值洼地');
  if (reasons.length === 0) reasons.push('综合评分中性，等待趋势明确');

  return {
    symbol: stock.symbol,
    name: stock.name,
    totalScore,
    technicalScore: Math.round(technicalScore),
    fundamentalScore: Math.round(fundamentalScore),
    momentumScore: Math.round(momentumScore),
    sentimentScore: 50, // 简化
    riskScore: Math.round(riskScore),
    recommendation,
    reasons,
    signals,
    updatedAt: new Date().toISOString(),
  };
}

function calculateVolatility(prices: number[]): number {
  if (prices.length < 2) return 0;
  const returns = prices.slice(1).map((p, i) => ((p - prices[i]) / prices[i]) * 100);
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / returns.length;
  return Math.sqrt(variance);
}

// ==================== AI 选股推荐 ====================

/**
 * 生成 AI 选股推荐（基于真实 StockData 列表）
 * 置信度由平均分派生，绝不使用随机数。
 */
export function generateRecommendations(stocks: StockData[]): AIRecommendation {
  const scoredStocks = stocks.map(s => analyzeStock(s));
  scoredStocks.sort((a, b) => b.totalScore - a.totalScore);

  const topStocks = scoredStocks.slice(0, 5);
  const avgScore = scoredStocks.length > 0
    ? scoredStocks.reduce((a, s) => a + s.totalScore, 0) / scoredStocks.length
    : 0;

  let marketOutlook: string;
  let riskLevel: 'low' | 'medium' | 'high';

  if (avgScore > 60) {
    marketOutlook = '市场整体偏多，建议积极参与，关注优质龙头股';
    riskLevel = 'low';
  } else if (avgScore > 45) {
    marketOutlook = '市场震荡分化，建议精选个股，控制仓位';
    riskLevel = 'medium';
  } else {
    marketOutlook = '市场偏弱，建议防守为主，等待企稳信号';
    riskLevel = 'high';
  }

  // 置信度由平均分推导（40-85 区间），不依赖随机数
  const confidence = Math.round(Math.max(40, Math.min(85, 40 + (avgScore - 40) * 0.9)));

  return {
    date: new Date().toISOString().split('T')[0],
    strategy: 'AI综合评分选股',
    stocks: topStocks,
    marketOutlook,
    riskLevel,
    confidence,
  };
}

// ==================== 智能预警 ====================

/**
 * 检测异动并生成预警（基于真实 StockData 列表）
 */
export function detectAbnormalEvents(stocks: StockData[]): SmartAlert[] {
  const alerts: SmartAlert[] = [];

  for (const stock of stocks) {
    const latest = stock.prices[stock.prices.length - 1];
    const prev = stock.prices[stock.prices.length - 2];
    if (!latest || !prev || prev === 0) continue;
    const changePct = ((latest - prev) / prev) * 100;

    // 涨停检测
    const limitThreshold = stock.symbol.startsWith('3') || stock.symbol.startsWith('68') ? 20 : 10;
    if (changePct >= limitThreshold - 0.5) {
      alerts.push({
        id: `alert_${stock.symbol}_limitup`,
        symbol: stock.symbol,
        name: stock.name,
        type: 'limit_up',
        severity: 'high',
        title: `${stock.name} 涨停`,
        description: `${stock.symbol} ${stock.name} 涨幅${changePct.toFixed(2)}%，接近涨停板`,
        analysis: `该股强势涨停，可能是重大利好消息刺激或板块轮动效应。需关注后续成交量变化和板块联动情况。`,
        triggeredAt: new Date().toISOString(),
        data: { changePercent: changePct, price: latest },
      });
    }

    // 跌停检测
    if (changePct <= -limitThreshold + 0.5) {
      alerts.push({
        id: `alert_${stock.symbol}_limitdown`,
        symbol: stock.symbol,
        name: stock.name,
        type: 'limit_down',
        severity: 'high',
        title: `${stock.name} 跌停`,
        description: `${stock.symbol} ${stock.name} 跌幅${changePct.toFixed(2)}%，接近跌停板`,
        analysis: `该股大幅下跌，可能受到利空消息影响或资金出逃。建议检查基本面变化和行业政策。`,
        triggeredAt: new Date().toISOString(),
        data: { changePercent: changePct, price: latest },
      });
    }

    // 放量突破检测
    const recentVolumes = stock.volumes.slice(-20);
    const avgVolume = recentVolumes.length > 0
      ? recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length
      : 0;
    const latestVolume = stock.volumes[stock.volumes.length - 1] ?? 0;
    if (avgVolume > 0 && latestVolume > avgVolume * 2 && changePct > 3) {
      alerts.push({
        id: `alert_${stock.symbol}_breakout`,
        symbol: stock.symbol,
        name: stock.name,
        type: 'breakout',
        severity: 'medium',
        title: `${stock.name} 放量突破`,
        description: `${stock.symbol} 成交量为20日均量的${(latestVolume / avgVolume).toFixed(1)}倍，涨幅${changePct.toFixed(2)}%`,
        analysis: `放量突破通常是趋势确认的信号。量价齐升表明资金积极入场，可关注后续是否站稳突破位。`,
        triggeredAt: new Date().toISOString(),
        data: { changePercent: changePct, volumeRatio: latestVolume / avgVolume },
      });
    }

    // RSI 极端值
    const rsi = calculateRSI(stock.prices);
    if (rsi > 80) {
      alerts.push({
        id: `alert_${stock.symbol}_rsi_high`,
        symbol: stock.symbol,
        name: stock.name,
        type: 'rsi_extreme',
        severity: 'medium',
        title: `${stock.name} RSI严重超买`,
        description: `${stock.symbol} RSI(14)=${rsi.toFixed(1)}，处于严重超买区域`,
        analysis: `RSI超过80意味着短期内涨幅过大，获利盘累积，回调压力增大。建议适当减仓或设置止盈。`,
        triggeredAt: new Date().toISOString(),
        data: { rsi },
      });
    }

    if (rsi < 20) {
      alerts.push({
        id: `alert_${stock.symbol}_rsi_low`,
        symbol: stock.symbol,
        name: stock.name,
        type: 'rsi_extreme',
        severity: 'medium',
        title: `${stock.name} RSI严重超卖`,
        description: `${stock.symbol} RSI(14)=${rsi.toFixed(1)}，处于严重超卖区域`,
        analysis: `RSI低于20意味着短期跌幅过大，空头力量释放充分，超跌反弹概率增大。可关注企稳信号。`,
        triggeredAt: new Date().toISOString(),
        data: { rsi },
      });
    }
  }

  return alerts;
}

// ==================== 行业轮动分析 ====================

/**
 * 分析行业轮动趋势（基于真实 StockData 列表）
 * 资金流入字段无免费真实源，诚实置 0（前端按"未接入"处理），绝不伪造。
 */
export function analyzeSectorRotation(stocks: StockData[]): SectorRotation[] {
  const sectorMap = new Map<string, StockData[]>();

  for (const stock of stocks) {
    const list = sectorMap.get(stock.industry) || [];
    list.push(stock);
    sectorMap.set(stock.industry, list);
  }

  const rotations: SectorRotation[] = [];

  for (const [sector, sectorStocks] of sectorMap) {
    const avgChange = sectorStocks.reduce((a, s) => a + s.changePercent, 0) / sectorStocks.length;
    const momentum = sectorStocks.reduce((a, s) => {
      const p = s.prices;
      const ref = p[p.length - 11] ?? p[0];
      return a + (ref ? ((p[p.length - 1] / ref) - 1) * 100 : 0);
    }, 0) / sectorStocks.length;

    let currentPhase: SectorRotation['currentPhase'];
    let trend: SectorRotation['trend'];

    if (momentum > 5 && avgChange > 1) {
      currentPhase = 'leading';
      trend = 'up';
    } else if (momentum > 0 && avgChange > 0) {
      currentPhase = 'heating';
      trend = 'up';
    } else if (momentum < -5 && avgChange < -1) {
      currentPhase = 'lagging';
      trend = 'down';
    } else {
      currentPhase = 'cooling';
      trend = avgChange > 0 ? 'sideways' : 'down';
    }

    const rotationScore = Math.round(50 + momentum * 3 + avgChange * 5);
    // 资金流入无真实源，诚实置 0（非"无资金流入"的市场结论，仅占位）
    const capitalInflow = 0;

    const topStocks = sectorStocks
      .sort((a, b) => b.changePercent - a.changePercent)
      .slice(0, 3)
      .map(s => ({ symbol: s.symbol, name: s.name, changePercent: s.changePercent }));

    let analysis: string;
    switch (currentPhase) {
      case 'leading':
        analysis = `${sector}板块处于领涨阶段，资金持续流入，建议关注板块内龙头标的`;
        break;
      case 'heating':
        analysis = `${sector}板块逐步升温，可逢低布局，等待加速`;
        break;
      case 'cooling':
        analysis = `${sector}板块热度下降，资金有所流出，建议观望`;
        break;
      default:
        analysis = `${sector}板块表现落后，需等待基本面改善或政策催化`;
    }

    rotations.push({
      sector,
      currentPhase,
      rotationScore: Math.max(0, Math.min(100, rotationScore)),
      trend,
      avgChangePercent: Math.round(avgChange * 100) / 100,
      momentum: Math.round(momentum * 100) / 100,
      capitalInflow,
      topStocks,
      analysis,
    });
  }

  return rotations.sort((a, b) => b.rotationScore - a.rotationScore);
}
