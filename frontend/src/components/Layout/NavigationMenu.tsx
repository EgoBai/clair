import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { DownOutlined } from '@ant-design/icons';
import { NAV_GROUPS } from '../../config/navGroups';
import { ROUTE_PATHS } from '../../routes/paths';

// 折叠状态持久化 key（localStorage）
const COLLAPSED_STORAGE_KEY = 'clair-nav-collapsed-groups';

// 读取持久化的折叠状态 { [groupId]: true }
function readCollapsedGroups(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(COLLAPSED_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

// 导航菜单组件
export const NavigationMenu: React.FC = () => {
  const location = useLocation();
  // 默认全部展开：未记录的组视为展开（collapsed 只记录"已折叠"的组）
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(readCollapsedGroups);

  // 判断路径是否激活：首页精确匹配，其余前缀匹配（覆盖 /stocks/:symbol 等详情级）
  const isActivePath = (path: string): boolean => {
    if (path === ROUTE_PATHS.HOME) {
      return location.pathname === path;
    }
    return location.pathname.startsWith(path);
  };

  // 当前路由所在分组 id（该组必须展开）
  const activeGroupId = NAV_GROUPS.find((g) => g.items.some((i) => isActivePath(i.path)))?.id;

  // 切换分组折叠态并持久化
  const toggleGroup = (groupId: string) => {
    setCollapsed((prev) => {
      const next = { ...prev, [groupId]: !prev[groupId] };
      try {
        localStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* 忽略持久化失败（隐私模式等） */
      }
      return next;
    });
  };

  // 分组是否展开：未折叠 OR 属于当前路由所在组（必展开）
  const isGroupExpanded = (groupId: string): boolean =>
    !collapsed[groupId] || groupId === activeGroupId;

  return (
    <nav className="navigation-menu" aria-label="主导航">
      <div className="nav-container">
        {/* 品牌头 */}
        <div className="nav-header">
          <h2 className="nav-title">澄观</h2>
          <div className="nav-subtitle">Clair · 水静则明</div>
        </div>

        {/* 可滚动分组区 */}
        <div className="nav-scroll">
          {NAV_GROUPS.map((group) => {
            const expanded = isGroupExpanded(group.id);
            const groupListId = `nav-group-${group.id}`;
            return (
              <section className="nav-group" key={group.id}>
                <button
                  type="button"
                  className="nav-group-header"
                  aria-expanded={expanded}
                  aria-controls={groupListId}
                  onClick={() => toggleGroup(group.id)}
                >
                  <span className="nav-group-label">{group.label}</span>
                  <DownOutlined className="nav-group-chevron" aria-hidden="true" />
                </button>

                <ul
                  id={groupListId}
                  className={`nav-group-items${expanded ? '' : ' is-collapsed'}`}
                >
                  {group.items.map((item) => {
                    const isActive = isActivePath(item.path);
                    const ItemIcon = item.icon;
                    return (
                      <li className="nav-item" key={item.id}>
                        <NavLink
                          to={item.path}
                          className={`nav-link${isActive ? ' active' : ''}`}
                          aria-current={isActive ? 'page' : undefined}
                        >
                          <ItemIcon className="nav-icon" aria-hidden="true" />
                          <span className="nav-label">{item.label}</span>
                        </NavLink>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>

        {/* 导航底部状态区 */}
        <div className="nav-footer">
          <div className="nav-status">
            <span className="status-indicator" aria-hidden="true" />
            <span className="status-text">服务正常</span>
          </div>
          <div className="nav-version">v1.0.0</div>
        </div>
      </div>

      <style>{`
        .navigation-menu {
          position: relative;
          font-family: var(--font-body);
        }

        /* 导航容器 */
        .nav-container {
          width: 240px;
          height: 100vh;
          background: var(--bg-primary);
          color: var(--text-secondary);
          display: flex;
          flex-direction: column;
          position: fixed;
          left: 0;
          top: 0;
          z-index: 1000;
          border-right: 1px solid var(--border-subtle);
          transition: transform var(--transition-slow);
        }

        /* 品牌头 */
        .nav-header {
          padding: var(--space-6) var(--space-5);
          border-bottom: 1px solid var(--border-subtle);
        }

        .nav-title {
          margin: 0;
          font-size: var(--text-2xl);
          font-weight: var(--weight-bold);
          color: var(--text-inverse);
          background: var(--accent-gradient);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .nav-subtitle {
          margin-top: var(--space-1);
          font-size: var(--text-sm);
          color: var(--text-tertiary);
        }

        /* 可滚动分组区 */
        .nav-scroll {
          flex: 1;
          overflow-y: auto;
          padding: var(--space-3) 0;
        }

        .nav-group {
          margin: 0 var(--space-3);
        }

        /* 分组标题按钮（可折叠） */
        .nav-group-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
          min-height: 44px;
          padding: var(--space-2) var(--space-3);
          background: transparent;
          border: none;
          color: var(--text-tertiary);
          font-family: var(--font-body);
          font-size: var(--text-xs);
          font-weight: var(--weight-semibold);
          letter-spacing: 0.06em;
          cursor: pointer;
          border-radius: var(--radius-md);
          transition: color var(--transition-fast), background var(--transition-fast);
        }

        .nav-group-header:hover {
          color: var(--text-secondary);
          background: var(--bg-tertiary);
        }

        .nav-group-header:focus-visible {
          outline: 2px solid var(--accent-solid);
          outline-offset: 1px;
        }

        .nav-group-label {
          flex: 1;
          text-align: left;
        }

        .nav-group-chevron {
          font-size: 11px;
          transition: transform var(--transition-fast);
        }

        .nav-group-header[aria-expanded="false"] .nav-group-chevron {
          transform: rotate(-90deg);
        }

        /* 分组子项列表 */
        .nav-group-items {
          list-style: none;
          margin: 0;
          padding: 0;
        }

        .nav-group-items.is-collapsed {
          display: none;
        }

        .nav-item {
          margin: 2px 0;
        }

        /* 子项链接 */
        .nav-link {
          display: flex;
          align-items: center;
          gap: var(--space-3);
          min-height: 44px;
          padding: var(--space-2) var(--space-3);
          color: var(--text-secondary);
          text-decoration: none;
          border-radius: var(--radius-md);
          border-left: 3px solid transparent;
          transition: color var(--transition-fast), background var(--transition-fast);
        }

        .nav-link:hover {
          background: var(--bg-tertiary);
          color: var(--text-primary);
        }

        .nav-link:focus-visible {
          outline: 2px solid var(--accent-solid);
          outline-offset: 1px;
        }

        .nav-link.active {
          background: var(--accent-light);
          color: var(--accent-solid);
          border-left-color: var(--accent-solid);
          font-weight: var(--weight-medium);
        }

        .nav-icon {
          font-size: 16px;
          width: 20px;
          display: flex;
          justify-content: center;
          flex-shrink: 0;
        }

        .nav-label {
          flex: 1;
          font-size: var(--text-md);
        }

        /* 导航底部状态区 */
        .nav-footer {
          padding: var(--space-4) var(--space-5);
          border-top: 1px solid var(--border-subtle);
          font-size: var(--text-sm);
        }

        .nav-status {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          margin-bottom: var(--space-2);
        }

        .status-indicator {
          width: 8px;
          height: 8px;
          border-radius: var(--radius-full);
          background: var(--accent-solid);
          animation: clair-status-pulse 2s infinite;
        }

        @keyframes clair-status-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }

        .status-text {
          color: var(--text-tertiary);
        }

        .nav-version {
          color: var(--text-tertiary);
          text-align: center;
        }

        /* 移动端：整体隐藏，由底部 TabBar 承载 */
        @media (max-width: 768px) {
          .navigation-menu {
            display: none;
          }
        }

        /* 滚动条样式 */
        .nav-scroll::-webkit-scrollbar {
          width: 4px;
        }

        .nav-scroll::-webkit-scrollbar-track {
          background: transparent;
        }

        .nav-scroll::-webkit-scrollbar-thumb {
          background: var(--border-default);
          border-radius: var(--radius-sm);
        }

        .nav-scroll::-webkit-scrollbar-thumb:hover {
          background: var(--border-strong);
        }
      `}</style>
    </nav>
  );
};

export default React.memo(NavigationMenu);
