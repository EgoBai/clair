import { describe, it, expect } from 'vitest';
import { analyzeGeoRisk, GeoEvent } from '../utils/geoRiskEngine';

describe('地缘政治风险引擎', () => {
  const events: GeoEvent[] = [
    { region: '中东', type: 'conflict', severity: 8, date: '2024-03-10', affectedSectors: ['能源', '军工'], affectedCountries: ['SA', 'IR'] },
    { region: '东欧', type: 'conflict', severity: 7, date: '2024-03-08', affectedSectors: ['能源', '农产品'], affectedCountries: ['UA', 'RU'] },
    { region: '亚太', type: 'trade_war', severity: 5, date: '2024-03-05', affectedSectors: ['半导体', '出口'], affectedCountries: ['CN', 'US'] },
    { region: '中东', type: 'sanction', severity: 6, date: '2024-03-12', affectedSectors: ['能源', '金融'], affectedCountries: ['IR'] },
    { region: '东南亚', type: 'natural_disaster', severity: 4, date: '2024-03-01', affectedSectors: ['农业', '旅游'], affectedCountries: ['PH'] },
  ];

  it('应该计算全球风险指数', () => {
    const result = analyzeGeoRisk(events);
    expect(result.globalRiskIndex).toBeGreaterThan(0);
    expect(result.globalRiskIndex).toBeLessThanOrEqual(100);
  });

  it('应该评估区域风险', () => {
    const result = analyzeGeoRisk(events);
    expect(result.regionRisks.length).toBeGreaterThan(0);
    expect(result.regionRisks[0].region).toBe('中东'); // 最高风险
  });

  it('应该分析行业影响', () => {
    const result = analyzeGeoRisk(events);
    expect(result.sectorImpacts.length).toBeGreaterThan(0);
    expect(result.sectorImpacts.some(s => s.sector === '能源')).toBe(true);
  });

  it('应该给出避险信号', () => {
    const result = analyzeGeoRisk(events);
    expect(['gold', 'bond', 'usd', 'none']).toContain(result.safeHavenSignal);
  });

  it('应该给出对冲建议', () => {
    const result = analyzeGeoRisk(events);
    expect(Array.isArray(result.hedgeSuggestions)).toBe(true);
  });

  it('应该判断趋势', () => {
    const result = analyzeGeoRisk(events);
    for (const r of result.regionRisks) {
      expect(['rising', 'falling', 'stable']).toContain(r.trend);
    }
  });

  it('应该评估供应链影响', () => {
    const result = analyzeGeoRisk(events);
    for (const r of result.regionRisks) {
      expect(r.supplyChainImpact).toBeGreaterThanOrEqual(0);
    }
  });

  it('应该评估市场影响', () => {
    const result = analyzeGeoRisk(events);
    for (const r of result.regionRisks) {
      expect(r.marketImpact).toBeGreaterThanOrEqual(0);
    }
  });

  it('空事件应返回低风险', () => {
    const result = analyzeGeoRisk([]);
    expect(result.globalRiskIndex).toBe(20);
  });

  it('应该生成警报', () => {
    const result = analyzeGeoRisk(events);
    expect(Array.isArray(result.alerts)).toBe(true);
  });

  it('区域应按风险排序', () => {
    const result = analyzeGeoRisk(events);
    for (let i = 1; i < result.regionRisks.length; i++) {
      expect(result.regionRisks[i - 1].riskScore).toBeGreaterThanOrEqual(result.regionRisks[i].riskScore);
    }
  });

  it('应该按风险排序行业', () => {
    const result = analyzeGeoRisk(events);
    for (let i = 1; i < result.sectorImpacts.length; i++) {
      expect(result.sectorImpacts[i - 1].risk).toBeGreaterThanOrEqual(result.sectorImpacts[i].risk);
    }
  });
});
