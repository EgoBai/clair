/**
 * 多信号融合引擎
 * 聚合现有量化引擎输出 + Digital Oracle 外部数据
 * 生成统一信号表供 LLM 叙事引擎使用
 */

import { createLogger } from '../utils/logger';
import { db } from '../db/dbFactory';

const log = createLogger('MultiSignalEngine');

// Digital Oracle 微服务地址
const DIGITAL_ORACLE_URL = process.env.DIGITAL_ORACLE_URL || 'http://localhost:8001';

export interface Signal {
  name: string;
  source: string;
  value: number | string;
  direction: 'bullish' | 'bearish' | 'neutral';
  confidence: number; // 0-1
  timeframe: 'short' | 'medium' | 'long';
  detail?: string;
}

export interface MultiSignalResult {
  symbol: string;
  name?: string;
  signals: Signal[];
  summary: {
    bullish: number;
    bearish: number;
    neutral: number;
    overall: 'bullish' | 'bearish' | 'neutral';
    confidence: number;
  };
  timestamp: string;
}

/**
 * 从 Digital Oracle 获取外部市场信号
 */
async function fetchExternalSignals(): Promise<Signal[]> {
  const signals: Signal[] = [];
  
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${DIGITAL_ORACLE_URL}/fear-greed`, { signal: controller.signal });
    clearTimeout(timeout);
    
    if (res.ok) {
      const data = await res.json();
      const score = data.score;
      const direction = score < 40 ? 'bearish' : score > 60 ? 'bullish' : 'neutral';
      signals.push({
        name: '恐惧贪婪指数',
        source: 'CNN Fear & Greed',
        value: Math.round(score * 10) / 10,
        direction,
        confidence: 0.9,
        timeframe: 'short',
        detail: `评分 ${score.toFixed(1)} (${data.rating})，前日 ${data.previous_close?.toFixed(1)}，一周前 ${data.one_week_ago?.toFixed(1)}`,
      });
    }
  } catch (e) {
    log.warn(`FearGreed fetch failed (CNN API may be rate-limited): ${e}`);
  }
  
  return signals;
}

/**
 * 从数据库获取真实技术信号
 */
async function fetchTechnicalSignals(symbol: string): Promise<Signal[]> {
  const signals: Signal[] = [];
  
  try {
    // 从数据库获取股票和行情数据
    console.log(`[DEBUG] Fetching data for ${symbol}...`);
    const stockWithQuote = await db.getStockWithLatestQuote(symbol);
    console.log(`[DEBUG] stockWithQuote:`, stockWithQuote ? 'found' : 'null');
    
    if (!stockWithQuote || !stockWithQuote.latestQuote) {
      console.log(`[DEBUG] No data found for ${symbol}, stockWithQuote:`, stockWithQuote);
      log.warn(`No data found for ${symbol}`);
      return signals;
    }
    
    const quote = stockWithQuote.latestQuote;
    const stock = stockWithQuote;
    
    // 数据库返回 camelCase (已通过 getLatestDailyQuote 映射)
    // 注意: PostgreSQL numeric 类型返回字符串，需要 parseFloat
    const closePrice = parseFloat(quote.closePrice as any) || 0;
    const openPrice = parseFloat(quote.openPrice as any) || 0;
    const highPrice = parseFloat(quote.highPrice as any) || 0;
    const lowPrice = parseFloat(quote.lowPrice as any) || 0;
    const changePercent = parseFloat(quote.changePercent as any) || 0;
    const volume = parseFloat(quote.volume as any) || 0;
    const turnover = parseFloat(quote.turnover as any) || 0;
    const amplitude = parseFloat(quote.amplitude as any) || 0;
    const turnoverRate = parseFloat(quote.turnoverRate as any) || 0;
    
    // 涨跌信号
    signals.push({
      name: '日涨跌幅',
      source: '腾讯行情',
      value: `${changePercent > 0 ? '+' : ''}${changePercent.toFixed(2)}%`,
      direction: changePercent > 2 ? 'bullish' : changePercent < -2 ? 'bearish' : 'neutral',
      confidence: 0.8,
      timeframe: 'short',
      detail: `收盘 ${closePrice}，开盘 ${openPrice}，最高 ${highPrice}，最低 ${lowPrice}`,
    });
    
    // 成交量信号
    signals.push({
      name: '成交量',
      source: '腾讯行情',
      value: volume > 100000000 ? `${(volume / 100000000).toFixed(1)}亿` : `${(volume / 10000).toFixed(0)}万`,
      direction: changePercent > 0 && volume > 50000000 ? 'bullish' : changePercent < 0 && volume > 50000000 ? 'bearish' : 'neutral',
      confidence: 0.7,
      timeframe: 'short',
      detail: `成交额 ${turnover > 100000000 ? (turnover / 100000000).toFixed(1) + '亿' : (turnover / 10000).toFixed(0) + '万'}`,
    });
    
    // 振幅信号
    signals.push({
      name: '振幅',
      source: '腾讯行情',
      value: `${amplitude.toFixed(2)}%`,
      direction: amplitude > 5 ? 'bearish' : amplitude < 2 ? 'neutral' : 'neutral',
      confidence: 0.6,
      timeframe: 'short',
      detail: amplitude > 5 ? '高振幅，波动较大' : amplitude < 2 ? '低振幅，走势平稳' : '正常波动',
    });
    
    // 换手率信号
    if (turnoverRate > 0) {
      signals.push({
        name: '换手率',
        source: '腾讯行情',
        value: `${turnoverRate.toFixed(2)}%`,
        direction: turnoverRate > 10 ? 'bullish' : turnoverRate < 1 ? 'bearish' : 'neutral',
        confidence: 0.65,
        timeframe: 'short',
        detail: turnoverRate > 10 ? '高换手，活跃度高' : turnoverRate < 1 ? '低换手，关注度低' : '正常换手',
      });
    }
    
  } catch (e) {
    console.error(`[ERROR] Technical signals failed for ${symbol}:`, e);
    log.warn(`Technical signals failed for ${symbol}: ${e}`);
  }
  
  return signals;
}

/**
 * 获取板块信号
 */
async function fetchSectorSignals(symbol: string): Promise<Signal[]> {
  const signals: Signal[] = [];
  
  try {
    const stockWithQuote = await db.getStockWithLatestQuote(symbol);
    if (!stockWithQuote?.industry) return signals;
    
    // 获取同行业股票
    const sectorStocks = await db.getStocks({ 
      industry: stockWithQuote.industry, 
      pageSize: 20,
      sortBy: 'change_percent',
      sortOrder: 'desc'
    });
    
    if (sectorStocks.length > 0) {
      // 计算板块平均涨跌
      let totalChange = 0;
      let count = 0;
      for (const s of sectorStocks) {
        const q = await db.getLatestDailyQuote(s.id);
        if (q) {
          totalChange += q.changePercent || 0;
          count++;
        }
      }
      
      if (count > 0) {
        const avgChange = totalChange / count;
        signals.push({
          name: '板块表现',
          source: '行业分析',
          value: `${avgChange > 0 ? '+' : ''}${avgChange.toFixed(2)}%`,
          direction: avgChange > 1 ? 'bullish' : avgChange < -1 ? 'bearish' : 'neutral',
          confidence: 0.7,
          timeframe: 'short',
          detail: `${stockWithQuote.industry}板块平均涨跌 ${avgChange.toFixed(2)}%（${count}只样本）`,
        });
      }
    }
  } catch (e) {
    log.warn(`Sector signals failed for ${symbol}: ${e}`);
  }
  
  return signals;
}

/**
 * 汇总所有信号，计算整体方向
 */
function summarizeSignals(signals: Signal[]): MultiSignalResult['summary'] {
  let bullishScore = 0;
  let bearishScore = 0;
  let totalConfidence = 0;
  
  for (const s of signals) {
    const weight = s.confidence;
    if (s.direction === 'bullish') bullishScore += weight;
    else if (s.direction === 'bearish') bearishScore += weight;
    totalConfidence += weight;
  }
  
  const avgConfidence = signals.length > 0 ? totalConfidence / signals.length : 0;
  
  let overall: 'bullish' | 'bearish' | 'neutral';
  if (bullishScore > bearishScore * 1.3) overall = 'bullish';
  else if (bearishScore > bullishScore * 1.3) overall = 'bearish';
  else overall = 'neutral';
  
  return {
    bullish: Math.round(bullishScore * 100) / 100,
    bearish: Math.round(bearishScore * 100) / 100,
    neutral: Math.round((signals.length - bullishScore - bearishScore) * 100) / 100,
    overall,
    confidence: Math.round(avgConfidence * 100) / 100,
  };
}

/**
 * 主入口：聚合多维度信号
 */
export async function getMultiSignals(symbol: string): Promise<MultiSignalResult> {
  log.info(`Gathering multi-signals for ${symbol}`);
  
  // 并行获取所有信号
  const [externalSignals, technicalSignals, sectorSignals] = await Promise.all([
    fetchExternalSignals(),
    fetchTechnicalSignals(symbol),
    fetchSectorSignals(symbol),
  ]);
  
  const allSignals = [...externalSignals, ...technicalSignals, ...sectorSignals];
  const summary = summarizeSignals(allSignals);
  
  // 获取股票名称
  let stockName = '';
  try {
    const stock = await db.getStockBySymbol(symbol);
    if (stock) stockName = stock.name;
  } catch (e) {
    // ignore
  }
  
  log.info(`Got ${allSignals.length} signals for ${symbol}: overall=${summary.overall}`);
  
  return {
    symbol,
    name: stockName,
    signals: allSignals,
    summary,
    timestamp: new Date().toISOString(),
  };
}
