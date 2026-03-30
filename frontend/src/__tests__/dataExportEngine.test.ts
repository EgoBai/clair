import { describe, it, expect } from 'vitest';

// 数据导出引擎
interface ExportColumn {
  key: string;
  label: string;
  format?: 'number' | 'currency' | 'percent' | 'date' | 'text';
  decimals?: number;
  prefix?: string;
  suffix?: string;
}

interface ExportConfig {
  columns: ExportColumn[];
  filename: string;
  encoding: 'utf-8' | 'gbk';
  includeHeader: boolean;
  dateFormat: string;
}

class DataExportEngine {
  static formatValue(value: any, column: ExportColumn): string {
    if (value === null || value === undefined) return '';
    switch (column.format) {
      case 'number': return Number(value).toFixed(column.decimals ?? 2);
      case 'currency': return `${column.prefix || '¥'}${Number(value).toFixed(column.decimals ?? 2)}`;
      case 'percent': return `${(Number(value) * 100).toFixed(column.decimals ?? 2)}%`;
      case 'date': return this.formatDate(value, column.suffix || 'YYYY-MM-DD');
      default: return String(value);
    }
  }

  static formatDate(date: any, format: string): string {
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';
    return format
      .replace('YYYY', String(d.getFullYear()))
      .replace('MM', String(d.getMonth() + 1).padStart(2, '0'))
      .replace('DD', String(d.getDate()).padStart(2, '0'))
      .replace('HH', String(d.getHours()).padStart(2, '0'))
      .replace('mm', String(d.getMinutes()).padStart(2, '0'))
      .replace('ss', String(d.getSeconds()).padStart(2, '0'));
  }

  static toCSV(data: Record<string, any>[], config: ExportConfig): string {
    const lines: string[] = [];
    if (config.includeHeader) {
      lines.push(config.columns.map(c => this.escapeCSV(c.label)).join(','));
    }
    for (const row of data) {
      const values = config.columns.map(c => this.escapeCSV(this.formatValue(row[c.key], c)));
      lines.push(values.join(','));
    }
    return lines.join('\n');
  }

  static escapeCSV(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  static toJSON(data: Record<string, any>[], config: ExportConfig): string {
    const formatted = data.map(row => {
      const obj: Record<string, any> = {};
      for (const col of config.columns) {
        obj[col.label] = this.formatValue(row[col.key], col);
      }
      return obj;
    });
    return JSON.stringify(formatted, null, 2);
  }

  static toMarkdown(data: Record<string, any>[], config: ExportConfig): string {
    const lines: string[] = [];
    const headers = config.columns.map(c => c.label);
    lines.push('| ' + headers.join(' | ') + ' |');
    lines.push('| ' + headers.map(() => '---').join(' | ') + ' |');
    for (const row of data) {
      const values = config.columns.map(c => this.formatValue(row[c.key], c));
      lines.push('| ' + values.join(' | ') + ' |');
    }
    return lines.join('\n');
  }

  static toHTML(data: Record<string, any>[], config: ExportConfig): string {
    const lines: string[] = ['<table>', '<thead><tr>'];
    for (const col of config.columns) {
      lines.push(`<th>${this.escapeHTML(col.label)}</th>`);
    }
    lines.push('</tr></thead><tbody>');
    for (const row of data) {
      lines.push('<tr>');
      for (const col of config.columns) {
        lines.push(`<td>${this.escapeHTML(this.formatValue(row[col.key], col))}</td>`);
      }
      lines.push('</tr>');
    }
    lines.push('</tbody></table>');
    return lines.join('\n');
  }

  static escapeHTML(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  static generateFilename(base: string, format: string, timestamp: boolean = true): string {
    const ts = timestamp ? `_${this.formatDate(new Date(), 'YYYYMMDD_HHmmss')}` : '';
    return `${base}${ts}.${format}`;
  }

  static calcFileSize(content: string, encoding: 'utf-8' | 'gbk' = 'utf-8'): number {
    if (encoding === 'utf-8') return new Blob([content]).size;
    return content.length * 2;
  }

  static splitLargeExport(data: Record<string, any>[], config: ExportConfig, maxRows: number = 10000): string[] {
    const chunks: string[] = [];
    for (let i = 0; i < data.length; i += maxRows) {
      chunks.push(this.toCSV(data.slice(i, i + maxRows), config));
    }
    return chunks;
  }

  static validateExportData(data: Record<string, any>[], columns: ExportColumn[]): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (data.length === 0) errors.push('导出数据为空');
    for (const col of columns) {
      const missing = data.filter(row => !(col.key in row)).length;
      if (missing > 0) errors.push(`${col.key}: ${missing}条记录缺少此字段`);
    }
    return { valid: errors.length === 0, errors };
  }

  static toTSV(data: Record<string, any>[], config: ExportConfig): string {
    const lines: string[] = [];
    if (config.includeHeader) {
      lines.push(config.columns.map(c => c.label).join('\t'));
    }
    for (const row of data) {
      const values = config.columns.map(c => this.formatValue(row[c.key], c));
      lines.push(values.join('\t'));
    }
    return lines.join('\n');
  }
}

describe('数据导出引擎', () => {
  const columns: ExportColumn[] = [
    { key: 'code', label: '代码', format: 'text' },
    { key: 'name', label: '名称', format: 'text' },
    { key: 'price', label: '价格', format: 'number', decimals: 2 },
    { key: 'change', label: '涨跌幅', format: 'percent', decimals: 2 },
    { key: 'amount', label: '成交额', format: 'currency', decimals: 0 },
  ];
  const config: ExportConfig = {
    columns, filename: 'export', encoding: 'utf-8', includeHeader: true, dateFormat: 'YYYY-MM-DD',
  };
  const data = [
    { code: '600519', name: '贵州茅台', price: 1800.50, change: 0.025, amount: 5000000000 },
    { code: '000858', name: '五粮液', price: 150.30, change: -0.012, amount: 3000000000 },
  ];

  describe('值格式化', () => {
    it('应该格式化数字', () => {
      expect(DataExportEngine.formatValue(123.456, { key: 'x', label: 'X', format: 'number', decimals: 2 })).toBe('123.46');
    });
    it('应该格式化货币', () => {
      expect(DataExportEngine.formatValue(1000, { key: 'x', label: 'X', format: 'currency' })).toBe('¥1000.00');
    });
    it('应该格式化百分比', () => {
      expect(DataExportEngine.formatValue(0.025, { key: 'x', label: 'X', format: 'percent' })).toBe('2.50%');
    });
    it('应该处理null', () => {
      expect(DataExportEngine.formatValue(null, { key: 'x', label: 'X', format: 'text' })).toBe('');
    });
  });

  describe('CSV导出', () => {
    it('应该生成CSV', () => {
      const csv = DataExportEngine.toCSV(data, config);
      expect(csv).toContain('代码,名称,价格,涨跌幅,成交额');
      expect(csv).toContain('600519');
    });
    it('应该转义特殊字符', () => {
      const csv = DataExportEngine.toCSV([{ code: 'a,b', name: '"test"', price: 1, change: 0, amount: 0 }], config);
      expect(csv).toContain('"a,b"');
      expect(csv).toContain('"""test"""');
    });
    it('应该支持无表头', () => {
      const csv = DataExportEngine.toCSV(data, { ...config, includeHeader: false });
      expect(csv).not.toContain('代码');
    });
  });

  describe('JSON导出', () => {
    it('应该生成JSON', () => {
      const json = DataExportEngine.toJSON(data, config);
      const parsed = JSON.parse(json);
      expect(parsed).toHaveLength(2);
      expect(parsed[0]['代码']).toBe('600519');
    });
  });

  describe('Markdown导出', () => {
    it('应该生成Markdown表格', () => {
      const md = DataExportEngine.toMarkdown(data, config);
      expect(md).toContain('| 代码 | 名称 |');
      expect(md).toContain('| --- | --- |');
      expect(md).toContain('| 600519 |');
    });
  });

  describe('HTML导出', () => {
    it('应该生成HTML表格', () => {
      const html = DataExportEngine.toHTML(data, config);
      expect(html).toContain('<table>');
      expect(html).toContain('<th>代码</th>');
      expect(html).toContain('<td>600519</td>');
    });
    it('应该转义HTML', () => {
      const html = DataExportEngine.toHTML([{ code: '<script>', name: 'test', price: 1, change: 0, amount: 0 }], config);
      expect(html).toContain('&lt;script&gt;');
    });
  });

  describe('文件名生成', () => {
    it('应该生成带时间戳的文件名', () => {
      const name = DataExportEngine.generateFilename('stocks', 'csv');
      expect(name).toMatch(/stocks_\d{8}_\d{6}\.csv/);
    });
    it('应该生成不带时间戳的文件名', () => {
      expect(DataExportEngine.generateFilename('stocks', 'csv', false)).toBe('stocks.csv');
    });
  });

  describe('大文件拆分', () => {
    it('应该拆分大数据', () => {
      const bigData = Array(25).fill(data[0]);
      const chunks = DataExportEngine.splitLargeExport(bigData, config, 10);
      expect(chunks).toHaveLength(3);
    });
  });

  describe('数据验证', () => {
    it('应该验证有效数据', () => {
      expect(DataExportEngine.validateExportData(data, columns).valid).toBe(true);
    });
    it('应该拒绝空数据', () => {
      expect(DataExportEngine.validateExportData([], columns).valid).toBe(false);
    });
  });

  describe('TSV导出', () => {
    it('应该生成TSV', () => {
      const tsv = DataExportEngine.toTSV(data, config);
      expect(tsv).toContain('代码\t名称');
      expect(tsv).toContain('600519\t贵州茅台');
    });
  });

  describe('日期格式化', () => {
    it('应该格式化日期', () => {
      const d = DataExportEngine.formatDate('2026-03-24T10:30:00', 'YYYY-MM-DD HH:mm:ss');
      expect(d).toContain('2026-03-24');
      expect(d).toContain('10:30:00');
    });
    it('应该处理无效日期', () => {
      expect(DataExportEngine.formatDate('invalid', 'YYYY-MM-DD')).toBe('');
    });
  });
});
