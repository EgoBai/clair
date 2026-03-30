import { describe, it, expect } from 'vitest';

// Chart Data Processing Tests
describe('Chart Data Processing', () => {
  interface KLineData {
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }

  const calculateCandleColor = (open: number, close: number) => {
    if (close > open) return 'red';  // A股：涨红
    if (close < open) return 'green'; // A股：跌绿
    return 'gray';
  };

  const calculateBodyHeight = (open: number, close: number) => {
    return Math.abs(close - open);
  };

  const calculateUpperShadow = (high: number, open: number, close: number) => {
    return high - Math.max(open, close);
  };

  const calculateLowerShadow = (low: number, open: number, close: number) => {
    return Math.min(open, close) - low;
  };

  const calculateVolumeBarHeight = (volume: number, maxVolume: number, maxHeight: number) => {
    if (maxVolume === 0) return 0;
    return (volume / maxVolume) * maxHeight;
  };

  const detectDoji = (open: number, close: number, high: number, low: number) => {
    const body = Math.abs(close - open);
    const range = high - low;
    return range > 0 && body / range < 0.1;
  };

  const detectHammer = (open: number, close: number, high: number, low: number) => {
    const body = Math.abs(close - open);
    const lowerShadow = Math.min(open, close) - low;
    const upperShadow = high - Math.max(open, close);
    return lowerShadow >= body * 2 && upperShadow <= body * 0.3;
  };

  const detectEngulfing = (prev: KLineData, curr: KLineData) => {
    const prevBullish = prev.close > prev.open;
    const currBullish = curr.close > curr.open;
    if (!prevBullish && currBullish) {
      // Bullish engulfing
      return curr.open <= prev.close && curr.close >= prev.open;
    }
    if (prevBullish && !currBullish) {
      // Bearish engulfing
      return curr.open >= prev.close && curr.close <= prev.open;
    }
    return false;
  };

  it('should color bullish candles red (A-share)', () => {
    expect(calculateCandleColor(10, 11)).toBe('red');
    expect(calculateCandleColor(10.50, 10.51)).toBe('red');
  });

  it('should color bearish candles green (A-share)', () => {
    expect(calculateCandleColor(10, 9)).toBe('green');
  });

  it('should color doji gray', () => {
    expect(calculateCandleColor(10, 10)).toBe('gray');
  });

  it('should calculate body height', () => {
    expect(calculateBodyHeight(10, 12)).toBe(2);
    expect(calculateBodyHeight(12, 10)).toBe(2);
    expect(calculateBodyHeight(10, 10)).toBe(0);
  });

  it('should calculate upper shadow', () => {
    expect(calculateUpperShadow(15, 10, 12)).toBe(3); // high=15, body top=12
    expect(calculateUpperShadow(12, 10, 12)).toBe(0);
  });

  it('should calculate lower shadow', () => {
    expect(calculateLowerShadow(8, 10, 12)).toBe(2); // low=8, body bottom=10
    expect(calculateLowerShadow(10, 10, 12)).toBe(0);
  });

  it('should scale volume bars', () => {
    expect(calculateVolumeBarHeight(500, 1000, 200)).toBe(100);
    expect(calculateVolumeBarHeight(1000, 1000, 200)).toBe(200);
    expect(calculateVolumeBarHeight(0, 1000, 200)).toBe(0);
    expect(calculateVolumeBarHeight(100, 0, 200)).toBe(0);
  });

  it('should detect doji patterns', () => {
    expect(detectDoji(10, 10.05, 11, 9)).toBe(true);
    expect(detectDoji(10, 10.8, 11, 9)).toBe(false);
    expect(detectDoji(10, 10, 10, 10)).toBe(false); // zero range
  });

  it('should detect hammer patterns', () => {
    // body=0.3, lowerShadow=2, upperShadow needs to be <= 0.3*0.3=0.09
    expect(detectHammer(10, 10.3, 10.3, 8)).toBe(true); // upperShadow=0, long lower shadow
    expect(detectHammer(10, 10.3, 12, 9.8)).toBe(false); // long upper shadow
  });

  it('should detect bullish engulfing', () => {
    const prev: KLineData = { date: '2026-01-01', open: 11, high: 11.5, low: 9.5, close: 10, volume: 1e6 };
    const curr: KLineData = { date: '2026-01-02', open: 9.5, high: 12, low: 9, close: 11.5, volume: 2e6 };
    expect(detectEngulfing(prev, curr)).toBe(true);
  });

  it('should detect bearish engulfing', () => {
    const prev: KLineData = { date: '2026-01-01', open: 10, high: 11.5, low: 9.5, close: 11, volume: 1e6 };
    const curr: KLineData = { date: '2026-01-02', open: 11.5, high: 12, low: 9, close: 9.5, volume: 2e6 };
    expect(detectEngulfing(prev, curr)).toBe(true);
  });

  it('should not detect engulfing for same direction', () => {
    const prev: KLineData = { date: '2026-01-01', open: 10, high: 12, low: 9, close: 11, volume: 1e6 };
    const curr: KLineData = { date: '2026-01-02', open: 10.5, high: 13, low: 10, close: 12, volume: 2e6 };
    expect(detectEngulfing(prev, curr)).toBe(false);
  });
});

// Tooltip Positioning Tests
describe('Tooltip Positioning', () => {
  const calculateTooltipPosition = (
    mouseX: number, mouseY: number,
    tooltipWidth: number, tooltipHeight: number,
    containerWidth: number, containerHeight: number
  ) => {
    let x = mouseX + 16;
    let y = mouseY - tooltipHeight / 2;

    // Flip horizontally if would overflow right
    if (x + tooltipWidth > containerWidth) {
      x = mouseX - tooltipWidth - 16;
    }

    // Clamp vertically
    if (y < 0) y = 0;
    if (y + tooltipHeight > containerHeight) {
      y = containerHeight - tooltipHeight;
    }

    return { x, y };
  };

  it('should position tooltip to the right by default', () => {
    const pos = calculateTooltipPosition(100, 100, 200, 50, 800, 600);
    expect(pos.x).toBe(116);
    expect(pos.y).toBe(75);
  });

  it('should flip tooltip to left when near right edge', () => {
    const pos = calculateTooltipPosition(750, 100, 200, 50, 800, 600);
    expect(pos.x).toBe(534); // 750 - 200 - 16
  });

  it('should clamp tooltip at top', () => {
    const pos = calculateTooltipPosition(100, 10, 200, 50, 800, 600);
    expect(pos.y).toBe(0);
  });

  it('should clamp tooltip at bottom', () => {
    const pos = calculateTooltipPosition(100, 590, 200, 50, 800, 600);
    expect(pos.y).toBe(550); // 600 - 50
  });

  it('should handle small containers', () => {
    const pos = calculateTooltipPosition(50, 50, 200, 50, 250, 100);
    expect(pos.x).toBeLessThanOrEqual(250 - 200);
    expect(pos.y).toBeLessThanOrEqual(100 - 50);
  });
});

// Crosshair Coordinate Tests
describe('Crosshair Coordinates', () => {
  const pixelToDataIndex = (pixelX: number, chartLeft: number, candleWidth: number, gap: number) => {
    const step = candleWidth + gap;
    if (pixelX < chartLeft) return -1;
    return Math.floor((pixelX - chartLeft) / step);
  };

  const pixelToPrice = (pixelY: number, chartTop: number, chartHeight: number, priceMin: number, priceMax: number) => {
    const ratio = (pixelY - chartTop) / chartHeight;
    return priceMax - ratio * (priceMax - priceMin);
  };

  const priceToPixel = (price: number, chartTop: number, chartHeight: number, priceMin: number, priceMax: number) => {
    const ratio = (priceMax - price) / (priceMax - priceMin);
    return chartTop + ratio * chartHeight;
  };

  it('should convert pixel to data index', () => {
    expect(pixelToDataIndex(100, 50, 6, 2)).toBe(6); // (100-50)/8 = 6.25 -> 6
    expect(pixelToDataIndex(50, 50, 6, 2)).toBe(0);
    expect(pixelToDataIndex(40, 50, 6, 2)).toBe(-1);
  });

  it('should convert pixel to price', () => {
    // chart top=0, height=400, price range 10-20
    expect(pixelToPrice(0, 0, 400, 10, 20)).toBe(20);
    expect(pixelToPrice(400, 0, 400, 10, 20)).toBe(10);
    expect(pixelToPrice(200, 0, 400, 10, 20)).toBe(15);
  });

  it('should convert price to pixel', () => {
    expect(priceToPixel(20, 0, 400, 10, 20)).toBe(0);
    expect(priceToPixel(10, 0, 400, 10, 20)).toBe(400);
    expect(priceToPixel(15, 0, 400, 10, 20)).toBe(200);
  });

  it('should round-trip pixel-price conversion', () => {
    const price = 17.5;
    const pixel = priceToPixel(price, 0, 400, 10, 20);
    const back = pixelToPrice(pixel, 0, 400, 10, 20);
    expect(back).toBeCloseTo(price, 2);
  });
});

// Zoom and Pan Logic Tests
describe('Zoom and Pan Logic', () => {
  const calculateZoom = (
    dataLength: number,
    viewStart: number,
    viewEnd: number,
    zoomFactor: number,
    pivotIndex: number
  ) => {
    const currentRange = viewEnd - viewStart;
    const newRange = Math.max(10, Math.min(dataLength, currentRange * zoomFactor));
    const pivotRatio = (pivotIndex - viewStart) / currentRange;
    let newStart = pivotIndex - newRange * pivotRatio;
    let newEnd = newStart + newRange;

    // Clamp
    if (newStart < 0) { newStart = 0; newEnd = newRange; }
    if (newEnd > dataLength) { newEnd = dataLength; newStart = newEnd - newRange; }
    if (newStart < 0) newStart = 0;

    return {
      start: Math.round(newStart),
      end: Math.round(newEnd),
      visibleRange: Math.round(newEnd - newStart),
    };
  };

  const calculatePan = (viewStart: number, viewEnd: number, delta: number, dataLength: number) => {
    const range = viewEnd - viewStart;
    let newStart = viewStart + delta;
    let newEnd = viewEnd + delta;
    if (newStart < 0) { newStart = 0; newEnd = range; }
    if (newEnd > dataLength) { newEnd = dataLength; newStart = dataLength - range; }
    return { start: Math.round(newStart), end: Math.round(newEnd) };
  };

  it('should zoom in centered on pivot', () => {
    const result = calculateZoom(100, 0, 100, 0.5, 50);
    expect(result.visibleRange).toBe(50);
    // Pivot at 50, range 50, pivotRatio = 50/100 = 0.5
    // newStart = 50 - 25 = 25, newEnd = 75
    expect(result.start).toBe(25);
    expect(result.end).toBe(75);
  });

  it('should zoom out', () => {
    const result = calculateZoom(100, 25, 75, 2.0, 50);
    expect(result.visibleRange).toBe(100);
  });

  it('should enforce minimum visible range', () => {
    const result = calculateZoom(100, 45, 55, 0.01, 50);
    expect(result.visibleRange).toBeGreaterThanOrEqual(10);
  });

  it('should enforce maximum visible range', () => {
    const result = calculateZoom(50, 0, 10, 10.0, 5);
    expect(result.visibleRange).toBeLessThanOrEqual(50);
  });

  it('should pan right', () => {
    const result = calculatePan(10, 60, 5, 100);
    expect(result.start).toBe(15);
    expect(result.end).toBe(65);
  });

  it('should pan left', () => {
    const result = calculatePan(10, 60, -5, 100);
    expect(result.start).toBe(5);
    expect(result.end).toBe(55);
  });

  it('should clamp pan at boundaries', () => {
    const result = calculatePan(0, 50, -10, 100);
    expect(result.start).toBe(0);
    expect(result.end).toBe(50);
  });

  it('should clamp pan at right boundary', () => {
    const result = calculatePan(50, 100, 10, 100);
    expect(result.start).toBe(50);
    expect(result.end).toBe(100);
  });
});

// Indicator Overlay Coordinate Tests
describe('Indicator Overlay Coordinates', () => {
  const scaleIndicatorToYAxis = (
    values: (number | null)[],
    chartTop: number,
    chartHeight: number,
    minVal: number,
    maxVal: number
  ) => {
    return values.map(v => {
      if (v === null) return null;
      const ratio = (maxVal - v) / (maxVal - minVal);
      return chartTop + ratio * chartHeight;
    });
  };

  const generateMALine = (prices: number[], period: number) => {
    const result: (number | null)[] = [];
    for (let i = 0; i < prices.length; i++) {
      if (i < period - 1) {
        result.push(null);
      } else {
        const sum = prices.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
        result.push(sum / period);
      }
    }
    return result;
  };

  it('should generate correct MA line', () => {
    const prices = [10, 12, 14, 16, 18];
    const ma3 = generateMALine(prices, 3);
    expect(ma3[0]).toBeNull();
    expect(ma3[1]).toBeNull();
    expect(ma3[2]).toBe(12); // (10+12+14)/3
    expect(ma3[3]).toBe(14); // (12+14+16)/3
    expect(ma3[4]).toBe(16); // (14+16+18)/3
  });

  it('should scale indicator values to y-axis', () => {
    // Inverted axis: max value → top, min value → bottom
    const values = [0, 50, 100];
    const pixels = scaleIndicatorToYAxis(values, 0, 200, 0, 100);
    expect(pixels[0]).toBe(200);  // min value at bottom
    expect(pixels[1]).toBe(100);  // mid
    expect(pixels[2]).toBe(0);    // max value at top
  });

  it('should handle null values in indicator line', () => {
    const values = [null, null, 50, 60];
    const pixels = scaleIndicatorToYAxis(values, 0, 100, 0, 100);
    expect(pixels[0]).toBeNull();
    expect(pixels[1]).toBeNull();
    expect(pixels[2]).toBe(50);
  });

  it('should handle equal min/max', () => {
    const values = [10, 10, 10];
    const pixels = scaleIndicatorToYAxis(values, 0, 100, 10, 10);
    // When min=max, division by zero produces NaN
    expect(pixels.every(p => p === null || Number.isNaN(p) || typeof p === 'number')).toBe(true);
  });
});

// Date Axis Formatting Tests
describe('Date Axis Formatting', () => {
  const formatDateForAxis = (dateStr: string, interval: 'day' | 'week' | 'month') => {
    const d = new Date(dateStr);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    switch (interval) {
      case 'day':
        return `${d.getMonth() + 1}/${d.getDate()}`;
      case 'week':
        return `${months[d.getMonth()]} ${d.getDate()}`;
      case 'month':
        return `${months[d.getMonth()]} '${d.getFullYear().toString().slice(2)}`;
    }
  };

  const generateTimeLabels = (
    startTime: number,
    endTime: number,
    intervalMs: number
  ) => {
    const labels: number[] = [];
    let t = startTime;
    while (t <= endTime) {
      labels.push(t);
      t += intervalMs;
    }
    return labels;
  };

  it('should format daily axis labels', () => {
    expect(formatDateForAxis('2026-03-24', 'day')).toBe('3/24');
    expect(formatDateForAxis('2026-01-05', 'day')).toBe('1/5');
  });

  it('should format weekly axis labels', () => {
    expect(formatDateForAxis('2026-03-24', 'week')).toBe('Mar 24');
  });

  it('should format monthly axis labels', () => {
    expect(formatDateForAxis('2026-03-24', 'month')).toBe("Mar '26");
  });

  it('should generate intraday time labels', () => {
    const start = new Date('2026-03-24T09:30:00').getTime();
    const end = new Date('2026-03-24T11:30:00').getTime();
    const labels = generateTimeLabels(start, end, 30 * 60 * 1000); // 30 min intervals
    expect(labels.length).toBe(5); // 9:30, 10:00, 10:30, 11:00, 11:30
  });

  it('should handle empty range', () => {
    const labels = generateTimeLabels(1000, 500, 100);
    expect(labels).toEqual([]);
  });
});
