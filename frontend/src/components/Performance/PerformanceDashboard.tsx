import React, { useState, useEffect, useCallback } from 'react';
import { performanceCollector } from './PerformanceProfiler';

interface PerformanceMetric {
  id: string;
  phase: 'mount' | 'update';
  actualDuration: number;
  baseDuration: number;
  timestamp: string;
  isSlow: boolean;
}

interface ComponentStats {
  id: string;
  count: number;
  totalDuration: number;
  maxDuration: number;
  slowRenders: number;
  lastRenderTime: string;
}

/**
 * 性能监控面板组件
 * 实时显示组件渲染性能数据
 * 
 * @example
 * ```tsx
 * // 在开发环境中显示
 * {process.env.NODE_ENV === 'development' && <PerformanceDashboard />}
 * ```
 */
export const PerformanceDashboard: React.FC = () => {
  const [metrics, setMetrics] = useState<PerformanceMetric[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(2000);
  const [visible, setVisible] = useState(false);

  // 监听性能数据
  useEffect(() => {
    if (!enabled) return;

    const handleProfilerData = (event: CustomEvent) => {
      const metric: PerformanceMetric = {
        id: event.detail.id,
        phase: event.detail.phase,
        actualDuration: parseFloat(event.detail.actualDuration),
        baseDuration: parseFloat(event.detail.baseDuration),
        timestamp: event.detail.timestamp,
        isSlow: event.detail.isSlow
      };
      
      setMetrics(prev => {
        const newMetrics = [...prev, metric];
        // 保留最近100条记录
        return newMetrics.slice(-100);
      });
    };

    window.addEventListener('profiler-data', handleProfilerData as EventListener);
    return () => window.removeEventListener('profiler-data', handleProfilerData as EventListener);
  }, [enabled]);

  // 自动刷新
  useEffect(() => {
    if (!enabled || !autoRefresh || !visible) return;

    const interval = setInterval(() => {
      // 触发重新渲染以更新统计数据
      setMetrics(prev => [...prev]);
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [enabled, autoRefresh, refreshInterval, visible]);

  // 计算统计数据
  const stats = React.useMemo(() => {
    if (metrics.length === 0) return null;

    const totalDuration = metrics.reduce((sum, m) => sum + m.actualDuration, 0);
    const averageDuration = totalDuration / metrics.length;
    const slowRenders = metrics.filter(m => m.isSlow).length;
    
    // 按组件分组统计
    const byComponent = metrics.reduce((acc, metric) => {
      if (!acc[metric.id]) {
        acc[metric.id] = {
          id: metric.id,
          count: 0,
          totalDuration: 0,
          maxDuration: 0,
          slowRenders: 0,
          lastRenderTime: metric.timestamp
        };
      }
      
      const component = acc[metric.id];
      component.count++;
      component.totalDuration += metric.actualDuration;
      component.maxDuration = Math.max(component.maxDuration, metric.actualDuration);
      component.lastRenderTime = metric.timestamp;
      
      if (metric.isSlow) {
        component.slowRenders++;
      }
      
      return acc;
    }, {} as Record<string, ComponentStats>);

    // 找出最慢的组件
    const componentStats = Object.values(byComponent);
    const slowestComponents = [...componentStats]
      .map(stats => ({
        ...stats,
        averageDuration: stats.totalDuration / stats.count,
        slowPercentage: (stats.slowRenders / stats.count) * 100
      }))
      .sort((a, b) => b.averageDuration - a.averageDuration)
      .slice(0, 5);

    // 最近慢渲染
    const recentSlowRenders = metrics
      .filter(m => m.isSlow)
      .slice(-10)
      .reverse();

    return {
      summary: {
        totalRenders: metrics.length,
        averageRenderTime: averageDuration,
        totalMonitoringTime: totalDuration,
        slowRenders,
        slowPercentage: (slowRenders / metrics.length) * 100
      },
      slowestComponents,
      recentSlowRenders,
      componentStats: componentStats
    };
  }, [metrics]);

  // 导出性能数据
  const handleExport = useCallback(() => {
    const data = performanceCollector.export();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `performance-data-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  // 清空数据
  const handleClear = useCallback(() => {
    setMetrics([]);
    performanceCollector.clear();
  }, []);

  // 切换可见性
  const toggleVisibility = useCallback(() => {
    setVisible(prev => !prev);
  }, []);

  if (!visible) {
    return (
      <button
        className="performance-dashboard-toggle"
        onClick={toggleVisibility}
        title="显示性能监控面板"
        style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          zIndex: 9999,
          background: '#4299e1',
          color: 'white',
          border: 'none',
          borderRadius: '50%',
          width: '50px',
          height: '50px',
          fontSize: '24px',
          cursor: 'pointer',
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
        }}
      >
        📊
      </button>
    );
  }

  return (
    <div className="performance-dashboard" style={dashboardStyles.container}>
      {/* 头部 */}
      <div style={dashboardStyles.header}>
        <h3 style={dashboardStyles.title}>🎯 性能监控面板</h3>
        <div style={dashboardStyles.controls}>
          <button
            onClick={() => setEnabled(!enabled)}
            style={{
              ...dashboardStyles.button,
              background: enabled ? '#48bb78' : '#e53e3e'
            }}
          >
            {enabled ? '监控中' : '已停止'}
          </button>
          <button
            onClick={handleExport}
            style={dashboardStyles.button}
            disabled={metrics.length === 0}
          >
            导出数据
          </button>
          <button
            onClick={handleClear}
            style={dashboardStyles.button}
            disabled={metrics.length === 0}
          >
            清空数据
          </button>
          <button
            onClick={toggleVisibility}
            style={dashboardStyles.button}
          >
            隐藏
          </button>
        </div>
      </div>

      {/* 配置区域 */}
      <div style={dashboardStyles.config}>
        <label style={dashboardStyles.configItem}>
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
          />
          <span style={{ marginLeft: '8px' }}>自动刷新</span>
        </label>
        <label style={dashboardStyles.configItem}>
          刷新间隔:
          <input
            type="range"
            min="1000"
            max="10000"
            step="1000"
            value={refreshInterval}
            onChange={(e) => setRefreshInterval(parseInt(e.target.value, 10))}
            style={{ marginLeft: '8px', width: '100px' }}
          />
          <span style={{ marginLeft: '8px' }}>{refreshInterval / 1000}s</span>
        </label>
      </div>

      {/* 数据统计 */}
      {stats && (
        <>
          {/* 概览 */}
          <div style={dashboardStyles.section}>
            <h4 style={dashboardStyles.sectionTitle}>📈 性能概览</h4>
            <div style={dashboardStyles.metricsGrid}>
              <div style={dashboardStyles.metricCard}>
                <div style={dashboardStyles.metricValue}>{stats.summary.totalRenders}</div>
                <div style={dashboardStyles.metricLabel}>总渲染次数</div>
              </div>
              <div style={dashboardStyles.metricCard}>
                <div style={dashboardStyles.metricValue}>
                  {stats.summary.averageRenderTime.toFixed(2)}ms
                </div>
                <div style={dashboardStyles.metricLabel}>平均渲染时间</div>
              </div>
              <div style={dashboardStyles.metricCard}>
                <div style={{
                  ...dashboardStyles.metricValue,
                  color: stats.summary.slowRenders > 0 ? '#e53e3e' : '#48bb78'
                }}>
                  {stats.summary.slowRenders}
                </div>
                <div style={dashboardStyles.metricLabel}>慢渲染次数</div>
              </div>
              <div style={dashboardStyles.metricCard}>
                <div style={{
                  ...dashboardStyles.metricValue,
                  color: stats.summary.slowPercentage > 10 ? '#e53e3e' : '#48bb78'
                }}>
                  {stats.summary.slowPercentage.toFixed(1)}%
                </div>
                <div style={dashboardStyles.metricLabel}>慢渲染比例</div>
              </div>
            </div>
          </div>

          {/* 最慢组件 */}
          {stats.slowestComponents.length > 0 && (
            <div style={dashboardStyles.section}>
              <h4 style={dashboardStyles.sectionTitle}>🐌 最慢组件 (Top 5)</h4>
              <div style={dashboardStyles.tableContainer}>
                <table style={dashboardStyles.table}>
                  <thead>
                    <tr>
                      <th style={dashboardStyles.tableHeader}>组件</th>
                      <th style={dashboardStyles.tableHeader}>平均时间</th>
                      <th style={dashboardStyles.tableHeader}>最长时间</th>
                      <th style={dashboardStyles.tableHeader}>慢渲染</th>
                      <th style={dashboardStyles.tableHeader}>比例</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.slowestComponents.map((component, index) => (
                      <tr key={component.id} style={index % 2 === 0 ? dashboardStyles.tableRowEven : dashboardStyles.tableRowOdd}>
                        <td style={dashboardStyles.tableCell}>
                          <div style={{ fontWeight: 'bold' }}>{component.id}</div>
                          <div style={{ fontSize: '12px', color: '#718096' }}>
                            渲染次数: {component.count}
                          </div>
                        </td>
                        <td style={{
                          ...dashboardStyles.tableCell,
                          color: component.averageDuration > 16 ? '#e53e3e' : '#48bb78',
                          fontWeight: 'bold'
                        }}>
                          {component.averageDuration.toFixed(2)}ms
                        </td>
                        <td style={dashboardStyles.tableCell}>
                          {component.maxDuration.toFixed(2)}ms
                        </td>
                        <td style={dashboardStyles.tableCell}>
                          {component.slowRenders}
                        </td>
                        <td style={{
                          ...dashboardStyles.tableCell,
                          color: component.slowPercentage > 10 ? '#e53e3e' : '#48bb78'
                        }}>
                          {component.slowPercentage.toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 最近慢渲染 */}
          {stats.recentSlowRenders.length > 0 && (
            <div style={dashboardStyles.section}>
              <h4 style={dashboardStyles.sectionTitle}>⚠️ 最近慢渲染</h4>
              <div style={dashboardStyles.tableContainer}>
                <table style={dashboardStyles.table}>
                  <thead>
                    <tr>
                      <th style={dashboardStyles.tableHeader}>组件</th>
                      <th style={dashboardStyles.tableHeader}>阶段</th>
                      <th style={dashboardStyles.tableHeader}>时间</th>
                      <th style={dashboardStyles.tableHeader}>时间戳</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.recentSlowRenders.map((metric, index) => (
                      <tr key={index} style={index % 2 === 0 ? dashboardStyles.tableRowEven : dashboardStyles.tableRowOdd}>
                        <td style={dashboardStyles.tableCell}>
                          <div style={{ fontWeight: 'bold' }}>{metric.id}</div>
                        </td>
                        <td style={dashboardStyles.tableCell}>
                          <span style={{
                            background: metric.phase === 'mount' ? '#bee3f8' : '#fed7d7',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontSize: '12px'
                          }}>
                            {metric.phase}
                          </span>
                        </td>
                        <td style={{
                          ...dashboardStyles.tableCell,
                          color: '#e53e3e',
                          fontWeight: 'bold'
                        }}>
                          {metric.actualDuration.toFixed(2)}ms
                        </td>
                        <td style={dashboardStyles.tableCell}>
                          {new Date(metric.timestamp).toLocaleTimeString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* 空状态 */}
      {(!stats || metrics.length === 0) && (
        <div style={dashboardStyles.emptyState}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>📊</div>
          <h4 style={{ margin: '0 0 8px 0', color: '#4a5568' }}>暂无性能数据</h4>
          <p style={{ margin: 0, color: '#718096', textAlign: 'center' }}>
            {enabled ? '组件渲染后数据将显示在这里' : '请点击"监控中"按钮开始监控'}
          </p>
        </div>
      )}

      {/* 底部信息 */}
      <div style={dashboardStyles.footer}>
        <div style={{ fontSize: '12px', color: '#718096' }}>
          最后更新: {new Date().toLocaleTimeString()}
          {stats && ` | 数据量: ${metrics.length} 条`}
        </div>
      </div>
    </div>
  );
};

// 样式定义
const dashboardStyles = {
  container: {
    position: 'fixed' as const,
    bottom: '20px',
    right: '20px',
    width: '800px',
    maxWidth: '90vw',
    maxHeight: '80vh',
    background: 'white',
    borderRadius: '8px',
    boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
    zIndex: 10000,
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 20px',
    background: '#2d3748',
    color: 'white'
  },
  title: {
    margin: 0,
    fontSize: '16px',
    fontWeight: 'bold' as const
  },
  controls: {
    display: 'flex',
    gap: '8px'
  },
  button: {
    padding: '6px 12px',
    background: '#4299e1',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '12px',
    transition: 'background 0.2s'
  },
  config: {
    display: 'flex',
    alignItems: 'center',
    padding: '12px 20px',
    background: '#f7fafc',
    borderBottom: '1px solid #e2e8f0',
    gap: '16px'
  },
  configItem: {
    display: 'flex',
    alignItems: 'center',
    fontSize: '12px',
    color: '#4a5568'
  },
  section: {
    padding: '16px 20px',
    borderBottom: '1px solid #e2e8f0'
  },
  sectionTitle: {
    margin: '0 0 12px 0',
    fontSize: '14px',
    color: '#2d3748',
    fontWeight: 'bold' as const
  },
  metricsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '12px'
  },
  metricCard: {
    background: '#f7fafc',
    borderRadius: '6px',
    padding: '12px',
    textAlign: 'center' as const,
    border: '1px solid #e2e8f0'
  },
  metricValue: {
    fontSize: '20px',
    fontWeight: 'bold' as const,
    color: '#2d3748',
    marginBottom: '4px'
  },
  metricLabel: {
    fontSize: '12px',
    color: '#718096'
  },
  tableContainer: {
    overflowX: 'auto' as const
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: '12px'
  },
  tableHeader: {
    padding: '8px 12px',
    textAlign: 'left' as const,
    background: '#f7fafc',
    borderBottom: '1px solid #e2e8f0',
    color: '#4a5568',
    fontWeight: 'bold' as const
  },
  tableRowEven: {
    background: '#f7fafc'
  },
  tableRowOdd: {
    background: 'white'
  },
  tableCell: {
    padding: '8px 12px',
    borderBottom: '1px solid #e2e8f0',
    color: '#2d3748'
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 20px',
    color: '#718096'
  },
  footer: {
    padding: '12px 20px',
    background: '#f7fafc',
    borderTop: '1px solid #e2e8f0',
    textAlign: 'center' as const
  }
};

// 开发环境下的全局样式
if (process.env.NODE_ENV === 'development') {
  const style = document.createElement('style');
  style.textContent = `
    .performance-dashboard-toggle:hover {
      transform: scale(1.1);
      transition: transform 0.2s;
    }
    
    .performance-dashboard button:hover:not(:disabled) {
      opacity: 0.9;
    }
    
    .performance-dashboard button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    
    .performance-dashboard table tr:hover {
      background: #edf2f7 !important;
    }
  `;
  document.head.appendChild(style);
}

/**
 * 性能监控开关组件
 * 简化版本，只显示开关按钮
 */
export const PerformanceToggle: React.FC = () => {
  const [enabled, setEnabled] = useState(false);
  const [showNotification, setShowNotification] = useState(false);

  const toggleMonitoring = useCallback(() => {
    const newEnabled = !enabled;
    setEnabled(newEnabled);
    
    // 显示通知
    setShowNotification(true);
    setTimeout(() => setShowNotification(false), 2000);
    
    // 发送事件通知其他组件
    window.dispatchEvent(new CustomEvent('performance-monitoring-toggle', {
      detail: { enabled: newEnabled }
    }));
  }, [enabled]);

  return (
    <>
      <button
        onClick={toggleMonitoring}
        title={enabled ? '停止性能监控' : '开始性能监控'}
        style={{
          position: 'fixed',
          bottom: '80px',
          right: '20px',
          zIndex: 9999,
          background: enabled ? '#48bb78' : '#e53e3e',
          color: 'white',
          border: 'none',
          borderRadius: '50%',
          width: '40px',
          height: '40px',
          fontSize: '18px',
          cursor: 'pointer',
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        {enabled ? '✅' : '📊'}
      </button>
      
      {showNotification && (
        <div style={{
          position: 'fixed',
          bottom: '130px',
          right: '20px',
          background: enabled ? '#48bb78' : '#e53e3e',
          color: 'white',
          padding: '8px 12px',
          borderRadius: '4px',
          fontSize: '12px',
          zIndex: 9999,
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          animation: 'fadeInOut 2s ease-in-out'
        }}>
          {enabled ? '性能监控已开启' : '性能监控已停止'}
        </div>
      )}
      
      <style>{`
        @keyframes fadeInOut {
          0% { opacity: 0; transform: translateY(10px); }
          10% { opacity: 1; transform: translateY(0); }
          90% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(-10px); }
        }
      `}</style>
    </>
  );
};

// 默认导出
export default React.memo(PerformanceDashboard);
