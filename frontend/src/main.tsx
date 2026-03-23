/**
 * 应用入口
 * 配置路由、全局Provider
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import AppLayout from './components/Layout/AppLayout';
import HomePage from './pages/HomePage';
import StockListPage from './pages/StockListPage';
import StockDetailPage from './pages/StockDetailPage';
import MarketAnalysisPage from './pages/MarketAnalysisPage';
import './App.css';

// Ant Design 主题配置（A股红涨绿跌）
const antdTheme = {
  token: {
    colorPrimary: '#3B82F6',
    colorError: '#EF4444',
    colorSuccess: '#22C55E',
    borderRadius: 8,
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif",
  },
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider locale={zhCN} theme={antdTheme}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<AppLayout />}>
            <Route index element={<HomePage />} />
            <Route path="stocks" element={<StockListPage />} />
            <Route path="stock/:symbol" element={<StockDetailPage />} />
            <Route path="market" element={<MarketAnalysisPage />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ConfigProvider>
  </React.StrictMode>,
);

// 404 页面
function NotFound() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '60vh',
      color: '#999',
    }}>
      <div style={{ fontSize: 64, marginBottom: 16 }}>404</div>
      <div style={{ fontSize: 18 }}>页面不存在</div>
      <a href="/" style={{ marginTop: 16, color: '#3B82F6' }}>返回首页</a>
    </div>
  );
}
