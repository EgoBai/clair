import React, { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { DownOutlined, MenuFoldOutlined, MenuUnfoldOutlined } from '@ant-design/icons';
import { NAV_GROUPS } from '../../config/navGroups';
import { ROUTE_PATHS } from '../../routes/paths';
import { resolveApiOrigin } from '../../config/apiBase';

/**
 * ============================================================================
 * 侧栏底部服务状态灯 —— 从「纯硬编码」改为真实探测（2026-11-03）
 * ============================================================================
 * 缺陷：此处原先恒渲染绿点「服务正常」与 `v1.0.0` 两个**字面量**，没有任何请求。
 * 后端关掉、域名配错、进降级态时，侧栏依旧亮绿灯——这是"假状态灯"，
 * 比缺功能更伤信任（同屏右下角还显示着另一个版本号 "v1.7.0 · 未知"，自相矛盾）。
 *
 * 现在的口径：
 *   - 可达性与版本：`GET /api/version`（后端自报 appVersion 的唯一真源）。
 *     该路径在 dev 由 Vite proxy 转发、生产由 main.tsx 的 /api 前缀重写指向后端，
 *     是两种模式下都能打到后端的路径。
 *   - 降级态：`GET /health` 顶层 `degraded`（唯一真源，dbFactory.deriveHealthContract）。
 *     /health 挂在后端**根路径**（不在 /api 下），故用 resolveApiOrigin() 拼绝对地址；
 *     取不到时**不臆造降级结论**，也不因此把可达的后端报成异常。
 *   - 三态：正常（200 且 degraded=false）/ 降级（200 且 degraded=true）/ 异常（请求失败或 4xx/5xx）。
 *     版本号取 /api/version 的 appVersion，取不到显示「—」，**绝不回退成硬编码版本字符串**。
 *   - 轮询 60s：只为发现「后端变挂/恢复」，不为实时性；间隔过短会加剧后端限流。
 * ============================================================================
 */

/** 侧栏状态三态 + 首次探测中的过渡态 */
type BackendStatus = 'checking' | 'healthy' | 'degraded' | 'error';

/** 状态文案（对外可见，测试与用户共用同一份真源） */
const STATUS_TEXT: Record<BackendStatus, string> = {
  checking: '检测中',
  healthy: '服务正常',
  degraded: '服务降级',
  error: '服务异常',
};

/** 悬停说明：让用户知道这个灯是**探测**出来的，而不是装饰 */
const STATUS_TITLE: Record<BackendStatus, string> = {
  checking: '正在检测后端 /api/version 与 /health',
  healthy: '/api/version 可达，/health 未报告降级',
  degraded: '/api/version 可达，但 /health 报告 degraded=true（数据库降级或数据源不可用）',
  error: '后端不可达：/api/version 请求失败或返回 4xx/5xx',
};

/** 探测间隔下限 60s：再短只是在给后端限流添压，不会让状态更准 */
const PROBE_INTERVAL_MS = 60_000;
const PROBE_TIMEOUT_MS = 5_000;

interface ProbeResult {
  status: BackendStatus;
  /** 后端自报版本号；不可得为 null（UI 渲染「—」） */
  version: string | null;
}

/**
 * 真实探测后端状态。任一环节失败都不抛错，只如实降级为对应状态。
 * 注意「200 但不是 JSON」必须判为异常：静态托管常把未命中的 /api/* 兜成 index.html，
 * 那种 200 恰恰说明后端没在服务，按 ok 处理就是又一次假绿灯。
 */
async function probeBackend(): Promise<ProbeResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    let res: Response;
    try {
      res = await fetch('/api/version', {
        signal: controller.signal,
        headers: { accept: 'application/json' },
      });
    } catch {
      // 网络层失败 / 超时 / 跨域被拒
      return { status: 'error', version: null };
    }
    if (!res.ok) return { status: 'error', version: null };

    let version: string | null = null;
    try {
      const payload = (await res.json()) as { appVersion?: unknown } | null;
      if (typeof payload?.appVersion === 'string' && payload.appVersion.trim()) {
        version = payload.appVersion.trim();
      }
    } catch {
      return { status: 'error', version: null };
    }

    // 降级态：/health 顶层 degraded 是唯一真源
    let degraded: boolean | null = null;
    try {
      const origin = resolveApiOrigin(); // dev: ''（相对路径）；生产：后端根地址
      const healthRes = await fetch(`${origin}/health`, {
        signal: controller.signal,
        headers: { accept: 'application/json' },
      });
      if (healthRes.ok) {
        const health = (await healthRes.json()) as { degraded?: unknown } | null;
        if (typeof health?.degraded === 'boolean') degraded = health.degraded;
      }
    } catch {
      // 取不到降级态：不改变「服务可达」这一已证实的事实，也不编造降级
    }

    return { status: degraded === true ? 'degraded' : 'healthy', version };
  } finally {
    clearTimeout(timer);
  }
}

// 折叠状态持久化 key（localStorage）
const COLLAPSED_STORAGE_KEY = 'clair-nav-collapsed-groups';
// 平板 icon-rail「固定展开」持久化 key（与分组折叠态区分）
const RAIL_PINNED_STORAGE_KEY = 'clair-nav-rail-pinned';

// 读取持久化的折叠状态 { [groupId]: true }
function readCollapsedGroups(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(COLLAPSED_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

// 读取平板 icon-rail 是否被固定展开
function readRailPinned(): boolean {
  try {
    return localStorage.getItem(RAIL_PINNED_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

// 导航菜单组件
export const NavigationMenu: React.FC = () => {
  const location = useLocation();
  // 默认全部展开：未记录的组视为展开（collapsed 只记录"已折叠"的组）
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(readCollapsedGroups);
  // 平板断点（769–1024px）icon-rail 是否固定展开；固定时忽略 hover 收起
  const [railPinned, setRailPinned] = useState<boolean>(readRailPinned);
  // 后端起态：先「检测中」，由真实探测结果替换（绝不以「正常」作为初始值假装已知）
  const [backend, setBackend] = useState<ProbeResult>({ status: 'checking', version: null });

  // 真实轮询后端状态：挂载即探一次，之后每 60s 一次；卸载时停止（不再对已卸载组件 setState）
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const result = await probeBackend();
      if (!cancelled) setBackend(result);
    };

    void run();
    const timer = setInterval(() => { void run(); }, PROBE_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

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

  // 切换 icon-rail 固定展开态并持久化
  const toggleRailPinned = () => {
    setRailPinned((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(RAIL_PINNED_STORAGE_KEY, next ? '1' : '0');
      } catch {
        /* 忽略持久化失败（隐私模式等） */
      }
      return next;
    });
  };

  return (
    <nav className="navigation-menu" aria-label="主导航">
      <div className={`nav-container${railPinned ? ' is-rail-pinned' : ''}`}>
        {/* 品牌头 */}
        <div className="nav-header">
          <h2 className="nav-title">澄观</h2>
          <div className="nav-subtitle">Clair · 水静则明</div>
          {/*
            固定/取消固定 icon-rail。仅 769–1024px 断点可见（CSS 控制）。
            用 role="switch" + aria-checked 表达二元开关语义 —— 同时也避免与
            5 个分组折叠 button 混在同一 role 里造成查询歧义。
          */}
          <button
            type="button"
            role="switch"
            aria-checked={railPinned}
            aria-label="固定导航栏"
            title={railPinned ? '取消固定导航栏' : '固定导航栏'}
            className="nav-rail-toggle"
            onClick={toggleRailPinned}
          >
            {railPinned ? (
              <MenuFoldOutlined aria-hidden="true" />
            ) : (
              <MenuUnfoldOutlined aria-hidden="true" />
            )}
          </button>
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
                  /* rail 收起态下 .nav-group-label 被隐藏，无障碍名需显式兜底 */
                  aria-label={group.label}
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
                          className={`nav-link${isActive ? ' active' : ''}${item.featured ? ' has-featured' : ''}`}
                          aria-current={isActive ? 'page' : undefined}
                          /* rail 收起态只剩图标，用原生 title 提供可辨识提示（零依赖） */
                          title={item.label}
                        >
                          <ItemIcon className="nav-icon" aria-hidden="true" />
                          {/* 徽标放在 .nav-label 内：平板 icon-rail 收起态随文本整体隐藏 */}
                          <span className="nav-label">
                            {item.label}
                            {item.featured && <em className="nav-featured-flag">荐</em>}
                          </span>
                        </NavLink>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>

        {/* 导航底部状态区：真实探测（/api/version + /health），非硬编码 */}
        <div className="nav-footer">
          <div className="nav-status" role="status" aria-live="polite" title={STATUS_TITLE[backend.status]}>
            <span
              className={`status-indicator status-${backend.status}`}
              data-status={backend.status}
              aria-hidden="true"
            />
            <span className="status-text">{STATUS_TEXT[backend.status]}</span>
          </div>
          {/* 版本号来自后端 /api/version；取不到显示「—」，不回退任何硬编码版本 */}
          <div className="nav-version" title={backend.version ? `后端自报版本 v${backend.version}` : '后端未返回 appVersion'}>
            {backend.version ? `v${backend.version}` : '—'}
          </div>
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

        /* 平板 icon-rail 的「固定展开」开关：默认不存在，仅 769–1024px 断点启用 */
        .nav-rail-toggle {
          display: none;
          align-items: center;
          justify-content: center;
          width: 44px;
          height: 44px;
          padding: 0;
          background: transparent;
          border: none;
          border-radius: var(--radius-md);
          color: var(--text-tertiary);
          font-size: var(--text-lg);
          cursor: pointer;
          transition: color var(--transition-fast), background var(--transition-fast);
        }

        .nav-rail-toggle:hover {
          color: var(--text-primary);
          background: var(--bg-tertiary);
        }

        .nav-rail-toggle:focus-visible {
          outline: 2px solid var(--accent-solid);
          outline-offset: 1px;
        }

        .nav-rail-toggle[aria-checked="true"] {
          color: var(--accent-solid);
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

        /* 高亮入口（featured）—— 投资笔记：置顶强调 + 「荐」徽标
           徽标嵌套于 .nav-label 内，平板 icon-rail 收起态随文本一起隐藏，不产生悬浮残留 */
        .nav-link.has-featured {
          background: linear-gradient(90deg, var(--accent-light), transparent 85%);
          color: var(--text-primary);
          border-left-color: var(--accent-solid);
        }

        .nav-link.has-featured:hover {
          background: linear-gradient(90deg, var(--bg-tertiary), transparent 85%);
        }

        .nav-link.has-featured .nav-icon {
          color: var(--accent-solid);
        }

        .nav-featured-flag {
          margin-left: 6px;
          font-style: normal;
          font-size: 10px;
          line-height: 1.4;
          padding: 1px 6px;
          border-radius: 999px;
          color: #fff;
          background: linear-gradient(90deg, var(--accent-solid), #ef4444);
          box-shadow: 0 0 0 2px var(--bg-primary);
          vertical-align: 1px;
          letter-spacing: 0.04em;
        }

        .nav-link.has-featured.active .nav-featured-flag {
          box-shadow: 0 0 0 2px var(--accent-light);
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

        /* 三态配色：绿=正常 / 黄=降级 / 红=异常。
           设计系统没有单独的 success 绿，--color-down 就是那支绿（A 股语义下叫"下跌色"，
           此处只取颜色值）。检测中用中性蓝，不带脉冲——还没结论时不该摆出"活着"的姿态。 */
        .status-indicator.status-healthy {
          background: var(--color-down);
        }

        .status-indicator.status-degraded {
          background: var(--color-warning);
        }

        .status-indicator.status-error {
          background: var(--color-up);
        }

        .status-indicator.status-checking {
          background: var(--text-tertiary);
          animation: none;
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

        /* ============================================================
           平板断点 769–1024px：icon-rail + 悬浮抽屉（T7）
           - 收起态 64px，只留图标；分组用 1px 分隔线区分
           - hover / 键盘 focus-within / 固定按钮 → 展开回 240px
           - 展开是「浮层覆盖」：.app-content 在该断点恒为 margin-left:64px，
             靠 z-index:1000 + shadow 盖住内容，不推挤、不触发重排抖动
           - 两态差异全部收敛到下面两组 CSS 变量，消费者规则只写一份
           ============================================================ */
        @media (min-width: 769px) and (max-width: 1024px) {
          /* —— 收起态（icon-rail）—— */
          .nav-container {
            --nav-w: 64px;
            --nav-shadow: none;
            --nav-text-display: none;
            --nav-chevron-display: none;
            --nav-side-pad: var(--space-2);
            --nav-header-pad: var(--space-3) var(--space-2);
            --nav-header-cols: 1fr;
            --nav-header-justify: center;
            --nav-toggle-area: 2 / 1 / 3 / 2;
            --nav-title-w: 1em;
            --nav-link-justify: center;
            --nav-link-gap: 0;
            --nav-link-pad-x: 0;
            --nav-group-gap: var(--space-3);
            --nav-group-sep: 1px solid var(--border-subtle);
            --nav-group-header-h: var(--space-3);
            --nav-group-header-pad: 0;
            --nav-group-header-hover: transparent;
            --nav-footer-pad: var(--space-4) var(--space-2);
            --nav-status-justify: center;
          }

          /* —— 展开态（悬浮抽屉）：hover / 键盘 focus / 已固定 —— */
          .nav-container:hover,
          .nav-container:focus-within,
          .nav-container.is-rail-pinned {
            --nav-w: 240px;
            --nav-shadow: var(--shadow-lg);
            --nav-text-display: block;
            --nav-chevron-display: inline-flex;
            --nav-side-pad: var(--space-3);
            --nav-header-pad: var(--space-6) var(--space-5);
            --nav-header-cols: 1fr auto;
            --nav-header-justify: stretch;
            --nav-toggle-area: 1 / 2 / 3 / 3;
            --nav-title-w: auto;
            --nav-link-justify: flex-start;
            --nav-link-gap: var(--space-3);
            --nav-link-pad-x: var(--space-3);
            --nav-group-gap: 0;
            --nav-group-sep: none;
            --nav-group-header-h: 44px;
            --nav-group-header-pad: var(--space-2) var(--space-3);
            --nav-group-header-hover: var(--bg-tertiary);
            --nav-footer-pad: var(--space-4) var(--space-5);
            --nav-status-justify: flex-start;
          }

          .nav-container {
            width: var(--nav-w);
            box-shadow: var(--nav-shadow);
            transition: width var(--transition-normal), box-shadow var(--transition-normal);
          }

          /* 品牌头：两态等高（收起 ≈102px / 展开 ≈100px），锁 104px 防纵向抖动 */
          .nav-header {
            display: grid;
            grid-template-columns: var(--nav-header-cols);
            justify-items: var(--nav-header-justify);
            align-items: center;
            gap: var(--space-2);
            min-height: 104px;
            padding: var(--nav-header-pad);
          }

          /* 收起态按 1em 裁切，只露出「澄」单字作为紧凑标识 */
          .nav-title {
            grid-area: 1 / 1 / 2 / 2;
            width: var(--nav-title-w);
            line-height: 1.2;
            white-space: nowrap;
            overflow: hidden;
          }

          .nav-subtitle {
            grid-area: 2 / 1 / 3 / 2;
            display: var(--nav-text-display);
          }

          .nav-rail-toggle {
            display: inline-flex;
            grid-area: var(--nav-toggle-area);
          }

          .nav-scroll {
            overflow-x: hidden;
          }

          .nav-group {
            margin: 0 var(--nav-side-pad);
          }

          /* 收起态：分组标题退化为 1px 分隔线 + 12px 呼吸位，
             避免 26 个图标糊成一条；按钮本体保留在 tab 序列里 */
          .nav-group + .nav-group {
            margin-top: var(--nav-group-gap);
            border-top: var(--nav-group-sep);
          }

          .nav-group-header {
            min-height: var(--nav-group-header-h);
            padding: var(--nav-group-header-pad);
          }

          .nav-group-header:hover {
            background: var(--nav-group-header-hover);
          }

          .nav-group-label {
            display: var(--nav-text-display);
          }

          .nav-group-chevron {
            display: var(--nav-chevron-display);
          }

          /* 触摸目标：min-height 44px 由基础规则保留，此处只改轴向对齐 */
          .nav-link {
            justify-content: var(--nav-link-justify);
            gap: var(--nav-link-gap);
            padding-left: var(--nav-link-pad-x);
            padding-right: var(--nav-link-pad-x);
          }

          .nav-label {
            display: var(--nav-text-display);
          }

          .nav-footer {
            padding: var(--nav-footer-pad);
          }

          .nav-status {
            justify-content: var(--nav-status-justify);
          }

          .status-text,
          .nav-version {
            display: var(--nav-text-display);
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
