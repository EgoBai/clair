import React, { useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import NavigationMenu from './NavigationMenu';
import { SimpleErrorBoundary } from '../Common/UnifiedErrorBoundary';
import { SettingOutlined, InfoCircleOutlined, GithubOutlined } from '@ant-design/icons';
import { Tooltip, Modal, Typography } from 'antd';

const { Text, Link } = Typography;

export const AppLayout: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const navigate = useNavigate();
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <SimpleErrorBoundary name="AppLayout">
      <div className="app-layout">
        <NavigationMenu />
        
        <main className="app-content">
          <div className="content-wrapper">
            {children || <Outlet />}
          </div>
        </main>

        {/* 设置按钮 — 右下角小图标，点击弹出信息面板 */}
        <Tooltip title="关于澄观">
          <div onClick={() => setSettingsOpen(true)} style={{
            position: 'fixed', bottom: 24, right: 24, zIndex: 1000,
            width: 36, height: 36, borderRadius: 18,
            background: '#1e293b', border: '1px solid #334155',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', opacity: 0.5, transition: 'opacity .2s',
          }}
            onMouseEnter={e => e.currentTarget.style.opacity = '1'}
            onMouseLeave={e => e.currentTarget.style.opacity = '0.5'}
          >
            <SettingOutlined style={{ color: '#94a3b8', fontSize: 16 }} />
          </div>
        </Tooltip>

        {/* 设置弹窗 */}
        <Modal
          title="关于澄观"
          open={settingsOpen}
          onCancel={() => setSettingsOpen(false)}
          footer={null}
          width={400}
        >
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🔭</div>
            <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>澄观 Clair</div>
            <Text type="secondary">AI 陪伴式投资研究助手</Text>
          </div>
          <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 16, marginTop: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <Text type="secondary">版本</Text>
              <Text>v2.0.0</Text>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <Text type="secondary">核心循环</Text>
              <Text>发掘 → 筛选 → 自选 → 复盘</Text>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <Text type="secondary">AI 引擎</Text>
              <Text>DeepSeek v4-pro</Text>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <Text type="secondary">数据覆盖</Text>
              <Text>5541 只 A 股</Text>
            </div>
          </div>
          <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 12, marginTop: 8, textAlign: 'center' }}>
            <Link href="https://github.com/EgoBai/clair" target="_blank">
              <GithubOutlined style={{ marginRight: 4 }} /> GitHub
            </Link>
          </div>
        </Modal>

      <style>{`
        .app-layout {
          display: flex;
          min-height: 100vh;
          background: #f5f5f7;
        }

        .app-content {
          flex: 1;
          margin-left: 240px;
          min-height: 100vh;
          display: flex;
          flex-direction: column;
        }

        .content-wrapper {
          flex: 1;
          padding: 24px;
          max-width: 1400px;
          margin: 0 auto;
          width: 100%;
        }

        /* 响应式设计 */
        @media (max-width: 768px) {
          .app-content {
            margin-left: 0;
            padding-top: 60px; /* 为移动端菜单按钮留出空间 */
          }

          .content-wrapper {
            padding: 16px;
          }
        }

        /* 页面过渡动画 */
        .page-enter {
          opacity: 0;
          transform: translateY(20px);
        }

        .page-enter-active {
          opacity: 1;
          transform: translateY(0);
          transition: opacity 300ms, transform 300ms;
        }

        .page-exit {
          opacity: 1;
          transform: translateY(0);
        }

        .page-exit-active {
          opacity: 0;
          transform: translateY(-20px);
          transition: opacity 300ms, transform 300ms;
        }

        /* 加载状态 */
        .loading-container {
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 400px;
          flex-direction: column;
          gap: 16px;
        }

        .loading-spinner {
          width: 40px;
          height: 40px;
          border: 3px solid #f3f3f3;
          border-top: 3px solid #667eea;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        .loading-text {
          color: #666;
          font-size: 14px;
        }

        /* 错误状态 */
        .error-container {
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 400px;
          flex-direction: column;
          gap: 16px;
          text-align: center;
          padding: 32px;
        }

        .error-icon {
          font-size: 48px;
          color: #ff6b6b;
        }

        .error-title {
          font-size: 18px;
          font-weight: 600;
          color: #333;
          margin: 0;
        }

        .error-message {
          color: #666;
          font-size: 14px;
          margin: 8px 0 16px;
        }

        .retry-button {
          padding: 8px 16px;
          background: #667eea;
          color: white;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          transition: background 0.2s;
        }

        .retry-button:hover {
          background: #5a67d8;
        }

        /* 空状态 */
        .empty-container {
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 300px;
          flex-direction: column;
          gap: 16px;
          text-align: center;
          padding: 32px;
        }

        .empty-icon {
          font-size: 48px;
          color: #a0a0a0;
        }

        .empty-title {
          font-size: 16px;
          font-weight: 500;
          color: #666;
          margin: 0;
        }

        .empty-message {
          color: #999;
          font-size: 14px;
          margin: 8px 0;
        }

        /* 卡片样式 */
        .card {
          background: white;
          border-radius: 12px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
          padding: 24px;
          margin-bottom: 24px;
          transition: transform 0.2s, box-shadow 0.2s;
        }

        .card:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
        }

        .card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }

        .card-title {
          font-size: 18px;
          font-weight: 600;
          color: #333;
          margin: 0;
        }

        .card-subtitle {
          font-size: 14px;
          color: #666;
          margin: 4px 0 0;
        }

        .card-actions {
          display: flex;
          gap: 8px;
        }

        /* 按钮样式 */
        .btn {
          padding: 8px 16px;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          border: none;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }

        .btn-primary {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
        }

        .btn-primary:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
        }

        .btn-secondary {
          background: #f0f0f0;
          color: #333;
        }

        .btn-secondary:hover {
          background: #e0e0e0;
        }

        .btn-outline {
          background: transparent;
          border: 1px solid #ddd;
          color: #333;
        }

        .btn-outline:hover {
          border-color: #667eea;
          color: #667eea;
        }

        /* 表格样式 */
        .data-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 14px;
        }

        .data-table th {
          background: #f8f9fa;
          padding: 12px 16px;
          text-align: left;
          font-weight: 600;
          color: #333;
          border-bottom: 2px solid #e9ecef;
        }

        .data-table td {
          padding: 12px 16px;
          border-bottom: 1px solid #e9ecef;
          color: #555;
        }

        .data-table tr:hover {
          background: #f8f9fa;
        }

        /* 表单样式 */
        .form-group {
          margin-bottom: 20px;
        }

        .form-label {
          display: block;
          margin-bottom: 8px;
          font-weight: 500;
          color: #333;
          font-size: 14px;
        }

        .form-control {
          width: 100%;
          padding: 10px 12px;
          border: 1px solid #ddd;
          border-radius: 6px;
          font-size: 14px;
          transition: border-color 0.2s;
        }

        .form-control:focus {
          outline: none;
          border-color: #667eea;
          box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }

        .form-help {
          margin-top: 4px;
          font-size: 12px;
          color: #666;
        }

        .form-error {
          margin-top: 4px;
          font-size: 12px;
          color: #ff6b6b;
        }

        /* 工具提示 */
        .tooltip {
          position: relative;
          display: inline-block;
        }

        .tooltip .tooltip-text {
          visibility: hidden;
          background-color: rgba(0, 0, 0, 0.9);
          color: white;
          text-align: center;
          padding: 6px 10px;
          border-radius: 4px;
          font-size: 12px;
          position: absolute;
          z-index: 1;
          bottom: 125%;
          left: 50%;
          transform: translateX(-50%);
          white-space: nowrap;
          opacity: 0;
          transition: opacity 0.2s;
        }

        .tooltip:hover .tooltip-text {
          visibility: visible;
          opacity: 1;
        }

        /* 响应式工具类 */
        .hidden-mobile {
          display: block;
        }

        .hidden-desktop {
          display: none;
        }

        @media (max-width: 768px) {
          .hidden-mobile {
            display: none;
          }
          
          .hidden-desktop {
            display: block;
          }
        }
      `}</style>
    </div>
  </SimpleErrorBoundary>
  );
};

export default React.memo(AppLayout);