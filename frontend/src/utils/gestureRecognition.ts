/**
 * 手势识别工具
 * Gesture Recognition Utilities
 *
 * 滑动、捏合、长按、双击手势检测
 */

export interface TouchPoint {
  x: number;
  y: number;
  timestamp: number;
}

export interface SwipeResult {
  direction: 'left' | 'right' | 'up' | 'down';
  distance: number;
  velocity: number;
  duration: number;
}

export interface PinchResult {
  scale: number;
  center: { x: number; y: number };
}

export interface GestureConfig {
  swipeThreshold: number;
  swipeTimeout: number;
  longPressTimeout: number;
  doubleTapTimeout: number;
  pinchThreshold: number;
}

const DEFAULT_CONFIG: GestureConfig = {
  swipeThreshold: 30,
  swipeTimeout: 500,
  longPressTimeout: 500,
  doubleTapTimeout: 300,
  pinchThreshold: 0.1,
};

/**
 * 检测滑动手势
 */
export function detectSwipe(start: TouchPoint, end: TouchPoint, config: Partial<GestureConfig> = {}): SwipeResult | null {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const duration = end.timestamp - start.timestamp;

  if (distance < cfg.swipeThreshold || duration > cfg.swipeTimeout) {
    return null;
  }

  const velocity = distance / duration;
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);

  let direction: SwipeResult['direction'];
  if (angle >= -45 && angle < 45) direction = 'right';
  else if (angle >= 45 && angle < 135) direction = 'down';
  else if (angle >= -135 && angle < -45) direction = 'up';
  else direction = 'left';

  return { direction, distance, velocity, duration };
}

/**
 * 检测捏合手势
 */
export function detectPinch(
  start1: TouchPoint, start2: TouchPoint,
  end1: TouchPoint, end2: TouchPoint
): PinchResult | null {
  const startDist = Math.sqrt(
    Math.pow(start2.x - start1.x, 2) + Math.pow(start2.y - start1.y, 2)
  );
  const endDist = Math.sqrt(
    Math.pow(end2.x - end1.x, 2) + Math.pow(end2.y - end1.y, 2)
  );

  if (startDist === 0) return null;

  const scale = endDist / startDist;
  const center = {
    x: (end1.x + end2.x) / 2,
    y: (end1.y + end2.y) / 2,
  };

  return { scale, center };
}

/**
 * 双击检测器
 */
export class DoubleTapDetector {
  private lastTap: TouchPoint | null = null;
  private timeout: number;

  constructor(timeout?: number) {
    this.timeout = timeout ?? DEFAULT_CONFIG.doubleTapTimeout;
  }

  tap(point: TouchPoint): boolean {
    if (!this.lastTap) {
      this.lastTap = point;
      return false;
    }

    const dt = point.timestamp - this.lastTap.timestamp;
    const dx = Math.abs(point.x - this.lastTap.x);
    const dy = Math.abs(point.y - this.lastTap.y);

    this.lastTap = point;

    return dt < this.timeout && dx < 30 && dy < 30;
  }

  reset(): void {
    this.lastTap = null;
  }
}

/**
 * 长按检测器
 */
export class LongPressDetector {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private timeout: number;
  private callback: (() => void) | null = null;

  constructor(timeout?: number) {
    this.timeout = timeout ?? DEFAULT_CONFIG.longPressTimeout;
  }

  start(point: TouchPoint, callback: () => void): void {
    this.cancel();
    this.callback = callback;
    this.timer = setTimeout(() => {
      callback();
      this.timer = null;
    }, this.timeout);
  }

  cancel(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  isActive(): boolean {
    return this.timer !== null;
  }
}

/**
 * 手势序列分析器
 */
export class GestureSequenceAnalyzer {
  private points: TouchPoint[] = [];
  private maxPoints: number;

  constructor(maxPoints: number = 100) {
    this.maxPoints = maxPoints;
  }

  addPoint(point: TouchPoint): void {
    this.points.push(point);
    if (this.points.length > this.maxPoints) {
      this.points.shift();
    }
  }

  /**
   * 获取最近的轨迹
   */
  getTrail(count: number = 10): TouchPoint[] {
    return this.points.slice(-count);
  }

  /**
   * 检测轨迹形状（简单圆形/直线判断）
   */
  detectShape(): 'line' | 'circle' | 'unknown' {
    if (this.points.length < 10) return 'unknown';

    const recent = this.points.slice(-20);

    // 检查是否为直线
    const first = recent[0];
    const last = recent[recent.length - 1];
    let maxDeviation = 0;

    for (const p of recent) {
      const dist = this.pointToLineDistance(p, first, last);
      maxDeviation = Math.max(maxDeviation, dist);
    }

    const lineLength = Math.sqrt(
      Math.pow(last.x - first.x, 2) + Math.pow(last.y - first.y, 2)
    );

    if (maxDeviation < lineLength * 0.1) return 'line';

    // 检查是否为圆形
    const centerX = recent.reduce((s, p) => s + p.x, 0) / recent.length;
    const centerY = recent.reduce((s, p) => s + p.y, 0) / recent.length;
    const avgRadius = recent.reduce((s, p) =>
      s + Math.sqrt(Math.pow(p.x - centerX, 2) + Math.pow(p.y - centerY, 2)), 0
    ) / recent.length;
    const radiusVariance = recent.reduce((s, p) => {
      const r = Math.sqrt(Math.pow(p.x - centerX, 2) + Math.pow(p.y - centerY, 2));
      return s + Math.pow(r - avgRadius, 2);
    }, 0) / recent.length;

    if (avgRadius > 0 && radiusVariance / (avgRadius * avgRadius) < 0.1) {
      return 'circle';
    }

    return 'unknown';
  }

  clear(): void {
    this.points = [];
  }

  private pointToLineDistance(p: TouchPoint, a: TouchPoint, b: TouchPoint): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) return Math.sqrt(Math.pow(p.x - a.x, 2) + Math.pow(p.y - a.y, 2));
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
    const projX = a.x + t * dx;
    const projY = a.y + t * dy;
    return Math.sqrt(Math.pow(p.x - projX, 2) + Math.pow(p.y - projY, 2));
  }
}

/**
 * 旋转手势检测
 */
export interface RotationResult {
  angle: number; // degrees
  center: { x: number; y: number };
  direction: 'clockwise' | 'counterclockwise';
}

export function detectRotation(
  start1: TouchPoint, start2: TouchPoint,
  end1: TouchPoint, end2: TouchPoint
): RotationResult {
  const startAngle = Math.atan2(start2.y - start1.y, start2.x - start1.x);
  const endAngle = Math.atan2(end2.y - end1.y, end2.x - end1.x);

  let angleDiff = (endAngle - startAngle) * (180 / Math.PI);
  if (angleDiff > 180) angleDiff -= 360;
  if (angleDiff < -180) angleDiff += 360;

  return {
    angle: Math.abs(angleDiff),
    center: {
      x: (end1.x + end2.x) / 2,
      y: (end1.y + end2.y) / 2,
    },
    direction: angleDiff >= 0 ? 'clockwise' : 'counterclockwise',
  };
}

/**
 * Flick（快速轻扫）手势检测
 * 区别于swipe：flick更强调速度而非距离
 */
export interface FlickResult {
  direction: 'left' | 'right' | 'up' | 'down';
  velocity: number;
  momentum: number;
}

export function detectFlick(
  points: TouchPoint[],
  config: Partial<{ minVelocity: number; maxDuration: number }> = {}
): FlickResult | null {
  const minVelocity = config.minVelocity ?? 0.5;
  const maxDuration = config.maxDuration ?? 200;

  if (points.length < 2) return null;

  const first = points[0];
  const last = points[points.length - 1];
  const duration = last.timestamp - first.timestamp;

  if (duration > maxDuration || duration === 0) return null;

  const dx = last.x - first.x;
  const dy = last.y - first.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const velocity = distance / duration;

  if (velocity < minVelocity) return null;

  const angle = Math.atan2(dy, dx) * (180 / Math.PI);
  let direction: FlickResult['direction'];
  if (angle >= -45 && angle < 45) direction = 'right';
  else if (angle >= 45 && angle < 135) direction = 'down';
  else if (angle >= -135 && angle < -45) direction = 'up';
  else direction = 'left';

  return {
    direction,
    velocity,
    momentum: velocity * distance,
  };
}

/**
 * 手势速度追踪器
 */
export class VelocityTracker {
  private points: TouchPoint[] = [];
  private windowMs: number;

  constructor(windowMs: number = 100) {
    this.windowMs = windowMs;
  }

  add(point: TouchPoint): void {
    this.points.push(point);
    const cutoff = point.timestamp - this.windowMs;
    this.points = this.points.filter(p => p.timestamp >= cutoff);
  }

  getVelocity(): { vx: number; vy: number; speed: number } {
    if (this.points.length < 2) return { vx: 0, vy: 0, speed: 0 };

    const first = this.points[0];
    const last = this.points[this.points.length - 1];
    const dt = last.timestamp - first.timestamp;

    if (dt === 0) return { vx: 0, vy: 0, speed: 0 };

    const vx = (last.x - first.x) / dt;
    const vy = (last.y - first.y) / dt;
    return {
      vx,
      vy,
      speed: Math.sqrt(vx * vx + vy * vy),
    };
  }

  reset(): void {
    this.points = [];
  }
}

/**
 * 多指点击检测
 */
export interface MultiTapResult {
  count: number;
  positions: { x: number; y: number }[];
  simultaneous: boolean;
}

export function detectMultiTap(
  touchPoints: TouchPoint[][],
  tolerance: { timeMs: number; distancePx: number } = { timeMs: 100, distancePx: 50 }
): MultiTapResult | null {
  if (touchPoints.length < 2) return null;

  const endTimes = touchPoints.map(seq => seq[seq.length - 1].timestamp);
  const maxDelta = Math.max(...endTimes) - Math.min(...endTimes);
  if (maxDelta > tolerance.timeMs) return null;

  const positions = touchPoints.map(seq => {
    const end = seq[seq.length - 1];
    return { x: end.x, y: end.y };
  });

  return {
    count: touchPoints.length,
    positions,
    simultaneous: maxDelta < tolerance.timeMs / 2,
  };
}

