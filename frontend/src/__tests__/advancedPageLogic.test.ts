import { describe, it, expect } from 'vitest';

// Table configuration logic
describe('Table Configuration Logic', () => {
  interface Column<T> {
    key: keyof T; title: string; sortable?: boolean;
    filterable?: boolean; width?: number; align?: 'left' | 'center' | 'right';
    render?: (value: any, record: T) => string;
  }

  const createTableConfig = <T extends Record<string, any>>(
    columns: Column<T>[],
    data: T[],
    options: { defaultSort?: keyof T; defaultOrder?: 'asc' | 'desc'; pageSize?: number } = {}
  ) => {
    const { defaultSort, defaultOrder = 'asc', pageSize = 20 } = options;
    let sorted = [...data];
    if (defaultSort) {
      sorted.sort((a, b) => {
        const va = a[defaultSort], vb = b[defaultSort];
        if (va === vb) return 0;
        return defaultOrder === 'asc' ? (va < vb ? -1 : 1) : (va > vb ? -1 : 1);
      });
    }
    return {
      columns,
      data: sorted,
      pageSize,
      totalPages: Math.ceil(sorted.length / pageSize),
      visibleColumns: columns.map(c => c.key),
    };
  };

  const stockColumns: Column<{ code: string; name: string; price: number; change: number; volume: number }>[] = [
    { key: 'code', title: '代码', sortable: true, width: 100 },
    { key: 'name', title: '名称', sortable: true, width: 120 },
    { key: 'price', title: '现价', sortable: true, width: 80, align: 'right' },
    { key: 'change', title: '涨跌幅', sortable: true, width: 80, align: 'right' },
    { key: 'volume', title: '成交量', sortable: true, width: 100, align: 'right' },
  ];

  it('should create table config with columns', () => {
    const config = createTableConfig(stockColumns, []);
    expect(config.columns).toHaveLength(5);
  });

  it('should sort by default sort field', () => {
    const data = [
      { code: '002', name: 'B', price: 20, change: -1, volume: 2000 },
      { code: '001', name: 'A', price: 10, change: 1, volume: 1000 },
    ];
    const config = createTableConfig(stockColumns, data, { defaultSort: 'code' });
    expect(config.data[0].code).toBe('001');
  });

  it('should sort descending', () => {
    const data = [
      { code: '001', name: 'A', price: 10, change: 1, volume: 1000 },
      { code: '002', name: 'B', price: 20, change: -1, volume: 2000 },
    ];
    const config = createTableConfig(stockColumns, data, { defaultSort: 'price', defaultOrder: 'desc' });
    expect(config.data[0].price).toBe(20);
  });

  it('should calculate total pages', () => {
    const data = Array.from({ length: 50 }, (_, i) => ({
      code: `${i}`, name: `Stock ${i}`, price: 10 + i, change: 0, volume: 1000
    }));
    const config = createTableConfig(stockColumns, data, { pageSize: 20 });
    expect(config.totalPages).toBe(3);
  });

  it('should handle custom page size', () => {
    const data = Array.from({ length: 100 }, (_, i) => ({
      code: `${i}`, name: `S${i}`, price: i, change: 0, volume: i
    }));
    const config = createTableConfig(stockColumns, data, { pageSize: 50 });
    expect(config.totalPages).toBe(2);
  });

  it('should track visible columns', () => {
    const config = createTableConfig(stockColumns, []);
    expect(config.visibleColumns).toEqual(['code', 'name', 'price', 'change', 'volume']);
  });

  it('should handle empty data', () => {
    const config = createTableConfig(stockColumns, []);
    expect(config.data).toHaveLength(0);
    expect(config.totalPages).toBe(0);
  });

  it('should not mutate original data', () => {
    const data = [
      { code: '002', name: 'B', price: 20, change: -1, volume: 2000 },
      { code: '001', name: 'A', price: 10, change: 1, volume: 1000 },
    ];
    createTableConfig(stockColumns, data, { defaultSort: 'code' });
    expect(data[0].code).toBe('002');
  });

  it('should handle single row', () => {
    const config = createTableConfig(stockColumns, [
      { code: '001', name: 'A', price: 10, change: 1, volume: 1000 }
    ]);
    expect(config.totalPages).toBe(1);
  });

  it('should identify sortable columns', () => {
    const sortable = stockColumns.filter(c => c.sortable);
    expect(sortable).toHaveLength(5);
  });

  it('should handle columns with alignment', () => {
    const rightAligned = stockColumns.filter(c => c.align === 'right');
    expect(rightAligned).toHaveLength(3);
  });

  it('should handle columns without sort', () => {
    const cols: Column<any>[] = [
      { key: 'a', title: 'A' },
      { key: 'b', title: 'B', sortable: true },
    ];
    const config = createTableConfig(cols, [{ a: 1, b: 2 }]);
    expect(config.columns.filter(c => c.sortable)).toHaveLength(1);
  });
});

// Chart data transformation
describe('Chart Data Transformation', () => {
  const transformKLineForChart = (data: Array<{
    date: string; open: number; close: number; high: number; low: number; volume: number;
  }>) => {
    return data.map((d, i) => {
      const isUp = d.close >= d.open;
      const color = isUp ? '#ef4444' : '#22c55e';
      const bodyHeight = Math.abs(d.close - d.open);
      const upperShadow = d.high - Math.max(d.open, d.close);
      const lowerShadow = Math.min(d.open, d.close) - d.low;
      const prevClose = i > 0 ? data[i - 1].close : d.open;
      const change = d.close - prevClose;
      const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;

      return {
        x: d.date,
        o: d.open, c: d.close, h: d.high, l: d.low, v: d.volume,
        color, isUp, bodyHeight, upperShadow, lowerShadow,
        change, changePercent,
        volumeColor: change >= 0 ? '#ef444440' : '#22c55e40',
      };
    });
  };

  const computeBollingerBands = (closes: number[], period = 20, multiplier = 2) => {
    const result: Array<{ upper: number; middle: number; lower: number }> = [];
    for (let i = 0; i < closes.length; i++) {
      if (i < period - 1) {
        result.push({ upper: 0, middle: 0, lower: 0 });
        continue;
      }
      const slice = closes.slice(i - period + 1, i + 1);
      const mean = slice.reduce((s, v) => s + v, 0) / period;
      const variance = slice.reduce((s, v) => s + (v - mean) ** 2, 0) / period;
      const std = Math.sqrt(variance);
      result.push({
        upper: mean + multiplier * std,
        middle: mean,
        lower: mean - multiplier * std,
      });
    }
    return result;
  };

  const computeRSI = (closes: number[], period = 14) => {
    const result: number[] = [];
    for (let i = 0; i < closes.length; i++) {
      if (i < period) { result.push(50); continue; }
      let gains = 0, losses = 0;
      for (let j = i - period + 1; j <= i; j++) {
        const change = closes[j] - closes[j - 1];
        if (change > 0) gains += change;
        else losses -= change;
      }
      const avgGain = gains / period;
      const avgLoss = losses / period;
      if (avgLoss === 0) { result.push(100); continue; }
      const rs = avgGain / avgLoss;
      result.push(100 - 100 / (1 + rs));
    }
    return result;
  };

  describe('KLine Transform', () => {
    it('should transform bullish candle', () => {
      const result = transformKLineForChart([
        { date: '2024-01-01', open: 10, close: 12, high: 13, low: 9, volume: 1000 }
      ]);
      expect(result[0].isUp).toBe(true);
      expect(result[0].color).toBe('#ef4444');
      expect(result[0].bodyHeight).toBe(2);
    });

    it('should transform bearish candle', () => {
      const result = transformKLineForChart([
        { date: '2024-01-01', open: 12, close: 10, high: 13, low: 9, volume: 1000 }
      ]);
      expect(result[0].isUp).toBe(false);
      expect(result[0].color).toBe('#22c55e');
    });

    it('should calculate shadows', () => {
      const result = transformKLineForChart([
        { date: '2024-01-01', open: 10, close: 12, high: 15, low: 8, volume: 1000 }
      ]);
      expect(result[0].upperShadow).toBe(3);
      expect(result[0].lowerShadow).toBe(2);
    });

    it('should calculate change from prev close', () => {
      const result = transformKLineForChart([
        { date: '2024-01-01', open: 10, close: 10, high: 10, low: 10, volume: 0 },
        { date: '2024-01-02', open: 10, close: 12, high: 12, low: 10, volume: 1000 },
      ]);
      expect(result[1].change).toBe(2);
      expect(result[1].changePercent).toBe(20);
    });

    it('should handle first candle', () => {
      const result = transformKLineForChart([
        { date: '2024-01-01', open: 10, close: 12, high: 13, low: 9, volume: 1000 }
      ]);
      expect(result[0].change).toBe(2);
    });

    it('should handle empty data', () => {
      expect(transformKLineForChart([])).toEqual([]);
    });

    it('should handle doji', () => {
      const result = transformKLineForChart([
        { date: '2024-01-01', open: 10, close: 10, high: 11, low: 9, volume: 1000 }
      ]);
      expect(result[0].bodyHeight).toBe(0);
      expect(result[0].isUp).toBe(true);
    });

    it('should generate volume color', () => {
      const result = transformKLineForChart([
        { date: '2024-01-01', open: 10, close: 10, high: 10, low: 10, volume: 0 },
        { date: '2024-01-02', open: 10, close: 12, high: 12, low: 10, volume: 1000 },
        { date: '2024-01-03', open: 12, close: 10, high: 12, low: 10, volume: 1000 },
      ]);
      expect(result[1].volumeColor).toContain('ef4444');
      expect(result[2].volumeColor).toContain('22c55e');
    });

    it('should handle many candles', () => {
      const data = Array.from({ length: 250 }, (_, i) => ({
        date: `2024-${String(i + 1).padStart(3, '0')}`,
        open: 100 + i, close: 100 + i + 1, high: 100 + i + 2, low: 100 + i - 1, volume: 1000
      }));
      const result = transformKLineForChart(data);
      expect(result).toHaveLength(250);
    });
  });

  describe('Bollinger Bands', () => {
    it('should compute upper > middle > lower', () => {
      const closes = Array.from({ length: 30 }, (_, i) => 100 + i * 0.5);
      const bands = computeBollingerBands(closes);
      const last = bands[bands.length - 1];
      expect(last.upper).toBeGreaterThan(last.middle);
      expect(last.middle).toBeGreaterThan(last.lower);
    });

    it('should have zero bands before period', () => {
      const bands = computeBollingerBands([1, 2, 3], 5);
      expect(bands[0].upper).toBe(0);
    });

    it('should handle flat data', () => {
      const closes = Array(30).fill(100);
      const bands = computeBollingerBands(closes);
      const last = bands[bands.length - 1];
      expect(last.upper).toBe(100);
      expect(last.lower).toBe(100);
    });

    it('should handle empty data', () => {
      expect(computeBollingerBands([])).toEqual([]);
    });

    it('should handle custom multiplier', () => {
      const closes = Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i) * 10);
      const bands1 = computeBollingerBands(closes, 20, 1);
      const bands2 = computeBollingerBands(closes, 20, 3);
      const last1 = bands1[bands1.length - 1];
      const last2 = bands2[bands2.length - 1];
      expect(last2.upper - last2.lower).toBeGreaterThan(last1.upper - last1.lower);
    });

    it('should compute for period equal to data length', () => {
      const closes = Array.from({ length: 20 }, (_, i) => 100 + i);
      const bands = computeBollingerBands(closes, 20);
      const last = bands[bands.length - 1];
      expect(last.middle).toBeGreaterThan(0);
    });
  });

  describe('RSI', () => {
    it('should return 100 for all gains', () => {
      const closes = Array.from({ length: 20 }, (_, i) => i);
      const rsi = computeRSI(closes);
      expect(rsi[rsi.length - 1]).toBe(100);
    });

    it('should return 0 for all losses', () => {
      const closes = Array.from({ length: 20 }, (_, i) => 20 - i);
      const rsi = computeRSI(closes);
      expect(rsi[rsi.length - 1]).toBe(0);
    });

    it('should return 50 for initial period', () => {
      const rsi = computeRSI([1, 2, 3, 4, 5], 14);
      expect(rsi[0]).toBe(50);
    });

    it('should be in 0-100 range', () => {
      const closes = Array.from({ length: 50 }, (_, i) => 100 + 10 * Math.sin(i * 0.5));
      const rsi = computeRSI(closes);
      for (const r of rsi) {
        expect(r).toBeGreaterThanOrEqual(0);
        expect(r).toBeLessThanOrEqual(100);
      }
    });

    it('should handle empty data', () => {
      expect(computeRSI([])).toEqual([]);
    });

    it('should handle flat prices', () => {
      const rsi = computeRSI(Array(20).fill(100), 14);
      expect(rsi[19]).toBe(100);
    });

    it('should handle custom period', () => {
      const closes = Array.from({ length: 20 }, (_, i) => i % 2 === 0 ? 100 : 99);
      const rsi = computeRSI(closes, 5);
      expect(rsi).toHaveLength(20);
    });
  });
});

// Form state management
describe('Form State Management', () => {
  interface FormField {
    value: string; error: string; touched: boolean; dirty: boolean;
  }

  const createFormState = (initial: Record<string, string>) => {
    const fields: Record<string, FormField> = {};
    for (const [key, value] of Object.entries(initial)) {
      fields[key] = { value, error: '', touched: false, dirty: false };
    }
    return {
      fields,
      isValid: true,
      isDirty: false,
      touchedCount: 0,
      updateField: (key: string, value: string) => {
        if (fields[key]) {
          fields[key] = { ...fields[key], value, dirty: value !== initial[key] };
        }
      },
      touchField: (key: string) => {
        if (fields[key]) {
          fields[key] = { ...fields[key], touched: true };
        }
      },
      setFieldError: (key: string, error: string) => {
        if (fields[key]) {
          fields[key] = { ...fields[key], error };
        }
      },
      validate: (rules: Record<string, (v: string) => string>) => {
        let valid = true;
        for (const [key, rule] of Object.entries(rules)) {
          if (fields[key]) {
            const error = rule(fields[key].value);
            fields[key] = { ...fields[key], error, touched: true };
            if (error) valid = false;
          }
        }
        return valid;
      },
      reset: () => {
        for (const [key, value] of Object.entries(initial)) {
          fields[key] = { value, error: '', touched: false, dirty: false };
        }
      },
      getValues: () => {
        const result: Record<string, string> = {};
        for (const [key, field] of Object.entries(fields)) {
          result[key] = field.value;
        }
        return result;
      },
    };
  };

  it('should create form with initial values', () => {
    const form = createFormState({ name: '', email: '' });
    expect(form.fields['name'].value).toBe('');
    expect(form.fields['email'].value).toBe('');
  });

  it('should update field value', () => {
    const form = createFormState({ name: '' });
    form.updateField('name', 'John');
    expect(form.fields['name'].value).toBe('John');
  });

  it('should mark field as dirty', () => {
    const form = createFormState({ name: 'original' });
    form.updateField('name', 'changed');
    expect(form.fields['name'].dirty).toBe(true);
  });

  it('should not mark same value as dirty', () => {
    const form = createFormState({ name: 'same' });
    form.updateField('name', 'same');
    expect(form.fields['name'].dirty).toBe(false);
  });

  it('should touch field', () => {
    const form = createFormState({ name: '' });
    form.touchField('name');
    expect(form.fields['name'].touched).toBe(true);
  });

  it('should set field error', () => {
    const form = createFormState({ name: '' });
    form.setFieldError('name', 'Required');
    expect(form.fields['name'].error).toBe('Required');
  });

  it('should validate with rules', () => {
    const form = createFormState({ name: '', email: 'test@test.com' });
    const valid = form.validate({
      name: v => v ? '' : 'Name is required',
      email: v => v.includes('@') ? '' : 'Invalid email',
    });
    expect(valid).toBe(false);
    expect(form.fields['name'].error).toBe('Name is required');
    expect(form.fields['email'].error).toBe('');
  });

  it('should return valid when all rules pass', () => {
    const form = createFormState({ name: 'John', email: 'a@b.com' });
    const valid = form.validate({
      name: v => v ? '' : 'Required',
      email: v => v.includes('@') ? '' : 'Invalid',
    });
    expect(valid).toBe(true);
  });

  it('should touch all fields on validate', () => {
    const form = createFormState({ name: 'John' });
    form.validate({ name: () => '' });
    expect(form.fields['name'].touched).toBe(true);
  });

  it('should reset to initial values', () => {
    const form = createFormState({ name: 'initial' });
    form.updateField('name', 'changed');
    form.touchField('name');
    form.setFieldError('name', 'error');
    form.reset();
    expect(form.fields['name'].value).toBe('initial');
    expect(form.fields['name'].dirty).toBe(false);
    expect(form.fields['name'].touched).toBe(false);
    expect(form.fields['name'].error).toBe('');
  });

  it('should get all values', () => {
    const form = createFormState({ a: '1', b: '2' });
    form.updateField('a', '10');
    const values = form.getValues();
    expect(values).toEqual({ a: '10', b: '2' });
  });

  it('should handle non-existent field update', () => {
    const form = createFormState({ name: '' });
    form.updateField('nonexistent', 'value');
    expect(form.fields['nonexistent']).toBeUndefined();
  });

  it('should handle multiple fields validation', () => {
    const form = createFormState({ a: '', b: '', c: 'filled' });
    form.validate({
      a: v => v ? '' : 'Required',
      b: v => v ? '' : 'Required',
      c: v => v ? '' : 'Required',
    });
    expect(form.fields['a'].error).toBe('Required');
    expect(form.fields['b'].error).toBe('Required');
    expect(form.fields['c'].error).toBe('');
  });
});

// Search and filter combinations
describe('Search and Filter Combinations', () => {
  interface Stock {
    code: string; name: string; industry: string;
    price: number; marketCap: number; pe: number;
    changePercent: number; volume: number;
  }

  const searchStocks = (stocks: Stock[], query: string) => {
    if (!query) return stocks;
    const q = query.toLowerCase();
    return stocks.filter(s =>
      s.code.toLowerCase().includes(q) ||
      s.name.toLowerCase().includes(q) ||
      s.industry.toLowerCase().includes(q)
    );
  };

  const filterStocks = (stocks: Stock[], filters: {
    industry?: string; minPrice?: number; maxPrice?: number;
    minPE?: number; maxPE?: number; minMarketCap?: number;
  }) => {
    return stocks.filter(s => {
      if (filters.industry && s.industry !== filters.industry) return false;
      if (filters.minPrice !== undefined && s.price < filters.minPrice) return false;
      if (filters.maxPrice !== undefined && s.price > filters.maxPrice) return false;
      if (filters.minPE !== undefined && s.pe < filters.minPE) return false;
      if (filters.maxPE !== undefined && s.pe > filters.maxPE) return false;
      if (filters.minMarketCap !== undefined && s.marketCap < filters.minMarketCap) return false;
      return true;
    });
  };

  const sortStocks = (stocks: Stock[], field: keyof Stock, order: 'asc' | 'desc') => {
    return [...stocks].sort((a, b) => {
      const va = a[field], vb = b[field];
      if (va === vb) return 0;
      const cmp = va < vb ? -1 : 1;
      return order === 'asc' ? cmp : -cmp;
    });
  };

  const mockStocks: Stock[] = [
    { code: '600519', name: '贵州茅台', industry: '白酒', price: 1800, marketCap: 2e12, pe: 35, changePercent: 2.5, volume: 50000 },
    { code: '000858', name: '五粮液', industry: '白酒', price: 150, marketCap: 5e11, pe: 25, changePercent: 1.8, volume: 80000 },
    { code: '000001', name: '平安银行', industry: '银行', price: 12, marketCap: 2e11, pe: 6, changePercent: -0.5, volume: 1e8 },
    { code: '601398', name: '工商银行', industry: '银行', price: 5, marketCap: 1.8e12, pe: 5, changePercent: 0.3, volume: 2e8 },
    { code: '300750', name: '宁德时代', industry: '新能源', price: 200, marketCap: 8e11, pe: 50, changePercent: 3.2, volume: 100000 },
  ];

  it('should search by code', () => {
    const result = searchStocks(mockStocks, '600519');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('贵州茅台');
  });

  it('should search by name', () => {
    const result = searchStocks(mockStocks, '茅台');
    expect(result).toHaveLength(1);
  });

  it('should search by industry', () => {
    const result = searchStocks(mockStocks, '银行');
    expect(result).toHaveLength(2);
  });

  it('should search case insensitive', () => {
    const result = searchStocks(mockStocks, '茅台');
    expect(result).toHaveLength(1);
  });

  it('should return all for empty query', () => {
    expect(searchStocks(mockStocks, '')).toHaveLength(5);
  });

  it('should return empty for no match', () => {
    expect(searchStocks(mockStocks, '不存在')).toHaveLength(0);
  });

  it('should filter by industry', () => {
    const result = filterStocks(mockStocks, { industry: '白酒' });
    expect(result).toHaveLength(2);
  });

  it('should filter by price range', () => {
    const result = filterStocks(mockStocks, { minPrice: 100, maxPrice: 500 });
    expect(result).toHaveLength(2);
  });

  it('should filter by PE range', () => {
    const result = filterStocks(mockStocks, { minPE: 0, maxPE: 10 });
    expect(result).toHaveLength(2);
  });

  it('should filter by min market cap', () => {
    const result = filterStocks(mockStocks, { minMarketCap: 1e12 });
    expect(result).toHaveLength(2);
  });

  it('should combine search and filter', () => {
    const searched = searchStocks(mockStocks, '银行');
    const filtered = filterStocks(searched, { maxPE: 10 });
    expect(filtered).toHaveLength(2);
  });

  it('should sort ascending', () => {
    const result = sortStocks(mockStocks, 'price', 'asc');
    expect(result[0].price).toBe(5);
    expect(result[result.length - 1].price).toBe(1800);
  });

  it('should sort descending', () => {
    const result = sortStocks(mockStocks, 'changePercent', 'desc');
    expect(result[0].changePercent).toBe(3.2);
  });

  it('should sort by name alphabetically', () => {
    const result = sortStocks(mockStocks, 'name', 'asc');
    for (let i = 1; i < result.length; i++) {
      expect(result[i].name.localeCompare(result[i - 1].name)).toBeGreaterThanOrEqual(0);
    }
  });

  it('should not mutate original', () => {
    const original = [...mockStocks];
    sortStocks(mockStocks, 'price', 'desc');
    filterStocks(mockStocks, { industry: '白酒' });
    expect(mockStocks).toEqual(original);
  });

  it('should handle empty stocks', () => {
    expect(searchStocks([], 'test')).toEqual([]);
    expect(filterStocks([], { industry: 'test' })).toEqual([]);
    expect(sortStocks([], 'price', 'asc')).toEqual([]);
  });

  it('should filter with multiple conditions', () => {
    const result = filterStocks(mockStocks, {
      minPrice: 10, maxPrice: 200, minPE: 5, maxPE: 30, industry: '白酒'
    });
    expect(result).toHaveLength(1);
    expect(result[0].code).toBe('000858');
  });
});
