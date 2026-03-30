import { describe, it, expect } from 'vitest';

describe('数据质量与ETL管道', () => {
  // 数据清洗
  const cleanStockCode = (code: string): string => {
    return code.replace(/[^0-9]/g, '').padStart(6, '0').slice(-6);
  };

  const cleanStockName = (name: string): string => {
    return name.trim().replace(/\s+/g, '').replace(/[ST*]/g, match => match); // keep ST/* markers
  };

  const detectMarket = (code: string): 'SH' | 'SZ' | 'BJ' | 'UNKNOWN' => {
    const cleaned = cleanStockCode(code);
    if (cleaned.startsWith('6') || cleaned.startsWith('9')) return 'SH';
    if (cleaned.startsWith('0') || cleaned.startsWith('3')) return 'SZ';
    if (cleaned.startsWith('4') || cleaned.startsWith('8')) return 'BJ';
    return 'UNKNOWN';
  };

  describe('数据清洗', () => {
    it('股票代码清洗', () => {
      expect(cleanStockCode('sh600519')).toBe('600519');
    });
    it('补零', () => {
      expect(cleanStockCode('1')).toBe('000001');
    });
    it('截断长代码', () => {
      expect(cleanStockCode('1234567890')).toBe('567890');
    });
    it('名称去空格', () => {
      expect(cleanStockName('  贵州  茅台  ')).toBe('贵州茅台');
    });
    it('保留ST标记', () => {
      expect(cleanStockName('*ST某某')).toBe('*ST某某');
    });
    it('上证识别', () => {
      expect(detectMarket('600519')).toBe('SH');
    });
    it('深证识别', () => {
      expect(detectMarket('000001')).toBe('SZ');
    });
    it('北交所识别', () => {
      expect(detectMarket('430001')).toBe('BJ');
    });
    it('9开头上证', () => {
      expect(detectMarket('900901')).toBe('SH');
    });
    it('3开头深证', () => {
      expect(detectMarket('300001')).toBe('SZ');
    });
  });

  // 数据验证
  interface StockRecord {
    code: string;
    name: string;
    price: number;
    preClose: number;
    high: number;
    low: number;
    open: number;
    volume: number;
    amount: number;
  }

  const validateStockRecord = (record: StockRecord): string[] => {
    const errors: string[] = [];
    if (record.price <= 0) errors.push('price must be positive');
    if (record.high < record.low) errors.push('high must be >= low');
    if (record.high < record.open) errors.push('high must be >= open');
    if (record.high < record.price) errors.push('high must be >= price');
    if (record.low > record.open) errors.push('low must be <= open');
    if (record.low > record.price) errors.push('low must be <= price');
    if (record.volume < 0) errors.push('volume must be non-negative');
    if (record.amount < 0) errors.push('amount must be non-negative');
    if (!/^\d{6}$/.test(record.code)) errors.push('code must be 6 digits');
    return errors;
  };

  describe('数据验证', () => {
    const validRecord: StockRecord = {
      code: '600519', name: '贵州茅台', price: 1800, preClose: 1790,
      high: 1810, low: 1780, open: 1795, volume: 100000, amount: 180000000,
    };

    it('有效记录', () => {
      expect(validateStockRecord(validRecord)).toEqual([]);
    });
    it('负价格', () => {
      expect(validateStockRecord({ ...validRecord, price: -1 })).toContain('price must be positive');
    });
    it('high<low', () => {
      expect(validateStockRecord({ ...validRecord, high: 1700, low: 1800 })).toContain('high must be >= low');
    });
    it('负成交量', () => {
      expect(validateStockRecord({ ...validRecord, volume: -1 })).toContain('volume must be non-negative');
    });
    it('无效代码', () => {
      expect(validateStockRecord({ ...validRecord, code: 'abc' })).toContain('code must be 6 digits');
    });
    it('高<收', () => {
      expect(validateStockRecord({ ...validRecord, high: 1700 })).toContain('high must be >= price');
    });
    it('低>收', () => {
      expect(validateStockRecord({ ...validRecord, low: 1900 })).toContain('low must be <= price');
    });
    it('多错误', () => {
      const errors = validateStockRecord({ ...validRecord, price: -1, volume: -1 });
      expect(errors.length).toBeGreaterThanOrEqual(2);
    });
  });

  // 批量数据处理
  const deduplicateByCode = (records: StockRecord[]): StockRecord[] => {
    const map = new Map<string, StockRecord>();
    for (const r of records) {
      const existing = map.get(r.code);
      if (!existing || r.volume > existing.volume) {
        map.set(r.code, r);
      }
    }
    return Array.from(map.values());
  };

  const sortByField = <T>(data: T[], field: keyof T, dir: 'asc' | 'desc' = 'asc'): T[] => {
    return [...data].sort((a, b) => {
      const va = a[field], vb = b[field];
      if (typeof va === 'number' && typeof vb === 'number') {
        return dir === 'asc' ? va - vb : vb - va;
      }
      return dir === 'asc' ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    });
  };

  const paginate = <T>(data: T[], page: number, pageSize: number): { data: T[]; total: number; totalPages: number } => {
    const total = data.length;
    const totalPages = Math.ceil(total / pageSize);
    const start = (page - 1) * pageSize;
    return { data: data.slice(start, start + pageSize), total, totalPages };
  };

  describe('批量处理', () => {
    it('去重保留最大成交量', () => {
      const records: StockRecord[] = [
        { code: '600519', name: 'A', price: 100, preClose: 99, high: 101, low: 99, open: 100, volume: 100, amount: 10000 },
        { code: '600519', name: 'A', price: 100, preClose: 99, high: 101, low: 99, open: 100, volume: 200, amount: 20000 },
      ];
      expect(deduplicateByCode(records).length).toBe(1);
      expect(deduplicateByCode(records)[0].volume).toBe(200);
    });
    it('不同代码不合并', () => {
      const records: StockRecord[] = [
        { code: '600519', name: 'A', price: 100, preClose: 99, high: 101, low: 99, open: 100, volume: 100, amount: 10000 },
        { code: '000001', name: 'B', price: 10, preClose: 9, high: 11, low: 9, open: 10, volume: 100, amount: 1000 },
      ];
      expect(deduplicateByCode(records).length).toBe(2);
    });
    it('排序升序', () => {
      expect(sortByField([{ v: 3 }, { v: 1 }, { v: 2 }], 'v')).toEqual([{ v: 1 }, { v: 2 }, { v: 3 }]);
    });
    it('排序降序', () => {
      expect(sortByField([{ v: 1 }, { v: 3 }, { v: 2 }], 'v', 'desc')).toEqual([{ v: 3 }, { v: 2 }, { v: 1 }]);
    });
    it('字符串排序', () => {
      expect(sortByField([{ n: 'c' }, { n: 'a' }, { n: 'b' }], 'n')).toEqual([{ n: 'a' }, { n: 'b' }, { n: 'c' }]);
    });
    it('分页-首页', () => {
      const result = paginate([1, 2, 3, 4, 5], 1, 2);
      expect(result.data).toEqual([1, 2]);
      expect(result.totalPages).toBe(3);
    });
    it('分页-末页', () => {
      const result = paginate([1, 2, 3, 4, 5], 3, 2);
      expect(result.data).toEqual([5]);
    });
    it('分页-超出范围', () => {
      const result = paginate([1, 2], 5, 10);
      expect(result.data).toEqual([]);
    });
    it('空数据分页', () => {
      const result = paginate([], 1, 10);
      expect(result.total).toBe(0);
      expect(result.totalPages).toBe(0);
    });
  });

  // 数据转换管道
  type Transform<T> = (data: T) => T;

  const pipeline = <T>(...transforms: Transform<T>[]): Transform<T> => {
    return (data: T) => transforms.reduce((d, t) => t(d), data);
  };

  describe('转换管道', () => {
    it('单步转换', () => {
      const addOne = (n: number) => n + 1;
      expect(pipeline(addOne)(5)).toBe(6);
    });
    it('多步转换', () => {
      const addOne = (n: number) => n + 1;
      const double = (n: number) => n * 2;
      expect(pipeline(addOne, double)(5)).toBe(12);
    });
    it('对象转换', () => {
      const addField = (o: Record<string, unknown>) => ({ ...o, x: 1 });
      const upperField = (o: Record<string, unknown>) => ({ ...o, name: String(o.name).toUpperCase() });
      const result = pipeline(addField, upperField)({ name: 'test' });
      expect(result.x).toBe(1);
      expect(result.name).toBe('TEST');
    });
    it('空管道', () => {
      expect(pipeline()(42)).toBe(42);
    });
    it('数组管道', () => {
      const sort = (a: number[]) => [...a].sort((x, y) => x - y);
      const reverse = (a: number[]) => [...a].reverse();
      expect(pipeline(sort, reverse)([3, 1, 2])).toEqual([3, 2, 1]);
    });
  });

  // 数据聚合
  const aggregateByField = <T extends Record<string, unknown>>(data: T[], field: string, valueField: string, method: 'sum' | 'avg' | 'count' | 'max' | 'min') => {
    const groups = new Map<string, number[]>();
    for (const item of data) {
      const key = String(item[field]);
      const val = Number(item[valueField]);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(val);
    }
    const result: Record<string, number> = {};
    for (const [key, values] of groups) {
      switch (method) {
        case 'sum': result[key] = values.reduce((a, b) => a + b, 0); break;
        case 'avg': result[key] = values.reduce((a, b) => a + b, 0) / values.length; break;
        case 'count': result[key] = values.length; break;
        case 'max': result[key] = Math.max(...values); break;
        case 'min': result[key] = Math.min(...values); break;
      }
    }
    return result;
  };

  describe('数据聚合', () => {
    const data = [
      { sector: 'tech', volume: 100 },
      { sector: 'tech', volume: 200 },
      { sector: 'finance', volume: 300 },
      { sector: 'finance', volume: 400 },
    ];

    it('求和', () => {
      const result = aggregateByField(data, 'sector', 'volume', 'sum');
      expect(result.tech).toBe(300);
      expect(result.finance).toBe(700);
    });
    it('平均', () => {
      const result = aggregateByField(data, 'sector', 'volume', 'avg');
      expect(result.tech).toBe(150);
    });
    it('计数', () => {
      const result = aggregateByField(data, 'sector', 'volume', 'count');
      expect(result.tech).toBe(2);
    });
    it('最大值', () => {
      const result = aggregateByField(data, 'sector', 'volume', 'max');
      expect(result.tech).toBe(200);
    });
    it('最小值', () => {
      const result = aggregateByField(data, 'sector', 'volume', 'min');
      expect(result.finance).toBe(300);
    });
  });

  // 缺失值填充
  const fillMissingValues = (data: (number | null | undefined)[], method: 'zero' | 'mean' | 'median' | 'forward'): number[] => {
    const clean = data.map(d => d ?? null);
    if (method === 'zero') return clean.map(d => d ?? 0);
    if (method === 'forward') {
      const result: number[] = [];
      let last = 0;
      for (const d of clean) {
        if (d !== null) { last = d; result.push(d); }
        else result.push(last);
      }
      return result;
    }
    const valid = clean.filter((d): d is number => d !== null);
    if (valid.length === 0) return clean.map(() => 0);
    if (method === 'mean') {
      const mean = valid.reduce((a, b) => a + b, 0) / valid.length;
      return clean.map(d => d ?? mean);
    }
    // median
    const sorted = [...valid].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
    return clean.map(d => d ?? median);
  };

  describe('缺失值填充', () => {
    it('零填充', () => {
      expect(fillMissingValues([1, null, 3], 'zero')).toEqual([1, 0, 3]);
    });
    it('均值填充', () => {
      const result = fillMissingValues([10, null, 20], 'mean');
      expect(result[1]).toBeCloseTo(15);
    });
    it('中位数填充', () => {
      const result = fillMissingValues([10, null, 20], 'median');
      expect(result[1]).toBeCloseTo(15);
    });
    it('前向填充', () => {
      expect(fillMissingValues([1, null, null, 4], 'forward')).toEqual([1, 1, 1, 4]);
    });
    it('全空零填充', () => {
      expect(fillMissingValues([null, null], 'zero')).toEqual([0, 0]);
    });
    it('前向填充首空', () => {
      expect(fillMissingValues([null, 1, 2], 'forward')).toEqual([0, 1, 2]);
    });
    it('undefined处理', () => {
      expect(fillMissingValues([1, undefined, 3], 'zero')).toEqual([1, 0, 3]);
    });
    it('中位数偶数个', () => {
      const result = fillMissingValues([10, 20, 30, null, 40], 'median');
      expect(result[3]).toBeCloseTo(25);
    });
  });

  // 异常值替换
  const capOutliers = (data: number[], method: 'zscore' | 'iqr', threshold: number = 2): number[] => {
    if (method === 'zscore') {
      const mean = data.reduce((a, b) => a + b, 0) / data.length;
      const std = Math.sqrt(data.reduce((a, b) => a + (b - mean) ** 2, 0) / data.length);
      if (std === 0) return [...data];
      return data.map(d => Math.abs(d - mean) > threshold * std ? (d > mean ? mean + threshold * std : mean - threshold * std) : d);
    }
    // IQR method
    const sorted = [...data].sort((a, b) => a - b);
    const q1 = sorted[Math.floor(sorted.length * 0.25)];
    const q3 = sorted[Math.floor(sorted.length * 0.75)];
    const iqr = q3 - q1;
    const lower = q1 - threshold * iqr;
    const upper = q3 + threshold * iqr;
    return data.map(d => Math.max(lower, Math.min(upper, d)));
  };

  describe('异常值处理', () => {
    it('Z-score截断', () => {
      const result = capOutliers([1, 1, 1, 1, 100], 'zscore', 1);
      expect(result.length).toBe(5);
      expect(result[4]).not.toBe(100);
    });
    it('无异常值不变', () => {
      const data = [1, 2, 3, 4, 5];
      expect(capOutliers(data, 'zscore', 2)).toEqual(data);
    });
    it('常数数组不变', () => {
      const data = [5, 5, 5, 5];
      expect(capOutliers(data, 'zscore', 2)).toEqual(data);
    });
    it('IQR方法', () => {
      const result = capOutliers([1, 2, 3, 4, 100], 'iqr', 1.5);
      expect(Math.max(...result)).toBeLessThan(100);
    });
    it('输出长度不变', () => {
      expect(capOutliers([1, 2, 3], 'zscore').length).toBe(3);
    });
  });
});
