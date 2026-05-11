/**
 * Web Vitals 仪表盘小组件
 * 使用 PerformanceObserver API 采集真实性能数据
 * 不可用时显示 "未采集" 状态
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';

interface VitalDisplay {
  name: string;
  label: string;
  value: number | null;
  unit: string;
  rating: 'good' | 'needs-improvement' | 'poor' | 'unavailable';
  threshold: { good: number; poor: number };
}

const VITAL_CONFIG: Record<string, { label: string; unit: string; format: (v: number) => string }> = {
  FCP: { label: 'FCP', unit: 'ms', format: (v) => `${v.toFixed(0)}ms` },
  LCP: { label: 'LCP', unit: 'ms', format: (v) => `${v.toFixed(0)}ms` },
  CLS: { label: 'CLS', unit: '', format: (v) => v.toFixed(3) },
  TTFB: { label: 'TTFB', unit: 'ms', format: (v) => `${v.toFixed(0)}ms` },
};

const RATING_COLORS: Record<string, string> = {
  'good': '#22c55e',
  'needs-improvement': '#f59e0b',
  'poor': '#ef4444',
  'unavailable': '#9ca3af',
};

const VITAL_THRESHOLDS: Record<string, { good: number; poor: number }> = {
  FCP: { good: 1800, poor: 3000 },
  LCP: { good: 2500, poor: 4000 },
  CLS: { good: 0.1, poor: 0.25 },
  TTFB: { good: 800, poor: 1800 },
};

function rateValue(name: string, value: number): 'good' | 'needs-improvement' | 'poor' {
  const thresholds = VITAL_THRESHOLDS[name];
  if (!thresholds) return 'good';
  if (name === 'CLS') {
    if (value <= thresholds.good) return 'good';
    if (value <= thresholds.poor) return 'needs-improvement';
    return 'poor';
  }
  if (value <= thresholds.good) return 'good';
  if (value <= thresholds.poor) return 'needs-improvement';
  return 'poor';
}

interface WebVitalsWidgetProps {
  title?: string;
  showRefresh?: boolean;
  compact?: boolean;
}

const WebVitalsWidget: React.FC<WebVitalsWidgetProps> = ({
  title = '页面性能监控',
  showRefresh = true,
  compact = false,
}) => {
  const [vitals, setVitals] = useState<VitalDisplay[]>([]);
  const [summary, setSummary] = useState({ score: 0, rating: 'good' as 'good' | 'needs-improvement' | 'poor' | 'unavailable', passed: 0, total: 0 });
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const collectedRef = useRef<Record<string, number>>({});

  const computeVitals = useCallback(() => {
    const collected = collectedRef.current;
    const entries: VitalDisplay[] = [];

    for (const [name, config] of Object.entries(VITAL_CONFIG)) {
      const thresholds = VITAL_THRESHOLDS[name];
      if (!thresholds) continue;

      const value = collected[name] ?? null;
      if (value !== null && Number.isFinite(value)) {
        entries.push({
          name,
          label: config.label,
          value,
          unit: config.unit,
          rating: rateValue(name, value),
          threshold: thresholds,
        });
      } else {
        entries.push({
          name,
          label: config.label,
          value: null,
          unit: config.unit,
          rating: 'unavailable',
          threshold: thresholds,
        });
      }
    }

    const available = entries.filter(e => e.value !== null);
    const passed = available.filter(e => e.rating === 'good').length;
    const total = entries.length;
    const score = available.length > 0 ? Math.round((passed / available.length) * 100) : 0;

    let rating: 'good' | 'needs-improvement' | 'poor' | 'unavailable' = 'unavailable';
    if (available.length > 0) {
      if (score >= 90) rating = 'good';
      else if (score >= 50) rating = 'needs-improvement';
      else rating = 'poor';
    }

    setVitals(entries);
    setSummary({ score, rating, passed, total });
    setLastUpdated(new Date());
  }, []);

  const startCollecting = useCallback(() => {
    collectedRef.current = {};

    // FCP via paint entries
    try {
      const paintObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.name === 'first-contentful-paint') {
            collectedRef.current['FCP'] = entry.startTime;
            computeVitals();
          }
        }
      });
      paintObserver.observe({ type: 'paint', buffered: true });
    } catch { /* Paint timing not supported */ }

    // LCP via largest-contentful-paint
    try {
      const lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        if (entries.length > 0) {
          collectedRef.current['LCP'] = entries[entries.length - 1].startTime;
          computeVitals();
        }
      });
      lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
    } catch { /* LCP not supported */ }

    // CLS via layout-shift
    try {
      let clsValue = 0;
      const clsObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!(entry as any).hadRecentInput) {
            clsValue += (entry as any).value;
            collectedRef.current['CLS'] = clsValue;
            computeVitals();
          }
        }
      });
      clsObserver.observe({ type: 'layout-shift', buffered: true });
    } catch { /* Layout shift not supported */ }

    // TTFB from navigation timing
    try {
      const navEntries = performance.getEntriesByType('navigation');
      if (navEntries.length > 0) {
        const nav = navEntries[0] as PerformanceNavigationTiming;
        const ttfb = nav.responseStart - nav.requestStart;
        if (ttfb >= 0) {
          collectedRef.current['TTFB'] = ttfb;
          computeVitals();
        }
      }
    } catch { /* Navigation timing not supported */ }

    computeVitals();
  }, [computeVitals]);

  const handleRefresh = useCallback(() => {
    startCollecting();
  }, [startCollecting]);

  useEffect(() => {
    startCollecting();
  }, [startCollecting]);

  const formatTime = (date: Date | null) => {
    if (!date) return '从未更新';
    return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`;
  };

  if (compact) {
    return (
      <div className="web-vitals-compact">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-gray-700">{title}</h3>
          {showRefresh && (
            <button
              onClick={handleRefresh}
              className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
            >
              刷新
            </button>
          )}
        </div>
        
        <div className="flex items-center space-x-4">
          <div className="text-center">
            <div className="text-2xl font-bold" style={{ color: RATING_COLORS[summary.rating] }}>
              {summary.rating === 'unavailable' ? '--' : summary.score}
            </div>
            <div className="text-xs text-gray-500">分数</div>
          </div>
          
          <div className="flex-1">
            <div className="text-sm text-gray-600">
              {summary.passed}/{summary.total} 项通过
            </div>
            <div className="text-xs text-gray-400">
              最后更新: {formatTime(lastUpdated)}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="web-vitals-widget bg-white rounded-lg shadow p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-800">{title}</h2>
        <div className="flex items-center space-x-2">
          {showRefresh && (
            <button
              onClick={handleRefresh}
              className="px-3 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600"
            >
              刷新数据
            </button>
          )}
          <div className="text-sm text-gray-500">
            最后更新: {formatTime(lastUpdated)}
          </div>
        </div>
      </div>

      {/* 总体评分 */}
      <div className="mb-6 p-4 bg-gray-50 rounded-lg">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-gray-600">总体性能评分</div>
            <div className="text-3xl font-bold mt-1" style={{ color: RATING_COLORS[summary.rating] }}>
              {summary.rating === 'unavailable' ? '--' : summary.score}
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm text-gray-600">通过率</div>
            <div className="text-xl font-semibold mt-1">
              {summary.passed}/{summary.total}
            </div>
            <div className="text-sm text-gray-500 mt-1">
              评级: <span style={{ color: RATING_COLORS[summary.rating] }}>
                {summary.rating === 'good' ? '优秀' : summary.rating === 'needs-improvement' ? '需改进' : summary.rating === 'poor' ? '较差' : '未采集'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 详细指标 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {vitals.map((vital) => (
          <div key={vital.name} className="border rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="font-medium text-gray-800">{vital.label}</div>
              <div className="text-sm px-2 py-1 rounded-full text-white" style={{ backgroundColor: RATING_COLORS[vital.rating] }}>
                {vital.rating === 'good' ? '优秀' : vital.rating === 'needs-improvement' ? '需改进' : vital.rating === 'poor' ? '较差' : '未采集'}
              </div>
            </div>
            
            <div className="text-2xl font-bold mb-1">
              {vital.value !== null ? VITAL_CONFIG[vital.name]?.format(vital.value) ?? '--' : '--'}
            </div>
            
            <div className="text-sm text-gray-600 mb-2">
              阈值: ≤{vital.threshold.good}{vital.unit} (优秀), ≤{vital.threshold.poor}{vital.unit} (合格)
            </div>
            
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="h-2 rounded-full"
                style={{
                  width: vital.value !== null ? `${Math.min(100, (vital.value / vital.threshold.poor) * 100)}%` : '0%',
                  backgroundColor: RATING_COLORS[vital.rating],
                }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* 说明 */}
      <div className="mt-6 pt-4 border-t text-sm text-gray-500">
        <div className="font-medium mb-1">指标说明:</div>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>FCP</strong> (首次内容绘制): 页面首次渲染内容的时间</li>
          <li><strong>LCP</strong> (最大内容绘制): 页面最大元素渲染完成的时间</li>
          <li><strong>CLS</strong> (累计布局偏移): 页面布局稳定性的度量</li>
          <li><strong>TTFB</strong> (首字节时间): 从请求到收到第一个字节的时间</li>
        </ul>
        <div className="mt-2 text-xs text-gray-400">
          数据来源: PerformanceObserver API，页面加载后自动采集
        </div>
      </div>
    </div>
  );
};

export default WebVitalsWidget;
