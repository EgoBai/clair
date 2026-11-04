/**
 * 指数符号归一化与登记表（真实绑定 backend/src/services/indexDataService.ts:70/100）
 *
 * 背景：前端「指数详情」曾因裸代码 000001 与 sh000001 精确匹配失败而整页降级
 * （D57 / T-2611-02）。后端这套归一化是同一个坑的另一半，此前零测试绑定。
 * 该模块用户可达（backend/src/api/market.ts 经 getIndexConstituents 调用）。
 */
import { describe, expect, it } from 'vitest';
import { normalizeIndexSymbol, getIndexName } from '../services/indexDataService';

describe('normalizeIndexSymbol（指数符号归一化）', () => {
  it('裸 6 位代码默认按沪市推断，并给出腾讯形态与登记键', () => {
    expect(normalizeIndexSymbol('000001')).toEqual({
      digits: '000001',
      exchange: 'SH',
      tencent: 'sh000001',
      key: 'SH000001',
    });
  });

  it('399 开头的深证系列在无标注时推断为深市', () => {
    expect(normalizeIndexSymbol('399006')).toMatchObject({ exchange: 'SZ', tencent: 'sz399006', key: 'SZ399006' });
    expect(normalizeIndexSymbol('399001')).toMatchObject({ exchange: 'SZ', key: 'SZ399001' });
  });

  it('显式前缀优先：sh/sz 大小写不敏感', () => {
    expect(normalizeIndexSymbol('sh000001')).toMatchObject({ exchange: 'SH', key: 'SH000001' });
    expect(normalizeIndexSymbol('SH000300')).toMatchObject({ exchange: 'SH', key: 'SH000300' });
    expect(normalizeIndexSymbol('sz399006')).toMatchObject({ exchange: 'SZ', key: 'SZ399006' });
  });

  it('显式后缀优先：000001.SH / 000001.SZ 分别落到两个交易所', () => {
    expect(normalizeIndexSymbol('000001.SH')).toMatchObject({ exchange: 'SH', key: 'SH000001' });
    expect(normalizeIndexSymbol('000001.SZ')).toMatchObject({ exchange: 'SZ', key: 'SZ000001' });
  });

  it('前后空白被裁掉，不产生异常', () => {
    expect(normalizeIndexSymbol('  000905  ')).toMatchObject({ key: 'SH000905' });
  });

  it('非法输入一律返回 null（不猜交易所、不补零）', () => {
    for (const bad of ['', '   ', '00001', 'sh00001', '0000010', 'ABC000001', '000001.HK', '000001.SS', '600519.XSHG', '000001.SH.SZ']) {
      expect(normalizeIndexSymbol(bad)).toBeNull();
    }
  });

  it('null/undefined 入参不抛错', () => {
    // @ts-expect-error 运行时可能拿到非字符串
    expect(normalizeIndexSymbol(null)).toBeNull();
    // @ts-expect-error 同上
    expect(normalizeIndexSymbol(undefined)).toBeNull();
  });
});

describe('getIndexName（已探明成分源的登记表）', () => {
  it('七个已登记指数的中文名固定', () => {
    const expected: Record<string, string> = {
      SH000001: '上证指数',
      SH000016: '上证50',
      SH000300: '沪深300',
      SH000905: '中证500',
      SH000688: '科创50',
      SZ399001: '深证成指',
      SZ399006: '创业板指',
    };
    for (const [key, name] of Object.entries(expected)) expect(getIndexName(key)).toBe(name);
  });

  it('未登记指数返回 undefined（调用方据此走 unavailable，绝不冒充）', () => {
    expect(getIndexName('SH000999')).toBeUndefined();
    expect(getIndexName('sz399999')).toBeUndefined();
    expect(getIndexName('')).toBeUndefined();
  });
});
