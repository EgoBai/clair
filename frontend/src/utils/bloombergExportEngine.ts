/**
 * Bloomberg Terminal-Style Data Export System
 * 支持 CSV/Excel/PDF/JSON 多格式导出
 * 自定义报表模板、定时导出、数据格式化和精度控制
 */

import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

// ==================== 类型定义 ====================

export type ExportFormat = 'csv' | 'xlsx' | 'pdf' | 'json' | 'tsv';

export type NumberPrecision = 0 | 1 | 2 | 3 | 4 | 6 | 8;

export interface ExportColumn {
  key: string;
  label: string;
  format?: (value: unknown) => string;
  width?: number;
  align?: 'left' | 'center' | 'right';
  precision?: NumberPrecision;
  type?: 'number' | 'currency' | 'percent' | 'date' | 'text';
}

export interface ExportOptions {
  format: ExportFormat;
  columns: ExportColumn[];
  filename: string;
  includeHeader: boolean;
  includeTimestamp: boolean;
  includeSummary: boolean;
  encoding: 'utf-8' | 'gbk';
  delimiter?: string;
  dateFormat?: string;
  precision?: NumberPrecision;
  sheetName?: string;
  title?: string;
  subtitle?: string;
  watermark?: string;
}

export interface ExportResult {
  content: string | Blob;
  filename: string;
  mimeType: string;
  size: number;
  rowCount: number;
  columnCount: number;
  format: ExportFormat;
}

export interface ReportTemplate {
  id: string;
  name: string;
  description: string;
  columns: ExportColumn[];
  filters?: Array<{ key: string; operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'startsWith' | 'endsWith'; value: unknown }>;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  groupBy?: string;
  aggregations?: Array<{ key: string; type: 'sum' | 'avg' | 'count' | 'min' | 'max' | 'median' | 'std' }>;
  dateRange?: { start?: string; end?: string };
  limit?: number;
}

export interface ScheduledExport {
  id: string;
  templateId: string;
  format: ExportFormat;
  schedule: 'daily' | 'weekly' | 'monthly' | 'custom';
  cronExpression?: string;
  recipients?: string[];
  enabled: boolean;
  lastRun?: Date;
  nextRun?: Date;
}

export interface ReportSummary {
  totalRows: number;
  groups: Array<{ key: string; count: number; aggregations: Record<string, number> }>;
  overall: Record<string, number>;
  generatedAt: string;
}

// ==================== 默认配置 ====================

const DEFAULT_OPTIONS: ExportOptions = {
  format: 'csv',
  columns: [],
  filename: 'export',
  includeHeader: true,
  includeTimestamp: true,
  includeSummary: false,
  encoding: 'utf-8',
  delimiter: ',',
  precision: 2,
  sheetName: 'Sheet1',
};

// ==================== 精度控制 ====================

export function formatWithPrecision(value: unknown, precision: NumberPrecision = 2): string {
  if (value === null || value === undefined) return '-';
  const num = Number(value);
  if (isNaN(num)) return String(value);
  return num.toFixed(precision);
}

// ==================== 高级格式化函数 ====================

export function formatNumber(value: unknown, precision: NumberPrecision = 2, locale: string = 'zh-CN'): string {
  if (value === null || value === undefined) return '-';
  const num = Number(value);
  if (isNaN(num)) return String(value);
  return num.toLocaleString(locale, {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  });
}

export function formatPercent(value: unknown, precision: NumberPrecision = 2): string {
  if (value === null || value === undefined) return '-';
  const num = Number(value);
  if (isNaN(num)) return '-';
  return `${(num * 100).toFixed(precision)}%`;
}

export function formatCurrency(value: unknown, currency: string = 'CNY', precision: NumberPrecision = 2): string {
  if (value === null || value === undefined) return '-';
  const num = Number(value);
  if (isNaN(num)) return '-';
  
  const symbols: Record<string, string> = {
    CNY: '¥',
    USD: '$',
    EUR: '€',
    GBP: '£',
    JPY: '¥',
  };
  
  const symbol = symbols[currency] || currency;
  
  if (currency === 'CNY') {
    if (Math.abs(num) >= 1e12) return `${symbol}${(num / 1e12).toFixed(precision)}万亿`;
    if (Math.abs(num) >= 1e8) return `${symbol}${(num / 1e8).toFixed(precision)}亿`;
    if (Math.abs(num) >= 1e4) return `${symbol}${(num / 1e4).toFixed(precision)}万`;
  }
  
  return `${symbol}${num.toFixed(precision)}`;
}

export function formatDate(value: unknown, format: string = 'YYYY-MM-DD'): string {
  if (!value) return '-';
  const date = value instanceof Date ? value : new Date(String(value));
  if (isNaN(date.getTime())) return String(value);

  const yyyy = date.getFullYear();
  const MM = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const HH = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');

  return format
    .replace('YYYY', String(yyyy))
    .replace('MM', MM)
    .replace('DD', dd)
    .replace('HH', HH)
    .replace('mm', mm)
    .replace('ss', ss);
}

// ==================== 股票专用格式化 ====================

export function formatChangePercent(value: unknown, precision: NumberPrecision = 2): string {
  if (value === null || value === undefined) return '-';
  const num = Number(value);
  if (isNaN(num)) return '-';
  const prefix = num > 0 ? '+' : '';
  return `${prefix}${num.toFixed(precision)}%`;
}

export function formatVolume(value: unknown): string {
  if (value === null || value === undefined) return '-';
  const num = Number(value);
  if (isNaN(num)) return '-';
  if (num >= 1e8) return `${(num / 1e8).toFixed(2)}亿`;
  if (num >= 1e4) return `${(num / 1e4).toFixed(2)}万`;
  return num.toString();
}

export function formatTurnover(value: unknown): string {
  if (value === null || value === undefined) return '-';
  const num = Number(value);
  if (isNaN(num)) return '-';
  if (num >= 1e12) return `${(num / 1e12).toFixed(2)}万亿`;
  if (num >= 1e8) return `${(num / 1e8).toFixed(2)}亿`;
  if (num >= 1e4) return `${(num / 1e4).toFixed(2)}万`;
  return num.toFixed(2);
}

export function formatPE(value: unknown, precision: NumberPrecision = 2): string {
  if (value === null || value === undefined) return '-';
  const num = Number(value);
  if (isNaN(num)) return '-';
  if (num < 0) return `亏损(${num.toFixed(precision)})`;
  return num.toFixed(precision);
}

export function formatMarketCap(value: unknown): string {
  if (value === null || value === undefined) return '-';
  const num = Number(value);
  if (isNaN(num)) return '-';
  if (num >= 1e12) return `${(num / 1e12).toFixed(2)}万亿`;
  if (num >= 1e8) return `${(num / 1e8).toFixed(2)}亿`;
  if (num >= 1e4) return `${(num / 1e4).toFixed(2)}万`;
  return num.toFixed(2);
}

// ==================== CSV/TSV 导出 ====================

export function escapeCSVValue(value: string, delimiter: string = ','): string {
  if (value.includes(delimiter) || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function exportToCSV(
  data: Record<string, unknown>[],
  options: Partial<ExportOptions> = {},
): ExportResult {
  const opts = { ...DEFAULT_OPTIONS, ...options, format: 'csv' as ExportFormat };
  const delimiter = opts.delimiter || ',';
  const lines: string[] = [];

  if (opts.title) {
    lines.push(opts.title);
    lines.push('');
  }

  if (opts.includeHeader) {
    const headers = opts.columns.map(c => escapeCSVValue(c.label, delimiter));
    lines.push(headers.join(delimiter));
  }

  for (const row of data) {
    const values = opts.columns.map(col => {
      let value = row[col.key];
      if (col.format) {
        value = col.format(value);
      } else {
        value = value !== null && value !== undefined ? String(value) : '';
      }
      return escapeCSVValue(String(value), delimiter);
    });
    lines.push(values.join(delimiter));
  }

  if (opts.includeTimestamp) {
    lines.push('');
    lines.push(`# 导出时间: ${formatDate(new Date(), 'YYYY-MM-DD HH:mm:ss')}`);
    lines.push(`# 数据行数: ${data.length}`);
  }

  const content = lines.join('\n');
  const bom = opts.encoding === 'utf-8' ? '\uFEFF' : '';

  return {
    content: bom + content,
    filename: `${opts.filename}.csv`,
    mimeType: 'text/csv;charset=utf-8',
    size: new Blob([bom + content]).size,
    rowCount: data.length,
    columnCount: opts.columns.length,
    format: 'csv',
  };
}

export function exportToTSV(
  data: Record<string, unknown>[],
  options: Partial<ExportOptions> = {},
): ExportResult {
  return exportToCSV(data, { ...options, delimiter: '\t', filename: options.filename || 'export' });
}

// ==================== Excel 导出 ====================

export function exportToExcel(
  data: Record<string, unknown>[],
  options: Partial<ExportOptions> = {},
): ExportResult {
  const opts = { ...DEFAULT_OPTIONS, ...options, format: 'xlsx' as ExportFormat };
  
  // 创建工作簿
  const wb = XLSX.utils.book_new();
  
  // 准备数据
  const wsData: unknown[][] = [];
  
  // 添加标题行
  if (opts.title) {
    wsData.push([opts.title]);
    wsData.push([]);
  }
  
  // 添加表头
  if (opts.includeHeader) {
    wsData.push(opts.columns.map(c => c.label));
  }
  
  // 添加数据行
  for (const row of data) {
    const rowData = opts.columns.map(col => {
      const value = row[col.key];
      if (col.format) {
        return col.format(value);
      }
      return value ?? '';
    });
    wsData.push(rowData);
  }
  
  // 添加汇总
  if (opts.includeTimestamp) {
    wsData.push([]);
    wsData.push([`导出时间: ${formatDate(new Date(), 'YYYY-MM-DD HH:mm:ss')}`]);
    wsData.push([`数据行数: ${data.length}`]);
  }
  
  // 创建工作表
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  
  // 设置列宽
  const colWidths = opts.columns.map(col => ({
    wch: col.width || Math.max(col.label.length * 2, 12),
  }));
  ws['!cols'] = colWidths;
  
  // 如果有标题，合并单元格
  if (opts.title && opts.columns.length > 1) {
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: opts.columns.length - 1 } }];
  }
  
  // 添加工作表到工作簿
  XLSX.utils.book_append_sheet(wb, ws, opts.sheetName || 'Sheet1');
  
  // 生成文件
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  
  return {
    content: blob,
    filename: `${opts.filename}.xlsx`,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    size: blob.size,
    rowCount: data.length,
    columnCount: opts.columns.length,
    format: 'xlsx',
  };
}

// ==================== JSON 导出 ====================

export function exportToJSON(
  data: Record<string, unknown>[],
  options: Partial<ExportOptions> = {},
): ExportResult {
  const opts = { ...DEFAULT_OPTIONS, ...options, format: 'json' as ExportFormat };

  let exportData: Record<string, unknown>[] = data;

  if (opts.columns.length > 0) {
    exportData = data.map(row => {
      const filtered: Record<string, unknown> = {};
      for (const col of opts.columns) {
        filtered[col.key] = col.format ? col.format(row[col.key]) : row[col.key];
      }
      return filtered;
    });
  }

  const wrapper: Record<string, unknown> = {
    data: exportData,
    metadata: {
      rowCount: data.length,
      columnCount: opts.columns.length,
      generatedAt: new Date().toISOString(),
    },
  };

  if (opts.includeTimestamp) {
    wrapper.exportTime = formatDate(new Date(), 'YYYY-MM-DD HH:mm:ss');
    wrapper.rowCount = data.length;
  }

  if (opts.title) {
    wrapper.title = opts.title;
  }

  const content = JSON.stringify(wrapper, null, 2);

  return {
    content,
    filename: `${opts.filename}.json`,
    mimeType: 'application/json',
    size: new Blob([content]).size,
    rowCount: data.length,
    columnCount: opts.columns.length,
    format: 'json',
  };
}

// ==================== PDF/HTML 导出 ====================

export function exportToHTML(
  data: Record<string, unknown>[],
  options: Partial<ExportOptions> = {},
): ExportResult {
  const opts = { ...DEFAULT_OPTIONS, ...options, format: 'pdf' as ExportFormat };
  const lines: string[] = [];

  lines.push('<!DOCTYPE html>');
  lines.push('<html lang="zh-CN">');
  lines.push('<head>');
  lines.push('<meta charset="utf-8">');
  lines.push(`<title>${opts.filename}</title>`);
  lines.push('<style>');
  lines.push(`
    body { 
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      padding: 20px;
      margin: 0;
    }
    h1 { font-size: 18px; margin-bottom: 8px; }
    h2 { font-size: 14px; color: #666; margin-bottom: 16px; }
    table { 
      width: 100%; 
      border-collapse: collapse; 
      font-size: 12px;
      margin-bottom: 20px;
    }
    th { 
      background: #f5f7fa; 
      padding: 10px 12px; 
      text-align: left; 
      border: 1px solid #e4e7ed;
      font-weight: 600;
    }
    td { 
      padding: 8px 12px; 
      border: 1px solid #e4e7ed;
    }
    .positive { color: #f5222d; }
    .negative { color: #52c41a; }
    .neutral { color: #666; }
    .right { text-align: right; }
    .center { text-align: center; }
    .footer { 
      margin-top: 20px; 
      font-size: 11px; 
      color: #999;
      border-top: 1px solid #eee;
      padding-top: 10px;
    }
    .summary {
      background: #fafafa;
      padding: 12px;
      border-radius: 4px;
      margin-bottom: 16px;
    }
    @media print { 
      body { padding: 0; }
      .no-print { display: none; }
    }
  `);
  lines.push('</style>');
  lines.push('</head>');
  lines.push('<body>');

  if (opts.title) {
    lines.push(`<h1>${opts.title}</h1>`);
  }
  if (opts.subtitle) {
    lines.push(`<h2>${opts.subtitle}</h2>`);
  }

  lines.push('<table>');
  lines.push('<thead><tr>');
  opts.columns.forEach(col => {
    const align = col.align || 'left';
    lines.push(`<th style="text-align:${align}">${col.label}</th>`);
  });
  lines.push('</tr></thead>');

  lines.push('<tbody>');
  for (const row of data) {
    lines.push('<tr>');
    opts.columns.forEach(col => {
      let value = row[col.key];
      if (col.format) value = col.format(value);
      else value = value !== null && value !== undefined ? String(value) : '-';
      
      const strValue = String(value).replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const align = col.align || 'left';
      
      // 涨跌颜色
      let colorClass = '';
      if (strValue.startsWith('+')) colorClass = 'positive';
      else if (strValue.startsWith('-') && !strValue.startsWith('-0.00')) colorClass = 'negative';
      
      lines.push(`<td style="text-align:${align}" class="${colorClass}">${strValue}</td>`);
    });
    lines.push('</tr>');
  }
  lines.push('</tbody>');
  lines.push('</table>');

  if (opts.includeSummary) {
    lines.push('<div class="summary">');
    lines.push(`<strong>数据统计:</strong> 共 ${data.length} 条记录`);
    lines.push('</div>');
  }

  if (opts.includeTimestamp) {
    lines.push('<div class="footer">');
    lines.push(`导出时间: ${formatDate(new Date(), 'YYYY-MM-DD HH:mm:ss')} | A股行情分析平台`);
    lines.push('</div>');
  }

  lines.push('</body>');
  lines.push('</html>');

  const content = lines.join('\n');

  return {
    content,
    filename: `${opts.filename}.html`,
    mimeType: 'text/html',
    size: new Blob([content]).size,
    rowCount: data.length,
    columnCount: opts.columns.length,
    format: 'pdf',
  };
}

// ==================== 通用导出函数 ====================

export function exportData(
  data: Record<string, unknown>[],
  options: Partial<ExportOptions> = {},
): ExportResult {
  const format = options.format || 'csv';

  switch (format) {
    case 'csv': return exportToCSV(data, options);
    case 'xlsx': return exportToExcel(data, options);
    case 'json': return exportToJSON(data, options);
    case 'tsv': return exportToTSV(data, options);
    case 'pdf': return exportToHTML(data, options);
    default: return exportToCSV(data, options);
  }
}

// ==================== 文件下载 ====================

export function downloadExport(result: ExportResult): void {
  if (result.content instanceof Blob) {
    saveAs(result.content, result.filename);
  } else {
    const blob = new Blob([result.content], { type: result.mimeType });
    saveAs(blob, result.filename);
  }
}

export function downloadFile(content: string | Blob, filename: string, mimeType: string): void {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
  saveAs(blob, filename);
}

// ==================== 数据处理 ====================

export function filterData(
  data: Record<string, unknown>[],
  filters: ReportTemplate['filters'] = [],
): Record<string, unknown>[] {
  return data.filter(row => {
    return filters.every(f => {
      const value = row[f.key];
      switch (f.operator) {
        case 'eq': return value === f.value;
        case 'neq': return value !== f.value;
        case 'gt': return Number(value) > Number(f.value);
        case 'gte': return Number(value) >= Number(f.value);
        case 'lt': return Number(value) < Number(f.value);
        case 'lte': return Number(value) <= Number(f.value);
        case 'contains': return String(value).includes(String(f.value));
        case 'startsWith': return String(value).startsWith(String(f.value));
        case 'endsWith': return String(value).endsWith(String(f.value));
        default: return true;
      }
    });
  });
}

export function sortData(
  data: Record<string, unknown>[],
  key: string,
  order: 'asc' | 'desc' = 'asc',
): Record<string, unknown>[] {
  return [...data].sort((a, b) => {
    const va = a[key];
    const vb = b[key];
    if (va === vb) return 0;

    let comparison: number;
    if (typeof va === 'number' && typeof vb === 'number') {
      comparison = va - vb;
    } else {
      comparison = String(va).localeCompare(String(vb), 'zh-CN');
    }

    return order === 'asc' ? comparison : -comparison;
  });
}

export function groupData(
  data: Record<string, unknown>[],
  groupBy: string,
): Map<string, Record<string, unknown>[]> {
  const groups = new Map<string, Record<string, unknown>[]>();

  for (const row of data) {
    const key = String(row[groupBy] ?? '未分组');
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(row);
  }

  return groups;
}

export function aggregateData(
  data: Record<string, unknown>[],
  aggregations: ReportTemplate['aggregations'] = [],
): Record<string, number> {
  const result: Record<string, number> = {};

  for (const agg of aggregations) {
    const values = data.map(r => Number(r[agg.key]) || 0).filter(v => !isNaN(v));

    switch (agg.type) {
      case 'sum':
        result[`${agg.key}_sum`] = Math.round(values.reduce((a, b) => a + b, 0) * 100) / 100;
        break;
      case 'avg':
        result[`${agg.key}_avg`] = values.length > 0
          ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100
          : 0;
        break;
      case 'count':
        result[`${agg.key}_count`] = values.filter(v => v !== 0).length;
        break;
      case 'min':
        result[`${agg.key}_min`] = values.length > 0 ? Math.round(Math.min(...values) * 100) / 100 : 0;
        break;
      case 'max':
        result[`${agg.key}_max`] = values.length > 0 ? Math.round(Math.max(...values) * 100) / 100 : 0;
        break;
      case 'median':
        const sorted = [...values].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        result[`${agg.key}_median`] = sorted.length > 0
          ? (sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2)
          : 0;
        break;
      case 'std':
        const mean = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
        const squareDiffs = values.map(v => Math.pow(v - mean, 2));
        const avgSquareDiff = squareDiffs.length > 0 ? squareDiffs.reduce((a, b) => a + b, 0) / squareDiffs.length : 0;
        result[`${agg.key}_std`] = Math.round(Math.sqrt(avgSquareDiff) * 100) / 100;
        break;
    }
  }

  return result;
}

// ==================== 报告生成 ====================

export function generateReport(
  data: Record<string, unknown>[],
  template: ReportTemplate,
  format: ExportFormat = 'csv',
): { export: ExportResult; summary: ReportSummary } {
  // 过滤
  let processed = filterData(data, template.filters);

  // 排序
  if (template.sortBy) {
    processed = sortData(processed, template.sortBy, template.sortOrder || 'asc');
  }

  // 限制行数
  if (template.limit && template.limit > 0) {
    processed = processed.slice(0, template.limit);
  }

  // 分组和聚合
  const groups: ReportSummary['groups'] = [];
  const aggregations = template.aggregations || [];

  if (template.groupBy) {
    const groupMap = groupData(processed, template.groupBy);
    for (const [key, rows] of groupMap) {
      groups.push({
        key,
        count: rows.length,
        aggregations: aggregateData(rows, aggregations),
      });
    }
  }

  const overall = aggregateData(processed, aggregations);

  const exportResult = exportData(processed, {
    format,
    columns: template.columns,
    filename: template.name,
    title: template.name,
    subtitle: template.description,
    includeSummary: true,
  });

  return {
    export: exportResult,
    summary: {
      totalRows: processed.length,
      groups,
      overall,
      generatedAt: new Date().toISOString(),
    },
  };
}

export function batchExport(
  reports: Array<{ data: Record<string, unknown>[]; template: ReportTemplate; format: ExportFormat }>,
): ExportResult[] {
  return reports.map(({ data, template, format }) => {
    const result = generateReport(data, template, format);
    return result.export;
  });
}

// ==================== 预定义模板 ====================

export const STOCK_LIST_COLUMNS: ExportColumn[] = [
  { key: 'symbol', label: '股票代码', width: 12 },
  { key: 'name', label: '股票名称', width: 16 },
  { key: 'price', label: '最新价', format: v => formatNumber(v, 2), width: 10, align: 'right' },
  { key: 'changePercent', label: '涨跌幅(%)', format: v => formatChangePercent(v), width: 12, align: 'right' },
  { key: 'change', label: '涨跌额', format: v => formatNumber(v, 2), width: 10, align: 'right' },
  { key: 'volume', label: '成交量', format: v => formatVolume(v), width: 12, align: 'right' },
  { key: 'turnover', label: '成交额', format: v => formatTurnover(v), width: 14, align: 'right' },
  { key: 'turnoverRate', label: '换手率(%)', format: v => formatNumber(v, 2), width: 12, align: 'right' },
  { key: 'peRatio', label: '市盈率', format: v => formatPE(v), width: 10, align: 'right' },
  { key: 'pbRatio', label: '市净率', format: v => formatNumber(v, 2), width: 10, align: 'right' },
  { key: 'marketCap', label: '总市值', format: v => formatMarketCap(v), width: 14, align: 'right' },
  { key: 'industry', label: '行业', width: 16 },
];

export const KLINE_COLUMNS: ExportColumn[] = [
  { key: 'tradeDate', label: '日期', width: 12 },
  { key: 'open', label: '开盘价', format: v => formatNumber(v, 2), width: 10, align: 'right' },
  { key: 'high', label: '最高价', format: v => formatNumber(v, 2), width: 10, align: 'right' },
  { key: 'low', label: '最低价', format: v => formatNumber(v, 2), width: 10, align: 'right' },
  { key: 'close', label: '收盘价', format: v => formatNumber(v, 2), width: 10, align: 'right' },
  { key: 'volume', label: '成交量', format: v => formatVolume(v), width: 12, align: 'right' },
  { key: 'turnover', label: '成交额', format: v => formatTurnover(v), width: 14, align: 'right' },
  { key: 'changePercent', label: '涨跌幅', format: v => formatChangePercent(v), width: 10, align: 'right' },
];

export const BACKTEST_COLUMNS: ExportColumn[] = [
  { key: 'date', label: '日期', width: 12 },
  { key: 'type', label: '操作', format: v => v === 'buy' ? '买入' : '卖出', width: 8 },
  { key: 'price', label: '价格', format: v => formatNumber(v, 2), width: 10, align: 'right' },
  { key: 'quantity', label: '数量', format: v => formatNumber(v, 0), width: 10, align: 'right' },
  { key: 'amount', label: '金额', format: v => formatTurnover(v), width: 14, align: 'right' },
  { key: 'commission', label: '手续费', format: v => formatNumber(v, 2), width: 10, align: 'right' },
  { key: 'reason', label: '原因', width: 20 },
];

export const FINANCIAL_COLUMNS: ExportColumn[] = [
  { key: 'reportDate', label: '报告期', width: 12 },
  { key: 'revenue', label: '营业收入', format: v => formatTurnover(v), width: 14, align: 'right' },
  { key: 'netProfit', label: '净利润', format: v => formatTurnover(v), width: 14, align: 'right' },
  { key: 'grossMargin', label: '毛利率(%)', format: v => formatNumber(v, 2), width: 12, align: 'right' },
  { key: 'netMargin', label: '净利率(%)', format: v => formatNumber(v, 2), width: 12, align: 'right' },
  { key: 'roe', label: 'ROE(%)', format: v => formatNumber(v, 2), width: 10, align: 'right' },
  { key: 'roa', label: 'ROA(%)', format: v => formatNumber(v, 2), width: 10, align: 'right' },
  { key: 'debtRatio', label: '资产负债率(%)', format: v => formatNumber(v, 2), width: 14, align: 'right' },
];

// ==================== 报告模板管理 ====================

const reportTemplates = new Map<string, ReportTemplate>();

export function registerReportTemplate(template: ReportTemplate): void {
  reportTemplates.set(template.id, template);
}

export function getReportTemplate(id: string): ReportTemplate | undefined {
  return reportTemplates.get(id);
}

export function getAllReportTemplates(): ReportTemplate[] {
  return Array.from(reportTemplates.values());
}

// ==================== 导出历史 ====================

export interface ExportHistoryItem {
  id: string;
  filename: string;
  format: ExportFormat;
  rowCount: number;
  timestamp: Date;
  templateId?: string;
}

const exportHistory: ExportHistoryItem[] = [];

export function addToHistory(item: ExportHistoryItem): void {
  exportHistory.push(item);
  // 限制历史记录数量
  if (exportHistory.length > 100) {
    exportHistory.shift();
  }
}

export function getExportHistory(): ExportHistoryItem[] {
  return [...exportHistory];
}

export function clearExportHistory(): void {
  exportHistory.length = 0;
}

// ==================== 导出工具函数 ====================

export {
  formatNumber as formatNum,
  formatPercent as formatPct,
  formatCurrency as formatCcy,
  formatDate as formatDt,
};
