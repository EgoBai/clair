/**
 * 腾讯真实源兜底：解析逻辑与三条端点降级契约的单测
 *
 * 覆盖本次三条缺陷修复的**可脱离网络验证**部分：
 *   A) klineDataService 腾讯腿必须走 bfq（不复权）+ 键名 day，错误码要如实上报；
 *   B) ai-analysis 候选池规模解析 + 上游不可达时 universe 必须为 null（不谎报全市场）；
 *   C) hkConnect AH 溢价：汇率/报价不可达时 exchangeRate **必须是 null**，
 *      绝不允许再出现 0.92 这个历史假常量。
 *
 * 所有上游响应均为**固定 fixture**（写在本文件内），不连真网。
 * 真实网络可达性由人工 curl 四证覆盖，不放 CI。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

import {
  parseQuoteLine,
  mapQuoteFields,
  toTencentCode,
  toTencentHkCode,
  fetchTencentQuotes,
  fetchHkdCnyRate,
  TencentQuoteUnavailableError,
} from '../services/tencentQuoteService';
import { getKline, KlineUnavailableError } from '../services/klineDataService';
import hkConnectRouter from '../api/hkConnect';
import aiAnalysisRouter, { resolveUniverseSize, UNIVERSE_DEFAULT_SIZE, UNIVERSE_MAX_SIZE } from '../api/ai-analysis';
import { queryCache } from '../utils/queryCache';

// ==================== fixtures（2026-11-03 真实响应摘录，字段位已标定） ====================

/** A 股行：v_sh601398（工商银行） */
const FIXTURE_A_SHARE =
  'v_sh601398="1~工商银行~601398~8.59~8.69~8.75~6484238~3306968~3177270~8.58~652~8.57~582~8.56~4296~8.55~7307~8.54~3220~8.59~1630~8.60~32749~8.61~5686~8.62~2631~8.63~4077~~20261103161453~-0.10~-1.15~8.77~8.32~8.59/6484238/5497839563~6484238~549784~0.24~7.97~~8.77~8.32~5.18~23159.69~30615.30~0.76~9.56~7.82~1.52~-30716~8.48~8.04~8.31~~~-0.31~549783.9563~453.3802~5278~   A~GP-A~12.88~-0.35~3.73~8.79~0.67~8.88~6.53~1.91~7.25~10.00~269612212539~356406257089~-48.89~23.95~269612212539~~~15.47~0.12~~CNY~0~___D__F__N~8.65~-16597~";';

/** 港股行：v_hk01398（工商银行 H） */
const FIXTURE_H_SHARE =
  'v_hk01398="100~工商银行~01398~7.740~7.775~7.830~247871640.0~0~0~7.740~0~0~0~0~0~0~0~0~0~7.740~0~0~0~0~0~0~0~0~0~247871640.0~2026/11/03 16:08:09~-0.035~-0.45~7.840~7.545~7.740~247871640.0~1906065763.775~0~6.76~~0~0~3.79~6717.8590~27585.8443~ICBC~4.80~8.180~5.588~0.95~-32.39~0~0~0~0~0~6.16~0.59~0.29~1000~30.79~1.84~GP~8.74~0.67~3.34~6.35~11.16~356406257089.00~86794044550.00~6.22~0.372~7.690~26.51~HKD~1~50";';

/** 汇率行：v_whHKDCNY */
const FIXTURE_FX =
  'v_whHKDCNY="310~港元人民币~HKDCNY~0.8499~0~20261103233206~0.8470~0.8470~0.8507~0.8469~0.8499~0.8505~0.0029~0.34~0.05~-0.07~-0.53~-1.31~-5.29~0.9171~0.8465~2026-11-03";';

/** 未知代码：上游不返回 4xx，而是给 none_match 行 —— 必须跳过而不是当行情 */
const FIXTURE_NONE_MATCH = 'v_pv_none_match="1";';

/** 腾讯 fqkline（bfq，不复权）响应：键名 `day`，行序 O-C-H-L */
const FIXTURE_KLINE_BFQ = JSON.stringify({
  code: 0,
  msg: '',
  data: {
    sh601398: {
      day: [
        ['2026-05-11', '7.440', '7.470', '7.500', '7.410', '300000.000'],
        ['2026-05-12', '7.470', '7.480', '7.520', '7.440', '310000.000'],
        ['2026-05-13', '7.480', '7.230', '7.490', '7.200', '320000.000'],
      ],
    },
  },
});

/** 腾讯 fqkline 错误码（省略第 6 段复权参数时的真实形态） */
const FIXTURE_KLINE_BAD_PARAMS = JSON.stringify({ code: 1, msg: 'bad params', data: { sh601398: { version: '16' } } });

// ==================== helpers ====================

function buildApp(...routers: express.Router[]): express.Express {
  const app = express();
  app.use(express.json());
  for (const r of routers) app.use('/api', r);
  return app;
}

/** 用固定文本响应替换 global.fetch（含 GBK 编码路径） */
function stubFetchByUrl(routes: Array<{ match: RegExp; body: string | (() => never) }>): void {
  (global as any).fetch = vi.fn(async (input: any) => {
    const url = String(typeof input === 'string' ? input : input?.url ?? '');
    for (const r of routes) {
      if (r.match.test(url)) {
        if (typeof r.body === 'function') r.body(); // 抛错分支
        return {
          ok: true,
          status: 200,
          text: async () => r.body as string,
          json: async () => JSON.parse(r.body as string),
          // tencentQuoteService 走 arrayBuffer + TextDecoder('gbk')
          arrayBuffer: async () => {
            const buf = Buffer.from(r.body as string, 'latin1');
            return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
          },
        };
      }
    }
    throw new Error(`unstubbed url: ${url}`);
  });
}

/** 构造 UTF-8 内部表示的「伪 GBK 字节」：fixture 全为 ASCII/已解码字符，直接 latin1 往返即可 */
function fetchDown(): void {
  (global as any).fetch = vi.fn().mockRejectedValue(new Error('network down'));
}

beforeEach(() => {
  queryCache.invalidate('ai-universe');
  queryCache.invalidate('market:kline');
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ==================== tencentQuoteService ====================

describe('tencentQuoteService · 报价行解析', () => {
  it('A 股行：名称/价格/PE/PB/总市值 按标定字段位取到真实值', () => {
    const parsed = parseQuoteLine(FIXTURE_A_SHARE);
    expect(parsed).not.toBeNull();
    expect(parsed!.key).toBe('sh601398');
    const q = mapQuoteFields(parsed!.key, parsed!.fields);

    expect(q.name).toBe('工商银行');
    expect(q.bareCode).toBe('601398');
    expect(q.price).toBeCloseTo(8.59, 2);
    expect(q.changePercent).toBeCloseTo(-1.15, 2);
    expect(q.pe).toBeCloseTo(7.97, 2);
    expect(q.pb).toBeCloseTo(0.76, 2);
    // 45 字段单位为「亿元」→ 元（按亿为单位比较，避开 1e8 放大的浮点尾差）
    expect(q.marketCap! / 1e8).toBeCloseTo(30615.3, 1);
    // A 股 37 字段单位为万元 → 元
    expect(q.turnover).toBeCloseTo(549784 * 1e4, 0);
    expect(q.currency).toBe('CNY');
  });

  it('港股行：价格/涨跌幅/币种按港股字段位取到；PB 位未标定 → null（不猜）', () => {
    const parsed = parseQuoteLine(FIXTURE_H_SHARE);
    expect(parsed!.key).toBe('hk01398');
    const q = mapQuoteFields(parsed!.key, parsed!.fields);

    expect(q.name).toBe('工商银行');
    expect(q.price).toBeCloseTo(7.74, 3);
    expect(q.changePercent).toBeCloseTo(-0.45, 2);
    expect(q.currency).toBe('HKD');
    expect(q.pb).toBeNull();
  });

  it('v_pv_none_match 行必须被识别为「无行情」而不是一行垃圾数据', () => {
    expect(parseQuoteLine(FIXTURE_NONE_MATCH)).toBeNull();
  });

  it('非行情文本（空行 / 注释）返回 null', () => {
    expect(parseQuoteLine('')).toBeNull();
    expect(parseQuoteLine('something else')).toBeNull();
  });

  it('字段缺失一律 null，绝不补 0（0 是合法价格/成交量）', () => {
    const q = mapQuoteFields('sh600000', ['1', '浦发银行', '600000', '', '', '', '', '', '']);
    expect(q.price).toBeNull();
    expect(q.volume).toBeNull();
    expect(q.pe).toBeNull();
    expect(q.pb).toBeNull();
    expect(q.marketCap).toBeNull();
  });
});

describe('tencentQuoteService · 代码归一化', () => {
  it('A 股三种入参形态归一到同一个腾讯代码', () => {
    expect(toTencentCode('600519')).toBe('sh600519');
    expect(toTencentCode('600519.SH')).toBe('sh600519');
    expect(toTencentCode('SH600519')).toBe('sh600519');
    expect(toTencentCode('000001.SZ')).toBe('sz000001');
    expect(toTencentCode('sz000001')).toBe('sz000001');
    // 指数与个股共用规则：上证指数 sh000001 / 创业板指 sz399006
    expect(toTencentCode('000001.SH')).toBe('sh000001');
    expect(toTencentCode('399006.SZ')).toBe('sz399006');
  });

  it('非 6 位数字（如港股代码）不得被 A 股规则误吞', () => {
    expect(toTencentCode('01398')).toBeNull();
    expect(toTencentCode('')).toBeNull();
  });

  it('港股代码补足 5 位并加 hk 前缀', () => {
    expect(toTencentHkCode('01398')).toBe('hk01398');
    expect(toTencentHkCode('hk01398')).toBe('hk01398');
    expect(toTencentHkCode('939')).toBe('hk00939');
    expect(toTencentHkCode('abc')).toBeNull();
  });
});

describe('tencentQuoteService · 批量抓取', () => {
  it('多代码一次请求解析成 Map，未知代码被跳过', async () => {
    stubFetchByUrl([
      { match: /qt\.gtimg\.cn\/q=/, body: `${FIXTURE_A_SHARE}\n${FIXTURE_H_SHARE}\n${FIXTURE_NONE_MATCH}\n` },
    ]);
    const map = await fetchTencentQuotes(['sh601398', 'hk01398', 'sh688888']);
    expect(map.size).toBe(2);
    expect(map.get('sh601398')!.price).toBeCloseTo(8.59, 2);
    expect(map.get('hk01398')!.price).toBeCloseTo(7.74, 3);
    expect(map.has('sh688888')).toBe(false);
  });

  it('全部请求失败 → 抛 TencentQuoteUnavailableError（不返回空 Map 让调用方误以为无行情）', async () => {
    fetchDown();
    await expect(fetchTencentQuotes(['sh601398'])).rejects.toBeInstanceOf(TencentQuoteUnavailableError);
  });

  it('空代码列表不发请求，直接返回空 Map', async () => {
    const spy = vi.fn();
    (global as any).fetch = spy;
    const map = await fetchTencentQuotes([]);
    expect(map.size).toBe(0);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('tencentQuoteService · 汇率', () => {
  it('取到真实汇率 0.8499 并带日期与来源', async () => {
    stubFetchByUrl([{ match: /whHKDCNY/, body: FIXTURE_FX }]);
    const rate = await fetchHkdCnyRate();
    expect(rate).not.toBeNull();
    expect(rate!.rate).toBeCloseTo(0.8499, 4);
    expect(rate!.asOf).toBe('2026-11-03');
    expect(rate!.source).toContain('tencent');
  });

  it('汇率源不可达 → null（不得回落任何常数）', async () => {
    fetchDown();
    expect(await fetchHkdCnyRate()).toBeNull();
  });

  it('汇率值是脏值（0 / 非数 / 离谱量级）→ null，不做任何推断修补', async () => {
    stubFetchByUrl([
      { match: /whHKDCNY/, body: 'v_whHKDCNY="310~港元人民币~HKDCNY~0~0~1~..."' },
    ]);
    expect(await fetchHkdCnyRate()).toBeNull();

    stubFetchByUrl([
      { match: /whHKDCNY/, body: 'v_whHKDCNY="310~港元人民币~HKDCNY~abc~0~1~..."' },
    ]);
    expect(await fetchHkdCnyRate()).toBeNull();

    stubFetchByUrl([
      { match: /whHKDCNY/, body: 'v_whHKDCNY="310~港元人民币~HKDCNY~99~0~1~..."' },
    ]);
    expect(await fetchHkdCnyRate()).toBeNull();
  });
});

// ==================== 缺陷 A：K 线腾讯腿口径 ====================

describe('klineDataService · 腾讯兜底腿（缺陷 A）', () => {
  it('请求必须带 bfq（不复权），且从 day 键读取；成交量单位保持「手」不换算', async () => {
    const urls: string[] = [];
    (global as any).fetch = vi.fn(async (input: any) => {
      const url = String(input);
      urls.push(url);
      if (url.includes('push2his.eastmoney.com')) throw new Error('fetch failed');
      return {
        ok: true,
        status: 200,
        json: async () => JSON.parse(FIXTURE_KLINE_BFQ),
      };
    });

    const data = await getKline('601398', 3);
    const txUrl = urls.find((u) => u.includes('web.ifzq.gtimg.cn'))!;
    // 口径红线：禁 qfq/hfq，必须 bfq
    expect(txUrl).toContain('bfq');
    expect(txUrl).not.toContain('qfq');
    expect(txUrl).not.toContain('hfq');

    expect(data.dates).toEqual(['2026-05-11', '2026-05-12', '2026-05-13']);
    // O-C-H-L：prices 取第 3 段（close），不是第 4 段
    expect(data.prices).toEqual([7.47, 7.48, 7.23]);
    expect(data.highs).toEqual([7.5, 7.52, 7.49]);
    expect(data.lows).toEqual([7.41, 7.44, 7.2]);
    expect(data.volumes).toEqual([300000, 310000, 320000]);
    // 腾讯无逐日成交额 → 诚实空数组，不伪造 0
    expect(data.amounts).toEqual([]);
  });

  it('上游返回 code:1（bad params）→ KlineUnavailableError 且带上游 msg', async () => {
    (global as any).fetch = vi.fn(async (input: any) => {
      const url = String(input);
      if (url.includes('push2his.eastmoney.com')) throw new Error('fetch failed');
      return { ok: true, status: 200, json: async () => JSON.parse(FIXTURE_KLINE_BAD_PARAMS) };
    });

    await expect(getKline('601398', 3)).rejects.toBeInstanceOf(KlineUnavailableError);
    await expect(getKline('601398', 3)).rejects.toThrow(/bad params/);
  });

  it('两源皆不可达 → 错误信息同时包含两腿原因（便于定位是哪条腿坏的）', async () => {
    fetchDown();
    await expect(getKline('601398', 3)).rejects.toThrow(/东财.*腾讯/);
  });
});

// ==================== 缺陷 C：AH 溢价诚实契约 ====================

describe('hkConnect · AH 溢价（缺陷 C）', () => {
  // 与 app.ts:248 保持一致：hkConnect 挂在 /api/hk-connect
  const app = (() => {
    const a = express();
    a.use(express.json());
    a.use('/api/hk-connect', hkConnectRouter);
    return a;
  })();

  it('上游全不可达 → exchangeRate 必须是 null，且给出 unavailableReason（绝不再是 0.92）', async () => {
    fetchDown();
    const res = await request(app).get('/api/hk-connect/ah-premium');

    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.dataSource).toBe('unavailable');
    expect(d.count).toBe(0);
    expect(d.exchangeRate).toBeNull();
    expect(d.exchangeRate).not.toBe(0.92);
    expect(typeof d.unavailableReason).toBe('string');
    expect(d.unavailableReason.length).toBeGreaterThan(0);
  });

  it('汇率取不到但报价源正常 → 整腿置空（溢价率对汇率敏感，不给半成品数字）', async () => {
    (global as any).fetch = vi.fn(async (input: any) => {
      const url = String(input);
      if (url.includes('whHKDCNY')) throw new Error('fx down');
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => {
          const buf = Buffer.from(`${FIXTURE_A_SHARE}\n${FIXTURE_H_SHARE}\n`, 'latin1');
          return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
        },
      };
    });

    const res = await request(app).get('/api/hk-connect/ah-premium');
    const d = res.body.data;
    expect(d.dataSource).toBe('unavailable');
    expect(d.count).toBe(0);
    expect(d.exchangeRate).toBeNull();
    expect(d.unavailableReason).toContain('汇率');
  });

  it('行情与汇率都真实可得 → 溢价率由真实价 × 真实汇率派生（不是 0.92 口径）', async () => {
    stubFetchByUrl([
      { match: /whHKDCNY/, body: FIXTURE_FX },
      { match: /qt\.gtimg\.cn\/q=/, body: `${FIXTURE_A_SHARE}\n${FIXTURE_H_SHARE}\n` },
    ]);

    const res = await request(app).get('/api/hk-connect/ah-premium');
    const d = res.body.data;
    expect(d.dataSource).toBe('real');
    expect(d.exchangeRate).toBeCloseTo(0.8499, 4);

    const icbc = (d.data as any[]).find((r) => r.codeA === '601398');
    expect(icbc).toBeTruthy();
    expect(icbc.priceA).toBeCloseTo(8.59, 2);
    expect(icbc.priceH).toBeCloseTo(7.74, 3);
    // (8.59 - 7.74*0.8499) / (7.74*0.8499) * 100 = 30.58%
    const expected = +(((8.59 - 7.74 * 0.8499) / (7.74 * 0.8499)) * 100).toFixed(2);
    expect(icbc.premium).toBeCloseTo(expected, 2);
    // 反向对照：若仍用历史常数 0.92，溢价率会低约 8pp —— 断言当前口径不等于它
    const wrongWithOldRate = +(((8.59 - 7.74 * 0.92) / (7.74 * 0.92)) * 100).toFixed(2);
    expect(icbc.premium).toBeGreaterThan(wrongWithOldRate);
  });
});

// ==================== 缺陷 B：候选池契约 ====================

describe('ai-analysis · 候选池（缺陷 B）', () => {
  it('universe 规模入参：默认值 / 上限截断 / 非法值回落', () => {
    expect(resolveUniverseSize(undefined)).toBe(UNIVERSE_DEFAULT_SIZE);
    expect(resolveUniverseSize('')).toBe(UNIVERSE_DEFAULT_SIZE);
    expect(resolveUniverseSize('abc')).toBe(UNIVERSE_DEFAULT_SIZE);
    expect(resolveUniverseSize(0)).toBe(UNIVERSE_DEFAULT_SIZE);
    expect(resolveUniverseSize(-5)).toBe(UNIVERSE_DEFAULT_SIZE);
    expect(resolveUniverseSize(30)).toBe(30);
    expect(resolveUniverseSize(99999)).toBe(UNIVERSE_MAX_SIZE);
  });

  it('上游不可达 → dataSource unavailable 且 universe 为 null（不得谎报「全市场 0 机会」）', async () => {
    const app = buildApp(aiAnalysisRouter);
    fetchDown();
    queryCache.invalidate('ai-universe');

    const res = await request(app).get('/api/ai/recommendations');
    const d = res.body.data;
    expect(res.status).toBe(200);
    expect(res.body.dataSource).toBe('unavailable');
    expect(d.universe).toBeNull();
    expect(d.stocks).toEqual([]);
  });
});
