/**
 * TabBar — 移动端底部导航栏
 *
 * 设计参考：iOS Human Interface Guidelines / Material Design Bottom Navigation
 * - 核心 Tab 对应核心页面
 * - 当前页面高亮 + 顶部指示条
 * - 触摸目标 ≥ 48px
 * - 支持 iPhone 安全区
 * - v2: 自选追踪与复盘研究合并为「自选组合」
 * - T6 (v3.8): 扩展为「5 主入口 + 更多 Sheet」，数据复用 src/config/navGroups.ts 的 NAV_GROUPS
 */

import React, { useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Drawer } from 'antd';
import { AppstoreOutlined } from '@ant-design/icons';
import { NAV_GROUPS } from '../../config/navGroups';

// 4 个主 Tab：复用 NAV_GROUPS 配置（按 id 取路径），保留既有 emoji 图标
const MAIN_TAB_DEFS = [
  { id: 'home', icon: '🔭' },
  { id: 'screener', icon: '🎯' },
  { id: 'watchlist', icon: '⭐' },
  { id: 'industry-map', icon: '🗺️' },
];

// 在 NAV_GROUPS 中按 id 定位子项（id 来自 navGroups.ts，禁止臆造）
const findItem = (id: string) =>
  NAV_GROUPS.flatMap((g) => g.items).find((i) => i.id === id)!;

export const TabBar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);

  // 4 个主 Tab：路径来自 NAV_GROUPS，图标沿用既有 emoji
  const mainTabs = useMemo(
    () =>
      MAIN_TAB_DEFS.map((d) => {
        const src = findItem(d.id);
        return { id: src.id, label: src.label, path: src.path, icon: d.icon };
      }),
    [],
  );

  const mainPaths = useMemo(
    () => new Set(mainTabs.map((t) => t.path)),
    [mainTabs],
  );

  // 「更多」Sheet 数据：NAV_GROUPS 中未被 4 主 Tab 覆盖的分组/子项（结构与桌面侧栏一致）
  const moreGroups = useMemo(
    () =>
      NAV_GROUPS.map((g) => ({
        ...g,
        items: g.items.filter((i) => !mainPaths.has(i.path)),
      })).filter((g) => g.items.length > 0),
    [mainPaths],
  );

  const moreItems = useMemo(
    () => moreGroups.flatMap((g) => g.items),
    [moreGroups],
  );

  const isActive = (path: string): boolean => {
    if (path === '/') return location.pathname === '/';
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  // 「更多」Tab 激活态：当前路由落在 Sheet 内某项（且非 4 主 Tab 已覆盖路径）
  const moreActive = moreItems.some((i) => isActive(i.path));

  const handleNavigate = (path: string) => {
    if (location.pathname !== path) navigate(path);
    setMoreOpen(false);
  };

  return (
    <>
      <nav className="tab-bar" role="tablist" aria-label="主导航">
        {mainTabs.map((item) => {
          const active = isActive(item.path);
          return (
            <button
              key={item.id}
              className={`tab-bar-item ${active ? 'active' : ''}`}
              onClick={() => handleNavigate(item.path)}
              role="tab"
              aria-selected={active}
              aria-label={item.label}
            >
              <span className="tab-bar-icon">{item.icon}</span>
              <span className="tab-bar-label">{item.label}</span>
            </button>
          );
        })}
        <button
          key="more"
          className={`tab-bar-item ${moreActive ? 'active' : ''}`}
          onClick={() => setMoreOpen(true)}
          role="tab"
          aria-selected={moreActive}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          aria-label="更多"
        >
          <span className="tab-bar-icon">
            <AppstoreOutlined />
          </span>
          <span className="tab-bar-label">更多</span>
        </button>
      </nav>

      <Drawer
        placement="bottom"
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        height="80vh"
        className="more-sheet"
        title="全部功能"
        closeIcon
        aria-label="更多导航"
        styles={{ body: { padding: 0 } }}
      >
        <div className="more-sheet-body">
          {moreGroups.map((group) => (
            <div className="more-sheet-group" key={group.id}>
              <div className="more-sheet-group-title">{group.label}</div>
              <div className="more-sheet-group-items">
                {group.items.map((item) => {
                  const GroupIcon = item.icon;
                  const active = isActive(item.path);
                  return (
                    <button
                      key={item.id}
                      className={`more-sheet-item ${active ? 'active' : ''}`}
                      onClick={() => handleNavigate(item.path)}
                      aria-current={active ? 'page' : undefined}
                    >
                      <GroupIcon className="more-sheet-item-icon" />
                      <span className="more-sheet-item-label">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </Drawer>
    </>
  );
};

export default React.memo(TabBar);
