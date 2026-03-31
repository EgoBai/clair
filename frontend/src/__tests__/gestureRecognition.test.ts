import { describe, it, expect, vi } from 'vitest';
import {
  detectSwipe,
  detectPinch,
  DoubleTapDetector,
  LongPressDetector,
  GestureSequenceAnalyzer,
} from '../utils/gestureRecognition';

describe('detectSwipe', () => {
  it('should detect right swipe', () => {
    const result = detectSwipe(
      { x: 0, y: 0, timestamp: 0 },
      { x: 100, y: 10, timestamp: 200 }
    );
    expect(result).not.toBeNull();
    expect(result!.direction).toBe('right');
  });

  it('should detect left swipe', () => {
    const result = detectSwipe(
      { x: 100, y: 0, timestamp: 0 },
      { x: 0, y: 10, timestamp: 200 }
    );
    expect(result!.direction).toBe('left');
  });

  it('should detect down swipe', () => {
    const result = detectSwipe(
      { x: 0, y: 0, timestamp: 0 },
      { x: 10, y: 100, timestamp: 200 }
    );
    expect(result!.direction).toBe('down');
  });

  it('should detect up swipe', () => {
    const result = detectSwipe(
      { x: 0, y: 100, timestamp: 0 },
      { x: 10, y: 0, timestamp: 200 }
    );
    expect(result!.direction).toBe('up');
  });

  it('should return null for short distance', () => {
    const result = detectSwipe(
      { x: 0, y: 0, timestamp: 0 },
      { x: 5, y: 5, timestamp: 100 }
    );
    expect(result).toBeNull();
  });

  it('should return null for slow swipe', () => {
    const result = detectSwipe(
      { x: 0, y: 0, timestamp: 0 },
      { x: 100, y: 0, timestamp: 1000 }
    );
    expect(result).toBeNull();
  });

  it('should include velocity and distance', () => {
    const result = detectSwipe(
      { x: 0, y: 0, timestamp: 0 },
      { x: 100, y: 0, timestamp: 100 }
    );
    expect(result!.distance).toBe(100);
    expect(result!.velocity).toBe(1);
    expect(result!.duration).toBe(100);
  });
});

describe('detectPinch', () => {
  it('should detect pinch in (zoom out)', () => {
    const result = detectPinch(
      { x: 0, y: 0, timestamp: 0 },
      { x: 100, y: 0, timestamp: 0 },
      { x: 20, y: 0, timestamp: 200 },
      { x: 80, y: 0, timestamp: 200 }
    );
    expect(result).not.toBeNull();
    expect(result!.scale).toBeLessThan(1);
  });

  it('should detect pinch out (zoom in)', () => {
    const result = detectPinch(
      { x: 20, y: 0, timestamp: 0 },
      { x: 80, y: 0, timestamp: 0 },
      { x: 0, y: 0, timestamp: 200 },
      { x: 100, y: 0, timestamp: 200 }
    );
    expect(result!.scale).toBeGreaterThan(1);
  });

  it('should return null when start distance is zero', () => {
    const result = detectPinch(
      { x: 0, y: 0, timestamp: 0 },
      { x: 0, y: 0, timestamp: 0 },
      { x: 10, y: 0, timestamp: 100 },
      { x: 50, y: 0, timestamp: 100 }
    );
    expect(result).toBeNull();
  });

  it('should calculate center point', () => {
    const result = detectPinch(
      { x: 0, y: 0, timestamp: 0 },
      { x: 100, y: 100, timestamp: 0 },
      { x: 10, y: 10, timestamp: 100 },
      { x: 90, y: 90, timestamp: 100 }
    );
    expect(result!.center.x).toBe(50);
    expect(result!.center.y).toBe(50);
  });
});

describe('DoubleTapDetector', () => {
  it('should detect double tap', () => {
    const detector = new DoubleTapDetector(300);
    const first = detector.tap({ x: 50, y: 50, timestamp: 0 });
    expect(first).toBe(false);
    const second = detector.tap({ x: 52, y: 51, timestamp: 200 });
    expect(second).toBe(true);
  });

  it('should not detect if too slow', () => {
    const detector = new DoubleTapDetector(300);
    detector.tap({ x: 50, y: 50, timestamp: 0 });
    const second = detector.tap({ x: 50, y: 50, timestamp: 500 });
    expect(second).toBe(false);
  });

  it('should not detect if too far apart', () => {
    const detector = new DoubleTapDetector(300);
    detector.tap({ x: 50, y: 50, timestamp: 0 });
    const second = detector.tap({ x: 200, y: 200, timestamp: 100 });
    expect(second).toBe(false);
  });

  it('should reset', () => {
    const detector = new DoubleTapDetector(300);
    detector.tap({ x: 50, y: 50, timestamp: 0 });
    detector.reset();
    const first = detector.tap({ x: 50, y: 50, timestamp: 100 });
    expect(first).toBe(false);
  });
});

describe('LongPressDetector', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('should trigger callback after timeout', () => {
    const cb = vi.fn();
    const detector = new LongPressDetector(500);
    detector.start({ x: 0, y: 0, timestamp: 0 }, cb);
    vi.advanceTimersByTime(500);
    expect(cb).toHaveBeenCalled();
  });

  it('should not trigger if cancelled', () => {
    const cb = vi.fn();
    const detector = new LongPressDetector(500);
    detector.start({ x: 0, y: 0, timestamp: 0 }, cb);
    detector.cancel();
    vi.advanceTimersByTime(600);
    expect(cb).not.toHaveBeenCalled();
  });

  it('should report active status', () => {
    const detector = new LongPressDetector(500);
    expect(detector.isActive()).toBe(false);
    detector.start({ x: 0, y: 0, timestamp: 0 }, () => {});
    expect(detector.isActive()).toBe(true);
    vi.advanceTimersByTime(500);
    expect(detector.isActive()).toBe(false);
  });
});

describe('GestureSequenceAnalyzer', () => {
  it('should add and retrieve points', () => {
    const analyzer = new GestureSequenceAnalyzer();
    analyzer.addPoint({ x: 0, y: 0, timestamp: 0 });
    analyzer.addPoint({ x: 10, y: 0, timestamp: 100 });
    expect(analyzer.getTrail()).toHaveLength(2);
  });

  it('should limit trail size', () => {
    const analyzer = new GestureSequenceAnalyzer(5);
    for (let i = 0; i < 10; i++) {
      analyzer.addPoint({ x: i, y: 0, timestamp: i * 100 });
    }
    expect(analyzer.getTrail(3)).toHaveLength(3);
  });

  it('should detect line shape', () => {
    const analyzer = new GestureSequenceAnalyzer();
    for (let i = 0; i < 20; i++) {
      analyzer.addPoint({ x: i * 10, y: 0, timestamp: i * 50 });
    }
    expect(analyzer.detectShape()).toBe('line');
  });

  it('should clear points', () => {
    const analyzer = new GestureSequenceAnalyzer();
    analyzer.addPoint({ x: 0, y: 0, timestamp: 0 });
    analyzer.clear();
    expect(analyzer.getTrail()).toHaveLength(0);
  });

  it('should return unknown for insufficient data', () => {
    const analyzer = new GestureSequenceAnalyzer();
    analyzer.addPoint({ x: 0, y: 0, timestamp: 0 });
    expect(analyzer.detectShape()).toBe('unknown');
  });
});
