import { describe, it, expect } from 'vitest';

/**
 * 增强格式化器测试
 */

function formatNumber(num: number, decimals: number = 2): string {
  if (Math.abs(num) >= 1e12) return (num / 1e12).toFixed(decimals) + '万亿';
  if (Math.abs(num) >= 1e8) return (num / 1e8).toFixed(decimals) + '亿';
  if (Math.abs(num) >= 1e4) return (num / 1e4).toFixed(decimals) + '万';
  return num.toFixed(decimals);
}

function formatPercent(num: number, showSign: boolean = true): string {
  const sign = showSign && num > 0 ? '+' : '';
  return sign + num.toFixed(2) + '%';
}

function formatPrice(price: number, tickSize: number = 0.01): string {
  const rounded = Math.round(price / tickSize) * tickSize;
  return rounded.toFixed(tickSize < 0.01 ? 4 : 2);
}

function formatVolume(vol: number): string {
  if (vol >= 1e8) return (vol / 1e8).toFixed(2) + '亿手';
  if (vol >= 1e4) return (vol / 1e4).toFixed(2) + '万手';
  return vol.toFixed(0) + '手';
}

function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}秒前`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}分钟前`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}小时前`;
  return `${Math.floor(seconds / 86400)}天前`;
}

function formatStockCode(code: string): string {
  if (code.startsWith('6') || code.startsWith('9')) return `SH${code}`;
  if (code.startsWith('0') || code.startsWith('3') || code.startsWith('2')) return `SZ${code}`;
  if (code.startsWith('8') || code.startsWith('4')) return `BJ${code}`;
  return code;
}

describe('Enhanced Formatters', () => {
  describe('formatNumber', () => {
    it('应该格式化万亿级别', () => {
      expect(formatNumber(1.5e12)).toBe('1.50万亿');
      expect(formatNumber(25000e8)).toBe('2.50万亿');
    });

    it('应该格式化亿级别', () => {
      expect(formatNumber(5e8)).toBe('5.00亿');
      expect(formatNumber(1234567890)).toBe('12.35亿');
    });

    it('应该格式化万级别', () => {
      expect(formatNumber(50000)).toBe('5.00万');
    });

    it('应该格式化小数字', () => {
      expect(formatNumber(1234)).toBe('1234.00');
    });

    it('应该支持自定义小数位', () => {
      expect(formatNumber(5e8, 0)).toBe('5亿');
      expect(formatNumber(5e8, 4)).toBe('5.0000亿');
    });

    it('应该处理负数', () => {
      expect(formatNumber(-5e8)).toBe('-5.00亿');
    });

    it('应该处理零', () => {
      expect(formatNumber(0)).toBe('0.00');
    });
  });

  describe('formatPercent', () => {
    it('应该显示正号', () => {
      expect(formatPercent(2.35)).toBe('+2.35%');
    });

    it('应该显示负号', () => {
      expect(formatPercent(-1.5)).toBe('-1.50%');
    });

    it('应该不显示正号当showSign为false', () => {
      expect(formatPercent(2.35, false)).toBe('2.35%');
    });

    it('零应该不显示符号', () => {
      expect(formatPercent(0)).toBe('0.00%');
    });
  });

  describe('formatPrice', () => {
    it('应该格式化股票价格', () => {
      expect(formatPrice(12.34)).toBe('12.34');
      expect(formatPrice(12.345)).toBe('12.35');
    });

    it('应该支持不同最小变动单位', () => {
      expect(formatPrice(12.3456, 0.0001)).toBe('12.3456');
    });

    it('应该处理整数价格', () => {
      expect(formatPrice(100)).toBe('100.00');
    });
  });

  describe('formatVolume', () => {
    it('应该格式化亿手', () => {
      expect(formatVolume(150000000)).toBe('1.50亿手');
    });

    it('应该格式化万手', () => {
      expect(formatVolume(50000)).toBe('5.00万手');
    });

    it('应该格式化手', () => {
      expect(formatVolume(500)).toBe('500手');
    });
  });

  describe('formatTimeAgo', () => {
    it('应该格式化秒', () => {
      const ts = Date.now() - 30000;
      expect(formatTimeAgo(ts)).toBe('30秒前');
    });

    it('应该格式化分钟', () => {
      const ts = Date.now() - 5 * 60000;
      expect(formatTimeAgo(ts)).toBe('5分钟前');
    });

    it('应该格式化小时', () => {
      const ts = Date.now() - 3 * 3600000;
      expect(formatTimeAgo(ts)).toBe('3小时前');
    });

    it('应该格式化天', () => {
      const ts = Date.now() - 2 * 86400000;
      expect(formatTimeAgo(ts)).toBe('2天前');
    });
  });

  describe('formatStockCode', () => {
    it('应该标记上海股票', () => {
      expect(formatStockCode('600519')).toBe('SH600519');
      expect(formatStockCode('900901')).toBe('SH900901');
    });

    it('应该标记深圳股票', () => {
      expect(formatStockCode('000001')).toBe('SZ000001');
      expect(formatStockCode('300750')).toBe('SZ300750');
      expect(formatStockCode('200001')).toBe('SZ200001');
    });

    it('应该标记北京股票', () => {
      expect(formatStockCode('830001')).toBe('BJ830001');
      expect(formatStockCode('430001')).toBe('BJ430001');
    });
  });
});
