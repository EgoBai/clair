/**
 * ChartTooltipFormatter - 图表工具提示格式化器
 * 统一处理各种图表的 tooltip 显示格式
 */

export interface OHLCVData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  change?: number;
  changePercent?: number;
}

export interface IndicatorData {
  name: string;
  value: number;
  color?: string;
}

export interface TooltipConfig {
  showVolume: boolean;
  showChange: boolean;
  showIndicators: boolean;
  decimalPlaces: number;
  volumeUnit: 'shares' | '万手' | '亿';
  dateFormat: 'YYYY-MM-DD' | 'MM-DD' | 'YYYY/MM/DD';
}

const DEFAULT_CONFIG: TooltipConfig = {
  showVolume: true,
  showChange: true,
  showIndicators: true,
  decimalPlaces: 2,
  volumeUnit: '万手',
  dateFormat: 'YYYY-MM-DD',
};

function formatNumber(num: number, decimals: number): string {
  return num.toFixed(decimals);
}

function formatVolume(volume: number, unit: string): string {
  switch (unit) {
    case '万手': return `${(volume / 10000).toFixed(2)}万手`;
    case '亿': return `${(volume / 100000000).toFixed(2)}亿`;
    default: return volume.toLocaleString();
  }
}

function formatDate(date: string, format: string): string {
  switch (format) {
    case 'MM-DD': return date.slice(5);
    case 'YYYY/MM/DD': return date.replace(/-/g, '/');
    default: return date;
  }
}

function getChangeColor(change: number): string {
  if (change > 0) return '#ef4444'; // 红涨
  if (change < 0) return '#22c55e'; // 绿跌
  return '#6b7280';
}

export function formatKlineTooltip(
  data: OHLCVData,
  indicators: IndicatorData[] = [],
  config: Partial<TooltipConfig> = {}
): string {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const lines: string[] = [];

  lines.push(formatDate(data.date, cfg.dateFormat));
  lines.push(`开: ${formatNumber(data.open, cfg.decimalPlaces)}`);
  lines.push(`高: ${formatNumber(data.high, cfg.decimalPlaces)}`);
  lines.push(`低: ${formatNumber(data.low, cfg.decimalPlaces)}`);
  lines.push(`收: ${formatNumber(data.close, cfg.decimalPlaces)}`);

  if (cfg.showVolume) {
    lines.push(`量: ${formatVolume(data.volume, cfg.volumeUnit)}`);
  }

  if (cfg.showChange && data.changePercent !== undefined) {
    const sign = data.changePercent >= 0 ? '+' : '';
    lines.push(`涨跌: ${sign}${formatNumber(data.changePercent, 2)}%`);
  }

  if (cfg.showIndicators && indicators.length > 0) {
    for (const ind of indicators) {
      lines.push(`${ind.name}: ${formatNumber(ind.value, cfg.decimalPlaces)}`);
    }
  }

  return lines.join('\n');
}

export function formatVolumeTooltip(
  date: string,
  volume: number,
  avgVolume: number,
  config: Partial<TooltipConfig> = {}
): string {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const ratio = avgVolume > 0 ? volume / avgVolume : 1;
  const lines = [
    formatDate(date, cfg.dateFormat),
    `成交量: ${formatVolume(volume, cfg.volumeUnit)}`,
    `均量比: ${ratio.toFixed(2)}x`,
  ];
  if (ratio > 2) lines.push('⚠️ 放量');
  else if (ratio < 0.5) lines.push('📌 缩量');
  return lines.join('\n');
}

export function formatIndicatorTooltip(
  date: string,
  indicators: IndicatorData[],
  config: Partial<TooltipConfig> = {}
): string {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const lines = [formatDate(date, cfg.dateFormat)];
  for (const ind of indicators) {
    lines.push(`${ind.name}: ${formatNumber(ind.value, cfg.decimalPlaces)}`);
  }
  return lines.join('\n');
}

export function formatComparisonTooltip(
  date: string,
  stocks: Array<{ name: string; price: number; change: number }>
): string {
  const lines = [date, '---'];
  for (const s of stocks) {
    const sign = s.change >= 0 ? '+' : '';
    lines.push(`${s.name}: ${s.price.toFixed(2)} (${sign}${s.change.toFixed(2)}%)`);
  }
  return lines.join('\n');
}
