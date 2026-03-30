import { describe, it, expect } from 'vitest';

// 指标计算批量验证测试
describe('Batch Indicator Validation', () => {
  // 生成测试数据
  const generatePrices = (count: number, trend: 'up' | 'down' | 'volatile'): number[] => {
    const prices: number[] = [100];
    for (let i = 1; i < count; i++) {
      let change: number;
      switch (trend) {
        case 'up': change = Math.random() * 2 + 0.5; break;
        case 'down': change = -(Math.random() * 2 + 0.5); break;
        case 'volatile': change = (Math.random() - 0.5) * 4; break;
      }
      prices.push(Math.max(1, prices[i - 1] + change));
    }
    return prices;
  };

  const generateKLines = (count: number) => {
    const prices = generatePrices(count, 'volatile');
    return prices.map((close, i) => {
      const open = i > 0 ? prices[i - 1] : close;
      const high = Math.max(open, close) + Math.random() * 2;
      const low = Math.min(open, close) - Math.random() * 2;
      const volume = Math.floor(Math.random() * 1000000) + 100000;
      return { date: `2026-${String(Math.floor(i / 30) + 1).padStart(2, '0')}-${String((i % 30) + 1).padStart(2, '0')}`, open, high, low, close, volume };
    });
  };

  it('generated prices have correct length', () => {
    expect(generatePrices(100, 'up').length).toBe(100);
    expect(generatePrices(50, 'down').length).toBe(50);
  });

  it('up trend prices generally increase', () => {
    const prices = generatePrices(100, 'up');
    const firstAvg = prices.slice(0, 10).reduce((a, b) => a + b, 0) / 10;
    const lastAvg = prices.slice(-10).reduce((a, b) => a + b, 0) / 10;
    expect(lastAvg).toBeGreaterThan(firstAvg);
  });

  it('down trend prices generally decrease', () => {
    const prices = generatePrices(100, 'down');
    const firstAvg = prices.slice(0, 10).reduce((a, b) => a + b, 0) / 10;
    const lastAvg = prices.slice(-10).reduce((a, b) => a + b, 0) / 10;
    expect(lastAvg).toBeLessThan(firstAvg);
  });

  it('KLine OHLC logic is valid', () => {
    const klines = generateKLines(50);
    klines.forEach(k => {
      expect(k.high).toBeGreaterThanOrEqual(Math.max(k.open, k.close));
      expect(k.low).toBeLessThanOrEqual(Math.min(k.open, k.close));
    });
  });

  it('calculates returns correctly', () => {
    const prices = generatePrices(50, 'volatile');
    const returns = prices.slice(1).map((p, i) => (p - prices[i]) / prices[i]);
    expect(returns.length).toBe(49);
    returns.forEach(r => {
      expect(Number.isFinite(r)).toBe(true);
    });
  });

  it('calculates volatility (standard deviation of returns)', () => {
    const prices = generatePrices(100, 'volatile');
    const returns = prices.slice(1).map((p, i) => (p - prices[i]) / prices[i]);
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length;
    const volatility = Math.sqrt(variance);
    expect(volatility).toBeGreaterThan(0);
    expect(Number.isFinite(volatility)).toBe(true);
  });

  it('cumulative returns sum to total return', () => {
    const prices = [100, 110, 105, 115];
    const returns = prices.slice(1).map((p, i) => (p - prices[i]) / prices[i]);
    const cumulative = (1 + returns[0]) * (1 + returns[1]) * (1 + returns[2]) - 1;
    const total = (prices[prices.length - 1] - prices[0]) / prices[0];
    expect(cumulative).toBeCloseTo(total, 10);
  });
});

// 数据转换管道测试
describe('Data Transform Pipeline', () => {
  interface RawQuote {
    symbol: string; name: string; price: string; change: string;
    changePercent: string; volume: string; amount: string;
    high: string; low: string; open: string; prevClose: string;
  }

  interface ParsedQuote {
    symbol: string; name: string; price: number; change: number;
    changePercent: number; volume: number; amount: number;
    high: number; low: number; open: number; prevClose: number;
    isUp: boolean; isDown: boolean; isFlat: boolean;
  }

  const parseQuote = (raw: RawQuote): ParsedQuote => {
    const price = parseFloat(raw.price);
    const prevClose = parseFloat(raw.prevClose);
    const change = price - prevClose;
    const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;
    return {
      symbol: raw.symbol, name: raw.name,
      price, change, changePercent,
      volume: parseInt(raw.volume, 10),
      amount: parseFloat(raw.amount),
      high: parseFloat(raw.high), low: parseFloat(raw.low),
      open: parseFloat(raw.open), prevClose,
      isUp: change > 0, isDown: change < 0, isFlat: change === 0,
    };
  };

  const raw: RawQuote = {
    symbol: '600519', name: '贵州茅台', price: '1800.50',
    change: '20.50', changePercent: '1.15',
    volume: '1000000', amount: '1800500000',
    high: '1820.00', low: '1780.00', open: '1785.00', prevClose: '1780.00',
  };

  it('parses raw quote correctly', () => {
    const q = parseQuote(raw);
    expect(q.symbol).toBe('600519');
    expect(q.price).toBe(1800.50);
    expect(q.volume).toBe(1000000);
  });

  it('calculates change from price and prevClose', () => {
    const q = parseQuote(raw);
    expect(q.change).toBeCloseTo(20.5, 1);
  });

  it('determines isUp/isDown/isFlat', () => {
    const q = parseQuote(raw);
    expect(q.isUp).toBe(true);
    expect(q.isDown).toBe(false);
    expect(q.isFlat).toBe(false);
  });

  it('handles flat quote', () => {
    const flat: RawQuote = { ...raw, price: raw.prevClose };
    const q = parseQuote(flat);
    expect(q.isFlat).toBe(true);
    expect(q.change).toBeCloseTo(0, 5);
  });

  it('batch parse maintains order', () => {
    const raws: RawQuote[] = [
      { ...raw, symbol: 'A', price: '10', prevClose: '9' },
      { ...raw, symbol: 'B', price: '20', prevClose: '21' },
      { ...raw, symbol: 'C', price: '30', prevClose: '30' },
    ];
    const parsed = raws.map(parseQuote);
    expect(parsed.map(p => p.symbol)).toEqual(['A', 'B', 'C']);
    expect(parsed[0].isUp).toBe(true);
    expect(parsed[1].isDown).toBe(true);
    expect(parsed[2].isFlat).toBe(true);
  });
});

// 行业分类测试
describe('Industry Classification', () => {
  const industries = [
    { name: '白酒', codes: ['600519', '000858', '002304', '000568'] },
    { name: '新能源', codes: ['300750', '002594', '300274'] },
    { name: '半导体', codes: ['688981', '603986', '002049'] },
    { name: '银行', codes: ['601398', '600036', '000001'] },
    { name: '医药', codes: ['600276', '000538', '300760'] },
    { name: '光伏', codes: ['601012', '300274', '002459'] },
    { name: '消费电子', codes: ['002475', '002241', '601231'] },
    { name: '地产', codes: ['000002', '600048', '600383'] },
  ];

  it('has at least 8 industries', () => {
    expect(industries.length).toBeGreaterThanOrEqual(8);
  });

  it('all industries have stocks', () => {
    industries.forEach(ind => {
      expect(ind.codes.length).toBeGreaterThan(0);
    });
  });

  it('industry names are unique', () => {
    const names = industries.map(i => i.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('can find industry for a stock code', () => {
    const findIndustry = (code: string) => industries.find(i => i.codes.includes(code));
    expect(findIndustry('600519')?.name).toBe('白酒');
    expect(findIndustry('300750')?.name).toBe('新能源');
    expect(findIndustry('999999')).toBeUndefined();
  });

  it('total stock count is reasonable', () => {
    const total = industries.reduce((s, i) => s + i.codes.length, 0);
    expect(total).toBeGreaterThanOrEqual(20);
  });
});

// 预警规则逻辑测试
describe('Alert Rule Logic', () => {
  type AlertType = 'price_above' | 'price_below' | 'change_above' | 'change_below' | 'volume_above';

  interface AlertRule {
    id: string;
    symbol: string;
    type: AlertType;
    value: number;
    active: boolean;
    triggered: boolean;
  }

  interface Quote {
    symbol: string;
    price: number;
    changePercent: number;
    volume: number;
  }

  const checkAlert = (rule: AlertRule, quote: Quote): boolean => {
    if (!rule.active || rule.triggered) return false;
    if (rule.symbol !== quote.symbol) return false;
    switch (rule.type) {
      case 'price_above': return quote.price >= rule.value;
      case 'price_below': return quote.price <= rule.value;
      case 'change_above': return quote.changePercent >= rule.value;
      case 'change_below': return quote.changePercent <= rule.value;
      case 'volume_above': return quote.volume >= rule.value;
    }
  };

  const quote: Quote = { symbol: '600519', price: 1800, changePercent: 2.5, volume: 1500000 };

  it('triggers price_above when condition met', () => {
    const rule: AlertRule = { id: '1', symbol: '600519', type: 'price_above', value: 1700, active: true, triggered: false };
    expect(checkAlert(rule, quote)).toBe(true);
  });

  it('does not trigger price_below when price is higher', () => {
    const rule: AlertRule = { id: '1', symbol: '600519', type: 'price_below', value: 1700, active: true, triggered: false };
    expect(checkAlert(rule, quote)).toBe(false);
  });

  it('triggers change_above when condition met', () => {
    const rule: AlertRule = { id: '1', symbol: '600519', type: 'change_above', value: 2.0, active: true, triggered: false };
    expect(checkAlert(rule, quote)).toBe(true);
  });

  it('does not trigger inactive rule', () => {
    const rule: AlertRule = { id: '1', symbol: '600519', type: 'price_above', value: 1700, active: false, triggered: false };
    expect(checkAlert(rule, quote)).toBe(false);
  });

  it('does not trigger already triggered rule', () => {
    const rule: AlertRule = { id: '1', symbol: '600519', type: 'price_above', value: 1700, active: true, triggered: true };
    expect(checkAlert(rule, quote)).toBe(false);
  });

  it('does not trigger for different symbol', () => {
    const rule: AlertRule = { id: '1', symbol: '000858', type: 'price_above', value: 100, active: true, triggered: false };
    expect(checkAlert(rule, quote)).toBe(false);
  });

  it('triggers volume_above when condition met', () => {
    const rule: AlertRule = { id: '1', symbol: '600519', type: 'volume_above', value: 1000000, active: true, triggered: false };
    expect(checkAlert(rule, quote)).toBe(true);
  });

  it('boundary: price equals threshold triggers', () => {
    const rule: AlertRule = { id: '1', symbol: '600519', type: 'price_above', value: 1800, active: true, triggered: false };
    expect(checkAlert(rule, quote)).toBe(true);
  });
});
