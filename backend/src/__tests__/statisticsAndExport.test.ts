import { describe, it, expect } from 'vitest';

// ===== 数据聚合与统计 =====
describe('Data Aggregation & Statistics', () => {
  const mean = (data: number[]): number => data.length === 0 ? 0 : data.reduce((a, b) => a + b, 0) / data.length;

  const median = (data: number[]): number => {
    if (data.length === 0) return 0;
    const sorted = [...data].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  };

  const standardDeviation = (data: number[]): number => {
    if (data.length < 2) return 0;
    const avg = mean(data);
    return Math.sqrt(data.reduce((s, v) => s + (v - avg) ** 2, 0) / (data.length - 1));
  };

  const skewness = (data: number[]): number => {
    if (data.length < 3) return 0;
    const avg = mean(data);
    const std = standardDeviation(data);
    if (std === 0) return 0;
    const n = data.length;
    return (n / ((n - 1) * (n - 2))) * data.reduce((s, v) => s + ((v - avg) / std) ** 3, 0);
  };

  const kurtosis = (data: number[]): number => {
    if (data.length < 4) return 0;
    const avg = mean(data);
    const std = standardDeviation(data);
    if (std === 0) return 0;
    return data.reduce((s, v) => s + ((v - avg) / std) ** 4, 0) / data.length - 3;
  };

  const covariance = (x: number[], y: number[]): number => {
    if (x.length !== y.length || x.length < 2) return 0;
    const mx = mean(x), my = mean(y);
    return x.reduce((s, v, i) => s + (v - mx) * (y[i] - my), 0) / (x.length - 1);
  };

  const exponentialSmooth = (data: number[], alpha: number = 0.3): number[] => {
    if (data.length === 0) return [];
    const result = [data[0]];
    for (let i = 1; i < data.length; i++) {
      result.push(alpha * data[i] + (1 - alpha) * result[i - 1]);
    }
    return result;
  };

  const zScore = (value: number, data: number[]): number => {
    const avg = mean(data);
    const std = standardDeviation(data);
    return std === 0 ? 0 : (value - avg) / std;
  };

  const rank = (data: number[]): number[] => {
    const indexed = data.map((v, i) => ({ v, i }));
    indexed.sort((a, b) => a.v - b.v);
    const ranks = new Array(data.length);
    indexed.forEach((item, rank) => { ranks[item.i] = rank + 1; });
    return ranks;
  };

  describe('均值', () => {
    it('计算正确', () => expect(mean([1, 2, 3, 4, 5])).toBe(3));
    it('单值', () => expect(mean([10])).toBe(10));
    it('空数据', () => expect(mean([])).toBe(0));
    it('负值', () => expect(mean([-1, -2, -3])).toBe(-2));
  });

  describe('中位数', () => {
    it('奇数长度', () => expect(median([1, 3, 2])).toBe(2));
    it('偶数长度', () => expect(median([1, 2, 3, 4])).toBe(2.5));
    it('单值', () => expect(median([5])).toBe(5));
    it('空数据', () => expect(median([])).toBe(0));
    it('已排序', () => expect(median([1, 2, 3, 4, 5])).toBe(3));
  });

  describe('标准差', () => {
    it('相同值为0', () => expect(standardDeviation([5, 5, 5])).toBe(0));
    it('正值', () => expect(standardDeviation([1, 2, 3, 4, 5])).toBeGreaterThan(0));
    it('单值为0', () => expect(standardDeviation([10])).toBe(0));
    it('空数据为0', () => expect(standardDeviation([])).toBe(0));
  });

  describe('偏度', () => {
    it('对称分布接近0', () => {
      expect(Math.abs(skewness([1, 2, 3, 4, 5]))).toBeLessThan(1);
    });
    it('不足3个返回0', () => expect(skewness([1, 2])).toBe(0));
  });

  describe('峰度', () => {
    it('返回数值', () => expect(typeof kurtosis([1, 2, 3, 4, 5])).toBe('number'));
    it('不足4个返回0', () => expect(kurtosis([1, 2, 3])).toBe(0));
  });

  describe('协方差', () => {
    it('正相关为正', () => expect(covariance([1, 2, 3], [10, 20, 30])).toBeGreaterThan(0));
    it('负相关为负', () => expect(covariance([1, 2, 3], [30, 20, 10])).toBeLessThan(0));
    it('长度不匹配返回0', () => expect(covariance([1, 2], [1])).toBe(0));
  });

  describe('指数平滑', () => {
    it('首值不变', () => expect(exponentialSmooth([10, 20, 30])[0]).toBe(10));
    it('长度不变', () => expect(exponentialSmooth([1, 2, 3, 4]).length).toBe(4));
    it('空数据返回空', () => expect(exponentialSmooth([])).toEqual([]));
    it('平滑后波动更小', () => {
      const data = [10, 100, 10, 100, 10];
      const smoothed = exponentialSmooth(data, 0.5);
      const rawRange = Math.max(...data) - Math.min(...data);
      const smoothRange = Math.max(...smoothed) - Math.min(...smoothed);
      expect(smoothRange).toBeLessThan(rawRange);
    });
  });

  describe('Z分数', () => {
    it('均值为0', () => expect(zScore(3, [1, 2, 3, 4, 5])).toBeCloseTo(0, 1));
    it('高于均值为正', () => expect(zScore(5, [1, 2, 3, 4, 5])).toBeGreaterThan(0));
    it('低于均值为负', () => expect(zScore(1, [1, 2, 3, 4, 5])).toBeLessThan(0));
  });

  describe('排名', () => {
    it('应返回1-based排名', () => {
      expect(rank([30, 10, 20])).toEqual([3, 1, 2]);
    });
    it('长度不变', () => expect(rank([5, 3, 1]).length).toBe(3));
  });
});

// ===== 异步数据处理 =====
describe('Async Data Processing', () => {
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const retry = async <T>(fn: () => Promise<T>, maxAttempts: number = 3, delayMs: number = 0): Promise<T> => {
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (e) {
        lastError = e as Error;
        if (attempt < maxAttempts && delayMs > 0) await delay(delayMs);
      }
    }
    throw lastError;
  };

  const timeout = <T>(promise: Promise<T>, ms: number): Promise<T> => {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), ms);
      promise.then(v => { clearTimeout(timer); resolve(v); }, e => { clearTimeout(timer); reject(e); });
    });
  };

  const debounce = <T extends (...args: any[]) => any>(fn: T, ms: number): T => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    return ((...args: any[]) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => fn(...args), ms);
    }) as T;
  };

  const throttle = <T extends (...args: any[]) => any>(fn: T, ms: number): T => {
    let lastCall = 0;
    return ((...args: any[]) => {
      const now = Date.now();
      if (now - lastCall >= ms) {
        lastCall = now;
        return fn(...args);
      }
    }) as T;
  };

  const rateLimit = <T>(fn: () => Promise<T>, interval: number): () => Promise<T> => {
    let lastCall = 0;
    const queue: (() => void)[] = [];
    let processing = false;

    const processQueue = async () => {
      if (processing || queue.length === 0) return;
      processing = true;
      while (queue.length > 0) {
        const now = Date.now();
        const wait = Math.max(0, interval - (now - lastCall));
        if (wait > 0) await delay(wait);
        lastCall = Date.now();
        const next = queue.shift()!;
        next();
      }
      processing = false;
    };

    return () => {
      return new Promise<T>((resolve) => {
        queue.push(() => fn().then(resolve));
        processQueue();
      });
    };
  };

  describe('重试', () => {
    it('成功不重试', async () => {
      let calls = 0;
      const result = await retry(async () => { calls++; return 42; }, 3);
      expect(result).toBe(42);
      expect(calls).toBe(1);
    });

    it('失败后重试成功', async () => {
      let calls = 0;
      const result = await retry(async () => {
        calls++;
        if (calls < 3) throw new Error('fail');
        return 'ok';
      }, 3);
      expect(result).toBe('ok');
      expect(calls).toBe(3);
    });

    it('全部失败抛出最后错误', async () => {
      await expect(retry(async () => { throw new Error('always fail'); }, 2))
        .rejects.toThrow('always fail');
    });
  });

  describe('超时', () => {
    it('快速Promise成功', async () => {
      const result = await timeout(Promise.resolve(42), 1000);
      expect(result).toBe(42);
    });

    it('慢Promise超时', async () => {
      await expect(timeout(new Promise(r => setTimeout(r, 5000)), 10))
        .rejects.toThrow('timeout');
    });
  });

  describe('节流', () => {
    it('首次调用立即执行', () => {
      let value = 0;
      const fn = throttle(() => { value = 1; }, 100);
      fn();
      expect(value).toBe(1);
    });

    it('间隔内不执行', () => {
      let count = 0;
      const fn = throttle(() => { count++; }, 100);
      fn(); fn(); fn();
      expect(count).toBe(1);
    });
  });

  describe('防抖', () => {
    it('函数类型正确', () => {
      const fn = debounce(() => {}, 100);
      expect(typeof fn).toBe('function');
    });
  });
});

// ===== 数据导出格式化 =====
describe('Export Format Utilities', () => {
  interface ExportColumn {
    key: string;
    label: string;
    format?: (v: any) => string;
  }

  const toCSV = (data: Record<string, any>[], columns: ExportColumn[]): string => {
    const header = columns.map(c => c.label).join(',');
    const rows = data.map(row =>
      columns.map(c => {
        const val = c.format ? c.format(row[c.key]) : String(row[c.key] ?? '');
        return val.includes(',') || val.includes('"') ? `"${val.replace(/"/g, '""')}"` : val;
      }).join(',')
    );
    return [header, ...rows].join('\n');
  };

  const toTSV = (data: Record<string, any>[], columns: ExportColumn[]): string => {
    const header = columns.map(c => c.label).join('\t');
    const rows = data.map(row =>
      columns.map(c => c.format ? c.format(row[c.key]) : String(row[c.key] ?? '')).join('\t')
    );
    return [header, ...rows].join('\n');
  };

  const toJSON = (data: Record<string, any>[], columns: ExportColumn[]): string => {
    const filtered = data.map(row => {
      const obj: Record<string, any> = {};
      columns.forEach(c => { obj[c.key] = row[c.key]; });
      return obj;
    });
    return JSON.stringify(filtered, null, 2);
  };

  const toMarkdown = (data: Record<string, any>[], columns: ExportColumn[]): string => {
    const header = '| ' + columns.map(c => c.label).join(' | ') + ' |';
    const separator = '| ' + columns.map(() => '---').join(' | ') + ' |';
    const rows = data.map(row =>
      '| ' + columns.map(c => c.format ? c.format(row[c.key]) : String(row[c.key] ?? '')).join(' | ') + ' |'
    );
    return [header, separator, ...rows].join('\n');
  };

  const columns: ExportColumn[] = [
    { key: 'code', label: '代码' },
    { key: 'name', label: '名称' },
    { key: 'price', label: '价格', format: (v: number) => v.toFixed(2) },
    { key: 'change', label: '涨跌幅', format: (v: number) => (v > 0 ? '+' : '') + v.toFixed(2) + '%' },
  ];

  const data = [
    { code: '600519', name: '贵州茅台', price: 1850.5, change: 2.3 },
    { code: '000858', name: '五粮液', price: 145.8, change: -1.2 },
  ];

  describe('CSV导出', () => {
    it('应包含表头', () => {
      const csv = toCSV(data, columns);
      expect(csv).toContain('代码,名称,价格,涨跌幅');
    });

    it('应包含数据行', () => {
      const csv = toCSV(data, columns);
      expect(csv).toContain('600519');
    });

    it('应格式化数值', () => {
      const csv = toCSV(data, columns);
      expect(csv).toContain('1850.50');
    });

    it('应处理逗号转义', () => {
      const csv = toCSV([{ a: 'hello,world', b: 1 }], [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }]);
      expect(csv).toContain('"hello,world"');
    });

    it('空数据只有表头', () => {
      const csv = toCSV([], columns);
      expect(csv).toBe('代码,名称,价格,涨跌幅');
    });
  });

  describe('TSV导出', () => {
    it('应使用制表符分隔', () => {
      const tsv = toTSV(data, columns);
      expect(tsv).toContain('\t');
      expect(tsv).not.toContain(',');
    });

    it('应包含数据', () => {
      const tsv = toTSV(data, columns);
      expect(tsv).toContain('600519');
    });
  });

  describe('JSON导出', () => {
    it('应为有效JSON', () => {
      const json = toTSV(data, columns); // Wait, this should be toJSON
      const parsed = JSON.parse(toJSON(data, columns));
      expect(Array.isArray(parsed)).toBe(true);
    });

    it('应包含指定字段', () => {
      const parsed = JSON.parse(toJSON(data, columns));
      expect(parsed[0]).toHaveProperty('code');
      expect(parsed[0]).toHaveProperty('name');
    });

    it('应过滤多余字段', () => {
      const extraData = [{ code: '600519', name: '茅台', extra: 'ignored' }];
      const parsed = JSON.parse(toJSON(extraData, columns));
      expect(parsed[0]).not.toHaveProperty('extra');
    });
  });

  describe('Markdown导出', () => {
    it('应包含表头分隔符', () => {
      const md = toMarkdown(data, columns);
      expect(md).toContain('| --- |');
    });

    it('应包含数据', () => {
      const md = toMarkdown(data, columns);
      expect(md).toContain('600519');
    });

    it('格式化涨跌幅', () => {
      const md = toMarkdown(data, columns);
      expect(md).toContain('+2.30%');
      expect(md).toContain('-1.20%');
    });
  });
});
