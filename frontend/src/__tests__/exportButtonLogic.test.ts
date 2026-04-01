import { describe, it, expect } from 'vitest';

/**
 * 导出按钮组件逻辑测试
 * ExportButton 格式/数据转换逻辑
 */

type ExportFormat = 'csv' | 'json' | 'xlsx' | 'pdf';
type ExportStatus = 'idle' | 'preparing' | 'exporting' | 'done' | 'error';

interface ExportColumn {
  key: string;
  label: string;
  format?: (value: any) => string;
  visible?: boolean;
}

interface ExportConfig {
  format: ExportFormat;
  filename: string;
  columns: ExportColumn[];
  includeHeader: boolean;
  delimiter?: string; // for csv
  encoding?: string;
}

interface ExportResult {
  status: ExportStatus;
  filename: string;
  size: number;
  rowCount: number;
  duration: number;
  error?: string;
}

function buildFilename(baseName: string, format: ExportFormat, timestamp = true): string {
  const ts = timestamp ? `_${new Date().toISOString().slice(0, 10)}` : '';
  const ext = format;
  return `${baseName}${ts}.${ext}`;
}

function convertToCSV(
  data: Record<string, any>[],
  columns: ExportColumn[],
  delimiter = ',',
  includeHeader = true
): string {
  const visibleCols = columns.filter(c => c.visible !== false);
  const lines: string[] = [];

  if (includeHeader) {
    lines.push(visibleCols.map(c => escapeCSV(c.label, delimiter)).join(delimiter));
  }

  for (const row of data) {
    const values = visibleCols.map(col => {
      const raw = row[col.key];
      const formatted = col.format ? col.format(raw) : String(raw ?? '');
      return escapeCSV(formatted, delimiter);
    });
    lines.push(values.join(delimiter));
  }

  return lines.join('\n');
}

function escapeCSV(value: string, delimiter: string): string {
  if (value.includes(delimiter) || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function convertToJSON(
  data: Record<string, any>[],
  columns: ExportColumn[]
): string {
  const visibleCols = columns.filter(c => c.visible !== false);
  const filtered = data.map(row => {
    const obj: Record<string, any> = {};
    for (const col of visibleCols) {
      obj[col.label] = col.format ? col.format(row[col.key]) : row[col.key];
    }
    return obj;
  });
  return JSON.stringify(filtered, null, 2);
}

function selectColumns(
  allColumns: ExportColumn[],
  selectedKeys?: string[]
): ExportColumn[] {
  if (!selectedKeys || selectedKeys.length === 0) {
    return allColumns.filter(c => c.visible !== false);
  }
  return allColumns.filter(c => selectedKeys.includes(c.key));
}

function estimateFileSize(content: string, encoding: BufferEncoding = 'utf-8'): number {
  return Buffer.byteLength(content, encoding);
}

function validateExportConfig(config: ExportConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!config.filename) errors.push('filename is required');
  if (!['csv', 'json', 'xlsx', 'pdf'].includes(config.format)) {
    errors.push(`unsupported format: ${config.format}`);
  }
  if (config.columns.length === 0) errors.push('at least one column required');
  if (config.format === 'csv' && config.delimiter) {
    if (config.delimiter.length !== 1) errors.push('delimiter must be single character');
  }
  return { valid: errors.length === 0, errors };
}

function createDefaultColumns(data: Record<string, any>[]): ExportColumn[] {
  if (data.length === 0) return [];
  return Object.keys(data[0]).map(key => ({
    key,
    label: key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1'),
  }));
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function buildMIMEType(format: ExportFormat): string {
  const types: Record<ExportFormat, string> = {
    csv: 'text/csv',
    json: 'application/json',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    pdf: 'application/pdf',
  };
  return types[format];
}

function createProgressTracker(total: number): {
  update: (processed: number) => { percent: number; processed: number; total: number };
  isComplete: () => boolean;
} {
  let processed = 0;
  return {
    update(n: number) {
      processed = Math.min(n, total);
      return {
        percent: total > 0 ? Math.round((processed / total) * 100) : 100,
        processed,
        total,
      };
    },
    isComplete() {
      return processed >= total;
    },
  };
}

describe('导出按钮逻辑', () => {
  const mockData = [
    { name: '茅台', code: '600519', price: 2000, change: 2.5 },
    { name: '五粮液', code: '000858', price: 150, change: -1.2 },
  ];

  const mockColumns: ExportColumn[] = [
    { key: 'name', label: '名称' },
    { key: 'code', label: '代码' },
    { key: 'price', label: '价格', format: (v) => `¥${v}` },
    { key: 'change', label: '涨跌幅', format: (v) => `${v}%` },
  ];

  describe('buildFilename', () => {
    it('should build filename with timestamp', () => {
      const name = buildFilename('stocks', 'csv');
      expect(name).toMatch(/^stocks_\d{4}-\d{2}-\d{2}\.csv$/);
    });

    it('should skip timestamp when disabled', () => {
      expect(buildFilename('stocks', 'json', false)).toBe('stocks.json');
    });
  });

  describe('escapeCSV', () => {
    it('should escape values with delimiter', () => {
      expect(escapeCSV('a,b', ',')).toBe('"a,b"');
    });

    it('should escape quotes', () => {
      expect(escapeCSV('say "hi"', ',')).toBe('"say ""hi"""');
    });

    it('should escape newlines', () => {
      expect(escapeCSV('line1\nline2', ',')).toBe('"line1\nline2"');
    });

    it('should pass clean values', () => {
      expect(escapeCSV('hello', ',')).toBe('hello');
    });
  });

  describe('convertToCSV', () => {
    it('should convert data to CSV', () => {
      const csv = convertToCSV(mockData, mockColumns);
      const lines = csv.split('\n');
      expect(lines).toHaveLength(3); // header + 2 rows
      expect(lines[0]).toContain('名称');
    });

    it('should skip header when disabled', () => {
      const csv = convertToCSV(mockData, mockColumns, ',', false);
      const lines = csv.split('\n');
      expect(lines).toHaveLength(2);
      expect(lines[0]).toContain('茅台');
    });

    it('should apply formatters', () => {
      const csv = convertToCSV(mockData, mockColumns);
      expect(csv).toContain('¥2000');
      expect(csv).toContain('2.5%');
    });

    it('should use custom delimiter', () => {
      const csv = convertToCSV(mockData, mockColumns, '|');
      expect(csv.split('\n')[0]).toContain('|');
    });
  });

  describe('convertToJSON', () => {
    it('should convert to JSON string', () => {
      const json = convertToJSON(mockData, mockColumns);
      const parsed = JSON.parse(json);
      expect(parsed).toHaveLength(2);
      expect(parsed[0]['名称']).toBe('茅台');
    });

    it('should apply formatters', () => {
      const json = convertToJSON(mockData, mockColumns);
      const parsed = JSON.parse(json);
      expect(parsed[0]['价格']).toBe('¥2000');
    });
  });

  describe('selectColumns', () => {
    it('should return visible columns by default', () => {
      const cols = selectColumns(mockColumns);
      expect(cols).toHaveLength(4);
    });

    it('should filter by keys', () => {
      const cols = selectColumns(mockColumns, ['name', 'price']);
      expect(cols).toHaveLength(2);
      expect(cols[0].key).toBe('name');
    });
  });

  describe('estimateFileSize', () => {
    it('should estimate bytes', () => {
      expect(estimateFileSize('hello')).toBe(5);
      expect(estimateFileSize('你好')).toBeGreaterThan(4);
    });
  });

  describe('validateExportConfig', () => {
    it('should validate correct config', () => {
      const config: ExportConfig = {
        format: 'csv',
        filename: 'test',
        columns: mockColumns,
        includeHeader: true,
      };
      expect(validateExportConfig(config).valid).toBe(true);
    });

    it('should reject empty filename', () => {
      const config: ExportConfig = {
        format: 'csv', filename: '', columns: mockColumns, includeHeader: true,
      };
      expect(validateExportConfig(config).valid).toBe(false);
    });

    it('should reject invalid format', () => {
      const config: ExportConfig = {
        format: 'xml' as ExportFormat, filename: 'x', columns: mockColumns, includeHeader: true,
      };
      expect(validateExportConfig(config).valid).toBe(false);
    });

    it('should reject empty columns', () => {
      const config: ExportConfig = {
        format: 'csv', filename: 'x', columns: [], includeHeader: true,
      };
      expect(validateExportConfig(config).valid).toBe(false);
    });
  });

  describe('createDefaultColumns', () => {
    it('should create columns from data keys', () => {
      const cols = createDefaultColumns(mockData);
      expect(cols).toHaveLength(4);
      expect(cols.map(c => c.key)).toEqual(['name', 'code', 'price', 'change']);
    });

    it('should handle empty data', () => {
      expect(createDefaultColumns([])).toHaveLength(0);
    });
  });

  describe('formatFileSize', () => {
    it('should format bytes', () => {
      expect(formatFileSize(500)).toBe('500 B');
      expect(formatFileSize(1536)).toBe('1.5 KB');
      expect(formatFileSize(1048576)).toBe('1.0 MB');
    });
  });

  describe('buildMIMEType', () => {
    it('should return MIME types', () => {
      expect(buildMIMEType('csv')).toBe('text/csv');
      expect(buildMIMEType('json')).toBe('application/json');
      expect(buildMIMEType('xlsx')).toContain('spreadsheet');
      expect(buildMIMEType('pdf')).toBe('application/pdf');
    });
  });
});
