import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ROUTE_PATHS } from '../routes';

const NotFoundPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="not-found-page">
      <div className="error-container">
        <div className="error-code">404</div>
        <div className="error-icon">🔍</div>
        <h1 className="error-title">页面未找到</h1>
        <p className="error-message">
          抱歉，您访问的页面不存在或已被移动。
        </p>
        
        <div className="error-actions">
          <button 
            className="action-btn primary"
            onClick={() => navigate(-1)}
          >
            ← 返回上一页
          </button>
          <Link to={ROUTE_PATHS.HOME} className="action-btn">
            🏠 返回首页
          </Link>
          <button 
            className="action-btn"
            onClick={() => window.location.reload()}
          >
            🔄 刷新页面
          </button>
        </div>

        <div className="quick-links">
          <h3>📋 快速导航</h3>
          <div className="links-grid">
            <Link to={ROUTE_PATHS.STOCKS} className="link-card">
              <div className="link-icon">📈</div>
              <div className="link-content">
                <h4>股票列表</h4>
                <p>查看所有股票行情</p>
              </div>
            </Link>
            <Link to={ROUTE_PATHS.SCREENER} className="link-card">
              <div className="link-icon">📊</div>
              <div className="link-content">
                <h4>股票筛选</h4>
                <p>按条件筛选股票</p>
              </div>
            </Link>
            <Link to={ROUTE_PATHS.WATCHLIST} className="link-card">
              <div className="link-icon">⭐</div>
              <div className="link-content">
                <h4>自选股</h4>
                <p>管理关注的股票</p>
              </div>
            </Link>
            <Link to={ROUTE_PATHS.SCREENER} className="link-card">
              <div className="link-icon">🔍</div>
              <div className="link-content">
                <h4>股票筛选</h4>
                <p>按条件筛选股票</p>
              </div>
            </Link>
          </div>
        </div>

        <div className="help-section">
          <h3>💡 需要帮助？</h3>
          <div className="help-options">
            <div className="help-option">
              <div className="help-icon">📧</div>
              <div className="help-content">
                <h4>联系支持</h4>
                <p>发送邮件至 support@astock.com</p>
              </div>
            </div>
            <div className="help-option">
              <div className="help-icon">📚</div>
              <div className="help-content">
                <h4>查看文档</h4>
                <p>访问帮助中心获取更多信息</p>
              </div>
            </div>
            <div className="help-option">
              <div className="help-icon">🐛</div>
              <div className="help-content">
                <h4>报告问题</h4>
                <p>反馈您遇到的问题</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .not-found-page {
          min-height: 80vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 40px 20px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }

        .error-container {
          background: white;
          border-radius: 20px;
          padding: 40px;
          max-width: 800px;
          width: 100%;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
          text-align: center;
        }

        .error-code {
          font-size: 120px;
          font-weight: 900;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          line-height: 1;
          margin-bottom: 20px;
        }

        .error-icon {
          font-size: 64px;
          margin-bottom: 20px;
          animation: bounce 2s infinite;
        }

        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }

        .error-title {
          font-size: 32px;
          font-weight: 700;
          color: #333;
          margin: 0 0 16px;
        }

        .error-message {
          font-size: 18px;
          color: #666;
          margin: 0 0 32px;
          line-height: 1.6;
        }

        .error-actions {
          display: flex;
          justify-content: center;
          gap: 16px;
          margin-bottom: 40px;
          flex-wrap: wrap;
        }

        .action-btn {
          padding: 12px 24px;
          background: #f5f5f5;
          border: none;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          text-decoration: none;
          color: #333;
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }

        .action-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        }

        .action-btn.primary {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
        }

        /* 快速链接 */
        .quick-links {
          margin-bottom: 40px;
          padding-top: 40px;
          border-top: 1px solid #f0f0f0;
        }

        .quick-links h3 {
          font-size: 20px;
          font-weight: 600;
          margin: 0 0 24px;
          color: #333;
        }

        .links-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 16px;
        }

        .link-card {
          background: #f8f9fa;
          border-radius: 12px;
          padding: 20px;
          text-decoration: none;
          color: inherit;
          display: flex;
          align-items: center;
          gap: 12px;
          transition: all 0.2s;
        }

        .link-card:hover {
          background: #e9ecef;
          transform: translateY(-2px);
        }

        .link-icon {
          font-size: 24px;
        }

        .link-content h4 {
          margin: 0 0 4px;
          font-size: 14px;
          font-weight: 600;
          color: #333;
          text-align: left;
        }

        .link-content p {
          margin: 0;
          font-size: 12px;
          color: #666;
          text-align: left;
        }

        /* 帮助部分 */
        .help-section {
          padding-top: 40px;
          border-top: 1px solid #f0f0f0;
        }

        .help-section h3 {
          font-size: 20px;
          font-weight: 600;
          margin: 0 0 24px;
          color: #333;
        }

        .help-options {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 20px;
        }

        .help-option {
          background: #f8f9fa;
          border-radius: 12px;
          padding: 20px;
          display: flex;
          align-items: center;
          gap: 16px;
          transition: all 0.2s;
        }

        .help-option:hover {
          background: #e9ecef;
          transform: translateY(-2px);
        }

        .help-icon {
          font-size: 32px;
        }

        .help-content h4 {
          margin: 0 0 4px;
          font-size: 14px;
          font-weight: 600;
          color: #333;
          text-align: left;
        }

        .help-content p {
          margin: 0;
          font-size: 12px;
          color: #666;
          text-align: left;
        }

        /* 响应式设计 */
        @media (max-width: 768px) {
          .error-container {
            padding: 30px 20px;
          }

          .error-code {
            font-size: 80px;
          }

          .error-icon {
            font-size: 48px;
          }

          .error-title {
            font-size: 24px;
          }

          .error-message {
            font-size: 16px;
          }

          .error-actions {
            flex-direction: column;
            align-items: center;
          }

          .action-btn {
            width: 100%;
            max-width: 300px;
            justify-content: center;
          }

          .links-grid {
            grid-template-columns: repeat(2, 1fr);
          }

          .help-options {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 480px) {
          .error-code {
            font-size: 60px;
          }

          .links-grid {
            grid-template-columns: 1fr;
          }

          .link-card, .help-option {
            flex-direction: column;
            text-align: center;
          }

          .link-content h4,
          .link-content p,
          .help-content h4,
          .help-content p {
            text-align: center;
          }
        }
      `}</style>
    </div>
  );
};

export default NotFoundPage;