import React, { useState, useEffect } from 'react';
import { perfMonitor, PerfReport, ComponentRenderInfo } from '../utils/performanceMonitorEnhanced';

interface PerformanceDashboardProps {
  autoRefresh?: boolean;
  refreshInterval?: number;
}

const PerformanceDashboard: React.FC<PerformanceDashboardProps> = ({
  autoRefresh = true,
  refreshInterval = 5000
}) => {
  const [report, setReport] = useState<PerfReport | null>(null);
  const [componentStats, setComponentStats] = useState<ComponentRenderInfo[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'components' | 'network' | 'memory'>('overview');

  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(updateStats, refreshInterval);
      return () => clearInterval(interval);
    }
    return;
  }, [autoRefresh, refreshInterval]);

  const updateStats = () => {
    const newReport = perfMonitor.generateReport();
    const newComponentStats = perfMonitor.getComponentStats();
    setReport(newReport);
    setComponentStats(newComponentStats);
  };

  const handleGenerateReport = () => {
    updateStats();
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatTime = (ms: number): string => {
    if (ms < 1000) return `${ms.toFixed(2)} ms`;
    return `${(ms / 1000).toFixed(2)} s`;
  };

  if (!report) {
    return (
      <div className="performance-dashboard">
        <div className="dashboard-header">
          <h2>性能监控仪表板</h2>
          <button onClick={handleGenerateReport}>生成报告</button>
        </div>
        <div className="loading">加载中...</div>
      </div>
    );
  }

  return (
    <div className="performance-dashboard">
      <div className="dashboard-header">
        <h2>性能监控仪表板</h2>
        <div className="header-actions">
          <button onClick={handleGenerateReport}>刷新</button>
          <span className="session-id">会话: {report.sessionId.substring(0, 8)}</span>
        </div>
      </div>

      <div className="dashboard-tabs">
        <button
          className={activeTab === 'overview' ? 'active' : ''}
          onClick={() => setActiveTab('overview')}
        >
          概览
        </button>
        <button
          className={activeTab === 'components' ? 'active' : ''}
          onClick={() => setActiveTab('components')}
        >
          组件渲染
        </button>
        <button
          className={activeTab === 'network' ? 'active' : ''}
          onClick={() => setActiveTab('network')}
        >
          网络请求
        </button>
        <button
          className={activeTab === 'memory' ? 'active' : ''}
          onClick={() => setActiveTab('memory')}
        >
          内存使用
        </button>
      </div>

      <div className="dashboard-content">
        {activeTab === 'overview' && (
          <div className="overview-tab">
            <div className="metrics-grid">
              <div className="metric-card">
                <h3>FPS</h3>
                <div className="metric-value">
                  {report.metrics.rendering.fps.toFixed(1)}
                </div>
                <div className="metric-label">
                  {report.metrics.rendering.fps > 55 ? '优秀' : 
                   report.metrics.rendering.fps > 30 ? '良好' : '需要优化'}
                </div>
              </div>

              <div className="metric-card">
                <h3>内存使用</h3>
                <div className="metric-value">
                  {formatBytes(report.metrics.memory.current.usedJSHeapSize)}
                </div>
                <div className="metric-label">
                  峰值: {formatBytes(report.metrics.memory.peak.usedJSHeapSize)}
                </div>
              </div>

              <div className="metric-card">
                <h3>网络请求</h3>
                <div className="metric-value">
                  {report.metrics.network.totalRequests}
                </div>
                <div className="metric-label">
                  慢请求: {report.metrics.network.slowRequests}
                </div>
              </div>

              <div className="metric-card">
                <h3>组件数量</h3>
                <div className="metric-value">
                  {report.metrics.rendering.componentCount}
                </div>
                <div className="metric-label">
                  总渲染时间: {formatTime(report.metrics.rendering.totalRenderTime)}
                </div>
              </div>
            </div>

            <div className="recommendations">
              <h3>优化建议</h3>
              {report.recommendations.length > 0 ? (
                <ul>
                  {report.recommendations.map((rec, index) => (
                    <li key={index}>{rec}</li>
                  ))}
                </ul>
              ) : (
                <p className="no-recommendations">🎉 性能表现良好，无需优化</p>
              )}
            </div>
          </div>
        )}

        {activeTab === 'components' && (
          <div className="components-tab">
            <h3>组件渲染统计</h3>
            <div className="components-table">
              <table>
                <thead>
                  <tr>
                    <th>组件名称</th>
                    <th>渲染次数</th>
                    <th>平均时间</th>
                    <th>总时间</th>
                    <th>状态</th>
                  </tr>
                </thead>
                <tbody>
                  {componentStats.map((comp) => (
                    <tr key={comp.componentName}>
                      <td>{comp.componentName}</td>
                      <td>{comp.renderCount}</td>
                      <td>{formatTime(comp.avgTime)}</td>
                      <td>{formatTime(comp.totalTime)}</td>
                      <td>
                        <span className={`status-badge ${
                          comp.avgTime > 16 ? 'warning' : 
                          comp.avgTime > 8 ? 'info' : 'success'
                        }`}>
                          {comp.avgTime > 16 ? '慢' : 
                           comp.avgTime > 8 ? '正常' : '快'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'network' && (
          <div className="network-tab">
            <h3>网络请求统计</h3>
            <div className="network-stats">
              <div className="stat-item">
                <span className="stat-label">总请求数:</span>
                <span className="stat-value">{report.metrics.network.totalRequests}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">平均延迟:</span>
                <span className="stat-value">{formatTime(report.metrics.network.avgLatency)}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">慢请求数:</span>
                <span className="stat-value">{report.metrics.network.slowRequests}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">总数据量:</span>
                <span className="stat-value">{formatBytes(report.metrics.network.totalSize)}</span>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'memory' && (
          <div className="memory-tab">
            <h3>内存使用情况</h3>
            <div className="memory-stats">
              <div className="stat-item">
                <span className="stat-label">当前使用:</span>
                <span className="stat-value">
                  {formatBytes(report.metrics.memory.current.usedJSHeapSize)}
                </span>
              </div>
              <div className="stat-item">
                <span className="stat-label">堆大小:</span>
                <span className="stat-value">
                  {formatBytes(report.metrics.memory.current.totalJSHeapSize)}
                </span>
              </div>
              <div className="stat-item">
                <span className="stat-label">堆限制:</span>
                <span className="stat-value">
                  {formatBytes(report.metrics.memory.current.jsHeapSizeLimit)}
                </span>
              </div>
              <div className="stat-item">
                <span className="stat-label">峰值使用:</span>
                <span className="stat-value">
                  {formatBytes(report.metrics.memory.peak.usedJSHeapSize)}
                </span>
              </div>
              <div className="stat-item">
                <span className="stat-label">内存泄漏检测:</span>
                <span className={`stat-value ${
                  report.metrics.memory.leaks > 0 ? 'warning' : 'success'
                }`}>
                  {report.metrics.memory.leaks > 0 ? '⚠️ 检测到' : '✅ 正常'}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      <style>{`
        .performance-dashboard {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: #f8f9fa;
          border-radius: 12px;
          padding: 20px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
          max-width: 1000px;
          margin: 20px auto;
        }

        .dashboard-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
          padding-bottom: 15px;
          border-bottom: 2px solid #e9ecef;
        }

        .dashboard-header h2 {
          margin: 0;
          color: #2c3e50;
          font-size: 24px;
        }

        .header-actions {
          display: flex;
          align-items: center;
          gap: 15px;
        }

        button {
          background: #3498db;
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
          transition: background 0.2s;
        }

        button:hover {
          background: #2980b9;
        }

        .session-id {
          font-size: 12px;
          color: #7f8c8d;
          background: #ecf0f1;
          padding: 4px 8px;
          border-radius: 4px;
        }

        .dashboard-tabs {
          display: flex;
          gap: 10px;
          margin-bottom: 20px;
          border-bottom: 1px solid #dee2e6;
          padding-bottom: 10px;
        }

        .dashboard-tabs button {
          background: transparent;
          color: #6c757d;
          border: none;
          padding: 8px 16px;
          border-radius: 6px;
        }

        .dashboard-tabs button.active {
          background: #3498db;
          color: white;
        }

        .metrics-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 20px;
          margin-bottom: 30px;
        }

        .metric-card {
          background: 'var(--bg-base, #fff)';
          padding: 20px;
          border-radius: 10px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
          text-align: center;
        }

        .metric-card h3 {
          margin: 0 0 10px 0;
          color: #495057;
          font-size: 16px;
        }

        .metric-value {
          font-size: 32px;
          font-weight: bold;
          color: #2c3e50;
          margin: 10px 0;
        }

        .metric-label {
          font-size: 14px;
          color: #6c757d;
        }

        .recommendations {
          background: 'var(--bg-base, #fff)';
          padding: 20px;
          border-radius: 10px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
        }

        .recommendations h3 {
          margin: 0 0 15px 0;
          color: #495057;
        }

        .recommendations ul {
          margin: 0;
          padding-left: 20px;
        }

        .recommendations li {
          margin-bottom: 8px;
          color: #e74c3c;
        }

        .no-recommendations {
          color: #27ae60;
          font-style: italic;
        }

        .components-table {
          background: 'var(--bg-base, #fff)';
          border-radius: 10px;
          overflow: hidden;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
        }

        table {
          width: 100%;
          border-collapse: collapse;
        }

        th, td {
          padding: 12px 16px;
          text-align: left;
          border-bottom: 1px solid #dee2e6;
        }

        th {
          background: #f8f9fa;
          font-weight: 600;
          color: #495057;
        }

        .status-badge {
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 600;
        }

        .status-badge.success {
          background: #d4edda;
          color: #155724;
        }

        .status-badge.info {
          background: #d1ecf1;
          color: #0c5460;
        }

        .status-badge.warning {
          background: var(--color-warning-bg, #fff3cd);
          color: #856404;
        }

        .network-stats,
        .memory-stats {
          background: 'var(--bg-base, #fff)';
          padding: 20px;
          border-radius: 10px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
        }

        .stat-item {
          display: flex;
          justify-content: space-between;
          padding: 10px 0;
          border-bottom: 1px solid #f1f1f1;
        }

        .stat-item:last-child {
          border-bottom: none;
        }

        .stat-label {
          color: #495057;
          font-weight: 500;
        }

        .stat-value {
          color: #2c3e50;
          font-weight: 600;
        }

        .stat-value.warning {
          color: #e74c3c;
        }

        .stat-value.success {
          color: #27ae60;
        }

        .loading {
          text-align: center;
          padding: 40px;
          color: #6c757d;
        }
      `}</style>
    </div>
  );
};

export default PerformanceDashboard;