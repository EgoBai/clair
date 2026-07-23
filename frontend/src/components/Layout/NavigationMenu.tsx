import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { ROUTE_PATHS } from '../../routes/paths';

// 导航项类型
interface NavItem {
  id: string;
  label: string;
  path: string;
  icon: string;
  description?: string;
  children?: NavItem[];
}

// 导航配置
const NAV_ITEMS: NavItem[] = [
  {
    id: 'discover',
    label: '市场洞察',
    path: '/',
    icon: '🔭',
    description: '大盘趋势 · 板块轮动 · 资金流向 · AI解读'
  },
  {
    id: 'market',
    label: '策略选股',
    path: ROUTE_PATHS.SCREENER,
    icon: '🎯',
    description: 'AI策略推荐 · 核心指标组合 · 智能筛选'
  },
  {
    id: 'watchlist',
    label: '自选组合',
    path: ROUTE_PATHS.WATCHLIST,
    icon: '⭐',
    description: '实时行情 · 异动提醒 · AI总结 · AI复盘 · 推荐发现'
  },
  {
    id: 'industry-map',
    label: '产业地图',
    path: '/industry-map',
    icon: '🗺️',
    description: '产业链图谱 · 投资逻辑 · AI解读 · 核心标的'
  },
  {
    id: 'radar',
    label: '潜力雷达',
    path: '/radar',
    icon: '🏆',
    description: 'AI多因子评分 · 潜力股排行 · 综合分析'
  },
  {
    id: 'knowledge',
    label: '投资笔记',
    path: '/knowledge',
    icon: '📝',
    description: 'AI问答收藏·手动笔记·投资积累'
  }
];

// 导航菜单组件
export const NavigationMenu: React.FC = () => {
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [_activeItem, setActiveItem] = useState<string>('');

  // 处理导航项点击
  const handleNavClick = (itemId: string) => {
    setActiveItem(itemId);
    setIsMobileMenuOpen(false);
  };

  // 判断是否为当前路径
  const isActivePath = (path: string): boolean => {
    if (path === ROUTE_PATHS.HOME) {
      return location.pathname === path;
    }
    return location.pathname.startsWith(path);
  };

  // 移动端菜单切换
  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  return (
    <nav className="navigation-menu">
      {/* 移动端菜单按钮 */}
      <div className="mobile-menu-button">
        <button
          onClick={toggleMobileMenu}
          className="menu-toggle"
          aria-label={isMobileMenuOpen ? '关闭菜单' : '打开菜单'}
        >
          <span className="menu-icon">{isMobileMenuOpen ? '✕' : '☰'}</span>
          <span className="menu-label">菜单</span>
        </button>
      </div>

      {/* 桌面端导航 */}
      <div className={`nav-container ${isMobileMenuOpen ? 'mobile-open' : ''}`}>
        <div className="nav-header">
          <h2 className="nav-title">澄观</h2>
          <div className="nav-subtitle">Clair · 水静则明</div>
        </div>

        <ul className="nav-list">
          {NAV_ITEMS.map((item) => {
            const isActive = isActivePath(item.path);
            
            return (
              <li key={item.id} className="nav-item">
                <NavLink
                  to={item.path}
                  className={({ isActive }) => 
                    `nav-link ${isActive ? 'active' : ''}`
                  }
                  onClick={() => handleNavClick(item.id)}
                  title={item.description}
                >
                  <span className="nav-icon">{item.icon}</span>
                  <span className="nav-label">{item.label}</span>
                  {isActive && (
                    <span className="nav-indicator">▶</span>
                  )}
                </NavLink>
                
                {item.description && (
                  <div className="nav-tooltip">
                    {item.description}
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        {/* 导航底部信息 */}
        <div className="nav-footer">
          <div className="nav-status">
            <div className="status-indicator online"></div>
            <span className="status-text">服务正常</span>
          </div>
          <div className="nav-version">v1.0.0</div>
        </div>
      </div>

      {/* 移动端菜单遮罩 */}
      {isMobileMenuOpen && (
        <div 
          className="mobile-menu-overlay"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      <style>{`
        .navigation-menu {
          position: relative;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        /* 移动端菜单按钮 */
        .mobile-menu-button {
          display: none;
          position: fixed;
          top: 10px;
          left: 10px;
          z-index: 1001;
        }

        .menu-toggle {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
          transition: all 0.2s ease;
        }

        .menu-toggle:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
        }

        .menu-icon {
          font-size: 18px;
          font-weight: bold;
        }

        /* 导航容器 */
        .nav-container {
          width: 240px;
          height: 100vh;
          background: linear-gradient(180deg, #1a1a2e 0%, #16213e 100%);
          color: #e0e0e0;
          display: flex;
          flex-direction: column;
          position: fixed;
          left: 0;
          top: 0;
          z-index: 1000;
          box-shadow: 2px 0 10px rgba(0, 0, 0, 0.3);
          transition: transform 0.3s ease;
        }

        /* 导航头部 */
        .nav-header {
          padding: 24px 20px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .nav-title {
          margin: 0;
          font-size: 20px;
          font-weight: 700;
          color: white;
          background: linear-gradient(90deg, #667eea, #764ba2);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .nav-subtitle {
          margin-top: 4px;
          font-size: 12px;
          color: #a0a0a0;
        }

        /* 导航列表 */
        .nav-list {
          flex: 1;
          padding: 16px 0;
          overflow-y: auto;
          list-style: none;
          margin: 0;
        }

        .nav-item {
          position: relative;
          margin: 4px 12px;
        }

        .nav-link {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          color: #b0b0b0;
          text-decoration: none;
          border-radius: 8px;
          transition: all 0.2s ease;
          position: relative;
        }

        .nav-link:hover {
          background: rgba(255, 255, 255, 0.05);
          color: white;
          transform: translateX(4px);
        }

        .nav-link.active {
          background: linear-gradient(90deg, rgba(102, 126, 234, 0.2), rgba(118, 75, 162, 0.2));
          color: white;
          border-left: 3px solid #667eea;
        }

        .nav-icon {
          font-size: 18px;
          width: 24px;
          text-align: center;
        }

        .nav-label {
          flex: 1;
          font-size: 14px;
          font-weight: 500;
        }

        .nav-indicator {
          color: #667eea;
          font-size: 12px;
          animation: pulse 2s infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        /* 工具提示 */
        .nav-tooltip {
          position: absolute;
          left: 100%;
          top: 50%;
          transform: translateY(-50%);
          background: rgba(0, 0, 0, 0.9);
          color: white;
          padding: 8px 12px;
          border-radius: 6px;
          font-size: 12px;
          white-space: nowrap;
          opacity: 0;
          visibility: hidden;
          transition: all 0.2s ease;
          z-index: 1002;
          pointer-events: none;
          margin-left: 8px;
        }

        .nav-item:hover .nav-tooltip {
          opacity: 1;
          visibility: visible;
        }

        /* 导航底部 */
        .nav-footer {
          padding: 16px 20px;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          font-size: 12px;
        }

        .nav-status {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 8px;
        }

        .status-indicator {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #4caf50;
          animation: status-pulse 2s infinite;
        }

        @keyframes status-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        .status-text {
          color: #a0a0a0;
        }

        .nav-version {
          color: #666;
          text-align: center;
        }

        /* 移动端：完全隐藏侧边栏，用底部TabBar替代 */
        @media (max-width: 768px) {
          .navigation-menu {
            display: none;
          }
        }

        /* 滚动条样式 */
        .nav-list::-webkit-scrollbar {
          width: 4px;
        }

        .nav-list::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.05);
        }

        .nav-list::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.2);
          border-radius: 2px;
        }

        .nav-list::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.3);
        }
      `}</style>
    </nav>
  );
};

export default React.memo(NavigationMenu);
