import { describe, it, expect } from 'vitest'

// 图表渲染引擎逻辑测试
describe('Chart Rendering Engine Logic', () => {
  // 颜色插值
  function interpolateColor(color1: string, color2: string, factor: number) {
    const parse = (c: string) => {
      const m = c.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i)
      return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [0, 0, 0]
    }
    const c1 = parse(color1), c2 = parse(color2)
    const r = Math.round(c1[0] + (c2[0] - c1[0]) * factor)
    const g = Math.round(c1[1] + (c2[1] - c1[1]) * factor)
    const b = Math.round(c1[2] + (c2[2] - c1[2]) * factor)
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
  }

  it('should return first color at factor 0', () => {
    expect(interpolateColor('#ff0000', '#0000ff', 0)).toBe('#ff0000')
  })

  it('should return second color at factor 1', () => {
    expect(interpolateColor('#ff0000', '#0000ff', 1)).toBe('#0000ff')
  })

  it('should interpolate mid-point', () => {
    const result = interpolateColor('#000000', '#ffffff', 0.5)
    expect(result).toMatch(/^#[0-9a-f]{6}$/)
  })

  // 热力图颜色映射
  function heatmapColor(value: number, min: number, max: number) {
    const ratio = max > min ? (value - min) / (max - min) : 0.5
    if (ratio === 0.5) return '#9e9e9e'
    if (ratio > 0.6) return '#d32f2f'  // red
    if (ratio > 0.5) return '#f44336'
    if (ratio > 0.45) return '#ff9800'
    if (ratio > 0.4) return '#ffc107'
    if (ratio > 0.35) return '#cddc39'
    if (ratio > 0.3) return '#8bc34a'
    if (ratio > 0.2) return '#4caf50'
    return '#1b5e20'
  }

  it('should return red for high values', () => {
    expect(heatmapColor(95, 0, 100)).toBe('#d32f2f')
  })

  it('should return green for low values', () => {
    expect(heatmapColor(5, 0, 100)).toBe('#1b5e20')
  })

  it('should return gray for neutral', () => {
    expect(heatmapColor(50, 0, 100)).toBe('#9e9e9e')
  })

  it('should handle min=max', () => {
    expect(heatmapColor(5, 5, 5)).toMatch(/^#/)
  })

  // 坐标轴刻度计算
  function calculateAxisTicks(min: number, max: number, tickCount = 5) {
    const range = max - min
    if (range <= 0) return [min]
    const roughStep = range / (tickCount - 1)
    const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)))
    const candidates = [1, 2, 2.5, 5, 10].map(m => m * magnitude)
    const step = candidates.find(c => c >= roughStep) || candidates[candidates.length - 1]
    const ticks: number[] = []
    let tick = Math.floor(min / step) * step
    while (tick <= max + step * 0.001) {
      ticks.push(parseFloat(tick.toFixed(10)))
      tick += step
    }
    return ticks
  }

  it('should generate evenly spaced ticks', () => {
    const ticks = calculateAxisTicks(0, 100, 6)
    expect(ticks.length).toBeGreaterThanOrEqual(5)
    expect(ticks[0]).toBeLessThanOrEqual(0)
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(100)
  })

  it('should handle small range', () => {
    const ticks = calculateAxisTicks(0, 0.1, 5)
    expect(ticks.length).toBeGreaterThanOrEqual(3)
  })

  it('should handle negative range', () => {
    const ticks = calculateAxisTicks(-50, 50, 5)
    expect(ticks.some(t => t < 0)).toBe(true)
    expect(ticks.some(t => t > 0)).toBe(true)
  })

  // K线蜡烛图数据转换
  function klineToCandleData(kline: { open: number; close: number; high: number; low: number }) {
    const isUp = kline.close >= kline.open
    const bodyTop = Math.max(kline.open, kline.close)
    const bodyBottom = Math.min(kline.open, kline.close)
    const bodyHeight = bodyTop - bodyBottom
    const upperShadow = kline.high - bodyTop
    const lowerShadow = bodyBottom - kline.low
    const totalRange = kline.high - kline.low
    const bodyRatio = totalRange > 0 ? bodyHeight / totalRange : 0
    const isDoji = bodyHeight / Math.max(kline.open, kline.close) < 0.001
    return { isUp, bodyTop, bodyBottom, bodyHeight, upperShadow, lowerShadow, bodyRatio, isDoji }
  }

  it('should calculate candle for bullish bar', () => {
    const result = klineToCandleData({ open: 10, close: 12, high: 13, low: 9 })
    expect(result.isUp).toBe(true)
    expect(result.bodyTop).toBe(12)
    expect(result.bodyBottom).toBe(10)
    expect(result.upperShadow).toBe(1)
    expect(result.lowerShadow).toBe(1)
  })

  it('should calculate candle for bearish bar', () => {
    const result = klineToCandleData({ open: 12, close: 10, high: 13, low: 9 })
    expect(result.isUp).toBe(false)
    expect(result.bodyTop).toBe(12)
    expect(result.bodyBottom).toBe(10)
  })

  it('should detect doji', () => {
    const result = klineToCandleData({ open: 10, close: 10.005, high: 11, low: 9 })
    expect(result.isDoji).toBe(true)
  })

  it('should handle zero range', () => {
    const result = klineToCandleData({ open: 10, close: 10, high: 10, low: 10 })
    expect(result.bodyRatio).toBe(0)
    expect(result.isDoji).toBe(true)
  })

  // 图表图例生成
  function generateLegend(indicators: Array<{ name: string; color: string; visible: boolean }>) {
    return indicators
      .filter(i => i.visible)
      .map(i => ({ label: i.name, color: i.color }))
  }

  it('should generate visible indicators only', () => {
    const legend = generateLegend([
      { name: 'MA5', color: '#ff0000', visible: true },
      { name: 'MA10', color: '#00ff00', visible: false },
      { name: 'MA20', color: '#0000ff', visible: true },
    ])
    expect(legend).toHaveLength(2)
    expect(legend[0].label).toBe('MA5')
  })

  // 十字光标数据查找
  function findNearestPoint(mouseX: number, chartWidth: number, dataLength: number, dataIndex: number) {
    const pointWidth = chartWidth / dataLength
    const nearestIndex = Math.round(mouseX / pointWidth)
    return Math.max(0, Math.min(nearestIndex, dataLength - 1))
  }

  it('should find nearest point', () => {
    expect(findNearestPoint(100, 400, 10, 0)).toBe(3)  // 100/40 = 2.5 → 3
  })

  it('should clamp to first', () => {
    expect(findNearestPoint(-10, 400, 10, 0)).toBe(0)
  })

  it('should clamp to last', () => {
    expect(findNearestPoint(500, 400, 10, 0)).toBe(9)
  })

  // 缩放范围计算
  function calculateZoomRange(dataLength: number, zoomLevel: number, center: number) {
    const visibleCount = Math.max(2, Math.floor(dataLength / zoomLevel))
    const startIndex = Math.max(0, Math.floor(center - visibleCount / 2))
    const endIndex = Math.min(dataLength - 1, startIndex + visibleCount)
    return { startIndex, endIndex, visibleCount }
  }

  it('should calculate zoom range', () => {
    const result = calculateZoomRange(100, 2, 50)
    expect(result.visibleCount).toBe(50)
    expect(result.startIndex).toBeGreaterThanOrEqual(0)
    expect(result.endIndex).toBeLessThan(100)
  })

  it('should handle zoom all out', () => {
    const result = calculateZoomRange(100, 1, 50)
    expect(result.visibleCount).toBe(100)
  })

  // 成交量高度计算
  function calculateVolumeBars(volumes: number[], maxHeight: number) {
    const max = Math.max(...volumes)
    return volumes.map(v => max > 0 ? (v / max) * maxHeight : 0)
  }

  it('should normalize volumes to max height', () => {
    const bars = calculateVolumeBars([100, 200, 300], 100)
    expect(bars[0]).toBeCloseTo(33.33, 1)
    expect(bars[1]).toBeCloseTo(66.67, 1)
    expect(bars[2]).toBe(100)
  })

  it('should handle zero volumes', () => {
    const bars = calculateVolumeBars([0, 0, 0], 100)
    expect(bars).toEqual([0, 0, 0])
  })

  // 双Y轴刻度对齐
  function alignDualAxis(leftRange: [number, number], rightRange: [number, number]) {
    const leftTicks = 5
    const rightTicks = 5
    const leftStep = (leftRange[1] - leftRange[0]) / (leftTicks - 1)
    const rightStep = (rightRange[1] - rightRange[0]) / (rightTicks - 1)
    return {
      left: Array.from({ length: leftTicks }, (_, i) => leftRange[0] + i * leftStep),
      right: Array.from({ length: rightTicks }, (_, i) => rightRange[0] + i * rightStep),
    }
  }

  it('should generate aligned ticks for both axes', () => {
    const result = alignDualAxis([0, 100], [10, 50])
    expect(result.left).toHaveLength(5)
    expect(result.right).toHaveLength(5)
    expect(result.left[0]).toBe(0)
    expect(result.left[4]).toBe(100)
  })

  // 工具提示位置计算
  function tooltipPosition(mouseX: number, mouseY: number, tooltipW: number, tooltipH: number, containerW: number, containerH: number) {
    let x = mouseX + 15
    let y = mouseY - tooltipH / 2
    if (x + tooltipW > containerW) x = mouseX - tooltipW - 15
    if (y < 0) y = 5
    if (y + tooltipH > containerH) y = containerH - tooltipH - 5
    return { x, y }
  }

  it('should place tooltip to right by default', () => {
    const pos = tooltipPosition(100, 100, 80, 40, 500, 300)
    expect(pos.x).toBe(115)
    expect(pos.y).toBe(80)
  })

  it('should flip to left when near right edge', () => {
    const pos = tooltipPosition(450, 100, 80, 40, 500, 300)
    expect(pos.x).toBe(355)
  })

  it('should clamp to container top', () => {
    const pos = tooltipPosition(100, 5, 80, 40, 500, 300)
    expect(pos.y).toBeGreaterThanOrEqual(5)
  })

  it('should clamp to container bottom', () => {
    const pos = tooltipPosition(100, 290, 80, 40, 500, 300)
    expect(pos.y + 40).toBeLessThanOrEqual(300)
  })
})
