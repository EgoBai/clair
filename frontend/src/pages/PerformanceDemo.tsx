import React, { useState, useEffect } from 'react';
import PerformanceDashboard from '../components/PerformanceDashboard';
import { perfMonitor } from '../utils/performanceMonitorEnhanced';

const PerformanceDemo: React.FC = () => {
  const [simulatedComponents, setSimulatedComponents] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // 模拟一些组件渲染
  const simulateComponentRender = (componentName: string) => {
    const markId = perfMonitor.startComponentRender(componentName);
    
    // 模拟不同的渲染时间
    const renderTime = Math.random() * 30 + 5; // 5-35ms
    
    setTimeout(() => {
      perfMonitor.endComponentRender(markId);
    }, renderTime);
  };

  const addSimulatedComponent = () => {
    const componentName = `SimulatedComponent-${simulatedComponents.length + 1}`;
    setSimulatedComponents(prev => [...prev, componentName]);
    simulateComponentRender(componentName);
  };

  const simulateNetworkRequest = async () => {
    setIsLoading(true);
    const startTime = Date.now();
    
    // 模拟网络请求
    await new Promise(resolve => setTimeout(resolve, Math.random() * 2000 + 500));
    
    const duration = Date.now() - startTime;
    // removed: console.log
    setIsLoading(false);
  };

  const simulateMemoryUsage = () => {
    // 创建一些对象来增加内存使用
    const largeArray = new Array(10000).fill(null).map((_, i) => ({
      id: i,
      data: new Array(100).fill('x').join(''),
      timestamp: Date.now()
    }));
    
    // removed: console.log
    
    // 稍后清理
    setTimeout(() => {
      // removed: console.log
    }, 10000);
  };

  const runPerformanceTest = () => {
    // 运行一系列性能测试
    // removed: console.log
    
    // 模拟多个组件渲染
    for (let i = 0; i < 10; i++) {
      simulateComponentRender(`TestComponent-${i}`);
    }
    
    // 模拟网络请求
    simulateNetworkRequest();
    
    // 模拟内存使用
    simulateMemoryUsage();
    
    // removed: console.log
  };

  return (
    <div className="performance-demo">
      <header className="demo-header">
        <h1>前端性能监控演示</h1>
        <p className="demo-description">
          这个页面展示了增强版性能监控工具的功能，包括：
          内存泄漏检测、组件渲染追踪、网络请求监控等。
        </p>
      </header>

      <div className="demo-content">
        <div className="demo-controls">
          <h2>控制面板</h2>
          <div className="control-buttons">
            <button onClick={addSimulatedComponent} className="control-button">
              添加模拟组件
            </button>
            <button onClick={simulateNetworkRequest} className="control-button" disabled={isLoading}>
              {isLoading ? '请求中...' : '模拟网络请求'}
            </button>
            <button onClick={simulateMemoryUsage} className="control-button">
              模拟内存使用
            </button>
            <button onClick={runPerformanceTest} className="control-button primary">
              运行完整测试
            </button>
          </div>

          <div className="simulated-components">
            <h3>模拟的组件 ({simulatedComponents.length})</h3>
            {simulatedComponents.length > 0 ? (
              <div className="components-list">
                {simulatedComponents.map((name, index) => (
                  <div key={index} className="component-item">
                    <span className="component-name">{name}</span>
                    <button 
                      onClick={() => simulateComponentRender(name)}
                      className="small-button"
                    >
                      重新渲染
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="no-components">暂无模拟组件，点击"添加模拟组件"按钮创建</p>
            )}
          </div>
        </div>

        <div className="demo-dashboard">
          <h2>性能监控仪表板</h2>
          <PerformanceDashboard autoRefresh={true} refreshInterval={3000} />
        </div>
      </div>

      <div className="demo-info">
        <h3>监控功能说明</h3>
        <div className="info-grid">
          <div className="info-card">
            <h4>🎯 内存监控</h4>
            <ul>
              <li>实时内存使用统计</li>
              <li>内存泄漏检测</li>
              <li>峰值内存记录</li>
            </ul>
          </div>
          <div className="info-card">
            <h4>⚡ 渲染性能</h4>
            <ul>
              <li>组件渲染时间追踪</li>
              <li>FPS 计算</li>
              <li>慢渲染组件识别</li>
            </ul>
          </div>
          <div className="info-card">
            <h4>🌐 网络监控</h4>
            <ul>
              <li>请求延迟测量</li>
              <li>慢请求识别</li>
              <li>数据量统计</li>
            </ul>
          </div>
          <div className="info-card">
            <h4>📊 报告生成</h4>
            <ul>
              <li>自动性能报告</li>
              <li>优化建议</li>
              <li>历史数据对比</li>
            </ul>
          </div>
        </div>
      </div>

      <style>{`
        .performance-demo {
          max-width: 1200px;
          margin: 0 auto;
          padding: 20px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        .demo-header {
          text-align: center;
          margin-bottom: 40px;
          padding-bottom: 20px;
          border-bottom: 2px solid #e9ecef;
        }

        .demo-header h1 {
          color: #2c3e50;
          margin-bottom: 10px;
        }

        .demo-description {
          color: #6c757d;
          max-width: 800px;
          margin: 0 auto;
          line-height: 1.6;
        }

        .demo-content {
          display: grid;
          grid-template-columns: 1fr 2fr;
          gap: 30px;
          margin-bottom: 40px;
        }

        @media (max-width: 1024px) {
          .demo-content {
            grid-template-columns: 1fr;
          }
        }

        .demo-controls {
          background: #f8f9fa;
          padding: 25px;
          border-radius: 12px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
        }

        .demo-controls h2 {
          color: #495057;
          margin-top: 0;
          margin-bottom: 20px;
        }

        .control-buttons {
          display: grid;
          grid-template-columns: 1fr;
          gap: 12px;
          margin-bottom: 30px;
        }

        .control-button {
          background: #6c757d;
          color: white;
          border: none;
          padding: 12px 20px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 16px;
          transition: all 0.2s;
          text-align: center;
        }

        .control-button:hover:not(:disabled) {
          background: #5a6268;
          transform: translateY(-2px);
        }

        .control-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .control-button.primary {
          background: #3498db;
        }

        .control-button.primary:hover:not(:disabled) {
          background: #2980b9;
        }

        .simulated-components {
          margin-top: 30px;
        }

        .simulated-components h3 {
          color: #495057;
          margin-bottom: 15px;
          font-size: 18px;
        }

        .components-list {
          max-height: 300px;
          overflow-y: auto;
          background: white;
          border-radius: 8px;
          padding: 15px;
          border: 1px solid #dee2e6;
        }

        .component-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px;
          border-bottom: 1px solid #f1f1f1;
        }

        .component-item:last-child {
          border-bottom: none;
        }

        .component-name {
          font-family: 'Monaco', 'Menlo', monospace;
          font-size: 14px;
          color: #495057;
        }

        .small-button {
          background: #e9ecef;
          color: #495057;
          border: none;
          padding: 6px 12px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 12px;
          transition: background 0.2s;
        }

        .small-button:hover {
          background: #dee2e6;
        }

        .no-components {
          color: #6c757d;
          font-style: italic;
          text-align: center;
          padding: 20px;
          background: white;
          border-radius: 8px;
          border: 1px dashed #dee2e6;
        }

        .demo-dashboard h2 {
          color: #495057;
          margin-top: 0;
          margin-bottom: 20px;
        }

        .demo-info {
          background: #f8f9fa;
          padding: 30px;
          border-radius: 12px;
          margin-top: 40px;
        }

        .demo-info h3 {
          color: #495057;
          margin-top: 0;
          margin-bottom: 25px;
          text-align: center;
          font-size: 24px;
        }

        .info-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 25px;
        }

        .info-card {
          background: white;
          padding: 25px;
          border-radius: 10px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
          transition: transform 0.2s;
        }

        .info-card:hover {
          transform: translateY(-5px);
        }

        .info-card h4 {
          color: #2c3e50;
          margin-top: 0;
          margin-bottom: 15px;
          font-size: 18px;
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .info-card ul {
          margin: 0;
          padding-left: 20px;
        }

        .info-card li {
          margin-bottom: 8px;
          color: #6c757d;
          line-height: 1.5;
        }

        .info-card li:last-child {
          margin-bottom: 0;
        }
      `}</style>
    </div>
  );
};

export default PerformanceDemo;