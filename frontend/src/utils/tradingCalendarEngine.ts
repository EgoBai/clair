/**
 * 交易日历工具引擎
 * 交易日判断/节气日期/T+1规则/涨跌停计算/除权除息
 */

export interface TradingDayInfo {
  date: string;
  isTradingDay: boolean;
  dayOfWeek: number;
  isHalfDay: boolean;
  holidayName?: string;
  nextTradingDay: string;
  prevTradingDay: string;
  tradingDayOfYear: number;
  tradingDaysRemaining: number;
}

export interface ExDividendInfo {
  code: string;
  exDividendDate: string;
  cashDividend: number;    // 每股派息(元)
  stockDividend: number;   // 每股送转(股)
  adjustedPrice: number;   // 除权除息参考价
  recordDate: string;
  paymentDate: string;
}

export interface PriceLimitInfo {
  code: string;
  date: string;
  prevClose: number;
  upperLimit: number;
  lowerLimit: number;
  isST: boolean;
  is新股: boolean;
  is科创板: boolean;
  is北交所: boolean;
}

export interface TradeSettlementInfo {
  tradeDate: string;
  settlementDate: string;
  isT1: boolean;
  canSell: boolean;
  fundAvailable: string;
}

// A股主要节假日 (2025-2026)
const HOLIDAYS: Record<string, string> = {
  '2025-01-01': '元旦',
  '2025-01-28': '春节', '2025-01-29': '春节', '2025-01-30': '春节', '2025-01-31': '春节',
  '2025-02-03': '春节', '2025-02-04': '春节',
  '2025-04-04': '清明节', '2025-04-05': '清明节', '2025-04-06': '清明节',
  '2025-05-01': '劳动节', '2025-05-02': '劳动节', '2025-05-03': '劳动节', '2025-05-04': '劳动节', '2025-05-05': '劳动节',
  '2025-06-02': '端午节',
  '2025-10-01': '国庆节', '2025-10-02': '国庆节', '2025-10-03': '国庆节',
  '2025-10-06': '国庆节', '2025-10-07': '国庆节',
};

// ── 交易日判断 ──

export function isTradingDay(dateStr: string): boolean {
  const date = new Date(dateStr);
  const dow = date.getDay();
  if (dow === 0 || dow === 6) return false; // 周末
  if (HOLIDAYS[dateStr]) return false; // 节假日
  return true;
}

export function getTradingDayInfo(dateStr: string): TradingDayInfo {
  const date = new Date(dateStr);
  const trading = isTradingDay(dateStr);
  const dow = date.getDay();

  // 查找前后交易日
  let nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + 1);
  while (!isTradingDay(formatDate(nextDate))) {
    nextDate.setDate(nextDate.getDate() + 1);
  }

  let prevDate = new Date(date);
  prevDate.setDate(prevDate.getDate() - 1);
  while (!isTradingDay(formatDate(prevDate))) {
    prevDate.setDate(prevDate.getDate() - 1);
  }

  // 年内交易日计数
  const yearStart = new Date(date.getFullYear(), 0, 1);
  let tradingDays = 0;
  const cursor = new Date(yearStart);
  while (cursor <= date) {
    if (isTradingDay(formatDate(cursor))) tradingDays++;
    cursor.setDate(cursor.getDate() + 1);
  }

  // 年内剩余交易日
  const yearEnd = new Date(date.getFullYear(), 11, 31);
  let remaining = 0;
  const cursor2 = new Date(date);
  cursor2.setDate(cursor2.getDate() + 1);
  while (cursor2 <= yearEnd) {
    if (isTradingDay(formatDate(cursor2))) remaining++;
    cursor2.setDate(cursor2.getDate() + 1);
  }

  return {
    date: dateStr,
    isTradingDay: trading,
    dayOfWeek: dow,
    isHalfDay: false,
    holidayName: HOLIDAYS[dateStr],
    nextTradingDay: formatDate(nextDate),
    prevTradingDay: formatDate(prevDate),
    tradingDayOfYear: tradingDays,
    tradingDaysRemaining: remaining,
  };
}

// ── 除权除息计算 ──

export function calculateExDividend(info: {
  prevClose: number;
  cashDividend: number;
  stockDividend: number;
  capitalReserveTransfer: number; // 资本公积转增
}): ExDividendInfo['adjustedPrice'] {
  const { prevClose, cashDividend, stockDividend, capitalReserveTransfer } = info;
  const totalNewShares = stockDividend + capitalReserveTransfer;
  const adjusted = totalNewShares > 0
    ? (prevClose - cashDividend) / (1 + totalNewShares)
    : prevClose - cashDividend;
  return roundTo(adjusted, 2);
}

// ── 涨跌停计算 ──

export function calculatePriceLimit(info: Omit<PriceLimitInfo, 'upperLimit' | 'lowerLimit'>): PriceLimitInfo {
  let ratio = 0.1; // 默认10%
  if (info.isST) ratio = 0.05;
  if (info.is新股) ratio = 0.44; // 新股首日
  if (info.is科创板 || info.is北交所) ratio = info.is新股 ? 0.6 : 0.2;

  return {
    ...info,
    upperLimit: roundTo(info.prevClose * (1 + ratio), 2),
    lowerLimit: roundTo(info.prevClose * (1 - ratio), 2),
  };
}

// ── T+1结算 ──

export function calculateSettlement(tradeDate: string): TradeSettlementInfo {
  let settlementDate = new Date(tradeDate);
  settlementDate.setDate(settlementDate.getDate() + 1);
  while (!isTradingDay(formatDate(settlementDate))) {
    settlementDate.setDate(settlementDate.getDate() + 1);
  }

  let fundDate = new Date(settlementDate);
  fundDate.setDate(fundDate.getDate() + 1);
  while (!isTradingDay(formatDate(fundDate))) {
    fundDate.setDate(fundDate.getDate() + 1);
  }

  return {
    tradeDate,
    settlementDate: formatDate(settlementDate),
    isT1: true,
    canSell: true,
    fundAvailable: formatDate(fundDate),
  };
}

// ── 交易日列表 ──

export function getTradingDays(startDate: string, endDate: string): string[] {
  const days: string[] = [];
  const current = new Date(startDate);
  const end = new Date(endDate);

  while (current <= end) {
    const dateStr = formatDate(current);
    if (isTradingDay(dateStr)) days.push(dateStr);
    current.setDate(current.getDate() + 1);
  }

  return days;
}

export function countTradingDays(startDate: string, endDate: string): number {
  return getTradingDays(startDate, endDate).length;
}

export function getNthTradingDay(startDate: string, n: number): string {
  let current = new Date(startDate);
  let count = 0;

  while (count < Math.abs(n)) {
    current.setDate(current.getDate() + (n > 0 ? 1 : -1));
    if (isTradingDay(formatDate(current))) count++;
  }

  return formatDate(current);
}

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
