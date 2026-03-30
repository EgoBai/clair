/**
 * Market Calendar & Earnings Tracker
 * A股交易日历、财报日历、IPO日历追踪引擎
 */

export interface TradingDay {
  date: string;
  isTradingDay: boolean;
  isHoliday: boolean;
  holidayName?: string;
  halfDay?: boolean;
  market: 'SSE' | 'SZSE' | 'BSE';
}

export interface EarningsEvent {
  stockCode: string;
  stockName: string;
  reportDate: string;
  reportType: 'quarterly' | 'semi-annual' | 'annual';
  fiscalPeriod: string;
  estimatedEPS?: number;
  actualEPS?: number;
  surprise?: number;
  surprisePercent?: number;
  sector: string;
  marketCap: number;
  status: 'upcoming' | 'reported' | 'pre-announced';
}

export interface IPOEvent {
  stockCode: string;
  stockName: string;
  listingDate: string;
  issuePrice: number;
  issuePE: number;
  totalShares: number;
  raisedAmount: number;
  underwriter: string;
  board: 'main' | 'gem' | 'star' | 'beijing';
  status: 'upcoming' | 'listed' | 'cancelled';
}

export interface DividendEvent {
  stockCode: string;
  stockName: string;
  exDividendDate: string;
  recordDate: string;
  paymentDate: string;
  dividendPerShare: number;
  dividendYield: number;
  payoutRatio: number;
}

export interface CalendarFilter {
  startDate?: string;
  endDate?: string;
  stockCode?: string;
  sector?: string;
  market?: string;
  board?: string;
  reportType?: string;
  status?: string;
}

export interface CalendarStats {
  totalTradingDays: number;
  totalHolidays: number;
  upcomingEarnings: number;
  upcomingIPOs: number;
  upcomingDividends: number;
  busiestWeek: string;
  earningsByMonth: Record<string, number>;
}

// Chinese market holidays (2024-2026)
const CN_HOLIDAYS: Record<string, { name: string; dates: string[] }> = {
  '2024': {
    name: '2024',
    dates: [
      '2024-01-01', // 元旦
      '2024-02-09', '2024-02-10', '2024-02-11', '2024-02-12', '2024-02-13', '2024-02-14', '2024-02-15', '2024-02-16', '2024-02-17', // 春节
      '2024-04-04', '2024-04-05', '2024-04-06', // 清明
      '2024-05-01', '2024-05-02', '2024-05-03', '2024-05-04', '2024-05-05', // 劳动节
      '2024-06-10', // 端午
      '2024-09-15', '2024-09-16', '2024-09-17', // 中秋
      '2024-10-01', '2024-10-02', '2024-10-03', '2024-10-04', '2024-10-05', '2024-10-06', '2024-10-07', // 国庆
    ],
  },
  '2025': {
    name: '2025',
    dates: [
      '2025-01-01',
      '2025-01-28', '2025-01-29', '2025-01-30', '2025-01-31', '2025-02-01', '2025-02-02', '2025-02-03', '2025-02-04',
      '2025-04-04', '2025-04-05', '2025-04-06',
      '2025-05-01', '2025-05-02', '2025-05-03', '2025-05-04', '2025-05-05',
      '2025-05-31', '2025-06-01', '2025-06-02',
      '2025-10-01', '2025-10-02', '2025-10-03', '2025-10-04', '2025-10-05', '2025-10-06', '2025-10-07', '2025-10-08',
    ],
  },
  '2026': {
    name: '2026',
    dates: [
      '2026-01-01', '2026-01-02',
      '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19', '2026-02-20', '2026-02-21', '2026-02-22',
      '2026-04-05', '2026-04-06', '2026-04-07',
      '2026-05-01', '2026-05-02', '2026-05-03',
      '2026-06-19', '2026-06-20', '2026-06-21',
      '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07',
    ],
  },
};

export class MarketCalendar {
  private holidays: Map<string, string> = new Map();

  constructor() {
    this.loadHolidays();
  }

  private loadHolidays(): void {
    for (const [year, data] of Object.entries(CN_HOLIDAYS)) {
      for (const date of data.dates) {
        this.holidays.set(date, `${year}节假日`);
      }
    }
  }

  isHoliday(date: string): boolean {
    return this.holidays.has(date);
  }

  getHolidayName(date: string): string | undefined {
    return this.holidays.get(date);
  }

  isWeekend(date: string): boolean {
    const d = new Date(date);
    const day = d.getDay();
    return day === 0 || day === 6;
  }

  isTradingDay(date: string): boolean {
    return !this.isHoliday(date) && !this.isWeekend(date);
  }

  getTradingDays(startDate: string, endDate: string): TradingDay[] {
    const days: TradingDay[] = [];
    const start = new Date(startDate);
    const end = new Date(endDate);

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      days.push({
        date: dateStr,
        isTradingDay: this.isTradingDay(dateStr),
        isHoliday: this.isHoliday(dateStr),
        holidayName: this.getHolidayName(dateStr),
        market: 'SSE',
      });
    }

    return days;
  }

  getNextTradingDay(date: string): string {
    const d = new Date(date);
    d.setDate(d.getDate() + 1);
    while (!this.isTradingDay(d.toISOString().split('T')[0])) {
      d.setDate(d.getDate() + 1);
    }
    return d.toISOString().split('T')[0];
  }

  getPrevTradingDay(date: string): string {
    const d = new Date(date);
    d.setDate(d.getDate() - 1);
    while (!this.isTradingDay(d.toISOString().split('T')[0])) {
      d.setDate(d.getDate() - 1);
    }
    return d.toISOString().split('T')[0];
  }

  countTradingDays(startDate: string, endDate: string): number {
    return this.getTradingDays(startDate, endDate).filter(d => d.isTradingDay).length;
  }

  getTradingDaysInMonth(year: number, month: number): TradingDay[] {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    return this.getTradingDays(startDate, endDate).filter(d => d.isTradingDay);
  }

  getMarketOpenTime(): { morning: string; afternoon: string } {
    return {
      morning: '09:30',
      afternoon: '13:00',
    };
  }

  getMarketCloseTime(): { morning: string; afternoon: string } {
    return {
      morning: '11:30',
      afternoon: '15:00',
    };
  }

  isMarketOpen(datetime: Date = new Date()): boolean {
    if (!this.isTradingDay(datetime.toISOString().split('T')[0])) {
      return false;
    }
    const hours = datetime.getHours();
    const minutes = datetime.getMinutes();
    const time = hours * 100 + minutes;
    return (time >= 930 && time <= 1130) || (time >= 1300 && time <= 1500);
  }

  getTimeUntilClose(datetime: Date = new Date()): number {
    if (!this.isMarketOpen(datetime)) return 0;
    const hours = datetime.getHours();
    const minutes = datetime.getMinutes();
    const time = hours * 100 + minutes;
    if (time >= 930 && time <= 1130) {
      return (11 - hours) * 60 + (30 - minutes);
    }
    return (15 - hours) * 60 + (0 - minutes);
  }

  getNextHoliday(afterDate: string): { date: string; name: string } | null {
    const sorted = Array.from(this.holidays.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    for (const [date, name] of sorted) {
      if (date > afterDate) {
        return { date, name };
      }
    }
    return null;
  }

  getQuarterEndDates(year: number): string[] {
    return [
      `${year}-03-31`,
      `${year}-06-30`,
      `${year}-09-30`,
      `${year}-12-31`,
    ];
  }

  getEarningsSeasons(year: number): { start: string; end: string; quarter: string }[] {
    return [
      { start: `${year}-04-01`, end: `${year}-04-30`, quarter: 'Q1' },
      { start: `${year}-07-01`, end: `${year}-08-31`, quarter: 'Q2/H1' },
      { start: `${year}-10-01`, end: `${year}-10-31`, quarter: 'Q3' },
      { start: `${year + 1}-01-01`, end: `${year + 1}-04-30`, quarter: 'Q4/Annual' },
    ];
  }
}

export class EarningsCalendar {
  private events: EarningsEvent[] = [];

  addEvent(event: EarningsEvent): void {
    this.events.push(event);
  }

  addEvents(events: EarningsEvent[]): void {
    this.events.push(...events);
  }

  filterEvents(filter: CalendarFilter): EarningsEvent[] {
    return this.events.filter(e => {
      if (filter.startDate && e.reportDate < filter.startDate) return false;
      if (filter.endDate && e.reportDate > filter.endDate) return false;
      if (filter.stockCode && e.stockCode !== filter.stockCode) return false;
      if (filter.sector && e.sector !== filter.sector) return false;
      if (filter.reportType && e.reportType !== filter.reportType) return false;
      if (filter.status && e.status !== filter.status) return false;
      return true;
    });
  }

  getUpcoming(days: number = 7): EarningsEvent[] {
    const today = new Date().toISOString().split('T')[0];
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + days);
    return this.filterEvents({
      startDate: today,
      endDate: endDate.toISOString().split('T')[0],
      status: 'upcoming',
    });
  }

  getBySector(): Record<string, EarningsEvent[]> {
    const bySector: Record<string, EarningsEvent[]> = {};
    for (const event of this.events) {
      if (!bySector[event.sector]) bySector[event.sector] = [];
      bySector[event.sector].push(event);
    }
    return bySector;
  }

  getEarningsSurprises(minSurprisePercent: number = 5): EarningsEvent[] {
    return this.events.filter(
      e => e.status === 'reported' && e.surprisePercent !== undefined && Math.abs(e.surprisePercent) >= minSurprisePercent
    );
  }

  calculateBeatRate(): { beats: number; misses: number; meets: number; rate: number } {
    const reported = this.events.filter(e => e.status === 'reported' && e.surprise !== undefined);
    const beats = reported.filter(e => (e.surprise ?? 0) > 0).length;
    const misses = reported.filter(e => (e.surprise ?? 0) < 0).length;
    const meets = reported.filter(e => e.surprise === 0).length;
    const rate = reported.length > 0 ? beats / reported.length : 0;
    return { beats, misses, meets, rate };
  }

  getEventsByDate(date: string): EarningsEvent[] {
    return this.events.filter(e => e.reportDate === date);
  }

  sortEvents(events: EarningsEvent[], sortBy: 'date' | 'marketCap' | 'surprise'): EarningsEvent[] {
    return [...events].sort((a, b) => {
      switch (sortBy) {
        case 'date': return a.reportDate.localeCompare(b.reportDate);
        case 'marketCap': return b.marketCap - a.marketCap;
        case 'surprise': return (b.surprisePercent ?? 0) - (a.surprisePercent ?? 0);
        default: return 0;
      }
    });
  }
}

export class IPOCalendar {
  private events: IPOEvent[] = [];

  addEvent(event: IPOEvent): void {
    this.events.push(event);
  }

  addEvents(events: IPOEvent[]): void {
    this.events.push(...events);
  }

  filterEvents(filter: CalendarFilter): IPOEvent[] {
    return this.events.filter(e => {
      if (filter.startDate && e.listingDate < filter.startDate) return false;
      if (filter.endDate && e.listingDate > filter.endDate) return false;
      if (filter.stockCode && e.stockCode !== filter.stockCode) return false;
      if (filter.board && e.board !== filter.board) return false;
      if (filter.status && e.status !== filter.status) return false;
      return true;
    });
  }

  getUpcoming(days: number = 30): IPOEvent[] {
    const today = new Date().toISOString().split('T')[0];
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + days);
    return this.filterEvents({
      startDate: today,
      endDate: endDate.toISOString().split('T')[0],
      status: 'upcoming',
    });
  }

  getByBoard(): Record<string, IPOEvent[]> {
    const byBoard: Record<string, IPOEvent[]> = {};
    for (const event of this.events) {
      if (!byBoard[event.board]) byBoard[event.board] = [];
      byBoard[event.board].push(event);
    }
    return byBoard;
  }

  getTotalRaised(startDate?: string, endDate?: string): number {
    const filtered = this.filterEvents({ startDate, endDate, status: 'listed' });
    return filtered.reduce((sum, e) => sum + e.raisedAmount, 0);
  }

  getAveragePE(board?: string): number {
    const filtered = board
      ? this.events.filter(e => e.board === board)
      : this.events;
    if (filtered.length === 0) return 0;
    return filtered.reduce((sum, e) => sum + e.issuePE, 0) / filtered.length;
  }
}

export class DividendCalendar {
  private events: DividendEvent[] = [];

  addEvent(event: DividendEvent): void {
    this.events.push(event);
  }

  addEvents(events: DividendEvent[]): void {
    this.events.push(...events);
  }

  filterEvents(filter: CalendarFilter): DividendEvent[] {
    return this.events.filter(e => {
      if (filter.startDate && e.exDividendDate < filter.startDate) return false;
      if (filter.endDate && e.exDividendDate > filter.endDate) return false;
      if (filter.stockCode && e.stockCode !== filter.stockCode) return false;
      return true;
    });
  }

  getUpcoming(days: number = 7): DividendEvent[] {
    const today = new Date().toISOString().split('T')[0];
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + days);
    return this.filterEvents({
      startDate: today,
      endDate: endDate.toISOString().split('T')[0],
    });
  }

  getHighYieldDividends(minYield: number = 3): DividendEvent[] {
    return this.events.filter(e => e.dividendYield >= minYield);
  }

  getTotalDividendIncome(stockCode: string, year: number): number {
    return this.events
      .filter(e => e.stockCode === stockCode && e.exDividendDate.startsWith(String(year)))
      .reduce((sum, e) => sum + e.dividendPerShare, 0);
  }

  sortByYield(events?: DividendEvent[]): DividendEvent[] {
    const list = events ?? this.events;
    return [...list].sort((a, b) => b.dividendYield - a.dividendYield);
  }
}

export class CalendarManager {
  readonly trading: MarketCalendar;
  readonly earnings: EarningsCalendar;
  readonly ipo: IPOCalendar;
  readonly dividends: DividendCalendar;

  constructor() {
    this.trading = new MarketCalendar();
    this.earnings = new EarningsCalendar();
    this.ipo = new IPOCalendar();
    this.dividends = new DividendCalendar();
  }

  getCalendarStats(startDate: string, endDate: string): CalendarStats {
    const tradingDays = this.trading.getTradingDays(startDate, endDate).filter(d => d.isTradingDay);
    const upcomingEarnings = this.earnings.getUpcoming(30);
    const upcomingIPOs = this.ipo.getUpcoming(30);
    const upcomingDividends = this.dividends.getUpcoming(30);

    const earningsByMonth: Record<string, number> = {};
    for (const e of this.earnings.filterEvents({ startDate, endDate })) {
      const month = e.reportDate.substring(0, 7);
      earningsByMonth[month] = (earningsByMonth[month] || 0) + 1;
    }

    let busiestWeek = '';
    let maxEarnings = 0;
    const weekCounts: Record<string, number> = {};
    for (const e of this.earnings.filterEvents({ startDate, endDate })) {
      const d = new Date(e.reportDate);
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - d.getDay());
      const key = weekStart.toISOString().split('T')[0];
      weekCounts[key] = (weekCounts[key] || 0) + 1;
      if (weekCounts[key] > maxEarnings) {
        maxEarnings = weekCounts[key];
        busiestWeek = key;
      }
    }

    return {
      totalTradingDays: tradingDays.length,
      totalHolidays: this.trading.getTradingDays(startDate, endDate).filter(d => d.isHoliday).length,
      upcomingEarnings: upcomingEarnings.length,
      upcomingIPOs: upcomingIPOs.length,
      upcomingDividends: upcomingDividends.length,
      busiestWeek,
      earningsByMonth,
    };
  }

  getDayOverview(date: string): {
    isTradingDay: boolean;
    earnings: EarningsEvent[];
    ipos: IPOEvent[];
    dividends: DividendEvent[];
  } {
    return {
      isTradingDay: this.trading.isTradingDay(date),
      earnings: this.earnings.getEventsByDate(date),
      ipos: this.ipo.filterEvents({ startDate: date, endDate: date }),
      dividends: this.dividends.filterEvents({ startDate: date, endDate: date }),
    };
  }

  getWeekOverview(startDate: string): {
    days: {
      date: string;
      isTradingDay: boolean;
      earnings: number;
      ipos: number;
      dividends: number;
    }[];
  } {
    const days = [];
    const start = new Date(startDate);
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];
      const overview = this.getDayOverview(dateStr);
      days.push({
        date: dateStr,
        isTradingDay: overview.isTradingDay,
        earnings: overview.earnings.length,
        ipos: overview.ipos.length,
        dividends: overview.dividends.length,
      });
    }
    return { days };
  }
}
