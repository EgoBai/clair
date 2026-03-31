import { describe, it, expect } from 'vitest';
import {
  assessEventImpact,
  calculateSurpriseIndex,
  detectCalendarEffects,
  identifyRiskEvents,
  assessMonetaryStance,
  classifyEconomicCycle,
  analyzeMacroCalendar,
} from '../utils/macroCalendarEngine';
import type { EconomicEvent } from '../utils/macroCalendarEngine';

function createEvent(overrides: Partial<EconomicEvent> = {}): EconomicEvent {
  return {
    id: Math.random().toString(36).slice(2),
    name: 'GDP',
    date: new Date().toISOString(),
    country: 'CN',
    importance: 'high',
    actual: 5.0,
    forecast: 4.8,
    previous: 4.5,
    unit: '%',
    category: 'gdp',
    ...overrides,
  };
}

describe('Macro Calendar Engine', () => {
  const events: EconomicEvent[] = [
    createEvent({ name: 'GDP', category: 'gdp', actual: 5.2, forecast: 4.8, importance: 'high' }),
    createEvent({ name: 'CPI', category: 'inflation', actual: 2.5, forecast: 2.8, importance: 'high' }),
    createEvent({ name: 'PMI', category: 'pmi', actual: 51.5, forecast: 50.5, importance: 'medium' }),
    createEvent({ name: '利率决议', category: 'monetary', actual: 3.5, previous: 3.8, importance: 'high' }),
  ];

  describe('assessEventImpact', () => {
    it('should return positive for better-than-expected GDP', () => {
      const event = createEvent({ category: 'gdp', actual: 5.5, forecast: 5.0 });
      const impact = assessEventImpact(event);
      expect(impact.impact).toBe('positive');
      expect(impact.magnitude).toBeGreaterThan(0);
    });

    it('should return negative for higher-than-expected inflation', () => {
      const event = createEvent({ category: 'inflation', actual: 4.0, forecast: 3.0 });
      const impact = assessEventImpact(event);
      expect(impact.impact).toBe('negative');
    });

    it('should return neutral when no data', () => {
      const event = createEvent({ actual: undefined, forecast: undefined });
      const impact = assessEventImpact(event);
      expect(impact.impact).toBe('neutral');
      expect(impact.magnitude).toBe(0);
    });
  });

  describe('calculateSurpriseIndex', () => {
    it('should calculate weighted surprise index', () => {
      const index = calculateSurpriseIndex(events);
      expect(typeof index).toBe('number');
    });

    it('should return 0 for empty events', () => {
      expect(calculateSurpriseIndex([])).toBe(0);
    });
  });

  describe('detectCalendarEffects', () => {
    it('should detect relevant calendar effects', () => {
      const effects = detectCalendarEffects(new Date());
      expect(Array.isArray(effects)).toBe(true);
      effects.forEach((e) => {
        expect(['bullish', 'bearish', 'neutral']).toContain(e.effect);
        expect(e.name).toBeDefined();
        expect(e.confidence).toBeGreaterThan(0);
        expect(e.confidence).toBeLessThanOrEqual(1);
      });
    });

    it('should detect January effect in January', () => {
      const effects = detectCalendarEffects(new Date('2024-01-10'));
      expect(effects.some((e) => e.name.includes('一月'))).toBe(true);
    });

    it('should detect Sell in May effect', () => {
      const effects = detectCalendarEffects(new Date('2024-06-15'));
      expect(effects.some((e) => e.name.includes('Sell'))).toBe(true);
    });

    it('should detect Friday effect', () => {
      // 2024-03-15 is a Friday
      const effects = detectCalendarEffects(new Date('2024-03-15'));
      expect(effects.some((e) => e.name.includes('周五'))).toBe(true);
    });
  });

  describe('identifyRiskEvents', () => {
    it('should find high-importance events in the next 7 days', () => {
      const futureEvent = createEvent({
        importance: 'high',
        date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      });
      const riskEvents = identifyRiskEvents([futureEvent, ...events], 7);
      expect(riskEvents.length).toBeGreaterThan(0);
    });

    it('should not include low importance events', () => {
      const lowEvent = createEvent({
        importance: 'low',
        date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
      });
      const riskEvents = identifyRiskEvents([lowEvent], 7);
      expect(riskEvents.length).toBe(0);
    });
  });

  describe('assessMonetaryStance', () => {
    it('should detect dovish stance when rates cut', () => {
      const rateCut = [
        createEvent({ category: 'monetary', name: '利率', actual: 3.0, previous: 3.5 }),
      ];
      expect(assessMonetaryStance(rateCut)).toBe('dovish');
    });

    it('should detect hawkish stance when rates raised', () => {
      const rateHike = [
        createEvent({ category: 'monetary', name: '利率', actual: 4.0, previous: 3.5 }),
      ];
      expect(assessMonetaryStance(rateHike)).toBe('hawkish');
    });

    it('should return neutral for no monetary events', () => {
      expect(assessMonetaryStance([])).toBe('neutral');
    });
  });

  describe('classifyEconomicCycle', () => {
    it('should classify expansion for high PMI', () => {
      const highPMI = [createEvent({ category: 'pmi', actual: 54 })];
      expect(classifyEconomicCycle(highPMI)).toBe('expansion');
    });

    it('should classify contraction for low PMI', () => {
      const lowPMI = [createEvent({ category: 'pmi', actual: 48 })];
      expect(classifyEconomicCycle(lowPMI)).toBe('contraction');
    });

    it('should default to expansion with no data', () => {
      expect(classifyEconomicCycle([])).toBe('expansion');
    });
  });

  describe('analyzeMacroCalendar', () => {
    it('should return complete macro analysis', () => {
      const analysis = analyzeMacroCalendar(events);

      expect(Array.isArray(analysis.upcomingEvents)).toBe(true);
      expect(typeof analysis.surpriseIndex).toBe('number');
      expect(Array.isArray(analysis.calendarEffects)).toBe(true);
      expect(Array.isArray(analysis.riskEvents)).toBe(true);
      expect(['dovish', 'hawkish', 'neutral']).toContain(analysis.monetaryPolicyStance);
      expect(['expansion', 'peak', 'contraction', 'trough']).toContain(analysis.economicCycle);
      expect(analysis.compositeScore).toBeGreaterThanOrEqual(-100);
      expect(analysis.compositeScore).toBeLessThanOrEqual(100);
    });
  });
});
