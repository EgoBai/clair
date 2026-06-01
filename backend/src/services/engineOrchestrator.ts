/**
 * 引擎编排服务
 * 将量化引擎连接到真实数据库数据
 */

import { createLogger } from '../utils/logger';
import { db } from '../db/dbFactory';
import { RegimeTransitionEngine, type MarketRegime, type RegimeState } from './regimeTransitionEngine';

const log = createLogger('EngineOrchestrator');

const regimeEngine = new RegimeTransitionEngine();

export interface RegimeResult {
  currentRegime: MarketRegime;
  probability: number;
  allRegimes: RegimeState[];
  transitionMatrix: number[][];
  steadyState: number[];
}

/**
 * 从数据库获取价格序列并计算收益率
 */
async function getPriceReturns(symbol: string, days: number = 60): Promise<number[]> {
  const stock = await db.getStockBySymbol(symbol);
  if (!stock) {
    log.warn(`Stock not found: ${symbol}`);
    return [];
  }
  
  // 获取历史行情 (从 daily_quotes 表)
  const quotes = await (db as any).knexInstance('daily_quotes')
    .where('stock_id', stock.id)
    .orderBy('trade_date', 'desc')
    .limit(days);
  
  if (quotes.length < 5) {
    log.warn(`Not enough data for ${symbol}: ${quotes.length} days`);
    return [];
  }
  
  // 计算日收益率
  const returns: number[] = [];
  for (let i = 1; i < quotes.length; i++) {
    const prevClose = parseFloat(quotes[i].close_price) || 0;
    const currClose = parseFloat(quotes[i - 1].close_price) || 0;
    if (prevClose > 0 && currClose > 0) {
      returns.push((currClose - prevClose) / prevClose);
    }
  }
  
  return returns;
}

/**
 * 分析市场状态
 */
export async function analyzeRegime(symbol: string): Promise<RegimeResult | null> {
  try {
    const returns = await getPriceReturns(symbol, 60);
    
    if (returns.length < 10) {
      log.warn(`Not enough returns for ${symbol}: ${returns.length}`);
      return null;
    }
    
    // 使用 HMM 分类市场状态
    const regimes = regimeEngine.classifyRegime(returns, 20);
    
    if (regimes.length === 0) {
      return null;
    }
    
    // 获取当前状态 (最后一个)
    const current = regimes[regimes.length - 1];
    
    // 计算状态转移矩阵
    const transitionResult = regimeEngine.buildTransitionMatrix(regimes);
    
    // 计算稳态分布
    const steadyState = regimeEngine.computeSteadyState(transitionResult.matrix);
    
    return {
      currentRegime: current.regime,
      probability: current.probability,
      allRegimes: regimes,
      transitionMatrix: transitionResult.matrix,
      steadyState,
    };
  } catch (e) {
    log.error(`Regime analysis failed for ${symbol}: ${e}`);
    return null;
  }
}

/**
 * 获取多个股票的市场状态
 */
export async function analyzeMultipleRegimes(symbols: string[]): Promise<Map<string, RegimeResult>> {
  const results = new Map<string, RegimeResult>();
  
  const promises = symbols.map(async (symbol) => {
    const result = await analyzeRegime(symbol);
    if (result) {
      results.set(symbol, result);
    }
  });
  
  await Promise.all(promises);
  return results;
}

/**
 * 获取市场整体状态 (基于指数)
 */
export async function getMarketRegime(): Promise<RegimeResult | null> {
  // 使用沪深300指数 (000300.SH) 作为市场整体状态
  return analyzeRegime('000300.SH');
}
