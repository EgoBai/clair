import { describe, it, expect } from 'vitest';
import { ESGImpactEngine } from '../utils/esgImpactEngine';

describe('ESG Impact Engine', () => {
  const engine = new ESGImpactEngine();

  const goodEnv = { emissions: 100, renewablePct: 60, wasteRecyclePct: 70 };
  const goodSocial = { employeeSatisfaction: 85, diversityPct: 45, communitySpend: 5 };
  const goodGov = { boardIndependence: 70, auditQuality: 90, transparency: 85 };

  const badEnv = { emissions: 900, renewablePct: 10, wasteRecyclePct: 20 };
  const badSocial = { employeeSatisfaction: 40, diversityPct: 15, communitySpend: 0.5 };
  const badGov = { boardIndependence: 20, auditQuality: 30, transparency: 25 };

  describe('calcESGScore', () => {
    it('应计算高ESG评分', () => {
      const result = engine.calcESGScore(goodEnv, goodSocial, goodGov);
      expect(result.overall).toBeGreaterThan(50);
      expect(['AAA', 'AA', 'A', 'BBB']).toContain(result.rating);
    });

    it('应计算低ESG评分', () => {
      const result = engine.calcESGScore(badEnv, badSocial, badGov);
      expect(result.overall).toBeLessThan(60);
    });

    it('评分应在0-100之间', () => {
      const result = engine.calcESGScore(goodEnv, goodSocial, goodGov);
      expect(result.environmental.score).toBeGreaterThanOrEqual(0);
      expect(result.environmental.score).toBeLessThanOrEqual(100);
      expect(result.social.score).toBeGreaterThanOrEqual(0);
      expect(result.governance.score).toBeGreaterThanOrEqual(0);
    });

    it('评级应为有效值', () => {
      const result = engine.calcESGScore(goodEnv, goodSocial, goodGov);
      expect(['AAA', 'AA', 'A', 'BBB', 'BB', 'B', 'CCC']).toContain(result.rating);
    });
  });

  describe('analyzeESGReturnRelation', () => {
    it('应分析ESG-收益关系', () => {
      const scores = Array.from({ length: 50 }, () => 50 + Math.random() * 40);
      const returns = scores.map(s => (s - 70) * 0.0001 + (Math.random() - 0.5) * 0.01);
      const result = engine.analyzeESGReturnRelation(scores, returns);
      expect(result.correlation).toBeGreaterThanOrEqual(-1);
      expect(result.correlation).toBeLessThanOrEqual(1);
    });

    it('数据不足应返回零', () => {
      const result = engine.analyzeESGReturnRelation([1, 2], [1, 2]);
      expect(result.correlation).toBe(0);
    });
  });

  describe('assessESGRisk', () => {
    it('应评估ESG风险', () => {
      const score = engine.calcESGScore(goodEnv, goodSocial, goodGov);
      const risk = engine.assessESGRisk(score, 60);
      expect(['low', 'medium', 'high', 'severe']).toContain(risk.overallRisk);
      expect(risk.carbonRisk).toBeGreaterThanOrEqual(0);
    });

    it('低ESG应有高风险', () => {
      const score = engine.calcESGScore(badEnv, badSocial, badGov);
      const risk = engine.assessESGRisk(score, 60);
      expect(risk.keyRisks.length).toBeGreaterThan(0);
    });

    it('风险值应在0-100之间', () => {
      const score = engine.calcESGScore(goodEnv, goodSocial, goodGov);
      const risk = engine.assessESGRisk(score, 60);
      expect(risk.carbonRisk).toBeLessThanOrEqual(100);
      expect(risk.socialRisk).toBeLessThanOrEqual(100);
      expect(risk.governanceRisk).toBeLessThanOrEqual(100);
    });
  });
});
