import { describe, it, expect, beforeEach } from 'vitest';
import { TemplateFormatter } from '../services/notification/templateFormatter';

describe('templateFormatter', () => {
  let formatter: TemplateFormatter;

  beforeEach(() => {
    formatter = new TemplateFormatter();
  });

  describe('format', () => {
    it('should format numbers with default 2 decimals', () => {
      expect(formatter.format('number', 1234.567)).toBe('1,234.57');
    });

    it('should format numbers with custom decimals', () => {
      expect(formatter.format('number', 1234.567, { decimals: 0 })).toBe('1,235');
    });

    it('should format percentage with sign', () => {
      expect(formatter.format('percent', 5.25)).toBe('+5.25%');
      expect(formatter.format('percent', -3.5)).toBe('-3.50%');
      expect(formatter.format('percent', 0)).toBe('0.00%');
    });

    it('should format chinese units', () => {
      expect(formatter.format('chineseUnit', 1e8)).toBe('1.00亿');
      expect(formatter.format('chineseUnit', 5e4)).toBe('5.00万');
      expect(formatter.format('chineseUnit', 999)).toBe('999.00');
    });

    it('should format currency', () => {
      const result = formatter.format('currency', 1234.5);
      expect(result).toContain('1');
      expect(result).toContain('234');
    });

    it('should format conditional', () => {
      expect(formatter.format('conditional', 5)).toBe('+5');
      expect(formatter.format('conditional', -3)).toBe('-3');
      expect(formatter.format('conditional', 0)).toBe('0');
    });

    it('should return change colors', () => {
      expect(formatter.format('changeColor', 1)).toBe('#ff4d4f');
      expect(formatter.format('changeColor', -1)).toBe('#52c41a');
      expect(formatter.format('changeColor', 0)).toBe('#888');
    });

    it('should return change labels', () => {
      expect(formatter.format('changeLabel', 5)).toBe('📈 +5%');
      expect(formatter.format('changeLabel', -3)).toBe('📉 -3%');
      expect(formatter.format('changeLabel', 0)).toBe('➡️ 0%');
    });

    it('should format stock codes', () => {
      expect(formatter.format('stockCode', '600036')).toBe('SH.600036');
      expect(formatter.format('stockCode', '000001')).toBe('SZ.000001');
      expect(formatter.format('stockCode', '300750')).toBe('SZ.300750');
      expect(formatter.format('stockCode', '830001')).toBe('BJ.830001');
    });

    it('should compact large numbers', () => {
      expect(formatter.format('compact', 1e8)).toBe('1.0亿');
      expect(formatter.format('compact', 5e4)).toBe('5.0万');
      expect(formatter.format('compact', 5000)).toBe('5.0k');
      expect(formatter.format('compact', 999)).toBe('999');
    });

    it('should truncate text', () => {
      expect(formatter.format('truncate', 'hello', { length: 3 })).toBe('hel...');
      expect(formatter.format('truncate', 'hi', { length: 5 })).toBe('hi');
    });

    it('should return string for unknown formatter', () => {
      expect(formatter.format('nonexistent', 'test')).toBe('test');
      expect(formatter.format('nonexistent', null)).toBe('');
    });
  });

  describe('render', () => {
    it('should render simple variable', () => {
      const result = formatter.render('Hello {{name}}', { name: 'World' });
      expect(result).toBe('Hello World');
    });

    it('should render with formatter', () => {
      const result = formatter.render('Price: {{price | number}}', { price: 99.567 });
      expect(result).toBe('Price: 99.57');
    });

    it('should render with formatter options', () => {
      const result = formatter.render('Change: {{change | percent}}', { change: 5.25 });
      expect(result).toBe('Change: +5.25%');
    });

    it('should handle missing variables', () => {
      const result = formatter.render('Hello {{name}}', {});
      expect(result).toBe('Hello ');
    });

    it('should handle null values', () => {
      const result = formatter.render('Value: {{val}}', { val: null });
      expect(result).toBe('Value: ');
    });

    it('should render multiple variables', () => {
      const result = formatter.render('{{code}}: {{price}}', { code: '000001', price: 10.5 });
      expect(result).toBe('000001: 10.5');
    });
  });

  describe('register', () => {
    it('should register custom formatter', () => {
      formatter.register('upper', (value) => String(value).toUpperCase());
      expect(formatter.format('upper', 'hello')).toBe('HELLO');
    });

    it('should override existing formatter', () => {
      formatter.format('number', 123); // make sure it exists
      formatter.register('number', (v) => `#${v}`);
      expect(formatter.format('number', 123)).toBe('#123');
    });
  });

  describe('getFormatterNames', () => {
    it('should return all formatter names', () => {
      const names = formatter.getFormatterNames();
      expect(names).toContain('number');
      expect(names).toContain('percent');
      expect(names).toContain('chineseUnit');
      expect(names).toContain('currency');
      expect(names).toContain('conditional');
      expect(names).toContain('changeColor');
      expect(names).toContain('changeLabel');
      expect(names).toContain('stockCode');
      expect(names).toContain('compact');
      expect(names).toContain('truncate');
      expect(names).toContain('relativeTime');
      expect(names).toContain('chineseAmount');
    });
  });

  describe('clear', () => {
    it('should reset to default formatters', () => {
      formatter.register('custom', () => 'test');
      formatter.clear();
      const names = formatter.getFormatterNames();
      expect(names).toContain('number');
      expect(names).not.toContain('custom');
    });
  });
});
