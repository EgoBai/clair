import logger from './logger';
import { useMemo, useRef, useEffect } from 'react';

/**
 * PerformanceMonitorEnhanced - 增强版前端性能监控工具
 * 新增功能：
 * 1. 内存泄漏检测
 * 2. 长任务监控
 * 3. 网络请求性能
 * 4. 组件渲染追踪
 * 5. 性能报告生成
 */

export interface PerfEntryEnhanced {
  id: string;
  name: string;
  startTime: number;
  duration: number;
  type: 'render' | 'api' | 'computation' | 'interaction' | 'navigation' | 'memory' | 'longtask';
  metadata?: Record<string, string | number | boolean | null | undefined>;
}

export interface MemoryStats {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
  timestamp: number;
}

// Chrome扩展的performance.memory类型
interface PerformanceMemory {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

// 扩展Performance接口
declare global {
  interface Performance {
    memory?: PerformanceMemory;
  }
}

export interface NetworkRequest {
  url: string;
  method: string;
  startTime: number;
  duration: number;
  status: number;
  size: number;
}

export interface ComponentRenderInfo {
  componentName: string;
  renderCount: number;
  totalTime: number;
  avgTime: number;
  lastRenderTime: number;
}

export interface PerfReport {
  timestamp: string;
  sessionId: string;
  metrics: {
    memory: {
      current: MemoryStats;
      peak: MemoryStats;
      leaks: number;
    };
    rendering: {
      fps: number;
      slowFrames: number;
      totalRenderTime: number;
      componentCount: number;
    };
    network: {
      totalRequests: number;
      avgLatency: number;
      slowRequests: number;
      totalSize: number;
    };
    interactions: {
      total: number;
      slowInteractions: number;
      avgResponseTime: number;
    };
  };
  recommendations: string[];
}

export class PerformanceMonitorEnhanced {
  private entries: PerfEntryEnhanced[] = [];
  activeMarks: Map<string, { startTime: number; metadata?: Record<string, string | number | boolean | null | undefined> }> = new Map();
  private memorySamples: MemoryStats[] = [];
  private networkRequests: NetworkRequest[] = [];
  private componentRenders: Map<string, ComponentRenderInfo> = new Map();
  private sessionId: string;
  private memoryCheckInterval: number | null = null;
  private longTaskObserver: PerformanceObserver | null = null;
  
  private config = {
    maxEntries: 2000,
    memoryCheckInterval: 30000, // 30秒
    memoryLeakThreshold: 3, // 连续3次增长
    slowThreshold: {
      render: 16, // 60fps的帧时间
      api: 1000,
      interaction: 100,
      longtask: 50
    },
    enableMemoryTracking: true,
    enableLongTaskTracking: true,
    enableNetworkTracking: true,
    enableComponentTracking: true
  };

  constructor() {
    this.sessionId = this.generateSessionId();
    this.initialize();
  }

  private generateSessionId(): string {
    return `perf-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private initialize(): void {
    if (this.config.enableMemoryTracking && 'memory' in performance) {
      this.startMemoryMonitoring();
    }

    if (this.config.enableLongTaskTracking && PerformanceObserver) {
      this.setupLongTaskObserver();
    }

    if (this.config.enableNetworkTracking) {
      this.setupNetworkMonitoring();
    }

    // 监听页面可见性变化
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        this.generateReport();
      }
    });

    // 监听页面卸载
    window.addEventListener('beforeunload', () => {
      this.generateReport();
    });
  }

  private startMemoryMonitoring(): void {
    this.memoryCheckInterval = window.setInterval(() => {
      const memory = performance.memory;
      if (memory) {
        const sample: MemoryStats = {
          usedJSHeapSize: memory.usedJSHeapSize,
          totalJSHeapSize: memory.totalJSHeapSize,
          jsHeapSizeLimit: memory.jsHeapSizeLimit,
          timestamp: Date.now()
        };
        
        this.memorySamples.push(sample);
        this.checkForMemoryLeaks();
        
        // 保留最近100个样本
        if (this.memorySamples.length > 100) {
          this.memorySamples = this.memorySamples.slice(-100);
        }
      }
    }, this.config.memoryCheckInterval);
  }

  private checkForMemoryLeaks(): void {
    if (this.memorySamples.length < this.config.memoryLeakThreshold + 1) return;

    const recentSamples = this.memorySamples.slice(-this.config.memoryLeakThreshold - 1);
    let increasingCount = 0;

    for (let i = 1; i < recentSamples.length; i++) {
      if (recentSamples[i].usedJSHeapSize > recentSamples[i - 1].usedJSHeapSize) {
        increasingCount++;
      }
    }

    if (increasingCount >= this.config.memoryLeakThreshold) {
      this.recordEntry({
        id: `memory-leak-${Date.now()}`,
        name: 'MemoryLeakDetected',
        startTime: Date.now(),
        duration: 0,
        type: 'memory',
        metadata: {
          samplesCount: recentSamples.length,
          latestUsed: recentSamples.length > 0 ? recentSamples[recentSamples.length - 1].usedJSHeapSize : 0,
          warning: '连续内存增长，可能的内存泄漏'
        }
      });

      logger.warn('⚠️ 检测到可能的内存泄漏', recentSamples);
    }
  }

  private setupLongTaskObserver(): void {
    try {
      this.longTaskObserver = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          if (entry.duration > this.config.slowThreshold.longtask) {
            this.recordEntry({
              id: `longtask-${Date.now()}`,
              name: entry.name,
              startTime: entry.startTime,
              duration: entry.duration,
              type: 'longtask',
              metadata: {
                entryType: entry.entryType,
                attribution: String((entry as PerformanceEntry & { attribution?: unknown }).attribution ?? '')
              }
            });
          }
        });
      });

      this.longTaskObserver.observe({ entryTypes: ['longtask'] });
    } catch (e) {
      logger.warn('LongTask API 不支持:', e);
    }
  }

  private setupNetworkMonitoring(): void {
    const originalFetch = window.fetch;
    
    window.fetch = async (...args) => {
      const startTime = performance.now();
      const [input, init] = args;
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
      const method = init?.method || 'GET';

      try {
        const response = await originalFetch(...args);
        const endTime = performance.now();
        const duration = endTime - startTime;

        const request: NetworkRequest = {
          url,
          method,
          startTime,
          duration,
          status: response.status,
          size: Number(response.headers.get('content-length')) || 0
        };

        this.networkRequests.push(request);

        if (duration > this.config.slowThreshold.api) {
          this.recordEntry({
            id: `slow-api-${Date.now()}`,
            name: `${method} ${url}`,
            startTime,
            duration,
            type: 'api',
            metadata: {
              url: request.url,
              method: request.method,
              status: request.status,
              size: request.size
            }
          });
        }

        return response;
      } catch (error) {
        const endTime = performance.now();
        const duration = endTime - startTime;

        this.recordEntry({
          id: `failed-api-${Date.now()}`,
          name: `${method} ${url}`,
          startTime,
          duration,
          type: 'api',
          metadata: { error: error instanceof Error ? error.message : String(error), url, method }
        });

        throw error;
      }
    };
  }

  startComponentRender(componentName: string): string {
    const markId = `component-${componentName}-${Date.now()}`;
    this.activeMarks.set(markId, {
      startTime: performance.now(),
      metadata: { componentName }
    });
    return markId;
  }

  endComponentRender(markId: string): void {
    const mark = this.activeMarks.get(markId);
    if (!mark) return;

    const duration = performance.now() - mark.startTime;
    const componentName = (mark.metadata?.componentName as string) || 'Unknown';

    // 更新组件渲染统计
    const name = componentName || 'Unknown';
    const existing = this.componentRenders.get(name) || {
      componentName: name,
      renderCount: 0,
      totalTime: 0,
      avgTime: 0,
      lastRenderTime: Date.now()
    };

    existing.renderCount++;
    existing.totalTime += duration;
    existing.avgTime = existing.totalTime / existing.renderCount;
    existing.lastRenderTime = Date.now();

    this.componentRenders.set(name, existing);

    // 记录慢渲染
    if (duration > this.config.slowThreshold.render) {
      this.recordEntry({
        id: markId,
        name: `SlowRender: ${componentName}`,
        startTime: mark.startTime,
        duration,
        type: 'render',
        metadata: {
          componentName,
          renderCount: existing.renderCount,
          avgTime: existing.avgTime
        }
      });
    }

    this.activeMarks.delete(markId);
  }

  recordEntry(entry: PerfEntryEnhanced): void {
    this.entries.push(entry);
    
    // 限制条目数量
    if (this.entries.length > this.config.maxEntries) {
      this.entries = this.entries.slice(-this.config.maxEntries);
    }
  }

  getComponentStats(): ComponentRenderInfo[] {
    return Array.from(this.componentRenders.values())
      .sort((a, b) => b.totalTime - a.totalTime);
  }

  getSlowComponents(threshold: number = this.config.slowThreshold.render): ComponentRenderInfo[] {
    return this.getComponentStats()
      .filter(comp => comp.avgTime > threshold);
  }

  getNetworkStats(): {
    totalRequests: number;
    avgLatency: number;
    slowRequests: number;
    totalSize: number;
  } {
    if (this.networkRequests.length === 0) {
      return {
        totalRequests: 0,
        avgLatency: 0,
        slowRequests: 0,
        totalSize: 0
      };
    }

    const totalLatency = this.networkRequests.reduce((sum, req) => sum + req.duration, 0);
    const slowRequests = this.networkRequests.filter(req => req.duration > this.config.slowThreshold.api).length;
    const totalSize = this.networkRequests.reduce((sum, req) => sum + req.size, 0);

    return {
      totalRequests: this.networkRequests.length,
      avgLatency: totalLatency / this.networkRequests.length,
      slowRequests,
      totalSize
    };
  }

  getMemoryStats(): {
    current: MemoryStats | null;
    peak: MemoryStats | null;
    trend: 'stable' | 'increasing' | 'decreasing';
  } {
    if (this.memorySamples.length === 0) {
      return {
        current: null,
        peak: null,
        trend: 'stable'
      };
    }

    const current = this.memorySamples[this.memorySamples.length - 1];
    const peak = this.memorySamples.reduce((max, sample) => 
      sample.usedJSHeapSize > max.usedJSHeapSize ? sample : max
    );

    let trend: 'stable' | 'increasing' | 'decreasing' = 'stable';
    if (this.memorySamples.length >= 3) {
      const lastThree = this.memorySamples.slice(-3);
      const isIncreasing = lastThree.every((sample, i) => 
        i === 0 || sample.usedJSHeapSize > lastThree[i - 1].usedJSHeapSize
      );
      const isDecreasing = lastThree.every((sample, i) => 
        i === 0 || sample.usedJSHeapSize < lastThree[i - 1].usedJSHeapSize
      );

      if (isIncreasing) trend = 'increasing';
      else if (isDecreasing) trend = 'decreasing';
    }

    return { current, peak, trend };
  }

  generateReport(): PerfReport {
    const memoryStats = this.getMemoryStats();
    const networkStats = this.getNetworkStats();
    const componentStats = this.getComponentStats();
    const slowComponents = this.getSlowComponents();

    const recommendations: string[] = [];

    // 生成建议
    if (slowComponents.length > 0) {
      recommendations.push(`优化慢渲染组件: ${slowComponents.map(c => c.componentName).join(', ')}`);
    }

    if (memoryStats.trend === 'increasing') {
      recommendations.push('检测到内存增长趋势，检查可能的内存泄漏');
    }

    if (networkStats.slowRequests > 0) {
      recommendations.push(`优化 ${networkStats.slowRequests} 个慢网络请求`);
    }

    if (componentStats.length > 20) {
      recommendations.push('组件数量较多，考虑代码分割和懒加载');
    }

    const report: PerfReport = {
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      metrics: {
        memory: {
          current: memoryStats.current!,
          peak: memoryStats.peak!,
          leaks: memoryStats.trend === 'increasing' ? 1 : 0
        },
        rendering: {
          fps: this.calculateFPS(),
          slowFrames: this.entries.filter(e => e.type === 'render' && e.duration > 16).length,
          totalRenderTime: componentStats.reduce((sum, comp) => sum + comp.totalTime, 0),
          componentCount: componentStats.length
        },
        network: networkStats,
        interactions: {
          total: this.entries.filter(e => e.type === 'interaction').length,
          slowInteractions: this.entries.filter(e => 
            e.type === 'interaction' && e.duration > this.config.slowThreshold.interaction
          ).length,
          avgResponseTime: this.calculateAvgInteractionTime()
        }
      },
      recommendations
    };

    // 发送报告到后端（可选）
    this.sendReport(report);

    return report;
  }

  private calculateFPS(): number {
    const renderEntries = this.entries.filter(e => e.type === 'render');
    if (renderEntries.length < 2) return 60;

    const totalTime = renderEntries[renderEntries.length - 1].startTime - renderEntries[0].startTime;
    const avgFrameTime = totalTime / renderEntries.length;
    return 1000 / avgFrameTime;
  }

  private calculateAvgInteractionTime(): number {
    const interactionEntries = this.entries.filter(e => e.type === 'interaction');
    if (interactionEntries.length === 0) return 0;

    const totalTime = interactionEntries.reduce((sum, entry) => sum + entry.duration, 0);
    return totalTime / interactionEntries.length;
  }

  private sendReport(report: PerfReport): void {
    // 这里可以发送到后端进行存储和分析
    if (typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([JSON.stringify(report)], { type: 'application/json' });
      navigator.sendBeacon('/api/performance/report', blob);
    }
  }

  cleanup(): void {
    if (this.memoryCheckInterval) {
      clearInterval(this.memoryCheckInterval);
    }

    if (this.longTaskObserver) {
      this.longTaskObserver.disconnect();
    }

    // 恢复原始fetch
    // 注意：这里简化处理，实际应用中需要更复杂的恢复逻辑
  }
}

// 创建全局实例
export const perfMonitor = new PerformanceMonitorEnhanced();

// React Hook 集成
export function usePerformanceMonitor() {
  const componentName = useMemo(() => {
    // 尝试获取组件名称
    const error = new Error();
    const stack = error.stack || '';
    const match = stack.match(/at (\w+)/);
    return match ? match[1] : 'UnknownComponent';
  }, []);

  const renderMarkId = useRef<string | null>(null);

  useEffect(() => {
    renderMarkId.current = perfMonitor.startComponentRender(componentName);

    return () => {
      if (renderMarkId.current) {
        perfMonitor.endComponentRender(renderMarkId.current);
      }
    };
  }, [componentName]);

  return {
    startInteraction: (name: string) => {
      const markId = `interaction-${name}-${Date.now()}`;
      perfMonitor.activeMarks.set(markId, {
        startTime: performance.now(),
        metadata: { name, componentName }
      });
      return markId;
    },
    endInteraction: (markId: string) => {
      const mark = perfMonitor.activeMarks.get(markId);
      if (!mark) return;

      const duration = performance.now() - mark.startTime;
      perfMonitor.recordEntry({
        id: markId,
        name: `Interaction: ${mark.metadata?.name}`,
        startTime: mark.startTime,
        duration,
        type: 'interaction',
        metadata: {
          componentName,
          interactionName: mark.metadata?.name
        }
      });

      perfMonitor.activeMarks.delete(markId);
    }
  };
}