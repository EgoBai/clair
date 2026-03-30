import { describe, it, expect } from 'vitest';

// ===== 股票代码验证与解析 =====
describe('Stock Code Validation', () => {
  const validateStockCode = (code: string): { valid: boolean; market?: string; error?: string } => {
    if (!code || typeof code !== 'string') return { valid: false, error: '代码不能为空' };
    const clean = code.trim().toUpperCase();
    if (!/^[0-9]{6}$/.test(clean)) return { valid: false, error: '代码必须为6位数字' };
    
    const prefix = clean.substring(0, 3);
    if (['600', '601', '603', '605', '688'].includes(prefix)) return { valid: true, market: 'SH' };
    if (['000', '001', '002', '003', '300', '301'].includes(prefix)) return { valid: true, market: 'SZ' };
    if (['430', '830', '831', '832', '833', '834', '835', '836', '837', '838', '839'].includes(prefix)) return { valid: true, market: 'BJ' };
    return { valid: false, error: '未知市场前缀' };
  };

  it('应该验证有效上证代码', () => {
    expect(validateStockCode('600519')).toEqual({ valid: true, market: 'SH' });
    expect(validateStockCode('601398')).toEqual({ valid: true, market: 'SH' });
    expect(validateStockCode('688001')).toEqual({ valid: true, market: 'SH' });
  });

  it('应该验证有效深证代码', () => {
    expect(validateStockCode('000001')).toEqual({ valid: true, market: 'SZ' });
    expect(validateStockCode('002415')).toEqual({ valid: true, market: 'SZ' });
    expect(validateStockCode('300750')).toEqual({ valid: true, market: 'SZ' });
  });

  it('应该验证有效北交所代码', () => {
    expect(validateStockCode('430001')).toEqual({ valid: true, market: 'BJ' });
    expect(validateStockCode('830001')).toEqual({ valid: true, market: 'BJ' });
  });

  it('应该拒绝无效代码', () => {
    expect(validateStockCode('').valid).toBe(false);
    expect(validateStockCode('12345').valid).toBe(false);
    expect(validateStockCode('1234567').valid).toBe(false);
    expect(validateStockCode('ABCDEF').valid).toBe(false);
    expect(validateStockCode('999999').valid).toBe(false);
  });

  it('应该处理空值和null', () => {
    expect(validateStockCode(null as any).valid).toBe(false);
    expect(validateStockCode(undefined as any).valid).toBe(false);
  });

  it('应该忽略前后空格', () => {
    expect(validateStockCode(' 600519 ')).toEqual({ valid: true, market: 'SH' });
  });
});

// ===== 涨跌幅计算 =====
describe('Price Change Calculations', () => {
  const calcChangePercent = (current: number, previous: number): number => {
    if (!previous || previous === 0) return 0;
    return ((current - previous) / previous) * 100;
  };

  const calcAmplitude = (high: number, low: number, prevClose: number): number => {
    if (!prevClose || prevClose === 0) return 0;
    return ((high - low) / prevClose) * 100;
  };

  const isLimitUp = (change: number, isST: boolean = false): boolean => {
    const limit = isST ? 5 : 10;
    return change >= limit;
  };

  const isLimitDown = (change: number, isST: boolean = false): boolean => {
    const limit = isST ? -5 : -10;
    return change <= limit;
  };

  it('应该正确计算涨跌幅', () => {
    expect(calcChangePercent(110, 100)).toBe(10);
    expect(calcChangePercent(90, 100)).toBe(-10);
    expect(calcChangePercent(100, 100)).toBe(0);
  });

  it('应该处理除零情况', () => {
    expect(calcChangePercent(100, 0)).toBe(0);
  });

  it('应该计算振幅', () => {
    expect(calcAmplitude(110, 90, 100)).toBe(20);
    expect(calcAmplitude(105, 95, 100)).toBe(10);
  });

  it('应该正确判断涨停', () => {
    expect(isLimitUp(10)).toBe(true);
    expect(isLimitUp(9.99)).toBe(false);
    expect(isLimitUp(5, true)).toBe(true); // ST股
    expect(isLimitUp(5.01, true)).toBe(true);
  });

  it('应该正确判断跌停', () => {
    expect(isLimitDown(-10)).toBe(true);
    expect(isLimitDown(-9.99)).toBe(false);
    expect(isLimitDown(-5, true)).toBe(true);
  });

  it('应该处理极端涨跌幅', () => {
    expect(calcChangePercent(200, 100)).toBe(100); // 翻倍
    expect(calcChangePercent(50, 100)).toBe(-50); // 腰斩
    expect(calcChangePercent(0.01, 100)).toBe(-99.99); // 几乎归零
  });
});

// ===== 市值计算 =====
describe('Market Cap Calculations', () => {
  const calcMarketCap = (price: number, totalShares: number): number => {
    return price * totalShares;
  };

  const formatMarketCap = (cap: number): string => {
    if (cap >= 1e12) return (cap / 1e12).toFixed(2) + '万亿';
    if (cap >= 1e8) return (cap / 1e8).toFixed(2) + '亿';
    if (cap >= 1e4) return (cap / 1e4).toFixed(2) + '万';
    return cap.toFixed(2);
  };

  const calcPE = (price: number, eps: number): number | null => {
    if (!eps || eps <= 0) return null;
    return price / eps;
  };

  const calcPB = (price: number, bps: number): number | null => {
    if (!bps || bps <= 0) return null;
    return price / bps;
  };

  it('应该计算市值', () => {
    expect(calcMarketCap(100, 1e9)).toBe(1e11);
    expect(calcMarketCap(50.5, 2e8)).toBe(1.01e10);
  });

  it('应该格式化万亿市值', () => {
    expect(formatMarketCap(2.5e12)).toBe('2.50万亿');
    expect(formatMarketCap(1e12)).toBe('1.00万亿');
  });

  it('应该格式化亿市值', () => {
    expect(formatMarketCap(5e10)).toBe('500.00亿');
    expect(formatMarketCap(1e8)).toBe('1.00亿');
  });

  it('应该计算PE', () => {
    expect(calcPE(100, 5)).toBe(20);
    expect(calcPE(100, 0)).toBeNull();
    expect(calcPE(100, -2)).toBeNull();
  });

  it('应该计算PB', () => {
    expect(calcPB(100, 20)).toBe(5);
    expect(calcPB(100, 0)).toBeNull();
  });
});

// ===== K线数据验证 =====
describe('KLine Data Validation', () => {
  interface KLineBar {
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    amount: number;
  }

  const validateKLine = (bar: KLineBar): { valid: boolean; errors: string[] } => {
    const errors: string[] = [];
    
    if (bar.high < bar.low) errors.push('最高价低于最低价');
    if (bar.high < bar.open) errors.push('最高价低于开盘价');
    if (bar.high < bar.close) errors.push('最高价低于收盘价');
    if (bar.low > bar.open) errors.push('最低价高于开盘价');
    if (bar.low > bar.close) errors.push('最低价高于收盘价');
    if (bar.open < 0 || bar.high < 0 || bar.low < 0 || bar.close < 0) errors.push('价格不能为负');
    if (bar.volume < 0) errors.push('成交量不能为负');
    if (bar.amount < 0) errors.push('成交额不能为负');
    if (bar.volume > 0 && bar.amount <= 0) errors.push('有成交量但无成交额');
    
    return { valid: errors.length === 0, errors };
  };

  const isDoji = (bar: KLineBar, threshold: number = 0.001): boolean => {
    if (bar.high === bar.low) return true;
    const body = Math.abs(bar.close - bar.open);
    const range = bar.high - bar.low;
    return body / range < threshold;
  };

  const isHammer = (bar: KLineBar): boolean => {
    const body = Math.abs(bar.close - bar.open);
    const lowerShadow = Math.min(bar.open, bar.close) - bar.low;
    const upperShadow = bar.high - Math.max(bar.open, bar.close);
    return lowerShadow >= 2 * body && upperShadow <= body * 0.5;
  };

  it('应该验证有效的K线', () => {
    const bar: KLineBar = { date: '2026-03-24', open: 100, high: 105, low: 98, close: 103, volume: 1e6, amount: 1e8 };
    expect(validateKLine(bar).valid).toBe(true);
  });

  it('应该检测最高价低于最低价', () => {
    const bar: KLineBar = { date: '2026-03-24', open: 100, high: 95, low: 98, close: 100, volume: 1e6, amount: 1e8 };
    expect(validateKLine(bar).valid).toBe(false);
    expect(validateKLine(bar).errors).toContain('最高价低于最低价');
  });

  it('应该检测负价格', () => {
    const bar: KLineBar = { date: '2026-03-24', open: -1, high: 105, low: 98, close: 103, volume: 1e6, amount: 1e8 };
    expect(validateKLine(bar).valid).toBe(false);
  });

  it('应该识别十字星', () => {
    const doji: KLineBar = { date: '2026-03-24', open: 100, high: 105, low: 95, close: 100, volume: 1e6, amount: 1e8 };
    expect(isDoji(doji)).toBe(true);
    
    const notDoji: KLineBar = { date: '2026-03-24', open: 100, high: 110, low: 90, close: 108, volume: 1e6, amount: 1e8 };
    expect(isDoji(notDoji)).toBe(false);
  });

  it('应该识别锤子线', () => {
    // body=2, lowerShadow=8 (>=4), upperShadow=0.5 (<=1)
    const hammer: KLineBar = { date: '2026-03-24', open: 98, high: 100.5, low: 90, close: 100, volume: 1e6, amount: 1e8 };
    expect(isHammer(hammer)).toBe(true);
  });

  it('应该验证量额一致性', () => {
    const bar: KLineBar = { date: '2026-03-24', open: 100, high: 105, low: 98, close: 103, volume: 1e6, amount: 0 };
    expect(validateKLine(bar).valid).toBe(false);
  });

  it('应该处理一字涨停板', () => {
    const limitUp: KLineBar = { date: '2026-03-24', open: 110, high: 110, low: 110, close: 110, volume: 1e6, amount: 1.1e8 };
    expect(validateKLine(limitUp).valid).toBe(true);
    expect(limitUp.high).toBe(limitUp.low); // 无影线
  });
});

// ===== 技术指标信号判断 =====
describe('Technical Indicator Signals', () => {
  const detectMACDCross = (dif: number, dea: number, prevDif: number, prevDea: number): 'golden' | 'death' | 'none' => {
    if (prevDif <= prevDea && dif > dea) return 'golden';
    if (prevDif >= prevDea && dif < dea) return 'death';
    return 'none';
  };

  const rsiSignal = (rsi: number): 'oversold' | 'overbought' | 'neutral' => {
    if (rsi <= 30) return 'oversold';
    if (rsi >= 70) return 'overbought';
    return 'neutral';
  };

  const bollSignal = (price: number, upper: number, middle: number, lower: number): 'above_upper' | 'below_lower' | 'near_middle' | 'normal' => {
    if (price >= upper) return 'above_upper';
    if (price <= lower) return 'below_lower';
    if (Math.abs(price - middle) / middle < 0.01) return 'near_middle';
    return 'normal';
  };

  const kdjSignal = (k: number, d: number, j: number): '超买' | '超卖' | '金叉' | '死叉' | '中性' => {
    if (k > 80 && d > 80) return '超买';
    if (k < 20 && d < 20) return '超卖';
    if (k > d) return '金叉';
    if (k < d) return '死叉';
    return '中性';
  };

  it('应该检测MACD金叉', () => {
    expect(detectMACDCross(0.5, 0.3, 0.2, 0.3)).toBe('golden');
  });

  it('应该检测MACD死叉', () => {
    expect(detectMACDCross(0.2, 0.3, 0.5, 0.3)).toBe('death');
  });

  it('应该判断无交叉', () => {
    expect(detectMACDCross(0.5, 0.3, 0.4, 0.2)).toBe('none');
  });

  it('应该判断RSI超卖', () => {
    expect(rsiSignal(25)).toBe('oversold');
    expect(rsiSignal(30)).toBe('oversold');
  });

  it('应该判断RSI超买', () => {
    expect(rsiSignal(75)).toBe('overbought');
    expect(rsiSignal(70)).toBe('overbought');
  });

  it('应该判断RSI中性', () => {
    expect(rsiSignal(50)).toBe('neutral');
  });

  it('应该判断布林带信号', () => {
    expect(bollSignal(110, 110, 100, 90)).toBe('above_upper');
    expect(bollSignal(90, 110, 100, 90)).toBe('below_lower');
    expect(bollSignal(100, 110, 100, 90)).toBe('near_middle');
    expect(bollSignal(105, 110, 100, 90)).toBe('normal');
  });

  it('应该判断KDJ超买超卖', () => {
    expect(kdjSignal(85, 82, 91)).toBe('超买');
    expect(kdjSignal(15, 18, 9)).toBe('超卖');
    expect(kdjSignal(60, 50, 80)).toBe('金叉');
    expect(kdjSignal(40, 50, 20)).toBe('死叉');
  });
});

// ===== 成交量分析 =====
describe('Volume Analysis', () => {
  const calcVolumeRatio = (current: number, avg5: number): number => {
    if (!avg5 || avg5 === 0) return 0;
    return current / avg5;
  };

  const volumeSignal = (ratio: number): '放量' | '缩量' | '正常' | '巨量' | '地量' => {
    if (ratio >= 3) return '巨量';
    if (ratio >= 1.5) return '放量';
    if (ratio <= 0.5) return '地量';
    if (ratio <= 0.8) return '缩量';
    return '正常';
  };

  const calcTurnoverRate = (volume: number, totalShares: number): number => {
    if (!totalShares || totalShares === 0) return 0;
    return (volume / totalShares) * 100;
  };

  it('应该计算量比', () => {
    expect(calcVolumeRatio(1.5e6, 1e6)).toBe(1.5);
    expect(calcVolumeRatio(5e5, 1e6)).toBe(0.5);
  });

  it('应该处理量比除零', () => {
    expect(calcVolumeRatio(1e6, 0)).toBe(0);
  });

  it('应该判断成交量信号', () => {
    expect(volumeSignal(3.5)).toBe('巨量');
    expect(volumeSignal(2)).toBe('放量');
    expect(volumeSignal(0.3)).toBe('地量');
    expect(volumeSignal(0.7)).toBe('缩量');
    expect(volumeSignal(1)).toBe('正常');
  });

  it('应该计算换手率', () => {
    expect(calcTurnoverRate(1e7, 1e9)).toBeCloseTo(1);
    expect(calcTurnoverRate(5e7, 1e9)).toBeCloseTo(5);
  });

  it('应该处理换手率除零', () => {
    expect(calcTurnoverRate(1e7, 0)).toBe(0);
  });
});

// ===== 风险指标计算 =====
describe('Risk Metrics', () => {
  const calcSharpeRatio = (returns: number[], riskFreeRate: number = 0.03): number => {
    if (returns.length === 0) return 0;
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);
    if (stdDev === 0) return 0;
    return (avgReturn - riskFreeRate / 252) / stdDev;
  };

  const calcMaxDrawdown = (equity: number[]): number => {
    if (equity.length === 0) return 0;
    let maxEquity = equity[0];
    let maxDrawdown = 0;
    for (const val of equity) {
      if (val > maxEquity) maxEquity = val;
      const drawdown = (maxEquity - val) / maxEquity;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }
    return maxDrawdown;
  };

  const calcWinRate = (trades: { pnl: number }[]): number => {
    if (trades.length === 0) return 0;
    const wins = trades.filter(t => t.pnl > 0).length;
    return wins / trades.length;
  };

  it('应该计算夏普比率', () => {
    const returns = [0.01, 0.02, -0.01, 0.03, -0.005];
    const sharpe = calcSharpeRatio(returns);
    expect(typeof sharpe).toBe('number');
    expect(Number.isFinite(sharpe)).toBe(true);
  });

  it('应该处理空数据夏普比率', () => {
    expect(calcSharpeRatio([])).toBe(0);
  });

  it('应该计算最大回撤', () => {
    const equity = [100, 110, 105, 120, 100, 95, 105];
    expect(calcMaxDrawdown(equity)).toBeCloseTo(0.2083, 1);
  });

  it('应该处理上涨趋势回撤', () => {
    const equity = [100, 110, 120, 130, 140];
    expect(calcMaxDrawdown(equity)).toBe(0);
  });

  it('应该计算胜率', () => {
    const trades = [{ pnl: 100 }, { pnl: -50 }, { pnl: 200 }, { pnl: -30 }];
    expect(calcWinRate(trades)).toBe(0.5);
  });

  it('应该处理空交易胜率', () => {
    expect(calcWinRate([])).toBe(0);
  });

  it('应该计算盈亏比', () => {
    const trades = [{ pnl: 200 }, { pnl: -100 }, { pnl: 150 }, { pnl: -50 }];
    const wins = trades.filter(t => t.pnl > 0);
    const losses = trades.filter(t => t.pnl < 0);
    const avgWin = wins.reduce((s, t) => s + t.pnl, 0) / wins.length;
    const avgLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0) / losses.length);
    expect(avgWin / avgLoss).toBeCloseTo(2.33, 1);
  });
});

// ===== 分页逻辑 =====
describe('Pagination Logic', () => {
  const paginate = <T>(items: T[], page: number, pageSize: number) => {
    const total = items.length;
    const totalPages = Math.ceil(total / pageSize);
    const start = (page - 1) * pageSize;
    const end = Math.min(start + pageSize, total);
    return {
      data: items.slice(start, end),
      page,
      pageSize,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };
  };

  const items = Array.from({ length: 25 }, (_, i) => `item-${i + 1}`);

  it('应该正确分页第一页', () => {
    const result = paginate(items, 1, 10);
    expect(result.data).toHaveLength(10);
    expect(result.data[0]).toBe('item-1');
    expect(result.hasNext).toBe(true);
    expect(result.hasPrev).toBe(false);
  });

  it('应该正确分页最后一页', () => {
    const result = paginate(items, 3, 10);
    expect(result.data).toHaveLength(5);
    expect(result.hasNext).toBe(false);
    expect(result.hasPrev).toBe(true);
  });

  it('应该处理超出范围的页码', () => {
    const result = paginate(items, 10, 10);
    expect(result.data).toHaveLength(0);
  });

  it('应该计算总页数', () => {
    expect(paginate(items, 1, 10).totalPages).toBe(3);
    expect(paginate(items, 1, 5).totalPages).toBe(5);
    expect(paginate(items, 1, 25).totalPages).toBe(1);
  });

  it('应该处理空数组', () => {
    const result = paginate([], 1, 10);
    expect(result.data).toHaveLength(0);
    expect(result.totalPages).toBe(0);
    expect(result.hasNext).toBe(false);
  });

  it('应该处理pageSize大于总数', () => {
    const result = paginate(items, 1, 100);
    expect(result.data).toHaveLength(25);
    expect(result.totalPages).toBe(1);
  });
});

// ===== 排序逻辑 =====
describe('Sorting Logic', () => {
  interface Stock {
    code: string;
    name: string;
    price: number;
    change: number;
    volume: number;
    marketCap: number;
  }

  const stocks: Stock[] = [
    { code: '600519', name: '贵州茅台', price: 1800, change: 2.5, volume: 5e6, marketCap: 2.2e12 },
    { code: '000858', name: '五粮液', price: 150, change: -1.2, volume: 8e6, marketCap: 5.8e11 },
    { code: '002415', name: '海康威视', price: 35, change: 3.8, volume: 1.2e7, marketCap: 3.3e11 },
    { code: '300750', name: '宁德时代', price: 200, change: -0.5, volume: 6e6, marketCap: 9.2e11 },
  ];

  const sortStocks = (data: Stock[], field: keyof Stock, order: 'asc' | 'desc' = 'desc') => {
    return [...data].sort((a, b) => {
      const va = a[field], vb = b[field];
      if (typeof va === 'string' && typeof vb === 'string') {
        return order === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      const numA = va as number, numB = vb as number;
      return order === 'asc' ? numA - numB : numB - numA;
    });
  };

  it('应该按价格降序排列', () => {
    const sorted = sortStocks(stocks, 'price', 'desc');
    expect(sorted[0].price).toBe(1800);
    expect(sorted[3].price).toBe(35);
  });

  it('应该按涨跌幅升序排列', () => {
    const sorted = sortStocks(stocks, 'change', 'asc');
    expect(sorted[0].change).toBe(-1.2);
    expect(sorted[3].change).toBe(3.8);
  });

  it('应该按市值降序排列', () => {
    const sorted = sortStocks(stocks, 'marketCap', 'desc');
    expect(sorted[0].name).toBe('贵州茅台');
  });

  it('应该不修改原始数组', () => {
    const original = [...stocks];
    sortStocks(stocks, 'price', 'desc');
    expect(stocks).toEqual(original);
  });

  it('应该处理空数组排序', () => {
    expect(sortStocks([], 'price')).toEqual([]);
  });

  it('应该处理单元素排序', () => {
    const single = [stocks[0]];
    expect(sortStocks(single, 'price')).toEqual(single);
  });
});

// ===== 数据聚合 =====
describe('Data Aggregation', () => {
  const aggregateByField = <T, K extends keyof T>(items: T[], field: K): Map<T[K], T[]> => {
    const map = new Map<T[K], T[]>();
    for (const item of items) {
      const key = item[field];
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return map;
  };

  const calcGroupSum = (items: number[]): number => items.reduce((a, b) => a + b, 0);
  const calcGroupAvg = (items: number[]): number => items.length === 0 ? 0 : calcGroupSum(items) / items.length;
  const calcGroupMax = (items: number[]): number => items.length === 0 ? 0 : Math.max(...items);
  const calcGroupMin = (items: number[]): number => items.length === 0 ? 0 : Math.min(...items);

  interface Record { sector: string; change: number; volume: number; }

  const records: Record[] = [
    { sector: '白酒', change: 2.5, volume: 1e6 },
    { sector: '白酒', change: 1.8, volume: 2e6 },
    { sector: '新能源', change: -1.2, volume: 3e6 },
    { sector: '新能源', change: 0.5, volume: 1.5e6 },
    { sector: '半导体', change: 3.0, volume: 5e5 },
  ];

  it('应该按行业分组', () => {
    const groups = aggregateByField(records, 'sector');
    expect(groups.size).toBe(3);
    expect(groups.get('白酒')).toHaveLength(2);
    expect(groups.get('新能源')).toHaveLength(2);
  });

  it('应该计算分组求和', () => {
    expect(calcGroupSum([1, 2, 3])).toBe(6);
    expect(calcGroupSum([])).toBe(0);
  });

  it('应该计算分组平均', () => {
    expect(calcGroupAvg([10, 20, 30])).toBe(20);
    expect(calcGroupAvg([])).toBe(0);
  });

  it('应该计算分组最大值', () => {
    expect(calcGroupMax([3, 1, 4, 1, 5])).toBe(5);
  });

  it('应该计算分组最小值', () => {
    expect(calcGroupMin([3, 1, 4, 1, 5])).toBe(1);
  });

  it('应该计算行业平均涨跌幅', () => {
    const groups = aggregateByField(records, 'sector');
    const baijiu = groups.get('白酒')!;
    const avgChange = calcGroupAvg(baijiu.map(r => r.change));
    expect(avgChange).toBeCloseTo(2.15);
  });
});
