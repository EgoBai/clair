import { describe, it, expect } from 'vitest';

// 数据聚合管道
interface RawTick {
  symbol: string;
  price: number;
  volume: number;
  timestamp: number;
  bid: number;
  ask: number;
}

interface AggregatedBar {
  symbol: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  vwap: number;
  trades: number;
  startTime: number;
  endTime: number;
}

function aggregateTicksToBar(ticks: RawTick[], intervalMs: number = 60000): AggregatedBar[] {
  if (ticks.length === 0) return [];
  const sorted = [...ticks].sort((a, b) => a.timestamp - b.timestamp);
  const bars: AggregatedBar[] = [];
  let currentBar: any = null;

  for (const tick of sorted) {
    const barStart = Math.floor(tick.timestamp / intervalMs) * intervalMs;
    if (!currentBar || currentBar.startTime !== barStart) {
      if (currentBar) bars.push(finalizeBar(currentBar));
      currentBar = {
        symbol: tick.symbol, open: tick.price, high: tick.price, low: tick.price,
        close: tick.price, volume: 0, sumPriceVolume: 0, trades: 0,
        startTime: barStart, endTime: barStart + intervalMs,
      };
    }
    currentBar.high = Math.max(currentBar.high, tick.price);
    currentBar.low = Math.min(currentBar.low, tick.price);
    currentBar.close = tick.price;
    currentBar.volume += tick.volume;
    currentBar.sumPriceVolume += tick.price * tick.volume;
    currentBar.trades++;
  }
  if (currentBar) bars.push(finalizeBar(currentBar));
  return bars;
}

function finalizeBar(bar: any): AggregatedBar {
  return {
    symbol: bar.symbol,
    open: bar.open, high: bar.high, low: bar.low, close: bar.close,
    volume: bar.volume,
    vwap: bar.volume > 0 ? +(bar.sumPriceVolume / bar.volume).toFixed(4) : bar.open,
    trades: bar.trades,
    startTime: bar.startTime, endTime: bar.endTime,
  };
}

// 数据清洗
function cleanTicks(ticks: RawTick[]): { cleaned: RawTick[]; removed: number } {
  const cleaned: RawTick[] = [];
  let removed = 0;
  for (const tick of ticks) {
    if (tick.price <= 0 || tick.volume < 0 || tick.timestamp <= 0) {
      removed++;
      continue;
    }
    if (tick.ask < tick.bid) {
      removed++;
      continue;
    }
    cleaned.push(tick);
  }
  return { cleaned, removed };
}

// 数据重采样
function resampleOHLC(bars: AggregatedBar[], factor: number): AggregatedBar[] {
  if (factor <= 1) return bars;
  const result: AggregatedBar[] = [];
  for (let i = 0; i < bars.length; i += factor) {
    const chunk = bars.slice(i, i + factor);
    if (chunk.length === 0) continue;
    result.push({
      symbol: chunk[0].symbol,
      open: chunk[0].open,
      high: Math.max(...chunk.map(b => b.high)),
      low: Math.min(...chunk.map(b => b.low)),
      close: chunk[chunk.length - 1].close,
      volume: chunk.reduce((s, b) => s + b.volume, 0),
      vwap: chunk.reduce((s, b) => s + b.vwap * b.volume, 0) / chunk.reduce((s, b) => s + b.volume, 0) || chunk[0].vwap,
      trades: chunk.reduce((s, b) => s + b.trades, 0),
      startTime: chunk[0].startTime,
      endTime: chunk[chunk.length - 1].endTime,
    });
  }
  return result;
}

// Gap检测
function detectPriceGaps(bars: AggregatedBar[], threshold: number = 0.03): { index: number; gap: number; direction: string }[] {
  const gaps: { index: number; gap: number; direction: string }[] = [];
  for (let i = 1; i < bars.length; i++) {
    const prevClose = bars[i - 1].close;
    const currOpen = bars[i].open;
    if (prevClose <= 0) continue;
    const gapPct = (currOpen - prevClose) / prevClose;
    if (Math.abs(gapPct) >= threshold) {
      gaps.push({ index: i, gap: +gapPct.toFixed(4), direction: gapPct > 0 ? 'up' : 'down' });
    }
  }
  return gaps;
}

describe('数据聚合管道', () => {
  const makeTicks = (prices: number[], baseTime: number = 960000): RawTick[] =>
    prices.map((p, i) => ({
      symbol: 'TEST', price: p, volume: 100,
      timestamp: baseTime + i * 1000, bid: p - 0.01, ask: p + 0.01,
    }));

  describe('Tick聚合为Bar', () => {
    it('空tick返回空', () => {
      expect(aggregateTicksToBar([])).toHaveLength(0);
    });

    it('单tick生成一个Bar', () => {
      const bars = aggregateTicksToBar(makeTicks([10]));
      expect(bars).toHaveLength(1);
      expect(bars[0].open).toBe(10);
      expect(bars[0].close).toBe(10);
    });

    it('OHLC正确', () => {
      const bars = aggregateTicksToBar(makeTicks([10, 12, 8, 11]));
      expect(bars[0].open).toBe(10);
      expect(bars[0].high).toBe(12);
      expect(bars[0].low).toBe(8);
      expect(bars[0].close).toBe(11);
    });

    it('成交量正确累加', () => {
      const bars = aggregateTicksToBar(makeTicks([10, 11, 12]));
      expect(bars[0].volume).toBe(300);
    });

    it('交易次数正确', () => {
      const bars = aggregateTicksToBar(makeTicks([10, 11, 12]));
      expect(bars[0].trades).toBe(3);
    });

    it('VWAP计算正确', () => {
      const ticks = makeTicks([10, 20]);
      const bars = aggregateTicksToBar(ticks);
      expect(bars[0].vwap).toBe(15);
    });

    it('跨分钟生成多个Bar', () => {
      const ticks = [
        { symbol: 'T', price: 10, volume: 100, timestamp: 0, bid: 9.99, ask: 10.01 },
        { symbol: 'T', price: 11, volume: 100, timestamp: 61000, bid: 10.99, ask: 11.01 },
      ];
      const bars = aggregateTicksToBar(ticks, 60000);
      expect(bars).toHaveLength(2);
    });
  });

  describe('数据清洗', () => {
    it('移除负价格', () => {
      const ticks = [
        ...makeTicks([10]),
        { symbol: 'T', price: -1, volume: 100, timestamp: 1000, bid: -1, ask: 0 },
      ];
      const { cleaned, removed } = cleanTicks(ticks);
      expect(removed).toBe(1);
      expect(cleaned).toHaveLength(1);
    });

    it('移除bid>ask', () => {
      const ticks = [
        { symbol: 'T', price: 10, volume: 100, timestamp: 1000, bid: 11, ask: 9 },
      ];
      const { removed } = cleanTicks(ticks);
      expect(removed).toBe(1);
    });

    it('有效数据保留', () => {
      const { cleaned, removed } = cleanTicks(makeTicks([10, 11, 12]));
      expect(removed).toBe(0);
      expect(cleaned).toHaveLength(3);
    });

    it('零成交量保留', () => {
      const ticks = [{ symbol: 'T', price: 10, volume: 0, timestamp: 1000, bid: 9.99, ask: 10.01 }];
      const { cleaned } = cleanTicks(ticks);
      expect(cleaned).toHaveLength(1);
    });

    it('负成交量移除', () => {
      const ticks = [{ symbol: 'T', price: 10, volume: -1, timestamp: 1000, bid: 9.99, ask: 10.01 }];
      const { removed } = cleanTicks(ticks);
      expect(removed).toBe(1);
    });
  });

  describe('OHLC重采样', () => {
    it('factor=1不改变', () => {
      const bars = aggregateTicksToBar(makeTicks([10, 11, 12]));
      expect(resampleOHLC(bars, 1)).toEqual(bars);
    });

    it('合并2个Bar', () => {
      const bars = [
        { symbol: 'T', open: 10, high: 12, low: 9, close: 11, volume: 100, vwap: 10.5, trades: 3, startTime: 0, endTime: 60000 },
        { symbol: 'T', open: 11, high: 13, low: 10, close: 12, volume: 200, vwap: 11.5, trades: 5, startTime: 60000, endTime: 120000 },
      ];
      const resampled = resampleOHLC(bars, 2);
      expect(resampled).toHaveLength(1);
      expect(resampled[0].open).toBe(10);
      expect(resampled[0].high).toBe(13);
      expect(resampled[0].low).toBe(9);
      expect(resampled[0].close).toBe(12);
      expect(resampled[0].volume).toBe(300);
    });

    it('空bars返回空', () => {
      expect(resampleOHLC([], 2)).toHaveLength(0);
    });
  });

  describe('Gap检测', () => {
    it('检测向上缺口', () => {
      const bars = [
        { symbol: 'T', open: 10, high: 10, low: 10, close: 10, volume: 0, vwap: 10, trades: 0, startTime: 0, endTime: 0 },
        { symbol: 'T', open: 11, high: 11, low: 11, close: 11, volume: 0, vwap: 11, trades: 0, startTime: 0, endTime: 0 },
      ];
      const gaps = detectPriceGaps(bars, 0.05);
      expect(gaps).toHaveLength(1);
      expect(gaps[0].direction).toBe('up');
    });

    it('检测向下缺口', () => {
      const bars = [
        { symbol: 'T', open: 10, high: 10, low: 10, close: 10, volume: 0, vwap: 10, trades: 0, startTime: 0, endTime: 0 },
        { symbol: 'T', open: 9, high: 9, low: 9, close: 9, volume: 0, vwap: 9, trades: 0, startTime: 0, endTime: 0 },
      ];
      const gaps = detectPriceGaps(bars, 0.05);
      expect(gaps[0].direction).toBe('down');
    });

    it('小波动不触发', () => {
      const bars = [
        { symbol: 'T', open: 10, high: 10, low: 10, close: 10, volume: 0, vwap: 10, trades: 0, startTime: 0, endTime: 0 },
        { symbol: 'T', open: 10.1, high: 10.1, low: 10.1, close: 10.1, volume: 0, vwap: 10.1, trades: 0, startTime: 0, endTime: 0 },
      ];
      expect(detectPriceGaps(bars, 0.05)).toHaveLength(0);
    });

    it('空bars返回空', () => {
      expect(detectPriceGaps([])).toHaveLength(0);
    });

    it('零昨收跳过', () => {
      const bars = [
        { symbol: 'T', open: 0, high: 0, low: 0, close: 0, volume: 0, vwap: 0, trades: 0, startTime: 0, endTime: 0 },
        { symbol: 'T', open: 10, high: 10, low: 10, close: 10, volume: 0, vwap: 10, trades: 0, startTime: 0, endTime: 0 },
      ];
      expect(detectPriceGaps(bars)).toHaveLength(0);
    });
  });
});
