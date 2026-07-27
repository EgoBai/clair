/**
 * 移动端底部导航栏
 * 固定在屏幕底部，5个主要Tab
 */

import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

interface NavItem {
  key: string;
  path: string;
  label: string;
  icon: string;
}

const NAV_ITEMS: NavItem[] = [
  { key: 'home', path: '/', label: '首页', icon: '🏠' },
  { key: 'market', path: '/market', label: '行情', icon: '📊' },
  { key: 'watchlist', path: '/watchlist', label: '自选', icon: '⭐' },
  { key: 'screener', path: '/screener', label: '选股', icon: '🔍' },
  { key: 'portfolio', path: '/portfolio', label: '持仓', icon: '💼' },
];

const MobileNavigation: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <nav
      className="mobile-bottom-nav"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: 56,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-around',
        backgroundColor: 'rgba(16, 20, 40, 0.95)',
        backdropFilter: 'blur(20px)',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        zIndex: 1000,
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {NAV_ITEMS.map((item) => {
        const isActive = location.pathname === item.path;
        return (
          <button
            key={item.key}
            onClick={() => navigate(item.path)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '4px 12px',
              color: isActive ? '#3b82f6' : '#6b7280',
              transition: 'color 0.2s',
              WebkitTapHighlightColor: 'transparent',
              minWidth: 56,
            }}
          >
            <span style={{ fontSize: 20, lineHeight: 1 }}>{item.icon}</span>
            <span style={{
              fontSize: 10,
              fontWeight: isActive ? 600 : 400,
              marginTop: 2,
            }}>
              {item.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
};

export default MobileNavigation;
