/**
 * 搜索工具 - 单元测试
 */

import { describe, it, expect } from 'vitest';
import { matchStock, searchAndSort, getPinyinInitials } from '../utils/search';

// ==================== matchStock 测试 ====================

describe('matchStock', () => {
  it('代码精确匹配应该得分最高', () => {
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

  it('拼音首字母匹配', () => {
    const result = matchStock('gzmt', '600519', '贵州茅台');
    expect(result.matched).toBe(true);
    expect(result.score).toBe(400);
  });

  it('不匹配应该返回false', () => {
    const result = matchStock('xyz', '600519', '贵州茅台');
    expect(result.matched).toBe(false);
  });

  it('空查询应该匹配所有', () => {
    const result = matchStock('', '600519', '贵州茅台');
    expect(result.matched).toBe(true);
  });

  it('不区分大小写', () => {
    const result = matchStock('GZMT', '600519', '贵州茅台');
    // 大写转小写后应该匹配拼音首字母
    expect(result.matched).toBe(true);
  });
});

// ==================== searchAndSort 测试 ====================

describe('searchAndSort', () => {
  const stocks = [
    { symbol: '600519', name: '贵州茅台', market: 'SH', industry: '白酒' },
    { symbol: '000858', name: '五粮液', market: 'SZ', industry: '白酒' },
    { symbol: '601318', name: '中国平安', market: 'SH', industry: '保险' },
    { symbol: '000001', name: '平安银行', market: 'SZ', industry: '银行' },
    { symbol: '600036', name: '招商银行', market: 'SH', industry: '银行' },
  ];

  it('空查询应该返回所有结果', () => {
    const result = searchAndSort(stocks, '');
    expect(result).toHaveLength(5);
  });

  it('代码搜索应该精确匹配排最前', () => {
    const result = searchAndSort(stocks, '600519');
    expect(result[0].symbol).toBe('600519');
  });

  it('名称搜索应该正确过滤', () => {
    const result = searchAndSort(stocks, '银行');
    expect(result).toHaveLength(2);
    expect(result.some(s => s.name === '平安银行')).toBe(true);
    expect(result.some(s => s.name === '招商银行')).toBe(true);
  });

  it('拼音搜索应该工作', () => {
    const result = searchAndSort(stocks, 'zgpa');
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].name).toBe('中国平安');
  });

  it('代码前缀搜索', () => {
    const result = searchAndSort(stocks, '600');
    expect(result.length).toBeGreaterThan(0);
    result.forEach(s => expect(s.symbol).toContain('600'));
  });

  it('不匹配的查询应该返回空', () => {
    const result = searchAndSort(stocks, '不存在的股票xyz');
    expect(result).toHaveLength(0);
  });
});

// ==================== getPinyinInitials 测试 ====================

describe('getPinyinInitials', () => {
  it('应该返回已知股票的拼音首字母', () => {
    expect(getPinyinInitials('贵州茅台')).toBe('gzmt');
    expect(getPinyinInitials('中国平安')).toBe('zgpa');
    expect(getPinyinInitials('比亚迪')).toBe('byd');
  });

  it('未知股票应该返回空字符串', () => {
    expect(getPinyinInitials('未知公司')).toBe('');
  });
});
