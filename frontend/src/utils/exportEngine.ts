/**
 * 数据导出与报告引擎
 * 支持CSV/JSON/Excel格式导出、报告模板、批量导出、数据格式化
 */

// ==================== 类型定义 ====================

export type ExportFormat = 'csv' | 'json' | 'tsv' | 'html';

export interface ExportColumn {
  key: string;
  label: string;
  format?: (value: unknown) => string;
  width?: number;
  align?: 'left' | 'center' | 'right';
}

export interface ExportOptions {
  format: ExportFormat;
  columns: ExportColumn[];
  filename: string;
  includeHeader: boolean;
  includeTimestamp: boolean;
  encoding: 'utf-8' | 'gbk';
  delimiter?: string;
  dateFormat?: string;
}

export interface ExportResult {
  content: string;
  filename: string;
  mimeType: string;
  size: number;
  rowCount: number;
  columnCount: number;
}

export interface ReportTemplate {
  id: string;
  name: string;
  description: string;
  columns: ExportColumn[];
  filters?: Array<{ key: string; operator: 'eq' | 'gt' | 'lt' | 'contains'; value: unknown }>;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  groupBy?: string;
  aggregations?: Array<{ key: string; type: 'sum' | 'avg' | 'count' | 'min' | 'max' }>;
}

export interface ReportSummary {
  totalRows: number;
  groups: Array<{ key: string; count: number; aggregations: Record<string, number> }>;
  overall: Record<string, number>;
}

// ==================== 默认配置 ====================

const DEFAULT_OPTIONS: ExportOptions = {
  format: 'csv',
  columns: [],
  filename: 'export',
  includeHeader: true,
  includeTimestamp: true,
  encoding: 'utf-8',
  delimiter: ',',
};

// ==================== 格式化函数 ====================

/**
 * 格式化数值
 */
export function formatNumber(value: unknown, decimals: number = 2): string {
  if (value === null || value === undefined) return '-';
  const num = Number(value);
  if (isNaN(num)) return String(value);
  return num.toLocaleString('zh-CN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * 格式化百分比
 */
export function formatPercent(value: unknown, decimals: number = 2): string {
  if (value === null || value === undefined) return '-';
  const num = Number(value);
  if (isNaN(num)) return '-';
  return `${(num * 100).toFixed(decimals)}%`;
}

/**
 * 格式化金额
 */
export function formatCurrency(value: unknown, currency: string = 'CNY'): string {
  if (value === null || value === undefined) return '-';
  const num = Number(value);
  if (isNaN(num)) return '-';
  if (currency === 'CNY') {
    if (Math.abs(num) >= 1e12) return `¥${(num / 1e12).toFixed(2)}万亿`;
    if (Math.abs(num) >= 1e8) return `¥${(num / 1e8).toFixed(2)}亿`;
    if (Math.abs(num) >= 1e4) return `¥${(num / 1e4).toFixed(2)}万`;
    return `¥${num.toFixed(2)}`;
  }
  return `${currency} ${num.toFixed(2)}`;
}

/**
 * 格式化日期
 */
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

/**
 * 转义CSV值
 */
export function escapeCSVValue(value: string, delimiter: string = ','): string {
  if (value.includes(delimiter) || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// ==================== 导出函数 ====================

/**
 * 导出为CSV格式
 */
export function exportToCSV(
  data: Record<string, unknown>[],
  options: Partial<ExportOptions> = {},
): ExportResult {
  const opts = { ...DEFAULT_OPTIONS, ...options, format: 'csv' as ExportFormat };
  const delimiter = opts.delimiter || ',';
  const lines: string[] = [];

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

  return {
    content,
    filename: `${opts.filename}.csv`,
    mimeType: 'text/csv',
    size: new Blob([content]).size,
    rowCount: data.length,
    columnCount: opts.columns.length,
  };
}

/**
 * 导出为JSON格式
 */
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

  const wrapper: Record<string, unknown> = { data: exportData };

  if (opts.includeTimestamp) {
    wrapper.exportTime = formatDate(new Date(), 'YYYY-MM-DD HH:mm:ss');
    wrapper.rowCount = data.length;
  }

  const content = JSON.stringify(wrapper, null, 2);

  return {
    content,
    filename: `${opts.filename}.json`,
    mimeType: 'application/json',
    size: new Blob([content]).size,
    rowCount: data.length,
    columnCount: opts.columns.length,
  };
}

/**
 * 导出为TSV格式
 */
export function exportToTSV(
  data: Record<string, unknown>[],
  options: Partial<ExportOptions> = {},
): ExportResult {
  return exportToCSV(data, { ...options, delimiter: '\t', filename: options.filename || 'export' });
}

/**
 * 导出为HTML表格
 */
export function exportToHTML(
  data: Record<string, unknown>[],
  options: Partial<ExportOptions> = {},
): ExportResult {
  const opts = { ...DEFAULT_OPTIONS, ...options, format: 'html' as ExportFormat };
  const lines: string[] = [];

  lines.push('<table border="1" cellpadding="4" cellspacing="0" style="border-collapse:collapse;">');

  if (opts.includeHeader) {
    lines.push('<thead><tr>');
    opts.columns.forEach(col => {
      const align = col.align || 'left';
      lines.push(`<th style="text-align:${align}">${col.label}</th>`);
    });
    lines.push('</tr></thead>');
  }

  lines.push('<tbody>');
  for (const row of data) {
    lines.push('<tr>');
    opts.columns.forEach(col => {
      let value = row[col.key];
      if (col.format) value = col.format(value);
      else value = value !== null && value !== undefined ? String(value) : '-';
      const align = col.align || 'left';
      lines.push(`<td style="text-align:${align}">${String(value).replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td>`);
    });
    lines.push('</tr>');
  }
  lines.push('</tbody></table>');

  if (opts.includeTimestamp) {
    lines.push(`<p><small>导出时间: ${formatDate(new Date(), 'YYYY-MM-DD HH:mm:ss')} | 数据行数: ${data.length}</small></p>`);
  }

  const content = lines.join('\n');

  return {
    content,
    filename: `${opts.filename}.html`,
    mimeType: 'text/html',
    size: new Blob([content]).size,
    rowCount: data.length,
    columnCount: opts.columns.length,
  };
}

/**
 * 通用导出函数
 */
export function exportData(
  data: Record<string, unknown>[],
  options: Partial<ExportOptions> = {},
): ExportResult {
  const format = options.format || 'csv';

  switch (format) {
    case 'csv': return exportToCSV(data, options);
    case 'json': return exportToJSON(data, options);
    case 'tsv': return exportToTSV(data, options);
    case 'html': return exportToHTML(data, options);
    default: return exportToCSV(data, options);
  }
}

// ==================== 数据处理 ====================

/**
 * 过滤数据
 */
export function filterData(
  data: Record<string, unknown>[],
  filters: ReportTemplate['filters'] = [],
): Record<string, unknown>[] {
  return data.filter(row => {
    return filters.every(f => {
      const value = row[f.key];
      switch (f.operator) {
        case 'eq': return value === f.value;
        case 'gt': return Number(value) > Number(f.value);
        case 'lt': return Number(value) < Number(f.value);
        case 'contains': return String(value).includes(String(f.value));
        default: return true;
      }
    });
  });
}

/**
 * 排序数据
 */
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
      comparison = String(va).localeCompare(String(vb));
    }

    return order === 'asc' ? comparison : -comparison;
  });
}

/**
 * 分组数据
 */
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

/**
 * 聚合计算
 */
export function aggregateData(
  data: Record<string, unknown>[],
  aggregations: ReportTemplate['aggregations'] = [],
): Record<string, number> {
  const result: Record<string, number> = {};

  for (const agg of aggregations) {
    const values = data.map(r => Number(r[agg.key]) || 0);

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
        result[`${agg.key}_min`] = Math.round(Math.min(...values) * 100) / 100;
        break;
      case 'max':
        result[`${agg.key}_max`] = Math.round(Math.max(...values) * 100) / 100;
        break;
    }
  }

  return result;
}

// ==================== 报告生成 ====================

/**
 * 根据模板生成报告
 */
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
  });

  return {
    export: exportResult,
    summary: {
      totalRows: processed.length,
      groups,
      overall,
    },
  };
}

/**
 * 批量导出多个报告
 */
export function batchExport(
  reports: Array<{ data: Record<string, unknown>[]; template: ReportTemplate; format: ExportFormat }>,
): ExportResult[] {
  return reports.map(({ data, template, format }) => {
    const result = generateReport(data, template, format);
    return result.export;
  });
}

// ==================== 股票专用格式化 ====================

/**
 * 格式化涨跌幅
 */
export function formatChangePercent(value: unknown): string {
  if (value === null || value === undefined) return '-';
  const num = Number(value);
  if (isNaN(num)) return '-';
  const prefix = num > 0 ? '+' : '';
  return `${prefix}${num.toFixed(2)}%`;
}

/**
 * 格式化成交量
 */
export function formatVolume(value: unknown): string {
  if (value === null || value === undefined) return '-';
  const num = Number(value);
  if (isNaN(num)) return '-';
  if (num >= 1e8) return `${(num / 1e8).toFixed(2)}亿手`;
  if (num >= 1e4) return `${(num / 1e4).toFixed(2)}万手`;
  return `${num}手`;
}

/**
 * 格式化成交额
 */
export function formatTurnover(value: unknown): string {
  if (value === null || value === undefined) return '-';
  const num = Number(value);
  if (isNaN(num)) return '-';
  if (num >= 1e12) return `${(num / 1e12).toFixed(2)}万亿`;
  if (num >= 1e8) return `${(num / 1e8).toFixed(2)}亿`;
  if (num >= 1e4) return `${(num / 1e4).toFixed(2)}万`;
  return `${num.toFixed(2)}`;
}

/**
 * 格式化市值
 */
export function formatMarketCap(value: unknown): string {
  return formatTurnover(value);
}

/**
 * 格式化市盈率
 */
export function formatPE(value: unknown): string {
  if (value === null || value === undefined) return '-';
  const num = Number(value);
  if (isNaN(num)) return '-';
  if (num < 0) return `亏${Math.abs(num).toFixed(1)}`;
  return num.toFixed(2);
}
