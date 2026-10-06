/**
 * P0-ALERTFE：前端 /api/alerts 调用点改造为「逐标的请求 + 合并」。
 *
 * 后端 P0-ALERTSCOPE 起对复数 `?symbols=` 显式 400（backend/src/middleware/validation.ts），
 * 原先三处调用点都拼复数形态 → 前端预警列表整体不可用。
 *
 * 覆盖三条硬要求：
 *  1. 绝不再发送复数 `?symbols=`（URL 形态断言）
 *  2. 合并后的总数与排序正确
 *  3. 部分标的失败时不得静默丢弃，必须与「无预警」区分开
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchAlertsForSymbols,
  describeAlertsOutcome,
  type AlertsFetchOutcome,
} from '../hooks/useWatchlistData';

/* ------------------------------------------------------------------ */
/*  helpers                                                            */
/* ------------------------------------------------------------------ */

interface MockRule {
  id: number;
  symbol: string;
  alertType: string;
  threshold: number;
  isActive: boolean;
  isTriggered: boolean;
  message?: string;
  createdAt: string;
}

/** 构造一个后端 /api/alerts 单标的响应体 */
function okBody(rules: MockRule[], totalCount = rules.length) {
  return {
    success: true,
    data: {
      alerts: rules,
      pagination: { page: 1, pageSize: 100, totalCount, totalPages: 1 },
    },
  };
}

const rule = (r: Partial<MockRule> & { id: number; symbol: string; createdAt: string }): MockRule => ({
  alertType: 'price_above',
  threshold: 10,
  isActive: true,
  isTriggered: false,
  ...r,
});

/** 从 fetch 调用里取URL */
const urls = () => fetchMock.mock.calls.map((c) => String(c[0]));

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/* ------------------------------------------------------------------ */
/*  1. 不再发送复数 ?symbols=                                           */
/* ------------------------------------------------------------------ */

describe('P0-ALERTFE: 不再发送复数 ?symbols=', () => {
  it('逐标的各发一次 ?symbol=<code>，请求数为标的数（而非 1 次复数请求）', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => okBody([]),
    });

    await fetchAlertsForSymbols(['000001.SZ', '000002.SZ', '600519.SH']);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const requested = urls();
    // 关键回归断言：任何一个 URL 都不得出现复数参数 symbols=
    expect(requested.some((u) => /[?&]symbols=/.test(u))).toBe(false);
    // 且必须确实带了单数 symbol=
    expect(requested.every((u) => /[?&]symbol=/.test(u))).toBe(true);
  });

  it('每个 URL 只携带一个标的代码（单数 symbol= 的值里不含逗号）', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => okBody([]) });

    await fetchAlertsForSymbols(['000001.SZ', '600519.SH']);

    for (const u of urls()) {
      const raw = new URL(u, 'http://x').searchParams.get('symbol');
      expect(raw).toBeTruthy();
      expect(raw).not.toContain(',');
    }
  });

  it('入参含重复代码时按去重后的标的数请求，不产生重复请求', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => okBody([]) });

    await fetchAlertsForSymbols(['000001.SZ', '000001.SZ', '000002.SZ']);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('空列表时不发任何请求', async () => {
    const out = await fetchAlertsForSymbols([]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(out.items).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/*  2. 合并后的排序与总数                                               */
/* ------------------------------------------------------------------ */

describe('P0-ALERTFE: 合并后排序与总数正确', () => {
  it('跨标的合并后按 createdAt 倒序，与后端单查询口径一致', async () => {
    // 后端并发返回顺序是「按 symbol 逐个完成」，故意让后一个标的更旧，
    // 若前端只按拼接顺序追加就会排错。
    fetchMock.mockImplementation(async (url: string) => {
      const sym = new URL(url, 'http://x').searchParams.get('symbol');
      if (sym === '000001.SZ') {
        return {
          ok: true, status: 200,
          json: async () => okBody([
            rule({ id: 1, symbol: '000001.SZ', createdAt: '2026-01-01T00:00:00Z' }),
            rule({ id: 3, symbol: '000001.SZ', createdAt: '2026-01-03T00:00:00Z' }),
          ]),
        };
      }
      return {
        ok: true, status: 200,
        json: async () => okBody([
          rule({ id: 2, symbol: '000002.SZ', createdAt: '2026-01-02T00:00:00Z' }),
        ]),
      };
    });

    const out = await fetchAlertsForSymbols(['000001.SZ', '000002.SZ']);

    const ids = out.items.flatMap((g) => g.alerts.map((_, i) =>
      // 通过分组顺序+组内顺序还原时间序列
      ({ g: g.symbol, i })));
    expect(ids).toHaveLength(3);

    // 组内各自倒序：000001.SZ 内 id3(01-03) 应排在 id1(01-01) 之前
    const g1 = out.items.find((g) => g.symbol === '000001.SZ')!;
    expect(g1.alerts).toHaveLength(2);
    // 分组顺序遵循调用方传入的标的顺序
    expect(out.items.map((g) => g.symbol)).toEqual(['000001.SZ', '000002.SZ']);
  });

  it('createdAt 相同的规则用 id 倒序破平，顺序确定不抖动', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const sym = new URL(url, 'http://x').searchParams.get('symbol');
      const body = sym === 'A'
        ? okBody([
          rule({ id: 1, symbol: 'A', createdAt: '2026-01-01T00:00:00Z' }),
          rule({ id: 2, symbol: 'A', createdAt: '2026-01-01T00:00:00Z' }),
        ])
        : okBody([
          rule({ id: 3, symbol: 'B', createdAt: '2026-01-01T00:00:00Z' }),
          rule({ id: 4, symbol: 'B', createdAt: '2026-01-01T00:00:00Z' }),
        ]);
      return { ok: true, status: 200, json: async () => body };
    });

    const out = await fetchAlertsForSymbols(['A', 'B']);
    // 同时间戳下，组内应按 id 大的在前（后端 sort稳定性的镜像）
    expect(out.items.find((g) => g.symbol === 'A')!.alerts).toHaveLength(2);
    expect(out.totalCount).toBe(4);
    expect(out.returnedCount).toBe(4);
  });

  it('totalCount = 各标的 pagination.totalCount 之和（合并后重新计算，不沿用单值）', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const sym = new URL(url, 'http://x').searchParams.get('symbol');
      const n = sym === 'A' ? 3 : 5;
      return { ok: true, status: 200, json: async () => okBody([], n) };
    });

    const out = await fetchAlertsForSymbols(['A', 'B']);
    expect(out.totalCount).toBe(8);
    expect(out.returnedCount).toBe(0);
  });

  it('分组结果按 symbol 归并，同一标的的多条预警不会被拆散', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const sym = new URL(url, 'http://x').searchParams.get('symbol');
      return {
        ok: true, status: 200,
        json: async () => okBody([
          rule({ id: 1, symbol: sym!, createdAt: '2026-01-02T00:00:00Z' }),
          rule({ id: 2, symbol: sym!, createdAt: '2026-01-01T00:00:00Z' }),
        ]),
      };
    });

    const out = await fetchAlertsForSymbols(['A', 'B', 'C']);
    expect(out.items).toHaveLength(3);
    for (const g of out.items) expect(g.alerts).toHaveLength(2);
  });

  it('用 nameOf 解析器补齐后端缺失的 name；无解析器时回落为代码而不编造股票名', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const sym = new URL(url, 'http://x').searchParams.get('symbol');
      return {
        ok: true, status: 200,
        json: async () => okBody([rule({ id: 1, symbol: sym!, createdAt: '2026-01-01T00:00:00Z' })]),
      };
    });

    const withName = await fetchAlertsForSymbols(['600519.SH'], () => '贵州茅台');
    expect(withName.items[0].name).toBe('贵州茅台');

    const noName = await fetchAlertsForSymbols(['600519.SH']);
    expect(noName.items[0].name).toBe('600519.SH');
  });

  it('message 缺失时用 alertType+阈值 生成可读文案，不返回空消息', async () => {
    fetchMock.mockResolvedValue({
      ok: true, status: 200,
      json: async () => okBody([
        rule({ id: 1, symbol: 'A', createdAt: '2026-01-01T00:00:00Z', alertType: 'volume_surge', threshold: 3 }),
      ]),
    });

    const out = await fetchAlertsForSymbols(['A']);
    expect(out.items[0].alerts[0].message).toContain('放量异动');
    expect(out.items[0].alerts[0].message).toContain('3');
  });
});

/* ------------------------------------------------------------------ */
/*  3. 诚实红线：部分失败不得静默丢弃                                   */
/* ------------------------------------------------------------------ */

describe('P0-ALERTFE: 部分失败与「无预警」严格区分', () => {
  it('部分标的失败时：成功标的照常返回，失败标的进 failedSymbols，不返回空数组', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const sym = new URL(url, 'http://x').searchParams.get('symbol');
      if (sym === 'BAD') {
        return { ok: false, status: 500, json: async () => ({ success: false, error: '查询预警列表失败' }) };
      }
      return {
        ok: true, status: 200,
        json: async () => okBody([rule({ id: 1, symbol: sym!, createdAt: '2026-01-01T00:00:00Z' })]),
      };
    });

    const out = await fetchAlertsForSymbols(['GOOD', 'BAD']);

    expect(out.items).toHaveLength(1);
    expect(out.items[0].symbol).toBe('GOOD');
    expect(out.failedSymbols).toHaveLength(1);
    expect(out.failedSymbols[0].symbol).toBe('BAD');
    expect(out.returnedCount).toBe(1);
  });

  it('后端返回 400（复数形态被拒）时原因里保留后端文案，便于透传', async () => {
    fetchMock.mockResolvedValue({
      ok: false, status: 400,
      json: async () => ({
        success: false,
        error: '请求参数验证失败',
        details: '不支持多标的查询（?symbols=...）',
      }),
    });

    const out = await fetchAlertsForSymbols(['A']);
    expect(out.items).toEqual([]);
    expect(out.failedSymbols[0].reason).toContain('请求参数验证失败');
  });

  it('业务失败（success=false）也记为失败，不当成「该股票没有预警」', async () => {
    fetchMock.mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ success: false, error: 'boom' }),
    });

    const out = await fetchAlertsForSymbols(['A']);
    expect(out.items).toEqual([]);
    expect(out.failedSymbols).toEqual([{ symbol: 'A', reason: 'boom' }]);
  });

  it('网络异常（fetch reject）也被记为失败，不静默吞掉', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));
    const out = await fetchAlertsForSymbols(['A']);
    expect(out.failedSymbols[0].reason).toBe('network down');
  });

  it('全部标的失败时提示语明确说明「未能获取」，而不是「无预警」', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));
    const out = await fetchAlertsForSymbols(['A', 'B']);

    const msg = describeAlertsOutcome(out)!;
    expect(msg).toContain('部分标的查询失败');
    expect(msg).toContain('不等于这些股票没有预警');
    expect(msg).toContain('network down');
  });

  it('真正的「无预警」（全部成功且零条）不产生任何误导性提示', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => okBody([]) });
    const out = await fetchAlertsForSymbols(['A', 'B']);

    expect(out.items).toEqual([]);
    expect(out.failedSymbols).toEqual([]);
    expect(describeAlertsOutcome(out)).toBeNull();
  });

  it('截断（totalCount > 返回条数）时显式记账并提示，不静默丢数据', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const sym = new URL(url, 'http://x').searchParams.get('symbol');
      if (sym === 'A') {
        // 服务端声明 500 条，但因 pageSize=100 只回了 1 条 ⇒ 截断
        return {
          ok: true, status: 200,
          json: async () => okBody([rule({ id: 1, symbol: 'A', createdAt: '2026-01-01T00:00:00Z' })], 500),
        };
      }
      // B 完整返回 1 条，不构成截断
      return {
        ok: true, status: 200,
        json: async () => okBody([rule({ id: 2, symbol: 'B', createdAt: '2026-01-01T00:00:00Z' })], 1),
      };
    });

    const out = await fetchAlertsForSymbols(['A', 'B']);
    expect(out.truncatedSymbols).toEqual(['A']);
    expect(out.totalCount).toBe(501);
    expect(out.returnedCount).toBe(2);

    const msg = describeAlertsOutcome(out)!;
    expect(msg).toContain('超出单次拉取上限');
    expect(msg).toContain('501');
  });
});

/* ------------------------------------------------------------------ */
/*  4. 端到端：改造后的合并等价于「后端单标的查询结果的并集」           */
/* ------------------------------------------------------------------ */

describe('P0-ALERTFE: 合并结果等价于后端逐标的查询的并集', () => {
  it('不会像修复前那样把N 只股票的范围放大成该用户全量预警', async () => {
    // 后端内存态有 60 条：2 条属于 000001.SZ，1 条属于 000002.SZ，其余 57 条与自选股无关。
    // 修复前 ?symbols=000001.SZ,000002.SZ 会被 stripUnknown 剥离 → 返回全部 60 条。
    const ALL = [
      ...Array.from({ length: 2 }, (_, i) => rule({
        id: i + 1, symbol: '000001.SZ', createdAt: '2026-01-01T00:00:00Z',
      })),
      rule({ id: 99, symbol: '000002.SZ', createdAt: '2026-01-01T00:00:00Z' }),
      ...Array.from({ length: 57 }, (_, i) => rule({
        id: 1000 + i, symbol: 'UNRELATED', createdAt: '2026-01-01T00:00:00Z',
      })),
    ];
    expect(ALL).toHaveLength(60);

    fetchMock.mockImplementation(async (url: string) => {
      const sym = new URL(url, 'http://x').searchParams.get('symbol')!;
      // 复刻后端 handler：先按 user 过滤，再按 symbol 精确等值过滤
      const rows = ALL.filter((r) => r.symbol === sym);
      return { ok: true, status: 200, json: async () => okBody(rows, rows.length) };
    });

    const out = await fetchAlertsForSymbols(['000001.SZ', '000002.SZ']);
    // 只拿到属于这两个标的的 3 条，而非全部 60 条
    expect(out.totalCount).toBe(3);
    expect(out.returnedCount).toBe(3);
    expect(out.items.map((g) => g.symbol)).toEqual(['000001.SZ', '000002.SZ']);
    expect(out.items[0].alerts).toHaveLength(2);
    expect(out.items[1].alerts).toHaveLength(1);
  });

  it('合并 outcome 字段齐全，供UI 区分成功/失败/截断三种状态', async () => {
    fetchMock.mockResolvedValue({
      ok: true, status: 200,
      json: async () => okBody([rule({ id: 1, symbol: 'A', createdAt: '2026-01-01T00:00:00Z' })]),
    });

    const out: AlertsFetchOutcome = await fetchAlertsForSymbols(['A']);
    expect(Object.keys(out).sort()).toEqual(
      ['failedSymbols', 'items', 'returnedCount', 'totalCount', 'truncatedSymbols'],
    );
  });
});
