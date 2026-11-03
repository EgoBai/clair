/**
 * 共享类型定义完整性测试
 *
 * 生产实现（唯一真源）：frontend/src/utils/formatters.ts —— 页面实际消费的格式化层
 * （App.optimized.tsx / ReportCenterPage / PortfolioPage / FundFlowPage / RiskCenterPage）。
 *
 * 影子治理批次 10：删除文件内自抄的 16 个格式化实现，改为跨包 import 真实实现。
 * 跨包导入先例见 backend/src/__tests__/quant*.test.ts（批次 3）；backend/vitest.config.ts
 * 未覆盖 resolve.extensions（默认 .js 先于 .ts），但 frontend/src/utils/ 下只有 .ts 无同名 .js，
 * 因此无后缀导入命中 .ts 源码，无需改配置。
 *
 * 未迁移：formatPrice —— frontend/src/utils/formatters.ts 无该导出；shared/formatters.ts 有同名
 * 实现，但无 decimals 参数、无 isFinite 守卫且无产品代码引用，故保留本地 helper。
 *
 * 本批按生产真实输出改口径（旧自抄实现来自 shared/formatters.ts 的防御版本）：
 * - formatMarketCap(0)              '0'   → '0.00'（生产小值走 toFixed(2)，不再 toString）
 * - formatMarketCap(null)           '-'   → '--'  （生产空值统一 '--'）
 * - formatMarketCap(undefined)      '-'   → '--'
 * - formatDate('invalid')           '-'   → '--'
 * - formatVolume(null)              '-'   → 'null手'（生产缺口，见用例内注释）
 */
import { describe, it, expect } from 'vitest';
import {
  formatNumber,
  formatMarketCap,
  formatVolume,
  formatTurnover,
  formatChangePercent,
  formatChange,
  formatTurnoverRate,
  getChangeColor,
  getChangeHexColor,
  formatSymbol,
  getMarketLabel,
  formatDate,
  formatDateTime,
  formatLargeNumber,
  getColorByChange,
  getMarketColor,
} from '../../../frontend/src/utils/formatters';

// 未迁移：frontend 生产层没有导出的通用 formatPrice —— 价格展示由各组件内联 toFixed(2)
// （如 components/Market/MarketIndexPanel.tsx:149 的本地函数，无 NaN/Infinity 守卫、无 decimals
// 参数，契约不同），保留本地 helper 直至生产提供同名实现。
const formatPrice = (price?: number | null): string => {
  if (price === undefined || price === null) return '-';
  return price.toFixed(2);
};

describe('共享格式化函数', () => {
  describe('formatNumber', () => {
    it('应带千分位', () => {
      const result = formatNumber(1234567.89);
      expect(result).toContain(',');
    });

    it('应保留小数位', () => {
      const result = formatNumber(1234.5678, 3);
      const parts = result.split('.');
      expect(parts[1].length).toBe(3);
    });

    it('应处理大数字', () => {
      const result = formatNumber(999999999.99);
      expect(result).toContain(',');
    });
  });

  describe('formatMarketCap', () => {
    it('应正确格式化万亿级别', () => {
      const result = formatMarketCap(2.5e12);
      expect(result).toContain('万亿');
    });

    it('应正确格式化亿级别', () => {
      const result = formatMarketCap(5e9);
      expect(result).toContain('亿');
      expect(result).not.toContain('万');
    });

    it('应正确格式化万级别', () => {
      const result = formatMarketCap(80000);
      expect(result).toContain('万');
    });

    it('应处理零值', () => {
      // 生产 formatMarketCap(0) = '0.00'（小于 1e4 走 toFixed(2)）；旧自抄版为 '0'。
      expect(formatMarketCap(0)).toBe('0.00');
    });

    it('应处理 null', () => {
      // 生产空值统一返回 '--'；旧自抄版为 '-'。
      expect(formatMarketCap(null)).toBe('--');
    });

    it('应处理 undefined', () => {
      expect(formatMarketCap(undefined)).toBe('--');
    });
  });

  describe('formatVolume', () => {
    it('应格式化亿级别', () => {
      const result = formatVolume(3e8);
      expect(result).toContain('亿手');
    });

    it('应格式化万级别', () => {
      const result = formatVolume(50000);
      expect(result).toContain('万手');
    });

    it('应处理小成交量', () => {
      const result = formatVolume(100);
      expect(result).toContain('手');
    });

    it('应处理 null（生产缺口：formatVolume 无 null 守卫）', () => {
      // 生产签名是 (vol: number)，没有 null/undefined 分支，null 会被原样拼成 'null手'。
      // 旧断言 '-' 对应的是 shared/formatters.ts 的防御实现，产品代码走的是 frontend 实现。
      // 本批按生产现状固化；生产补 null 守卫后此断言应改回 '-'。
      expect(formatVolume(null as unknown as number)).toBe('null手');
    });
  });

  describe('formatTurnover', () => {
    it('应格式化亿级别成交额', () => {
      const result = formatTurnover(1.5e9);
      expect(result).toContain('亿');
    });

    it('应格式化万级别成交额', () => {
      const result = formatTurnover(30000);
      expect(result).toContain('万');
    });
  });

  describe('formatChangePercent', () => {
    it('正数应带加号', () => {
      expect(formatChangePercent(5.2)).toBe('+5.20%');
    });

    it('负数应带减号', () => {
      expect(formatChangePercent(-3.5)).toBe('-3.50%');
    });

    it('零应显示 +0.00%', () => {
      expect(formatChangePercent(0)).toBe('+0.00%');
    });

    it('应处理 null', () => {
      expect(formatChangePercent(null)).toBe('-');
    });
  });

  describe('formatChange', () => {
    it('正数应带加号', () => {
      expect(formatChange(0.56)).toBe('+0.56');
    });

    it('负数应带减号', () => {
      expect(formatChange(-0.5)).toBe('-0.50');
    });

    it('应处理 null', () => {
      expect(formatChange(null)).toBe('-');
    });
  });

  describe('formatTurnoverRate', () => {
    it('应添加百分号', () => {
      expect(formatTurnoverRate(3.5)).toBe('3.50%');
    });

    it('应处理 null', () => {
      expect(formatTurnoverRate(null)).toBe('-');
    });
  });

  describe('formatPrice', () => {
    it('应保留两位小数', () => {
      expect(formatPrice(15.5)).toBe('15.50');
    });

    it('应处理整数', () => {
      expect(formatPrice(10)).toBe('10.00');
    });

    it('应处理 null', () => {
      expect(formatPrice(null)).toBe('-');
    });
  });

  describe('getChangeColor', () => {
    it('涨应为 positive', () => {
      expect(getChangeColor(1)).toBe('positive');
    });

    it('跌应为 negative', () => {
      expect(getChangeColor(-1)).toBe('negative');
    });

    it('平应为 neutral', () => {
      expect(getChangeColor(0)).toBe('neutral');
    });

    it('null 应为 neutral', () => {
      expect(getChangeColor(null)).toBe('neutral');
    });
  });

  describe('getChangeHexColor', () => {
    it('涨应返回红色', () => {
      expect(getChangeHexColor(2.5)).toBe('#EF4444');
    });

    it('跌应返回绿色', () => {
      expect(getChangeHexColor(-2.5)).toBe('#22C55E');
    });

    it('平应返回灰色', () => {
      expect(getChangeHexColor(0)).toBe('#6B7280');
    });
  });

  describe('formatSymbol', () => {
    it('深交所应去掉后缀', () => {
      expect(formatSymbol('000001.SZ')).toBe('000001');
    });

    it('上交所应去掉后缀', () => {
      expect(formatSymbol('600000.SH')).toBe('600000');
    });

    it('北交所应去掉后缀', () => {
      expect(formatSymbol('830000.BJ')).toBe('830000');
    });

    it('无后缀应保留原样', () => {
      expect(formatSymbol('000001')).toBe('000001');
    });
  });

  describe('getMarketLabel', () => {
    it('SH 应返回 上海', () => {
      expect(getMarketLabel('SH')).toBe('上海');
    });

    it('SZ 应返回 深圳', () => {
      expect(getMarketLabel('SZ')).toBe('深圳');
    });

    it('BJ 应返回 北京', () => {
      expect(getMarketLabel('BJ')).toBe('北京');
    });

    it('未知市场应返回原值', () => {
      expect(getMarketLabel('HK')).toBe('HK');
    });
  });

  describe('formatDate', () => {
    it('应正确处理标准日期', () => {
      const result = formatDate('2025-01-15');
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('应格式化 Date 对象', () => {
      const date = new Date(2025, 0, 15);
      expect(formatDate(date)).toBe('2025-01-15');
    });

    it('应处理时间戳', () => {
      const ts = new Date('2025-06-01').getTime();
      expect(formatDate(ts)).toContain('2025');
    });

    it('无效日期应返回 --', () => {
      // 生产 formatDate 无效输入返回 '--'；旧自抄版为 '-'。
      expect(formatDate('invalid')).toBe('--');
    });
  });

  describe('formatDateTime', () => {
    it('应包含日期和时间', () => {
      const date = new Date(2025, 0, 15, 14, 30);
      const result = formatDateTime(date);
      expect(result).toContain('2025-01-15');
      expect(result).toContain('14:30');
    });
  });

  describe('formatLargeNumber', () => {
    it('应格式化千分位', () => {
      expect(formatLargeNumber(1234567)).toContain(',');
    });

    it('NaN 应返回 -', () => {
      expect(formatLargeNumber(NaN)).toBe('-');
    });
  });

  describe('getColorByChange', () => {
    it('涨应返回红色', () => {
      expect(getColorByChange(2)).toBe('#ef4444');
    });

    it('跌应返回绿色', () => {
      expect(getColorByChange(-2)).toBe('#22c55e');
    });

    it('平应返回灰色', () => {
      expect(getColorByChange(0)).toBe('#6b7280');
    });
  });

  describe('getMarketColor', () => {
    it('SH 应返回 blue', () => {
      expect(getMarketColor('SH')).toBe('blue');
    });

    it('SZ 应返回 green', () => {
      expect(getMarketColor('SZ')).toBe('green');
    });

    it('BJ 应返回 orange', () => {
      expect(getMarketColor('BJ')).toBe('orange');
    });

    it('未知市场应返回 default', () => {
      expect(getMarketColor('HK')).toBe('default');
    });
  });
});
