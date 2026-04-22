import React from 'react';

const TestApp: React.FC = () => {
  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h1>React应用测试</h1>
      <p>如果看到这个页面，说明React应用正常工作。</p>
      <div style={{ marginTop: '20px', padding: '10px', backgroundColor: '#f0f0f0' }}>
        <h3>系统信息：</h3>
        <ul>
          <li>React版本: {React.version}</li>
          <li>当前时间: {new Date().toLocaleString()}</li>
          <li>用户代理: {navigator.userAgent}</li>
        </ul>
      </div>
    </div>
  );
};

export default TestApp;