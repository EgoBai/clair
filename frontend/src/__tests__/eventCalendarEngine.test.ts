import { describe, it, expect } from 'vitest';
import {
  parseEvents,
  filterEvents,
  detectEventClusters,
  getUpcomingEvents,
  analyzeEventImpact,
  generateRiskCalendar,
} from '../utils/eventCalendarEngine';
import type { CalendarEvent, EventType } from '../utils/eventCalendarEngine';

const testEvents = [
  { date: '2024-01-15', type: 'earnings', symbol: 'AAPL', title: 'Apple Q4 Earnings' },
  { date: '2024-01-15', type: 'economic', title: 'CPI Release' },
  { date: '2024-01-16', type: 'earnings', symbol: 'MSFT', title: 'Microsoft Q2 Earnings' },
  { date: '2024-01-20', type: 'ex_dividend', symbol: 'AAPL', title: 'Apple Ex-Dividend' },
  { date: '2024-01-25', type: 'ipo', symbol: 'NEWCO', title: 'NewCo IPO' },
  { date: '2024-02-01', type: 'index_rebalance', title: 'CSI300 Rebalance' },
];

describe('Event Calendar Engine', () => {
  describe('parseEvents', () => {
    it('should parse and categorize events', () => {
      const events = parseEvents(testEvents);

      expect(events).toHaveLength(6);
      for (const e of events) {
        expect(e).toHaveProperty('id');
        expect(e).toHaveProperty('date');
        expect(e).toHaveProperty('type');
        expect(e).toHaveProperty('impact');
        expect(e).toHaveProperty('category');
      }
    });

    it('should assign correct impact levels', () => {
      const events = parseEvents(testEvents);
      const earnings = events.find(e => e.type === 'earnings');
      const dividend = events.find(e => e.type === 'ex_dividend');

      expect(earnings?.impact).toBe('high');
      expect(dividend?.impact).toBe('low');
    });
  });

  describe('filterEvents', () => {
    it('should filter by type', () => {
      const events = parseEvents(testEvents);
      const filtered = filterEvents(events, { types: ['earnings'] });

      expect(filtered.every(e => e.type === 'earnings')).toBe(true);
    });

    it('should filter by date range', () => {
      const events = parseEvents(testEvents);
      const filtered = filterEvents(events, {
        startDate: '2024-01-15',
        endDate: '2024-01-16',
      });

      expect(filtered).toHaveLength(3);
    });

    it('should filter by symbol', () => {
      const events = parseEvents(testEvents);
      const filtered = filterEvents(events, { symbols: ['AAPL'] });

      expect(filtered.every(e => e.symbol === 'AAPL')).toBe(true);
    });

    it('should filter by minimum impact', () => {
      const events = parseEvents(testEvents);
      const filtered = filterEvents(events, { minImpact: 'high' });

      expect(filtered.every(e => e.impact === 'high')).toBe(true);
    });
  });

  describe('detectEventClusters', () => {
    it('should detect clusters', () => {
      const events = parseEvents(testEvents);
      const clusters = detectEventClusters(events);

      expect(clusters.length).toBeGreaterThan(0);
      // Jan 15 has 2 events
      const jan15Cluster = clusters.find(c => c.date === '2024-01-15');
      expect(jan15Cluster?.events.length).toBe(2);
      expect(jan15Cluster?.riskLevel).toBe('high');
    });

    it('should include recommended actions', () => {
      const events = parseEvents(testEvents);
      const clusters = detectEventClusters(events);

      for (const c of clusters) {
        expect(c.recommendedAction.length).toBeGreaterThan(0);
      }
    });
  });

  describe('getUpcomingEvents', () => {
    it('should find upcoming events for a symbol', () => {
      // Use future dates so they show as upcoming
      const futureEvents = [
        { date: '2030-01-15', type: 'earnings', symbol: 'AAPL', title: 'Apple Earnings' },
        { date: '2030-01-20', type: 'ex_dividend', symbol: 'AAPL', title: 'Apple Dividend' },
        { date: '2030-01-25', type: 'earnings', symbol: 'MSFT', title: 'MSFT Earnings' },
      ];
      const events = parseEvents(futureEvents);
      const upcoming = getUpcomingEvents(events, 'AAPL', 3650);

      expect(upcoming.length).toBeGreaterThan(0);
      expect(upcoming.every(e => e.symbol === 'AAPL')).toBe(true);
    });
  });

  describe('analyzeEventImpact', () => {
    it('should analyze historical impact', () => {
      const events = parseEvents(testEvents);
      const historicalEvents = events.map(e => ({ ...e, estimatedEffect: (Math.random() - 0.5) * 10 }));

      const analysis = analyzeEventImpact(events[0], historicalEvents, {});

      expect(analysis).toHaveProperty('event');
      expect(analysis).toHaveProperty('historicalImpact');
      expect(analysis.historicalImpact).toHaveProperty('avgAbsChange');
      expect(analysis.historicalImpact).toHaveProperty('positiveRate');
      expect(analysis.historicalImpact.positiveRate).toBeGreaterThanOrEqual(0);
      expect(analysis.historicalImpact.positiveRate).toBeLessThanOrEqual(1);
    });
  });

  describe('generateRiskCalendar', () => {
    it('should generate risk calendar', () => {
      const events = parseEvents(testEvents);
      const calendar = generateRiskCalendar(events, '2024-01-01', '2024-01-31');

      expect(calendar.length).toBe(31);
      for (const day of calendar) {
        expect(day.riskScore).toBeGreaterThanOrEqual(0);
        expect(day.riskScore).toBeLessThanOrEqual(100);
        expect(day.eventCount).toBeGreaterThanOrEqual(0);
      }

      // Jan 15 should have highest risk
      const jan15 = calendar.find(d => d.date === '2024-01-15');
      expect(jan15?.eventCount).toBe(2);
    });
  });

  describe('edge cases', () => {
    it('should handle empty events', () => {
      expect(parseEvents([])).toEqual([]);
      expect(detectEventClusters([])).toEqual([]);
      expect(filterEvents([], {})).toEqual([]);
    });

    it('should handle events without symbols', () => {
      const events = parseEvents([
        { date: '2024-01-01', type: 'economic', title: 'GDP' },
      ]);
      expect(events[0].symbol).toBeUndefined();
    });
  });
});
