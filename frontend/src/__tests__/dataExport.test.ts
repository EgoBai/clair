import { describe, it, expect } from 'vitest';
import { exportToCSV, exportToJSON, parseCSV } from '../services/dataExport';

const sampleData = [
  { code: '000001', name: '平安银行', price: 12.50, change: 2.5 },
  { code: '600519', name: '贵州茅台', price: 1800.00, change: -1.2 },
];

const columns = [
  { key: 'code', label: '股票代码' },
  { key: 'name', label: '股票名称' },
  { key: 'price', label: '价格', format: (v: unknown) => String(v) },
  { key: 'change', label: '涨跌幅', format: (v: unknown) => `${v}%` },
];

describe('exportToCSV', () => {
  it('should generate CSV with headers', () => {
    const csv = exportToCSV({ filename: 'test', columns, data: sampleData });
    const lines = csv.split('\n');
    expect(lines[0]).toBe('股票代码,股票名称,价格,涨跌幅');
  });

  it('should generate CSV rows', () => {
    const csv = exportToCSV({ filename: 'test', columns, data: sampleData });
    const lines = csv.split('\n');
    expect(lines).toHaveLength(3); // header + 2 rows
    expect(lines[1]).toContain('000001');
    expect(lines[1]).toContain('平安银行');
  });

  it('should escape CSV special characters', () => {
    const data = [{ text: 'hello, world', value: 1 }];
    const cols = [{ key: 'text', label: 'Text' }, { key: 'value', label: 'Value' }];
    const csv = exportToCSV({ filename: 'test', columns: cols, data });
    expect(csv).toContain('"hello, world"');
  });

  it('should escape quotes in CSV', () => {
    const data = [{ text: 'say "hello"', value: 1 }];
    const cols = [{ key: 'text', label: 'Text' }, { key: 'value', label: 'Value' }];
    const csv = exportToCSV({ filename: 'test', columns: cols, data });
    expect(csv).toContain('""hello""');
  });

  it('should apply formatters', () => {
    const csv = exportToCSV({ filename: 'test', columns, data: sampleData });
    expect(csv).toContain('2.5%');
    expect(csv).toContain('-1.2%');
  });

  it('should handle empty data', () => {
    const csv = exportToCSV({ filename: 'test', columns, data: [] });
    const lines = csv.split('\n');
    expect(lines).toHaveLength(1); // just header
  });

  it('should handle null/undefined values', () => {
    const data = [{ code: '001', name: null, price: undefined, change: 0 }];
    const csv = exportToCSV({ filename: 'test', columns, data });
    expect(csv).toContain('001');
  });
});

describe('exportToJSON', () => {
  it('should export raw data without columns', () => {
    const json = exportToJSON(sampleData);
    const parsed = JSON.parse(json);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].code).toBe('000001');
  });

  it('should export with column mapping', () => {
    const json = exportToJSON(sampleData, columns);
    const parsed = JSON.parse(json);
    expect(parsed[0]['股票代码']).toBe('000001');
    expect(parsed[0]['涨跌幅']).toBe('2.5%');
  });

  it('should format JSON nicely', () => {
    const json = exportToJSON(sampleData);
    expect(json).toContain('\n');
    expect(json).toContain('  ');
  });
});

describe('parseCSV', () => {
  it('should parse CSV string', () => {
    const csv = 'name,age\nAlice,30\nBob,25';
    const result = parseCSV(csv);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ name: 'Alice', age: '30' });
    expect(result[1]).toEqual({ name: 'Bob', age: '25' });
  });

  it('should handle quoted values', () => {
    const csv = 'name,detail\nAlice,"hello, world"';
    const result = parseCSV(csv);
    expect(result[0].detail).toBe('hello, world');
  });

  it('should handle escaped quotes', () => {
    const csv = 'name,desc\nAlice,"say ""hello"""';
    const result = parseCSV(csv);
    expect(result[0].desc).toBe('say "hello"');
  });

  it('should return empty for empty string', () => {
    expect(parseCSV('')).toEqual([]);
  });

  it('should return empty for header only', () => {
    expect(parseCSV('name,age')).toEqual([]);
  });
});
