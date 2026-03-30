import { describe, it, expect } from 'vitest';

// Chart Annotations & Drawing Tools
interface Point {
  x: number;
  y: number;
  price: number;
  timestamp: number;
}

interface Annotation {
  id: string;
  type: 'horizontal_line' | 'trend_line' | 'fibonacci' | 'text' | 'rectangle';
  points: Point[];
  color: string;
  label?: string;
  visible: boolean;
}

interface FibonacciLevel {
  level: number;
  ratio: number;
  label: string;
}

// Fibonacci Retracement Levels
const FIBONACCI_LEVELS: FibonacciLevel[] = [
  { level: 0, ratio: 0, label: '0%' },
  { level: 1, ratio: 0.236, label: '23.6%' },
  { level: 2, ratio: 0.382, label: '38.2%' },
  { level: 3, ratio: 0.5, label: '50%' },
  { level: 4, ratio: 0.618, label: '61.8%' },
  { level: 5, ratio: 0.786, label: '78.6%' },
  { level: 6, ratio: 1, label: '100%' },
];

function calculateFibonacciLevels(high: number, low: number): { level: FibonacciLevel; price: number }[] {
  const range = high - low;
  return FIBONACCI_LEVELS.map(level => ({
    level,
    price: Number((high - range * level.ratio).toFixed(2)),
  }));
}

function calculateTrendLine(start: Point, end: Point): { slope: number; intercept: number; angle: number } {
  const dx = end.timestamp - start.timestamp;
  const dy = end.price - start.price;
  if (dx === 0) return { slope: Infinity, intercept: start.price, angle: 90 };
  const slope = dy / dx;
  const intercept = start.price - slope * start.timestamp;
  const angle = Math.atan(slope) * (180 / Math.PI);
  return { slope, intercept, angle: Number(angle.toFixed(2)) };
}

function projectTrendLine(start: Point, end: Point, targetTimestamp: number): number {
  const { slope, intercept } = calculateTrendLine(start, end);
  if (slope === Infinity) return start.price;
  return Number((slope * targetTimestamp + intercept).toFixed(2));
}

function isPointInRectangle(point: Point, topLeft: Point, bottomRight: Point): boolean {
  return (
    point.x >= topLeft.x &&
    point.x <= bottomRight.x &&
    point.y >= topLeft.y &&
    point.y <= bottomRight.y
  );
}

function calculateRectangleArea(topLeft: Point, bottomRight: Point): number {
  return Math.abs(bottomRight.x - topLeft.x) * Math.abs(bottomRight.y - topLeft.y);
}

function findNearestPoint(target: Point, points: Point[]): Point | null {
  if (points.length === 0) return null;
  let nearest = points[0];
  let minDist = Math.sqrt(Math.pow(target.x - nearest.x, 2) + Math.pow(target.y - nearest.y, 2));
  for (const p of points.slice(1)) {
    const dist = Math.sqrt(Math.pow(target.x - p.x, 2) + Math.pow(target.y - p.y, 2));
    if (dist < minDist) {
      minDist = dist;
      nearest = p;
    }
  }
  return nearest;
}

function calculateSupportResistance(prices: number[]): { support: number[]; resistance: number[] } {
  if (prices.length < 3) return { support: [], resistance: [] };
  const support: number[] = [];
  const resistance: number[] = [];

  for (let i = 1; i < prices.length - 1; i++) {
    if (prices[i] < prices[i - 1] && prices[i] < prices[i + 1]) {
      support.push(prices[i]);
    }
    if (prices[i] > prices[i - 1] && prices[i] > prices[i + 1]) {
      resistance.push(prices[i]);
    }
  }

  return { support, resistance };
}

function calculatePivotPoints(high: number, low: number, close: number): {
  pivot: number;
  r1: number;
  r2: number;
  r3: number;
  s1: number;
  s2: number;
  s3: number;
} {
  const pivot = (high + low + close) / 3;
  return {
    pivot: Number(pivot.toFixed(2)),
    r1: Number((2 * pivot - low).toFixed(2)),
    r2: Number((pivot + (high - low)).toFixed(2)),
    r3: Number((high + 2 * (pivot - low)).toFixed(2)),
    s1: Number((2 * pivot - high).toFixed(2)),
    s2: Number((pivot - (high - low)).toFixed(2)),
    s3: Number((low - 2 * (high - pivot)).toFixed(2)),
  };
}

describe('Chart Annotations & Drawing Tools', () => {
  describe('Fibonacci Retracement', () => {
    it('should calculate correct fibonacci levels', () => {
      const levels = calculateFibonacciLevels(100, 50);
      expect(levels[0].price).toBe(100); // 0%
      expect(levels[6].price).toBe(50);  // 100%
      expect(levels[3].price).toBe(75);  // 50%
    });

    it('should calculate 61.8% retracement', () => {
      const levels = calculateFibonacciLevels(200, 100);
      const fib618 = levels.find(l => l.level.ratio === 0.618);
      expect(fib618?.price).toBe(138.2);
    });

    it('should calculate 38.2% retracement', () => {
      const levels = calculateFibonacciLevels(200, 100);
      const fib382 = levels.find(l => l.level.ratio === 0.382);
      expect(fib382?.price).toBe(161.8);
    });

    it('should handle zero range', () => {
      const levels = calculateFibonacciLevels(100, 100);
      expect(levels[0].price).toBe(100);
      expect(levels[3].price).toBe(100);
    });

    it('should have correct number of levels', () => {
      expect(calculateFibonacciLevels(100, 50)).toHaveLength(7);
    });

    it('should have levels in descending order', () => {
      const levels = calculateFibonacciLevels(100, 50);
      for (let i = 1; i < levels.length; i++) {
        expect(levels[i].price).toBeLessThanOrEqual(levels[i - 1].price);
      }
    });
  });

  describe('Trend Line', () => {
    it('should calculate upward trend', () => {
      const start: Point = { x: 0, y: 0, price: 100, timestamp: 1000 };
      const end: Point = { x: 10, y: 10, price: 200, timestamp: 2000 };
      const trend = calculateTrendLine(start, end);
      expect(trend.slope).toBeGreaterThan(0);
      expect(trend.angle).toBeGreaterThan(0);
    });

    it('should calculate downward trend', () => {
      const start: Point = { x: 0, y: 0, price: 200, timestamp: 1000 };
      const end: Point = { x: 10, y: 10, price: 100, timestamp: 2000 };
      const trend = calculateTrendLine(start, end);
      expect(trend.slope).toBeLessThan(0);
    });

    it('should handle horizontal line', () => {
      const start: Point = { x: 0, y: 0, price: 100, timestamp: 1000 };
      const end: Point = { x: 10, y: 10, price: 100, timestamp: 2000 };
      const trend = calculateTrendLine(start, end);
      expect(trend.slope).toBe(0);
      expect(trend.angle).toBe(0);
    });

    it('should handle vertical line', () => {
      const start: Point = { x: 0, y: 0, price: 100, timestamp: 1000 };
      const end: Point = { x: 0, y: 10, price: 200, timestamp: 1000 };
      const trend = calculateTrendLine(start, end);
      expect(trend.slope).toBe(Infinity);
    });

    it('should project future value', () => {
      const start: Point = { x: 0, y: 0, price: 100, timestamp: 1000 };
      const end: Point = { x: 10, y: 10, price: 200, timestamp: 2000 };
      const projected = projectTrendLine(start, end, 3000);
      expect(projected).toBe(300);
    });
  });

  describe('Rectangle', () => {
    it('should detect point inside rectangle', () => {
      const tl: Point = { x: 0, y: 0, price: 0, timestamp: 0 };
      const br: Point = { x: 100, y: 100, price: 0, timestamp: 0 };
      const point: Point = { x: 50, y: 50, price: 0, timestamp: 0 };
      expect(isPointInRectangle(point, tl, br)).toBe(true);
    });

    it('should detect point outside rectangle', () => {
      const tl: Point = { x: 0, y: 0, price: 0, timestamp: 0 };
      const br: Point = { x: 100, y: 100, price: 0, timestamp: 0 };
      const point: Point = { x: 150, y: 50, price: 0, timestamp: 0 };
      expect(isPointInRectangle(point, tl, br)).toBe(false);
    });

    it('should detect point on edge', () => {
      const tl: Point = { x: 0, y: 0, price: 0, timestamp: 0 };
      const br: Point = { x: 100, y: 100, price: 0, timestamp: 0 };
      const point: Point = { x: 100, y: 100, price: 0, timestamp: 0 };
      expect(isPointInRectangle(point, tl, br)).toBe(true);
    });

    it('should calculate area', () => {
      const tl: Point = { x: 0, y: 0, price: 0, timestamp: 0 };
      const br: Point = { x: 10, y: 20, price: 0, timestamp: 0 };
      expect(calculateRectangleArea(tl, br)).toBe(200);
    });

    it('should handle zero-size rectangle', () => {
      const p: Point = { x: 5, y: 5, price: 0, timestamp: 0 };
      expect(calculateRectangleArea(p, p)).toBe(0);
    });
  });

  describe('Nearest Point', () => {
    it('should find nearest point', () => {
      const points: Point[] = [
        { x: 0, y: 0, price: 100, timestamp: 1 },
        { x: 10, y: 10, price: 110, timestamp: 2 },
        { x: 100, y: 100, price: 200, timestamp: 3 },
      ];
      const target: Point = { x: 8, y: 8, price: 0, timestamp: 0 };
      const nearest = findNearestPoint(target, points);
      expect(nearest?.price).toBe(110);
    });

    it('should return null for empty array', () => {
      expect(findNearestPoint({ x: 0, y: 0, price: 0, timestamp: 0 }, [])).toBeNull();
    });

    it('should return only point', () => {
      const p: Point = { x: 5, y: 5, price: 100, timestamp: 1 };
      expect(findNearestPoint({ x: 0, y: 0, price: 0, timestamp: 0 }, [p])).toBe(p);
    });
  });

  describe('Support & Resistance', () => {
    it('should find support levels', () => {
      const prices = [100, 95, 100, 90, 100];
      const { support } = calculateSupportResistance(prices);
      expect(support).toContain(95);
      expect(support).toContain(90);
    });

    it('should find resistance levels', () => {
      const prices = [90, 100, 90, 110, 90];
      const { resistance } = calculateSupportResistance(prices);
      expect(resistance).toContain(100);
      expect(resistance).toContain(110);
    });

    it('should return empty for too few prices', () => {
      const { support, resistance } = calculateSupportResistance([100, 105]);
      expect(support).toHaveLength(0);
      expect(resistance).toHaveLength(0);
    });

    it('should handle flat prices', () => {
      const { support, resistance } = calculateSupportResistance([100, 100, 100, 100]);
      expect(support).toHaveLength(0);
      expect(resistance).toHaveLength(0);
    });
  });

  describe('Pivot Points', () => {
    it('should calculate classic pivot points', () => {
      const pivots = calculatePivotPoints(110, 90, 100);
      expect(pivots.pivot).toBe(100);
      expect(pivots.r1).toBe(110);
      expect(pivots.s1).toBe(90);
    });

    it('should have r levels ascending', () => {
      const pivots = calculatePivotPoints(110, 90, 100);
      expect(pivots.r3).toBeGreaterThan(pivots.r2);
      expect(pivots.r2).toBeGreaterThan(pivots.r1);
      expect(pivots.r1).toBeGreaterThan(pivots.pivot);
    });

    it('should have s levels descending', () => {
      const pivots = calculatePivotPoints(110, 90, 100);
      expect(pivots.s1).toBeGreaterThan(pivots.s2);
      expect(pivots.s2).toBeGreaterThan(pivots.s3);
    });

    it('should handle equal high and low', () => {
      const pivots = calculatePivotPoints(100, 100, 100);
      expect(pivots.pivot).toBe(100);
      expect(pivots.r1).toBe(100);
      expect(pivots.s1).toBe(100);
    });
  });
});
