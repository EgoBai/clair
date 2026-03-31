import { describe, it, expect } from 'vitest';
import {
  classifyMAEvent,
  analyzeMAValuation,
  analyzeSynergies,
  analyzeImpact,
  generateStrategySignals,
  assessRegulatoryRisk,
  analyzeMAPortfolio,
  runMAAnalysis,
  type MAEvent,
} from '../utils/maEventEngine';

function makeEvent(overrides: Partial<MAEvent> = {}): MAEvent {
  return {
    id: 'MA001',
    announcementDate: '2025-03-15',
    acquirerCode: '000001.SZ',
    acquirerName: '收购方科技',
    targetCode: '000002.SZ',
    targetName: '目标公司',
    maType: 'acquisition',
    transactionValue: 30,
    paymentMethod: 'cash',
    targetIndustry: '科技',
    targetRevenue: 8,
    targetNetProfit: 1.5,
    targetPE: 20,
    industryAvgPE: 25,
    premium: 0.15,
    status: 'proposed',
    synergiesExpected: true,
    relatedParty: false,
    ...overrides,
  };
}

describe('maEventEngine', () => {
  describe('classifyMAEvent', () => {
    it('should classify merger', () => {
      expect(classifyMAEvent({ targetName: '某某合并' })).toBe('merger');
    });

    it('should classify spin off', () => {
      expect(classifyMAEvent({ targetName: '业务分拆' })).toBe('spin_off');
    });

    it('should classify backdoor listing', () => {
      expect(classifyMAEvent({ targetName: '借壳上市' })).toBe('backdoor_listing');
    });

    it('should classify privatization', () => {
      expect(classifyMAEvent({ targetName: '私有化方案' })).toBe('privatization');
    });

    it('should default to acquisition', () => {
      expect(classifyMAEvent({ targetName: '普通收购' })).toBe('acquisition');
    });

    it('should use provided type', () => {
      expect(classifyMAEvent({ maType: 'divestiture' })).toBe('divestiture');
    });
  });

  describe('analyzeMAValuation', () => {
    it('should calculate PE multiple', () => {
      const event = makeEvent();
      const val = analyzeMAValuation(event);
      expect(val.peMultiple).toBe(20); // 30/1.5
    });

    it('should calculate PS multiple', () => {
      const event = makeEvent();
      const val = analyzeMAValuation(event);
      expect(val.psMultiple).toBe(3.75); // 30/8
    });

    it('should assess overpay risk', () => {
      const event = makeEvent({ premium: 0.8, relatedParty: true, targetPE: 60 });
      const val = analyzeMAValuation(event);
      expect(val.overpayRisk).toBeGreaterThan(0.5);
    });

    it('should find reasonable valuation', () => {
      const event = makeEvent({ premium: 0.1, relatedParty: false });
      const val = analyzeMAValuation(event);
      expect(val.isReasonable).toBe(true);
    });

    it('should provide valuation opinion', () => {
      const event = makeEvent();
      const val = analyzeMAValuation(event);
      expect(val.valuationOpinion.length).toBeGreaterThan(0);
    });
  });

  describe('analyzeSynergies', () => {
    it('should identify synergy factors', () => {
      const event = makeEvent();
      const syn = analyzeSynergies(event);
      expect(syn.synergyFactors.length).toBeGreaterThan(0);
    });

    it('should calculate total synergy', () => {
      const event = makeEvent();
      const syn = analyzeSynergies(event);
      expect(syn.totalSynergy).toBeGreaterThan(0);
    });

    it('should identify risk factors for related party', () => {
      const event = makeEvent({ relatedParty: true });
      const syn = analyzeSynergies(event);
      expect(syn.riskFactors.some(r => r.includes('关联交易'))).toBe(true);
    });

    it('should assign synergy score', () => {
      const event = makeEvent();
      const syn = analyzeSynergies(event);
      expect(syn.synergyScore).toBeGreaterThanOrEqual(0);
      expect(syn.synergyScore).toBeLessThanOrEqual(100);
    });
  });

  describe('analyzeImpact', () => {
    it('should analyze acquirer impact', () => {
      const event = makeEvent();
      const val = analyzeMAValuation(event);
      const impact = analyzeImpact(event, val);
      expect(impact.acquirerImpact).toBeDefined();
      expect(typeof impact.acquirerImpact.epsDilution).toBe('number');
    });

    it('should generate short-term signal', () => {
      const event = makeEvent();
      const val = analyzeMAValuation(event);
      const impact = analyzeImpact(event, val);
      expect(['strong_buy', 'buy', 'hold', 'sell', 'strong_sell']).toContain(impact.shortTermSignal);
    });

    it('should generate long-term signal', () => {
      const event = makeEvent();
      const val = analyzeMAValuation(event);
      const impact = analyzeImpact(event, val);
      expect(['positive', 'neutral', 'negative']).toContain(impact.longTermSignal);
    });

    it('should flag key risks for high premium', () => {
      const event = makeEvent({ premium: 0.6 });
      const val = analyzeMAValuation(event);
      const impact = analyzeImpact(event, val);
      expect(impact.keyRisks.length).toBeGreaterThan(0);
    });

    it('should calculate expected price move', () => {
      const event = makeEvent();
      const val = analyzeMAValuation(event);
      const impact = analyzeImpact(event, val);
      expect(typeof impact.expectedPriceMove).toBe('number');
    });
  });

  describe('generateStrategySignals', () => {
    it('should generate post-announcement signal', () => {
      const event = makeEvent({ status: 'proposed' });
      const val = analyzeMAValuation(event);
      const impact = analyzeImpact(event, val);
      const signals = generateStrategySignals(event, impact);
      expect(signals.some(s => s.signalType === 'post_announcement')).toBe(true);
    });

    it('should generate approval play signal', () => {
      const event = makeEvent({ status: 'proposed', relatedParty: false });
      const val = analyzeMAValuation(event);
      const impact = analyzeImpact(event, val);
      const signals = generateStrategySignals(event, impact);
      expect(signals.some(s => s.signalType === 'approval_play')).toBe(true);
    });

    it('should include target return and stop loss', () => {
      const event = makeEvent();
      const val = analyzeMAValuation(event);
      const impact = analyzeImpact(event, val);
      const signals = generateStrategySignals(event, impact);
      for (const s of signals) {
        expect(s.targetReturn).toBeGreaterThan(0);
        expect(s.stopLoss).toBeLessThan(0);
      }
    });
  });

  describe('assessRegulatoryRisk', () => {
    it('should assess antitrust risk', () => {
      const event = makeEvent({ transactionValue: 100 });
      const risk = assessRegulatoryRisk(event);
      expect(risk.antitrustRisk).toBeGreaterThan(0);
    });

    it('should estimate approval probability', () => {
      const event = makeEvent();
      const risk = assessRegulatoryRisk(event);
      expect(risk.approvalProbability).toBeGreaterThan(0);
      expect(risk.approvalProbability).toBeLessThanOrEqual(1);
    });

    it('should flag policy risk for restricted industries', () => {
      const event = makeEvent({ targetIndustry: '房地产' });
      const risk = assessRegulatoryRisk(event);
      expect(risk.industryPolicyRisk).toBeGreaterThan(0);
    });

    it('should provide estimated approval time', () => {
      const event = makeEvent();
      const risk = assessRegulatoryRisk(event);
      expect(risk.estimatedApprovalTime.length).toBeGreaterThan(0);
    });
  });

  describe('analyzeMAPortfolio', () => {
    it('should analyze portfolio of events', () => {
      const events = [makeEvent(), makeEvent({ id: 'MA002', acquirerCode: '000003.SZ' })];
      const result = analyzeMAPortfolio(events);
      expect(result.events.length).toBe(2);
      expect(result.avgPremium).toBeGreaterThan(0);
    });

    it('should calculate success rate', () => {
      const events = [
        makeEvent({ status: 'completed' }),
        makeEvent({ id: 'MA002', status: 'terminated' }),
      ];
      const result = analyzeMAPortfolio(events);
      expect(result.successRate).toBe(0.5);
    });

    it('should identify sector heat', () => {
      const events = [
        makeEvent({ targetIndustry: '科技' }),
        makeEvent({ id: 'MA002', targetIndustry: '科技' }),
        makeEvent({ id: 'MA003', targetIndustry: '医药' }),
      ];
      const result = analyzeMAPortfolio(events);
      expect(result.sectorHeat.get('科技')).toBe(2);
    });

    it('should handle empty portfolio', () => {
      const result = analyzeMAPortfolio([]);
      expect(result.events.length).toBe(0);
    });
  });

  describe('runMAAnalysis', () => {
    it('should return complete analysis', () => {
      const event = makeEvent();
      const result = runMAAnalysis(event);
      expect(result.valuation).toBeDefined();
      expect(result.synergies).toBeDefined();
      expect(result.impact).toBeDefined();
      expect(result.signals.length).toBeGreaterThan(0);
      expect(result.regulatory).toBeDefined();
      expect(result.summary).toBeDefined();
    });

    it('should provide overall rating', () => {
      const event = makeEvent();
      const result = runMAAnalysis(event);
      expect(['positive', 'neutral', 'negative']).toContain(result.summary.overallRating);
    });

    it('should combine concerns from impact and regulatory', () => {
      const event = makeEvent({ relatedParty: true, premium: 0.5 });
      const result = runMAAnalysis(event);
      expect(result.summary.keyConcerns.length).toBeGreaterThan(0);
    });
  });
});
