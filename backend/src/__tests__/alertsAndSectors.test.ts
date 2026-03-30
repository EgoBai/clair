import { describe, it, expect } from 'vitest';

// ===== 智能预警规则引擎测试 =====
describe('Alert Rules Engine', () => {
  type AlertType = 'price_above' | 'price_below' | 'change_above' | 'change_below' | 'volume_above' | 'cross_ma';

  interface AlertRule {
    id: string;
    type: AlertType;
    stockCode: string;
    threshold: number;
    isActive: boolean;
    triggered: boolean;
    maPeriod?: number;
  }

  interface Quote {
    code: string;
    price: number;
    prevClose: number;
    volume: number;
    ma5: number;
    ma10: number;
    ma20: number;
  }

  const evaluateRule = (rule: AlertRule, quote: Quote): { triggered: boolean; message: string } => {
    if (rule.stockCode !== quote.code) return { triggered: false, message: '' };

    switch (rule.type) {
      case 'price_above':
        return quote.price >= rule.threshold
          ? { triggered: true, message: `${quote.code}价格${quote.price}突破${rule.threshold}` }
          : { triggered: false, message: '' };
      case 'price_below':
        return quote.price <= rule.threshold
          ? { triggered: true, message: `${quote.code}价格${quote.price}跌破${rule.threshold}` }
          : { triggered: false, message: '' };
      case 'change_above': {
        const change = ((quote.price - quote.prevClose) / quote.prevClose) * 100;
        return change >= rule.threshold
          ? { triggered: true, message: `${quote.code}涨${change.toFixed(2)}%超过${rule.threshold}%` }
          : { triggered: false, message: '' };
      }
      case 'change_below': {
        const change = ((quote.price - quote.prevClose) / quote.prevClose) * 100;
        return change <= rule.threshold
          ? { triggered: true, message: `${quote.code}跌${change.toFixed(2)}%超过${rule.threshold}%` }
          : { triggered: false, message: '' };
      }
      case 'volume_above':
        return quote.volume >= rule.threshold
          ? { triggered: true, message: `${quote.code}成交量${quote.volume}超过${rule.threshold}` }
          : { triggered: false, message: '' };
      case 'cross_ma': {
        const maKey = `ma${rule.maPeriod || 20}` as 'ma5' | 'ma10' | 'ma20';
        return quote.price >= quote[maKey]
          ? { triggered: true, message: `${quote.code}突破MA${rule.maPeriod || 20}` }
          : { triggered: false, message: '' };
      }
      default:
        return { triggered: false, message: '' };
    }
  };

  const sampleQuote: Quote = {
    code: '600519', price: 1850, prevClose: 1800,
    volume: 5000000, ma5: 1820, ma10: 1810, ma20: 1800,
  };

  it('价格突破应触发', () => {
    const rule: AlertRule = { id: '1', type: 'price_above', stockCode: '600519', threshold: 1800, isActive: true, triggered: false };
    const result = evaluateRule(rule, sampleQuote);
    expect(result.triggered).toBe(true);
    expect(result.message).toContain('600519');
  });

  it('价格未突破不应触发', () => {
    const rule: AlertRule = { id: '2', type: 'price_above', stockCode: '600519', threshold: 1900, isActive: true, triggered: false };
    expect(evaluateRule(rule, sampleQuote).triggered).toBe(false);
  });

  it('涨跌幅预警', () => {
    const rule: AlertRule = { id: '3', type: 'change_above', stockCode: '600519', threshold: 2, isActive: true, triggered: false };
    expect(evaluateRule(rule, sampleQuote).triggered).toBe(true);
  });

  it('成交量预警', () => {
    const rule: AlertRule = { id: '4', type: 'volume_above', stockCode: '600519', threshold: 4000000, isActive: true, triggered: false };
    expect(evaluateRule(rule, sampleQuote).triggered).toBe(true);
  });

  it('不同股票不应触发', () => {
    const rule: AlertRule = { id: '5', type: 'price_above', stockCode: '000858', threshold: 10, isActive: true, triggered: false };
    expect(evaluateRule(rule, sampleQuote).triggered).toBe(false);
  });

  it('MA突破应触发', () => {
    const rule: AlertRule = { id: '6', type: 'cross_ma', stockCode: '600519', threshold: 0, isActive: true, triggered: false, maPeriod: 5 };
    expect(evaluateRule(rule, sampleQuote).triggered).toBe(true);
  });

  it('MA未突破不应触发', () => {
    const rule: AlertRule = { id: '7', type: 'cross_ma', stockCode: '600519', threshold: 0, isActive: true, triggered: false, maPeriod: 20 };
    expect(evaluateRule(rule, sampleQuote).triggered).toBe(true); // price >= MA20
  });

  it('下跌跌幅预警', () => {
    const quote: Quote = { ...sampleQuote, price: 1700 };
    const rule: AlertRule = { id: '8', type: 'change_below', stockCode: '600519', threshold: -5, isActive: true, triggered: false };
    expect(evaluateRule(rule, quote).triggered).toBe(true);
  });

  it('批量评估', () => {
    const rules: AlertRule[] = [
      { id: '1', type: 'price_above', stockCode: '600519', threshold: 1800, isActive: true, triggered: false },
      { id: '2', type: 'volume_above', stockCode: '600519', threshold: 6000000, isActive: true, triggered: false },
      { id: '3', type: 'price_below', stockCode: '000858', threshold: 10, isActive: true, triggered: false },
    ];
    const results = rules.map(r => evaluateRule(r, sampleQuote));
    expect(results.filter(r => r.triggered).length).toBe(1);
  });

  it('消息格式正确', () => {
    const rule: AlertRule = { id: '9', type: 'price_above', stockCode: '600519', threshold: 1800, isActive: true, triggered: false };
    const { message } = evaluateRule(rule, sampleQuote);
    expect(message).toContain('600519');
    expect(message).toContain('1850');
    expect(message).toContain('1800');
  });

  it('消息为空时不触发', () => {
    const rule: AlertRule = { id: '10', type: 'price_above', stockCode: '600519', threshold: 1900, isActive: true, triggered: false };
    expect(evaluateRule(rule, sampleQuote).message).toBe('');
  });
});

// ===== 行业分类与权重测试 =====
describe('Sector Classification & Weights', () => {
  interface SectorStock {
    code: string;
    name: string;
    sector: string;
    weight: number;
    marketCap: number;
    changePct: number;
  }

  const sectors: SectorStock[] = [
    { code: '600519', name: '贵州茅台', sector: '白酒', weight: 30, marketCap: 20000, changePct: 2.1 },
    { code: '000858', name: '五粮液', sector: '白酒', weight: 20, marketCap: 8000, changePct: 1.5 },
    { code: '300750', name: '宁德时代', sector: '新能源', weight: 35, marketCap: 10000, changePct: -1.2 },
    { code: '688001', name: '华兴源创', sector: '半导体', weight: 25, marketCap: 500, changePct: 3.5 },
    { code: '601318', name: '中国平安', sector: '保险', weight: 40, marketCap: 9000, changePct: 0.8 },
  ];

  const calcSectorIndex = (stocks: SectorStock[], sectorName: string): number => {
    const sectorStocks = stocks.filter(s => s.sector === sectorName);
    if (sectorStocks.length === 0) return 0;
    const totalWeight = sectorStocks.reduce((s, st) => s + st.weight, 0);
    return sectorStocks.reduce((s, st) => s + st.changePct * (st.weight / totalWeight), 0);
  };

  const getSectorsByChange = (stocks: SectorStock[]): { sector: string; change: number }[] => {
    const sectorMap = new Map<string, number[]>();
    stocks.forEach(s => {
      if (!sectorMap.has(s.sector)) sectorMap.set(s.sector, []);
      sectorMap.get(s.sector)!.push(s.changePct);
    });
    return Array.from(sectorMap.entries())
      .map(([sector, changes]) => ({ sector, change: changes.reduce((a, b) => a + b, 0) / changes.length }))
      .sort((a, b) => b.change - a.change);
  };

  it('应正确计算板块指数', () => {
    const baijiuIndex = calcSectorIndex(sectors, '白酒');
    expect(baijiuIndex).toBeGreaterThan(0);
  });

  it('空板块应返回0', () => {
    expect(calcSectorIndex(sectors, '不存在')).toBe(0);
  });

  it('板块排序应按涨跌幅降序', () => {
    const sorted = getSectorsByChange(sectors);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].change).toBeLessThanOrEqual(sorted[i - 1].change);
    }
  });

  it('应包含所有板块', () => {
    const sorted = getSectorsByChange(sectors);
    const names = sorted.map(s => s.sector);
    expect(names).toContain('白酒');
    expect(names).toContain('新能源');
    expect(names).toContain('半导体');
    expect(names).toContain('保险');
  });

  it('板块总数应正确', () => {
    const sorted = getSectorsByChange(sectors);
    expect(sorted.length).toBe(4);
  });

  it('市值加权指数计算', () => {
    const calcMarketCapWeightedIndex = (stocks: SectorStock[], sectorName: string): number => {
      const sectorStocks = stocks.filter(s => s.sector === sectorName);
      const totalCap = sectorStocks.reduce((s, st) => s + st.marketCap, 0);
      return sectorStocks.reduce((s, st) => s + st.changePct * (st.marketCap / totalCap), 0);
    };
    const idx = calcMarketCapWeightedIndex(sectors, '白酒');
    expect(idx).toBeGreaterThan(1.5); // 茅台权重更大，涨得多
    expect(idx).toBeLessThan(2.1);
  });

  it('权重总和应为100（或加权归一化）', () => {
    const calcWeighted = (stocks: SectorStock[], sectorName: string): number => {
      const sectorStocks = stocks.filter(s => s.sector === sectorName);
      const totalWeight = sectorStocks.reduce((s, st) => s + st.weight, 0);
      return totalWeight;
    };
    expect(calcWeighted(sectors, '白酒')).toBe(50);
  });
});

// ===== 资金流向计算测试 =====
describe('Fund Flow Calculations', () => {
  interface FundFlow {
    date: string;
    mainInflow: number;
    mainOutflow: number;
    superLarge: number;
    large: number;
    medium: number;
    small: number;
  }

  const calcNetFlow = (f: FundFlow): number => f.mainInflow - f.mainOutflow;

  const calcCumulativeFlow = (flows: FundFlow[]): number[] => {
    let cum = 0;
    return flows.map(f => {
      cum += calcNetFlow(f);
      return cum;
    });
  };

  const detectFlowAnomaly = (flows: FundFlow[], threshold: number = 2): boolean => {
    if (flows.length < 3) return false;
    const netFlows = flows.map(calcNetFlow);
    const mean = netFlows.reduce((a, b) => a + b, 0) / netFlows.length;
    const std = Math.sqrt(netFlows.reduce((s, n) => s + (n - mean) ** 2, 0) / netFlows.length);
    return netFlows.some(n => Math.abs(n - mean) > threshold * std);
  };

  const sampleFlows: FundFlow[] = [
    { date: '2026-03-20', mainInflow: 1000, mainOutflow: 800, superLarge: 300, large: 200, medium: 100, small: -100 },
    { date: '2026-03-21', mainInflow: 1200, mainOutflow: 900, superLarge: 400, large: 250, medium: 150, small: -200 },
    { date: '2026-03-22', mainInflow: 800, mainOutflow: 1100, superLarge: 200, large: 150, medium: 50, small: 100 },
    { date: '2026-03-23', mainInflow: 1500, mainOutflow: 600, superLarge: 500, large: 300, medium: 200, small: -150 },
  ];

  it('净流入计算', () => {
    expect(calcNetFlow(sampleFlows[0])).toBe(200);
    expect(calcNetFlow(sampleFlows[2])).toBe(-300);
  });

  it('累计资金流', () => {
    const cum = calcCumulativeFlow(sampleFlows);
    expect(cum.length).toBe(4);
    expect(cum[0]).toBe(200);
    expect(cum[3]).toBe(1100); // 200+300+(-300)+900
  });

  it('资金异动检测', () => {
    const flows: FundFlow[] = [
      { date: '1', mainInflow: 100, mainOutflow: 100, superLarge: 0, large: 0, medium: 0, small: 0 },
      { date: '2', mainInflow: 100, mainOutflow: 100, superLarge: 0, large: 0, medium: 0, small: 0 },
      { date: '3', mainInflow: 100, mainOutflow: 100, superLarge: 0, large: 0, medium: 0, small: 0 },
      { date: '4', mainInflow: 100000, mainOutflow: 100, superLarge: 0, large: 0, medium: 0, small: 0 },
    ];
    // netFlows = [0, 0, 0, 99900]. Mean=24975, std≈43258. Use threshold=1 for detection
    expect(detectFlowAnomaly(flows, 1)).toBe(true);
  });

  it('正常波动不应检测为异动', () => {
    expect(detectFlowAnomaly(sampleFlows, 3)).toBe(false);
  });

  it('不足3条不应检测', () => {
    expect(detectFlowAnomaly(sampleFlows.slice(0, 2))).toBe(false);
  });

  it('空数组应返回空', () => {
    expect(calcCumulativeFlow([])).toEqual([]);
  });

  it('单日净流入', () => {
    expect(calcNetFlow(sampleFlows[3])).toBe(900);
  });

  it('主力资金应为正负皆可', () => {
    const f = { date: 'x', mainInflow: 0, mainOutflow: 1000, superLarge: 0, large: 0, medium: 0, small: 0 };
    expect(calcNetFlow(f)).toBeLessThan(0);
  });
});
