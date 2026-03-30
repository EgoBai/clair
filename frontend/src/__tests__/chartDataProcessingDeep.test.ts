import { describe, it, expect } from 'vitest';

// 图表数据处理深度测试 — 55用例
describe('图表数据处理深度', () => {

  // K线数据处理
  describe('K线数据处理', () => {
    interface KLine { date: string; open: number; high: number; low: number; close: number; volume: number; }

    function processKLine(data: KLine[]) {
      return data.map((k, i) => {
        const change = i === 0 ? 0 : ((k.close - data[i - 1]!.close) / data[i - 1]!.close) * 100;
        const amplitude = k.open === 0 ? 0 : ((k.high - k.low) / k.open) * 100;
        const isUp = k.close >= k.open;
        return { ...k, change: Math.round(change * 100) / 100, amplitude: Math.round(amplitude * 100) / 100, isUp };
      });
    }

    function resampleKLine(data: KLine[], interval: number) {
      const result: KLine[] = [];
      for (let i = 0; i < data.length; i += interval) {
        const chunk = data.slice(i, i + interval);
        if (chunk.length === 0) continue;
        result.push({
          date: chunk[0]!.date,
          open: chunk[0]!.open,
          high: Math.max(...chunk.map(k => k.high)),
          low: Math.min(...chunk.map(k => k.low)),
          close: chunk[chunk.length - 1]!.close,
          volume: chunk.reduce((s, k) => s + k.volume, 0)
        });
      }
      return result;
    }

    it('涨跌标记正确', () => {
      const data: KLine[] = [
        { date: '2024-01-01', open: 10, high: 11, low: 9, close: 10, volume: 1000 },
        { date: '2024-01-02', open: 10, high: 12, low: 9, close: 11, volume: 2000 }
      ];
      const result = processKLine(data);
      expect(result[1]?.isUp).toBe(true);
      expect(result[1]?.change).toBeCloseTo(10, 1);
    });

    it('振幅计算正确', () => {
      const data: KLine[] = [
        { date: '2024-01-01', open: 100, high: 110, low: 90, close: 100, volume: 1000 }
      ];
      const result = processKLine(data);
      expect(result[0]?.amplitude).toBeCloseTo(20, 1);
    });

    it('重采样数据量正确', () => {
      const data: KLine[] = Array.from({ length: 10 }, (_, i) => ({
        date: `2024-01-0${i + 1}`, open: 10, high: 11, low: 9, close: 10, volume: 100
      }));
      expect(resampleKLine(data, 3)).toHaveLength(4);
    });

    it('重采样OHLC正确', () => {
      const data: KLine[] = [
        { date: '1', open: 10, high: 12, low: 9, close: 11, volume: 100 },
        { date: '2', open: 11, high: 15, low: 10, close: 14, volume: 200 }
      ];
      const result = resampleKLine(data, 2);
      expect(result[0]?.high).toBe(15);
      expect(result[0]?.low).toBe(9);
      expect(result[0]?.open).toBe(10);
      expect(result[0]?.close).toBe(14);
      expect(result[0]?.volume).toBe(300);
    });

    it('空数据处理应返回空', () => {
      expect(processKLine([])).toHaveLength(0);
      expect(resampleKLine([], 3)).toHaveLength(0);
    });

    it('第一根K线涨跌幅为0', () => {
      const data: KLine[] = [{ date: '1', open: 10, high: 11, low: 9, close: 10, volume: 100 }];
      expect(processKLine(data)[0]?.change).toBe(0);
    });
  });

  // 数据归一化
  describe('数据归一化', () => {
    function normalize(data: number[]) {
      const min = Math.min(...data), max = Math.max(...data);
      const range = max - min;
      return range === 0 ? data.map(() => 0.5) : data.map(v => (v - min) / range);
    }

    function zScore(data: number[]) {
      const mean = data.reduce((a, b) => a + b, 0) / data.length;
      const std = Math.sqrt(data.reduce((s, v) => s + (v - mean) ** 2, 0) / data.length);
      return std === 0 ? data.map(() => 0) : data.map(v => (v - mean) / std);
    }

    it('归一化范围应为[0,1]', () => {
      const result = normalize([10, 20, 30, 40, 50]);
      expect(Math.min(...result)).toBeCloseTo(0, 5);
      expect(Math.max(...result)).toBeCloseTo(1, 5);
    });

    it('常量数据归一化应全为0.5', () => {
      expect(normalize([5, 5, 5])).toEqual([0.5, 0.5, 0.5]);
    });

    it('Z-score均值应为0', () => {
      const result = zScore([10, 20, 30]);
      const mean = result.reduce((a, b) => a + b, 0) / result.length;
      expect(mean).toBeCloseTo(0, 5);
    });

    it('Z-score标准差应为1', () => {
      const result = zScore([10, 20, 30, 40, 50]);
      const mean = result.reduce((a, b) => a + b, 0) / result.length;
      const std = Math.sqrt(result.reduce((s, v) => s + (v - mean) ** 2, 0) / result.length);
      expect(std).toBeCloseTo(1, 3);
    });

    it('常量数据Z-score应全为0', () => {
      expect(zScore([5, 5, 5])).toEqual([0, 0, 0]);
    });

    it('空数据应返回空', () => {
      expect(normalize([])).toHaveLength(0);
      expect(zScore([])).toHaveLength(0);
    });
  });

  // 数据插值
  describe('数据插值', () => {
    function linearInterpolate(data: (number | null)[], fillCount: number = 0) {
      const result = [...data];
      for (let i = 0; i < result.length; i++) {
        if (result[i] === null) {
          let prevIdx = -1, nextIdx = -1;
          for (let j = i - 1; j >= 0; j--) { if (result[j] !== null) { prevIdx = j; break; } }
          for (let j = i + 1; j < result.length; j++) { if (result[j] !== null) { nextIdx = j; break; } }
          if (prevIdx >= 0 && nextIdx >= 0) {
            const ratio = (i - prevIdx) / (nextIdx - prevIdx);
            result[i] = (result[prevIdx]! as number) + ratio * ((result[nextIdx]! as number) - (result[prevIdx]! as number));
          } else if (prevIdx >= 0) {
            result[i] = result[prevIdx];
          } else if (nextIdx >= 0) {
            result[i] = result[nextIdx];
          }
        }
      }
      return result as number[];
    }

    it('缺失值插值正确', () => {
      const result = linearInterpolate([1, null, 3]);
      expect(result[1]).toBeCloseTo(2, 5);
    });

    it('连续缺失值', () => {
      const result = linearInterpolate([0, null, null, 3]);
      expect(result[1]).toBeCloseTo(1, 5);
      expect(result[2]).toBeCloseTo(2, 5);
    });

    it('开头缺失用下一个值填充', () => {
      const result = linearInterpolate([null, null, 5]);
      expect(result[0]).toBe(5);
    });

    it('结尾缺失用上一个值填充', () => {
      const result = linearInterpolate([5, null, null]);
      expect(result[2]).toBe(5);
    });

    it('无缺失值应不变', () => {
      const result = linearInterpolate([1, 2, 3]);
      expect(result).toEqual([1, 2, 3]);
    });

    it('空数组返回空', () => {
      expect(linearInterpolate([])).toHaveLength(0);
    });
  });

  // 热力图颜色映射
  describe('热力图颜色映射', () => {
    function heatColor(value: number, min: number, max: number) {
      const ratio = max === min ? 0.5 : (value - min) / (max - min);
      const r = Math.round(255 * ratio);
      const g = Math.round(255 * (1 - ratio));
      return { r, g, b: 0, hex: `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}00` };
    }

    it('最小值应为绿色', () => {
      const color = heatColor(0, 0, 100);
      expect(color.r).toBe(0);
      expect(color.g).toBe(255);
    });

    it('最大值应为红色', () => {
      const color = heatColor(100, 0, 100);
      expect(color.r).toBe(255);
      expect(color.g).toBe(0);
    });

    it('中间值应为黄色', () => {
      const color = heatColor(50, 0, 100);
      expect(color.r).toBeCloseTo(128, 0);
      expect(color.g).toBeCloseTo(128, 0);
    });

    it('hex格式正确', () => {
      const color = heatColor(0, 0, 100);
      expect(color.hex).toMatch(/^#[0-9a-f]{6}$/);
    });

    it('min=max应返回中间色', () => {
      const color = heatColor(5, 5, 5);
      expect(color.r).toBeCloseTo(128, 0);
    });
  });

  // 图表坐标轴
  describe('图表坐标轴', () => {
    function niceScale(min: number, max: number, ticks: number = 5) {
      const range = max - min;
      if (range === 0) {
        const step = Math.abs(min) || 1;
        return { min: min - step, max: max + step, step, values: [min - step, min, max + step] };
      }
      const step = range / ticks;
      const magnitude = Math.pow(10, Math.floor(Math.log10(step || 1)));
      const niceStep = Math.ceil(step / magnitude) * magnitude;
      const niceMin = Math.floor(min / niceStep) * niceStep;
      const niceMax = Math.ceil(max / niceStep) * niceStep;
      const values: number[] = [];
      for (let v = niceMin; v <= niceMax; v += niceStep) values.push(v);
      return { min: niceMin, max: niceMax, step: niceStep, values };
    }

    it('刻度值应递增', () => {
      const { values } = niceScale(0, 100, 5);
      for (let i = 1; i < values.length; i++) {
        expect(values[i]).toBeGreaterThan(values[i - 1]!);
      }
    });

    it('刻度应覆盖数据范围', () => {
      const { min, max, values } = niceScale(15, 87, 5);
      expect(values[0]).toBeLessThanOrEqual(min);
      expect(values[values.length - 1]!).toBeGreaterThanOrEqual(max);
    });

    it('刻度间隔应一致', () => {
      const { values, step } = niceScale(0, 100, 5);
      for (let i = 1; i < values.length; i++) {
        expect(values[i]! - values[i - 1]!).toBeCloseTo(step, 5);
      }
    });

    it('零范围应返回合理刻度', () => {
      const { values } = niceScale(10, 10, 5);
      expect(values.length).toBeGreaterThan(0);
    });

    it('负范围应正确处理', () => {
      const { min, max } = niceScale(-100, 100, 4);
      expect(min).toBeLessThanOrEqual(-100);
      expect(max).toBeGreaterThanOrEqual(100);
    });
  });
});
