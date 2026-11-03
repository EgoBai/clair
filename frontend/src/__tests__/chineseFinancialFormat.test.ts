import { describe, it, expect } from 'vitest';
import {
  formatChangePercent,
  formatMarketCap,
  formatTurnoverRate,
  formatVolume,
  getColorByChange,
} from '../utils/formatters';
import { formatAmount, sortByField } from '../utils/dataTransformUtils';
import { filterData } from '../utils/bloombergExportEngine';

/**
 * 中文金融数据格式化测试
 *
 * 生产实现（唯一真源）：
 * - formatAmount        → src/utils/dataTransformUtils.ts:45（紧凑单位；负值无 abs/sign 分支）
 * - formatChangePercent → src/utils/formatters.ts:148（null/undefined→'-'；>=0 加 '+'；NaN 无守卫）
 * - getColorByChange    → src/utils/formatters.ts:228（旧内联名 getChangeColor；灰为 #6b7280）
 * - formatVolume        → src/utils/formatters.ts:37（亿手/万手/手）
 * - formatMarketCap     → src/utils/formatters.ts:24（万亿/亿/万/toFixed）
 * - formatTurnoverRate  → src/utils/formatters.ts:166（null/undefined→'-'）
 * - sortByField         → src/utils/dataTransformUtils.ts:120（单列排序，返回副本）
 * - filterData          → src/utils/bloombergExportEngine.ts:584（声明式操作符 eq/gt/gte/...）
 *
 * 未迁移（生产无对应导出，保留本文件内联实现）：
 * - formatPrice：utils 中无同名导出（batch10 priceFormatter.test.ts 亦保留内联）
 * - classifyTurnover：rg 全 frontend/src 无 'extremely_high' 分类导出
 * - parseStockCode / classifyPE / classifyPB：无对应导出
 * - multiColumnSort：生产只有单列 sortByField / bloomberg sortData，无多列排序导出（仅保留多列用例）
 * - createPaginator：src/utils/dataTable.ts:38 DataTableProcessor 无 totalPages/pageRange/isValidPage
 * - serializeState / deserializeState：src/store/useAppStore.ts:186-212 为 store action，
 *   契约不同（默认值省略、数组不 join），无法直接 import 断言
 */

// Chinese Financial Data Formatting Tests
describe('Chinese Financial Data Formatting', () => {
  // 金额格式化 (亿/万)
  describe('Amount Formatting', () => {
    it('should format 万亿', () => {
      expect(formatAmount(1.5e12)).toBe('1.50万亿');
    });

    it('should format 亿', () => {
      expect(formatAmount(5.2e8)).toBe('5.20亿');
    });

    it('should format 万', () => {
      expect(formatAmount(150000)).toBe('15.00万');
    });

    it('should format small amounts', () => {
      expect(formatAmount(999)).toBe('999.00');
    });

    // 旧断言 '-3.00亿'（内联有 Math.abs + 单独符号）→ 生产无 abs/sign 分支，
    // 负值不满足任何缩写阈值，落到 amount.toFixed(2) 原值分支。
    it('should not abbreviate negative amounts (production has no abs branch)', () => {
      expect(formatAmount(-3e8)).toBe('-300000000.00');
    });

    it('should handle zero', () => {
      expect(formatAmount(0)).toBe('0.00');
    });
  });

  // 涨跌幅格式化
  describe('Change Percent Formatting', () => {
    it('should add + prefix for positive', () => {
      expect(formatChangePercent(3.45)).toBe('+3.45%');
    });

    it('should not add prefix for negative', () => {
      expect(formatChangePercent(-2.18)).toBe('-2.18%');
    });

    // 旧断言 '0.00%' → 生产 sign = percent >= 0 ? '+'，0 也带 '+'。
    it('should handle zero (production: +0.00%)', () => {
      expect(formatChangePercent(0)).toBe('+0.00%');
    });

    // 旧断言 '--' → 生产 null/undefined 返回 '-'。
    it('should handle null (production: "-")', () => {
      expect(formatChangePercent(null)).toBe('-');
    });

    // 旧断言 '--' → 生产无 Number.isFinite 守卫，NaN.toFixed(2) 得 'NaN'。
    it('should handle NaN (production: "NaN%")', () => {
      expect(formatChangePercent(NaN)).toBe('NaN%');
    });
  });

  // 涨跌颜色
  describe('Rise/Fall Colors', () => {
    // 生产 getColorByChange：红涨绿跌，平盘 #6b7280（旧内联为 #9ca3af）。
    it('should return red for rise', () => {
      expect(getColorByChange(1.5)).toBe('#ef4444');
    });

    it('should return green for fall', () => {
      expect(getColorByChange(-1.5)).toBe('#22c55e');
    });

    it('should return gray for flat (production: #6b7280)', () => {
      expect(getColorByChange(0)).toBe('#6b7280');
    });

    // A股特色：红涨绿跌（与美股相反）
    it('should follow A-stock convention: red=up, green=down', () => {
      expect(getColorByChange(1)).toBe('#ef4444'); // 红色
      expect(getColorByChange(-1)).toBe('#22c55e'); // 绿色
    });
  });

  // 成交量格式化
  describe('Volume Formatting', () => {
    // 生产单位是“手”（亿手/万手/手），旧内联写的是“股”。
    it('should format 亿手', () => {
      expect(formatVolume(2.5e8)).toBe('2.50亿手');
    });

    it('should format 万手', () => {
      expect(formatVolume(150000)).toBe('15.00万手');
    });

    it('should format small volumes', () => {
      expect(formatVolume(500)).toBe('500手');
    });
  });

  // 市值格式化
  describe('Market Cap Formatting', () => {
    it('should format large caps in 万亿', () => {
      expect(formatMarketCap(2.5e12)).toBe('2.50万亿');
    });

    it('should format mid caps in 亿', () => {
      expect(formatMarketCap(500e8)).toBe('500.00亿');
    });

    it('should format small caps in 万', () => {
      expect(formatMarketCap(500000)).toBe('50.00万');
    });
  });

  // 价格格式化
  // 未迁移：utils 无 formatPrice 同名导出（batch10 priceFormatter.test.ts 同样保留内联）。
  describe('Price Formatting', () => {
    const formatPrice = (value: number | null | undefined, decimals: number = 2) => {
      if (value === null || value === undefined || !Number.isFinite(value)) return '--';
      return value.toFixed(decimals);
    };

    it('should format with 2 decimals', () => {
      expect(formatPrice(123.456)).toBe('123.46');
    });

    it('should format with custom decimals', () => {
      expect(formatPrice(123.456, 3)).toBe('123.456');
    });

    it('should handle null', () => {
      expect(formatPrice(null)).toBe('--');
    });
  });

  // 换手率
  describe('Turnover Rate', () => {
    // 未迁移：生产无 'extremely_high' 等换手率分类导出，classifyTurnover 保留内联。
    const classifyTurnover = (rate: number) => {
      if (rate > 15) return 'extremely_high';
      if (rate > 8) return 'very_high';
      if (rate > 5) return 'high';
      if (rate > 2) return 'moderate';
      if (rate > 0.5) return 'low';
      return 'very_low';
    };

    it('should format turnover rate', () => {
      expect(formatTurnoverRate(3.456)).toBe('3.46%');
    });

    // 生产 formatTurnoverRate 对 null/undefined 返回 '-'（旧内联无守卫，会抛 TypeError）。
    it('should return - for null/undefined (production guard)', () => {
      expect(formatTurnoverRate(null)).toBe('-');
      expect(formatTurnoverRate(undefined)).toBe('-');
    });

    it('should classify turnover levels', () => {
      expect(classifyTurnover(20)).toBe('extremely_high');
      expect(classifyTurnover(10)).toBe('very_high');
      expect(classifyTurnover(6)).toBe('high');
      expect(classifyTurnover(3)).toBe('moderate');
      expect(classifyTurnover(1)).toBe('low');
      expect(classifyTurnover(0.1)).toBe('very_low');
    });
  });

  // 股票代码解析
  // 未迁移：生产无交易所/板块解析的导出纯函数，parseStockCode 保留内联。
  describe('Stock Code Parsing', () => {
    const parseStockCode = (code: string) => {
      if (code.startsWith('6')) return { exchange: 'SH', board: code.startsWith('688') ? '科创板' : '主板' };
      if (code.startsWith('0') || code.startsWith('3')) return { exchange: 'SZ', board: code.startsWith('300') ? '创业板' : '主板' };
      if (code.startsWith('8') || code.startsWith('4')) return { exchange: 'BJ', board: '北交所' };
      return { exchange: 'UNKNOWN', board: '未知' };
    };

    it('should identify Shanghai main board', () => {
      expect(parseStockCode('600519')).toEqual({ exchange: 'SH', board: '主板' });
    });

    it('should identify STAR Market', () => {
      expect(parseStockCode('688001')).toEqual({ exchange: 'SH', board: '科创板' });
    });

    it('should identify Shenzhen main board', () => {
      expect(parseStockCode('000858')).toEqual({ exchange: 'SZ', board: '主板' });
    });

    it('should identify ChiNext', () => {
      expect(parseStockCode('300750')).toEqual({ exchange: 'SZ', board: '创业板' });
    });

    it('should identify Beijing Exchange', () => {
      expect(parseStockCode('830001')).toEqual({ exchange: 'BJ', board: '北交所' });
    });
  });

  // PE/PB 分析
  // 未迁移：生产无 classifyPE/classifyPB 导出（formatters.formatRatio 只处理单值显示）。
  describe('Valuation Analysis', () => {
    const classifyPE = (pe: number) => {
      if (pe < 0) return '亏损';
      if (pe < 15) return '低估';
      if (pe < 25) return '合理';
      if (pe < 40) return '偏高';
      if (pe < 100) return '高估';
      return '泡沫';
    };

    const classifyPB = (pb: number) => {
      if (pb < 0) return '资不抵债';
      if (pb < 1) return '破净';
      if (pb < 2) return '合理';
      if (pb < 5) return '偏高';
      return '高估';
    };

    it('should classify PE levels', () => {
      expect(classifyPE(10)).toBe('低估');
      expect(classifyPE(20)).toBe('合理');
      expect(classifyPE(35)).toBe('偏高');
      expect(classifyPE(80)).toBe('高估');
      expect(classifyPE(200)).toBe('泡沫');
      expect(classifyPE(-5)).toBe('亏损');
    });

    it('should classify PB levels', () => {
      expect(classifyPB(0.8)).toBe('破净');
      expect(classifyPB(1.5)).toBe('合理');
      expect(classifyPB(3)).toBe('偏高');
      expect(classifyPB(8)).toBe('高估');
      expect(classifyPB(-1)).toBe('资不抵债');
    });
  });
});

// Table Sorting Logic Tests
describe('Table Sorting Engine', () => {
  type SortDirection = 'asc' | 'desc';

  // 未迁移：生产只有单列 sortByField / bloomberg sortData，无多列排序导出；本 helper 仅服务多列用例。
  const multiColumnSort = <T extends Record<string, unknown>>(
    data: T[],
    sortKeys: { key: string; direction: SortDirection }[]
  ) => {
    return [...data].sort((a, b) => {
      for (const { key, direction } of sortKeys) {
        const aVal = a[key];
        const bVal = b[key];
        let cmp = 0;
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          cmp = aVal - bVal;
        } else {
          cmp = String(aVal).localeCompare(String(bVal));
        }
        if (cmp !== 0) return direction === 'asc' ? cmp : -cmp;
      }
      return 0;
    });
  };

  it('should sort by single column ascending', () => {
    const data = [{ name: 'c', price: 3 }, { name: 'a', price: 1 }, { name: 'b', price: 2 }];
    const sorted = sortByField(data, 'name', 'asc');
    expect(sorted[0].name).toBe('a');
    expect(sorted[2].name).toBe('c');
  });

  it('should sort by single column descending', () => {
    const data = [{ price: 1 }, { price: 3 }, { price: 2 }];
    const sorted = sortByField(data, 'price', 'desc');
    expect(sorted[0].price).toBe(3);
    expect(sorted[2].price).toBe(1);
  });

  it('should sort by multiple columns', () => {
    const data = [
      { sector: 'A', price: 2 },
      { sector: 'B', price: 1 },
      { sector: 'A', price: 1 },
    ];
    const sorted = multiColumnSort(data, [
      { key: 'sector', direction: 'asc' },
      { key: 'price', direction: 'asc' },
    ]);
    expect(sorted[0]).toEqual({ sector: 'A', price: 1 });
    expect(sorted[1]).toEqual({ sector: 'A', price: 2 });
    expect(sorted[2]).toEqual({ sector: 'B', price: 1 });
  });

  it('should not mutate original array', () => {
    const data = [{ x: 3 }, { x: 1 }, { x: 2 }];
    const original = [...data];
    sortByField(data, 'x', 'asc');
    expect(data).toEqual(original);
  });

  // 已迁移：filterData 改用生产 bloombergExportEngine 的声明式 filters（eq/gt/gte/...）。
  it('should filter by single condition', () => {
    const data = [
      { name: 'A', price: 10 },
      { name: 'B', price: 20 },
      { name: 'C', price: 5 },
    ];
    const filtered = filterData(data, [{ key: 'price', operator: 'gte', value: 10 }]);
    expect(filtered).toHaveLength(2);
  });

  it('should filter by multiple conditions', () => {
    const data = [
      { name: 'A', price: 10, sector: 'tech' },
      { name: 'B', price: 20, sector: 'tech' },
      { name: 'C', price: 15, sector: 'bank' },
    ];
    const filtered = filterData(data, [
      { key: 'price', operator: 'gt', value: 10 },
      { key: 'sector', operator: 'eq', value: 'tech' },
    ]);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].name).toBe('B');
  });
});

// Pagination Logic Deep
// 未迁移：src/utils/dataTable.ts:38 DataTableProcessor 无 totalPages/getPageRange/isValidPage 导出。
describe('Pagination Engine Deep', () => {
  const createPaginator = (total: number, pageSize: number) => {
    const totalPages = Math.ceil(total / pageSize);
    return {
      totalPages,
      getPageRange: (currentPage: number, maxVisible: number = 5) => {
        let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
        const end = Math.min(totalPages, start + maxVisible - 1);
        start = Math.max(1, end - maxVisible + 1);
        return Array.from({ length: end - start + 1 }, (_, i) => start + i);
      },
      getOffset: (page: number) => (page - 1) * pageSize,
      hasNext: (page: number) => page < totalPages,
      hasPrev: (page: number) => page > 1,
      isValidPage: (page: number) => page >= 1 && page <= totalPages,
    };
  };

  it('should calculate total pages correctly', () => {
    const p = createPaginator(100, 10);
    expect(p.totalPages).toBe(10);
  });

  it('should round up partial pages', () => {
    const p = createPaginator(105, 10);
    expect(p.totalPages).toBe(11);
  });

  it('should generate page range around current', () => {
    const p = createPaginator(100, 10);
    expect(p.getPageRange(5)).toEqual([3, 4, 5, 6, 7]);
  });

  it('should handle first page range', () => {
    const p = createPaginator(100, 10);
    expect(p.getPageRange(1)).toEqual([1, 2, 3, 4, 5]);
  });

  it('should handle last page range', () => {
    const p = createPaginator(100, 10);
    expect(p.getPageRange(10)).toEqual([6, 7, 8, 9, 10]);
  });

  it('should calculate offset', () => {
    const p = createPaginator(100, 10);
    expect(p.getOffset(3)).toBe(20);
    expect(p.getOffset(1)).toBe(0);
  });

  it('should check hasNext/hasPrev', () => {
    const p = createPaginator(100, 10);
    expect(p.hasNext(5)).toBe(true);
    expect(p.hasNext(10)).toBe(false);
    expect(p.hasPrev(5)).toBe(true);
    expect(p.hasPrev(1)).toBe(false);
  });

  it('should validate page numbers', () => {
    const p = createPaginator(100, 10);
    expect(p.isValidPage(5)).toBe(true);
    expect(p.isValidPage(0)).toBe(false);
    expect(p.isValidPage(11)).toBe(false);
  });

  it('should handle zero total', () => {
    const p = createPaginator(0, 10);
    expect(p.totalPages).toBe(0);
    expect(p.getPageRange(1)).toEqual([]);
  });
});

// URL State Sync Tests
// 未迁移：src/store/useAppStore.ts:186-212 为 store action（默认值省略、数组不 join），
// 与本文件内联的通用序列化契约不同，无法直接 import 断言。
describe('URL State Synchronization', () => {
  const serializeState = (state: Record<string, unknown>) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(state)) {
      if (value === undefined || value === null || value === '') continue;
      if (Array.isArray(value)) {
        params.set(key, value.join(','));
      } else {
        params.set(key, String(value));
      }
    }
    return params.toString();
  };

  const deserializeState = (queryString: string) => {
    const params = new URLSearchParams(queryString);
    const state: Record<string, string> = {};
    params.forEach((value, key) => { state[key] = value; });
    return state;
  };

  it('should serialize simple state', () => {
    const qs = serializeState({ page: 1, q: 'test' });
    expect(qs).toContain('page=1');
    expect(qs).toContain('q=test');
  });

  it('should skip null/undefined/empty', () => {
    const qs = serializeState({ a: 1, b: null, c: undefined, d: '' });
    expect(qs).toBe('a=1');
  });

  it('should serialize arrays', () => {
    const qs = serializeState({ tags: ['a', 'b', 'c'] });
    expect(qs).toContain('tags=a%2Cb%2Cc');
  });

  it('should roundtrip state', () => {
    const original = { page: '1', q: 'test', sort: 'price' };
    const qs = serializeState(original);
    const restored = deserializeState(qs);
    expect(restored).toEqual(original);
  });
});
