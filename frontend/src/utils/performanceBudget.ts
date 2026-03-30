/**
 * 性能预算系统
 * 监控并强制执行性能限制（JS/CSS/图片大小、请求数、渲染时间）
 * 与 Web Vitals 联动，在超标时触发告警
 */

// ==================== 类型定义 ====================

export interface PerformanceBudget {
  // 资源大小预算 (bytes)
  maxJSBundleSize: number;
  maxCSSBundleSize: number;
  maxImageSize: number;
  maxFontSize: number;
  maxTotalPageSize: number;

  // 网络预算
  maxRequests: number;
  maxThirdPartyRequests: number;

  // 时间预算 (ms)
  maxFCP: number;
  maxLCP: number;
  maxTTFB: number;
  maxLongTask: number;

  // 内存预算 (MB)
  maxHeapSize: number;
  maxDOMNodes: number;
}

export interface BudgetViolation {
  metric: string;
  budget: number;
  actual: number;
  severity: 'warning' | 'error' | 'critical';
  suggestion: string;
}

export interface BudgetReport {
  passed: boolean;
  violations: BudgetViolation[];
  score: number; // 0-100
  timestamp: number;
}

// ==================== 默认预算配置 ====================

export const DEFAULT_BUDGET: PerformanceBudget = {
  maxJSBundleSize: 500 * 1024,      // 500KB
  maxCSSBundleSize: 100 * 1024,      // 100KB
  maxImageSize: 200 * 1024,          // 200KB per image
  maxFontSize: 100 * 1024,           // 100KB
  maxTotalPageSize: 2 * 1024 * 1024, // 2MB

  maxRequests: 50,
  maxThirdPartyRequests: 10,

  maxFCP: 1800,
  maxLCP: 2500,
  maxTTFB: 800,
  maxLongTask: 50,

  maxHeapSize: 50,
  maxDOMNodes: 1500,
};

// ==================== 预算检查器 ====================

export class PerformanceBudgetChecker {
  private budget: PerformanceBudget;
  private violations: BudgetViolation[] = [];
  private checkInterval: ReturnType<typeof setInterval> | null = null;
  private onViolation: ((violation: BudgetViolation) => void) | null = null;

  constructor(budget: Partial<PerformanceBudget> = {}) {
    this.budget = { ...DEFAULT_BUDGET, ...budget };
  }

  /** 设置违规回调 */
  setViolationHandler(handler: (violation: BudgetViolation) => void): void {
    this.onViolation = handler;
  }

  /** 检查资源大小 */
  checkResourceSizes(): BudgetViolation[] {
    const violations: BudgetViolation[] = [];
    const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];

    let totalJS = 0, totalCSS = 0, totalImage = 0, totalFont = 0;
    const thirdParty: string[] = [];
    const origin = typeof location !== 'undefined' ? location.origin : '';

    entries.forEach(entry => {
      const size = entry.transferSize || entry.encodedBodySize || 0;
      const url = entry.name;

      if (!url.startsWith(origin)) {
        thirdParty.push(url);
      }

      if (url.endsWith('.js') || entry.initiatorType === 'script') {
        totalJS += size;
      } else if (url.endsWith('.css') || entry.initiatorType === 'css' || entry.initiatorType === 'link') {
        totalCSS += size;
      } else if (/\.(png|jpg|jpeg|gif|svg|webp|avif)/.test(url) || entry.initiatorType === 'img') {
        totalImage += size;
        if (size > this.budget.maxImageSize) {
          violations.push({
            metric: `Image: ${url.split('/').pop()}`,
            budget: this.budget.maxImageSize,
            actual: size,
            severity: size > this.budget.maxImageSize * 2 ? 'critical' : 'warning',
            suggestion: '使用 WebP/AVIF 格式，压缩图片，使用懒加载',
          });
        }
      } else if (/\.(woff2?|ttf|otf|eot)/.test(url) || entry.initiatorType === 'font') {
        totalFont += size;
      }
    });

    const totalSize = totalJS + totalCSS + totalImage + totalFont;

    if (totalJS > this.budget.maxJSBundleSize) {
      violations.push({
        metric: 'Total JS Size',
        budget: this.budget.maxJSBundleSize,
        actual: totalJS,
        severity: totalJS > this.budget.maxJSBundleSize * 1.5 ? 'critical' : 'warning',
        suggestion: '使用代码分割(tree-shaking)、动态导入、移除未使用的依赖',
      });
    }

    if (totalCSS > this.budget.maxCSSBundleSize) {
      violations.push({
        metric: 'Total CSS Size',
        budget: this.budget.maxCSSBundleSize,
        actual: totalCSS,
        severity: 'warning',
        suggestion: '移除未使用的 CSS，使用 CSS Modules 或 Tailwind purge',
      });
    }

    if (totalFont > this.budget.maxFontSize) {
      violations.push({
        metric: 'Total Font Size',
        budget: this.budget.maxFontSize,
        actual: totalFont,
        severity: 'warning',
        suggestion: '使用 font-display: swap，只加载需要的字符集',
      });
    }

    if (totalSize > this.budget.maxTotalPageSize) {
      violations.push({
        metric: 'Total Page Size',
        budget: this.budget.maxTotalPageSize,
        actual: totalSize,
        severity: 'critical',
        suggestion: '整体页面体积超标，审查所有资源',
      });
    }

    if (entries.length > this.budget.maxRequests) {
      violations.push({
        metric: 'Total Requests',
        budget: this.budget.maxRequests,
        actual: entries.length,
        severity: 'warning',
        suggestion: '合并请求，使用 HTTP/2 多路复用',
      });
    }

    if (thirdParty.length > this.budget.maxThirdPartyRequests) {
      violations.push({
        metric: 'Third-Party Requests',
        budget: this.budget.maxThirdPartyRequests,
        actual: thirdParty.length,
        severity: 'warning',
        suggestion: '审查并减少第三方依赖的网络请求',
      });
    }

    return violations;
  }

  /** 检查 DOM 复杂度 */
  checkDOMComplexity(): BudgetViolation[] {
    const violations: BudgetViolation[] = [];
    const nodeCount = typeof document !== 'undefined' ? document.querySelectorAll('*').length : 0;

    if (nodeCount > this.budget.maxDOMNodes) {
      violations.push({
        metric: 'DOM Nodes',
        budget: this.budget.maxDOMNodes,
        actual: nodeCount,
        severity: nodeCount > this.budget.maxDOMNodes * 1.5 ? 'critical' : 'warning',
        suggestion: '使用虚拟滚动、懒加载 DOM、减少嵌套层级',
      });
    }

    return violations;
  }

  /** 检查内存使用 */
  checkMemory(): BudgetViolation[] {
    const violations: BudgetViolation[] = [];
    const memory = (performance as any).memory;

    if (memory) {
      const heapMB = memory.usedJSHeapSize / (1024 * 1024);
      if (heapMB > this.budget.maxHeapSize) {
        violations.push({
          metric: 'JS Heap Size',
          budget: this.budget.maxHeapSize,
          actual: heapMB,
          severity: heapMB > this.budget.maxHeapSize * 2 ? 'critical' : 'error',
          suggestion: '检查内存泄漏，及时清理事件监听器和定时器',
        });
      }
    }

    return violations;
  }

  /** 完整检查 */
  check(): BudgetReport {
    this.violations = [
      ...this.checkResourceSizes(),
      ...this.checkDOMComplexity(),
      ...this.checkMemory(),
    ];

    // 触发回调
    this.violations.forEach(v => this.onViolation?.(v));

    // 计算分数
    let score = 100;
    this.violations.forEach(v => {
      if (v.severity === 'critical') score -= 20;
      else if (v.severity === 'error') score -= 10;
      else score -= 5;
    });
    score = Math.max(0, score);

    return {
      passed: this.violations.length === 0,
      violations: this.violations,
      score,
      timestamp: Date.now(),
    };
  }

  /** 开始持续监控 */
  startMonitoring(intervalMs = 10000): void {
    this.checkInterval = setInterval(() => {
      const report = this.check();
      if (!report.passed && typeof window !== 'undefined') {
        console.warn(`[Performance Budget] Score: ${report.score}/100`, report.violations);
      }
    }, intervalMs);
  }

  /** 停止监控 */
  stopMonitoring(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }
}

// ==================== 单例 ====================

let checker: PerformanceBudgetChecker | null = null;

export function getBudgetChecker(budget?: Partial<PerformanceBudget>): PerformanceBudgetChecker {
  if (!checker) {
    checker = new PerformanceBudgetChecker(budget);
  }
  return checker;
}

// ==================== 资源优先级控制 ====================

export function setResourcePriority(url: string, priority: 'high' | 'low' | 'auto'): void {
  const links = document.querySelectorAll(`link[href="${url}"], script[src="${url}"]`);
  links.forEach(el => {
    el.setAttribute('fetchpriority', priority);
  });
}

/** 标记首屏关键资源为高优先级 */
export function prioritizeCriticalResources(): void {
  // 标记首屏 CSS 为高优先级
  document.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
    const href = (link as HTMLLinkElement).href;
    if (href && !href.includes('antd') && !href.includes('chart')) {
      link.setAttribute('fetchpriority', 'high');
    }
  });

  // 标记首屏 JS 为高优先级
  document.querySelectorAll('script[src]').forEach(script => {
    const src = (script as HTMLScriptElement).src;
    if (src && (src.includes('main') || src.includes('vendor-react'))) {
      script.setAttribute('fetchpriority', 'high');
    }
  });
}
