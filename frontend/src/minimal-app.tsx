import React from 'react';
import ReactDOM from 'react-dom/client';
import logger from './utils/logger';

// 最小化的React应用
const MinimalApp = () => {
  const [count, setCount] = React.useState(0);
  
  return (
    <div style={{
      padding: '40px',
      textAlign: 'center',
      fontFamily: 'Arial, sans-serif',
      backgroundColor: '#f5f5f5',
      minHeight: '100vh'
    }}>
      <h1 style={{ color: '#1890ff' }}>A股行情分析 - 最小化测试</h1>
      <p>这是一个最小化的React应用测试。</p>
      
      <div style={{
        margin: '20px 0',
        padding: '20px',
        backgroundColor: 'white',
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
      }}>
        <p>计数器: {count}</p>
        <button
          onClick={() => setCount(count + 1)}
          style={{
            padding: '10px 20px',
            backgroundColor: '#1890ff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            marginRight: '10px'
          }}
        >
          增加
        </button>
        <button
          onClick={() => setCount(0)}
          style={{
            padding: '10px 20px',
            backgroundColor: '#ff4d4f',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          重置
        </button>
      </div>
      
      <div style={{ marginTop: '30px' }}>
        <h3>API连接测试</h3>
        <button
          onClick={async () => {
            try {
              const response = await fetch('/api/stocks');
              const data = await response.json();
              alert(`API连接成功！获取到 ${data.count} 只股票数据`);
            } catch (error) {
              alert(`API连接失败: ${error instanceof Error ? error.message : String(error)}`);
            }
          }}
          style={{
            padding: '10px 20px',
            backgroundColor: '#52c41a',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          测试API连接
        </button>
      </div>
    </div>
  );
};

// 渲染函数
export function renderMinimalApp() {
  const rootElement = document.getElementById('root');
  if (rootElement) {
    const root = ReactDOM.createRoot(rootElement);
    root.render(
      <React.StrictMode>
        <MinimalApp />
      </React.StrictMode>
    );
    // removed: console.log
  } else {
    logger.error('找不到root元素');
  }
}