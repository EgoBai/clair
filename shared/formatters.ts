/**
 * 金融数据格式化工具函数
 * 统一管理所有数字、金额、成交量的显示格式
 *
 * 空值口径（P2 F1–F5）：
 * - null / undefined / NaN / ±Infinity 一律返回 EMPTY_VALUE（'—'）
 * - 市值不可能为负，负市值同样返回 EMPTY_VALUE（仅改显示，不动数据层）
 * - 有效数字保持原有精度与单位（万亿 / 亿 / 万 / 手 / %）
 */

/**
 * 空值与非法数值的统一占位符
 * 与页面既有空态一致（IndexDetailPage 等 90+ 处使用 '—'）
 */
export const EMPTY_VALUE = '—';

/**
 * 是否为可参与格式化的有限数字
 * null / undefined / NaN / ±Infinity 都视为「无有效数值」
 */
const isFiniteNumber = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/**
 * 格式化数字（带千分位）
 */
export const formatNumber = (num: number | null | undefined, decimals: number = 2): string => {
  if (!isFiniteNumber(num)) return EMPTY_VALUE;
  return num.toLocaleString('zh-CN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
};

/**
 * 格式化市值
 * 万亿 → 亿 → 万
 */
export const formatMarketCap = (cap?: number | null): string => {
  if (!isFiniteNumber(cap) || cap < 0) return EMPTY_VALUE;
  if (cap >= 1e12) return `${(cap / 1e12).toFixed(2)}万亿`;
  if (cap >= 1e8) return `${(cap / 1e8).toFixed(2)}亿`;
  if (cap >= 1e4) return `${(cap / 1e4).toFixed(2)}万`;
  return cap.toFixed(2);
};

/**
 * 格式化成交量
 */
export const formatVolume = (vol?: number | null): string => {
  if (!isFiniteNumber(vol)) return EMPTY_VALUE;
  if (vol >= 1e8) return `${(vol / 1e8).toFixed(2)}亿手`;
  if (vol >= 1e4) return `${(vol / 1e4).toFixed(2)}万手`;
  return `${vol}手`;
};

/**
 * 格式化成交额
 */
export const formatTurnover = (turnover?: number | null): string => {
  if (!isFiniteNumber(turnover)) return EMPTY_VALUE;
  if (turnover >= 1e8) return `${(turnover / 1e8).toFixed(2)}亿`;
  if (turnover >= 1e4) return `${(turnover / 1e4).toFixed(2)}万`;
  return turnover.toString();
};

/**
 * 格式化涨跌幅（带符号）
 */
export const formatChangePercent = (percent?: number | null): string => {
  if (!isFiniteNumber(percent)) return EMPTY_VALUE;
  const sign = percent >= 0 ? '+' : '';
  return `${sign}${percent.toFixed(2)}%`;
};

/**
 * 格式化涨跌额（带符号）
 */
export const formatChange = (change?: number | null): string => {
  if (!isFiniteNumber(change)) return EMPTY_VALUE;
  const sign = change >= 0 ? '+' : '';
  return `${sign}${change.toFixed(2)}`;
};

/**
 * 格式化换手率
 */
export const formatTurnoverRate = (rate?: number | null): string => {
  if (!isFiniteNumber(rate)) return EMPTY_VALUE;
  return `${rate.toFixed(2)}%`;
};

/**
 * 格式化价格
 */
export const formatPrice = (price?: number | null): string => {
  if (!isFiniteNumber(price)) return EMPTY_VALUE;
  return price.toFixed(2);
};

/**
 * 获取涨跌颜色类名
 */
export const getChangeColor = (value?: number | null): 'positive' | 'negative' | 'neutral' => {
  if (value === undefined || value === null || value === 0) return 'neutral';
  return value > 0 ? 'positive' : 'negative';
};

/**
 * 获取涨跌颜色（hex）
 */
export const getChangeHexColor = (value?: number | null): string => {
  if (value === undefined || value === null || value === 0) return '#6B7280';
  return value > 0 ? '#EF4444' : '#22C55E';
};

/**
 * 格式化股票代码显示
 * 000001.SZ → 000001
 */
export const formatSymbol = (symbol: string): string => {
  return symbol.replace(/\.(SZ|SH|BJ)$/, '');
};

/**
 * 判断市场
 */
export const getMarketLabel = (market: string): string => {
  const map: Record<string, string> = {
    SH: '上海',
    SZ: '深圳',
    BJ: '北京',
  };
  return map[market] || market;
};

/**
 * 格式化日期
 */
export const formatDate = (date: Date | string | number): string => {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return EMPTY_VALUE;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

/**
 * 格式化日期时间
 */
export const formatDateTime = (date: Date | string | number): string => {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return EMPTY_VALUE;
  return `${formatDate(date)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/**
 * 格式化大数字（千分位）
 */
export const formatLargeNumber = (num: number | null | undefined): string => {
  if (!isFiniteNumber(num)) return EMPTY_VALUE;
  return num.toLocaleString('en-US');
};

/**
 * 获取涨跌颜色（hex）
 * A股红涨绿跌
 */
export const getColorByChange = (value?: number | null): string => {
  if (value === undefined || value === null || value === 0) return '#6b7280';
  return value > 0 ? '#ef4444' : '#22c55e';
};

/**
 * 获取涨跌文字（带符号，2位小数）
 * @deprecated 使用 formatChange 替代
 */
export const getChangeText = formatChange;

/**
 * 判断市场颜色
 */
export const getMarketColor = (market: string): string => {
  const map: Record<string, string> = {
    SH: 'blue',
    SZ: 'green',
    BJ: 'orange',
  };
  return map[market] || 'default';
};

/**
 * 格式化百分比（通用）
 */
export const formatPercent = (value?: number | null, decimals = 2): string => {
  if (!isFiniteNumber(value)) return EMPTY_VALUE;
  return `${value.toFixed(decimals)}%`;
};

/**
 * 格式化PE/PB等估值指标
 */
export const formatRatio = (value?: number | null): string => {
  if (!isFiniteNumber(value)) return EMPTY_VALUE;
  if (value < 0) return `亏损`;
  return value.toFixed(2);
};

/**
 * 计算相对时间
 * 5分钟内显示 "刚刚"，1小时内显示 "x分钟前"，否则显示日期
 */
export const formatRelativeTime = (date: Date | string | number): string => {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return EMPTY_VALUE;
  const now = Date.now();
  const diff = now - d.getTime();
  if (diff < 5 * 60 * 1000) return '刚刚';
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)}小时前`;
  return formatDate(d);
};

/**
 * 判断涨跌方向
 * @returns 1 = 涨, -1 = 跌, 0 = 平
 */
export const getChangeDirection = (value?: number | null): 1 | -1 | 0 => {
  if (value === undefined || value === null || value === 0) return 0;
  return value > 0 ? 1 : -1;
};
