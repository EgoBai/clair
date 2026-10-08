import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { NAV_GROUPS } from '../../config/navGroups';
import { ROUTE_PATHS } from '../../routes/paths';
import { PAGE_INDEX, searchPages } from '../../config/pageIndex';

/**
 * P0-ACTIVATE 激活接线回归测试
 *
 * 定位：守卫「大宗交易」这一页从「后端已就绪但前端零入口」变成真正可达的页���，
 * 且接入过程没有引入新的死链/ 命名分歧。
 *
 * 覆盖三处接线（缺任一处页面即不可达）：
 *   routes/paths.ts   → BLOCK_TRADES 常量
 *   routes/index.tsx  → <Route path="block-trades">
 *   config/navGroups.ts → 导航项（侧栏入口）
 *
 * 同时验证 pageIndex **无需手工同步**（它派生自 navGroups，D17 A 方案）——
 * 这是此前「13 处同名异义 pageIndex」技术债的正解，本测试锁死该不变式。
 */

const routesSource = readFileSync(resolve(process.cwd(), 'src/routes/index.tsx'), 'utf-8');
const pathsSource = readFileSync(resolve(process.cwd(), 'src/routes/paths.ts'), 'utf-8');
const navGroupsSource = readFileSync(resolve(process.cwd(), 'src/config/navGroups.ts'), 'utf-8');

const ALL_ITEMS = NAV_GROUPS.flatMap((g) => g.items.map((item) => ({ groupId: g.id, ...item })));

describe('P0-ACTIVATE：大宗交易页接线', () => {
  it('paths.ts 应定义 BLOCK_TRADES 常量且值为 /block-trades', () => {
    expect(ROUTE_PATHS.BLOCK_TRADES).toBe('/block-trades');
    expect(pathsSource).toContain('BLOCK_TRADES');
  });

  it('routes/index.tsx 应注册 block-trades 路由', () => {
    expect(routesSource).toContain('block-trades');
    // 必须 lazy 引入页面组件，不能是占位/空壳
    expect(routesSource).toMatch(/import\('\.\.\/pages\/BlockTradesPage'\)/);
  });

  it('navGroups.ts 应在导航树中暴露该入口', () => {
    expect(navGroupsSource).toContain('BLOCK_TRADES');
    const item = ALL_ITEMS.find((i) => i.id === 'block-trades');
    expect(item, 'navGroups 中缺少 block-trades 导航项').toBeTruthy();
    expect(item!.label).toBe('大宗交易');
    expect(item!.path).toBe(ROUTE_PATHS.BLOCK_TRADES);
  });

  it('导航项应挂在资金面语义相邻的分组（宏观资金），而非随手乱放', () => {
    const item = ALL_ITEMS.find((i) => i.id === 'block-trades');
    // 大宗交易 = 场外协议转让的成交/折溢价，与「资金流向/北向资金」同组
    expect(item!.groupId).toBe('macro-capital');
    const group = NAV_GROUPS.find((g) => g.id === 'macro-capital')!;
    expect(group.items.map((i) => i.id)).toContain('fund-flow');
  });

  it('页面路径应全局唯一（不得与其他导航项撞path）', () => {
    const paths = ALL_ITEMS.map((i) => i.path);
    const dup = [...new Set(paths.filter((p, i) => paths.indexOf(p) !== i))];
    expect(dup, `重复 path: ${dup.join(', ')}`).toEqual([]);
  });
});

describe('pageIndex 派生不变式（D17 A 方案）', () => {
  it('PAGE_INDEX 应自动包含大宗交易，无需手工同步', () => {
    const entry = PAGE_INDEX.find((p) => p.path === ROUTE_PATHS.BLOCK_TRADES);
    expect(entry, 'pageIndex 未自动派生出大宗交易条目').toBeTruthy();
    // label 必须与 navGroups 完全一致 —— 这正是消灭「同名异义」的机制
    expect(entry!.label).toBe('大宗交易');
  });

  it('PAGE_INDEX 应与 navGroups 条目数严格一致（派生而非手工维护）', () => {
    expect(PAGE_INDEX).toHaveLength(ALL_ITEMS.length);
  });

  it('全局搜索应能通过「大宗交易」与 block-trades 命中该页', () => {
    expect(searchPages('大宗交易').some((p) => p.path === ROUTE_PATHS.BLOCK_TRADES)).toBe(true);
    expect(searchPages('block-trades').some((p) => p.path === ROUTE_PATHS.BLOCK_TRADES)).toBe(true);
  });
});

describe('归档页失效契约不得回流', () => {
  it('现役页面的 import 不得指向 _archived 目录', () => {
    const pageSource = readFileSync(resolve(process.cwd(), 'src/pages/BlockTradesPage.tsx'), 'utf-8');
    // 只校验真实 import 语句（文档注释里提到 _archived 是迁移说明，合法）
    const imports = [...pageSource.matchAll(/^import\s.+from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]);
    const archived = imports.filter((p) => p.includes('_archived'));
    expect(archived, `不应从 _archived 导入: ${archived.join(', ')}`).toEqual([]);
  });

  it('logger 必须用 pages/ 一层的相对路径（归档版在 _archived/ 下用同路径会解析到不存在的 pages/utils/logger）', () => {
    const pageSource = readFileSync(resolve(process.cwd(), 'src/pages/BlockTradesPage.tsx'), 'utf-8');
    expect(pageSource).toContain("from '../utils/logger'");
    // 绝不能是 pages/utils/logger（那需要多一层 ../）
    expect(pageSource).not.toContain("from './utils/logger'");
  });

  it('路由注册不得指向 _archived 目录', () => {
    expect(routesSource).not.toContain('_archived/pages');
    expect(routesSource).not.toMatch(/pages\/_archived/);
  });
});