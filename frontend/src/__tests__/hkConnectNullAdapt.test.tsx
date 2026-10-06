// @vitest-environment jsdom
/**
 * P0-HKFE：港股通页面对后端「诚实 null」的适配回归测试
 *
 * 后端 commit ddce727c5 起不再用 0 冒充拿不到的数据：
 *   - 北向净买额 `dayNetIn` → null，`netFlowDisclosed: false`
 *   - 额度余额 `remain` → 南北向均 null
 *   - 南向净买额为真实值（实测 68.64 亿，修复前误显示 840 亿）
 *
 * 核心断言：**null 是「不可用」，绝不能被渲染成 0、0.00 或 NaN/Infinity。**
 * JS 陷阱（本页曾全部踩中）：
 *   null * 2 === 0 · null / 1040 === 0 · null > 0 === false
 *   (1 - null/threshold) * 100 === 100（假「额度用满」）
 *   threshold 也null 时→ NaN
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import HKConnectPage, { resolveNetFlow, resolveQuotaUsage } from '../pages/HKConnectPage';
import type { ConnectLeg } from '../pages/HKConnectPage';

// ── 后端实测夹具（与 ddce727c5 的真实响应同形）─────────────────

/** 北向：净买/买入/卖出/余额全null，仅成交额与额度可得 */
const NORTH_LEG: ConnectLeg = {
  dayNetIn: null,
  buyIn: null,
  sellOut: null,
  dealAmount: 2079.42,
  remain: null,
  threshold: 1040,
  netFlowDisclosed: false,
  upstreamStatus: 4,
  date: '2026-07-29',
};

/** 南向：净买额真实可得（68.64），余额仍不可得 */
const SOUTH_LEG: ConnectLeg = {
  dayNetIn: 68.64,
  buyIn: 383.95,
  sellOut: 315.32,
  dealAmount: 699.27,
  remain: null,
  threshold: 840,
  netFlowDisclosed: true,
  upstreamStatus: 4,
  date: '2026-07-29',
};

const LEG_BASE = { date: '2026-07-29', upstreamStatus: 4 };

const SUMMARY_PAYLOAD = {
  data: {
    data: { date: '2026-07-29', northbound: NORTH_LEG, southbound: SOUTH_LEG },
    dataSource: 'real',
    message:
      '沪深港通「买入额 / 卖出额 / 净买额 / 额度余额」中：北向（沪股通+深股通）的买入卖出拆分口径已被停止披露，故其净买额/买入额/卖出额一律为 null，绝不用 0 冒充、绝不以成交额倒算；南向（港股通沪+港股通深）该口径仍在披露，为真实值。额度余额对南北向均不可得，一律为 null。',
    netFlowDisclosure: {
      northboundDisclosed: false,
      southboundDisclosed: true,
      note: '上游 status=4 并非披露标记，故本实现不依赖 status 判定。',
    },
    quotaDisclosure: { remainAvailable: false, note: '额度余额四腿恒为 0，判定为不可得，故 remain 一律为 null。' },
    legMapping: {
      northbound: 'upstream hk2sh(沪股通) + hk2sz(深股通)，每日额度各 520 亿',
      southbound: 'upstream sh2hk(港股通沪) + sz2hk(港股通深)，每日额度各 420 亿',
      note: 'upstream 键名与直觉相反，勿按字面互换。',
    },
  },
};

const mockFetch = (payload: unknown) => {
  const fn = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/ah-premium')) {
      return Promise.resolve({ json: () => Promise.resolve({ data: { data: [], dataSource: 'real' } }) } as Response);
    }
    return Promise.resolve({ json: () => Promise.resolve(payload) } as Response);
  });
  vi.stubGlobal('fetch', fn);
  return fn;
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ── 纯函数层：直接证明 null 不会变成 0 / 100 / NaN ──────────────

describe('resolveNetFlow —— null 净买额绝不当0', () => {
  it('netFlowDisclosed=false → 判为「已停止披露」，不返回 0', () => {
    const m = resolveNetFlow(NORTH_LEG);
    expect(m.kind).toBe('undisclosed');
    expect(m).not.toHaveProperty('value');
    // 关键：绝不能是 value: 0
    expect(JSON.stringify(m)).not.toContain('"value"');
  });

  it('南向真实值原样透传（68.64 亿）', () => {
    expect(resolveNetFlow(SOUTH_LEG)).toEqual({ kind: 'value', value: 68.64 });
  });

  it('已披露但值为 null → 判为「本次未取得」，不返回 0', () => {
    const m = resolveNetFlow({ ...LEG_BASE, dayNetIn: null, remain: null, threshold: 840, netFlowDisclosed: true });
    expect(m.kind).toBe('unavailable');
    expect(m).not.toHaveProperty('value');
  });

  it('NaN / Infinity 输入一律不作为真实值透出', () => {
    for (const bad of [NaN, Infinity, -Infinity]) {
      const m = resolveNetFlow({ ...LEG_BASE, dayNetIn: bad, remain: null, threshold: 840, netFlowDisclosed: true });
      expect(m.kind).not.toBe('value');
    }
  });

  it('leg 整体缺失 → unavailable', () => {
    expect(resolveNetFlow(null).kind).toBe('unavailable');
    expect(resolveNetFlow(undefined).kind).toBe('unavailable');
  });

  it('真实 0 是合法值，仍应透传为 value: 0', () => {
    // 与 null 的区别：0 是上游真的说「零」，不能被一起吃掉
    expect(resolveNetFlow({ ...SOUTH_LEG, dayNetIn: 0 })).toEqual({ kind: 'value', value: 0 });
  });
});

describe('resolveQuotaUsage —— null 余额绝不产生 0% 或 100%', () => {
  it('remain=null → 不返回 meter，且绝不返回 0%', () => {
    const m = resolveQuotaUsage(NORTH_LEG);
    expect(m.kind).toBe('no-balance');
    expect(m).not.toHaveProperty('percent');
  });

  it('历史 bug 复现：(1 - null/1040)*100 === 100，本函数必须拒绝该路径', () => {
    const naive = ((1040 - (null as unknown as number)) / 1040) * 100;
    expect(naive).toBe(100); // 假「额度用满」，这正是要避免的
    const m = resolveQuotaUsage(NORTH_LEG);
    expect(m.kind).toBe('no-balance');
  });

  it('南向 remain 也null 时同样不给百分比，但仍保留真实总额度', () => {
    const m = resolveQuotaUsage(SOUTH_LEG);
    expect(m.kind).toBe('no-balance');
    expect(m.kind === 'no-balance' && m.threshold).toBe(840);
  });

  it('余额与总额都可得时才计算，且夹逼到 0..100', () => {
    expect(resolveQuotaUsage({ ...SOUTH_LEG, remain: 840 })).toEqual({ kind: 'meter', percent: 0 });
    expect(resolveQuotaUsage({ ...SOUTH_LEG, remain: 0 })).toEqual({ kind: 'meter', percent: 100 });
    const mid = resolveQuotaUsage({ ...SOUTH_LEG, remain: 420 });
    expect(mid.kind === 'meter' && Math.round(mid.percent)).toBe(50);
  });

  it('threshold 缺失或非正 → no-balance，不产生 NaN/Infinity', () => {
    expect(resolveQuotaUsage({ ...SOUTH_LEG, remain: 100, threshold: null }).kind).toBe('no-balance');
    expect(resolveQuotaUsage({ ...SOUTH_LEG, remain: 100, threshold: 0 }).kind).toBe('no-balance');
    expect(resolveQuotaUsage({ ...SOUTH_LEG, remain: 100, threshold: NaN }).kind).toBe('no-balance');
  });

  it('remain 为 NaN/Infinity → no-balance（绝不 percent: NaN）', () => {
    for (const bad of [NaN, Infinity]) {
      const m = resolveQuotaUsage({ ...SOUTH_LEG, remain: bad as unknown as number });
      expect(m.kind).toBe('no-balance');
    }
  });

  it('leg 缺失 → no-balance', () => {
    expect(resolveQuotaUsage(null).kind).toBe('no-balance');
  });
});

// ── 渲染层：真实响应进DOM，检查文本 ────────────────────────────

describe('HKConnectPage 渲染（后端诚实 null 响应）', () => {
  beforeEach(() => {
    mockFetch(SUMMARY_PAYLOAD);
  });

  it('北向净买额渲染可解释文案，绝不是 0.00 亿', async () => {
    render(<HKConnectPage />);
    await waitFor(() => {
      expect(screen.getAllByText('今日北向净买(亿)').length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText(/上游已停止披露该口径/).length).toBeGreaterThan(0);

    const html = document.body.innerHTML;
    expect(html).not.toMatch(/0\.00\s*亿/);
    expect(html).not.toMatch(/NaN/);
    expect(html).not.toMatch(/Infinity/);
  });

  it('额度使用率显示「数据不可得」而非 0%', async () => {
    render(<HKConnectPage />);
    await waitFor(() => {
      expect(screen.getAllByText('额度使用率：数据不可得').length).toBe(2);
    });
    expect(screen.queryByText(/额度使用 0\.0%/)).toBeNull();
    expect(document.body.innerHTML).not.toMatch(/额度使用\s*(NaN|100\.0%|0\.0%)/);
  });

  it('南向净买额显示真实值 68.64 亿（口径修复生效的正向验证）', async () => {
    render(<HKConnectPage />);
    // antd Statistic 会把数值与precision 后缀拆成多个节点，故用 textContent 断言
    await waitFor(() => {
      expect(document.body.textContent).toContain('68.64');
    });
    // 修复前会误显示 840.00（额度占位值），现在不应出现
    expect(document.body.innerHTML).not.toMatch(/840\.00/);
    // 概览卡 + 明细卡两处都应显示真实值（按出现次数 ≥2 验证；不能用 getAllByText，
    // antd Statistic 会把数值与小数位拆成多个节点）
    const occurrences = (document.body.textContent ?? '').split('68.64').length - 1;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });

  it('呈现后端直出的口径说明与方向映射，不让它们只躺在响应里', async () => {
    render(<HKConnectPage />);
    await waitFor(() => {
      expect(screen.getByText(/口径说明（后端直出）/)).toBeTruthy();
    });
    expect(screen.getByText(/方向映射：北向 = upstream hk2sh/)).toBeTruthy();
    expect(screen.getByText(/披露状态：北向净买额已停止披露，南向净买额仍在披露/)).toBeTruthy();
    expect(screen.getByText(/额度余额不可得/)).toBeTruthy();
  });

  it('全页面无 NaN / Infinity / undefined 渲染，且不读取 VITE_API_BASE', async () => {
    render(<HKConnectPage />);
    await waitFor(() => {
      expect(screen.getAllByText('今日南向净买(亿)').length).toBeGreaterThan(0);
    });
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/NaN/);
    expect(text).not.toMatch(/Infinity/);
    expect(text).not.toMatch(/undefined/);
    // 后端地址必须走单一真源 API_ORIGIN（dev 下为空串→ 相对 /api/...）
    const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.map(String);
    expect(calls.some((u) => u.includes('/api/hk-connect/summary'))).toBe(true);
    expect(calls.every((u) => !u.includes('undefined'))).toBe(true);
  });

  it('A-H 溢价真实源空数组时显示「暂不可得」，不显示 0.00', async () => {
    render(<HKConnectPage />);
    await waitFor(() => {
      expect(screen.getAllByText('A-H 溢价均值(%)').length).toBeGreaterThan(0);
    });
    // ah-premium 夹具返回 data: []（上游 fetch failed），溢价均值无真实值
    expect(screen.getAllByText('暂不可得').length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toMatch(/0\.00/);
  });
});