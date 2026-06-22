import { describe, it, expect } from 'vitest';

// Data Export/Import & Serialization Utilities
interface ExportOptions {
  format: 'csv' | 'json' | 'xlsx' | 'html';
  fields?: string[];
  headers?: Record<string, string>;
  delimiter?: string;
  includeHeader?: boolean;
  dateFormat?: string;
  numberFormat?: 'raw' | 'comma' | 'fixed';
}

interface TradeRecord {
  id: string;
  code: string;
  name: string;
  type: 'buy' | 'sell';
  price: number;
  quantity: number;
  amount: number;
  fee: number;
  date: string;
  status: 'filled' | 'partial' | 'cancelled';
}

function toCSV(data: Record<string, any>[], options: ExportOptions = { format: 'csv' }): string {
  const delimiter = options.delimiter || ',';
  const fields = options.fields || Object.keys(data[0] || {});
  const headers = options.headers || {};
  const lines: string[] = [];

  if (options.includeHeader !== false) {
    lines.push(fields.map(f => headers[f] || f).join(delimiter));
  }

  for (const row of data) {
    const values = fields.map(f => {
      const val = row[f];
      if (val === null || val === undefined) return '';
      if (typeof val === 'string' && (val.includes(delimiter) || val.includes('"') || val.includes('\n'))) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return String(val);
    });
    lines.push(values.join(delimiter));
  }

  return lines.join('\n');
}

function parseCSV(content: string, delimiter = ','): Record<string, string>[] {
  const lines = content.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];

  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (inQuotes) {
        if (char === '"' && line[i + 1] === '"') {
          current += '"';
          i++;
        } else if (char === '"') {
          inQuotes = false;
        } else {
          current += char;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === delimiter) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseCSVLine(lines[0]);
  const data: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] || '';
    });
    data.push(row);
  }

  return data;
}

function toJSON(data: any, pretty = false): string {
  return pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
}

function toHTMLTable(data: Record<string, any>[], options: ExportOptions = { format: 'html' }): string {
  const fields = options.fields || Object.keys(data[0] || {});
  const headers = options.headers || {};

  let html = '<table class="export-table"><thead><tr>';
  for (const f of fields) {
    html += `<th>${headers[f] || f}</th>`;
  }
  html += '</tr></thead><tbody>';

  for (const row of data) {
    html += '<tr>';
    for (const f of fields) {
      const val = row[f] ?? '';
      html += `<td>${String(val).replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td>`;
    }
    html += '</tr>';
  }
  html += '</tbody></table>';
  return html;
}

function formatNumber(value: number, format: 'raw' | 'comma' | 'fixed' | 'compact' = 'raw', decimals = 2): string {
  switch (format) {
    case 'raw': return String(value);
    case 'comma': return value.toLocaleString('zh-CN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    case 'fixed': return value.toFixed(decimals);
    case 'compact':
      if (Math.abs(value) >= 1e12) return (value / 1e12).toFixed(decimals) + '万亿';
      if (Math.abs(value) >= 1e8) return (value / 1e8).toFixed(decimals) + '亿';
      if (Math.abs(value) >= 1e4) return (value / 1e4).toFixed(decimals) + '万';
      return value.toFixed(decimals);
    default: return String(value);
  }
}

function exportTrades(trades: TradeRecord[], options: ExportOptions): string {
  const fields = options.fields || ['date', 'code', 'name', 'type', 'price', 'quantity', 'amount', 'fee', 'status'];
  const headers: Record<string, string> = {
    date: '日期', code: '代码', name: '名称', type: '方向',
    price: '价格', quantity: '数量', amount: '金额', fee: '手续费', status: '状态',
    ...options.headers,
  };

  const formatted = trades.map(t => ({
    ...t,
    type: t.type === 'buy' ? '买入' : '卖出',
    price: formatNumber(t.price, options.numberFormat || 'fixed'),
    amount: formatNumber(t.amount, options.numberFormat || 'comma'),
    fee: formatNumber(t.fee, options.numberFormat || 'fixed'),
    status: { filled: '已成交', partial: '部分成交', cancelled: '已撤销' }[t.status],
  }));

  switch (options.format) {
    case 'csv': return toCSV(formatted, { ...options, fields, headers });
    case 'json': return toJSON(formatted, true);
    case 'html': return toHTMLTable(formatted, { ...options, fields, headers });
    default: return toJSON(formatted);
  }
}

function validateImportData(data: Record<string, any>[], requiredFields: string[]): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!Array.isArray(data)) return { valid: false, errors: ['数据格式错误：非数组'] };
  if (data.length === 0) return { valid: false, errors: ['数据为空'] };

  for (let i = 0; i < Math.min(data.length, 100); i++) {
    for (const field of requiredFields) {
      if (data[i][field] === undefined || data[i][field] === null || data[i][field] === '') {
        errors.push(`第${i + 1}行：缺少必填字段 "${field}"`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

function generateReportSummary(trades: TradeRecord[]): {
  totalTrades: number;
  totalBuyAmount: number;
  totalSellAmount: number;
  totalFees: number;
  netAmount: number;
  avgPrice: number;
  winRate: number;
  profitLoss: number;
} {
  const buyTrades = trades.filter(t => t.type === 'buy' && t.status === 'filled');
  const sellTrades = trades.filter(t => t.type === 'sell' && t.status === 'filled');

  const totalBuyAmount = buyTrades.reduce((s, t) => s + t.amount, 0);
  const totalSellAmount = sellTrades.reduce((s, t) => s + t.amount, 0);
  const totalFees = trades.reduce((s, t) => s + t.fee, 0);

  // Simple win rate: sells above avg buy price
  const avgBuyPrice = buyTrades.length > 0
    ? buyTrades.reduce((s, t) => s + t.price, 0) / buyTrades.length
    : 0;
  const winningSells = sellTrades.filter(t => t.price >= avgBuyPrice);
  const winRate = sellTrades.length > 0 ? winningSells.length / sellTrades.length : 0;

  return {
    totalTrades: trades.filter(t => t.status === 'filled').length,
    totalBuyAmount: Math.round(totalBuyAmount * 100) / 100,
    totalSellAmount: Math.round(totalSellAmount * 100) / 100,
    totalFees: Math.round(totalFees * 100) / 100,
    netAmount: Math.round((totalSellAmount - totalBuyAmount) * 100) / 100,
    avgPrice: Math.round(avgBuyPrice * 100) / 100,
    winRate: Math.round(winRate * 10000) / 10000,
    profitLoss: Math.round((totalSellAmount - totalBuyAmount - totalFees) * 100) / 100,
  };
}

const sampleTrades: TradeRecord[] = [
  { id: '1', code: '600519', name: '贵州茅台', type: 'buy', price: 1700, quantity: 100, amount: 170000, fee: 17, date: '2024-01-15', status: 'filled' },
  { id: '2', code: '600519', name: '贵州茅台', type: 'buy', price: 1750, quantity: 100, amount: 175000, fee: 17.5, date: '2024-02-01', status: 'filled' },
  { id: '3', code: '600519', name: '贵州茅台', type: 'sell', price: 1800, quantity: 200, amount: 360000, fee: 36, date: '2024-03-01', status: 'filled' },
  { id: '4', code: '000858', name: '五粮液', type: 'buy', price: 150, quantity: 500, amount: 75000, fee: 7.5, date: '2024-01-20', status: 'filled' },
  { id: '5', code: '000858', name: '五粮液', type: 'sell', price: 140, quantity: 500, amount: 70000, fee: 7, date: '2024-02-15', status: 'filled' },
  { id: '6', code: '300750', name: '宁德时代', type: 'buy', price: 200, quantity: 200, amount: 40000, fee: 4, date: '2024-03-10', status: 'cancelled' },
];

describe('Data Export/Import', () => {
  describe('CSV Export', () => {
    it('should export basic CSV', () => {
      const csv = toCSV([{ name: 'test', value: 100 }]);
      expect(csv).toContain('name');
      expect(csv).toContain('value');
      expect(csv).toContain('test');
      expect(csv).toContain('100');
    });

    it('should use custom delimiter', () => {
      const csv = toCSV([{ a: 1, b: 2 }], { format: 'csv', delimiter: ';' });
      expect(csv).toContain(';');
    });

    it('should quote values with delimiter', () => {
      const csv = toCSV([{ name: 'hello,world', value: 1 }], { format: 'csv' });
      expect(csv).toContain('"hello,world"');
    });

    it('should handle null values', () => {
      const csv = toCSV([{ name: null, value: undefined }]);
      const lines = csv.split('\n');
      expect(lines[1]).toBe(',');
    });

    it('should skip header when disabled', () => {
      const csv = toCSV([{ a: 1 }], { format: 'csv', includeHeader: false });
      expect(csv).toBe('1');
    });

    it('should use custom headers', () => {
      const csv = toCSV([{ code: '600000' }], { format: 'csv', headers: { code: '股票代码' } });
      expect(csv).toContain('股票代码');
    });
  });

  describe('CSV Parsing', () => {
    it('should parse CSV with headers', () => {
      const csv = 'name,value\ntest,100\nfoo,200';
      const data = parseCSV(csv);
      expect(data).toHaveLength(2);
      expect(data[0].name).toBe('test');
      expect(data[0].value).toBe('100');
    });

    it('should handle quoted values', () => {
      const csv = 'name,value\n"hello, world",100';
      const data = parseCSV(csv);
      expect(data[0].name).toBe('hello, world');
    });

    it('should handle escaped quotes', () => {
      const csv = 'name\n"say ""hello"""';
      const data = parseCSV(csv);
      expect(data[0].name).toBe('say "hello"');
    });

    it('should return empty for headers only', () => {
      expect(parseCSV('a,b')).toHaveLength(0);
    });

    it('should handle custom delimiter', () => {
      const csv = 'name;value\ntest;100';
      const data = parseCSV(csv, ';');
      expect(data[0].name).toBe('test');
    });
  });

  describe('JSON Export', () => {
    it('should export compact JSON', () => {
      const json = toJSON({ a: 1, b: 2 });
      expect(JSON.parse(json)).toEqual({ a: 1, b: 2 });
    });

    it('should export pretty JSON', () => {
      const json = toJSON({ a: 1 }, true);
      expect(json).toContain('\n');
      expect(json).toContain('  ');
    });
  });

  describe('HTML Table Export', () => {
    it('should generate valid HTML table', () => {
      const html = toHTMLTable([{ name: 'test', value: 100 }]);
      expect(html).toContain('<table');
      expect(html).toContain('<thead>');
      expect(html).toContain('<tbody>');
      expect(html).toContain('test');
      expect(html).toContain('100');
    });

    it('should escape HTML entities', () => {
      const html = toHTMLTable([{ name: '<script>alert(1)</script>' }]);
      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
    });

    it('should use custom headers', () => {
      const html = toHTMLTable([{ code: '600000' }], { format: 'html', headers: { code: '股票代码' } });
      expect(html).toContain('股票代码');
    });
  });

  describe('Number Formatting', () => {
    it('should format raw', () => {
      expect(formatNumber(1234.56, 'raw')).toBe('1234.56');
    });

    it('should format with commas', () => {
      expect(formatNumber(1234567, 'comma')).toContain(',');
    });

    it('should format fixed', () => {
      expect(formatNumber(123.456, 'fixed')).toBe('123.46');
    });

    it('should format compact', () => {
      expect(formatNumber(15000, 'compact')).toContain('万');
      expect(formatNumber(150000000, 'compact')).toContain('亿');
      expect(formatNumber(1500000000000, 'compact')).toContain('万亿');
    });
  });

  describe('Trade Export', () => {
    it('should export trades as CSV', () => {
      const csv = exportTrades(sampleTrades, { format: 'csv' });
      expect(csv).toContain('日期');
      expect(csv).toContain('贵州茅台');
      expect(csv).toContain('买入');
    });

    it('should export trades as JSON', () => {
      const json = exportTrades(sampleTrades, { format: 'json' });
      const parsed = JSON.parse(json);
      expect(parsed).toHaveLength(sampleTrades.length);
    });

    it('should export trades as HTML', () => {
      const html = exportTrades(sampleTrades, { format: 'html' });
      expect(html).toContain('<table');
      expect(html).toContain('贵州茅台');
    });

    it('should select specific fields', () => {
      const csv = exportTrades(sampleTrades, { format: 'csv', fields: ['date', 'code', 'name'] });
      const lines = csv.split('\n');
      expect(lines[0]).toBe('日期,代码,名称');
    });
  });

  describe('Import Validation', () => {
    it('should validate complete data', () => {
      const result = validateImportData([{ code: '600000', name: 'test' }], ['code', 'name']);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing fields', () => {
      const result = validateImportData([{ code: '600000' }], ['code', 'name']);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should reject empty data', () => {
      const result = validateImportData([], ['code']);
      expect(result.valid).toBe(false);
    });

    it('should reject non-array', () => {
      const result = validateImportData('not array' as any, ['code']);
      expect(result.valid).toBe(false);
    });

    it('should detect empty string fields', () => {
      const result = validateImportData([{ code: '', name: 'test' }], ['code', 'name']);
      expect(result.valid).toBe(false);
    });
  });

  describe('Report Summary', () => {
    it('should compute trade summary', () => {
      const summary = generateReportSummary(sampleTrades);
      expect(summary.totalTrades).toBe(5); // excluding cancelled
      expect(summary.totalBuyAmount).toBeGreaterThan(0);
      expect(summary.totalSellAmount).toBeGreaterThan(0);
      expect(summary.totalFees).toBeGreaterThan(0);
    });

    it('should compute profit/loss', () => {
      const summary = generateReportSummary(sampleTrades);
      expect(typeof summary.profitLoss).toBe('number');
    });

    it('should handle empty trades', () => {
      const summary = generateReportSummary([]);
      expect(summary.totalTrades).toBe(0);
      expect(summary.winRate).toBe(0);
    });

    it('should exclude cancelled trades from count', () => {
      const summary = generateReportSummary(sampleTrades);
      expect(summary.totalTrades).toBeLessThan(sampleTrades.length);
    });
  });
});
