import { describe, it, expect } from 'vitest';

// Data Transform Pipeline
type TransformFn<T> = (data: T) => T;

interface PipelineStage<T> {
  name: string;
  transform: TransformFn<T>;
  condition?: (data: T) => boolean;
}

class DataPipeline<T> {
  private stages: PipelineStage<T>[] = [];

  addStage(stage: PipelineStage<T>): this {
    this.stages.push(stage);
    return this;
  }

  execute(data: T): T {
    return this.stages.reduce((current, stage) => {
      if (stage.condition && !stage.condition(current)) return current;
      return stage.transform(current);
    }, data);
  }

  executeBatch(items: T[]): T[] {
    return items.map(item => this.execute(item));
  }

  getStageNames(): string[] {
    return this.stages.map(s => s.name);
  }

  get stageCount(): number {
    return this.stages.length;
  }
}

// Stock data normalizer
interface RawStockData {
  code: string;
  name: string;
  price: string | number;
  change: string | number;
  volume: string | number;
  turnover: string | number;
  high: string | number;
  low: string | number;
  open: string | number;
  prevClose: string | number;
}

interface NormalizedStockData {
  code: string;
  name: string;
  market: 'SH' | 'SZ' | 'BJ';
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  turnover: number;
  high: number;
  low: number;
  open: number;
  prevClose: number;
  amplitude: number;
  isUp: boolean;
  isDown: boolean;
  isFlat: boolean;
}

function detectMarket(code: string): 'SH' | 'SZ' | 'BJ' {
  if (code.startsWith('6') || code.startsWith('9')) return 'SH';
  if (code.startsWith('8') || code.startsWith('4')) return 'BJ';
  return 'SZ';
}

function normalizeStock(raw: RawStockData): NormalizedStockData {
  const price = Number(raw.price);
  const prevClose = Number(raw.prevClose);
  const change = price - prevClose;
  const changePercent = prevClose !== 0 ? (change / prevClose) * 100 : 0;
  const high = Number(raw.high);
  const low = Number(raw.low);
  const amplitude = low !== 0 ? ((high - low) / low) * 100 : 0;

  return {
    code: raw.code,
    name: raw.name.trim(),
    market: detectMarket(raw.code),
    price,
    change: Number(change.toFixed(2)),
    changePercent: Number(changePercent.toFixed(2)),
    volume: Number(raw.volume),
    turnover: Number(raw.turnover),
    high,
    low,
    open: Number(raw.open),
    prevClose,
    amplitude: Number(amplitude.toFixed(2)),
    isUp: change > 0,
    isDown: change < 0,
    isFlat: change === 0,
  };
}

// Batch processor
function processBatch<T, R>(items: T[], processor: (item: T) => R, batchSize: number): R[] {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    results.push(...batch.map(processor));
  }
  return results;
}

// Deduplication
function deduplicateByKey<T>(items: T[], keyFn: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter(item => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Aggregation
function aggregateByField<T>(items: T[], fieldFn: (item: T) => string): Record<string, T[]> {
  return items.reduce((acc, item) => {
    const key = fieldFn(item);
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {} as Record<string, T[]>);
}

describe('Data Transform Pipeline', () => {
  it('should execute stages in order', () => {
    const pipeline = new DataPipeline<number>();
    pipeline
      .addStage({ name: 'add1', transform: (n) => n + 1 })
      .addStage({ name: 'multiply2', transform: (n) => n * 2 })
      .addStage({ name: 'subtract3', transform: (n) => n - 3 });

    expect(pipeline.execute(5)).toBe(9); // (5+1)*2-3 = 9
  });

  it('should skip stages when condition is false', () => {
    const pipeline = new DataPipeline<number>();
    pipeline.addStage({
      name: 'conditional',
      transform: (n) => n * 10,
      condition: (n) => n > 0,
    });

    expect(pipeline.execute(5)).toBe(50);
    expect(pipeline.execute(-5)).toBe(-5);
  });

  it('should execute batch processing', () => {
    const pipeline = new DataPipeline<number>();
    pipeline.addStage({ name: 'double', transform: (n) => n * 2 });
    expect(pipeline.executeBatch([1, 2, 3])).toEqual([2, 4, 6]);
  });

  it('should return stage names', () => {
    const pipeline = new DataPipeline<number>();
    pipeline
      .addStage({ name: 'a', transform: (n) => n })
      .addStage({ name: 'b', transform: (n) => n });
    expect(pipeline.getStageNames()).toEqual(['a', 'b']);
  });

  it('should report stage count', () => {
    const pipeline = new DataPipeline<number>();
    expect(pipeline.stageCount).toBe(0);
    pipeline.addStage({ name: 'x', transform: (n) => n });
    expect(pipeline.stageCount).toBe(1);
  });

  it('should handle empty pipeline', () => {
    const pipeline = new DataPipeline<number>();
    expect(pipeline.execute(42)).toBe(42);
  });

  it('should chain with fluent API', () => {
    const result = new DataPipeline<string>()
      .addStage({ name: 'upper', transform: (s) => s.toUpperCase() })
      .addStage({ name: 'exclaim', transform: (s) => s + '!' })
      .execute('hello');
    expect(result).toBe('HELLO!');
  });
});

describe('Stock Data Normalizer', () => {
  const raw: RawStockData = {
    code: '600519', name: '贵州茅台', price: '1800.50',
    change: '0', volume: '125000', turnover: '225062500',
    high: '1820.00', low: '1780.00', open: '1790.00', prevClose: '1795.00',
  };

  it('should normalize stock data correctly', () => {
    const normalized = normalizeStock(raw);
    expect(normalized.price).toBe(1800.50);
    expect(normalized.prevClose).toBe(1795.00);
    expect(normalized.change).toBe(5.50);
    expect(normalized.changePercent).toBeCloseTo(0.31, 1);
  });

  it('should detect SH market for code starting with 6', () => {
    expect(normalizeStock({ ...raw, code: '600000' }).market).toBe('SH');
    expect(normalizeStock({ ...raw, code: '900901' }).market).toBe('SH');
  });

  it('should detect SZ market for code starting with 0 or 3', () => {
    expect(normalizeStock({ ...raw, code: '000001' }).market).toBe('SZ');
    expect(normalizeStock({ ...raw, code: '300750' }).market).toBe('SZ');
  });

  it('should detect BJ market for code starting with 8 or 4', () => {
    expect(normalizeStock({ ...raw, code: '830001' }).market).toBe('BJ');
    expect(normalizeStock({ ...raw, code: '430001' }).market).toBe('BJ');
  });

  it('should calculate isUp/isDown/isFlat correctly', () => {
    const up = normalizeStock({ ...raw, price: '1900' });
    expect(up.isUp).toBe(true);
    expect(up.isDown).toBe(false);

    const down = normalizeStock({ ...raw, price: '1700' });
    expect(down.isUp).toBe(false);
    expect(down.isDown).toBe(true);

    const flat = normalizeStock({ ...raw, price: '1795' });
    expect(flat.isFlat).toBe(true);
  });

  it('should calculate amplitude', () => {
    const normalized = normalizeStock(raw);
    expect(normalized.amplitude).toBeGreaterThan(0);
  });

  it('should handle zero prevClose', () => {
    const normalized = normalizeStock({ ...raw, prevClose: '0' });
    expect(normalized.changePercent).toBe(0);
  });

  it('should handle zero low', () => {
    const normalized = normalizeStock({ ...raw, low: '0' });
    expect(normalized.amplitude).toBe(0);
  });

  it('should trim stock name', () => {
    const normalized = normalizeStock({ ...raw, name: '  贵州茅台  ' });
    expect(normalized.name).toBe('贵州茅台');
  });
});

describe('Batch Processing', () => {
  it('should process items in batches', () => {
    const items = [1, 2, 3, 4, 5, 6, 7];
    const results = processBatch(items, (n) => n * 2, 3);
    expect(results).toEqual([2, 4, 6, 8, 10, 12, 14]);
  });

  it('should handle exact batch size', () => {
    const results = processBatch([1, 2, 3], (n) => n, 3);
    expect(results).toHaveLength(3);
  });

  it('should handle empty array', () => {
    expect(processBatch([], (n) => n, 5)).toEqual([]);
  });

  it('should handle batch size larger than array', () => {
    expect(processBatch([1, 2], (n) => n, 10)).toEqual([1, 2]);
  });

  it('should handle batch size of 1', () => {
    expect(processBatch([1, 2, 3], (n) => n + 1, 1)).toEqual([2, 3, 4]);
  });
});

describe('Deduplication', () => {
  it('should remove duplicates by key', () => {
    const items = [
      { code: '600519', price: 1800 },
      { code: '000001', price: 12 },
      { code: '600519', price: 1810 },
    ];
    const result = deduplicateByKey(items, (i) => i.code);
    expect(result).toHaveLength(2);
    expect(result[0].price).toBe(1800); // keeps first
  });

  it('should handle no duplicates', () => {
    const items = [{ code: 'a' }, { code: 'b' }, { code: 'c' }];
    expect(deduplicateByKey(items, (i) => i.code)).toHaveLength(3);
  });

  it('should handle empty array', () => {
    expect(deduplicateByKey([], (i) => String(i))).toEqual([]);
  });

  it('should handle all duplicates', () => {
    const items = [{ id: 1 }, { id: 1 }, { id: 1 }];
    expect(deduplicateByKey(items, (i) => String(i.id))).toHaveLength(1);
  });
});

describe('Aggregation', () => {
  it('should group items by field', () => {
    const items = [
      { market: 'SH', code: '600519' },
      { market: 'SZ', code: '000001' },
      { market: 'SH', code: '601318' },
    ];
    const grouped = aggregateByField(items, (i) => i.market);
    expect(grouped['SH']).toHaveLength(2);
    expect(grouped['SZ']).toHaveLength(1);
  });

  it('should handle empty array', () => {
    expect(aggregateByField([], (i) => String(i))).toEqual({});
  });

  it('should handle single group', () => {
    const items = [{ type: 'A', val: 1 }, { type: 'A', val: 2 }];
    const grouped = aggregateByField(items, (i) => i.type);
    expect(Object.keys(grouped)).toHaveLength(1);
  });
});
