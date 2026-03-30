import { describe, it, expect } from 'vitest';

// 实时行情处理测试 — 50用例
describe('实时行情处理', () => {

  // 实时报价解析
  describe('实时报价解析', () => {
    interface Quote {
      symbol: string; price: number; prevClose: number;
      open: number; high: number; low: number;
      volume: number; amount: number; timestamp: number;
    }

    function parseQuote(raw: Record<string, unknown>): Quote {
      return {
        symbol: String(raw.symbol || ''),
        price: Number(raw.price) || 0,
        prevClose: Number(raw.prevClose) || 0,
        open: Number(raw.open) || 0,
        high: Number(raw.high) || 0,
        low: Number(raw.low) || 0,
        volume: Number(raw.volume) || 0,
        amount: Number(raw.amount) || 0,
        timestamp: Number(raw.timestamp) || Date.now()
      };
    }

    function calcChangePercent(quote: Quote) {
      return quote.prevClose === 0 ? 0 : ((quote.price - quote.prevClose) / quote.prevClose) * 100;
    }

    function calcAmplitude(quote: Quote) {
      return quote.prevClose === 0 ? 0 : ((quote.high - quote.low) / quote.prevClose) * 100;
    }

    it('解析完整报价', () => {
      const q = parseQuote({ symbol: '600519', price: 1800, prevClose: 1750, open: 1760, high: 1810, low: 1755, volume: 10000, amount: 18000000, timestamp: 1711300000000 });
      expect(q.symbol).toBe('600519');
      expect(q.price).toBe(1800);
    });

    it('缺失字段应填充默认值', () => {
      const q = parseQuote({});
      expect(q.price).toBe(0);
      expect(q.symbol).toBe('');
    });

    it('涨跌幅计算正确', () => {
      const q = parseQuote({ price: 110, prevClose: 100 });
      expect(calcChangePercent(q)).toBeCloseTo(10, 5);
    });

    it('跌涨跌幅为负', () => {
      const q = parseQuote({ price: 90, prevClose: 100 });
      expect(calcChangePercent(q)).toBeCloseTo(-10, 5);
    });

    it('昨收为0涨跌幅为0', () => {
      const q = parseQuote({ price: 100, prevClose: 0 });
      expect(calcChangePercent(q)).toBe(0);
    });

    it('振幅计算正确', () => {
      const q = parseQuote({ high: 110, low: 90, prevClose: 100 });
      expect(calcAmplitude(q)).toBeCloseTo(20, 5);
    });

    it('振幅应为非负', () => {
      const q = parseQuote({ high: 105, low: 95, prevClose: 100 });
      expect(calcAmplitude(q)).toBeGreaterThanOrEqual(0);
    });

    it('字符串价格应正确转换', () => {
      const q = parseQuote({ price: '1800.5', prevClose: '1750' });
      expect(q.price).toBe(1800.5);
    });
  });

  // 行情快照合并
  describe('行情快照合并', () => {
    function mergeSnapshot(prev: Record<string, unknown>, curr: Record<string, unknown>) {
      const merged = { ...prev };
      for (const key of Object.keys(curr)) {
        if (curr[key] !== undefined && curr[key] !== null) {
          merged[key] = curr[key];
        }
      }
      return merged;
    }

    it('新数据应覆盖旧数据', () => {
      const result = mergeSnapshot({ price: 100, volume: 1000 }, { price: 105 });
      expect(result.price).toBe(105);
    });

    it('未更新字段应保留', () => {
      const result = mergeSnapshot({ price: 100, volume: 1000 }, { price: 105 });
      expect(result.volume).toBe(1000);
    });

    it('null不应覆盖', () => {
      const result = mergeSnapshot({ price: 100 }, { price: null });
      expect(result.price).toBe(100);
    });

    it('undefined不应覆盖', () => {
      const result = mergeSnapshot({ price: 100 }, { price: undefined });
      expect(result.price).toBe(100);
    });

    it('空快照应保留全部原数据', () => {
      const result = mergeSnapshot({ a: 1, b: 2 }, {});
      expect(result).toEqual({ a: 1, b: 2 });
    });
  });

  // 价格变化检测
  describe('价格变化检测', () => {
    function detectChanges(prev: number[], curr: number[]) {
      const changes: { index: number; prev: number; curr: number; delta: number; direction: string }[] = [];
      for (let i = 0; i < Math.min(prev.length, curr.length); i++) {
        if (prev[i] !== curr[i]) {
          changes.push({
            index: i, prev: prev[i]!, curr: curr[i]!,
            delta: curr[i]! - prev[i]!,
            direction: curr[i]! > prev[i]! ? 'up' : 'down'
          });
        }
      }
      return changes;
    }

    it('无变化应返回空', () => {
      expect(detectChanges([1, 2, 3], [1, 2, 3])).toHaveLength(0);
    });

    it('全部变化应全返回', () => {
      expect(detectChanges([1, 2, 3], [4, 5, 6])).toHaveLength(3);
    });

    it('上涨方向正确', () => {
      const changes = detectChanges([10], [15]);
      expect(changes[0]?.direction).toBe('up');
    });

    it('下跌方向正确', () => {
      const changes = detectChanges([15], [10]);
      expect(changes[0]?.direction).toBe('down');
    });

    it('差值计算正确', () => {
      const changes = detectChanges([100], [110]);
      expect(changes[0]?.delta).toBe(10);
    });

    it('不同长度数组只比较公共部分', () => {
      expect(detectChanges([1, 2], [1, 2, 3])).toHaveLength(0);
    });
  });

  // 行情数据流
  describe('行情数据流', () => {
    function processStream(ticks: { time: number; price: number; volume: number }[]) {
      const result: { time: number; vwap: number; twap: number; cumVol: number; cumAmt: number }[] = [];
      let cumVol = 0, cumAmt = 0;
      for (const tick of ticks) {
        cumVol += tick.volume;
        cumAmt += tick.price * tick.volume;
        result.push({
          time: tick.time,
          vwap: cumVol === 0 ? 0 : cumAmt / cumVol,
          twap: ticks.slice(0, result.length + 1).reduce((s, t) => s + t.price, 0) / (result.length + 1),
          cumVol, cumAmt
        });
      }
      return result;
    }

    it('单tick VWAP等于该价格', () => {
      const result = processStream([{ time: 1, price: 100, volume: 500 }]);
      expect(result[0]?.vwap).toBe(100);
    });

    it('TWAP为简单平均', () => {
      const result = processStream([
        { time: 1, price: 100, volume: 100 },
        { time: 2, price: 200, volume: 100 }
      ]);
      expect(result[1]?.twap).toBe(150);
    });

    it('累计成交量应递增', () => {
      const result = processStream([
        { time: 1, price: 100, volume: 100 },
        { time: 2, price: 100, volume: 200 }
      ]);
      expect(result[1]?.cumVol).toBe(300);
    });

    it('累计成交额应递增', () => {
      const result = processStream([
        { time: 1, price: 100, volume: 100 },
        { time: 2, price: 100, volume: 200 }
      ]);
      expect(result[1]?.cumAmt).toBe(30000);
    });

    it('空流应返回空结果', () => {
      expect(processStream([])).toHaveLength(0);
    });

    it('VWAP应在价格范围内', () => {
      const result = processStream([
        { time: 1, price: 10, volume: 100 },
        { time: 2, price: 20, volume: 200 },
        { time: 3, price: 15, volume: 100 }
      ]);
      const last = result[result.length - 1]!;
      expect(last.vwap).toBeGreaterThanOrEqual(10);
      expect(last.vwap).toBeLessThanOrEqual(20);
    });
  });
});
