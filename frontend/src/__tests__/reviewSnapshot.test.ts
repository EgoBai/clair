/**
 * R0'-6 回头看快照 —— 纯逻辑与持久化定向单测
 *
 * 覆盖（工单验证要求 ③ ⑥）：
 *  a) 超额收益正常算出差额；
 *  b) 基准缺失时必须返回 unavailable / null，**不是** 0 或任何假数；
 *  c) 个股区间数据缺失时的降级行为；
 *  d) 兑现判定（看涨/看跌/未标注/观察）；
 *  e) localStorage 往返；
 *  f) 版本不符 / JSON 损坏时的防御路径（必须不抛异常）。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  SNAPSHOT_STORAGE_KEY,
  SNAPSHOT_SCHEMA_VERSION,
  LOOKBACK_MIN_AGE_DAYS,
  computeIntervalChangePct,
  computeExcessReturn,
  computeOutcome,
  loadSnapshots,
  saveSnapshots,
  createSnapshot,
  removeSnapshot,
  type ReviewSnapshot,
} from '../services/reviewSnapshot';

const DAY_MS = 86_400_000;
const daysAgo = (n: number): string => new Date(Date.now() - n * DAY_MS).toISOString();

function makeSnapshot(overrides: Partial<ReviewSnapshot> = {}): ReviewSnapshot {
  return {
    id: 'snap-test-1',
    symbol: '600519',
    name: '贵州茅台',
    createdAt: daysAgo(5),
    priceAtSnapshot: 100,
    changePctAtSnapshot: 1.5,
    thesis: '订单回暖，判断跑赢大盘',
    benchmark: { name: '上证指数', code: 'sh000001', levelAtSnapshot: 3000 },
    expectedDirection: 'up',
    ...overrides,
  };
}

describe('reviewSnapshot · 纯计算', () => {
  it('区间涨跌幅 =（末−初）/初×100', () => {
    expect(computeIntervalChangePct(100, 110)).toBe(10);
    expect(computeIntervalChangePct(3000, 3060)).toBe(2);
    expect(computeIntervalChangePct(100, 90)).toBe(-10);
  });

  it('超额收益 = 个股 − 基准（正常算出差额）', () => {
    expect(computeExcessReturn(10, 2)).toBe(8);
    expect(computeExcessReturn(-3, 4)).toBe(-7);
    expect(computeExcessReturn(0, 0)).toBe(0);
  });

  it('基准缺失 → 超额收益为 null（不可用），绝不为 0', () => {
    expect(computeExcessReturn(10, null)).toBeNull();
    expect(computeExcessReturn(null, 3)).toBeNull();
    expect(computeExcessReturn(null, null)).toBeNull();
  });
});

describe('reviewSnapshot · computeOutcome', () => {
  it('成熟快照 + 双数据齐全 → 算出个股/基准/超额，方向兑现', () => {
    const snap = makeSnapshot();
    const out = computeOutcome(snap, { price: 110, benchmarkLevel: 3060 });
    expect(out.matured).toBe(true);
    expect(out.stockChangePct).toBe(10);
    expect(out.benchmarkChangePct).toBe(2);
    expect(out.excessReturnPct).toBe(8);
    expect(out.verdict).toBe('fulfilled');
  });

  it('看跌方向 + 超额为负 → 兑现', () => {
    const snap = makeSnapshot({ expectedDirection: 'down' });
    const out = computeOutcome(snap, { price: 92, benchmarkLevel: 3060 });
    expect(out.excessReturnPct).toBe(-10);
    expect(out.verdict).toBe('fulfilled');
  });

  it('基准区间不可用（快照未记录基准）→ 超额为 null 且 verdict=unavailable，不是 0 也不是假兑现', () => {
    const snap = makeSnapshot({ benchmark: null });
    const out = computeOutcome(snap, { price: 110, benchmarkLevel: 3060 });
    expect(out.stockChangePct).toBe(10);
    expect(out.benchmarkChangePct).toBeNull();
    expect(out.excessReturnPct).toBeNull();
    expect(out.verdict).toBe('unavailable');
    expect(out.verdict).not.toBe('fulfilled');
  });

  it('基准当前点位取不到 → 超额不可用（降级，不拿个股涨跌冒充）', () => {
    const snap = makeSnapshot();
    const out = computeOutcome(snap, { price: 110, benchmarkLevel: null });
    expect(out.benchmarkChangePct).toBeNull();
    expect(out.excessReturnPct).toBeNull();
    expect(out.verdict).toBe('unavailable');
  });

  it('个股区间数据缺失（快照价或当前价缺失）→ insufficient 降级', () => {
    const noSnapshotPrice = computeOutcome(
      makeSnapshot({ priceAtSnapshot: null }),
      { price: 110, benchmarkLevel: 3060 }
    );
    expect(noSnapshotPrice.stockChangePct).toBeNull();
    expect(noSnapshotPrice.verdict).toBe('insufficient');

    const noCurrentPrice = computeOutcome(makeSnapshot(), { price: null, benchmarkLevel: 3060 });
    expect(noCurrentPrice.stockChangePct).toBeNull();
    expect(noCurrentPrice.excessReturnPct).toBeNull();
    expect(noCurrentPrice.verdict).toBe('insufficient');
  });

  it('未满最短回看期 → pending，不计算任何区间', () => {
    const fresh = makeSnapshot({ createdAt: new Date().toISOString() });
    const out = computeOutcome(fresh, { price: 110, benchmarkLevel: 3060 });
    expect(out.matured).toBe(false);
    expect(out.verdict).toBe('pending');
    expect(out.stockChangePct).toBeNull();
    expect(LOOKBACK_MIN_AGE_DAYS).toBeGreaterThan(0);
  });

  it('未标注方向 / 观察 → unavailable（自由文本不臆测方向）', () => {
    const none = computeOutcome(makeSnapshot({ expectedDirection: null }), {
      price: 110,
      benchmarkLevel: 3060,
    });
    expect(none.verdict).toBe('unavailable');

    const watch = computeOutcome(makeSnapshot({ expectedDirection: 'watch' }), {
      price: 110,
      benchmarkLevel: 3060,
    });
    expect(watch.verdict).toBe('unavailable');
  });
});

describe('reviewSnapshot · 持久化与防御', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('存 → 读 往返一致', () => {
    const snap = makeSnapshot();
    expect(saveSnapshots([snap])).toBe(true);
    const loaded = loadSnapshots();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]).toEqual(snap);
  });

  it('createSnapshot 落盘，最新在前；removeSnapshot 删除', () => {
    createSnapshot({
      symbol: '000001',
      name: '平安银行',
      priceAtSnapshot: 12,
      changePctAtSnapshot: 0.5,
      thesis: 'A',
      benchmark: { name: '上证指数', code: 'sh000001', levelAtSnapshot: 3000 },
      expectedDirection: 'up',
      createdAt: daysAgo(2),
    });
    createSnapshot({
      symbol: '600519',
      name: '贵州茅台',
      priceAtSnapshot: 100,
      changePctAtSnapshot: null,
      thesis: 'B',
      benchmark: null,
      expectedDirection: null,
      createdAt: daysAgo(1),
    });
    const list = loadSnapshots();
    expect(list.map((s) => s.symbol)).toEqual(['600519', '000001']);

    const afterRemove = removeSnapshot(list[0].id);
    expect(afterRemove).toHaveLength(1);
    expect(loadSnapshots().map((s) => s.symbol)).toEqual(['000001']);
  });

  it('version 不符 → 返回空数组且不抛异常', () => {
    localStorage.setItem(
      SNAPSHOT_STORAGE_KEY,
      JSON.stringify({ version: SNAPSHOT_SCHEMA_VERSION + 99, snapshots: [makeSnapshot()] })
    );
    expect(() => loadSnapshots()).not.toThrow();
    expect(loadSnapshots()).toEqual([]);
  });

  it('JSON 损坏 → 返回空数组且不抛异常', () => {
    localStorage.setItem(SNAPSHOT_STORAGE_KEY, '{ this is : not json ');
    expect(() => loadSnapshots()).not.toThrow();
    expect(loadSnapshots()).toEqual([]);
  });

  it('空存储 / 非对象内容 → 空数组', () => {
    expect(loadSnapshots()).toEqual([]);
    localStorage.setItem(SNAPSHOT_STORAGE_KEY, '"just-a-string"');
    expect(loadSnapshots()).toEqual([]);
  });

  it('字段缺失的历史记录：保留条目但把缺失字段降级为 null（不反推）', () => {
    localStorage.setItem(
      SNAPSHOT_STORAGE_KEY,
      JSON.stringify({
        version: SNAPSHOT_SCHEMA_VERSION,
        snapshots: [
          {
            id: 'legacy-1',
            symbol: '600519',
            name: '贵州茅台',
            createdAt: daysAgo(10),
            // priceAtSnapshot 缺失
            thesis: '旧数据',
          },
        ],
      })
    );
    const loaded = loadSnapshots();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].priceAtSnapshot).toBeNull();
    expect(loaded[0].benchmark).toBeNull();
    expect(loaded[0].expectedDirection).toBeNull();
    // 缺价格 → 回看时判定为 insufficient，而不是用当前价反推
    const out = computeOutcome(loaded[0], { price: 110, benchmarkLevel: 3060 });
    expect(out.verdict).toBe('insufficient');
  });

  it('结构非法的条目被丢弃', () => {
    localStorage.setItem(
      SNAPSHOT_STORAGE_KEY,
      JSON.stringify({
        version: SNAPSHOT_SCHEMA_VERSION,
        snapshots: [null, {}, { id: 'x' }, { id: 'y', symbol: 'z', createdAt: 'not-a-date' }],
      })
    );
    expect(loadSnapshots()).toEqual([]);
  });
});
