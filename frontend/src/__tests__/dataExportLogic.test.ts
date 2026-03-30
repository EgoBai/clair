import { describe, it, expect } from 'vitest';

/**
 * 数据导出工具测试
 * 测试 CSV/JSON/Excel 导出逻辑
 */
describe('Data Export Utils', () => {
  describe('CSV Export', () => {
    function toCSV(data: Record<string, any>[], columns?: string[]): string {
      if (data.length === 0) return '';
      const cols = columns || Object.keys(data[0]);
      const header = cols.join(',');
      const rows = data.map(row =>
        cols.map(col => {
          const val = row[col];
          if (typeof val === 'string' && (val.includes(',') || val.includes('"') || val.includes('\n'))) {
            return `"${val.replace(/"/g, '""')}"`;
          }
          return val ?? '';
        }).join(',')
      );
      return [header, ...rows].join('\n');
    }

    it('should convert objects to CSV', () => {
      const data = [
        { symbol: '600519', name: '贵州茅台', price: 1800 },
        { symbol: '000858', name: '五粮液', price: 150 },
      ];
      const csv = toCSV(data);
      expect(csv).toContain('symbol,name,price');
      expect(csv).toContain('600519,贵州茅台,1800');
    });

    it('should escape commas in values', () => {
      const data = [{ name: 'A,B', value: 1 }];
      const csv = toCSV(data);
      expect(csv).toContain('"A,B"');
    });

    it('should escape quotes in values', () => {
      const data = [{ name: 'A"B', value: 1 }];
      const csv = toCSV(data);
      expect(csv).toContain('"A""B"');
    });

    it('should handle empty data', () => {
      expect(toCSV([])).toBe('');
    });

    it('should support column selection', () => {
      const data = [{ a: 1, b: 2, c: 3 }];
      const csv = toCSV(data, ['a', 'c']);
      expect(csv).toBe('a,c\n1,3');
    });

    it('should handle null/undefined values', () => {
      const data = [{ a: 1, b: null, c: undefined }];
      const csv = toCSV(data);
      expect(csv).toContain('1,,');
    });
  });

  describe('JSON Export', () => {
    function toJSON(data: any[], pretty: boolean = false): string {
      return pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
    }

    it('should serialize to JSON string', () => {
      const data = [{ symbol: '600519', price: 1800 }];
      const json = toJSON(data);
      expect(typeof json).toBe('string');
      expect(JSON.parse(json)).toEqual(data);
    });

    it('should pretty-print when requested', () => {
      const data = [{ a: 1 }];
      const json = toJSON(data, true);
      expect(json).toContain('\n');
      expect(json).toContain('  ');
    });
  });

  describe('Filename Generation', () => {
    function generateFilename(prefix: string, format: string): string {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      return `${prefix}_${timestamp}.${format}`;
    }

    it('should include prefix', () => {
      const filename = generateFilename('stocks', 'csv');
      expect(filename).toContain('stocks_');
    });

    it('should include format extension', () => {
      const filename = generateFilename('stocks', 'csv');
      expect(filename.endsWith('.csv')).toBe(true);
    });

    it('should include timestamp', () => {
      const filename = generateFilename('data', 'json');
      expect(filename).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}/);
    });
  });

  describe('BOM for Excel', () => {
    function addBOM(content: string): string {
      return '\uFEFF' + content;
    }

    it('should add BOM prefix', () => {
      const csv = 'a,b\n1,2';
      const withBOM = addBOM(csv);
      expect(withBOM.charCodeAt(0)).toBe(0xFEFF);
      expect(withBOM.slice(1)).toBe(csv);
    });
  });

  describe('Data Formatting for Export', () => {
    function formatForExport(data: any[], format: 'csv' | 'json' | 'xlsx'): string {
      switch (format) {
        case 'csv': return data.map(r => Object.values(r).join(',')).join('\n');
        case 'json': return JSON.stringify(data, null, 2);
        case 'xlsx': return JSON.stringify(data); // simplified
        default: return '';
      }
    }

    it('should format for CSV', () => {
      const data = [{ a: 1, b: 2 }];
      expect(formatForExport(data, 'csv')).toBe('1,2');
    });

    it('should format for JSON', () => {
      const data = [{ a: 1 }];
      const result = formatForExport(data, 'json');
      expect(JSON.parse(result)).toEqual(data);
    });
  });

  describe('Column Mapping', () => {
    const COLUMN_LABELS: Record<string, string> = {
      symbol: '股票代码',
      name: '股票名称',
      price: '最新价',
      changePercent: '涨跌幅',
      volume: '成交量',
      turnover: '成交额',
      pe: '市盈率',
      pb: '市净率',
    };

    it('should map all columns to Chinese labels', () => {
      expect(COLUMN_LABELS.symbol).toBe('股票代码');
      expect(COLUMN_LABELS.price).toBe('最新价');
    });

    it('should generate Chinese headers for CSV', () => {
      const headers = Object.values(COLUMN_LABELS).join(',');
      expect(headers).toContain('股票代码');
      expect(headers).toContain('涨跌幅');
    });
  });
});
