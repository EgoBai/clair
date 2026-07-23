/**
 * TabBar — 移动端底部导航栏
 * 
 * 设计参考：iOS Human Interface Guidelines / Material Design Bottom Navigation
 * - 核心Tab对应核心页面
 * - 当前页面高亮 + 顶部指示条
 * - 触摸目标 ≥ 48px
 * - 支持 iPhone 安全区
 * - v2: 自选追踪与复盘研究合并为「自选组合」
 */

import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

interface TabItem {
  id: string;
  label: string;
  icon: string;
  path: string;
}

const TAB_ITEMS: TabItem[] = [
  { id: 'discover', label: '洞察', icon: '🔭', path: '/' },
  { id: 'screener', label: '选股', icon: '🎯', path: '/screener' },
  { id: 'watchlist', label: '自选', icon: '⭐', path: '/watchlist' },
  { id: 'industry-map', label: '产业', icon: '🗺️', path: '/industry-map' },
];

export const TabBar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path: string): boolean => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  const handleTabClick = (path: string) => {
    if (location.pathname !== path) {
      navigate(path);
    }
  };

  return (
    <nav className="tab-bar" role="tablist" aria-label="主导航">
      {TAB_ITEMS.map((item) => (
        <button
          key={item.id}
          className={`tab-bar-item ${isActive(item.path) ? 'active' : ''}`}
          onClick={() => handleTabClick(item.path)}
          role="tab"
          aria-selected={isActive(item.path)}
          aria-label={item.label}
        >
          <span className="tab-bar-icon">{item.icon}</span>
          <span className="tab-bar-label">{item.label}</span>
        </button>
      ))}
    </nav>
  );
};

export default React.memo(TabBar);
