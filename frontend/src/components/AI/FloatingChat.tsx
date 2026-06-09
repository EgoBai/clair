/**
 * FloatingChat — 浮动AI对话入口
 * 
 * 右下角悬浮按钮 + 可展开的AI对话面板
 * 嵌入ChatPanel组件，提供全局AI对话能力
 */

import React, { useState } from 'react';
import { MessageOutlined, CloseOutlined } from '@ant-design/icons';
import ChatPanel from './ChatPanel';

const FloatingChat: React.FC = () => {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* 浮动按钮 */}
      {!open && (
        <div
          onClick={() => setOpen(true)}
          style={{
            position: 'fixed',
            bottom: 72,
            right: 24,
            zIndex: 1001,
            width: 48,
            height: 48,
            borderRadius: 24,
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: '0 4px 16px rgba(102, 126, 234, 0.4)',
            transition: 'all 0.3s ease',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'scale(1.1)';
            e.currentTarget.style.boxShadow = '0 6px 20px rgba(102, 126, 234, 0.5)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = '0 4px 16px rgba(102, 126, 234, 0.4)';
          }}
        >
          <MessageOutlined style={{ color: '#fff', fontSize: 22 }} />
        </div>
      )}

      {/* 对话面板 */}
      {open && (
        <div style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          zIndex: 1002,
          width: 400,
          height: 560,
          borderRadius: 16,
          overflow: 'hidden',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
          border: '1px solid #334155',
          display: 'flex',
          flexDirection: 'column',
        }}>
          {/* 关闭按钮 */}
          <div
            onClick={() => setOpen(false)}
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              zIndex: 10,
              width: 28,
              height: 28,
              borderRadius: 14,
              background: 'rgba(255,255,255,0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <CloseOutlined style={{ color: '#94a3b8', fontSize: 12 }} />
          </div>

          {/* ChatPanel 嵌入 */}
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <ChatPanel />
          </div>
        </div>
      )}

      {/* 移动端适配 */}
      <style>{`
        @media (max-width: 768px) {
          .floating-chat-panel {
            width: calc(100vw - 32px) !important;
            height: calc(100vh - 120px) !important;
            bottom: 16px !important;
            right: 16px !important;
          }
        }
      `}</style>
    </>
  );
};

export default React.memo(FloatingChat);
