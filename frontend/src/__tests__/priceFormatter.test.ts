/**
 * 价格格式化逻辑测试
 *
 * 生产实现（唯一真源）：
 * - frontend/src/utils/formatters.ts：formatChangePercent（涨跌幅）、formatMarketCap（市值）、
 *   formatVolume（成交量，亿手/万手/手）、formatTurnoverRate（换手率）、getChangeHexColor（涨跌色）、
 *   formatLargeNumber（千分位）、formatChange（价格变动）、formatRatio（PE/PB）
 * - frontend/src/utils/dataTransformUtils.ts：formatAmount（成交额，万亿/亿/万）
 *
 * 影子治理批次 10：删除 10 组自抄实现里的 9 组，改为 import 真实实现。旧自抄版是更「防御」的
 * 口径（isFinite 守卫、万级 toFixed(0)、成交量不带「手」、颜色用 #ff4444/#00aa44/#888888），
 * 与生产不一致；本批按生产真实输出改断言。
 *
 * 未迁移：formatPrice —— 两个生产文件都没有该导出。价格展示由各组件内联 toFixed(2)
 * （如 components/Market/MarketIndexPanel.tsx:149 的本地函数，无 NaN/Infinity 守卫、无 decimals
 * 参数），契约不同，不虚构生产函数，保留本地 helper。
 *
 * 生产缺口（本批按现状固化，生产补守卫后需反转断言）：
 * - formatChangePercent(NaN) → 'NaN%'（无 isFinite 守卫）
 * - formatRatio(Infinity)    → 'Infinity'（无 isFinite 守卫）
 * - formatMarketCap 无负值分支，-100 → '-100.00'
 */
import { describe, it, expect } from 'vitest';
import {
  formatChangePercent,
  formatMarketCap,
  formatVolume,
  formatTurnoverRate,
  getChangeHexColor,
  formatLargeNumber,
  formatChange,
  formatRatio,
} from '../utils/formatters';
import { formatAmount } from '../utils/dataTransformUtils';

// 未迁移：frontend 生产层无 formatPrice 导出（详见文件头）。
const formatPrice = (price: number, decimals: number = 2): string => {
  if (!Number.isFinite(price)) return '--';
  return price.toFixed(decimals);
};

// 价格格式化逻辑测试
describe('Price Formatter Logic', () => {
  // 基础价格格式化（未迁移，本地 helper）
  describe('Basic Price Format', () => {
    it('should format price with 2 decimals', () => {
      expect(formatPrice(1800.5)).toBe('1800.50');
    });

    it('should format integer price', () => {
      expect(formatPrice(1800)).toBe('1800.00');
    });

    it('should format price with 3 decimals', () => {
      expect(formatPrice(1.234, 3)).toBe('1.234');
    });

    it('should handle NaN', () => {
      expect(formatPrice(NaN)).toBe('--');
    });

    it('should handle Infinity', () => {
      expect(formatPrice(Infinity)).toBe('--');
    });

    it('should handle zero', () => {
      expect(formatPrice(0)).toBe('0.00');
    });

    it('should handle negative price', () => {
      expect(formatPrice(-5.5)).toBe('-5.50');
    });
  });

  // 涨跌幅格式化
  describe('Change Percent Format', () => {
    it('should add + for positive change', () => {
      expect(formatChangePercent(3.5)).toBe('+3.50%');
    });

    it('should not add sign for negative change', () => {
      expect(formatChangePercent(-2.3)).toBe('-2.30%');
    });

    it('should show +0.00% for zero', () => {
      // 生产 formatChangePercent(0) 带正号（sign = percent >= 0）；旧自抄版为 '0.00%'。
      expect(formatChangePercent(0)).toBe('+0.00%');
    });

    it('should handle very small positive change', () => {
      expect(formatChangePercent(0.01)).toBe('+0.01%');
    });

    it('should handle NaN', () => {
      // P2 F2：NaN/±Infinity 统一返回 '—'
      expect(formatChangePercent(NaN)).toBe('—');
      expect(formatChangePercent(Infinity)).toBe('—');
    });
  });

  // 市值格式化
  describe('Market Cap Format', () => {
    it('should format 万亿 level', () => {
      expect(formatMarketCap(2.26e12)).toBe('2.26万亿');
    });

    it('should format 亿 level', () => {
      expect(formatMarketCap(5.5e10)).toBe('550.00亿');
    });

    it('should format 万 level', () => {
      // 生产万级用 toFixed(2)；旧自抄版 toFixed(0) 得 '15万'。
      expect(formatMarketCap(150000)).toBe('15.00万');
    });

    it('should handle small value', () => {
      // 生产小于 1e4 走 toFixed(2)；旧自抄版 toString 得 '500'。
      expect(formatMarketCap(500)).toBe('500.00');
    });

    it('should handle negative', () => {
      // P2 F4：市值不可能为负，统一返回 '—'
      expect(formatMarketCap(-100)).toBe('—');
    });
  });

  // 成交量格式化
  describe('Volume Format', () => {
    it('should format 亿 level volume', () => {
      // 生产带「手」单位。
      expect(formatVolume(1.5e8)).toBe('1.50亿手');
    });

    it('should format 万 level volume', () => {
      expect(formatVolume(50000)).toBe('5.00万手');
    });

    it('should format small volume', () => {
      expect(formatVolume(500)).toBe('500手');
    });

    it('should handle zero', () => {
      expect(formatVolume(0)).toBe('0手');
    });
  });

  // 换手率格式化
  describe('Turnover Rate Format', () => {
    it('should format turnover rate', () => {
      expect(formatTurnoverRate(5.5)).toBe('5.50%');
    });

    it('should format zero turnover', () => {
      expect(formatTurnoverRate(0)).toBe('0.00%');
    });

    it('should format high turnover', () => {
      expect(formatTurnoverRate(25.8)).toBe('25.80%');
    });
  });

  // 成交额格式化
  describe('Turnover Amount Format', () => {
    it('should format 万亿 level', () => {
      expect(formatAmount(1.5e12)).toBe('1.50万亿');
    });

    it('should format 亿 level', () => {
      expect(formatAmount(4.5e10)).toBe('450.00亿');
    });

    it('should format 万 level', () => {
      // 生产 dataTransformUtils.formatAmount 万级用 toFixed(2)；旧自抄版 toFixed(0) 得 '25万'。
      expect(formatAmount(250000)).toBe('25.00万');
    });
  });

  // 涨跌颜色
  describe('Change Color', () => {
    it('should return red for positive (A-share)', () => {
      // 生产 getChangeHexColor 大盘红为 #EF4444；旧自抄版为 #ff4444。
      expect(getChangeHexColor(3.5)).toBe('#EF4444');
    });

    it('should return green for negative (A-share)', () => {
      // 生产为 #22C55E；旧自抄版为 #00aa44。
      expect(getChangeHexColor(-2.3)).toBe('#22C55E');
    });

    it('should return gray for zero', () => {
      // 生产为 #6B7280；旧自抄版为 #888888。
      expect(getChangeHexColor(0)).toBe('#6B7280');
    });
  });

  // 千分位格式化
  describe('Thousand Separator', () => {
    it('should add commas to large number', () => {
      expect(formatLargeNumber(1000000)).toBe('1,000,000');
    });

    it('should not add commas to small number', () => {
      expect(formatLargeNumber(500)).toBe('500');
    });

    it('should handle negative number', () => {
      const result = formatLargeNumber(-1000000);
      expect(result).toContain('1,000,000');
    });
  });

  // 价格变动
  describe('Price Change', () => {
    it('should add + sign for increase', () => {
      expect(formatChange(5.5)).toBe('+5.50');
    });

    it('should not add sign for decrease', () => {
      expect(formatChange(-3.2)).toBe('-3.20');
    });

    it('should show +0.00 for no change', () => {
      // 生产 formatChange(0) 带正号（change >= 0）；旧自抄版为 '0.00'。
      expect(formatChange(0)).toBe('+0.00');
    });
  });

  // PE/PB 格式化
  describe('PE/PB Format', () => {
    it('should format positive PE', () => {
      expect(formatRatio(35.5)).toBe('35.50');
    });

    it('should format negative PE', () => {
      // 生产 formatRatio 对负值返回 '亏损'（A股亏损股无 PE）；旧自抄版为 '-15.30'。
      expect(formatRatio(-15.3)).toBe('亏损');
    });

    it('should handle infinity', () => {
      // P2 F3：Infinity 统一返回 '—'
      expect(formatRatio(Infinity)).toBe('—');
      expect(formatRatio(-Infinity)).toBe('—');
    });

    it('should format zero', () => {
      expect(formatRatio(0)).toBe('0.00');
    });
  });
});
