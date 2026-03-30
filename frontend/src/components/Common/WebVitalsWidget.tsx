/**
 * Web Vitals 仪表盘小组件
 * 可嵌入任何页面的性能实时监控
 */

import React, { useState, useEffect, useCallback } from 'react';
import { webVitalsCollector, getVitalsReport } from '../utils/webVitals';

interface VitalDisplay {
  name: string;
  label: string;
  value: number;
  unit: string;
  rating: 'good' | 'needs-improvement' | 'poor';
  threshold: { good: number; poor: number };
}

const VITAL_CONFIG: Record<string, { label: string; unit: string; format: (v: number) => string }> = {
  FCP: { label: 'FCP', unit: 'ms', format: (v) => `${v.toFixed(0)}ms` },
  LCP: { label: 'LCP', unit: 'ms', format: (v) => `${v.toFixed(0)}ms` },
  CLS: { label: 'CLS', unit: '', format: (v) => v.toFixed(3) },
  FID: { label: 'FID', unit: 'ms', format: (v) => `${v.toFixed(0)}ms` },
  TTFB: { label: 'TTFB', unit: 'ms', format: (v) => `${v.toFixed(0)}ms` },
  INP: { label: 'INP', unit: 'ms', format: (v) => `${v.toFixed(0)}ms` },
};

const RATING_COLORS = {
  'good': '#22c55e',
  'needs-improvement': '#f59e0b',
  'poor': '#ef4444',
};

const RATING_BG = {
  'good': 'rgba(34, 197, 94, 0.1)',
  'needs-improvement': 'rgba(245, 158, 11, 0.1)',
  'poor': 'rgba(239, 68, 68, 0.1)',
};

export default function WebVitalsWidget({ compact = false }: { compact?: boolean }) {
  const [vitals, setVitals] = useState<VitalDisplay[]>([]);
  const [score, setScore] = useState(0);

  const updateVitals = useCallback(() => {
    const report = getVitalsReport();
    const displays: VitalDisplay[] = report.metrics.map(m => ({
      name: m.name,
      label: VITAL_CONFIG[m.name]?.label || m.name,
      value: m.value,
      unit: VITAL_CONFIG[m.name]?.unit || '',
      rating: m.rating,
      threshold: { good: 0, poor: 0 },
    }));
    setVitals(displays);
    setScore(report.score.total);
  }, []);

  useEffect(() => {
    // 初始更新
    updateVitals();

    // 监听新指标
    webVitalsCollector.onMetric(() => updateVitals());

    // 定期刷新
    const timer = setInterval(updateVitals, 2000);
    return () => clearInterval(timer);
  }, [updateVitals]);

  if (compact) {
    return (
      <div style={{
        display: 'flex',
        gap: 8,
        alignItems: 'center',
        padding: '6px 12px',
        background: 'var(--color-bg-secondary, #f8f9fa)',
        borderRadius: 8,
        fontSize: 12,
      }}>
        <span style={{
          fontWeight: 600,
          color: score >= 90 ? RATING_COLORS.good : score >= 50 ? RATING_COLORS['needs-improvement'] : RATING_COLORS.poor,
        }}>
          {score}
        </span>
        {vitals.map(v => (
          <span key={v.name} style={{
            color: RATING_COLORS[v.rating],
            padding: '2px 6px',
            background: RATING_BG[v.rating],
            borderRadius: 4,
            fontSize: 11,
          }}>
            {v.label} {VITAL_CONFIG[v.name]?.format(v.value)}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div style={{
      padding: 16,
      background: 'var(--color-bg-card, #fff)',
      borderRadius: 12,
      border: '1px solid var(--color-border, #e2e8f0)',
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
      }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>⚡ Web Vitals</h3>
        <span style={{
          padding: '4px 12px',
          borderRadius: 16,
          fontSize: 13,
          fontWeight: 600,
          background: score >= 90 ? RATING_BG.good : score >= 50 ? RATING_BG['needs-improvement'] : RATING_BG.poor,
          color: score >= 90 ? RATING_COLORS.good : score >= 50 ? RATING_COLORS['needs-improvement'] : RATING_COLORS.poor,
        }}>
          {score} 分
        </span>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 8,
      }}>
        {vitals.map(v => (
          <div key={v.name} style={{
            padding: '8px 12px',
            borderRadius: 8,
            background: RATING_BG[v.rating],
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 11, color: 'var(--color-text-secondary, #64748b)', marginBottom: 4 }}>
              {v.label}
            </div>
            <div style={{
              fontSize: 16,
              fontWeight: 700,
              color: RATING_COLORS[v.rating],
            }}>
              {VITAL_CONFIG[v.name]?.format(v.value)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
