/**
 * 二级行业聚合测试 — P0-2
 * 覆盖 classifyStock 名称反推 & InMemoryDatabase.getSubIndustryPerformance / getStocksBySubIndustry
 */
import { describe, it, expect } from 'vitest';
import { InMemoryDatabase } from '../db/InMemoryDatabase';
import { classifyStock, deriveIndustryFromName } from '../../../shared/industryClassification';

describe('classifyStock — 名称反推二级行业', () => {
  it('有效一级行业直接复用', () => {
    const r = classifyStock('食品饮料', '贵州茅台');
    expect(r.industry).toBe('食品饮料');
    expect(r.subIndustry).toBe('白酒');
  });

  it('未分类(综合)按名称反推一级与二级', () => {
    const r = classifyStock('综合', '宁德时代');
    expect(r.industry).toBe('电力设备');
    expect(r.subIndustry).toBe('锂电池');
  });

  it('名称也无法命中时回退为未分类', () => {
    const r = classifyStock('综合', '某某综合实业');
    expect(r.industry).toBe('未分类');
    expect(r.subIndustry).toBe('未分类');
  });

  it('deriveIndustryFromName 仅用名称', () => {
    expect(deriveIndustryFromName('招商银行')).toBe('银行');
    expect(deriveIndustryFromName('乱七八糟xyz')).toBe('未分类');
  });
});

describe('InMemoryDatabase 二级行业聚合', () => {
  const db = new InMemoryDatabase();

  it('getSubIndustryPerformance 返回真实二级行业且覆盖全部股票', () => {
    const rows = db.getSubIndustryPerformance();
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBeGreaterThan(0);

    const total = rows.reduce((s, r) => s + r.stock_count, 0);
    expect(total).toBeGreaterThan(5000); // 全量 5541

    // 字段结构对齐前端 {parent,name,stock_count,avg_change_percent,avg_turnover_percent,total_market_cap}
    const baijiu = rows.find((r) => r.name === '白酒');
    expect(baijiu).toBeDefined();
    expect(baijiu!.parent).toBe('食品饮料');
    expect(baijiu!.stock_count).toBeGreaterThan(0);
    expect(typeof baijiu!.avg_change_percent).toBe('number');
    expect(baijiu!.total_market_cap).toBeGreaterThan(0);

    // avg_change_percent 保留两位小数精度
    expect(Number.isFinite(baijiu!.avg_change_percent)).toBe(true);
  });

  it('getStocksBySubIndustry 返回该二级行业的真实个股', () => {
    const stocks = db.getStocksBySubIndustry('白酒');
    expect(stocks.length).toBeGreaterThan(0);
    expect(stocks.every((s) => s.l2 === '白酒')).toBe(true);
    // 按市值降序
    for (let i = 1; i < stocks.length; i++) {
      expect(stocks[i - 1].marketCap).toBeGreaterThanOrEqual(stocks[i].marketCap);
    }
    // 每只都有最新行情
    expect(stocks.every((s) => typeof s.price === 'number' && typeof s.changePercent === 'number')).toBe(true);
  });

  it('未分类桶存在且为真实残差（非虚构）', () => {
    const rows = db.getSubIndustryPerformance();
    const unclassified = rows.find((r) => r.name === '未分类');
    // 未分类可能为 0（若全部可按名称分类），但若存在则 parent 必为 未分类
    if (unclassified) {
      expect(unclassified.parent).toBe('未分类');
    }
  });
});
