import { describe, it, expect } from 'vitest';

// 数据导出与报告生成测试

interface ExportColumn {
  key: string;
  label: string;
  format?: (value: any) => string;
}

function toCSV(data: Record<string, any>[], columns: ExportColumn[]): string {
  const header = columns.map(c => escapeCSV(c.label)).join(',');
  const rows = data.map(row =>
    columns.map(c => {
      const value = row[c.key];
      const formatted = c.format ? c.format(value) : String(value ?? '');
      return escapeCSV(formatted);
    }).join(',')
  );
  return [header, ...rows].join('\n');
}

function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function toJSON(data: any[], columns?: ExportColumn[]): string {
  if (!columns) return JSON.stringify(data, null, 2);
  const filtered = data.map(row => {
    const obj: Record<string, any> = {};
    for (const col of columns) {
      obj[col.label] = col.format ? col.format(row[col.key]) : row[col.key];
    }
    return obj;
  });
  return JSON.stringify(filtered, null, 2);
}

function toMarkdown(data: Record<string, any>[], columns: ExportColumn[]): string {
  const header = '| ' + columns.map(c => c.label).join(' | ') + ' |';
  const separator = '| ' + columns.map(() => '---').join(' | ') + ' |';
  const rows = data.map(row =>
    '| ' + columns.map(c => {
      const value = row[c.key];
      return c.format ? c.format(value) : String(value ?? '');
    }).join(' | ') + ' |'
  );
  return [header, separator, ...rows].join('\n');
}

function generateReport(
  title: string,
  data: Record<string, any>[],
  columns: ExportColumn[],
  summary?: Record<string, any>
): string {
  const lines: string[] = [];
  lines.push(`# ${title}`);
  lines.push('');
  lines.push(`生成时间: ${new Date().toISOString()}`);
  lines.push(`数据条数: ${data.length}`);
  lines.push('');
  
  if (summary) {
    lines.push('## 汇总');
    for (const [key, value] of Object.entries(summary)) {
      lines.push(`- ${key}: ${value}`);
    }
    lines.push('');
  }
  
  lines.push('## 数据');
  lines.push(toMarkdown(data, columns));
  return lines.join('\n');
}

function addBOM(content: string): string {
  return '\uFEFF' + content;
}

function downloadFilename(prefix: string, extension: string): string {
  const date = new Date().toISOString().slice(0, 10);
  const time = new Date().toISOString().slice(11, 19).replace(/:/g, '');
  return `${prefix}_${date}_${time}.${extension}`;
}

describe('数据导出与报告生成', () => {
  const sampleData = [
    { code: '600519', name: '贵州茅台', price: 1900, change: 2.5, pe: 35 },
    { code: '000858', name: '五粮液', price: 160, change: -1.2, pe: 25 },
    { code: '300750', name: '宁德时代', price: 180, change: 3.8, pe: 45 },
  ];

  const columns: ExportColumn[] = [
    { key: 'code', label: '代码' },
    { key: 'name', label: '名称' },
    { key: 'price', label: '价格', format: (v) => v.toFixed(2) },
    { key: 'change', label: '涨跌幅%', format: (v) => v.toFixed(2) + '%' },
    { key: 'pe', label: 'PE' },
  ];

  describe('CSV导出', () => {
    it('基本CSV格式', () => {
      const csv = toCSV(sampleData, columns);
      const lines = csv.split('\n');
      expect(lines.length).toBe(4); // header + 3 rows
      expect(lines[0]).toContain('代码');
      expect(lines[0]).toContain('名称');
    });

    it('格式化函数生效', () => {
      const csv = toCSV(sampleData, columns);
      expect(csv).toContain('1900.00');
      expect(csv).toContain('2.50%');
    });

    it('逗号转义', () => {
      const data = [{ name: 'A,B', value: 1 }];
      const cols: ExportColumn[] = [
        { key: 'name', label: '名称' },
        { key: 'value', label: '值' },
      ];
      const csv = toCSV(data, cols);
      expect(csv).toContain('"A,B"');
    });

    it('引号转义', () => {
      const data = [{ name: 'A"B', value: 1 }];
      const cols: ExportColumn[] = [
        { key: 'name', label: '名称' },
        { key: 'value', label: '值' },
      ];
      const csv = toCSV(data, cols);
      expect(csv).toContain('"A""B"');
    });

    it('空数据只返回表头', () => {
      const csv = toCSV([], columns);
      expect(csv.split('\n').length).toBe(1);
    });

    it('null值处理', () => {
      const data = [{ code: 'TEST', name: null, price: 0, change: 0, pe: null }];
      const csv = toCSV(data, columns);
      expect(csv).toContain('TEST');
      expect(csv).toContain('0.00');
    });
  });

  describe('JSON导出', () => {
    it('全部字段', () => {
      const json = toJSON(sampleData);
      const parsed = JSON.parse(json);
      expect(parsed.length).toBe(3);
      expect(parsed[0].code).toBe('600519');
    });

    it('指定字段', () => {
      const json = toJSON(sampleData, columns);
      const parsed = JSON.parse(json);
      expect(parsed[0]['代码']).toBe('600519');
      expect(parsed[0]['价格']).toBe('1900.00');
    });

    it('格式化应用', () => {
      const json = toJSON(sampleData, columns);
      const parsed = JSON.parse(json);
      expect(parsed[0]['涨跌幅%']).toBe('2.50%');
    });

    it('空数据', () => {
      const json = toJSON([], columns);
      expect(JSON.parse(json)).toEqual([]);
    });
  });

  describe('Markdown导出', () => {
    it('表头和分隔线', () => {
      const md = toMarkdown(sampleData, columns);
      const lines = md.split('\n');
      expect(lines[0]).toContain('| 代码');
      expect(lines[1]).toContain('---');
    });

    it('数据行', () => {
      const md = toMarkdown(sampleData, columns);
      expect(md).toContain('600519');
      expect(md).toContain('贵州茅台');
    });

    it('格式化应用', () => {
      const md = toMarkdown(sampleData, columns);
      expect(md).toContain('1900.00');
    });
  });

  describe('报告生成', () => {
    it('包含标题', () => {
      const report = generateReport('测试报告', sampleData, columns);
      expect(report).toContain('# 测试报告');
    });

    it('包含数据条数', () => {
      const report = generateReport('测试报告', sampleData, columns);
      expect(report).toContain('数据条数: 3');
    });

    it('包含汇总信息', () => {
      const summary = { 平均PE: 35, 最高价: 1900 };
      const report = generateReport('测试报告', sampleData, columns, summary);
      expect(report).toContain('## 汇总');
      expect(report).toContain('平均PE: 35');
    });

    it('包含数据表', () => {
      const report = generateReport('测试报告', sampleData, columns);
      expect(report).toContain('## 数据');
      expect(report).toContain('600519');
    });

    it('无汇总时不包含汇总章节', () => {
      const report = generateReport('测试报告', sampleData, columns);
      expect(report).not.toContain('## 汇总');
    });
  });

  describe('BOM处理', () => {
    it('添加UTF-8 BOM', () => {
      const content = 'hello';
      const withBOM = addBOM(content);
      expect(withBOM.charCodeAt(0)).toBe(0xFEFF);
      expect(withBOM.slice(1)).toBe('hello');
    });
  });

  describe('文件名生成', () => {
    it('包含前缀和日期', () => {
      const filename = downloadFilename('stock_report', 'csv');
      expect(filename).toMatch(/^stock_report_\d{4}-\d{2}-\d{2}_\d{6}\.csv$/);
    });

    it('包含扩展名', () => {
      const filename = downloadFilename('data', 'json');
      expect(filename).toMatch(/\.json$/);
    });
  });
});
