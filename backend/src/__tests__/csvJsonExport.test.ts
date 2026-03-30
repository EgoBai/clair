import { describe, it, expect } from 'vitest';

// ===== CSV/JSON导出引擎测试 =====

interface ExportConfig { headers: string[]; fields: string[]; delimiter: string; quote: string; }

function toCSV(data: Record<string, unknown>[], config: ExportConfig): string {
  const lines: string[] = [];
  lines.push(config.headers.map(h => `${config.quote}${h}${config.quote}`).join(config.delimiter));
  for (const row of data) {
    const values = config.fields.map(f => {
      const val = row[f] ?? '';
      const str = String(val);
      if (str.includes(config.delimiter) || str.includes(config.quote) || str.includes('\n')) {
        return `${config.quote}${str.replace(new RegExp(config.quote, 'g'), config.quote + config.quote)}${config.quote}`;
      }
      return str;
    });
    lines.push(values.join(config.delimiter));
  }
  return lines.join('\n');
}

function toJSON(data: Record<string, unknown>[], pretty: boolean = false): string {
  return JSON.stringify(data, null, pretty ? 2 : undefined);
}

function flattenObject(obj: Record<string, unknown>, prefix: string = ''): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(result, flattenObject(value as Record<string, unknown>, newKey));
    } else {
      result[newKey] = value;
    }
  }
  return result;
}

function exportToFormat(data: Record<string, unknown>[], format: 'csv' | 'json' | 'tsv'): string {
  switch (format) {
    case 'csv':
      return toCSV(data, { headers: Object.keys(data[0] || {}), fields: Object.keys(data[0] || {}), delimiter: ',', quote: '"' });
    case 'tsv':
      return toCSV(data, { headers: Object.keys(data[0] || {}), fields: Object.keys(data[0] || {}), delimiter: '\t', quote: '"' });
    case 'json':
      return toJSON(data, true);
  }
}

describe('CSV/JSON导出', () => {
  const sampleData = [
    { code: '600519', name: '贵州茅台', price: 1900, change: '+1.5%' },
    { code: '000858', name: '五粮液', price: 160, change: '-0.8%' },
  ];

  describe('CSV生成', () => {
    it('生成正确CSV格式', () => {
      const csv = toCSV(sampleData, { headers: ['代码', '名称'], fields: ['code', 'name'], delimiter: ',', quote: '"' });
      expect(csv).toContain('"代码","名称"');
      expect(csv).toContain('600519,贵州茅台');
    });

    it('包含表头', () => {
      const csv = toCSV(sampleData, { headers: ['Code'], fields: ['code'], delimiter: ',', quote: '"' });
      expect(csv.startsWith('"Code"')).toBe(true);
    });

    it('逗号值被引号包围', () => {
      const data = [{ name: 'Hello, World' }];
      const csv = toCSV(data, { headers: ['Name'], fields: ['name'], delimiter: ',', quote: '"' });
      expect(csv).toContain('"Hello, World"');
    });

    it('引号被转义', () => {
      const data = [{ name: 'Say "Hi"' }];
      const csv = toCSV(data, { headers: ['Name'], fields: ['name'], delimiter: ',', quote: '"' });
      expect(csv).toContain('""Hi""');
    });

    it('空数据返回表头', () => {
      const csv = toCSV([], { headers: ['A'], fields: ['a'], delimiter: ',', quote: '"' });
      expect(csv).toBe('"A"');
    });

    it('自定义分隔符', () => {
      const csv = toCSV([{ a: 1, b: 2 }], { headers: ['A', 'B'], fields: ['a', 'b'], delimiter: ';', quote: '"' });
      expect(csv).toContain(';');
    });

    it('null值变空字符串', () => {
      const csv = toCSV([{ a: null }], { headers: ['A'], fields: ['a'], delimiter: ',', quote: '"' });
      expect(csv).toContain('\n');
    });
  });

  describe('JSON生成', () => {
    it('压缩格式', () => {
      const json = toJSON(sampleData, false);
      expect(json).not.toContain('\n  ');
    });

    it('美化格式', () => {
      const json = toJSON(sampleData, true);
      expect(json).toContain('\n  ');
    });

    it('可解析', () => {
      const json = toJSON(sampleData);
      expect(() => JSON.parse(json)).not.toThrow();
    });

    it('空数组', () => {
      expect(toJSON([])).toBe('[]');
    });
  });

  describe('对象扁平化', () => {
    it('简单扁平化', () => {
      const r = flattenObject({ a: { b: 1 } });
      expect(r['a.b']).toBe(1);
    });

    it('多层嵌套', () => {
      const r = flattenObject({ a: { b: { c: 2 } } });
      expect(r['a.b.c']).toBe(2);
    });

    it('数组不展开', () => {
      const r = flattenObject({ a: [1, 2] });
      expect(Array.isArray(r['a'])).toBe(true);
    });

    it('无嵌套原样返回', () => {
      const r = flattenObject({ a: 1, b: 2 });
      expect(r).toEqual({ a: 1, b: 2 });
    });
  });

  describe('格式导出', () => {
    it('CSV格式', () => {
      const r = exportToFormat([{ a: 1 }], 'csv');
      expect(r).toContain('"a"');
    });

    it('TSV格式用Tab分隔', () => {
      const r = exportToFormat([{ a: 1, b: 2 }], 'tsv');
      expect(r).toContain('\t');
    });

    it('JSON格式美化', () => {
      const r = exportToFormat([{ a: 1 }], 'json');
      expect(r).toContain('\n');
    });

    it('空数据CSV导出', () => {
      const r = exportToFormat([], 'csv');
      expect(typeof r).toBe('string');
    });
  });
});
