import { describe, it, expect } from 'vitest'

// 前端数据可视化辅助工具测试
describe('Data Visualization Helpers', () => {
  // 数据归一化到 0-1
  function normalize(data: number[]): number[] {
    const min = Math.min(...data)
    const max = Math.max(...data)
    const range = max - min
    return range === 0 ? data.map(() => 0.5) : data.map(v => (v - min) / range)
  }

  it('should normalize to 0-1 range', () => {
    const result = normalize([10, 20, 30, 40, 50])
    expect(result[0]).toBe(0)
    expect(result[4]).toBe(1)
    expect(result[2]).toBeCloseTo(0.5)
  })

  it('should handle identical values', () => {
    const result = normalize([5, 5, 5])
    expect(result.every(v => v === 0.5)).toBe(true)
  })

  // 移动平均线
  function movingAverage(data: number[], period: number): (number | null)[] {
    if (period <= 0 || data.length === 0) return []
    return data.map((_, i) => {
      if (i < period - 1) return null
      const slice = data.slice(i - period + 1, i + 1)
      return slice.reduce((s, v) => s + v, 0) / period
    })
  }

  it('should calculate MA correctly', () => {
    const ma = movingAverage([1, 2, 3, 4, 5], 3)
    expect(ma[0]).toBeNull()
    expect(ma[1]).toBeNull()
    expect(ma[2]).toBeCloseTo(2)
    expect(ma[4]).toBeCloseTo(4)
  })

  it('should handle period 1', () => {
    const ma = movingAverage([10, 20], 1)
    expect(ma).toEqual([10, 20])
  })

  // 指数移动平均
  function ema(data: number[], period: number): (number | null)[] {
    if (period <= 0 || data.length === 0) return []
    const k = 2 / (period + 1)
    const result: (number | null)[] = data.map(() => null)
    if (data.length < period) return result
    result[period - 1] = data.slice(0, period).reduce((s, v) => s + v, 0) / period
    for (let i = period; i < data.length; i++) {
      result[i] = data[i] * k + (result[i - 1] as number) * (1 - k)
    }
    return result
  }

  it('should calculate EMA', () => {
    const result = ema([1, 2, 3, 4, 5], 3)
    expect(result[0]).toBeNull()
    expect(result[1]).toBeNull()
    expect(result[2]).toBeCloseTo(2)
  })

  // 标准差
  function stddev(data: number[]): number {
    if (data.length < 2) return 0
    const mean = data.reduce((s, v) => s + v, 0) / data.length
    const variance = data.reduce((s, v) => s + (v - mean) ** 2, 0) / (data.length - 1)
    return Math.sqrt(variance)
  }

  it('should calculate standard deviation', () => {
    expect(stddev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 2)
  })

  it('should return 0 for single value', () => {
    expect(stddev([5])).toBe(0)
  })

  // 百分位数
  function percentile(data: number[], p: number): number {
    if (data.length === 0) return 0
    const sorted = [...data].sort((a, b) => a - b)
    const idx = (p / 100) * (sorted.length - 1)
    const lower = Math.floor(idx)
    const upper = Math.ceil(idx)
    if (lower === upper) return sorted[lower]
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower)
  }

  it('should calculate median (50th percentile)', () => {
    expect(percentile([1, 2, 3, 4, 5], 50)).toBe(3)
  })

  it('should calculate min (0th percentile)', () => {
    expect(percentile([10, 20, 30], 0)).toBe(10)
  })

  it('should calculate max (100th percentile)', () => {
    expect(percentile([10, 20, 30], 100)).toBe(30)
  })

  // 散点图最佳拟合线
  function linearRegression(x: number[], y: number[]) {
    const n = x.length
    if (n < 2) return { slope: 0, intercept: 0, r2: 0 }
    const sx = x.reduce((s, v) => s + v, 0)
    const sy = y.reduce((s, v) => s + v, 0)
    const sxy = x.reduce((s, v, i) => s + v * y[i], 0)
    const sxx = x.reduce((s, v) => s + v * v, 0)
    const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx)
    const intercept = (sy - slope * sx) / n
    const meanY = sy / n
    const ssTot = y.reduce((s, v) => s + (v - meanY) ** 2, 0)
    const ssRes = y.reduce((s, v, i) => s + (v - (slope * x[i] + intercept)) ** 2, 0)
    const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 1
    return { slope, intercept, r2 }
  }

  it('should fit perfect line', () => {
    const result = linearRegression([1, 2, 3], [2, 4, 6])
    expect(result.slope).toBeCloseTo(2, 5)
    expect(result.intercept).toBeCloseTo(0, 5)
    expect(result.r2).toBeCloseTo(1, 5)
  })

  it('should handle constant y', () => {
    const result = linearRegression([1, 2, 3], [5, 5, 5])
    expect(result.slope).toBeCloseTo(0, 5)
  })

  // 数据插值
  function linearInterpolate(x: number, x1: number, y1: number, x2: number, y2: number) {
    if (x1 === x2) return y1
    return y1 + (y2 - y1) * ((x - x1) / (x2 - x1))
  }

  it('should interpolate mid-point', () => {
    expect(linearInterpolate(1.5, 1, 10, 2, 20)).toBe(15)
  })

  it('should return exact start value', () => {
    expect(linearInterpolate(1, 1, 10, 2, 20)).toBe(10)
  })

  // 堆叠数据计算
  function stackData(series: number[][]) {
    if (series.length === 0) return []
    const len = series[0].length
    const result: number[][] = []
    for (let i = 0; i < len; i++) {
      let sum = 0
      const point: number[] = []
      for (const s of series) {
        sum += s[i] || 0
        point.push(sum)
      }
      result.push(point)
    }
    return result
  }

  it('should stack series correctly', () => {
    const result = stackData([[1, 2, 3], [4, 5, 6]])
    expect(result[0]).toEqual([1, 5])
    expect(result[1]).toEqual([2, 7])
    expect(result[2]).toEqual([3, 9])
  })

  it('should handle empty series', () => {
    expect(stackData([])).toEqual([])
  })

  // 颜色渐变生成
  function generateGradient(startColor: string, endColor: string, steps: number) {
    const parse = (c: string) => {
      const m = c.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i)
      return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [0, 0, 0]
    }
    const start = parse(startColor), end = parse(endColor)
    return Array.from({ length: steps }, (_, i) => {
      const t = steps > 1 ? i / (steps - 1) : 0
      const r = Math.round(start[0] + (end[0] - start[0]) * t)
      const g = Math.round(start[1] + (end[1] - start[1]) * t)
      const b = Math.round(start[2] + (end[2] - start[2]) * t)
      return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
    })
  }

  it('should generate gradient colors', () => {
    const colors = generateGradient('#000000', '#ffffff', 3)
    expect(colors).toHaveLength(3)
    expect(colors[0]).toBe('#000000')
    expect(colors[2]).toBe('#ffffff')
  })

  it('should generate correct number of steps', () => {
    expect(generateGradient('#ff0000', '#0000ff', 10)).toHaveLength(10)
  })

  // 数据降采样 (均匀采样)
  function uniformSample<T>(data: T[], targetCount: number): T[] {
    if (data.length <= targetCount) return [...data]
    const step = data.length / targetCount
    const result = Array.from({ length: targetCount - 1 }, (_, i) => data[Math.floor(i * step)])
    result.push(data[data.length - 1]!)
    return result
  }

  it('should downsample data', () => {
    const data = Array.from({ length: 1000 }, (_, i) => i)
    expect(uniformSample(data, 100)).toHaveLength(100)
  })

  it('should keep all if target > length', () => {
    const data = [1, 2, 3]
    expect(uniformSample(data, 10)).toEqual([1, 2, 3])
  })

  it('should keep first and last approximately', () => {
    const data = Array.from({ length: 100 }, (_, i) => i)
    const sampled = uniformSample(data, 10)
    expect(sampled[0]).toBe(0)
    expect(sampled[sampled.length - 1]).toBe(99)
  })
})
