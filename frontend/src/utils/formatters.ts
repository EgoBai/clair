/**
 * 统一的格式化工具
 * 集中管理所有格式化函数，消除重复代码
 */

/**
 * 格式化数字
 * @param num 要格式化的数字
 * @param decimals 小数位数，默认为2
 * @returns 格式化后的字符串
 */
export const formatNumber = (num: number, decimals: number = 2): string => {
  return num.toLocaleString('zh-CN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
};

/**
 * 格式化市值
 * @param cap 市值（单位：元）
 * @returns 格式化后的市值字符串
 */
export const formatMarketCap = (cap: number | null | undefined): string => {
  if (cap === null || cap === undefined || isNaN(cap)) return '--';
  if (cap >= 1e12) return `${(cap / 1e12).toFixed(2)}万亿`;
  if (cap >= 1e8) return `${(cap / 1e8).toFixed(2)}亿`;
  if (cap >= 1e4) return `${(cap / 1e4).toFixed(2)}万`;
  return cap.toFixed(2);
};

/**
 * 格式化成交量
 * @param vol 成交量（单位：手）
 * @returns 格式化后的成交量字符串
 */
export const formatVolume = (vol: number): string => {
  if (vol >= 1e8) return `${(vol / 1e8).toFixed(2)}亿手`;
  if (vol >= 1e4) return `${(vol / 1e4).toFixed(2)}万手`;
  return `${vol}手`;
};

/**
 * 格式化成交额
 * @param turnover 成交额（单位：元）
 * @returns 格式化后的成交额字符串
 */
export const formatTurnover = (turnover: number): string => {
  if (turnover >= 1e8) return `${(turnover / 1e8).toFixed(2)}亿`;
  if (turnover >= 1e4) return `${(turnover / 1e4).toFixed(2)}万`;
  return turnover.toString();
};

/**
 * 格式化百分比
 * @param percent 百分比数值（如0.15表示15%）
 * @param decimals 小数位数，默认为2
 * @returns 格式化后的百分比字符串
 */
export const formatPercent = (percent: number, decimals: number = 2): string => {
  return `${(percent * 100).toFixed(decimals)}%`;
};

/**
 * 格式化日期
 * @param date 日期对象或日期字符串或数字时间戳
 * @param format 格式字符串，默认为'yyyy-MM-dd'
 * @returns 格式化后的日期字符串
 */
export const formatDate = (date: Date | string | number | null | undefined, format: string = 'yyyy-MM-dd'): string => {
  if (date === null || date === undefined) return '--';
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '--';
  
  const pad = (n: number) => n.toString().padStart(2, '0');
  
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  const seconds = pad(d.getSeconds());
  
  return format
    .replace('yyyy', year.toString())
    .replace('MM', month)
    .replace('dd', day)
    .replace('HH', hours)
    .replace('mm', minutes)
    .replace('ss', seconds);
};

/**
 * 格式化货币
 * @param amount 金额
 * @param currency 货币代码，默认为'CNY'
 * @returns 格式化后的货币字符串
 */
export const formatCurrency = (amount: number, currency: string = 'CNY'): string => {
  const formatter = new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  
  return formatter.format(amount);
};

/**
 * 格式化时间间隔
 * @param milliseconds 毫秒数
 * @returns 格式化后的时间间隔字符串
 */
export const formatDuration = (milliseconds: number): string => {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}天${hours % 24}小时`;
  if (hours > 0) return `${hours}小时${minutes % 60}分钟`;
  if (minutes > 0) return `${minutes}分钟${seconds % 60}秒`;
  return `${seconds}秒`;
};

/**
 * 格式化文件大小
 * @param bytes 字节数
 * @returns 格式化后的文件大小字符串
 */
export const formatFileSize = (bytes: number): string => {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(2)} ${units[unitIndex]}`;
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
 * 格式化日期时间
 */
export const formatDateTime = (date: Date | string | number): string => {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '-';
  return `${formatDate(date)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/**
 * 格式化大数字（千分位）
 */
export const formatLargeNumber = (num: number): string => {
  if (num === null || num === undefined || isNaN(num)) return '-';
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
 * 格式化PE/PB等估值指标
 */
export const formatRatio = (value?: number | null): string => {
  if (value === undefined || value === null) return '-';
  if (value < 0) return `亏损`;
  return value.toFixed(2);
};

/**
 * 计算相对时间
 * 5分钟内显示 "刚刚"，1小时内显示 "x分钟前"，否则显示日期
 */
export const formatRelativeTime = (date: Date | string | number): string => {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '-';
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

// Recharts-compatible formatter wrappers
export const rechartsFormatters = {
  price: (value: number): [string, string] => [formatCurrency(value), '价格'],
  percent: (value: number): [string, string] => [formatPercent(value), '百分比'],
  number: (value: number): [string, string] => [formatNumber(value), '数值'],
  volume: (value: number): [string, string] => [formatVolume(value), '成交量'],
};
