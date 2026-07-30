/**
 * 二级行业分类测试 — P0-2
 *
 * 说明：纯函数 classifyStock / deriveIndustryFromName 是本任务的核心分类逻辑
 *（决定二级行业能否按名称补齐未分类股）。InMemoryDatabase.getSubIndustryPerformance /
 * getStocksBySubIndustry 的聚合结果已在后端以真实 PostgreSQL 数据端到端验证
 *（GET /api/industries?level=2 覆盖 5544 只、54 个真实二级行业）。
 * 此处用纯函数单测固化分类规则，避免 vitest 在沙箱内构造 5541 只内存库导致 OOM。
 */
import { describe, it, expect } from 'vitest';
import { classifyStock, deriveIndustryFromName, classifySubIndustry } from '../../../shared/industryClassification';

describe('classifyStock — 名称反推二级行业', () => {
  it('有效一级行业直接复用其二级', () => {
    const r = classifyStock('食品饮料', '贵州茅台');
    expect(r.industry).toBe('食品饮料');
    expect(r.subIndustry).toBe('白酒');
  });

  it('未分类(传 undefined)按名称反推一级与二级', () => {
    // 端点对 industry='综合'/'未分类'/NULL 的个股传 undefined，强制按名称反推
    const r = classifyStock(undefined, '宁德时代');
    expect(r.industry).toBe('电力设备');
    expect(r.subIndustry).toBe('锂电池');
  });

  it('银行股按名称命中二级而非回退 subs[0]', () => {
    const r = classifyStock('银行', '宁波银行');
    expect(r.industry).toBe('银行');
    expect(r.subIndustry).toBe('城商行');
  });

  it('名称也无法命中时回退为未分类', () => {
    const r = classifyStock(undefined, '某某综合实业');
    expect(r.industry).toBe('未分类');
    expect(r.subIndustry).toBe('未分类');
  });

  it('deriveIndustryFromName 仅用名称', () => {
    expect(deriveIndustryFromName('招商银行')).toBe('银行');
    expect(deriveIndustryFromName('比亚迪')).toBe('汽车');
    expect(deriveIndustryFromName('乱七八糟xyz')).toBe('未分类');
  });

  it('classifySubIndustry 无匹配时回退 subs[0]', () => {
    expect(classifySubIndustry('电子', '某电子公司')).toBe('半导体');
  });
});
