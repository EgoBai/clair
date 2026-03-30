/**
 * Stock Data Formatter
 * 股票数据格式化 - 各种数值格式化工具
 */

export function formatPrice(value: number | null | undefined, decimals: number = 2): string {
  if (value === null || value === undefined || isNaN(value)) return '--';
  return value.toFixed(decimals);
}

export function formatVolume(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) return '--';
  if (value >= 1e8) return (value / 1e8).toFixed(2) + '亿';
  if (value >= 1e4) return (value / 1e4).toFixed(2) + '万';
  return value.toLocaleString();
}

export function formatAmount(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) return '--';
  if (value >= 1e12) return (value / 1e12).toFixed(2) + '万亿';
  if (value >= 1e8) return (value / 1e8).toFixed(2) + '亿';
  if (value >= 1e4) return (value / 1e4).toFixed(2) + '万';
  return value.toFixed(2);
}

export function formatPercent(value: number | null | undefined, decimals: number = 2): string {
  if (value === null || value === undefined || isNaN(value)) return '--';
  const sign = value >= 0 ? '+' : '';
  return sign + value.toFixed(decimals) + '%';
}

export function formatMarketCap(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) return '--';
  if (value >= 1e12) return (value / 1e12).toFixed(2) + '万亿';
  if (value >= 1e8) return (value / 1e8).toFixed(2) + '亿';
  return formatAmount(value);
}

export function formatChange(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) return '--';
  const sign = value >= 0 ? '+' : '';
  return sign + value.toFixed(2);
}

export function formatPE(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) return '--';
  if (value < 0) return '亏损';
  return value.toFixed(2);
}

export function formatPB(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) return '--';
  return value.toFixed(2);
}

export function formatTime(timestamp: number | string | null | undefined): string {
  if (!timestamp) return '--';
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) return '--';
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

export function formatDate(date: number | string | null | undefined): string {
  if (!date) return '--';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '--';
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

export function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}秒前`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}天前`;
  return formatDate(timestamp);
}

export function formatStockCode(code: string): string {
  if (!code) return '';
  // Normalize: remove prefix if present
  const cleaned = code.replace(/^(sh|sz|bj)/i, '').replace(/\./g, '');
  return cleaned.toUpperCase();
}

export function getChangeColorClass(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) return '';
  if (value > 0) return 'stock-up'; // red in China
  if (value < 0) return 'stock-down'; // green in China
  return 'stock-flat';
}

export function getChangeColor(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) return '#666';
  if (value > 0) return '#ef4444';
  if (value < 0) return '#22c55e';
  return '#666';
}
