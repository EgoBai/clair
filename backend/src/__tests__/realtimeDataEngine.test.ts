import { describe, it, expect } from 'vitest'

// 实时数据聚合引擎测试
describe('Real-time Data Aggregation Engine', () => {
  // Tick 数据聚合为分钟线
  function aggregateTicksToMinute(ticks: Array<{ time: number; price: number; volume: number }>) {
    if (!ticks.length) return []
    const buckets: Record<number, any> = {}
    for (const tick of ticks) {
      const minuteKey = Math.floor(tick.time / 60000) * 60000
      if (!buckets[minuteKey]) {
        buckets[minuteKey] = { time: minuteKey, open: tick.price, high: tick.price, low: tick.price, close: tick.price, volume: 0 }
      }
      const b = buckets[minuteKey]
      b.high = Math.max(b.high, tick.price)
      b.low = Math.min(b.low, tick.price)
      b.close = tick.price
      b.volume += tick.volume
    }
    return Object.values(buckets).sort((a: any, b: any) => a.time - b.time)
  }

  it('should aggregate ticks into minute bars', () => {
    const ticks = [
      { time: 60000, price: 10.00, volume: 100 },
      { time: 61000, price: 10.10, volume: 200 },
      { time: 62000, price: 10.05, volume: 150 },
    ]
    const result = aggregateTicksToMinute(ticks)
    expect(result).toHaveLength(1)
    expect(result[0].open).toBe(10.00)
    expect(result[0].high).toBe(10.10)
    expect(result[0].low).toBe(10.00)
    expect(result[0].close).toBe(10.05)
    expect(result[0].volume).toBe(450)
  })

  it('should handle multiple minute buckets', () => {
    const ticks = [
      { time: 60000, price: 10.0, volume: 100 },
      { time: 120000, price: 10.5, volume: 200 },
      { time: 180000, price: 11.0, volume: 300 },
    ]
    const result = aggregateTicksToMinute(ticks)
    expect(result).toHaveLength(3)
  })

  it('should return empty for empty ticks', () => {
    expect(aggregateTicksToMinute([])).toEqual([])
  })

  // VWAP 计算
  function calculateVWAP(prices: number[], volumes: number[]) {
    if (prices.length !== volumes.length || prices.length === 0) return 0
    let totalPV = 0, totalV = 0
    for (let i = 0; i < prices.length; i++) {
      totalPV += prices[i] * volumes[i]
      totalV += volumes[i]
    }
    return totalV > 0 ? totalPV / totalV : 0
  }

  it('should calculate VWAP correctly', () => {
    expect(calculateVWAP([10, 11, 12], [100, 200, 300])).toBeCloseTo(11.333, 2)
  })

  it('should handle equal volumes', () => {
    expect(calculateVWAP([10, 20], [100, 100])).toBe(15)
  })

  it('should return 0 for zero volume', () => {
    expect(calculateVWAP([10, 20], [0, 0])).toBe(0)
  })

  it('should return 0 for mismatched arrays', () => {
    expect(calculateVWAP([10], [])).toBe(0)
  })

  // 实时数据流窗口计算
  function slidingWindow(data: number[], windowSize: number, calc: (w: number[]) => number) {
    if (data.length < windowSize) return []
    const results: number[] = []
    for (let i = 0; i <= data.length - windowSize; i++) {
      results.push(calc(data.slice(i, i + windowSize)))
    }
    return results
  }

  it('should calculate sliding window average', () => {
    const avg = (w: number[]) => w.reduce((s, v) => s + v, 0) / w.length
    expect(slidingWindow([1, 2, 3, 4, 5], 3, avg)).toEqual([2, 3, 4])
  })

  it('should return empty when data < window', () => {
    expect(slidingWindow([1, 2], 3, (w: number[]) => Math.max(...w))).toEqual([])
  })

  it('should calculate sliding window max', () => {
    expect(slidingWindow([3, 1, 4, 1, 5], 2, w => Math.max(...w))).toEqual([3, 4, 4, 5])
  })

  // 数据流去重
  function dedupByTimeAndSymbol(data: Array<{ time: number; symbol: string; price: number }>) {
    const seen = new Set<string>()
    return data.filter(d => {
      const key = `${d.symbol}_${d.time}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }

  it('should deduplicate by time and symbol', () => {
    const data = [
      { time: 1, symbol: '600519', price: 100 },
      { time: 1, symbol: '600519', price: 101 },
      { time: 1, symbol: '000001', price: 50 },
      { time: 2, symbol: '600519', price: 102 },
    ]
    expect(dedupByTimeAndSymbol(data)).toHaveLength(3)
  })

  it('should keep all unique records', () => {
    const data = [
      { time: 1, symbol: 'A', price: 10 },
      { time: 2, symbol: 'B', price: 20 },
    ]
    expect(dedupByTimeAndSymbol(data)).toHaveLength(2)
  })

  // 实时涨跌停检测
  function detectPriceLimit(price: number, prevClose: number, isST = false) {
    const limit = isST ? 0.05 : 0.10
    const change = (price - prevClose) / prevClose
    if (Math.abs(change) >= limit - 0.001) {
      return change > 0 ? '涨停' : '跌停'
    }
    return '正常'
  }

  it('should detect 涨停', () => {
    expect(detectPriceLimit(110, 100)).toBe('涨停')
  })

  it('should detect 跌停', () => {
    expect(detectPriceLimit(90, 100)).toBe('跌停')
  })

  it('should detect ST limit (5%)', () => {
    expect(detectPriceLimit(105, 100, true)).toBe('涨停')
    expect(detectPriceLimit(98, 100, true)).toBe('正常')
  })

  it('should handle normal trading', () => {
    expect(detectPriceLimit(103, 100)).toBe('正常')
  })

  // 批量行情快照
  function createQuoteSnapshot(quotes: Array<{ symbol: string; price: number; prevClose: number }>) {
    return quotes.map(q => ({
      ...q,
      change: q.price - q.prevClose,
      changePercent: ((q.price - q.prevClose) / q.prevClose * 100).toFixed(2),
      timestamp: Date.now(),
    }))
  }

  it('should create snapshot with calculated fields', () => {
    const snapshot = createQuoteSnapshot([
      { symbol: '600519', price: 1800, prevClose: 1750 },
    ])
    expect(snapshot[0].change).toBe(50)
    expect(snapshot[0].changePercent).toBe('2.86')
  })

  it('should handle negative change', () => {
    const snapshot = createQuoteSnapshot([
      { symbol: '000001', price: 10, prevClose: 11 },
    ])
    expect(snapshot[0].change).toBe(-1)
    expect(parseFloat(snapshot[0].changePercent)).toBeLessThan(0)
  })

  // 数据流采样 (每N条取一条)
  function sampleData<T>(data: T[], rate: number): T[] {
    if (rate <= 0 || data.length === 0) return []
    return data.filter((_, i) => i % rate === 0)
  }

  it('should sample data at given rate', () => {
    expect(sampleData([1, 2, 3, 4, 5, 6], 2)).toEqual([1, 3, 5])
  })

  it('should return all when rate is 1', () => {
    expect(sampleData([1, 2, 3], 1)).toEqual([1, 2, 3])
  })

  it('should return empty for invalid rate', () => {
    expect(sampleData([1, 2, 3], 0)).toEqual([])
  })

  // 异常波动检测
  function detectVolatilityAnomaly(prices: number[], threshold = 0.03) {
    const anomalies: number[] = []
    for (let i = 1; i < prices.length; i++) {
      const change = Math.abs((prices[i] - prices[i - 1]) / prices[i - 1])
      if (change > threshold) anomalies.push(i)
    }
    return anomalies
  }

  it('should detect price spikes', () => {
    expect(detectVolatilityAnomaly([100, 101, 105, 106])).toEqual([2])
  })

  it('should return empty for stable prices', () => {
    expect(detectVolatilityAnomaly([100, 100.5, 101, 101.5])).toEqual([])
  })

  it('should detect multiple anomalies', () => {
    expect(detectVolatilityAnomaly([100, 110, 112, 90])).toContain(1)
    expect(detectVolatilityAnomaly([100, 110, 112, 90])).toContain(3)
  })

  // 实时数据缓冲区
  class DataBuffer<T> {
    private buffer: T[] = []
    constructor(private maxSize: number) {}
    push(item: T) {
      this.buffer.push(item)
      if (this.buffer.length > this.maxSize) this.buffer.shift()
    }
    getAll() { return [...this.buffer] }
    latest() { return this.buffer[this.buffer.length - 1] }
    size() { return this.buffer.length }
    clear() { this.buffer = [] }
  }

  it('should respect max size', () => {
    const buf = new DataBuffer<number>(3)
    buf.push(1); buf.push(2); buf.push(3); buf.push(4)
    expect(buf.getAll()).toEqual([2, 3, 4])
    expect(buf.size()).toBe(3)
  })

  it('should return latest', () => {
    const buf = new DataBuffer<string>(5)
    buf.push('a'); buf.push('b')
    expect(buf.latest()).toBe('b')
  })

  it('should clear buffer', () => {
    const buf = new DataBuffer<number>(10)
    buf.push(1); buf.clear()
    expect(buf.size()).toBe(0)
  })
})
