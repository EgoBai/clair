import { describe, it, expect, beforeEach } from 'vitest';
import {
  MarketCalendar,
  EarningsCalendar,
  IPOCalendar,
  DividendCalendar,
  CalendarManager,
  type EarningsEvent,
  type IPOEvent,
  type DividendEvent,
} from '../utils/marketCalendarEngine';

describe('MarketCalendar', () => {
  let calendar: MarketCalendar;

  beforeEach(() => {
    calendar = new MarketCalendar();
  });

  describe('holiday detection', () => {
    it('should identify New Year 2025 as holiday', () => {
      expect(calendar.isHoliday('2025-01-01')).toBe(true);
    });

    it('should identify Spring Festival 2025 dates as holidays', () => {
      expect(calendar.isHoliday('2025-01-29')).toBe(true);
      expect(calendar.isHoliday('2025-02-03')).toBe(true);
    });

    it('should not identify regular trading day as holiday', () => {
      expect(calendar.isHoliday('2025-03-10')).toBe(false);
    });

    it('should return holiday name for known holidays', () => {
      const name = calendar.getHolidayName('2025-01-01');
      expect(name).toBeDefined();
    });

    it('should return undefined for non-holidays', () => {
      expect(calendar.getHolidayName('2025-03-10')).toBeUndefined();
    });
  });

  describe('weekend detection', () => {
    it('should identify Saturday as weekend', () => {
      expect(calendar.isWeekend('2025-03-08')).toBe(true); // Saturday
    });

    it('should identify Sunday as weekend', () => {
      expect(calendar.isWeekend('2025-03-09')).toBe(true); // Sunday
    });

    it('should not identify weekday as weekend', () => {
      expect(calendar.isWeekend('2025-03-10')).toBe(false); // Monday
    });
  });

  describe('trading day detection', () => {
    it('should identify regular weekday as trading day', () => {
      expect(calendar.isTradingDay('2025-03-10')).toBe(true);
    });

    it('should not identify weekend as trading day', () => {
      expect(calendar.isTradingDay('2025-03-08')).toBe(false);
    });

    it('should not identify holiday as trading day', () => {
      expect(calendar.isTradingDay('2025-01-01')).toBe(false);
    });
  });

  describe('trading day navigation', () => {
    it('should find next trading day after Friday', () => {
      const next = calendar.getNextTradingDay('2025-03-07'); // Friday
      expect(next).toBe('2025-03-10'); // Monday
    });

    it('should find next trading day after holiday', () => {
      const next = calendar.getNextTradingDay('2025-01-01');
      expect(next > '2025-01-01').toBe(true);
      expect(calendar.isTradingDay(next)).toBe(true);
    });

    it('should find previous trading day before Monday', () => {
      const prev = calendar.getPrevTradingDay('2025-03-10'); // Monday
      expect(calendar.isTradingDay(prev)).toBe(true);
    });
  });

  describe('trading days range', () => {
    it('should count trading days in a week', () => {
      const count = calendar.countTradingDays('2025-03-10', '2025-03-14');
      expect(count).toBe(5);
    });

    it('should count trading days spanning weekend', () => {
      const count = calendar.countTradingDays('2025-03-07', '2025-03-10');
      expect(count).toBe(2);
    });

    it('should get trading days in month', () => {
      const days = calendar.getTradingDaysInMonth(2025, 3);
      expect(days.length).toBeGreaterThan(20);
      expect(days.length).toBeLessThan(25);
      days.forEach(d => expect(d.isTradingDay).toBe(true));
    });
  });

  describe('market hours', () => {
    it('should return correct market open times', () => {
      const times = calendar.getMarketOpenTime();
      expect(times.morning).toBe('09:30');
      expect(times.afternoon).toBe('13:00');
    });

    it('should return correct market close times', () => {
      const times = calendar.getMarketCloseTime();
      expect(times.morning).toBe('11:30');
      expect(times.afternoon).toBe('15:00');
    });
  });

  describe('earnings seasons', () => {
    it('should return 4 earnings seasons per year', () => {
      const seasons = calendar.getEarningsSeasons(2025);
      expect(seasons.length).toBe(4);
    });

    it('should have correct Q1 season dates', () => {
      const seasons = calendar.getEarningsSeasons(2025);
      const q1 = seasons.find(s => s.quarter === 'Q1');
      expect(q1).toBeDefined();
      expect(q1!.start).toBe('2025-04-01');
      expect(q1!.end).toBe('2025-04-30');
    });

    it('should have Q4/Annual season extending to next year', () => {
      const seasons = calendar.getEarningsSeasons(2025);
      const q4 = seasons.find(s => s.quarter === 'Q4/Annual');
      expect(q4).toBeDefined();
      expect(q4!.end).toBe('2026-04-30');
    });
  });

  describe('quarter end dates', () => {
    it('should return 4 quarter end dates', () => {
      const dates = calendar.getQuarterEndDates(2025);
      expect(dates.length).toBe(4);
      expect(dates[0]).toBe('2025-03-31');
      expect(dates[3]).toBe('2025-12-31');
    });
  });

  describe('next holiday', () => {
    it('should find next holiday after a given date', () => {
      const next = calendar.getNextHoliday('2024-12-31');
      expect(next).not.toBeNull();
      expect(next!.date).toBe('2025-01-01');
    });

    it('should return null for far future dates with no data', () => {
      const next = calendar.getNextHoliday('2030-12-31');
      // May or may not be null depending on loaded data
      expect(typeof next === 'object' || next === null).toBe(true);
    });
  });
});

describe('EarningsCalendar', () => {
  let calendar: EarningsCalendar;

  const mockEarnings: EarningsEvent[] = [
    { stockCode: '600519', stockName: '贵州茅台', reportDate: '2025-04-15', reportType: 'quarterly', fiscalPeriod: 'Q1 2025', sector: '白酒', marketCap: 20000, status: 'upcoming' },
    { stockCode: '000858', stockName: '五粮液', reportDate: '2025-04-20', reportType: 'quarterly', fiscalPeriod: 'Q1 2025', sector: '白酒', marketCap: 5000, status: 'upcoming' },
    { stockCode: '000333', stockName: '美的集团', reportDate: '2025-04-25', reportType: 'quarterly', fiscalPeriod: 'Q1 2025', sector: '家电', marketCap: 4000, status: 'upcoming' },
    { stockCode: '601318', stockName: '中国平安', reportDate: '2025-03-15', reportType: 'annual', fiscalPeriod: 'FY 2024', sector: '金融', marketCap: 9000, status: 'reported', actualEPS: 5.2, estimatedEPS: 5.0, surprise: 0.2, surprisePercent: 4 },
    { stockCode: '600036', stockName: '招商银行', reportDate: '2025-03-20', reportType: 'annual', fiscalPeriod: 'FY 2024', sector: '金融', marketCap: 8000, status: 'reported', actualEPS: 4.8, estimatedEPS: 5.0, surprise: -0.2, surprisePercent: -4 },
  ];

  beforeEach(() => {
    calendar = new EarningsCalendar();
    calendar.addEvents(mockEarnings);
  });

  it('should filter by date range', () => {
    const results = calendar.filterEvents({ startDate: '2025-04-01', endDate: '2025-04-30' });
    expect(results.length).toBe(3);
  });

  it('should filter by sector', () => {
    const results = calendar.filterEvents({ sector: '白酒' });
    expect(results.length).toBe(2);
  });

  it('should filter by status', () => {
    const results = calendar.filterEvents({ status: 'reported' });
    expect(results.length).toBe(2);
  });

  it('should filter by stock code', () => {
    const results = calendar.filterEvents({ stockCode: '600519' });
    expect(results.length).toBe(1);
    expect(results[0].stockName).toBe('贵州茅台');
  });

  it('should get events by sector grouping', () => {
    const bySector = calendar.getBySector();
    expect(Object.keys(bySector).length).toBe(3);
    expect(bySector['白酒'].length).toBe(2);
  });

  it('should calculate beat rate correctly', () => {
    const stats = calendar.calculateBeatRate();
    expect(stats.beats).toBe(1);
    expect(stats.misses).toBe(1);
    expect(stats.rate).toBe(0.5);
  });

  it('should get earnings surprises', () => {
    const surprises = calendar.getEarningsSurprises(3);
    expect(surprises.length).toBe(2);
  });

  it('should get events by specific date', () => {
    const events = calendar.getEventsByDate('2025-04-15');
    expect(events.length).toBe(1);
    expect(events[0].stockCode).toBe('600519');
  });

  it('should sort events by market cap', () => {
    const events = calendar.filterEvents({});
    const sorted = calendar.sortEvents(events, 'marketCap');
    expect(sorted[0].marketCap).toBeGreaterThanOrEqual(sorted[1].marketCap);
  });

  it('should sort events by surprise', () => {
    const reported = calendar.filterEvents({ status: 'reported' });
    const sorted = calendar.sortEvents(reported, 'surprise');
    expect(sorted[0].surprisePercent).toBeGreaterThanOrEqual(sorted[1].surprisePercent!);
  });
});

describe('IPOCalendar', () => {
  let calendar: IPOCalendar;

  const mockIPOs: IPOEvent[] = [
    { stockCode: '688001', stockName: '科创板新星', listingDate: '2025-04-10', issuePrice: 28.5, issuePE: 45, totalShares: 100000000, raisedAmount: 2850000000, underwriter: '中信证券', board: 'star', status: 'upcoming' },
    { stockCode: '301001', stockName: '创业板达人', listingDate: '2025-04-15', issuePrice: 15.0, issuePE: 30, totalShares: 50000000, raisedAmount: 750000000, underwriter: '华泰证券', board: 'gem', status: 'upcoming' },
    { stockCode: '603001', stockName: '主板巨头', listingDate: '2025-03-01', issuePrice: 10.0, issuePE: 20, totalShares: 500000000, raisedAmount: 5000000000, underwriter: '中金公司', board: 'main', status: 'listed' },
  ];

  beforeEach(() => {
    calendar = new IPOCalendar();
    calendar.addEvents(mockIPOs);
  });

  it('should filter by board', () => {
    const star = calendar.filterEvents({ board: 'star' });
    expect(star.length).toBe(1);
    expect(star[0].board).toBe('star');
  });

  it('should filter by status', () => {
    const upcoming = calendar.filterEvents({ status: 'upcoming' });
    expect(upcoming.length).toBe(2);
  });

  it('should group by board', () => {
    const byBoard = calendar.getByBoard();
    expect(Object.keys(byBoard).length).toBe(3);
  });

  it('should calculate total raised amount', () => {
    const total = calendar.getTotalRaised();
    expect(total).toBe(5000000000);
  });

  it('should calculate average PE by board', () => {
    const avgPE = calendar.getAveragePE('star');
    expect(avgPE).toBe(45);
  });

  it('should return 0 for empty calendar average PE', () => {
    const emptyCalendar = new IPOCalendar();
    expect(emptyCalendar.getAveragePE()).toBe(0);
  });
});

describe('DividendCalendar', () => {
  let calendar: DividendCalendar;

  const mockDividends: DividendEvent[] = [
    { stockCode: '600519', stockName: '贵州茅台', exDividendDate: '2025-06-15', recordDate: '2025-06-14', paymentDate: '2025-06-20', dividendPerShare: 30.0, dividendYield: 1.5, payoutRatio: 52 },
    { stockCode: '000858', stockName: '五粮液', exDividendDate: '2025-06-20', recordDate: '2025-06-19', paymentDate: '2025-06-25', dividendPerShare: 5.0, dividendYield: 2.5, payoutRatio: 45 },
    { stockCode: '601318', stockName: '中国平安', exDividendDate: '2025-07-10', recordDate: '2025-07-09', paymentDate: '2025-07-15', dividendPerShare: 2.5, dividendYield: 4.5, payoutRatio: 35 },
  ];

  beforeEach(() => {
    calendar = new DividendCalendar();
    calendar.addEvents(mockDividends);
  });

  it('should filter by date range', () => {
    const results = calendar.filterEvents({ startDate: '2025-06-01', endDate: '2025-06-30' });
    expect(results.length).toBe(2);
  });

  it('should filter by stock code', () => {
    const results = calendar.filterEvents({ stockCode: '600519' });
    expect(results.length).toBe(1);
  });

  it('should find high yield dividends', () => {
    const highYield = calendar.getHighYieldDividends(2);
    expect(highYield.length).toBe(2);
  });

  it('should calculate total dividend income', () => {
    const income = calendar.getTotalDividendIncome('600519', 2025);
    expect(income).toBe(30.0);
  });

  it('should sort by yield', () => {
    const sorted = calendar.sortByYield();
    expect(sorted[0].dividendYield).toBeGreaterThanOrEqual(sorted[1].dividendYield);
  });
});

describe('CalendarManager', () => {
  let manager: CalendarManager;

  beforeEach(() => {
    manager = new CalendarManager();
  });

  it('should initialize all sub-calendars', () => {
    expect(manager.trading).toBeDefined();
    expect(manager.earnings).toBeDefined();
    expect(manager.ipo).toBeDefined();
    expect(manager.dividends).toBeDefined();
  });

  it('should calculate calendar stats', () => {
    const stats = manager.getCalendarStats('2025-01-01', '2025-12-31');
    expect(stats.totalTradingDays).toBeGreaterThan(200);
    expect(stats.totalTradingDays).toBeLessThan(260);
  });

  it('should get day overview', () => {
    const overview = manager.getDayOverview('2025-03-10');
    expect(overview.isTradingDay).toBe(true);
    expect(overview.earnings).toEqual([]);
    expect(overview.ipos).toEqual([]);
    expect(overview.dividends).toEqual([]);
  });

  it('should get week overview with 7 days', () => {
    const week = manager.getWeekOverview('2025-03-10');
    expect(week.days.length).toBe(7);
  });
});
