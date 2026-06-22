import { describe, it, expect } from 'vitest';

// 数据导出/报告生成引擎
interface ExportConfig {
  format: 'csv' | 'json' | 'xlsx';
  fields: string[];
  headers: Record<string, string>;
  dateFormat: string;
  numberFormat: { decimal: number; thousandSeparator: string };
  filters?: Record<string, any>;
}

interface ExportResult {
  data: string | Buffer;
  filename: string;
  mimeType: string;
  size: number;
}

function formatNumber(value: number, decimal = 2, separator = ','): string {
  if (isNaN(value) || !isFinite(value)) return '0';
  const parts = value.toFixed(decimal).split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, separator);
  return parts.join('.');
}

function formatDate(timestamp: number | string, format = 'YYYY-MM-DD'): string {
  const d = typeof timestamp === 'number' ? new Date(timestamp) : new Date(timestamp);
  const yyyy = d.getFullYear();
  const MM = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const HH = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');

  return format
    .replace('YYYY', String(yyyy))
    .replace('MM', MM)
    .replace('DD', dd)
    .replace('HH', HH)
    .replace('mm', mm)
    .replace('ss', ss);
}

function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function arrayToCSV(data: Record<string, any>[], config: ExportConfig): string {
  const lines: string[] = [];

  // Header row
  if (config.fields.length > 0) {
    const headers = config.fields.map(f => escapeCSV(config.headers[f] || f));
    lines.push(headers.join(','));
  }

  // Data rows
  for (const row of data) {
    const values = config.fields.map(f => {
      const val = row[f];
      if (val === null || val === undefined) return '';
      if (typeof val === 'number') return formatNumber(val, config.numberFormat.decimal, config.numberFormat.thousandSeparator);
      if (typeof val === 'string' && /\d{4}-\d{2}-\d{2}/.test(val)) return formatDate(val, config.dateFormat);
      return escapeCSV(String(val));
    });
    lines.push(values.join(','));
  }

  return lines.join('\n');
}

function arrayToJSON(data: Record<string, any>[], config: ExportConfig): string {
  const filtered = data.map(row => {
    const obj: Record<string, any> = {};
    for (const f of config.fields) {
      obj[config.headers[f] || f] = row[f];
    }
    return obj;
  });
  return JSON.stringify(filtered, null, 2);
}

function generateReportSummary(data: Record<string, any>[], numericFields: string[]): Record<string, { sum: number; avg: number; min: number; max: number; count: number }> {
  const summary: Record<string, { sum: number; avg: number; min: number; max: number; count: number }> = {};

  for (const field of numericFields) {
    const values = data.map(r => r[field]).filter(v => typeof v === 'number' && !isNaN(v));
    if (values.length === 0) {
      summary[field] = { sum: 0, avg: 0, min: 0, max: 0, count: 0 };
      continue;
    }
    summary[field] = {
      sum: values.reduce((a, b) => a + b, 0),
      avg: values.reduce((a, b) => a + b, 0) / values.length,
      min: Math.min(...values),
      max: Math.max(...values),
      count: values.length,
    };
  }

  return summary;
}

describe('数据导出/报告生成', () => {
  describe('formatNumber', () => {
    it('应该正确格式化整数', () => {
      expect(formatNumber(1000000, 2)).toBe('1,000,000.00');
    });

    it('应该正确格式化小数', () => {
      expect(formatNumber(1234.5, 2)).toBe('1,234.50');
    });

    it('应该支持不同的小数位数', () => {
      expect(formatNumber(1234.5678, 0)).toBe('1,235');
      expect(formatNumber(1234.5678, 4)).toBe('1,234.5678');
    });

    it('应该支持不同的千分位分隔符', () => {
      expect(formatNumber(1000000, 2, '.')).toBe('1.000.000.00');
    });

    it('NaN应该返回0', () => {
      expect(formatNumber(NaN)).toBe('0');
    });

    it('Infinity应该返回0', () => {
      expect(formatNumber(Infinity)).toBe('0');
    });

    it('负数应该正确格式化', () => {
      expect(formatNumber(-1234.56, 2)).toBe('-1,234.56');
    });

    it('零应该正确处理', () => {
      expect(formatNumber(0, 2)).toBe('0.00');
    });

    it('小数应该正确处理', () => {
      expect(formatNumber(0.123, 3)).toBe('0.123');
    });
  });

  describe('formatDate', () => {
    it('应该格式化为默认格式', () => {
      const result = formatDate(new Date('2024-03-15T10:30:00').getTime());
      expect(result).toMatch(/^2024-03-15$/);
    });

    it('应该支持自定义格式', () => {
      const result = formatDate(new Date('2024-03-15T10:30:45').getTime(), 'YYYY/MM/DD HH:mm:ss');
      expect(result).toBe('2024/03/15 10:30:45');
    });

    it('应该支持字符串输入', () => {
      const result = formatDate('2024-06-01', 'MM-DD');
      expect(result).toBe('06-01');
    });

    it('应该支持全格式', () => {
      const result = formatDate(new Date('2024-01-05T08:09:07').getTime(), 'YYYY-MM-DD HH:mm:ss');
      expect(result).toBe('2024-01-05 08:09:07');
    });
  });

  describe('escapeCSV', () => {
    it('普通字符串不需要转义', () => {
      expect(escapeCSV('hello')).toBe('hello');
    });

    it('含逗号应该被引号包裹', () => {
      expect(escapeCSV('hello,world')).toBe('"hello,world"');
    });

    it('含引号应该被双引号转义', () => {
      expect(escapeCSV('say "hi"')).toBe('"say ""hi"""');
    });

    it('含换行应该被引号包裹', () => {
      expect(escapeCSV('line1\nline2')).toBe('"line1\nline2"');
    });

    it('空字符串不应该被包裹', () => {
      expect(escapeCSV('')).toBe('');
    });
  });

  describe('arrayToCSV', () => {
    const config: ExportConfig = {
      format: 'csv',
      fields: ['code', 'name', 'price', 'change'],
      headers: { code: '代码', name: '名称', price: '价格', change: '涨跌幅' },
      dateFormat: 'YYYY-MM-DD',
      numberFormat: { decimal: 2, thousandSeparator: ',' },
    };

    it('应该生成正确的CSV格式', () => {
      const data = [
        { code: '600000', name: '浦发银行', price: 10.5, change: 2.3 },
        { code: '000001', name: '平安银行', price: 15.2, change: -1.1 },
      ];
      const csv = arrayToCSV(data, config);
      const lines = csv.split('\n');
      expect(lines).toHaveLength(3); // 1 header + 2 data
      expect(lines[0]).toBe('代码,名称,价格,涨跌幅');
    });

    it('应该格式化数字', () => {
      const data = [{ code: '600000', name: 'test', price: 10000.5, change: 2.3 }];
      const csv = arrayToCSV(data, config);
      expect(csv).toContain('10,000.50');
    });

    it('空数据应该只返回header', () => {
      const csv = arrayToCSV([], config);
      expect(csv).toBe('代码,名称,价格,涨跌幅');
    });

    it('应该正确处理逗号分隔的值', () => {
      const data = [{ code: '600000', name: '浦发,银行', price: 10.5, change: 2.3 }];
      const csv = arrayToCSV(data, config);
      expect(csv).toContain('"浦发,银行"');
    });
  });

  describe('arrayToJSON', () => {
    it('应该生成有效的JSON', () => {
      const config: ExportConfig = {
        format: 'json',
        fields: ['code', 'name'],
        headers: { code: '代码', name: '名称' },
        dateFormat: 'YYYY-MM-DD',
        numberFormat: { decimal: 2, thousandSeparator: ',' },
      };
      const data = [{ code: '600000', name: '浦发银行', price: 10.5 }];
      const json = arrayToJSON(data, config);
      const parsed = JSON.parse(json);
      expect(parsed).toHaveLength(1);
      expect(parsed[0]).toHaveProperty('代码');
      expect(parsed[0]).toHaveProperty('名称');
      expect(parsed[0]).not.toHaveProperty('price');
    });

    it('应该使用中文header名', () => {
      const config: ExportConfig = {
        format: 'json',
        fields: ['code'],
        headers: { code: '股票代码' },
        dateFormat: 'YYYY-MM-DD',
        numberFormat: { decimal: 2, thousandSeparator: ',' },
      };
      const data = [{ code: '600000' }];
      const json = arrayToJSON(data, config);
      const parsed = JSON.parse(json);
      expect(parsed[0]['股票代码']).toBe('600000');
    });
  });

  describe('generateReportSummary', () => {
    it('应该计算正确的统计摘要', () => {
      const data = [
        { price: 10, volume: 1000 },
        { price: 20, volume: 2000 },
        { price: 30, volume: 3000 },
      ];
      const summary = generateReportSummary(data, ['price', 'volume']);
      expect(summary.price.sum).toBe(60);
      expect(summary.price.avg).toBe(20);
      expect(summary.price.min).toBe(10);
      expect(summary.price.max).toBe(30);
      expect(summary.price.count).toBe(3);
    });

    it('应该跳过非数字字段', () => {
      const data = [{ name: 'test', value: 10 }];
      const summary = generateReportSummary(data, ['value']);
      expect(summary.value.count).toBe(1);
    });

    it('空数据应该返回零值', () => {
      const summary = generateReportSummary([], ['price']);
      expect(summary.price.sum).toBe(0);
      expect(summary.price.count).toBe(0);
    });

    it('应该正确处理NaN值', () => {
      const data = [{ price: 10 }, { price: NaN }, { price: 30 }];
      const summary = generateReportSummary(data, ['price']);
      expect(summary.price.count).toBe(2);
      expect(summary.price.sum).toBe(40);
    });

    it('应该支持多个字段', () => {
      const data = [
        { a: 1, b: 10, c: 100 },
        { a: 2, b: 20, c: 200 },
      ];
      const summary = generateReportSummary(data, ['a', 'b', 'c']);
      expect(summary.a.avg).toBe(1.5);
      expect(summary.b.avg).toBe(15);
      expect(summary.c.avg).toBe(150);
    });
  });
});
