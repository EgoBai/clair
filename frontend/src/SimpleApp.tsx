import React from 'react';
import ReactDOM from 'react-dom/client';

// 最简单的React应用
export const SimpleApp = () => {
  return (
    <div style={{ padding: '40px', textAlign: 'center' }}>
      <h1 style={{ color: '#1890ff' }}>A股行情分析</h1>
      <p>前端应用正在运行...</p>
      <button 
        onClick={() => alert('应用正常工作！')}
        style={{
          padding: '10px 20px',
          backgroundColor: '#52c41a',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer'
        }}
      >
        测试按钮
      </button>
    </div>
  );
};

// 直接渲染
const rootElement = document.getElementById('root');
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <SimpleApp />
    </React.StrictMode>
  );
}