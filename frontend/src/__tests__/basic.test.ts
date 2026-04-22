import { describe, it, expect } from 'vitest';

// 基础测试示例
describe('基础功能测试', () => {
  it('应该正确计算加法', () => {
    expect(1 + 1).toBe(2);
  });

  it('应该正确处理字符串', () => {
    expect('hello'.toUpperCase()).toBe('HELLO');
  });

  it('应该正确检查数组', () => {
    const arr = [1, 2, 3];
    expect(arr).toHaveLength(3);
    expect(arr).toContain(2);
  });
});

// 工具函数测试
describe('格式化工具', () => {
  const formatNumber = (num: number): string => {
    if (num >= 100000000) {
      return (num / 100000000).toFixed(2) + '亿';
    }
    if (num >= 10000) {
      return (num / 10000).toFixed(2) + '万';
    }
    return num.toString();
  };

  it('应该正确格式化大数字', () => {
    expect(formatNumber(123456789)).toBe('1.23亿');
    expect(formatNumber(1234567)).toBe('123.46万');
    expect(formatNumber(1234)).toBe('1234');
  });

  it('应该处理边界情况', () => {
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(9999)).toBe('9999');
    expect(formatNumber(10000)).toBe('1.00万');
    expect(formatNumber(100000000)).toBe('1.00亿');
  });
});
