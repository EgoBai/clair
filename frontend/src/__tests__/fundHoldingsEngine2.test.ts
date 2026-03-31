import { describe, it, expect } from 'vitest';
import { analyzeFundHoldings, FundHoldingsData } from '../utils/fundHoldingsEngine2';

describe('基金持仓分析引擎V2', () => {
  const data: FundHoldingsData = {
    fundName: '测试基金',
    fundType: 'equity',
    holdings: [
      { stockCode: '000001', stockName: '平安银行', weight: 0.12, prevWeight: 0.10, industry: '银行', marketCap: 3000, pe: 6 },
      { stockCode: '600519', stockName: '贵州茅台', weight: 0.10, prevWeight: 0.12, industry: '消费', marketCap: 25000, pe: 35 },
      { stockCode: '300750', stockName: '宁德时代', weight: 0.08, prevWeight: 0.08, industry: '新能源', marketCap: 8000, pe: 45 },
      { stockCode: '000858', stockName: '五粮液', weight: 0.06, prevWeight: 0.05, industry: '消费', marketCap: 6000, pe: 28 },
      { stockCode: '601318', stockName: '中国平安', weight: 0.05, prevWeight: 0.06, industry: '金融', marketCap: 9000, pe: 8 },
    ],
    benchmarkIndustryWeights: [
      { industry: '银行', weight: 0.10 },
      { industry: '消费', weight: 0.15 },
      { industry: '新能源', weight: 0.08 },
      { industry: '金融', weight: 0.12 },
    ],
    prevTopHoldings: ['000001', '600519', '300750', '000858', '601318'],
    turnoverRate: 2.5,
    totalAssets: 100,
    benchmarkName: '沪深300',
  };

  it('应计算持仓集中度', () => {
    const r = analyzeFundHoldings(data);
    expect(r.concentration).toBeGreaterThan(0);
  });

  it('应列出前十大重仓', () => {
    const r = analyzeFundHoldings(data);
    expect(r.topHoldings.length).toBe(5);
  });

  it('应计算行业偏离', () => {
    const r = analyzeFundHoldings(data);
    expect(r.industryDeviations.length).toBe(4);
  });

  it('应评估换手率', () => {
    const r = analyzeFundHoldings(data);
    expect(['low', 'moderate', 'high', 'excessive']).toContain(r.turnoverAssessment);
  });

  it('应输出风格标签', () => {
    const r = analyzeFundHoldings(data);
    expect(r.styleLabel.length).toBeGreaterThan(0);
  });

  it('应计算持仓质量', () => {
    const r = analyzeFundHoldings(data);
    expect(r.holdingQuality).toBeGreaterThan(0);
    expect(r.holdingQuality).toBeLessThanOrEqual(100);
  });

  it('应检测单一股票风险', () => {
    const r = analyzeFundHoldings(data);
    expect(typeof r.riskMetrics.singleStockRisk).toBe('boolean');
  });

  it('应计算有效持仓数', () => {
    const r = analyzeFundHoldings(data);
    expect(r.riskMetrics.effectiveHoldings).toBeGreaterThan(0);
  });

  it('应输出信号', () => {
    const r = analyzeFundHoldings(data);
    expect(Array.isArray(r.signals)).toBe(true);
  });

  it('应检测风格漂移', () => {
    const r = analyzeFundHoldings(data);
    expect(typeof r.styleDrift).toBe('boolean');
  });
});
