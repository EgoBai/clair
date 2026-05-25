import React from 'react';
// PerformanceDemo removed during cleanup — this entry point is legacy
const PerformanceDemo = () => <div style={{ padding: 40, textAlign: 'center' }}>性能监控演示已移除</div>;
import { perfMonitor } from './utils/performanceMonitorEnhanced';

const PerformanceApp: React.FC = () => {
  // 初始化性能监控
  React.useEffect(() => {
    // removed: console.log
    
    // 在页面卸载时清理
    return () => {
      perfMonitor.cleanup();
    };
  }, []);

  return (
    <div className="performance-app">
      <PerformanceDemo />
      
      <footer className="app-footer">
        <div className="footer-content">
          <p>
            <strong>A股行情分析网站 - 性能监控演示</strong>
            <br />
            这个演示展示了增强版前端性能监控工具的功能。
          </p>
          <div className="footer-links">
            <a href="/" className="footer-link">返回主应用</a>
            <span className="footer-separator">•</span>
            <button 
              onClick={() => {
                const report = perfMonitor.generateReport();
                // removed: console.log
                alert('性能报告已生成，请查看控制台');
              }}
              className="footer-link"
            >
              生成控制台报告
            </button>
          </div>
        </div>
      </footer>

      <style>{`
        .performance-app {
          min-height: 100vh;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }

        .app-footer {
          background: rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(10px);
          padding: 30px 20px;
          margin-top: 40px;
          border-top: 1px solid rgba(255, 255, 255, 0.2);
        }

        .footer-content {
          max-width: 1200px;
          margin: 0 auto;
          text-align: center;
          color: white;
        }

        .footer-content p {
          margin-bottom: 20px;
          line-height: 1.6;
          opacity: 0.9;
        }

        .footer-links {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 15px;
          flex-wrap: wrap;
        }

        .footer-link {
          color: white;
          text-decoration: none;
          padding: 8px 16px;
          border-radius: 6px;
          background: rgba(255, 255, 255, 0.1);
          transition: all 0.2s;
          border: none;
          font-size: 14px;
          cursor: pointer;
        }

        .footer-link:hover {
          background: rgba(255, 255, 255, 0.2);
          transform: translateY(-2px);
        }

        .footer-separator {
          opacity: 0.5;
        }
      `}</style>
    </div>
  );
};

export default PerformanceApp;