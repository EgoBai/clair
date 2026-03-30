/**
 * 数据导出工具
 * 支持导出为 CSV / JSON / 格式化文本
 * 可扩展 Excel (xlsx) 和 PDF
 */

interface ExportColumn {
  key: string;
  label: string;
  format?: (value: any) => string;
}

interface ExportOptions {
  filename?: string;
  columns?: ExportColumn[];
  encoding?: string;
  includeHeader?: boolean;
  dateFormat?: 'iso' | 'locale' | 'short';
}

/**
 * 导出为 CSV
 */
export function exportToCSV(data: Record<string, any>[], options: ExportOptions = {}): void {
  const {
    filename = `export_${formatDateForFile()}`,
    columns,
    encoding = 'utf-8',
    includeHeader = true,
  } = options;

  if (!data.length) {
    console.warn('导出数据为空');
    return;
  }

  const cols = columns || Object.keys(data[0]).map(key => ({ key, label: key }));
  const lines: string[] = [];

  // BOM 头（Excel 中文兼容）
  const bom = encoding === 'utf-8' ? '\uFEFF' : '';

  // 表头
  if (includeHeader) {
    lines.push(cols.map(c => escapeCSV(c.label)).join(','));
  }

  // 数据行
  for (const row of data) {
    const values = cols.map(c => {
      let val = row[c.key];
      if (c.format) {
        val = c.format(val);
      } else if (val === null || val === undefined) {
        val = '';
      } else if (typeof val === 'number') {
        val = String(val);
      }
      return escapeCSV(String(val));
    });
    lines.push(values.join(','));
  }

  const content = bom + lines.join('\n');
  downloadFile(content, `${filename}.csv`, 'text/csv;charset=utf-8');
}

/**
 * 导出为 JSON
 */
export function exportToJSON(data: any[], options: ExportOptions = {}): void {
  const { filename = `export_${formatDateForFile()}` } = options;
  const content = JSON.stringify(data, null, 2);
  downloadFile(content, `${filename}.json`, 'application/json');
}

/**
 * 导出为格式化文本表格
 */
export function exportToText(data: Record<string, any>[], options: ExportOptions = {}): void {
  const { filename = `export_${formatDateForFile()}`, columns } = options;

  if (!data.length) return;

  const cols = columns || Object.keys(data[0]).map(key => ({ key, label: key }));

  // 计算每列最大宽度
  const widths = cols.map(c => {
    const headerWidth = c.label.length;
    const dataWidth = Math.max(...data.map(row => {
      const val = c.format ? c.format(row[c.key]) : String(row[c.key] ?? '');
      return val.length;
    }));
    return Math.max(headerWidth, dataWidth, 6);
  });

  const pad = (str: string, width: number) => str.padEnd(width, ' ');
  const separator = widths.map(w => '-'.repeat(w)).join('-+-');
  const lines: string[] = [];

  // 表头
  lines.push(cols.map((c, i) => pad(c.label, widths[i])).join(' | '));
  lines.push(separator);

  // 数据
  for (const row of data) {
    const values = cols.map((c, i) => {
      const val = c.format ? c.format(row[c.key]) : String(row[c.key] ?? '-');
      return pad(val, widths[i]);
    });
    lines.push(values.join(' | '));
  }

  downloadFile(lines.join('\n'), `${filename}.txt`, 'text/plain');
}

/**
 * 股票数据专用导出列定义
 */
export const STOCK_EXPORT_COLUMNS: ExportColumn[] = [
  { key: 'symbol', label: '股票代码' },
  { key: 'name', label: '股票名称' },
  { key: 'price', label: '最新价', format: v => v?.toFixed(2) ?? '' },
  { key: 'changePercent', label: '涨跌幅(%)', format: v => v != null ? `${v >= 0 ? '+' : ''}${v.toFixed(2)}` : '' },
  { key: 'change', label: '涨跌额', format: v => v?.toFixed(2) ?? '' },
  { key: 'volume', label: '成交量', format: v => formatVolume(v) },
  { key: 'turnover', label: '成交额', format: v => formatTurnover(v) },
  { key: 'turnoverRate', label: '换手率(%)', format: v => v?.toFixed(2) ?? '' },
  { key: 'peRatio', label: '市盈率', format: v => v?.toFixed(2) ?? '-' },
  { key: 'pbRatio', label: '市净率', format: v => v?.toFixed(2) ?? '-' },
  { key: 'marketCap', label: '总市值', format: v => formatTurnover(v) },
  { key: 'industry', label: '行业' },
];

/**
 * K线数据导出列
 */
export const KLINE_EXPORT_COLUMNS: ExportColumn[] = [
  { key: 'tradeDate', label: '日期' },
  { key: 'open', label: '开盘价', format: v => v?.toFixed(2) ?? '' },
  { key: 'high', label: '最高价', format: v => v?.toFixed(2) ?? '' },
  { key: 'low', label: '最低价', format: v => v?.toFixed(2) ?? '' },
  { key: 'close', label: '收盘价', format: v => v?.toFixed(2) ?? '' },
  { key: 'volume', label: '成交量', format: v => formatVolume(v) },
  { key: 'turnover', label: '成交额', format: v => formatTurnover(v) },
];

/**
 * 回测结果导出列
 */
export const BACKTEST_EXPORT_COLUMNS: ExportColumn[] = [
  { key: 'date', label: '日期' },
  { key: 'type', label: '操作', format: v => v === 'buy' ? '买入' : '卖出' },
  { key: 'price', label: '价格', format: v => v?.toFixed(2) ?? '' },
  { key: 'quantity', label: '数量' },
  { key: 'amount', label: '金额', format: v => v?.toFixed(2) ?? '' },
  { key: 'commission', label: '手续费', format: v => v?.toFixed(2) ?? '' },
  { key: 'reason', label: '原因' },
];

// ==================== 工具函数 ====================

function escapeCSV(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

function formatDateForFile(): string {
  return new Date().toISOString().split('T')[0].replace(/-/g, '');
}

function formatVolume(v: number): string {
  if (!v) return '';
  if (v >= 1e8) return (v / 1e8).toFixed(2) + '亿';
  if (v >= 1e4) return (v / 1e4).toFixed(0) + '万';
  return v.toString();
}

function formatTurnover(v: number): string {
  if (!v) return '';
  if (v >= 1e8) return (v / 1e8).toFixed(2) + '亿';
  if (v >= 1e4) return (v / 1e4).toFixed(0) + '万';
  return v.toFixed(2);
}

function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export { formatVolume, formatTurnover };
