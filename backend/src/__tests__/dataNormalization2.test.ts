/**
 * 数据规范化与转换管道测试
 */
import { describe, it, expect } from 'vitest';

function normalizeStockCode(code: string): string | null {
  const cleaned = code.replace(/[^0-9]/g, '');
  if (cleaned.length !== 6) return null;
  if (cleaned.startsWith('6') || cleaned.startsWith('9')) return `SH${cleaned}`;
  if (cleaned.startsWith('0') || cleaned.startsWith('3') || cleaned.startsWith('2')) return `SZ${cleaned}`;
  return null;
}

function parseAmount(amount: string): number {
  const cleaned = amount.replace(/[,，\s]/g, '');
  if (cleaned.endsWith('万亿')) return parseFloat(cleaned) * 1e12;
  if (cleaned.endsWith('亿')) return parseFloat(cleaned) * 1e8;
  if (cleaned.endsWith('万')) return parseFloat(cleaned) * 1e4;
  return Number.isFinite(parseFloat(cleaned)) ? parseFloat(cleaned) : 0;
}

function formatNumberWithUnit(n: number): string {
  if (Math.abs(n) >= 1e12) return (n / 1e12).toFixed(2) + '万亿';
  if (Math.abs(n) >= 1e8) return (n / 1e8).toFixed(2) + '亿';
  if (Math.abs(n) >= 1e4) return (n / 1e4).toFixed(2) + '万';
  return n.toFixed(2);
}

function sanitizeCSVField(field: string): string {
  if (field.includes(',') || field.includes('"') || field.includes('\n')) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

function generateCSV(headers: string[], rows: Record<string, any>[]): string {
  const headerLine = headers.map(h => sanitizeCSVField(h)).join(',');
  const dataLines = rows.map(row =>
    headers.map(h => sanitizeCSVField(String(row[h] ?? ''))).join(',')
  );
  return [headerLine, ...dataLines].join('\n');
}

function parseKVString(str: string, pairSep = '&', kvSep = '='): Record<string, string> {
  return str.split(pairSep).reduce((acc, pair) => {
    const [k, v] = pair.split(kvSep);
    if (k) acc[decodeURIComponent(k)] = v ? decodeURIComponent(v) : '';
    return acc;
  }, {} as Record<string, string>);
}

describe('数据规范化', () => {
  describe('股票代码规范化', () => {
    it('沪市代码加SH前缀', () => {
      expect(normalizeStockCode('600519')).toBe('SH600519');
    });

    it('深市代码加SZ前缀', () => {
      expect(normalizeStockCode('000858')).toBe('SZ000858');
    });

    it('创业板代码', () => {
      expect(normalizeStockCode('300750')).toBe('SZ300750');
    });

    it('清理非数字字符', () => {
      expect(normalizeStockCode('600.519')).toBe('SH600519');
    });

    it('无效长度返回null', () => {
      expect(normalizeStockCode('123')).toBeNull();
    });

    it('未知前缀返回null', () => {
      expect(normalizeStockCode('700001')).toBeNull();
    });

    it('B股代码', () => {
      expect(normalizeStockCode('900901')).toBe('SH900901');
    });
  });

  describe('金额解析', () => {
    it('解析"万亿"', () => {
      expect(parseAmount('1.5万亿')).toBeCloseTo(1.5e12);
    });

    it('解析"亿"', () => {
      expect(parseAmount('200亿')).toBe(200e8);
    });

    it('解析"万"', () => {
      expect(parseAmount('5000万')).toBe(5000e4);
    });

    it('解析纯数字', () => {
      expect(parseAmount('12345')).toBe(12345);
    });

    it('千分位逗号', () => {
      expect(parseAmount('1,234')).toBe(1234);
    });

    it('空字符串返回0', () => {
      expect(parseAmount('')).toBe(0);
    });
  });

  describe('数字格式化', () => {
    it('万亿级', () => {
      expect(formatNumberWithUnit(1.5e12)).toContain('万亿');
    });

    it('亿级', () => {
      expect(formatNumberWithUnit(200e8)).toContain('亿');
    });

    it('万级', () => {
      expect(formatNumberWithUnit(5e4)).toContain('万');
    });

    it('小数字直接显示', () => {
      expect(formatNumberWithUnit(123)).toBe('123.00');
    });

    it('负数正确格式化', () => {
      expect(formatNumberWithUnit(-2e8)).toContain('亿');
    });
  });

  describe('CSV处理', () => {
    it('普通字段不变', () => {
      expect(sanitizeCSVField('hello')).toBe('hello');
    });

    it('含逗号加引号', () => {
      expect(sanitizeCSVField('a,b')).toBe('"a,b"');
    });

    it('含引号转义', () => {
      expect(sanitizeCSVField('a"b')).toBe('"a""b"');
    });

    it('生成CSV', () => {
      const csv = generateCSV(['code', 'name'], [
        { code: '600519', name: '贵州茅台' },
        { code: '000858', name: '五粮液' },
      ]);
      const lines = csv.split('\n');
      expect(lines).toHaveLength(3);
      expect(lines[0]).toBe('code,name');
      expect(lines[1]).toBe('600519,贵州茅台');
    });

    it('缺失字段填空', () => {
      const csv = generateCSV(['a', 'b'], [{ a: '1' }]);
      expect(csv.split('\n')[1]).toBe('1,');
    });
  });

  describe('KV字符串解析', () => {
    it('标准KV解析', () => {
      expect(parseKVString('a=1&b=2')).toEqual({ a: '1', b: '2' });
    });

    it('URL编码', () => {
      expect(parseKVString('name=%E8%82%A1%E7%A5%A8')).toHaveProperty('name');
    });

    it('空值', () => {
      expect(parseKVString('a=')).toEqual({ a: '' });
    });

    it('自定义分隔符', () => {
      expect(parseKVString('a:1;b:2', ';', ':')).toEqual({ a: '1', b: '2' });
    });

    it('空字符串', () => {
      expect(parseKVString('')).toEqual({});
    });
  });
});
