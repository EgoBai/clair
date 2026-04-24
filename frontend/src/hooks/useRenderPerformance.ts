/**
 * 渲染性能监控 Hook
 * Render Performance Monitor Hook
 *
 * 追踪组件渲染次数、耗时、重渲染原因
 */

import { useRef, useEffect, useCallback, useState } from 'react';

export interface RenderMetrics {
  renderCount: number;
  totalRenderTime: number;
  avgRenderTime: number;
  lastRenderTime: number;
  slowRenders: number;
  renderHistory: Array<{ timestamp: number; duration: number }>;
}

export interface PerformanceThreshold {
  slowRenderMs: number;
  criticalRenderMs: number;
}

const DEFAULT_THRESHOLD: PerformanceThreshold = {
  slowRenderMs: 16,
  criticalRenderMs: 50,
};

/**
 * 组件渲染性能追踪 Hook（不触发额外渲染）
 */
export function useRenderTracker(
  componentName: string,
  threshold: PerformanceThreshold = DEFAULT_THRESHOLD
): RenderMetrics {
  const startTimeRef = useRef<number>(performance.now());
  const metricsRef = useRef<RenderMetrics>({
    renderCount: 0,
    totalRenderTime: 0,
    avgRenderTime: 0,
    lastRenderTime: 0,
    slowRenders: 0,
    renderHistory: [],
  });

  // 记录本次渲染耗时
  const duration = performance.now() - startTimeRef.current;
  const m = metricsRef.current;
  m.renderCount++;
  m.totalRenderTime += duration;
  m.lastRenderTime = duration;
  m.avgRenderTime = m.totalRenderTime / m.renderCount;
  if (duration >= threshold.slowRenderMs) m.slowRenders++;
  m.renderHistory.push({ timestamp: Date.now(), duration });
  if (m.renderHistory.length > 100) m.renderHistory.shift();

  // 为下一次渲染记录开始时间
  startTimeRef.current = performance.now();

  return metricsRef.current;
}

/**
 * FPS 监控 Hook
 */
export function useFPSMonitor(sampleDuration: number = 1000): {
  fps: number;
  avgFps: number;
  minFps: number;
  isRunning: boolean;
  start: () => void;
  stop: () => void;
} {
  const [fps, setFps] = useState(60);
  const [avgFps, setAvgFps] = useState(60);
  const [minFps, setMinFps] = useState(60);
  const [isRunning, setIsRunning] = useState(false);

  const frameCountRef = useRef(0);
  const lastTimeRef = useRef(0);
  const rafIdRef = useRef<number>(0);
  const fpsHistoryRef = useRef<number[]>([]);

  const measureFrame = useCallback(() => {
    frameCountRef.current++;
    const now = performance.now();

    if (now - lastTimeRef.current >= sampleDuration) {
      const currentFps = Math.round((frameCountRef.current * 1000) / (now - lastTimeRef.current));
      setFps(currentFps);

      fpsHistoryRef.current.push(currentFps);
      if (fpsHistoryRef.current.length > 60) fpsHistoryRef.current.shift();

      const sum = fpsHistoryRef.current.reduce((a, b) => a + b, 0);
      setAvgFps(Math.round(sum / fpsHistoryRef.current.length));
      setMinFps(Math.min(...fpsHistoryRef.current));

      frameCountRef.current = 0;
      lastTimeRef.current = now;
    }

    rafIdRef.current = requestAnimationFrame(measureFrame);
  }, [sampleDuration]);

  const start = useCallback(() => {
    setIsRunning(true);
    frameCountRef.current = 0;
    lastTimeRef.current = performance.now();
    rafIdRef.current = requestAnimationFrame(measureFrame);
  }, [measureFrame]);

  const stop = useCallback(() => {
    setIsRunning(false);
    cancelAnimationFrame(rafIdRef.current);
  }, []);

  useEffect(() => {
    return () => cancelAnimationFrame(rafIdRef.current);
  }, []);

  return { fps, avgFps, minFps, isRunning, start, stop };
}

/**
 * 内存使用监控 Hook
 */
export function useMemoryMonitor(intervalMs: number = 5000): {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  heapLimit: number;
  usagePercent: number;
  isSupported: boolean;
} {
  const [memory, setMemory] = useState({
    usedJSHeapSize: 0,
    totalJSHeapSize: 0,
    heapLimit: 0,
    usagePercent: 0,
    isSupported: false,
  });

  useEffect(() => {
    const perf = performance as Performance & { memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } };
    if (!perf.memory) {
      setMemory(prev => ({ ...prev, isSupported: false }));
      return;
    }

    const update = () => {
      const mem = perf.memory!;
      setMemory({
        usedJSHeapSize: mem.usedJSHeapSize,
        totalJSHeapSize: mem.totalJSHeapSize,
        heapLimit: mem.jsHeapSizeLimit,
        usagePercent: Math.round((mem.usedJSHeapSize / mem.jsHeapSizeLimit) * 100),
        isSupported: true,
      });
    };

    update();
    const id = setInterval(update, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return memory;
}

/**
 * 长任务检测 Hook
 */
export function useLongTaskDetector(
  thresholdMs: number = 50,
  onLongTask?: (duration: number) => void
): {
  longTaskCount: number;
  longestTask: number;
  isSupported: boolean;
} {
  const [stats, setStats] = useState({
    longTaskCount: 0,
    longestTask: 0,
    isSupported: false,
  });

  useEffect(() => {
    if (typeof PerformanceObserver === 'undefined') return;

    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.duration >= thresholdMs) {
            onLongTask?.(entry.duration);
            setStats(prev => ({
              ...prev,
              longTaskCount: prev.longTaskCount + 1,
              longestTask: Math.max(prev.longestTask, entry.duration),
            }));
          }
        }
      });
      observer.observe({ entryTypes: ['longtask'] });
      setStats(prev => ({ ...prev, isSupported: true }));
      return () => observer.disconnect();
    } catch {
      return;
    }
  }, [thresholdMs, onLongTask]);

  return stats;
}

/**
 * 重渲染原因分析 Hook
 */
export function useWhyDidYouUpdate(name: string, props: Record<string, any>): void {
  const previousProps = useRef<Record<string, any>>();

  useEffect(() => {
    if (!previousProps.current) {
      previousProps.current = props;
      return;
    }

    const allKeys = new Set([...Object.keys(previousProps.current), ...Object.keys(props)]);
    const changes: Record<string, { from: unknown; to: unknown }> = {};

    for (const key of allKeys) {
      if (previousProps.current[key] !== props[key]) {
        changes[key] = { from: previousProps.current[key], to: props[key] };
      }
    }

    if (Object.keys(changes).length > 0) {
      // removed: console.log
    }

    previousProps.current = props;
  });
}
