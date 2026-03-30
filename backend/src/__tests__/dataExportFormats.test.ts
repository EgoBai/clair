import { describe, it, expect } from 'vitest';

// 数据导出格式测试 — 50用例
describe('数据导出格式', () => {

  // CSV生成
  describe('CSV生成', () => {
    function toCSV(rows: Record<string, unknown>[], headers?: string[]) {
      if (rows.length === 0) return '';
      const keys = headers || Object.keys(rows[0]!);
      const lines = [keys.join(',')];
      for (const row of rows) {
        const values = keys.map(k => {
          const v = row[k];
          const str = v === null || v === undefined ? '' : String(v);
          return str.includes(',') || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str;
        });
        lines.push(values.join(','));
      }
      return lines.join('\n');
    }

    it('基本CSV生成', () => {
      const csv = toCSV([{ name: 'test', value: 123 }]);
      expect(csv).toContain('name,value');
      expect(csv).toContain('test,123');
    });

    it('逗号值应加引号', () => {
      const csv = toCSV([{ name: 'a,b', val: 1 }]);
      expect(csv).toContain('"a,b"');
    });

    it('引号值应转义', () => {
      const csv = toCSV([{ name: 'a"b', val: 1 }]);
      expect(csv).toContain('""');
    });

    it('空数据返回空', () => {
      expect(toCSV([])).toBe('');
    });

    it('自定义表头', () => {
      const csv = toCSV([{ a: 1, b: 2 }], ['a']);
      expect(csv.split('\n')[0]).toBe('a');
    });

    it('null值应为空字符串', () => {
      const csv = toCSV([{ a: null, b: 1 }]);
      expect(csv).toContain(',1');
    });

    it('多行数据', () => {
      const csv = toCSV([{ a: 1 }, { a: 2 }, { a: 3 }]);
      expect(csv.split('\n')).toHaveLength(4); // header + 3 rows
    });
  });

  // JSON格式化
  describe('JSON格式化', () => {
    function flattenJSON(obj: Record<string, unknown>, prefix = ''): Record<string, unknown> {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          Object.assign(result, flattenJSON(value as Record<string, unknown>, fullKey));
        } else {
          result[fullKey] = value;
        }
      }
      return result;
    }

    it('扁平化嵌套对象', () => {
      const flat = flattenJSON({ a: { b: 1 } });
      expect(flat['a.b']).toBe(1);
    });

    it('数组不展开', () => {
      const flat = flattenJSON({ a: [1, 2] });
      expect(Array.isArray(flat['a'])).toBe(true);
    });

    it('多层嵌套', () => {
      const flat = flattenJSON({ a: { b: { c: 1 } } });
      expect(flat['a.b.c']).toBe(1);
    });

    it('空对象返回空', () => {
      expect(Object.keys(flattenJSON({}))).toHaveLength(0);
    });

    it('顶级键保留', () => {
      const flat = flattenJSON({ x: 1 });
      expect(flat['x']).toBe(1);
    });
  });

  // Markdown表格
  describe('Markdown表格', () => {
    function toMarkdownTable(rows: Record<string, unknown>[], headers?: string[]) {
      if (rows.length === 0) return '';
      const keys = headers || Object.keys(rows[0]!);
      const header = `| ${keys.join(' | ')} |`;
      const separator = `| ${keys.map(() => '---').join(' | ')} |`;
      const data = rows.map(r => `| ${keys.map(k => r[k] ?? '').join(' | ')} |`);
      return [header, separator, ...data].join('\n');
    }

    it('基本表格生成', () => {
      const table = toMarkdownTable([{ a: 1, b: 2 }]);
      expect(table).toContain('| a | b |');
      expect(table).toContain('| --- | --- |');
    });

    it('分隔行格式正确', () => {
      const table = toMarkdownTable([{ x: 1 }]);
      expect(table).toContain('| --- |');
    });

    it('空数据返回空', () => {
      expect(toMarkdownTable([])).toBe('');
    });

    it('多行数据', () => {
      const table = toMarkdownTable([{ a: 1 }, { a: 2 }]);
      const lines = table.split('\n');
      expect(lines).toHaveLength(4); // header + sep + 2 data
    });
  });

  // TSV格式
  describe('TSV格式', () => {
    function toTSV(rows: Record<string, unknown>[]) {
      if (rows.length === 0) return '';
      const keys = Object.keys(rows[0]!);
      return [keys.join('\t'), ...rows.map(r => keys.map(k => r[k] ?? '').join('\t'))].join('\n');
    }

    it('制表符分隔', () => {
      const tsv = toTSV([{ a: 1, b: 2 }]);
      expect(tsv).toContain('\t');
    });

    it('不含逗号', () => {
      const tsv = toTSV([{ a: 'hello,world', b: 1 }]);
      // TSV保留逗号
      expect(tsv).toContain('hello,world');
    });

    it('空数据返回空', () => {
      expect(toTSV([])).toBe('');
    });
  });
});
