import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { PAGE_INDEX, searchPages } from '../../config/pageIndex';
import { NAV_GROUPS } from '../../config/navGroups';
import { ROUTE_PATHS } from '../../routes/paths';

/**
 * pageIndex 页面搜索索引回归测试
 *
 * 定位：PAGE_INDEX 由 navGroups 派生（D17 A 方案：navGroups 为导航唯一真源）；
 * 驱动全局搜索（⌘K）的「页面」类结果，path 写错即产生搜索死链。
 * 本测试从配置层做静态防护，并对「navGroups ↔ pageIndex 双向一致」做强断言。
 *
 * 断言原则：不对条目总数做全量硬断言（集合会随新页面增长），
 * 改用「每一项都满足某属性」+ 下限断言；失败信息带上具体 path/label。
 */

const ROUTE_PATH_VALUES = new Set<string>(Object.values(ROUTE_PATHS));

/** 静态解析 routes/index.tsx，得到实际注册的路由路径集合（避免 import 拉起整棵组件树） */
function readRegisteredRoutePaths(): Set<string> {
  // vitest 的 process.cwd() 为项目根（frontend/）
  const source = readFileSync(resolve(process.cwd(), 'src/routes/index.tsx'), 'utf-8');
  const registered = new Set<string>();
  if (/<Route\s+index\b/.test(source)) registered.add('/');
  for (const match of source.matchAll(/<Route\s+path="([^"]+)"/g)) {
    const raw = match[1];
    if (raw === '*') continue;
    registered.add(raw === '/' ? '/' : `/${raw.replace(/^\//, '')}`);
  }
  return registered;
}

const REGISTERED_ROUTES = readRegisteredRoutePaths();

describe('pageIndex 配置', () => {
  describe('条目结构完整性', () => {
    it('索引条目数应达到基本下限（下限断言，允许未来增长）', () => {
      expect(PAGE_INDEX.length).toBeGreaterThanOrEqual(20);
    });

    it('每个条目的 label 都应为非空字符串', () => {
      const offenders = PAGE_INDEX.filter(
        (p) => typeof p.label !== 'string' || p.label.trim().length === 0,
      ).map((p) => p.path);
      expect(offenders, `label 为空的条目 path: ${offenders.join(', ')}`).toEqual([]);
    });

    it('每个条目的 keywords 都应是非空数组，且每个关键词非空', () => {
      const offenders = PAGE_INDEX.filter(
        (p) =>
          !Array.isArray(p.keywords) ||
          p.keywords.length === 0 ||
          p.keywords.some((k) => typeof k !== 'string' || k.trim().length === 0),
      ).map((p) => `${p.label}(${p.path})`);
      expect(offenders, `keywords 非法的条目: ${offenders.join(', ')}`).toEqual([]);
    });

    it('同一条目内的 keywords 不应重复（忽略大小写）', () => {
      const offenders = PAGE_INDEX.filter((p) => {
        const lowered = p.keywords.map((k) => k.toLowerCase());
        return new Set(lowered).size !== lowered.length;
      }).map((p) => `${p.label}(${p.path})`);
      expect(offenders, `keywords 内部重复的条目: ${offenders.join(', ')}`).toEqual([]);
    });
  });

  describe('路径真源一致性', () => {
    it('每个 path 都必须来自 ROUTE_PATHS（禁止硬编码路径字符串）', () => {
      const offenders = PAGE_INDEX.filter((p) => !ROUTE_PATH_VALUES.has(p.path)).map(
        (p) => `${p.label} -> ${p.path}`,
      );
      expect(offenders, `未在 ROUTE_PATHS 中定义的 path: ${offenders.join(' | ')}`).toEqual([]);
    });

    it('每个 path 都必须在 routes/index.tsx 中真实注册（搜索死链防护）', () => {
      const offenders = PAGE_INDEX.filter((p) => !REGISTERED_ROUTES.has(p.path)).map(
        (p) => `${p.label} -> ${p.path}`,
      );
      expect(offenders, `指向未注册路由的死链: ${offenders.join(' | ')}`).toEqual([]);
    });

    it('path 应全局唯一（同一页面不应重复入索引）', () => {
      const paths = PAGE_INDEX.map((p) => p.path);
      const duplicated = [...new Set(paths.filter((p, i) => paths.indexOf(p) !== i))];
      expect(duplicated, `重复的 path: ${duplicated.join(', ')}`).toEqual([]);
    });
  });

  describe('searchPages 行为', () => {
    it('空字符串应返回空数组', () => {
      expect(searchPages('')).toEqual([]);
    });

    it('纯空格应返回空数组', () => {
      expect(searchPages('   ')).toEqual([]);
    });

    it('应能按 label 命中（龙虎榜）', () => {
      const results = searchPages('龙虎榜');
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.map((r) => r.path)).toContain(ROUTE_PATHS.TOP_TRADERS);
    });

    it('应能按 keyword 命中（etf）', () => {
      const results = searchPages('etf');
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.map((r) => r.path)).toContain(ROUTE_PATHS.ETF);
    });

    it('查询应大小写不敏感（ETF 与 etf 结果一致）', () => {
      expect(searchPages('ETF')).toEqual(searchPages('etf'));
      expect(searchPages('Macro')).toEqual(searchPages('macro'));
    });

    it('查询应先 trim（前后空格不影响结果）', () => {
      expect(searchPages('  etf  ')).toEqual(searchPages('etf'));
    });

    it('默认应最多返回 3 条（limit 默认值截断）', () => {
      // '股' 可命中「条件选股 / 自选股 / 股票列表 / 个股对比 / 港股通」等多条
      const all = searchPages('股', PAGE_INDEX.length);
      expect(all.length, '用于验证截断的查询词命中数必须 > 3').toBeGreaterThan(3);

      const defaulted = searchPages('股');
      expect(defaulted).toHaveLength(3);
      expect(defaulted).toEqual(all.slice(0, 3));
    });

    it('自定义 limit 应生效', () => {
      expect(searchPages('股', 1)).toHaveLength(1);
      expect(searchPages('股', 2)).toHaveLength(2);
      expect(searchPages('股', 5).length).toBeLessThanOrEqual(5);
    });

    it('limit 大于命中数时应返回全部命中项而非补齐', () => {
      const results = searchPages('龙虎榜', 99);
      expect(results.length).toBeLessThanOrEqual(PAGE_INDEX.length);
      expect(results.every((r) => r.label.includes('龙虎榜') || r.keywords.includes('龙虎榜'))).toBe(
        true,
      );
    });

    it('无命中应返回空数组', () => {
      expect(searchPages('zzz-不存在的页面-xyz')).toEqual([]);
    });

    it('返回的每一条都应真实命中查询词（label 或 keyword 包含）', () => {
      const query = '资金';
      const offenders = searchPages(query, PAGE_INDEX.length)
        .filter(
          (r) =>
            !r.label.toLowerCase().includes(query) &&
            !r.keywords.some((k) => k.toLowerCase().includes(query)),
        )
        .map((r) => `${r.label}(${r.path})`);
      expect(offenders, `未真实命中却被返回的条目: ${offenders.join(', ')}`).toEqual([]);
    });
  });

  describe('与 NAV_GROUPS 交叉一致性（D17 A 方案：navGroups 为唯一真源）', () => {
    /**
     * pageIndex 由 navGroups 派生后，二者必须**双向一致、零缺口**：
     *  - 每个 nav 项都进入搜索索引（无遗漏）；
     *  - 每个搜索条目的 label 必须等于对应 nav 项的 label（无同名异义）；
     *  - 搜索索引不得出现 navGroups 之外的路径（如重定向死链 /market、/review）。
     * 新增页面只需改 navGroups，本用例即守卫「搜索自动同步」。
     */
    it('每个 nav 项都必须进入搜索索引（无遗漏）', () => {
      const indexedPaths = new Set(PAGE_INDEX.map((p) => p.path));
      const missing = NAV_GROUPS.flatMap((g) => g.items)
        .filter((item) => !indexedPaths.has(item.path))
        .map((item) => `${item.id} -> ${item.path}`);
      expect(missing, `侧栏项未进入搜索索引: ${missing.join(' | ')}`).toEqual([]);
    });

    it('每条搜索条目的 label 必须与对应 nav 项完全一致（无同名异义）', () => {
      const navLabelByPath = new Map<string, string>(
        NAV_GROUPS.flatMap((g) => g.items).map((item) => [item.path, item.label]),
      );
      const mismatched = PAGE_INDEX.filter((p) => navLabelByPath.get(p.path) !== p.label).map(
        (p) => `${p.path}: index="${p.label}" nav="${navLabelByPath.get(p.path)}"`,
      );
      expect(mismatched, `搜索 label 与侧栏不一致: ${mismatched.join(' | ')}`).toEqual([]);
    });

    it('搜索索引不得包含 navGroups 之外的路径（拦截重定向死链 /market、/review）', () => {
      const navPaths = new Set(NAV_GROUPS.flatMap((g) => g.items).map((item) => item.path));
      const extra = PAGE_INDEX.filter((p) => !navPaths.has(p.path)).map(
        (p) => `${p.label} -> ${p.path}`,
      );
      expect(extra, `搜索索引含 navGroups 之外的路径: ${extra.join(' | ')}`).toEqual([]);
    });
  });
});
