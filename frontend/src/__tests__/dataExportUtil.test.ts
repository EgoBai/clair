import { describe, it, expect, vi, beforeEach } from 'vitest';

// ==================== 数据导出工具逻辑测试 ====================

describe('dataExport - CSV formatting', () => {
  function toCSV(headers: string[], rows: (string | number)[][]): string {
    const escapeCSV = (val: string | number) => {
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };
    const headerLine = headers.map(escapeCSV).join(',');
    const dataLines = rows.map(row => row.map(escapeCSV).join(','));
    return [headerLine, ...dataLines].join('\n');
  }

  it('should format headers and rows', () => {
    const csv = toCSV(['Name', 'Price'], [['茅台', 1800], ['平安', 50]]);
    expect(csv).toContain('Name,Price');
    expect(csv).toContain('茅台,1800');
  });

  it('should escape values with commas', () => {
    const csv = toCSV(['A', 'B'], [['hello,world', 'test']]);
    expect(csv).toContain('"hello,world"');
  });

  it('should escape values with quotes', () => {
    const csv = toCSV(['A'], [['say "hi"']]);
    expect(csv).toContain('"say ""hi"""');
  });

  it('should escape values with newlines', () => {
    const csv = toCSV(['A'], [['line1\nline2']]);
    expect(csv).toContain('"line1\nline2"');
  });

  it('should handle empty rows', () => {
    const csv = toCSV(['A', 'B'], []);
    expect(csv).toBe('A,B');
  });

  it('should handle numeric values', () => {
    const csv = toCSV(['Price'], [[1800.50], [0.001], [-3.14]]);
    expect(csv).toContain('1800.5');
    expect(csv).toContain('0.001');
    expect(csv).toContain('-3.14');
  });

  it('should handle empty headers', () => {
    const csv = toCSV([], [['a', 'b']]);
    expect(csv).toContain('a,b');
  });

  it('should handle Chinese characters', () => {
    const csv = toCSV(['股票代码', '股票名称'], [['600519', '贵州茅台']]);
    expect(csv).toContain('股票代码,股票名称');
    expect(csv).toContain('600519,贵州茅台');
  });

  it('should handle zero as number', () => {
    const csv = toCSV(['Value'], [[0]]);
    expect(csv).toContain('0');
  });

  it('should handle multiple rows', () => {
    const csv = toCSV(['A'], [['a'], ['b'], ['c']]);
    const lines = csv.split('\n');
    expect(lines.length).toBe(4); // 1 header + 3 data
  });
});

describe('dataExport - JSON formatting', () => {
  function toJSON(data: object, pretty: boolean = false): string {
    return JSON.stringify(data, null, pretty ? 2 : undefined);
  }

  it('should compact by default', () => {
    const json = toJSON({ a: 1 });
    expect(json).toBe('{"a":1}');
  });

  it('should pretty print when requested', () => {
    const json = toJSON({ a: 1 }, true);
    expect(json).toContain('\n');
    expect(json).toContain('  ');
  });

  it('should handle nested objects', () => {
    const data = { stock: { name: '茅台', price: 1800 } };
    const json = toJSON(data, true);
    expect(json).toContain('stock');
    expect(json).toContain('茅台');
  });

  it('should handle arrays', () => {
    const data = { items: [1, 2, 3] };
    const json = toJSON(data);
    expect(json).toContain('[1,2,3]');
  });

  it('should handle null values', () => {
    const json = toJSON({ a: null });
    expect(json).toContain('null');
  });

  it('should handle boolean values', () => {
    const json = toJSON({ active: true, disabled: false });
    expect(json).toContain('true');
    expect(json).toContain('false');
  });
});

describe('dataExport - Excel XML (basic)', () => {
  function generateExcelXML(headers: string[], rows: (string | number)[][]): string {
    const escapeXml = (s: string | number) =>
      String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    
    let xml = '<?xml version="1.0"?>\n<Workbook><Worksheet ss:Name="Sheet1"><Table>\n';
    xml += '<Row>' + headers.map(h => `<Cell><Data ss:Type="String">${escapeXml(h)}</Data></Cell>`).join('') + '</Row>\n';
    for (const row of rows) {
      xml += '<Row>' + row.map(v => {
        const type = typeof v === 'number' ? 'Number' : 'String';
        return `<Cell><Data ss:Type="${type}">${escapeXml(v)}</Data></Cell>`;
      }).join('') + '</Row>\n';
    }
    xml += '</Table></Worksheet></Workbook>';
    return xml;
  }

  it('should generate valid XML structure', () => {
    const xml = generateExcelXML(['A'], [['test']]);
    expect(xml).toContain('<?xml');
    expect(xml).toContain('<Workbook>');
    expect(xml).toContain('</Workbook>');
  });

  it('should include headers', () => {
    const xml = generateExcelXML(['Name', 'Price'], []);
    expect(xml).toContain('Name');
    expect(xml).toContain('Price');
  });

  it('should include data rows', () => {
    const xml = generateExcelXML(['A'], [['hello']]);
    expect(xml).toContain('hello');
  });

  it('should escape XML special chars', () => {
    const xml = generateExcelXML(['A'], [['<script>&test</script>']]);
    expect(xml).toContain('&lt;script&gt;');
    expect(xml).not.toContain('<script>');
  });

  it('should mark numbers as Number type', () => {
    const xml = generateExcelXML(['Price'], [[1800]]);
    expect(xml).toContain('ss:Type="Number"');
  });

  it('should mark strings as String type', () => {
    const xml = generateExcelXML(['Name'], [['茅台']]);
    expect(xml).toContain('ss:Type="String"');
  });
});

describe('dataExport - column width calculation', () => {
  function calculateColumnWidths(headers: string[], rows: (string | number)[][]): number[] {
    const widths = headers.map(h => h.length);
    for (const row of rows) {
      for (let i = 0; i < row.length; i++) {
        widths[i] = Math.max(widths[i] || 0, String(row[i]).length);
      }
    }
    return widths.map(w => Math.min(w * 8 + 16, 300));
  }

  it('should base width on header length', () => {
    const widths = calculateColumnWidths(['Short', 'VeryLongHeader'], []);
    expect(widths[1]).toBeGreaterThan(widths[0]);
  });

  it('should account for data width', () => {
    const widths = calculateColumnWidths(['A'], [['This is a very long value']]);
    expect(widths[0]).toBeGreaterThan(50);
  });

  it('should cap max width at 300', () => {
    const widths = calculateColumnWidths(['A'], [['x'.repeat(100)]]);
    expect(widths[0]).toBeLessThanOrEqual(300);
  });

  it('should handle empty data', () => {
    const widths = calculateColumnWidths(['A', 'B'], []);
    expect(widths.length).toBe(2);
  });

  it('should handle multiple columns', () => {
    const widths = calculateColumnWidths(['A', 'B', 'C'], [['1', '22', '333']]);
    expect(widths.length).toBe(3);
    expect(widths[2]).toBeGreaterThan(widths[0]);
  });
});

describe('dataExport - data format detection', () => {
  function detectFormat(filename: string): 'csv' | 'json' | 'xlsx' | 'unknown' {
    const ext = filename.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'csv': return 'csv';
      case 'json': return 'json';
      case 'xlsx': case 'xls': return 'xlsx';
      default: return 'unknown';
    }
  }

  it('should detect CSV', () => {
    expect(detectFormat('data.csv')).toBe('csv');
    expect(detectFormat('report.CSV')).toBe('csv');
  });

  it('should detect JSON', () => {
    expect(detectFormat('data.json')).toBe('json');
  });

  it('should detect XLSX', () => {
    expect(detectFormat('data.xlsx')).toBe('xlsx');
    expect(detectFormat('data.xls')).toBe('xlsx');
  });

  it('should return unknown for unrecognized', () => {
    expect(detectFormat('data.pdf')).toBe('unknown');
    expect(detectFormat('data')).toBe('unknown');
  });

  it('should handle complex filenames', () => {
    expect(detectFormat('stock-data-2024-01.csv')).toBe('csv');
  });

  it('should handle files with no extension', () => {
    expect(detectFormat('noextension')).toBe('unknown');
  });
});

describe('dataExport - size estimation', () => {
  function estimateExportSize(rows: number, columns: number, format: 'csv' | 'json'): number {
    const avgCellSize = 10; // bytes
    if (format === 'csv') {
      return rows * columns * avgCellSize + columns * 20; // +header
    }
    return rows * columns * avgCellSize * 2; // JSON overhead
  }

  it('should estimate CSV size', () => {
    const size = estimateExportSize(100, 5, 'csv');
    expect(size).toBeGreaterThan(0);
  });

  it('JSON should be roughly 2x CSV', () => {
    const csvSize = estimateExportSize(100, 5, 'csv');
    const jsonSize = estimateExportSize(100, 5, 'json');
    expect(jsonSize).toBeGreaterThan(csvSize);
  });

  it('more rows should increase size', () => {
    const small = estimateExportSize(10, 5, 'csv');
    const large = estimateExportSize(1000, 5, 'csv');
    expect(large).toBeGreaterThan(small);
  });

  it('should handle zero rows', () => {
    expect(estimateExportSize(0, 5, 'csv')).toBeGreaterThan(0); // header
  });

  it('more columns should increase size', () => {
    const narrow = estimateExportSize(100, 2, 'csv');
    const wide = estimateExportSize(100, 20, 'csv');
    expect(wide).toBeGreaterThan(narrow);
  });
});
