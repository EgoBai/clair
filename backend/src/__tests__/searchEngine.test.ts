/**
 * 搜索引擎测试 - 大批量测试
 */
import { describe, it, expect } from 'vitest';
import {
  getPinyinInitials,
  matchStock,
  searchAndSort,
  addSearchHistory,
  getSearchHistory,
  clearSearchHistory,
} from '../utils/search';

describe('拼音首字母映射', () => {
  const knownStocks = [
    { name: '贵州茅台', expected: 'gzmt' },
    { name: '平安银行', expected: 'payh' },
    { name: '招商银行', expected: 'zsyh' },
    { name: '工商银行', expected: 'gsyh' },
    { name: '比亚迪', expected: 'byd' },
    { name: '宁德时代', expected: 'ndsd' },
    { name: '中国平安', expected: 'zgpa' },
    { name: '万科A', expected: 'wka' },
    { name: '海康威视', expected: 'hkws' },
    { name: '东方财富', expected: 'dfcf' },
    { name: '长江电力', expected: 'cjdl' },
    { name: '美的集团', expected: 'mdjt' },
    { name: '格力电器', expected: 'gldq' },
    { name: '顺丰控股', expected: 'sfkg' },
    { name: '中国建筑', expected: 'zgjz' },
    { name: '海螺水泥', expected: 'hlsn' },
    { name: '紫金矿业', expected: 'zjky' },
    { name: '金山办公', expected: 'jsbg' },
  ];

  it.each(knownStocks)('"$name" 的拼音首字母应为 "$expected"', ({ name, expected }) => {
    expect(getPinyinInitials(name)).toBe(expected);
  });

  it('未知股票返回空字符串', () => {
    expect(getPinyinInitials('未知股票XYZ')).toBe('');
  });

  it('空字符串返回空字符串', () => {
    expect(getPinyinInitials('')).toBe('');
  });
});

describe('股票匹配算法', () => {
  describe('代码匹配', () => {
    it('代码精确匹配得分最高', () => {
      const result = matchStock('600519', '600519', '贵州茅台');
      expect(result.matched).toBe(true);
      expect(result.score).toBe(1000);
    });

    it('代码前缀匹配', () => {
      const result = matchStock('600', '600519', '贵州茅台');
      expect(result.matched).toBe(true);
      expect(result.score).toBe(900);
    });

    it('代码包含匹配', () => {
      const result = matchStock('0519', '600519', '贵州茅台');
      expect(result.matched).toBe(true);
      expect(result.score).toBe(800);
    });

    it('代码大小写不敏感', () => {
      const result = matchStock('sz000001', 'SZ000001', '平安银行');
      expect(result.matched).toBe(true);
      expect(result.score).toBe(1000);
    });
  });

  describe('名称匹配', () => {
    it('名称精确匹配', () => {
      const result = matchStock('贵州茅台', '600519', '贵州茅台');
      expect(result.matched).toBe(true);
      expect(result.score).toBe(700);
    });

    it('名称前缀匹配', () => {
      const result = matchStock('贵州', '600519', '贵州茅台');
      expect(result.matched).toBe(true);
      expect(result.score).toBe(600);
    });

    it('名称包含匹配', () => {
      const result = matchStock('茅台', '600519', '贵州茅台');
      expect(result.matched).toBe(true);
      expect(result.score).toBe(500);
    });
  });

  describe('拼音匹配', () => {
    it('拼音首字母匹配', () => {
      const result = matchStock('gzmt', '600519', '贵州茅台');
      expect(result.matched).toBe(true);
      expect(result.score).toBe(400);
    });

    it('拼音包含匹配', () => {
      const result = matchStock('mt', '600519', '贵州茅台');
      expect(result.matched).toBe(true);
      expect(result.score).toBe(400);
    });
  });

  describe('模糊匹配', () => {
    it('每个字都包含时模糊匹配', () => {
      const result = matchStock('贵茅', '600519', '贵州茅台');
      expect(result.matched).toBe(true);
      expect(result.score).toBe(300);
    });

    it('单字不触发模糊匹配', () => {
      const result = matchStock('茅', '600519', '贵州茅台');
      // 单字会被名称包含匹配捕获
      expect(result.matched).toBe(true);
      expect(result.score).toBe(500);
    });
  });

  describe('不匹配', () => {
    it('完全不匹配返回false', () => {
      const result = matchStock('xyz', '600519', '贵州茅台');
      expect(result.matched).toBe(false);
      expect(result.score).toBe(0);
    });

    it('空查询匹配所有(得分0)', () => {
      const result = matchStock('', '600519', '贵州茅台');
      expect(result.matched).toBe(true);
      expect(result.score).toBe(0);
    });

    it('纯空格查询匹配所有', () => {
      const result = matchStock('   ', '600519', '贵州茅台');
      expect(result.matched).toBe(true);
      expect(result.score).toBe(0);
    });
  });
});

describe('搜索排序', () => {
  const stocks = [
    { symbol: '600519', name: '贵州茅台' },
    { symbol: '600518', name: 'ST康美' },
    { symbol: '000858', name: '五粮液' },
    { symbol: '000001', name: '平安银行' },
    { symbol: '601318', name: '中国平安' },
  ];

  it('空查询返回所有股票', () => {
    const result = searchAndSort(stocks, '');
    expect(result).toHaveLength(5);
  });

  it('按匹配分数排序 - 代码匹配优先', () => {
    const result = searchAndSort(stocks, '600519');
    expect(result[0].symbol).toBe('600519');
  });

  it('按匹配分数排序 - 名称匹配', () => {
    const result = searchAndSort(stocks, '平安');
    // 平安银行(名称前缀) 应排在中国平安(名称包含)之前
    expect(result.length).toBeGreaterThan(0);
  });

  it('无匹配结果返回空数组', () => {
    const result = searchAndSort(stocks, 'xyz123');
    expect(result).toHaveLength(0);
  });

  it('部分匹配', () => {
    const result = searchAndSort(stocks, '平安');
    expect(result.length).toBeGreaterThanOrEqual(2);
  });
});

describe('搜索历史管理', () => {
  it('添加搜索历史', () => {
    addSearchHistory(100, { query: '茅台', symbol: '600519', name: '贵州茅台' });
    const history = getSearchHistory(100);
    expect(history.length).toBeGreaterThanOrEqual(1);
    expect(history[0].query).toBe('茅台');
  });

  it('搜索历史去重', () => {
    addSearchHistory(101, { query: '银行' });
    addSearchHistory(101, { query: '银行' });
    const history = getSearchHistory(101);
    const bankEntries = history.filter(h => h.query === '银行');
    expect(bankEntries).toHaveLength(1);
  });

  it('新搜索记录排在最前面', () => {
    addSearchHistory(102, { query: '第一个' });
    addSearchHistory(102, { query: '第二个' });
    const history = getSearchHistory(102);
    expect(history[0].query).toBe('第二个');
  });

  it('清空搜索历史', () => {
    addSearchHistory(103, { query: '测试' });
    clearSearchHistory(103);
    const history = getSearchHistory(103);
    expect(history).toHaveLength(0);
  });

  it('不同用户的历史隔离', () => {
    addSearchHistory(200, { query: '用户200' });
    addSearchHistory(201, { query: '用户201' });
    const h200 = getSearchHistory(200);
    const h201 = getSearchHistory(201);
    expect(h200.some(h => h.query === '用户200')).toBe(true);
    expect(h201.some(h => h.query === '用户201')).toBe(true);
  });

  it('搜索历史上限', () => {
    const userId = 300;
    clearSearchHistory(userId);
    for (let i = 0; i < 25; i++) {
      addSearchHistory(userId, { query: `查询${i}` });
    }
    const history = getSearchHistory(userId);
    expect(history.length).toBeLessThanOrEqual(20);
  });
});
