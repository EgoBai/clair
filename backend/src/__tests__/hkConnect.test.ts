import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

import hkConnectRouter from '../api/hkConnect';

/**
 * 港股通 / A-H 溢价 API 测试（真实源诚实契约）
 *
 * 本测试直接挂载 hkConnect router（不 import app.ts），mock `global.fetch`。
 *
 * ★ 被测红线（P0-HK）：上游 push2.eastmoney.com/api/qt/kamt/get 已停止披露北向
 *   买入/卖出拆分口径（hk2sh/hk2sz 两腿 buyAmt/sellAmt/netBuyAmt 恒为 0，而成交额非 0）。
 *   原实现用 `?? 0` 把「拿不到」填成 0，并用 dataSource:'real' 包装，属诚实红线违规。
 *   断言重点因此是「不可得字段必须是 null，且绝不是 0」，而非仅断字段存在。
 *
 * ★ KAMT_RESPONSE 为 2026-10-07 本机实测原样响应（上游键名与直觉相反：
 *   hk2sh/hk2sz = 北向（沪/深股通，每日额度 520 亿）；sh2hk/sz2hk = 南向（港股通，每日额度 420 亿））。
 */

const app = express();
// 与 app.ts 中的挂载点保持一致：router 内部路径为 /summary 与 /ah-premium
app.use('/api/hk-connect', hkConnectRouter);

const ORIGINAL_FETCH = global.fetch;

function jsonResponse(body: unknown) {
  return { ok: true, json: async () => body } as unknown as Response;
}

/** 上游实测原样响应（万元单位） */
const KAMT_RESPONSE = {
  rc: 0,
  rt: 13,
  data: {
    hk2sh: {
      status: 4,
      dayNetAmtIn: 0.0,
      dayAmtRemain: 0.0,
      dayAmtThreshold: 5200000.0,
      date: '09-30',
      date2: '2026-09-30',
      buyAmt: 0.0,
      sellAmt: 0.0,
      buySellAmt: 10125787.46,
      netBuyAmt: 0.0,
    },
    hk2sz: {
      status: 4,
      dayNetAmtIn: 0.0,
      dayAmtRemain: 0.0,
      dayAmtThreshold: 5200000.0,
      date: '09-30',
      date2: '2026-09-30',
      buyAmt: 0.0,
      sellAmt: 0.0,
      buySellAmt: 10668373.69,
      netBuyAmt: 0.0,
    },
    sh2hk: {
      status: 4,
      dayNetAmtIn: 4200000.0, // ⚠️ 额度占位值，非净买额（恒等于其 dayAmtThreshold）
      dayAmtRemain: 0.0,
      dayAmtThreshold: 4200000.0,
      date: '09-30',
      date2: '2026-09-30',
      buyAmt: 2555486.3,
      sellAmt: 2046053.26,
      buySellAmt: 4601539.55,
      netBuyAmt: 509433.04,
    },
    sz2hk: {
      status: 4,
      dayNetAmtIn: 4200000.0, // ⚠️ 同上
      dayAmtRemain: 0.0,
      dayAmtThreshold: 4200000.0,
      date: '09-30',
      date2: '2026-09-30',
      buyAmt: 1284037.86,
      sellAmt: 1107109.81,
      buySellAmt: 2391147.67,
      netBuyAmt: 176928.05,
    },
  },
};

function mockFetch(body: unknown) {
  const spy = vi.fn(async () => jsonResponse(body));
  vi.stubGlobal('fetch', spy);
  return spy;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
  global.fetch = ORIGINAL_FETCH;
});

describe('hkConnect /summary — 诚实契约（P0-HK：不可得字段不得为 0）', () => {
  it('北向（沪股通+深股通）买入/卖出拆分口径已停披露：净买/买入/卖出额必须为 null，绝不为 0', async () => {
    mockFetch(KAMT_RESPONSE);
    const res = await request(app).get('/api/hk-connect/summary');
    const p = res.body.data;
    expect(res.status).toBe(200);

    const north = p.data.northbound;

    // ★ 核心断言：不可得 ≠ 0
    expect(north.dayNetIn).toBeNull();
    expect(north.dayNetIn).not.toBe(0);
    expect(north.buyIn).toBeNull();
    expect(north.buyIn).not.toBe(0);
    expect(north.sellOut).toBeNull();
    expect(north.sellOut).not.toBe(0);

    // 披露状态必须被如实标记
    expect(north.netFlowDisclosed).toBe(false);

    // 成交额是真实可得的（上游 buySellAmt ≠ 0），不得被一并置 null
    expect(north.dealAmount).toBeCloseTo(2079.42, 2);
    expect(north.dealAmount).not.toBeNull();
  });

  it('额度余额 remain 对南北向均不可得：一律 null，绝不为 0', async () => {
    mockFetch(KAMT_RESPONSE);
    const res = await request(app).get('/api/hk-connect/summary');
    const p = res.body.data;

    expect(p.data.northbound.remain).toBeNull();
    expect(p.data.northbound.remain).not.toBe(0);
    expect(p.data.southbound.remain).toBeNull();
    expect(p.data.southbound.remain).not.toBe(0);
  });

  it('南向净买额取自 netBuyAmt 真值（约 68.64 亿），而非额度占位值 dayNetAmtIn（420 亿）', async () => {
    mockFetch(KAMT_RESPONSE);
    const res = await request(app).get('/api/hk-connect/summary');
    const p = res.body.data;
    const south = p.data.southbound;

    // 真实值：netBuyAmt (509433.04 + 176928.05) 万元 ≈ 68.64 亿元
    expect(south.dayNetIn).toBeCloseTo(68.64, 2);
    expect(south.netFlowDisclosed).toBe(true);

    // ★ 若误用 dayNetAmtIn（额度占位）会得到 840 亿 —— 必须明确不等于该错值
    expect(south.dayNetIn).not.toBe(840);
    expect(south.dayNetIn).toBeLessThan(100);

    // 买入/卖出额为真实值
    expect(south.buyIn).toBeCloseTo(383.95, 2);
    expect(south.sellOut).toBeCloseTo(315.32, 2);
  });

  it('每日额度 threshold 为真实常量：北向 1040 亿、南向 840 亿', async () => {
    mockFetch(KAMT_RESPONSE);
    const res = await request(app).get('/api/hk-connect/summary');
    const p = res.body.data;

    expect(p.data.northbound.threshold).toBeCloseTo(1040, 2);
    expect(p.data.southbound.threshold).toBeCloseTo(840, 2);
  });

  it('字段↔口径对应：hk2sh/hk2sz=北向(520亿/腿)，sh2hk/sz2hk=南向(420亿/腿)，不可互换', async () => {
    mockFetch(KAMT_RESPONSE);
    const res = await request(app).get('/api/hk-connect/summary');
    const p = res.body.data;

    // 北向两腿成交额（1012.58 + 1066.84 亿）远大于南向（460.15 + 239.11 亿）
    expect(p.data.northbound.dealAmount).toBeCloseTo(2079.42, 2);
    expect(p.data.southbound.dealAmount).toBeCloseTo(699.27, 2);

    // 响应中显式留档映射关系，防止后续被"按字面直觉"改反
    expect(p.legMapping.northbound).toContain('hk2sh');
    expect(p.legMapping.southbound).toContain('sh2hk');
  });

  it('status=4 不作为披露判据：响应保留原值但不据此判断可得性', async () => {
    mockFetch(KAMT_RESPONSE);
    const res = await request(app).get('/api/hk-connect/summary');
    const p = res.body.data;

    // 四腿 status 均为 4，但南向仍有真实值 → status 不是停披露标记
    expect(p.data.southbound.upstreamStatus).toBe(4);
    expect(p.data.southbound.netFlowDisclosed).toBe(true);
    expect(p.data.northbound.upstreamStatus).toBe(4);
    expect(p.data.northbound.netFlowDisclosed).toBe(false);
    expect(p.netFlowDisclosure.note).toContain('status');
  });

  it('净买额与买卖额不满足恒等式时不予采信（防上游脏值），返回 null 而非错误值', async () => {
    // 篡改南向 netBuyAmt：应与 buy-sell(=38.39亿) 严重不符
    const tampered = JSON.parse(JSON.stringify(KAMT_RESPONSE));
    tampered.data.sh2hk.netBuyAmt = 99999999;
    mockFetch(tampered);
    const res = await request(app).get('/api/hk-connect/summary');
    const p = res.body.data;

    // 不可采信 → null，绝不返回那个脏值
    expect(p.data.southbound.dayNetIn).toBeNull();
    expect(p.data.southbound.dayNetIn).not.toBe(9999.99);
  });

  it('上游不可达时诚实降级为 unavailable，不返回任何 0 冒充数值', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('network down');
    }));
    const res = await request(app).get('/api/hk-connect/summary');
    const p = res.body.data;

    expect(res.status).toBe(200);
    expect(p.dataSource).toBe('unavailable');
    expect(p.data).toBeNull();
  });

  it('上游返回空 data 时同样诚实降级，绝不凭空造 0', async () => {
    mockFetch({ rc: 0, data: null });
    const res = await request(app).get('/api/hk-connect/summary');
    const p = res.body.data;

    expect(p.dataSource).toBe('unavailable');
    expect(p.data).toBeNull();
  });

  it('顶层 dataSource=real 时，响应内不出现任何「用 0 冒充缺失」的资金流字段', async () => {
    mockFetch(KAMT_RESPONSE);
    const res = await request(app).get('/api/hk-connect/summary');
    const p = res.body.data;

    expect(p.dataSource).toBe('real');
    const { northbound: n, southbound: s } = p.data;
    // 资金流语义字段：要么真实值，要么 null；禁止 0
    for (const v of [n.dayNetIn, n.buyIn, n.sellOut, n.remain, s.remain]) {
      expect(v === null || typeof v === 'number').toBe(true);
      expect(v).not.toBe(0);
    }
  });
});

describe('hkConnect /ah-premium — 价格缺失不得用 0 顶替', () => {
  it('A/H 任一侧报价缺失时跳过该行，而不是用 0 参与溢价计算', async () => {
    const fetchSpy = vi.fn(async (url: string) => {
      // A 股正常返回，H 股返回空 diff（模拟 H 股报价拿不到）
      if (url.includes('128.')) return jsonResponse({ data: { diff: [] } });
      return jsonResponse({
        data: {
          diff: [
            { f12: '601398', f14: '工商银行', f2: 700, f3: 1.1, f4: 0.07 },
          ],
        },
      });
    });
    vi.stubGlobal('fetch', fetchSpy as any);

    const res = await request(app).get('/api/hk-connect/ah-premium');
    const p = res.body.data;

    expect(res.status).toBe(200);
    // H 股全缺 → 无任何行可用真实双边价格计算 → 诚实空态
    expect(p.data).toEqual([]);
    expect(p.count).toBe(0);
    expect(p.dataSource).toBe('unavailable');
  });

  it('双边价格齐全时给出真实溢价，且价格不为 0', async () => {
    const fetchSpy = vi.fn(async (url: string) => {
      if (url.includes('128.')) {
        return jsonResponse({ data: { diff: [{ f12: '01398', f14: '工商银行', f2: 7500 }] } });
      }
      return jsonResponse({ data: { diff: [{ f12: '601398', f14: '工商银行', f2: 700 }] } });
    });
    vi.stubGlobal('fetch', fetchSpy as any);

    const res = await request(app).get('/api/hk-connect/ah-premium');
    const p = res.body.data;

    expect(p.dataSource).toBe('real');
    expect(p.count).toBe(1);
    const row = p.data[0];
    expect(row.priceA).toBeCloseTo(7, 2);
    expect(row.priceH).toBeCloseTo(7.5, 2);
    expect(row.priceA).not.toBe(0);
    expect(row.priceH).not.toBe(0);
    // premium = (7 - 7.5*0.92) / (7.5*0.92) * 100
    expect(row.premium).toBeCloseTo(1.4493, 2);
  });

  it('上游报价字段缺失（非数字）时整行跳过，不产生 0 价行', async () => {
    const fetchSpy = vi.fn(async (url: string) => {
      // f2 为 '-'（东财停牌/无价的典型返回）
      if (url.includes('128.')) {
        return jsonResponse({ data: { diff: [{ f12: '01398', f14: '工商银行', f2: '-' }] } });
      }
      return jsonResponse({ data: { diff: [{ f12: '601398', f14: '工商银行', f2: 700 }] } });
    });
    vi.stubGlobal('fetch', fetchSpy as any);

    const res = await request(app).get('/api/hk-connect/ah-premium');
    const p = res.body.data;

    expect(p.data).toEqual([]);
    expect(p.count).toBe(0);
  });
});