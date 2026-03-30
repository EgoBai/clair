import { describe, it, expect } from 'vitest';

describe('数据仓库与报表系统', () => {

  // OLAP 维度聚合
  const aggregateByDimension = <T extends Record<string, unknown>>(
    data: T[],
    dimension: keyof T,
    measure: keyof T,
    aggFn: 'sum' | 'avg' | 'count' | 'max' | 'min' = 'sum'
  ) => {
    const groups = new Map<string, number[]>();
    for (const row of data) {
      const key = String(row[dimension]);
      const val = Number(row[measure]);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(val);
    }
    const result: Record<string, number> = {};
    for (const [key, values] of groups) {
      switch (aggFn) {
        case 'sum': result[key] = values.reduce((a, b) => a + b, 0); break;
        case 'avg': result[key] = values.reduce((a, b) => a + b, 0) / values.length; break;
        case 'count': result[key] = values.length; break;
        case 'max': result[key] = Math.max(...values); break;
        case 'min': result[key] = Math.min(...values); break;
      }
    }
    return result;
  };

  describe('OLAP维度聚合', () => {
    const data = [
      { sector: '科技', amount: 100 },
      { sector: '科技', amount: 200 },
      { sector: '金融', amount: 300 },
      { sector: '金融', amount: 400 },
      { sector: '医药', amount: 500 },
    ];

    it('按行业求和', () => {
      const result = aggregateByDimension(data, 'sector', 'amount', 'sum');
      expect(result['科技']).toBe(300);
      expect(result['金融']).toBe(700);
    });
    it('按行业求均值', () => {
      const result = aggregateByDimension(data, 'sector', 'amount', 'avg');
      expect(result['科技']).toBe(150);
    });
    it('按行业计数', () => {
      const result = aggregateByDimension(data, 'sector', 'amount', 'count');
      expect(result['科技']).toBe(2);
      expect(result['金融']).toBe(2);
      expect(result['医药']).toBe(1);
    });
    it('按行业求最大值', () => {
      const result = aggregateByDimension(data, 'sector', 'amount', 'max');
      expect(result['科技']).toBe(200);
    });
    it('按行业求最小值', () => {
      const result = aggregateByDimension(data, 'sector', 'amount', 'min');
      expect(result['金融']).toBe(300);
    });
  });

  // 时间序列重采样
  const resampleTimeSeries = (data: { date: string; value: number }[], interval: 'week' | 'month') => {
    const getKey = (date: string) => {
      const d = new Date(date);
      if (interval === 'week') {
        const weekStart = new Date(d);
        weekStart.setDate(d.getDate() - d.getDay());
        return weekStart.toISOString().split('T')[0];
      }
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    };
    const groups = new Map<string, number[]>();
    for (const item of data) {
      const key = getKey(item.date);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(item.value);
    }
    return Array.from(groups.entries()).map(([period, values]) => ({
      period,
      open: values[0],
      high: Math.max(...values),
      low: Math.min(...values),
      close: values[values.length - 1],
      avg: values.reduce((a, b) => a + b, 0) / values.length,
    }));
  };

  describe('时间序列重采样', () => {
    it('周度重采样', () => {
      const data = [
        { date: '2026-03-02', value: 100 },
        { date: '2026-03-03', value: 105 },
        { date: '2026-03-04', value: 102 },
        { date: '2026-03-09', value: 108 },
        { date: '2026-03-10', value: 110 },
      ];
      const result = resampleTimeSeries(data, 'week');
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty('open');
      expect(result[0]).toHaveProperty('close');
    });
    it('月度重采样', () => {
      const data = [
        { date: '2026-01-15', value: 100 },
        { date: '2026-01-20', value: 110 },
        { date: '2026-02-05', value: 105 },
        { date: '2026-02-15', value: 115 },
      ];
      const result = resampleTimeSeries(data, 'month');
      expect(result.length).toBe(2);
      expect(result[0].high).toBe(110);
      expect(result[0].close).toBe(110);
    });
    it('空数据', () => {
      expect(resampleTimeSeries([], 'week')).toEqual([]);
    });
  });

  // 移动窗口统计
  const rollingStats = (values: number[], window: number) => {
    if (values.length < window) return [];
    const result: { mean: number; std: number; min: number; max: number }[] = [];
    for (let i = window - 1; i < values.length; i++) {
      const slice = values.slice(i - window + 1, i + 1);
      const mean = slice.reduce((a, b) => a + b, 0) / window;
      const std = Math.sqrt(slice.reduce((a, b) => a + (b - mean) ** 2, 0) / window);
      result.push({ mean, std, min: Math.min(...slice), max: Math.max(...slice) });
    }
    return result;
  };

  describe('移动窗口统计', () => {
    it('5日窗口', () => {
      const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const result = rollingStats(values, 5);
      expect(result.length).toBe(6);
      expect(result[0].mean).toBe(3);
      expect(result[0].min).toBe(1);
      expect(result[0].max).toBe(5);
    });
    it('窗口等于数据长度', () => {
      const result = rollingStats([1, 2, 3], 3);
      expect(result.length).toBe(1);
    });
    it('数据不足', () => {
      expect(rollingStats([1, 2], 5)).toEqual([]);
    });
    it('窗口为1', () => {
      const result = rollingStats([10, 20, 30], 1);
      expect(result.length).toBe(3);
      expect(result[0].std).toBe(0);
    });
  });

  // 相关系数矩阵
  const correlationMatrix = (series: Record<string, number[]>) => {
    const keys = Object.keys(series);
    const n = keys.length;
    const matrix: Record<string, Record<string, number>> = {};
    for (let i = 0; i < n; i++) {
      matrix[keys[i]] = {};
      for (let j = 0; j < n; j++) {
        const a = series[keys[i]];
        const b = series[keys[j]];
        const len = Math.min(a.length, b.length);
        if (len < 2) { matrix[keys[i]][keys[j]] = 0; continue; }
        const meanA = a.slice(0, len).reduce((x, y) => x + y, 0) / len;
        const meanB = b.slice(0, len).reduce((x, y) => x + y, 0) / len;
        let cov = 0, varA = 0, varB = 0;
        for (let k = 0; k < len; k++) {
          cov += (a[k] - meanA) * (b[k] - meanB);
          varA += (a[k] - meanA) ** 2;
          varB += (b[k] - meanB) ** 2;
        }
        matrix[keys[i]][keys[j]] = (varA === 0 || varB === 0) ? 0 : cov / Math.sqrt(varA * varB);
      }
    }
    return matrix;
  };

  describe('相关系数矩阵', () => {
    it('自相关为1', () => {
      const result = correlationMatrix({ A: [1, 2, 3, 4, 5] });
      expect(result['A']['A']).toBeCloseTo(1);
    });
    it('完全正相关', () => {
      const result = correlationMatrix({ A: [1, 2, 3], B: [2, 4, 6] });
      expect(result['A']['B']).toBeCloseTo(1);
    });
    it('完全负相关', () => {
      const result = correlationMatrix({ A: [1, 2, 3], B: [3, 2, 1] });
      expect(result['A']['B']).toBeCloseTo(-1);
    });
    it('对称性', () => {
      const result = correlationMatrix({ A: [1, 2, 3], B: [4, 5, 6] });
      expect(result['A']['B']).toBeCloseTo(result['B']['A']);
    });
  });

  // 数据透视表
  const pivotTable = <T extends Record<string, unknown>>(
    data: T[],
    rowKey: keyof T,
    colKey: keyof T,
    valueKey: keyof T
  ) => {
    const rows = new Set<string>();
    const cols = new Set<string>();
    const cells = new Map<string, number>();
    for (const item of data) {
      const r = String(item[rowKey]);
      const c = String(item[colKey]);
      const v = Number(item[valueKey]) || 0;
      rows.add(r);
      cols.add(c);
      const key = `${r}|${c}`;
      cells.set(key, (cells.get(key) || 0) + v);
    }
    return {
      rows: Array.from(rows),
      columns: Array.from(cols),
      getValue: (row: string, col: string) => cells.get(`${row}|${col}`) || 0,
    };
  };

  describe('数据透视表', () => {
    const data = [
      { sector: '科技', metric: 'PE', value: 30 },
      { sector: '科技', metric: 'PB', value: 5 },
      { sector: '金融', metric: 'PE', value: 8 },
      { sector: '金融', metric: 'PB', value: 1 },
      { sector: '科技', metric: 'PE', value: 35 },
    ];

    it('行维度', () => {
      const result = pivotTable(data, 'sector', 'metric', 'value');
      expect(result.rows).toContain('科技');
      expect(result.rows).toContain('金融');
    });
    it('列维度', () => {
      const result = pivotTable(data, 'sector', 'metric', 'value');
      expect(result.columns).toContain('PE');
      expect(result.columns).toContain('PB');
    });
    it('值聚合', () => {
      const result = pivotTable(data, 'sector', 'metric', 'value');
      expect(result.getValue('科技', 'PE')).toBe(65); // 30+35
      expect(result.getValue('金融', 'PE')).toBe(8);
    });
    it('缺失值为0', () => {
      const result = pivotTable(data, 'sector', 'metric', 'value');
      expect(result.getValue('医药', 'PE')).toBe(0);
    });
  });

  // 数据分位数
  const quantile = (data: number[], q: number) => {
    if (data.length === 0) return 0;
    const sorted = [...data].sort((a, b) => a - b);
    const pos = (sorted.length - 1) * q;
    const base = Math.floor(pos);
    const rest = pos - base;
    if (sorted[base + 1] !== undefined) {
      return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
    }
    return sorted[base];
  };

  const percentileRank = (data: number[], value: number) => {
    if (data.length === 0) return 0;
    const below = data.filter(d => d < value).length;
    return (below / data.length) * 100;
  };

  describe('数据分位数', () => {
    it('中位数', () => {
      expect(quantile([1, 2, 3, 4, 5], 0.5)).toBe(3);
    });
    it('Q1', () => {
      expect(quantile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.25)).toBeCloseTo(3.25);
    });
    it('Q3', () => {
      expect(quantile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.75)).toBeCloseTo(7.75);
    });
    it('空数组', () => {
      expect(quantile([], 0.5)).toBe(0);
    });
    it('百分位排名', () => {
      expect(percentileRank([1, 2, 3, 4, 5], 3)).toBeCloseTo(40);
    });
    it('最高值排名', () => {
      expect(percentileRank([1, 2, 3, 4, 5], 5)).toBeCloseTo(80);
    });
    it('最低值排名', () => {
      expect(percentileRank([1, 2, 3, 4, 5], 1)).toBe(0);
    });
  });

  // Z-Score 标准化
  const zScoreNormalize = (data: number[]) => {
    if (data.length === 0) return [];
    const mean = data.reduce((a, b) => a + b, 0) / data.length;
    const std = Math.sqrt(data.reduce((a, b) => a + (b - mean) ** 2, 0) / data.length);
    if (std === 0) return data.map(() => 0);
    return data.map(d => (d - mean) / std);
  };

  const minMaxNormalize = (data: number[]) => {
    if (data.length === 0) return [];
    const min = Math.min(...data);
    const max = Math.max(...data);
    if (max === min) return data.map(() => 0.5);
    return data.map(d => (d - min) / (max - min));
  };

  describe('数据标准化', () => {
    it('Z-Score均值为0', () => {
      const result = zScoreNormalize([1, 2, 3, 4, 5]);
      const mean = result.reduce((a, b) => a + b, 0) / result.length;
      expect(mean).toBeCloseTo(0);
    });
    it('Z-Score常数数组', () => {
      const result = zScoreNormalize([5, 5, 5]);
      expect(result).toEqual([0, 0, 0]);
    });
    it('Min-Max范围0-1', () => {
      const result = minMaxNormalize([10, 20, 30, 40, 50]);
      expect(result[0]).toBe(0);
      expect(result[result.length - 1]).toBe(1);
    });
    it('Min-Max常数数组', () => {
      const result = minMaxNormalize([10, 10, 10]);
      expect(result).toEqual([0.5, 0.5, 0.5]);
    });
    it('空数组', () => {
      expect(zScoreNormalize([])).toEqual([]);
      expect(minMaxNormalize([])).toEqual([]);
    });
  });
});
