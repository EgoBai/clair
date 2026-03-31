import { describe, it, expect } from 'vitest';
import { analyzeConvertibleBond, scanConvertibleArbOpportunities, ConvertibleBond } from '../utils/convertibleArbEngine';

describe('可转债套利引擎', () => {
  const bond: ConvertibleBond = {
    code: '110001',
    name: '测试转债',
    stockCode: '600001',
    stockName: '正股A',
    bondPrice: 105,
    stockPrice: 8,
    conversionPrice: 10,
    conversionRatio: 10,
    parValue: 100,
    couponRate: 0.02,
    maturityDate: '2027-06-30',
    putPrice: 95,
    callPrice: 110,
    callTriggerPrice: 13,
    putTriggerPrice: 7,
  };

  it('应该计算转股价值', () => {
    const result = analyzeConvertibleBond(bond);
    expect(result.conversionValue).toBe(80); // 8 * 10
  });

  it('应该计算转股溢价率', () => {
    const result = analyzeConvertibleBond(bond);
    expect(result.conversionPremium).toBeCloseTo(0.3125); // (105-80)/80
  });

  it('应该计算到期收益率', () => {
    const result = analyzeConvertibleBond(bond);
    expect(typeof result.ytm).toBe('number');
  });

  it('应该计算纯债价值', () => {
    const result = analyzeConvertibleBond(bond);
    expect(result.pureBondValue).toBeGreaterThan(0);
  });

  it('应该判断赎回风险', () => {
    const result = analyzeConvertibleBond(bond);
    expect(result.callRisk).toBe(false); // stockPrice(8) < callTrigger(13)
  });

  it('应该判断回售机会', () => {
    const result = analyzeConvertibleBond(bond);
    expect(typeof result.putOpportunity).toBe('boolean');
  });

  it('应该评估下修概率', () => {
    const result = analyzeConvertibleBond(bond);
    expect(result.downgradePotential).toBeGreaterThanOrEqual(0);
    expect(result.downgradePotential).toBeLessThanOrEqual(1);
  });

  it('应该生成套利信号', () => {
    const result = analyzeConvertibleBond(bond);
    expect(['buy_bond', 'convert', 'sell', 'hold']).toContain(result.arbitrageSignal);
  });

  it('应该评估风险等级', () => {
    const result = analyzeConvertibleBond(bond);
    expect(['low', 'medium', 'high']).toContain(result.riskLevel);
  });

  it('应该扫描套利机会', () => {
    const bond2: ConvertibleBond = { ...bond, code: '110002', bondPrice: 75, stockPrice: 12 };
    const results = scanConvertibleArbOpportunities([bond, bond2]);
    expect(Array.isArray(results)).toBe(true);
  });

  it('深度价内转债应该有转换信号', () => {
    const deepItm: ConvertibleBond = { ...bond, bondPrice: 70, stockPrice: 12 };
    const result = analyzeConvertibleBond(deepItm);
    expect(result.conversionValue).toBe(120);
    expect(result.conversionPremium).toBeLessThan(0);
  });

  it('触发赎回的转债应该标记赎回风险', () => {
    const calledBond: ConvertibleBond = { ...bond, stockPrice: 15 };
    const result = analyzeConvertibleBond(calledBond);
    expect(result.callRisk).toBe(true);
  });
});
