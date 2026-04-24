import { describe, it, expect } from 'vitest';

// ===== 前端表单验证深度测试 =====
describe('Form Validation Deep', () => {
  type Rule = { type: string; value?: any; message: string };

  const validate = (value: string, rules: Rule[]): string | null => {
    for (const rule of rules) {
      switch (rule.type) {
        case 'required':
          if (!value || value.trim() === '') return rule.message;
          break;
        case 'minLength':
          if (value.length < rule.value) return rule.message;
          break;
        case 'maxLength':
          if (value.length > rule.value) return rule.message;
          break;
        case 'pattern':
          if (!new RegExp(rule.value).test(value)) return rule.message;
          break;
        case 'email':
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return rule.message;
          break;
        case 'stockCode':
          if (!/^[0-9]{6}$/.test(value)) return rule.message;
          break;
        case 'numeric':
          if (isNaN(Number(value))) return rule.message;
          break;
        case 'range': {
          const n = Number(value);
          if (n < rule.value[0] || n > rule.value[1]) return rule.message;
          break;
        }
      }
    }
    return null;
  };

  describe('required', () => {
    it('空值应报错', () => {
      expect(validate('', [{ type: 'required', message: '必填' }])).toBe('必填');
    });

    it('有值应通过', () => {
      expect(validate('abc', [{ type: 'required', message: '必填' }])).toBeNull();
    });

    it('纯空格应报错', () => {
      expect(validate('   ', [{ type: 'required', message: '必填' }])).toBe('必填');
    });
  });

  describe('minLength', () => {
    it('不足应报错', () => {
      expect(validate('ab', [{ type: 'minLength', value: 3, message: '至少3位' }])).toBe('至少3位');
    });

    it('足够应通过', () => {
      expect(validate('abc', [{ type: 'minLength', value: 3, message: '至少3位' }])).toBeNull();
    });
  });

  describe('maxLength', () => {
    it('超出应报错', () => {
      expect(validate('abcd', [{ type: 'maxLength', value: 3, message: '最多3位' }])).toBe('最多3位');
    });

    it('未超出应通过', () => {
      expect(validate('ab', [{ type: 'maxLength', value: 3, message: '最多3位' }])).toBeNull();
    });
  });

  describe('email', () => {
    it('有效邮箱', () => {
      expect(validate('test@example.com', [{ type: 'email', message: '无效邮箱' }])).toBeNull();
    });

    it('无效邮箱', () => {
      expect(validate('not-email', [{ type: 'email', message: '无效邮箱' }])).toBe('无效邮箱');
    });

    it('缺少@', () => {
      expect(validate('test.com', [{ type: 'email', message: '无效邮箱' }])).toBe('无效邮箱');
    });
  });

  describe('stockCode', () => {
    it('6位数字', () => {
      expect(validate('600519', [{ type: 'stockCode', message: '无效代码' }])).toBeNull();
    });

    it('非数字', () => {
      expect(validate('abcdef', [{ type: 'stockCode', message: '无效代码' }])).toBe('无效代码');
    });

    it('少于6位', () => {
      expect(validate('60051', [{ type: 'stockCode', message: '无效代码' }])).toBe('无效代码');
    });
  });

  describe('numeric', () => {
    it('有效数字', () => {
      expect(validate('42', [{ type: 'numeric', message: '非数字' }])).toBeNull();
      expect(validate('-3.14', [{ type: 'numeric', message: '非数字' }])).toBeNull();
    });

    it('非数字', () => {
      expect(validate('abc', [{ type: 'numeric', message: '非数字' }])).toBe('非数字');
    });
  });

  describe('range', () => {
    it('范围内', () => {
      expect(validate('50', [{ type: 'range', value: [0, 100], message: '超出范围' }])).toBeNull();
    });

    it('超出上限', () => {
      expect(validate('101', [{ type: 'range', value: [0, 100], message: '超出范围' }])).toBe('超出范围');
    });

    it('低于下限', () => {
      expect(validate('-1', [{ type: 'range', value: [0, 100], message: '超出范围' }])).toBe('超出范围');
    });
  });

  describe('多规则组合', () => {
    const rules: Rule[] = [
      { type: 'required', message: '必填' },
      { type: 'minLength', value: 6, message: '至少6位' },
      { type: 'stockCode', message: '需6位数字' },
    ];

    it('空值报第一个错误', () => {
      expect(validate('', rules)).toBe('必填');
    });

    it('不足长度报第二个错误', () => {
      expect(validate('600', rules)).toBe('至少6位');
    });

    it('格式错误报第三个错误', () => {
      expect(validate('abcdef', rules)).toBe('需6位数字');
    });

    it('全部通过', () => {
      expect(validate('600519', rules)).toBeNull();
    });
  });
});

// ===== 前端数据筛选测试 =====
describe('Data Filter & Query Logic', () => {
  interface StockData {
    code: string;
    name: string;
    price: number;
    changePct: number;
    pe: number;
    marketCap: number;
    turnover: number;
    sector: string;
  }

  const filterStocks = (stocks: StockData[], conditions: Record<string, any>): StockData[] => {
    return stocks.filter(s => {
      for (const [key, cond] of Object.entries(conditions)) {
        const val = (s as any)[key];
        if (cond.$gt !== undefined && val <= cond.$gt) return false;
        if (cond.$lt !== undefined && val >= cond.$lt) return false;
        if (cond.$gte !== undefined && val < cond.$gte) return false;
        if (cond.$lte !== undefined && val > cond.$lte) return false;
        if (cond.$eq !== undefined && val !== cond.$eq) return false;
        if (cond.$in !== undefined && !cond.$in.includes(val)) return false;
        if (cond.$between !== undefined && (val < cond.$between[0] || val > cond.$between[1])) return false;
      }
      return true;
    });
  };

  const sortStocks = (stocks: StockData[], field: keyof StockData, dir: 'asc' | 'desc'): StockData[] => {
    return [...stocks].sort((a, b) => {
      const va = a[field], vb = b[field];
      if (typeof va === 'number' && typeof vb === 'number') {
        return dir === 'asc' ? va - vb : vb - va;
      }
      return dir === 'asc' ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    });
  };

  const sampleData: StockData[] = [
    { code: '600519', name: '贵州茅台', price: 1850, changePct: 2.1, pe: 35, marketCap: 20000, turnover: 50, sector: '白酒' },
    { code: '000858', name: '五粮液', price: 150, changePct: 1.5, pe: 25, marketCap: 5000, turnover: 30, sector: '白酒' },
    { code: '300750', name: '宁德时代', price: 200, changePct: -1.2, pe: 60, marketCap: 8000, turnover: 80, sector: '新能源' },
    { code: '688001', name: '华兴源创', price: 50, changePct: 3.5, pe: 100, marketCap: 500, turnover: 100, sector: '半导体' },
    { code: '601318', name: '中国平安', price: 45, changePct: -0.5, pe: 8, marketCap: 9000, turnover: 20, sector: '保险' },
  ];

  it('$gt筛选', () => {
    expect(filterStocks(sampleData, { changePct: { $gt: 0 } }).length).toBe(3);
  });

  it('$lt筛选', () => {
    expect(filterStocks(sampleData, { pe: { $lt: 30 } }).length).toBe(2);
  });

  it('$in筛选', () => {
    expect(filterStocks(sampleData, { sector: { $in: ['白酒', '半导体'] } }).length).toBe(3);
  });

  it('$between筛选', () => {
    expect(filterStocks(sampleData, { marketCap: { $between: [1000, 10000] } }).length).toBe(3);
  });

  it('组合条件AND', () => {
    const result = filterStocks(sampleData, { changePct: { $gt: 0 }, pe: { $lt: 50 } });
    expect(result.length).toBe(2);
  });

  it('无结果', () => {
    expect(filterStocks(sampleData, { price: { $gt: 10000 } })).toEqual([]);
  });

  it('$eq精确匹配', () => {
    expect(filterStocks(sampleData, { code: { $eq: '600519' } }).length).toBe(1);
  });

  it('$gte/$lte范围', () => {
    expect(filterStocks(sampleData, { price: { $gte: 45, $lte: 200 } }).length).toBe(4);
  });

  describe('排序', () => {
    it('按价格升序', () => {
      const sorted = sortStocks(sampleData, 'price', 'asc');
      expect(sorted[0].code).toBe('601318');
    });

    it('按涨跌幅降序', () => {
      const sorted = sortStocks(sampleData, 'changePct', 'desc');
      expect(sorted[0].changePct).toBe(3.5);
    });

    it('按名称排序', () => {
      const sorted = sortStocks(sampleData, 'name', 'asc');
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i].name.localeCompare(sorted[i - 1].name)).toBeGreaterThanOrEqual(0);
      }
    });

    it('不应修改原数组', () => {
      sortStocks(sampleData, 'price', 'desc');
      expect(sampleData[0].code).toBe('600519');
    });
  });

  describe('组合筛选+排序', () => {
    it('应正确链式', () => {
      const filtered = filterStocks(sampleData, { changePct: { $gt: 0 } });
      const sorted = sortStocks(filtered, 'changePct', 'desc');
      expect(sorted[0].changePct).toBe(3.5);
      expect(sorted[sorted.length - 1].changePct).toBe(1.5);
    });
  });
});
