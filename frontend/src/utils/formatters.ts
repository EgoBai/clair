/**
 * 统一的格式化工具
 * 集中管理所有格式化函数，消除重复代码
 *
 * P2 F1–F5：数值格式化以 shared/formatters.ts 为唯一真源。
 * 与 shared 语义完全一致的函数直接 re-export；本文件只保留前端独有语义的函数
 * （formatPercent 的 ×100、formatDate 的模板、货币/时长/文件大小/Recharts 适配）。
 */

// rechartsFormatters 内部要调用这两个函数，故同时保留本地绑定
import { formatNumber, formatVolume } from '@shared/formatters';

export {
  formatNumber,
  formatMarketCap,
  formatVolume,
  formatTurnover,
  formatChangePercent,
  formatChange,
  formatTurnoverRate,
  formatRelativeTime,
  formatLargeNumber,
  formatRatio,
  getChangeColor,
  getChangeHexColor,
  formatSymbol,
  getMarketLabel,
  formatDateTime,
  getColorByChange,
  getChangeText,
  getMarketColor,
  getChangeDirection,
} from '@shared/formatters';

/**
 * 格式化百分比
 * 注意：本函数是「小数 → 百分比」语义（0.15 → '15.00%'），
 * 与 shared/formatters 的 formatPercent（入参已是百分数）不同，故不合并。
 * @param percent 百分比数值（如0.15表示15%）
 * @param decimals 小数位数，默认为2
 * @returns 格式化后的百分比字符串
 */
export const formatPercent = (percent: number, decimals: number = 2): string => {
  if (percent === null || percent === undefined || !Number.isFinite(percent)) return '—';
  return `${(percent * 100).toFixed(decimals)}%`;
};

/**
 * 格式化日期
 * 注意：本函数支持自定义格式模板，与 shared/formatters 的固定 yyyy-MM-dd 不同，故不合并。
 * @param date 日期对象或日期字符串或数字时间戳
 * @param format 格式字符串，默认为'yyyy-MM-dd'
 * @returns 格式化后的日期字符串
 */
export const formatDate = (date: Date | string | number | null | undefined, format: string = 'yyyy-MM-dd'): string => {
  if (date === null || date === undefined) return '—';
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '—';

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

// Recharts-compatible formatter wrappers
export const rechartsFormatters = {
  price: (value: number): [string, string] => [formatCurrency(value), '价格'],
  percent: (value: number): [string, string] => [formatPercent(value), '百分比'],
  number: (value: number): [string, string] => [formatNumber(value), '数值'],
  volume: (value: number): [string, string] => [formatVolume(value), '成交量'],
};
