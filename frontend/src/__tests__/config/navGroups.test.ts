import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { NAV_GROUPS } from '../../config/navGroups';
import { ROUTE_PATHS } from '../../routes/paths';

/**
 * navGroups 导航分组配置回归测试
 *
 * 定位：navGroups 是桌面侧栏 + 移动 TabBar 的「导航单一数据源」，
 * 路径写错即产生死链。本测试从配置层做静态防护，与 `npm run guard`
 * 的 UI 死链扫描互补。
 *
 * 断言原则：
 * - 不对「未来可能增长的集合」做全量计数硬断言（如 items 总数 === 24）；
 *   改用「每一项都满足某属性」或下限断言。
 * - 唯一例外是分组数 === 6：这是 D15 导航 IA 方案（design/navigation-ia-proposal.md §2.1）
 *   明确定义的产品契约（6 组投研工作流），属于有意锁定，改动需同步改产品方案。
 * - 失败信息必须能定位到具体 item（统一收集 offenders 后断言为空数组）。
 */

const ALL_ITEMS = NAV_GROUPS.flatMap((g) => g.items.map((item) => ({ groupId: g.id, ...item })));
const ROUTE_PATH_VALUES = new Set<string>(Object.values(ROUTE_PATHS));

/**
 * 静态解析 routes/index.tsx，得到「实际注册的路由路径」集合。
 * 用文本解析而非 import，是为了避免把 AppLayout / 所有页面组件拉进测试进程。
 */
function readRegisteredRoutePaths(): Set<string> {
  // vitest 的 process.cwd() 为项目根（frontend/）
  const source = readFileSync(resolve(process.cwd(), 'src/routes/index.tsx'), 'utf-8');
  const registered = new Set<string>();

  // <Route index element=... /> 对应父级 "/"
  if (/<Route\s+index\b/.test(source)) registered.add('/');

  for (const match of source.matchAll(/<Route\s+path="([^"]+)"/g)) {
    const raw = match[1];
    if (raw === '*') continue; // 404 通配不算已注册路径
    registered.add(raw === '/' ? '/' : `/${raw.replace(/^\//, '')}`);
  }
  return registered;
}

const REGISTERED_ROUTES = readRegisteredRoutePaths();

describe('navGroups 配置', () => {
  describe('路由表解析自检', () => {
    it('应能从 routes/index.tsx 解析出足量的已注册路由（防止正则失效导致后续断言空跑）', () => {
      expect(REGISTERED_ROUTES.size).toBeGreaterThan(20);
      expect(REGISTERED_ROUTES.has('/')).toBe(true);
    });
  });

  describe('分组结构完整性', () => {
    // 产品契约：D15 导航 IA 固定 6 组投研工作流，非「可自由增长的集合」，故此处硬断言。
    it('应恰好包含 6 个分组（D15 导航 IA 产品契约，有意锁定）', () => {
      expect(NAV_GROUPS.map((g) => g.id)).toHaveLength(6);
    });

    it('分组 id 应全局唯一', () => {
      const ids = NAV_GROUPS.map((g) => g.id);
      const duplicated = ids.filter((id, i) => ids.indexOf(id) !== i);
      expect(duplicated, `重复的分组 id: ${duplicated.join(', ')}`).toEqual([]);
    });

    it.each(NAV_GROUPS.map((g) => [g.id, g] as const))(
      '分组 %s 应有非空 label 且至少包含 1 个子项',
      (_id, group) => {
        expect(typeof group.label).toBe('string');
        expect(group.label.trim().length).toBeGreaterThan(0);
        expect(Array.isArray(group.items)).toBe(true);
        expect(group.items.length).toBeGreaterThanOrEqual(1);
      },
    );

    it('导航项总量应达到基本下限（下限断言，允许未来增长）', () => {
      expect(ALL_ITEMS.length).toBeGreaterThanOrEqual(20);
    });
  });

  describe('子项完整性', () => {
    it('item id 应全局唯一（跨分组）', () => {
      const ids = ALL_ITEMS.map((i) => i.id);
      const duplicated = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
      expect(duplicated, `重复的 item id: ${duplicated.join(', ')}`).toEqual([]);
    });

    it('每个 item 的 label 都应为非空字符串', () => {
      const offenders = ALL_ITEMS.filter(
        (i) => typeof i.label !== 'string' || i.label.trim().length === 0,
      ).map((i) => `${i.groupId}/${i.id}`);
      expect(offenders, `label 为空的 item: ${offenders.join(', ')}`).toEqual([]);
    });

    it('每个 item 的 icon 都应是可渲染的组件引用（函数组件或 forwardRef 对象）', () => {
      // antd 图标经 forwardRef 包装后 typeof 为 'object'，因此不能写死成 'function'
      const offenders = ALL_ITEMS.filter((i) => {
        const t = typeof i.icon;
        return !(t === 'function' || (t === 'object' && i.icon !== null));
      }).map((i) => `${i.groupId}/${i.id} (typeof=${typeof i.icon})`);
      expect(offenders, `icon 非法的 item: ${offenders.join(', ')}`).toEqual([]);
    });
  });

  describe('路径真源一致性', () => {
    it('每个 item.path 都必须来自 ROUTE_PATHS（禁止硬编码路径字符串）', () => {
      const offenders = ALL_ITEMS.filter((i) => !ROUTE_PATH_VALUES.has(i.path)).map(
        (i) => `${i.groupId}/${i.id} -> ${i.path}`,
      );
      expect(offenders, `未在 ROUTE_PATHS 中定义的 path: ${offenders.join(' | ')}`).toEqual([]);
    });

    it('每个 item.path 都必须在 routes/index.tsx 中真实注册（死链防护）', () => {
      const offenders = ALL_ITEMS.filter((i) => !REGISTERED_ROUTES.has(i.path)).map(
        (i) => `${i.groupId}/${i.id} -> ${i.path}`,
      );
      expect(offenders, `指向未注册路由的死链: ${offenders.join(' | ')}`).toEqual([]);
    });

    it('item.path 应全局唯一（同一路径不应出现在两个导航项）', () => {
      const paths = ALL_ITEMS.map((i) => i.path);
      const duplicated = [...new Set(paths.filter((p, i) => paths.indexOf(p) !== i))];
      expect(duplicated, `重复的 path: ${duplicated.join(', ')}`).toEqual([]);
    });

    it('静态导航树不应包含参数化路由（含 ":" 的详情级路由）', () => {
      const offenders = ALL_ITEMS.filter((i) => i.path.includes(':')).map(
        (i) => `${i.groupId}/${i.id} -> ${i.path}`,
      );
      expect(offenders, `参数化路由不应进入导航树: ${offenders.join(' | ')}`).toEqual([]);
    });

    it('每个 item.path 都应以 "/" 开头（绝对路径）', () => {
      const offenders = ALL_ITEMS.filter((i) => !i.path.startsWith('/')).map(
        (i) => `${i.groupId}/${i.id} -> ${i.path}`,
      );
      expect(offenders, `非绝对路径: ${offenders.join(' | ')}`).toEqual([]);
    });
  });
});
