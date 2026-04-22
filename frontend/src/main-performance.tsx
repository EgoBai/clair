import React from 'react';
import ReactDOM from 'react-dom/client';
import PerformanceApp from './PerformanceApp';
import './index.css';

// 添加一些全局样式
const style = document.createElement('style');
style.textContent = `
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
    line-height: 1.6;
    color: #333;
    background: #f5f5f5;
  }

  #root {
    min-height: 100vh;
  }

  button {
    font-family: inherit;
  }

  a {
    color: inherit;
    text-decoration: none;
  }
`;
document.head.appendChild(style);

// 渲染应用
const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('找不到 #root 元素');
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <PerformanceApp />
  </React.StrictMode>
);

// 热重载支持
if (import.meta.hot) {
  import.meta.hot.accept();
}