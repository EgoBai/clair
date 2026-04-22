import { describe, it, expect } from 'vitest';

// 前端表单与输入处理测试

interface ValidationRule {
  type: 'required' | 'min' | 'max' | 'pattern' | 'custom';
  value?: any;
  message: string;
  validator?: (val: any) => boolean;
}

interface FieldConfig {
  name: string;
  label: string;
  rules: ValidationRule[];
  defaultValue?: any;
}

function validateField(value: any, rules: ValidationRule[]): string[] {
  const errors: string[] = [];
  for (const rule of rules) {
    switch (rule.type) {
      case 'required':
        if (value === undefined || value === null || value === '') {
          errors.push(rule.message);
        }
        break;
      case 'min':
        if (typeof value === 'number' && value < rule.value) {
          errors.push(rule.message);
        }
        if (typeof value === 'string' && value.length < rule.value) {
          errors.push(rule.message);
        }
        break;
      case 'max':
        if (typeof value === 'number' && value > rule.value) {
          errors.push(rule.message);
        }
        if (typeof value === 'string' && value.length > rule.value) {
          errors.push(rule.message);
        }
        break;
      case 'pattern':
        if (typeof value === 'string' && !new RegExp(rule.value).test(value)) {
          errors.push(rule.message);
        }
        break;
      case 'custom':
        if (rule.validator && !rule.validator(value)) {
          errors.push(rule.message);
        }
        break;
    }
  }
  return errors;
}

function validateForm(
  data: Record<string, any>,
  fields: FieldConfig[]
): { valid: boolean; errors: Record<string, string[]> } {
  const errors: Record<string, string[]> = {};
  for (const field of fields) {
    const fieldErrors = validateField(data[field.name], field.rules);
    if (fieldErrors.length > 0) {
      errors[field.name] = fieldErrors;
    }
  }
  return { valid: Object.keys(errors).length === 0, errors };
}

function sanitizeInput(input: string): string {
  return input
    .replace(/[<>]/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+=/gi, '')
    .trim();
}

function formatStockCode(input: string): string {
  const cleaned = input.replace(/[^0-9]/g, '');
  if (cleaned.length === 6) {
    if (cleaned.startsWith('6')) return 'SH' + cleaned;
    if (cleaned.startsWith('0') || cleaned.startsWith('3')) return 'SZ' + cleaned;
  }
  if (cleaned.length === 8) {
    return cleaned;
  }
  return cleaned.slice(0, 6);
}

function parsePercentage(input: string): number | null {
  const cleaned = input.replace(/%/g, '').trim();
  const num = parseFloat(cleaned);
  if (isNaN(num)) return null;
  return num;
}

function parseAmount(input: string): number | null {
  let cleaned = input.replace(/[,，\s]/g, '').trim();
  let multiplier = 1;
  
  if (cleaned.endsWith('亿')) {
    multiplier = 1e8;
    cleaned = cleaned.slice(0, -1);
  } else if (cleaned.endsWith('万')) {
    multiplier = 1e4;
    cleaned = cleaned.slice(0, -1);
  } else if (cleaned.endsWith('K') || cleaned.endsWith('k')) {
    multiplier = 1e3;
    cleaned = cleaned.slice(0, -1);
  } else if (cleaned.endsWith('M') || cleaned.endsWith('m')) {
    multiplier = 1e6;
    cleaned = cleaned.slice(0, -1);
  }
  
  const num = parseFloat(cleaned);
  if (isNaN(num)) return null;
  return num * multiplier;
}

function debounceSearch(
  fn: (query: string) => void,
  delay: number
): { execute: (query: string) => void; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastQuery = '';
  
  return {
    execute(query: string) {
      lastQuery = query;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        fn(lastQuery);
        timer = null;
      }, delay);
    },
    cancel() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}

function createPagination(
  currentPage: number,
  totalItems: number,
  pageSize: number
): {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  startIndex: number;
  endIndex: number;
  hasNext: boolean;
  hasPrev: boolean;
  pages: number[];
} {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const page = Math.max(1, Math.min(currentPage, totalPages));
  const startIndex = (page - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);
  
  const pages: number[] = [];
  const maxVisible = 5;
  let start = Math.max(1, page - Math.floor(maxVisible / 2));
  const end = Math.min(totalPages, start + maxVisible - 1);
  start = Math.max(1, end - maxVisible + 1);
  
  for (let i = start; i <= end; i++) {
    pages.push(i);
  }
  
  return {
    currentPage: page,
    totalPages,
    totalItems,
    startIndex,
    endIndex,
    hasNext: page < totalPages,
    hasPrev: page > 1,
    pages,
  };
}

describe('前端表单与输入处理', () => {
  describe('字段验证', () => {
    it('required - 空值报错', () => {
      const errors = validateField('', [{ type: 'required', message: '必填' }]);
      expect(errors).toContain('必填');
    });

    it('required - null报错', () => {
      const errors = validateField(null, [{ type: 'required', message: '必填' }]);
      expect(errors).toContain('必填');
    });

    it('required - 有值通过', () => {
      const errors = validateField('hello', [{ type: 'required', message: '必填' }]);
      expect(errors).toHaveLength(0);
    });

    it('min - 数字低于最小值', () => {
      const errors = validateField(5, [{ type: 'min', value: 10, message: '最小10' }]);
      expect(errors).toContain('最小10');
    });

    it('min - 字符串长度不足', () => {
      const errors = validateField('ab', [{ type: 'min', value: 3, message: '至少3字符' }]);
      expect(errors).toContain('至少3字符');
    });

    it('max - 数字超最大值', () => {
      const errors = validateField(100, [{ type: 'max', value: 50, message: '最大50' }]);
      expect(errors).toContain('最大50');
    });

    it('pattern - 正则不匹配', () => {
      const errors = validateField('abc', [{ type: 'pattern', value: '^\\d+$', message: '仅数字' }]);
      expect(errors).toContain('仅数字');
    });

    it('pattern - 正则匹配', () => {
      const errors = validateField('123', [{ type: 'pattern', value: '^\\d+$', message: '仅数字' }]);
      expect(errors).toHaveLength(0);
    });

    it('custom - 自定义验证失败', () => {
      const errors = validateField(5, [{
        type: 'custom',
        message: '必须偶数',
        validator: (v: number) => v % 2 === 0,
      }]);
      expect(errors).toContain('必须偶数');
    });

    it('custom - 自定义验证通过', () => {
      const errors = validateField(4, [{
        type: 'custom',
        message: '必须偶数',
        validator: (v: number) => v % 2 === 0,
      }]);
      expect(errors).toHaveLength(0);
    });
  });

  describe('表单验证', () => {
    const fields: FieldConfig[] = [
      { name: 'code', label: '代码', rules: [{ type: 'required', message: '代码必填' }] },
      { name: 'price', label: '价格', rules: [
        { type: 'required', message: '价格必填' },
        { type: 'min', value: 0, message: '价格不能为负' },
      ]},
    ];

    it('有效表单', () => {
      const result = validateForm({ code: '600519', price: 100 }, fields);
      expect(result.valid).toBe(true);
      expect(Object.keys(result.errors)).toHaveLength(0);
    });

    it('无效表单', () => {
      const result = validateForm({ code: '', price: -1 }, fields);
      expect(result.valid).toBe(false);
      expect(result.errors.code).toBeDefined();
      expect(result.errors.price).toBeDefined();
    });

    it('部分有效', () => {
      const result = validateForm({ code: '600519', price: -1 }, fields);
      expect(result.valid).toBe(false);
      expect(result.errors.code).toBeUndefined();
      expect(result.errors.price).toBeDefined();
    });
  });

  describe('输入清理', () => {
    it('移除HTML标签', () => {
      expect(sanitizeInput('hello<script>')).toBe('helloscript');
    });

    it('移除javascript协议', () => {
      expect(sanitizeInput('javascript:alert(1)')).toBe('alert(1)');
    });

    it('移除事件处理器', () => {
      expect(sanitizeInput('onclick=alert(1)')).toBe('alert(1)');
    });

    it('保留正常文本', () => {
      expect(sanitizeInput('正常文本')).toBe('正常文本');
    });

    it('去除首尾空格', () => {
      expect(sanitizeInput('  hello  ')).toBe('hello');
    });
  });

  describe('股票代码格式化', () => {
    it('上证6位代码', () => {
      expect(formatStockCode('600519')).toBe('SH600519');
    });

    it('深证0开头', () => {
      expect(formatStockCode('000858')).toBe('SZ000858');
    });

    it('创业板3开头', () => {
      expect(formatStockCode('300750')).toBe('SZ300750');
    });

    it('非数字字符去除', () => {
      expect(formatStockCode('600-519')).toBe('SH600519');
    });

    it('截断至6位', () => {
      expect(formatStockCode('123456789')).toBe('123456');
    });
  });

  describe('百分比解析', () => {
    it('带%号', () => {
      expect(parsePercentage('5.2%')).toBeCloseTo(5.2);
    });

    it('不带%号', () => {
      expect(parsePercentage('3.5')).toBeCloseTo(3.5);
    });

    it('负百分比', () => {
      expect(parsePercentage('-2.1%')).toBeCloseTo(-2.1);
    });

    it('无效输入', () => {
      expect(parsePercentage('abc')).toBe(null);
    });

    it('空字符串', () => {
      expect(parsePercentage('')).toBe(null);
    });
  });

  describe('金额解析', () => {
    it('亿单位', () => {
      expect(parseAmount('1.5亿')).toBeCloseTo(1.5e8);
    });

    it('万单位', () => {
      expect(parseAmount('50万')).toBe(500000);
    });

    it('K单位', () => {
      expect(parseAmount('10K')).toBe(10000);
    });

    it('M单位', () => {
      expect(parseAmount('2M')).toBe(2000000);
    });

    it('纯数字', () => {
      expect(parseAmount('1000000')).toBe(1000000);
    });

    it('含逗号', () => {
      expect(parseAmount('1,000,000')).toBe(1000000);
    });

    it('无效输入', () => {
      expect(parseAmount('abc')).toBe(null);
    });

    it('空字符串', () => {
      expect(parseAmount('')).toBe(null);
    });
  });

  describe('分页逻辑', () => {
    it('第一页', () => {
      const p = createPagination(1, 100, 10);
      expect(p.currentPage).toBe(1);
      expect(p.totalPages).toBe(10);
      expect(p.hasNext).toBe(true);
      expect(p.hasPrev).toBe(false);
      expect(p.startIndex).toBe(0);
    });

    it('最后一页', () => {
      const p = createPagination(10, 100, 10);
      expect(p.currentPage).toBe(10);
      expect(p.hasNext).toBe(false);
      expect(p.hasPrev).toBe(true);
    });

    it('超出页码回退', () => {
      const p = createPagination(20, 100, 10);
      expect(p.currentPage).toBe(10);
    });

    it('页码低于1', () => {
      const p = createPagination(0, 100, 10);
      expect(p.currentPage).toBe(1);
    });

    it('不满一页', () => {
      const p = createPagination(1, 5, 10);
      expect(p.totalPages).toBe(1);
      expect(p.endIndex).toBe(5);
    });

    it('零数据', () => {
      const p = createPagination(1, 0, 10);
      expect(p.totalPages).toBe(1);
      expect(p.totalItems).toBe(0);
    });

    it('页码列表生成', () => {
      const p = createPagination(5, 200, 10);
      expect(p.pages).toContain(5);
      expect(p.pages.length).toBeLessThanOrEqual(5);
    });

    it('页码列表包含首尾附近', () => {
      const p = createPagination(1, 500, 10);
      expect(p.pages).toContain(1);
    });
  });

  describe('防抖搜索', () => {
    it('创建防抖实例', () => {
      const results: string[] = [];
      const debounced = debounceSearch((q) => results.push(q), 50);
      debounced.execute('a');
      debounced.execute('ab');
      debounced.execute('abc');
      expect(results.length).toBe(0); // 还未触发
      debounced.cancel();
    });

    it('取消防抖', () => {
      const results: string[] = [];
      const debounced = debounceSearch((q) => results.push(q), 50);
      debounced.execute('test');
      debounced.cancel();
      expect(results.length).toBe(0);
    });
  });
});
