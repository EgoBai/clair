/**
 * 金融数据格式化工具函数
 * 统一管理所有数字、金额、成交量的显示格式
 */

/**
 * 格式化数字（带千分位）
 */
export const formatNumber = (num: number, decimals: number = 2): string => {
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
  if (!cap && cap !== 0) return '-';
  if (cap >= 1e12) return `${(cap / 1e12).toFixed(2)}万亿`;
  if (cap >= 1e8) return `${(cap / 1e8).toFixed(2)}亿`;
  if (cap >= 1e4) return `${(cap / 1e4).toFixed(2)}万`;
  return cap.toString();
};

/**
 * 格式化成交量
 */
export const formatVolume = (vol?: number | null): string => {
  if (!vol && vol !== 0) return '-';
  if (vol >= 1e8) return `${(vol / 1e8).toFixed(2)}亿手`;
  if (vol >= 1e4) return `${(vol / 1e4).toFixed(2)}万手`;
  return `${vol}手`;
};

/**
 * 格式化成交额
 */
export const formatTurnover = (turnover?: number | null): string => {
  if (!turnover && turnover !== 0) return '-';
  if (turnover >= 1e8) return `${(turnover / 1e8).toFixed(2)}亿`;
  if (turnover >= 1e4) return `${(turnover / 1e4).toFixed(2)}万`;
  return turnover.toString();
};

/**
 * 格式化涨跌幅（带符号）
 */
export const formatChangePercent = (percent?: number | null): string => {
  if (percent === undefined || percent === null) return '-';
  const sign = percent >= 0 ? '+' : '';
  return `${sign}${percent.toFixed(2)}%`;
};

/**
 * 格式化涨跌额（带符号）
 */
export const formatChange = (change?: number | null): string => {
  if (change === undefined || change === null) return '-';
  const sign = change >= 0 ? '+' : '';
  return `${sign}${change.toFixed(2)}`;
};

/**
 * 格式化换手率
 */
export const formatTurnoverRate = (rate?: number | null): string => {
  if (rate === undefined || rate === null) return '-';
  return `${rate.toFixed(2)}%`;
};

/**
 * 格式化价格
 */
export const formatPrice = (price?: number | null): string => {
  if (price === undefined || price === null) return '-';
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
