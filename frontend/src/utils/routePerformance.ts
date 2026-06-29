import logger from './logger';
/**
 * 路由性能追踪
 * 使用 Performance API 测量路由切换耗时
 */

interface RouteMetric {
  from: string;
  to: string;
  duration: number;
  timestamp: number;
}

const routeMetrics: RouteMetric[] = [];
const MAX_METRICS = 100;

let currentRoute = '';
let routeStartTime = 0;

/**
 * 开始路由切换计时
 */
export function startRouteTransition(to: string): void {
  currentRoute = to;
  routeStartTime = performance.now();

  // 性能标记
  try {
    performance.mark(`route-start-${to}`);
  } catch { /* ignore */ }
}

/**
 * 结束路由切换计时
 */
export function endRouteTransition(to: string): void {
  if (routeStartTime === 0) return;

  const duration = performance.now() - routeStartTime;

  try {
    performance.mark(`route-end-${to}`);
    performance.measure(`route-${to}`, `route-start-${to}`, `route-end-${to}`);
  } catch { /* ignore */ }

  const metric: RouteMetric = {
    from: currentRoute,
    to,
    duration,
    timestamp: Date.now(),
  };

  routeMetrics.push(metric);
  if (routeMetrics.length > MAX_METRICS) {
    routeMetrics.shift();
  }

  // 开发环境输出
  if (import.meta.env.DEV) {
    const _emoji = duration < 200 ? '⚡' : duration < 500 ? '🚶' : '🐢';
    // removed: console.log
  }

  routeStartTime = 0;
}

/**
 * 获取路由性能指标
 */
export function getRouteMetrics(): RouteMetric[] {
  return [...routeMetrics];
}

/**
 * 获取平均路由切换耗时
 */
export function getAvgRouteDuration(): number {
  if (routeMetrics.length === 0) return 0;
  return routeMetrics.reduce((sum, m) => sum + m.duration, 0) / routeMetrics.length;
}

/**
 * 组件加载性能追踪
 */
export function measureComponentLoad(name: string, fn: () => void): void {
  const start = performance.now();
  fn();
  const duration = performance.now() - start;

  if (import.meta.env.DEV && duration > 16) {
    logger.warn(`[Perf] 组件 ${name} 加载耗时 ${duration.toFixed(1)}ms (超过16ms帧预算)`);
  }
}

/**
 * 异步操作性能追踪
 */
export async function measureAsync<T>(
  name: string,
  fn: () => Promise<T>
): Promise<T> {
  const start = performance.now();
  try {
    const result = await fn();
    const _duration = performance.now() - start;
    if (import.meta.env.DEV) {
      // removed: console.log
    }
    return result;
  } catch (error) {
    const duration = performance.now() - start;
    if (import.meta.env.DEV) {
      logger.error(`❌ [Async] ${name}: ${duration.toFixed(1)}ms (failed)`);
    }
    throw error;
  }
}
