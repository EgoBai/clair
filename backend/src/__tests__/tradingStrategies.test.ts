import { describe, it, expect } from 'vitest';

// 网格交易策略
interface GridLevel {
  price: number;
  type: 'buy' | 'sell';
  executed: boolean;
}

function generateGridLevels(
  centerPrice: number, gridSpacing: number, levels: number
): GridLevel[] {
  const result: GridLevel[] = [];
  for (let i = 1; i <= levels; i++) {
    result.push({
      price: Math.round((centerPrice - gridSpacing * i) * 100) / 100,
      type: 'buy',
      executed: false
    });
    result.push({
      price: Math.round((centerPrice + gridSpacing * i) * 100) / 100,
      type: 'sell',
      executed: false
    });
  }
  return result.sort((a, b) => a.price - b.price);
}

function executeGrid(grid: GridLevel[], currentPrice: number, prevPrice: number): GridLevel[] {
  return grid.map(level => {
    if (level.executed) return level;
    if (level.type === 'buy' && currentPrice <= level.price && prevPrice > level.price) {
      return { ...level, executed: true };
    }
    if (level.type === 'sell' && currentPrice >= level.price && prevPrice < level.price) {
      return { ...level, executed: true };
    }
    return level;
  });
}

function calculateGridProfit(grid: GridLevel[], quantity: number): number {
  const buys = grid.filter(l => l.type === 'buy' && l.executed);
  const sells = grid.filter(l => l.type === 'sell' && l.executed);
  const pairs = Math.min(buys.length, sells.length);
  let profit = 0;
  for (let i = 0; i < pairs; i++) {
    profit += (sells[i].price - buys[i].price) * quantity;
  }
  return profit;
}

describe('网格交易策略', () => {
  it('生成对称网格', () => {
    const grid = generateGridLevels(10, 1, 3);
    expect(grid).toHaveLength(6);
    const buys = grid.filter(l => l.type === 'buy');
    const sells = grid.filter(l => l.type === 'sell');
    expect(buys).toHaveLength(3);
    expect(sells).toHaveLength(3);
  });

  it('买入网格价格低于中心价', () => {
    const grid = generateGridLevels(10, 1, 3);
    const buys = grid.filter(l => l.type === 'buy');
    expect(buys.every(l => l.price < 10)).toBe(true);
  });

  it('卖出网格价格高于中心价', () => {
    const grid = generateGridLevels(10, 1, 3);
    const sells = grid.filter(l => l.type === 'sell');
    expect(sells.every(l => l.price > 10)).toBe(true);
  });

  it('网格按价格排序', () => {
    const grid = generateGridLevels(10, 0.5, 5);
    for (let i = 1; i < grid.length; i++) {
      expect(grid[i].price).toBeGreaterThan(grid[i - 1].price);
    }
  });

  it('穿透买入网格触发执行', () => {
    let grid = generateGridLevels(10, 1, 3);
    grid = executeGrid(grid, 9, 10);
    const executedBuys = grid.filter(l => l.type === 'buy' && l.executed);
    expect(executedBuys.length).toBe(1);
    expect(executedBuys[0].price).toBe(9);
  });

  it('穿透卖出网格触发执行', () => {
    let grid = generateGridLevels(10, 1, 3);
    grid = executeGrid(grid, 11, 10);
    const executedSells = grid.filter(l => l.type === 'sell' && l.executed);
    expect(executedSells.length).toBe(1);
    expect(executedSells[0].price).toBe(11);
  });

  it('已执行网格不重复执行', () => {
    let grid = generateGridLevels(10, 1, 3);
    grid = executeGrid(grid, 9, 10);
    grid = executeGrid(grid, 9, 9);
    const executedBuys = grid.filter(l => l.type === 'buy' && l.executed);
    expect(executedBuys).toHaveLength(1);
  });

  it('网格利润计算', () => {
    let grid = generateGridLevels(10, 1, 3);
    grid = executeGrid(grid, 9, 10); // buy at 9
    grid = executeGrid(grid, 11, 9); // sell at 11
    const profit = calculateGridProfit(grid, 100);
    expect(profit).toBe(200); // (11-9) * 100
  });

  it('无执行无利润', () => {
    const grid = generateGridLevels(10, 1, 3);
    expect(calculateGridProfit(grid, 100)).toBe(0);
  });

  it('小间距网格更多层次', () => {
    const grid1 = generateGridLevels(10, 1, 5);
    const grid2 = generateGridLevels(10, 0.5, 5);
    expect(grid1[1].price - grid1[0].price).toBeGreaterThan(grid2[1].price - grid2[0].price);
  });
});

// 止盈止损计算
interface StopLevel {
  price: number;
  type: 'stop_loss' | 'take_profit';
}

function calculateStopLevelsATR(
  entryPrice: number, atr: number, riskMultiplier = 2, rewardMultiplier = 3
): StopLevel[] {
  return [
    { price: Math.round((entryPrice - atr * riskMultiplier) * 100) / 100, type: 'stop_loss' },
    { price: Math.round((entryPrice + atr * rewardMultiplier) * 100) / 100, type: 'take_profit' }
  ];
}

function calculateStopLevelsPercent(
  entryPrice: number, stopPercent: number, profitPercent: number
): StopLevel[] {
  return [
    { price: Math.round(entryPrice * (1 - stopPercent / 100) * 100) / 100, type: 'stop_loss' },
    { price: Math.round(entryPrice * (1 + profitPercent / 100) * 100) / 100, type: 'take_profit' }
  ];
}

function calculateRiskRewardRatio(
  entryPrice: number, stopLoss: number, takeProfit: number
): number {
  const risk = Math.abs(entryPrice - stopLoss);
  const reward = Math.abs(takeProfit - entryPrice);
  if (risk === 0) return Infinity;
  return reward / risk;
}

describe('止盈止损计算', () => {
  it('ATR方法止损价低于入场价', () => {
    const levels = calculateStopLevelsATR(100, 2);
    expect(levels[0].price).toBeLessThan(100);
    expect(levels[1].price).toBeGreaterThan(100);
  });

  it('百分比方法', () => {
    const levels = calculateStopLevelsPercent(100, 5, 10);
    expect(levels[0].price).toBe(95);
    expect(levels[1].price).toBe(110);
  });

  it('风险回报比计算', () => {
    const rr = calculateRiskRewardRatio(100, 95, 110);
    expect(rr).toBe(2); // 风险5，回报10
  });

  it('风险回报比>1表示正期望', () => {
    const rr = calculateRiskRewardRatio(100, 98, 106);
    expect(rr).toBe(3); // 风险2，回报6
  });

  it('零风险返回Infinity', () => {
    expect(calculateRiskRewardRatio(100, 100, 110)).toBe(Infinity);
  });

  it('ATR多倍数止损', () => {
    const levels = calculateStopLevelsATR(50, 1, 1, 2);
    expect(levels[0].price).toBe(49); // 50 - 1*1 = 49
    expect(levels[1].price).toBe(52); // 50 + 1*2 = 52
  });

  it('止损价低于入场价', () => {
    const levels = calculateStopLevelsPercent(100, 3, 8);
    expect(levels[0].price).toBeLessThan(100);
    expect(levels[1].price).toBeGreaterThan(100);
  });
});

// 定投策略收益
function calculateDCAProfit(
  prices: number[],
  investAmount: number,
  feeRate: number = 0.001
): { totalInvested: number; totalShares: number; currentValue: number; profit: number; returnRate: number } {
  let totalInvested = 0;
  let totalShares = 0;
  
  for (const price of prices) {
    const fee = investAmount * feeRate;
    const actualInvest = investAmount - fee;
    const shares = Math.floor(actualInvest / price);
    totalInvested += investAmount;
    totalShares += shares;
  }
  
  const currentPrice = prices[prices.length - 1];
  const currentValue = totalShares * currentPrice;
  const profit = currentValue - totalInvested;
  const returnRate = totalInvested > 0 ? profit / totalInvested : 0;
  
  return { totalInvested, totalShares, currentValue, profit, returnRate };
}

function calculateAverageCost(totalInvested: number, totalShares: number): number {
  if (totalShares <= 0) return 0;
  return totalInvested / totalShares;
}

describe('定投策略收益', () => {
  it('等价定投平均成本', () => {
    const prices = [10, 10, 10, 10, 10];
    const result = calculateDCAProfit(prices, 1000);
    expect(result.totalInvested).toBe(5000);
    expect(result.totalShares).toBeGreaterThan(0);
  });

  it('下跌趋势定投拉低成本', () => {
    const prices1 = [10, 10, 10, 10, 10];
    const prices2 = [10, 8, 6, 4, 4];
    const r1 = calculateDCAProfit(prices1, 1000);
    const r2 = calculateDCAProfit(prices2, 1000);
    // 下跌趋势买到更多份额
    expect(r2.totalShares).toBeGreaterThan(r1.totalShares);
  });

  it('上涨趋势定投', () => {
    const prices = [5, 7, 9, 11, 13];
    const result = calculateDCAProfit(prices, 1000);
    expect(result.totalInvested).toBe(5000);
    expect(result.currentValue).toBeGreaterThan(0);
  });

  it('平均成本计算', () => {
    expect(calculateAverageCost(10000, 1000)).toBe(10);
  });

  it('零份额平均成本为零', () => {
    expect(calculateAverageCost(1000, 0)).toBe(0);
  });

  it('收益率计算', () => {
    const prices = [10, 10, 10];
    const result = calculateDCAProfit(prices, 1000);
    // 收益率应接近零（扣除手续费）
    expect(result.returnRate).toBeLessThan(0);
  });

  it('手续费影响收益', () => {
    const prices = [10, 10, 10];
    const r1 = calculateDCAProfit(prices, 1000, 0);
    const r2 = calculateDCAProfit(prices, 1000, 0.01);
    expect(r2.totalShares).toBeLessThan(r1.totalShares);
  });

  it('空价格列表', () => {
    const result = calculateDCAProfit([], 1000);
    expect(result.totalInvested).toBe(0);
    expect(result.totalShares).toBe(0);
  });

  it('单期定投', () => {
    const result = calculateDCAProfit([50], 10000);
    expect(result.totalInvested).toBe(10000);
    expect(result.totalShares).toBe(199); // floor(9990/50)
  });
});

// 仓位管理 - 金字塔加仓
function calculatePyramidPosition(
  baseCapital: number,
  entryPrice: number,
  levels: number,
  ratio: number = 0.5 // 每次加仓是前次的比率
): { price: number; shares: number; cost: number }[] {
  const result: { price: number; shares: number; cost: number }[] = [];
  let totalShares = 0;
  let totalCost = 0;
  
  for (let i = 0; i < levels; i++) {
    const weight = Math.pow(ratio, i);
    const capital = baseCapital * weight;
    const totalBaseCapital = baseCapital * (1 - Math.pow(ratio, levels)) / (1 - ratio);
    const proportion = capital / totalBaseCapital;
    const shares = Math.floor((baseCapital * proportion) / entryPrice) * 100;
    const cost = shares * entryPrice;
    
    totalShares += shares;
    totalCost += cost;
    
    result.push({
      price: entryPrice,
      shares,
      cost
    });
  }
  
  return result;
}

describe('金字塔仓位管理', () => {
  it('生成多层级仓位', () => {
    const positions = calculatePyramidPosition(10000, 10, 3);
    expect(positions).toHaveLength(3);
  });

  it('每层都是100股整数倍', () => {
    const positions = calculatePyramidPosition(10000, 10, 5);
    for (const pos of positions) {
      expect(pos.shares % 100).toBe(0);
    }
  });

  it('首次投入最大', () => {
    const positions = calculatePyramidPosition(10000, 10, 3);
    expect(positions[0].shares).toBeGreaterThanOrEqual(positions[1].shares);
  });

  it('每层成本为正', () => {
    const positions = calculatePyramidPosition(10000, 10, 4);
    for (const pos of positions) {
      expect(pos.cost).toBeGreaterThan(0);
    }
  });

  it('缩减比例0.5逐层递减', () => {
    const positions = calculatePyramidPosition(10000, 10, 3, 0.5);
    // 第一层最多
    expect(positions[0].shares).toBeGreaterThanOrEqual(positions[2].shares);
  });
});

// 移动平均策略信号
function generateMASignals(prices: number[], shortPeriod: number, longPeriod: number): ('buy' | 'sell' | 'hold')[] {
  const signals: ('buy' | 'sell' | 'hold')[] = [];
  
  for (let i = 0; i < prices.length; i++) {
    if (i < longPeriod - 1) {
      signals.push('hold');
      continue;
    }
    
    const shortMA = prices.slice(i - shortPeriod + 1, i + 1).reduce((a, b) => a + b, 0) / shortPeriod;
    const longMA = prices.slice(i - longPeriod + 1, i + 1).reduce((a, b) => a + b, 0) / longPeriod;
    
    const prevShortMA = prices.slice(i - shortPeriod, i).reduce((a, b) => a + b, 0) / shortPeriod;
    const prevLongMA = prices.slice(i - longPeriod, i).reduce((a, b) => a + b, 0) / longPeriod;
    
    if (shortMA > longMA && prevShortMA <= prevLongMA) {
      signals.push('buy');
    } else if (shortMA < longMA && prevShortMA >= prevLongMA) {
      signals.push('sell');
    } else {
      signals.push('hold');
    }
  }
  
  return signals;
}

describe('均线交叉信号', () => {
  it('金叉产生买入信号', () => {
    const prices = [10, 10, 10, 10, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30];
    const signals = generateMASignals(prices, 3, 5);
    const buySignals = signals.filter(s => s === 'buy');
    expect(buySignals.length).toBeGreaterThan(0);
  });

  it('死叉产生卖出信号', () => {
    const prices = [30, 28, 26, 24, 22, 20, 18, 16, 14, 12, 10, 10, 10, 10, 10];
    const signals = generateMASignals(prices, 3, 5);
    const sellSignals = signals.filter(s => s === 'sell');
    expect(sellSignals.length).toBeGreaterThan(0);
  });

  it('前期不足时返回hold', () => {
    const prices = [10, 11, 12];
    const signals = generateMASignals(prices, 2, 5);
    expect(signals.every(s => s === 'hold')).toBe(true);
  });

  it('信号长度与价格一致', () => {
    const prices = Array.from({ length: 20 }, (_, i) => 10 + i);
    const signals = generateMASignals(prices, 3, 5);
    expect(signals.length).toBe(20);
  });

  it('平坦价格无交叉信号', () => {
    const prices = new Array(20).fill(100);
    const signals = generateMASignals(prices, 3, 5);
    expect(signals.slice(4).every(s => s === 'hold')).toBe(true);
  });

  it('信号只有buy/sell/hold三种', () => {
    const prices = Array.from({ length: 20 }, (_, i) => 10 + Math.sin(i) * 5);
    const signals = generateMASignals(prices, 3, 5);
    expect(signals.every(s => ['buy', 'sell', 'hold'].includes(s))).toBe(true);
  });
});
