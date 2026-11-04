/**
 * 影子测试迁移 — 数据仓库与报表系统
 *
 * 绑定真源：
 * - OLAP 维度聚合 → frontend/src/utils/bloombergExportEngine.ts:628 groupData（按维度分组）
 *   + :645 aggregateData（sum/avg/count/min/max，结果键名 `${key}_${type}`）
 * - 窗口切分 → frontend/src/utils/dataFlowEngine.ts:137 slidingWindowAggregate
 * - 滚动均值/标准差 → frontend/src/utils/meanReversionEngine.ts:51 rollingStats（总体标准差 ÷window，前 window-1 为 NaN）
 * - 相关系数 → frontend/src/utils/correlationMatrix.ts:78 calculateCorrelation
 *   （样本 n-1：:59 calculateStdDev / :66 calculateCovariance；clamp 到 -1..1：:83；std=0 返回 0）
 * - 百分位排名 → backend/src/utils/futureValueUtils.ts:27 percentileRank(value, values)
 * - Z-Score → dataFlowEngine.ts:209 zScoreNormalize（总体标准差，非零时 4 位舍入）
 * - Min-Max → dataFlowEngine.ts:220 minMaxNormalize（4 位舍入；range=0 全 0：:225）
 * - 透视表 → groupData(:628) 两级分组 + aggregateData(:645) 求和编排，本文件不含聚合算法
 *
 * 旧断言订正：
 * - Min-Max 常数数组：旧 [0.5,0.5,0.5] → 生产 [0,0,0]（dataFlowEngine.ts:225 range=0 分支）
 * - 百分位排名：旧返回 0-100（40/80/0，旧内联 ÷length×100）→ 生产返回 0..1 分数（0.4/0.8/0，futureValueUtils.ts:27-32）
 * - 滚动统计「数据不足」：旧返回 []（多窗口数组）→ 生产 rollingStats 返回与输入等长的 mean/std 数组且全为 NaN（meanReversionEngine.ts:51-88）；
 *   窗口切分语义用 slidingWindowAggregate，长度不足窗口时返回 []（dataFlowEngine.ts:137-145）
 * - 滚动统计「5日窗口」长度：旧窗口数组 6 项 → 生产 mean/std 长度 = 数据长度 10（前 4 项 NaN），窗口下标从 4 开始
 * - 滚动统计「窗口等于数据长度」：旧 result.length=1 → 生产 mean 长度 3、非 NaN 项 1 个（index 2）
 * - 相关系数：旧用总体协方差/方差（cov/√(varA·varB)）→ 生产样本 n-1 且 clamp（correlationMatrix.ts:59-84）；本文件用例取值 1/-1/0 不变
 * - 聚合计数口径：旧统计全部行 → 生产 count 只统计 value !== 0 的行（bloombergExportEngine.ts:664），新增用例锁定
 * - 聚合数值：旧无舍入 → 生产 sum/avg/min/max 四舍五入 2 位（bloombergExportEngine.ts:656-670）；整数夹具无差异
 *
 * 未迁移·生产缺口：
 * - resampleTimeSeries：生产无「按日历周/月」重采样导出（chartDataProcessing.ts:20 aggregateTicksToCandle 按 epoch 毫秒分桶且无 avg，契约不同）→ 保留内联
 * - quantile：生产无导出分位数函数（riskScenarioEngine.ts:52 percentile 未导出且入参为百分制 p）→ 保留内联
 */
import { describe, it, expect } from 'vitest';
import { groupData, aggregateData } from '../../../frontend/src/utils/bloombergExportEngine';
import { slidingWindowAggregate, zScoreNormalize, minMaxNormalize } from '../../../frontend/src/utils/dataFlowEngine';
import { rollingStats } from '../../../frontend/src/utils/meanReversionEngine';
import { calculateCorrelation } from '../../../frontend/src/utils/correlationMatrix';
import { percentileRank } from '../utils/futureValueUtils';

describe('数据仓库与报表系统', () => {

  describe('OLAP维度聚合', () => {
    const data = [
      { sector: '科技', amount: 100 },
      { sector: '科技', amount: 200 },
      { sector: '金融', amount: 300 },
      { sector: '金融', amount: 400 },
      { sector: '医药', amount: 500 },
    ];
    const groups = groupData(data as Record<string, unknown>[], 'sector');
    const aggregate = (sector: string, type: 'sum' | 'avg' | 'count' | 'max' | 'min') =>
      aggregateData(groups.get(sector)!, [{ key: 'amount', type }])[`amount_${type}`];

    it('按行业求和', () => {
      expect(aggregate('科技', 'sum')).toBe(300);
      expect(aggregate('金融', 'sum')).toBe(700);
    });
    it('按行业求均值', () => {
      expect(aggregate('科技', 'avg')).toBe(150);
    });
    it('按行业计数', () => {
      expect(aggregate('科技', 'count')).toBe(2);
      expect(aggregate('金融', 'count')).toBe(2);
      expect(aggregate('医药', 'count')).toBe(1);
    });
    it('按行业求最大值', () => {
      expect(aggregate('科技', 'max')).toBe(200);
    });
    it('按行业求最小值', () => {
      expect(aggregate('金融', 'min')).toBe(300);
    });
    it('计数只统计非零金额（生产口径）', () => {
      const withZero = [
        { sector: '科技', amount: 100 },
        { sector: '科技', amount: 0 },
      ];
      const zeroGroups = groupData(withZero as Record<string, unknown>[], 'sector');
      expect(aggregateData(zeroGroups.get('科技')!, [{ key: 'amount', type: 'count' }])['amount_count']).toBe(1);
      expect(aggregateData(zeroGroups.get('科技')!, [{ key: 'amount', type: 'sum' }])['amount_sum']).toBe(100);
    });
  });

  // 时间序列重采样（未迁移：生产无日历周/月重采样导出，见文件头）
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
      expect(result.length).toBe(2);
      expect(result[0].open).toBe(100);
      expect(result[0].close).toBe(102);
      expect(result[1].avg).toBe(109);
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

  describe('移动窗口统计', () => {
    it('5日窗口', () => {
      const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const { mean } = rollingStats(values, 5);
      const mins = slidingWindowAggregate(values, 5, 1, (win) => Math.min(...win));
      const maxs = slidingWindowAggregate(values, 5, 1, (win) => Math.max(...win));
      expect(mean).toHaveLength(10);
      expect(mean[4]).toBe(3);
      expect(mins).toHaveLength(6);
      expect(mins[0]).toBe(1);
      expect(maxs[0]).toBe(5);
    });
    it('窗口等于数据长度', () => {
      const { mean } = rollingStats([1, 2, 3], 3);
      expect(mean.filter((v) => !Number.isNaN(v))).toHaveLength(1);
      expect(mean[2]).toBe(2);
    });
    it('数据不足', () => {
      const { mean, std } = rollingStats([1, 2], 5);
      expect(mean).toHaveLength(2);
      expect(mean.every((v) => Number.isNaN(v))).toBe(true);
      expect(std.every((v) => Number.isNaN(v))).toBe(true);
      expect(slidingWindowAggregate([1, 2], 5, 1, (win) => Math.min(...win))).toEqual([]);
    });
    it('窗口为1', () => {
      const { std } = rollingStats([10, 20, 30], 1);
      expect(std).toEqual([0, 0, 0]);
    });
  });

  describe('相关系数矩阵', () => {
    it('自相关为1', () => {
      expect(calculateCorrelation([1, 2, 3, 4, 5], [1, 2, 3, 4, 5])).toBeCloseTo(1);
    });
    it('完全正相关', () => {
      expect(calculateCorrelation([1, 2, 3], [2, 4, 6])).toBeCloseTo(1);
    });
    it('完全负相关', () => {
      expect(calculateCorrelation([1, 2, 3], [3, 2, 1])).toBeCloseTo(-1);
    });
    it('对称性', () => {
      const ab = calculateCorrelation([1, 2, 3], [4, 5, 6]);
      const ba = calculateCorrelation([4, 5, 6], [1, 2, 3]);
      expect(ab).toBeCloseTo(ba);
    });
  });

  // 透视表（未迁移：生产无 pivot 导出，此处仅用 groupData + aggregateData 编排）
  const pivotTable = <T extends Record<string, unknown>>(
    data: T[],
    rowKey: keyof T,
    colKey: keyof T,
    valueKey: keyof T
  ) => {
    const rows = [...new Set(data.map((item) => String(item[rowKey])))];
    const columns = [...new Set(data.map((item) => String(item[colKey])))];
    const cells = new Map<string, Map<string, number>>();
    for (const [row, rowItems] of groupData(data as Record<string, unknown>[], String(rowKey))) {
      const rowCells = new Map<string, number>();
      for (const [col, cellItems] of groupData(rowItems, String(colKey))) {
        const aggregated = aggregateData(cellItems, [{ key: String(valueKey), type: 'sum' }]);
        rowCells.set(col, aggregated[`${String(valueKey)}_sum`] ?? 0);
      }
      cells.set(row, rowCells);
    }
    return {
      rows,
      columns,
      getValue: (row: string, col: string) => cells.get(row)?.get(col) ?? 0,
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

  // 数据分位数（未迁移：生产无导出分位数函数）
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
      expect(percentileRank(3, [1, 2, 3, 4, 5])).toBeCloseTo(0.4);
    });
    it('最高值排名', () => {
      expect(percentileRank(5, [1, 2, 3, 4, 5])).toBeCloseTo(0.8);
    });
    it('最低值排名', () => {
      expect(percentileRank(1, [1, 2, 3, 4, 5])).toBe(0);
    });
  });

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
      expect(result).toEqual([0, 0, 0]);
    });
    it('空数组', () => {
      expect(zScoreNormalize([])).toEqual([]);
      expect(minMaxNormalize([])).toEqual([]);
    });
  });
});
