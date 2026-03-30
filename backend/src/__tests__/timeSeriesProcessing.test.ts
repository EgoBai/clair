import { describe, it, expect } from 'vitest'

// 时序数据处理引擎测试
describe('Time Series Processing Engine', () => {
  // 时间序列重采样
  function resample(data: Array<{ time: number; value: number }>, interval: number) {
    if (data.length === 0) return []
    const buckets: Record<number, number[]> = {}
    for (const d of data) {
      const key = Math.floor(d.time / interval) * interval
      if (!buckets[key]) buckets[key] = []
      buckets[key].push(d.value)
    }
    return Object.entries(buckets).map(([time, values]) => ({
      time: Number(time),
      open: values[0],
      high: Math.max(...values),
      low: Math.min(...values),
      close: values[values.length - 1],
      avg: values.reduce((s, v) => s + v, 0) / values.length,
      count: values.length,
    })).sort((a, b) => a.time - b.time)
  }

  it('should resample to intervals', () => {
    const data = [
      { time: 0, value: 10 }, { time: 1, value: 12 },
      { time: 2, value: 11 }, { time: 5, value: 15 },
    ]
    const result = resample(data, 5)
    expect(result).toHaveLength(2)
    expect(result[0].open).toBe(10)
    expect(result[0].high).toBe(12)
    expect(result[0].close).toBe(11)
    expect(result[0].count).toBe(3)
  })

  it('should handle empty data', () => {
    expect(resample([], 60)).toEqual([])
  })

  // 缺失值填充
  function fillMissingGaps(data: Array<{ time: number; value: number | null }>, interval: number, method: 'forward' | 'linear' | 'zero' = 'forward') {
    if (data.length === 0) return []
    const result: Array<{ time: number; value: number }> = []
    for (let i = 0; i < data.length; i++) {
      if (data[i].value !== null) {
        result.push({ time: data[i].time, value: data[i].value as number })
      } else if (method === 'forward' && result.length > 0) {
        result.push({ time: data[i].time, value: result[result.length - 1].value })
      } else if (method === 'zero') {
        result.push({ time: data[i].time, value: 0 })
      } else if (method === 'linear' && i > 0 && i < data.length - 1) {
        const prev = data[i - 1].value ?? 0
        const next = data[i + 1].value ?? prev
        result.push({ time: data[i].time, value: (prev + next) / 2 })
      }
    }
    return result
  }

  it('should forward fill missing values', () => {
    const data = [{ time: 0, value: 10 }, { time: 1, value: null }, { time: 2, value: 20 }]
    const result = fillMissingGaps(data, 1, 'forward')
    expect(result[1].value).toBe(10)
  })

  it('should zero fill', () => {
    const data = [{ time: 0, value: 10 }, { time: 1, value: null }]
    const result = fillMissingGaps(data, 1, 'zero')
    expect(result[1].value).toBe(0)
  })

  it('should linear interpolate', () => {
    const data = [{ time: 0, value: 10 }, { time: 1, value: null }, { time: 2, value: 20 }]
    const result = fillMissingGaps(data, 1, 'linear')
    expect(result[1].value).toBe(15)
  })

  // 差分计算
  function difference(data: number[], order = 1): number[] {
    if (order <= 0 || data.length <= 1) return data
    const diff = data.slice(1).map((v, i) => v - data[i])
    return order > 1 ? difference(diff, order - 1) : diff
  }

  it('should calculate first difference', () => {
    expect(difference([1, 3, 6, 10])).toEqual([2, 3, 4])
  })

  it('should calculate second difference', () => {
    expect(difference([1, 3, 6, 10], 2)).toEqual([1, 1])
  })

  // 累计求和
  function cumulativeSum(data: number[]): number[] {
    let sum = 0
    return data.map(v => sum += v)
  }

  it('should calculate cumulative sum', () => {
    expect(cumulativeSum([1, 2, 3, 4])).toEqual([1, 3, 6, 10])
  })

  // 滚动最大值/最小值
  function rollingMax(data: number[], window: number): (number | null)[] {
    return data.map((_, i) => {
      if (i < window - 1) return null
      return Math.max(...data.slice(i - window + 1, i + 1))
    })
  }

  function rollingMin(data: number[], window: number): (number | null)[] {
    return data.map((_, i) => {
      if (i < window - 1) return null
      return Math.min(...data.slice(i - window + 1, i + 1))
    })
  }

  it('should calculate rolling max', () => {
    const result = rollingMax([1, 5, 3, 8, 2], 3)
    expect(result).toEqual([null, null, 5, 8, 8])
  })

  it('should calculate rolling min', () => {
    const result = rollingMin([1, 5, 3, 8, 2], 3)
    expect(result).toEqual([null, null, 1, 3, 2])
  })

  // 变化率计算
  function rateOfChange(data: number[], period = 1): (number | null)[] {
    return data.map((v, i) => i < period ? null : ((v - data[i - period]) / data[i - period]) * 100)
  }

  it('should calculate rate of change', () => {
    const result = rateOfChange([100, 110, 120], 1)
    expect(result[0]).toBeNull()
    expect(result[1]).toBeCloseTo(10)
    expect(result[2]).toBeCloseTo(9.09, 1)
  })

  // 数据对齐
  function alignSeries(seriesA: Array<{ time: number; value: number }>, seriesB: Array<{ time: number; value: number }>) {
    const mapB = new Map(seriesB.map(s => [s.time, s.value]))
    return seriesA
      .filter(a => mapB.has(a.time))
      .map(a => ({ time: a.time, a: a.value, b: mapB.get(a.time)! }))
  }

  it('should align series by time', () => {
    const a = [{ time: 1, value: 10 }, { time: 2, value: 20 }, { time: 3, value: 30 }]
    const b = [{ time: 2, value: 200 }, { time: 3, value: 300 }]
    expect(alignSeries(a, b)).toEqual([
      { time: 2, a: 20, b: 200 },
      { time: 3, a: 30, b: 300 },
    ])
  })

  // 时区转换
  function utcToLocal(utcTimestamp: number, offsetHours: number) {
    return utcTimestamp + offsetHours * 3600000
  }

  it('should convert UTC to CST (+8)', () => {
    const utc = new Date('2026-03-24T02:00:00Z').getTime()
    const local = utcToLocal(utc, 8)
    expect(new Date(local).getUTCHours()).toBe(10)
  })

  // 交易日历
  function isBusinessDay(date: Date) {
    const day = date.getDay()
    return day !== 0 && day !== 6
  }

  function addBusinessDays(date: Date, days: number) {
    const result = new Date(date)
    while (days > 0) {
      result.setDate(result.getDate() + 1)
      if (isBusinessDay(result)) days--
    }
    return result
  }

  it('should skip weekends when adding business days', () => {
    const friday = new Date('2026-03-20')  // Friday
    const nextBizDay = addBusinessDays(friday, 1)
    expect(nextBizDay.getDay()).toBe(1)  // Monday
  })

  it('should count multiple business days', () => {
    const start = new Date('2026-03-20')
    const result = addBusinessDays(start, 5)
    expect(result.getDay()).toBeGreaterThanOrEqual(1)
    expect(result.getDay()).toBeLessThanOrEqual(5)
  })

  // 数据压缩 (Delta编码)
  function deltaEncode(data: number[]): number[] {
    if (data.length === 0) return []
    return [data[0], ...data.slice(1).map((v, i) => v - data[i])]
  }

  function deltaDecode(encoded: number[]): number[] {
    if (encoded.length === 0) return []
    const result = [encoded[0]]
    for (let i = 1; i < encoded.length; i++) result.push(result[i - 1] + encoded[i])
    return result
  }

  it('should encode and decode round-trip', () => {
    const original = [100, 105, 103, 108, 110]
    const encoded = deltaEncode(original)
    expect(deltaDecode(encoded)).toEqual(original)
  })

  it('should compress similar values', () => {
    const encoded = deltaEncode([100, 101, 102, 103])
    expect(encoded).toEqual([100, 1, 1, 1])
  })

  // 季节性分解 (简化)
  function detrend(data: number[], period: number): number[] {
    const trend = rollingMax(data, period).map((v, i) => v ?? data[i])
    return data.map((v, i) => v - (trend[i] ?? 0))
  }

  it('should remove trend component', () => {
    const data = [10, 20, 30, 40, 50]
    const detrended = detrend(data, 3)
    expect(detrended.length).toBe(data.length)
  })
})
