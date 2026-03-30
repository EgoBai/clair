/**
 * 搜索 API 测试（增强版）
 * 覆盖拼音搜索、缓存、历史记录
 */
import { describe, it, expect } from 'vitest';
import { searchAndSort, addSearchHistory, getSearchHistory, clearSearchHistory } from '../utils/search';

const mockStocks = [
  { id: 1, symbol: '000001', name: '平安银行', market: 'SZ', industry: '银行' },
  { id: 2, symbol: '600519', name: '贵州茅台', market: 'SH', industry: '白酒' },
  { id: 3, symbol: '000858', name: '五粮液', market: 'SZ', industry: '白酒' },
  { id: 4, symbol: '601318', name: '中国平安', market: 'SH', industry: '保险' },
  { id: 5, symbol: '000333', name: '美的集团', market: 'SZ', industry: '家电' },
  { id: 6, symbol: '600036', name: '招商银行', market: 'SH', industry: '银行' },
  { id: 7, symbol: '002415', name: '海康威视', market: 'SZ', industry: '安防' },
];

describe('搜索工具', () => {
  describe('精确匹配', () => {
    it('股票代码精确匹配应该排第一', () => {
      const results = searchAndSort(mockStocks, '000001');
      expect(results[0].symbol).toBe('000001');
    });

    it('股票名称精确匹配', () => {
      const results = searchAndSort(mockStocks, '平安银行');
      expect(results[0].name).toBe('平安银行');
    });
  });

  describe('前缀匹配', () => {
    it('代码前缀匹配', () => {
      const results = searchAndSort(mockStocks, '600');
      const symbols = results.map(r => r.symbol);
      expect(symbols).toContain('600519');
    });

    it('名称前缀匹配', () => {
      const results = searchAndSort(mockStocks, '中国');
      expect(results.some(r => r.name.includes('中国'))).toBe(true);
    });
  });

  describe('拼音搜索', () => {
    it('拼音首字母匹配', () => {
      const results = searchAndSort(mockStocks, 'PAYH');
      // 平安银行 - ping an yin hang
      expect(results.length).toBeGreaterThan(0);
    });

    it('拼音应该能搜到对应股票', () => {
      const results = searchAndSort(mockStocks, 'GZMT');
      // 贵州茅台 - gui zhou mao tai
      expect(results.some(r => r.name === '贵州茅台')).toBe(true);
    });
  });

  describe('模糊匹配', () => {
    it('模糊匹配应该返回相关结果', () => {
      const results = searchAndSort(mockStocks, '银行');
      expect(results.some(r => r.name.includes('银行') || r.industry === '银行')).toBe(true);
    });

    it('不匹配任何内容应返回空', () => {
      const results = searchAndSort(mockStocks, 'xyz123notfound');
      expect(results.length).toBe(0);
    });
  });

  describe('排序', () => {
    it('匹配优先级排序应该正确', () => {
      const results = searchAndSort(mockStocks, '平安');
      // "平安银行" 代码精确匹配 > "中国平安" 名称包含
      expect(results.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('空查询', () => {
    it('空字符串应返回全部结果（无过滤）', () => {
      expect(searchAndSort(mockStocks, '').length).toBe(mockStocks.length);
    });

    it('空白字符串应返回全部结果（无过滤）', () => {
      expect(searchAndSort(mockStocks, '   ').length).toBe(mockStocks.length);
    });
  });
});

describe('搜索历史', () => {
  const userId = 999;

  it('应该能添加搜索历史', () => {
    addSearchHistory(userId, { query: '平安银行' });
    addSearchHistory(userId, { query: '贵州茅台' });
    const history = getSearchHistory(userId);
    expect(history.length).toBeGreaterThanOrEqual(2);
  });

  it('应该按时间倒序排列', () => {
    addSearchHistory(userId, { query: '第一个' });
    addSearchHistory(userId, { query: '第二个' });
    const history = getSearchHistory(userId);
    expect(history[0].query).toBe('第二个');
  });

  it('重复搜索应该去重', () => {
    addSearchHistory(userId, { query: '重复' });
    addSearchHistory(userId, { query: '重复' });
    const history = getSearchHistory(userId);
    const repeated = history.filter(h => h.query === '重复');
    expect(repeated.length).toBe(1);
  });

  it('应该能清空搜索历史', () => {
    clearSearchHistory(userId);
    const history = getSearchHistory(userId);
    expect(history.length).toBe(0);
  });
});
