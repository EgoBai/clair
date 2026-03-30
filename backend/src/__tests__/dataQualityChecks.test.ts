import { describe, it, expect } from 'vitest';

// ===== 数据质量检查引擎测试 =====

interface QuoteRecord { symbol: string; name: string; price: number; open: number; high: number; low: number; close: number; prevClose: number; volume: number; amount: number; change: number; changePercent: number; turnover: number; pe: number; pb: number; marketCap: number; timestamp: number; }

function validateQuote(r: QuoteRecord): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!r.symbol || !/^[036]\d{5}$/.test(r.symbol)) errors.push('invalid_symbol');
  if (r.price <= 0) errors.push('invalid_price');
  if (r.high < r.low) errors.push('high_lt_low');
  if (r.high < r.open || r.high < r.close) errors.push('high_lt_ohlc');
  if (r.low > r.open || r.low > r.close) errors.push('low_gt_ohlc');
  if (r.volume < 0) errors.push('negative_volume');
  if (r.amount < 0) errors.push('negative_amount');
  if (r.volume > 0 && r.amount > 0) {
    const avgPrice = r.amount / r.volume;
    if (Math.abs(avgPrice - r.price) / r.price > 0.5) errors.push('volume_amount_mismatch');
  }
  if (r.prevClose > 0) {
    const expectedChange = r.close - r.prevClose;
    const expectedPct = (expectedChange / r.prevClose) * 100;
    if (Math.abs(r.changePercent - expectedPct) > 0.1) errors.push('change_pct_mismatch');
  }
  if (r.marketCap < 0) errors.push('negative_marketcap');
  if (r.pe < 0 && r.pe !== -1) errors.push('invalid_pe'); // -1 = N/A
  if (r.pb < 0 && r.pb !== -1) errors.push('invalid_pb');
  return { valid: errors.length === 0, errors };
}

function detectDuplicateQuotes(records: QuoteRecord[]): QuoteRecord[] {
  const seen = new Map<string, QuoteRecord>();
  const duplicates: QuoteRecord[] = [];
  for (const r of records) {
    const key = `${r.symbol}_${r.timestamp}`;
    if (seen.has(key)) duplicates.push(r);
    else seen.set(key, r);
  }
  return duplicates;
}

function fillMissingFields(r: Partial<QuoteRecord>): QuoteRecord {
  return {
    symbol: r.symbol || 'UNKNOWN',
    name: r.name || '',
    price: r.price ?? 0,
    open: r.open ?? r.price ?? 0,
    high: r.high ?? r.price ?? 0,
    low: r.low ?? r.price ?? 0,
    close: r.close ?? r.price ?? 0,
    prevClose: r.prevClose ?? 0,
    volume: r.volume ?? 0,
    amount: r.amount ?? 0,
    change: r.change ?? 0,
    changePercent: r.changePercent ?? 0,
    turnover: r.turnover ?? 0,
    pe: r.pe ?? 0,
    pb: r.pb ?? 0,
    marketCap: r.marketCap ?? 0,
    timestamp: r.timestamp ?? Date.now(),
  };
}

function calculateDataCompleteness(records: QuoteRecord[]): { total: number; complete: number; missing: Record<string, number> } {
  const requiredFields: (keyof QuoteRecord)[] = ['symbol', 'name', 'price', 'volume', 'amount', 'marketCap'];
  const missing: Record<string, number> = {};
  let complete = 0;
  for (const r of records) {
    let isComplete = true;
    for (const f of requiredFields) {
      if (r[f] === undefined || r[f] === null || (typeof r[f] === 'number' && isNaN(r[f] as number))) {
        missing[f] = (missing[f] || 0) + 1;
        isComplete = false;
      }
    }
    if (isComplete) complete++;
  }
  return { total: records.length, complete, missing };
}

describe('数据质量检查', () => {
  const validQuote: QuoteRecord = {
    symbol: '600519', name: '贵州茅台', price: 1900, open: 1890, high: 1920, low: 1880,
    close: 1900, prevClose: 1885, volume: 5000000, amount: 9.5e9,
    change: 15, changePercent: 0.795, turnover: 0.4, pe: 45, pb: 12,
    marketCap: 2.4e12, timestamp: Date.now(),
  };

  describe('行情记录校验', () => {
    it('有效记录通过校验', () => {
      expect(validateQuote(validQuote).valid).toBe(true);
    });

    it('无效股票代码', () => {
      expect(validateQuote({ ...validQuote, symbol: 'INVALID' }).errors).toContain('invalid_symbol');
    });

    it('价格为0无效', () => {
      expect(validateQuote({ ...validQuote, price: 0 }).errors).toContain('invalid_price');
    });

    it('最高价低于最低价', () => {
      expect(validateQuote({ ...validQuote, high: 1800, low: 1900 }).errors).toContain('high_lt_low');
    });

    it('最高价低于开盘价', () => {
      expect(validateQuote({ ...validQuote, high: 1880 }).errors).toContain('high_lt_ohlc');
    });

    it('最低价高于收盘价', () => {
      expect(validateQuote({ ...validQuote, low: 1950 }).errors).toContain('low_gt_ohlc');
    });

    it('负成交量', () => {
      expect(validateQuote({ ...validQuote, volume: -100 }).errors).toContain('negative_volume');
    });

    it('负成交额', () => {
      expect(validateQuote({ ...validQuote, amount: -1 }).errors).toContain('negative_amount');
    });

    it('涨跌幅不匹配', () => {
      expect(validateQuote({ ...validQuote, changePercent: 999 }).errors).toContain('change_pct_mismatch');
    });

    it('负市值', () => {
      expect(validateQuote({ ...validQuote, marketCap: -1 }).errors).toContain('negative_marketcap');
    });

    it('PE=-1视为N/A可接受', () => {
      expect(validateQuote({ ...validQuote, pe: -1 }).valid).toBe(true);
    });

    it('多错误同时报告', () => {
      const r = validateQuote({ ...validQuote, price: 0, volume: -1, high: 100, low: 200 });
      expect(r.errors.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('重复检测', () => {
    it('无重复记录', () => {
      expect(detectDuplicateQuotes([validQuote])).toHaveLength(0);
    });

    it('检测同symbol同时间戳重复', () => {
      const dup = { ...validQuote };
      expect(detectDuplicateQuotes([validQuote, dup])).toHaveLength(1);
    });

    it('同symbol不同时间不重复', () => {
      const r2 = { ...validQuote, timestamp: validQuote.timestamp + 1000 };
      expect(detectDuplicateQuotes([validQuote, r2])).toHaveLength(0);
    });

    it('不同symbol同时间不重复', () => {
      const r2 = { ...validQuote, symbol: '000858' };
      expect(detectDuplicateQuotes([validQuote, r2])).toHaveLength(0);
    });

    it('空数组无重复', () => {
      expect(detectDuplicateQuotes([])).toHaveLength(0);
    });
  });

  describe('缺失字段填充', () => {
    it('完全空对象填充默认值', () => {
      const r = fillMissingFields({});
      expect(r.symbol).toBe('UNKNOWN');
      expect(r.price).toBe(0);
    });

    it('部分字段保留原值', () => {
      const r = fillMissingFields({ symbol: '600519', price: 1900 });
      expect(r.symbol).toBe('600519');
      expect(r.price).toBe(1900);
      expect(r.volume).toBe(0);
    });

    it('开盘价默认用价格', () => {
      const r = fillMissingFields({ price: 100 });
      expect(r.open).toBe(100);
      expect(r.high).toBe(100);
      expect(r.low).toBe(100);
    });
  });

  describe('数据完整性统计', () => {
    it('完整记录全部计入', () => {
      const r = calculateDataCompleteness([validQuote, validQuote]);
      expect(r.complete).toBe(2);
      expect(r.total).toBe(2);
    });

    it('缺失字段被统计', () => {
      const incomplete = { ...validQuote, name: undefined, price: null };
      const r = calculateDataCompleteness([validQuote, incomplete as any]);
      expect(r.complete).toBe(1);
      expect(r.total - r.complete).toBe(1);
      expect(r.missing['name']).toBe(1);
      expect(r.missing['price']).toBe(1);
    });

    it('空数组返回零', () => {
      const r = calculateDataCompleteness([]);
      expect(r.total).toBe(0);
      expect(r.complete).toBe(0);
    });
  });
});
