/**
 * 影子测试迁移：Advanced Page Logic
 * 原文件 frontend/src/__tests__/advancedPageLogic.test.ts（657 行 / 64 例）
 *
 * 一、原自抄实现的问题
 * 1. 表格配置自造 totalPages/visibleColumns；生产 DataTableProcessor 只暴露 pagination.total，
 *    无列元数据与 totalPages 导出。旧 totalPages 断言改为 total + ceil(total/pageSize)。
 * 2. K 线颜色自抄小写 '#ef4444'/'#22c55e'；生产 chartTheme 为 '#EF4444'/'#22C55E'，已订正。
 * 3. Bollinger 在 period 前自抄补 0、RSI 在 period 前自抄补 50；生产两者都补 null，已订正。
 * 4. RSI 自抄用简单滚动均值；生产 chartDataProcessing 用 Wilder 平滑，期望值按生产公式重算
 *    （自定义 period 用例新增 rsi[6]=52 的平滑校验）。
 * 5. 表单状态机、表格列 sortable/align 元数据生产无对应导出（见第三节），保留内联。
 *
 * 二、绑定生产实现
 * - 表格数据：frontend/src/utils/dataTable.ts:38 DataTableProcessor、:151 exportToCSV。
 *   选型理由：bloombergExportEngine.ts:584/607 语义接近但顶部依赖 xlsx，CI 只装 backend 依赖（D43）。
 * - Bollinger/RSI：frontend/src/utils/chartDataProcessing.ts:145 calculateBollingerBands、
 *   :111 calculateRSI。选型理由：backend/src/indicators/technical.ts:356/:233 指标同名但返回
 *   {upper[],middle[],lower[]} 三数组且 toFixed(4)，接口不同构；本文件是 frontend 影子测试，
 *   优先同包同形状实现。
 * - K 线颜色：frontend/src/utils/chartTheme.ts:148 getKLineChartTheme、:109 LIGHT_THEME。
 *
 * 三、未迁移清单
 * - Form State Management：全仓无 createFormState/FormState 导出（accessibility.ts:305 仅
 *   useFormErrorAnnounce），保留原内联实现与 13 例断言。
 * - K 线几何变换：生产唯一 computeKLine 位于 workerManager.ts:86-99 的 WORKER_CODE 模板字符串内，
 *   不可 import；isUp/bodyHeight/shadows 等字段只在形态识别引擎内部出现，非导出变换。保留内联，
 *   颜色改为从生产 chartTheme 读取。
 * - 表格列元数据（sortable/align/visibleColumns）：无通用 DataTable 组件或列配置导出；
 *   StockTable.tsx/VirtualStockTable.tsx 是业务组件。相关 3 例保留 fixture 元数据断言。
 * - stockScreener.ts applyFilter/screenStocks 需构造 27 字段 StockData 且不支持 contains，
 *   搜索/过滤统一改用 DataTableProcessor，未采用。
 */

import { describe, it, expect } from 'vitest';
import { DataTableProcessor, exportToCSV } from '../utils/dataTable';
import { calculateBollingerBands, calculateRSI } from '../utils/chartDataProcessing';
import { getKLineChartTheme, LIGHT_THEME } from '../utils/chartTheme';

// Table configuration logic
describe('Table Configuration Logic', () => {
  type StockRow = { code: string; name: string; price: number; change: number; volume: number };
  interface ColumnMeta {
    key: keyof StockRow;
    title: string;
    sortable?: boolean;
    filterable?: boolean;
    width?: number;
    align?: 'left' | 'center' | 'right';
  }

  const stockColumns: ColumnMeta[] = [
    { key: 'code', title: '代码', sortable: true, width: 100 },
    { key: 'name', title: '名称', sortable: true, width: 120 },
    { key: 'price', title: '现价', sortable: true, width: 80, align: 'right' },
    { key: 'change', title: '涨跌幅', sortable: true, width: 80, align: 'right' },
    { key: 'volume', title: '成交量', sortable: true, width: 100, align: 'right' },
  ];

  const labels = stockColumns.map(c => ({ key: c.key, label: c.title }));

  const makeRows = (count: number): StockRow[] => Array.from({ length: count }, (_, i) => ({
    code: String(i).padStart(3, '0'),
    name: 'Stock ' + i,
    price: 10 + i,
    change: 0,
    volume: 1000,
  }));

  it('should create table config with columns', () => {
    const result = new DataTableProcessor<StockRow>([]).execute();
    expect(stockColumns).toHaveLength(5);
    expect(result.data).toHaveLength(0);
    expect(exportToCSV([], labels)).toBe('代码,名称,现价,涨跌幅,成交量');
  });

  it('should sort by default sort field', () => {
    const data: StockRow[] = [
      { code: '002', name: 'B', price: 20, change: -1, volume: 2000 },
      { code: '001', name: 'A', price: 10, change: 1, volume: 1000 },
    ];
    const result = new DataTableProcessor<StockRow>(data).sortBy('code', 'asc').execute();
    expect(result.data[0].code).toBe('001');
    expect(result.sort).toEqual({ column: 'code', direction: 'asc' });
  });

  it('should sort descending', () => {
    const data: StockRow[] = [
      { code: '001', name: 'A', price: 10, change: 1, volume: 1000 },
      { code: '002', name: 'B', price: 20, change: -1, volume: 2000 },
    ];
    const result = new DataTableProcessor<StockRow>(data).sortBy('price', 'desc').execute();
    expect(result.data[0].price).toBe(20);
    expect(result.data[1].price).toBe(10);
  });

  it('should calculate total pages', () => {
    const data = makeRows(50);
    const result = new DataTableProcessor<StockRow>(data).paginate(1, 20).execute();
    // 订正：生产没有 totalPages 字段，用 pagination.total 推导。
    expect(result.pagination.total).toBe(50);
    expect(result.data).toHaveLength(20);
    expect(Math.ceil(result.pagination.total / result.pagination.pageSize)).toBe(3);
  });

  it('should handle custom page size', () => {
    const data = makeRows(100);
    const result = new DataTableProcessor<StockRow>(data).paginate(1, 50).execute();
    expect(result.pagination.total).toBe(100);
    expect(result.pagination.pageSize).toBe(50);
    expect(Math.ceil(result.pagination.total / result.pagination.pageSize)).toBe(2);
  });

  it('should track visible columns', () => {
    expect(labels.map(l => l.key)).toEqual(['code', 'name', 'price', 'change', 'volume']);
    expect(exportToCSV([], labels)).toBe('代码,名称,现价,涨跌幅,成交量');
  });

  it('should handle empty data', () => {
    const result = new DataTableProcessor<StockRow>([]).execute();
    expect(result.data).toHaveLength(0);
    expect(result.pagination.total).toBe(0);
    expect(exportToCSV([], labels)).toBe('代码,名称,现价,涨跌幅,成交量');
  });

  it('should not mutate original data', () => {
    const data: StockRow[] = [
      { code: '002', name: 'B', price: 20, change: -1, volume: 2000 },
      { code: '001', name: 'A', price: 10, change: 1, volume: 1000 },
    ];
    new DataTableProcessor<StockRow>(data).sortBy('code', 'asc').execute();
    expect(data[0].code).toBe('002');
    expect(data[1].code).toBe('001');
  });

  it('should handle single row', () => {
    const result = new DataTableProcessor<StockRow>([
      { code: '001', name: 'A', price: 10, change: 1, volume: 1000 },
    ]).execute();
    expect(result.pagination.total).toBe(1);
    expect(result.data).toHaveLength(1);
  });

  it('should identify sortable columns', () => {
    expect(stockColumns.filter(c => c.sortable)).toHaveLength(5);
  });

  it('should handle columns with alignment', () => {
    expect(stockColumns.filter(c => c.align === 'right')).toHaveLength(3);
  });

  it('should handle columns without sort', () => {
    const cols: ColumnMeta[] = [
      { key: 'code', title: '代码' },
      { key: 'name', title: '名称', sortable: true },
    ];
    expect(cols.filter(c => c.sortable)).toHaveLength(1);
  });

  it('should paginate last page', () => {
    const result = new DataTableProcessor<StockRow>(makeRows(50)).paginate(3, 20).execute();
    expect(result.data).toHaveLength(10);
    expect(result.pagination.total).toBe(50);
    expect(result.data[result.data.length - 1].code).toBe('049');
  });

  it('should export rows with column labels', () => {
    const csv = exportToCSV([
      { code: '600519', name: '贵州茅台', price: 1800, change: 2.5, volume: 50000 },
    ], labels);
    expect(csv.split('\n')).toHaveLength(2);
    expect(csv).toContain('600519,贵州茅台,1800,2.5,50000');
  });
});

// Chart data transformation
describe('Chart Data Transformation', () => {
  type Candle = { date: string; open: number; close: number; high: number; low: number; volume: number };

  // K 线几何无生产导出（workerManager.ts:86-99 在 WORKER_CODE 内），保留内联；
  // 颜色绑定 chartTheme.getKLineChartTheme（:148）。
  const transformKLineForChart = (data: Candle[]) => {
    const riseColor = getKLineChartTheme(true).color;
    const fallColor = getKLineChartTheme(false).color;
    return data.map((d, i) => {
      const isUp = d.close >= d.open;
      const color = isUp ? riseColor : fallColor;
      const bodyHeight = Math.abs(d.close - d.open);
      const upperShadow = d.high - Math.max(d.open, d.close);
      const lowerShadow = Math.min(d.open, d.close) - d.low;
      const prevClose = i > 0 ? data[i - 1].close : d.open;
      const change = d.close - prevClose;
      const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;
      return {
        x: d.date,
        o: d.open, c: d.close, h: d.high, l: d.low, v: d.volume,
        color, isUp, bodyHeight, upperShadow, lowerShadow,
        change, changePercent,
        volumeColor: (change >= 0 ? riseColor : fallColor) + '40',
      };
    });
  };

  describe('KLine Transform', () => {
    it('should transform bullish candle', () => {
      const result = transformKLineForChart([
        { date: '2024-01-01', open: 10, close: 12, high: 13, low: 9, volume: 1000 },
      ]);
      expect(result[0].isUp).toBe(true);
      // 订正：生产涨色 '#EF4444'（大写），旧断言 '#ef4444' 是自抄小写。
      expect(result[0].color).toBe('#EF4444');
      expect(result[0].bodyHeight).toBe(2);
    });

    it('should transform bearish candle', () => {
      const result = transformKLineForChart([
        { date: '2024-01-01', open: 12, close: 10, high: 13, low: 9, volume: 1000 },
      ]);
      expect(result[0].isUp).toBe(false);
      expect(result[0].color).toBe('#22C55E');
    });

    it('should calculate shadows', () => {
      const result = transformKLineForChart([
        { date: '2024-01-01', open: 10, close: 12, high: 15, low: 8, volume: 1000 },
      ]);
      expect(result[0].upperShadow).toBe(3);
      expect(result[0].lowerShadow).toBe(2);
    });

    it('should calculate change from prev close', () => {
      const result = transformKLineForChart([
        { date: '2024-01-01', open: 10, close: 10, high: 10, low: 10, volume: 0 },
        { date: '2024-01-02', open: 10, close: 12, high: 12, low: 10, volume: 1000 },
      ]);
      expect(result[1].change).toBe(2);
      expect(result[1].changePercent).toBe(20);
    });

    it('should handle first candle', () => {
      const result = transformKLineForChart([
        { date: '2024-01-01', open: 10, close: 12, high: 13, low: 9, volume: 1000 },
      ]);
      expect(result[0].change).toBe(2);
      expect(result[0].changePercent).toBe(20);
    });

    it('should handle empty data', () => {
      expect(transformKLineForChart([])).toEqual([]);
    });

    it('should handle doji', () => {
      const result = transformKLineForChart([
        { date: '2024-01-01', open: 10, close: 10, high: 11, low: 9, volume: 1000 },
      ]);
      expect(result[0].bodyHeight).toBe(0);
      expect(result[0].isUp).toBe(true);
    });

    it('should generate volume color', () => {
      const result = transformKLineForChart([
        { date: '2024-01-01', open: 10, close: 10, high: 10, low: 10, volume: 0 },
        { date: '2024-01-02', open: 10, close: 12, high: 12, low: 10, volume: 1000 },
        { date: '2024-01-03', open: 12, close: 10, high: 12, low: 10, volume: 1000 },
      ]);
      // 订正：颜色取自生产 chartTheme（大写），旧的 '#ef444440'/'#22c55e40' 已订正。
      expect(result[1].volumeColor).toBe('#EF444440');
      expect(result[2].volumeColor).toBe('#22C55E40');
    });

    it('should handle many candles', () => {
      const data: Candle[] = Array.from({ length: 250 }, (_, i) => ({
        date: '2024-' + String(i + 1).padStart(3, '0'),
        open: 100 + i, close: 100 + i + 1, high: 100 + i + 2, low: 100 + i - 1, volume: 1000,
      }));
      const result = transformKLineForChart(data);
      expect(result).toHaveLength(250);
    });

    it('should bind kline colors to production chart theme', () => {
      expect(getKLineChartTheme(true).color).toBe('#EF4444');
      expect(getKLineChartTheme(true).borderColor).toBe('#EF4444');
      expect(getKLineChartTheme(false).color).toBe('#22C55E');
      expect(getKLineChartTheme(true).itemStyle.color0).toBe('#22C55E');
      expect(LIGHT_THEME.rise).toBe('#EF4444');
    });
  });

  describe('Bollinger Bands', () => {
    it('should compute upper > middle > lower', () => {
      const closes = Array.from({ length: 30 }, (_, i) => 100 + i * 0.5);
      const bands = calculateBollingerBands(closes);
      const last = bands[bands.length - 1]!;
      expect(last.upper).toBeGreaterThan(last.middle);
      expect(last.middle).toBeGreaterThan(last.lower);
    });

    it('should have null bands before period', () => {
      // 订正：生产在 period 前补 null（旧自抄补 0）。
      const bands = calculateBollingerBands([1, 2, 3], 5);
      expect(bands).toEqual([null, null, null]);
      expect(bands[0]).toBeNull();
    });

    it('should handle flat data', () => {
      const closes = Array(30).fill(100);
      const bands = calculateBollingerBands(closes);
      const last = bands[bands.length - 1]!;
      expect(last.upper).toBe(100);
      expect(last.middle).toBe(100);
      expect(last.lower).toBe(100);
    });

    it('should handle empty data', () => {
      expect(calculateBollingerBands([])).toEqual([]);
    });

    it('should handle custom multiplier', () => {
      const closes = Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i) * 10);
      const bands1 = calculateBollingerBands(closes, 20, 1);
      const bands2 = calculateBollingerBands(closes, 20, 3);
      const last1 = bands1[bands1.length - 1]!;
      const last2 = bands2[bands2.length - 1]!;
      expect(last2.upper - last2.lower).toBeGreaterThan(last1.upper - last1.lower);
    });

    it('should compute for period equal to data length', () => {
      const closes = Array.from({ length: 20 }, (_, i) => 100 + i);
      const bands = calculateBollingerBands(closes, 20);
      const last = bands[bands.length - 1]!;
      expect(last.middle).toBe(109.5);
      expect(last.upper).toBeGreaterThan(last.middle);
    });

    it('should emit null until period - 1', () => {
      const closes = Array.from({ length: 20 }, (_, i) => 100 + i);
      const bands = calculateBollingerBands(closes, 20);
      expect(bands).toHaveLength(20);
      expect(bands[18]).toBeNull();
      expect(bands[19]).not.toBeNull();
    });
  });

  describe('RSI', () => {
    it('should return 100 for all gains', () => {
      const closes = Array.from({ length: 20 }, (_, i) => i);
      const rsi = calculateRSI(closes);
      expect(rsi[13]).toBeNull();
      expect(rsi[rsi.length - 1]).toBe(100);
    });

    it('should return 0 for all losses', () => {
      const closes = Array.from({ length: 20 }, (_, i) => 20 - i);
      const rsi = calculateRSI(closes);
      expect(rsi[14]).toBe(0);
      expect(rsi[rsi.length - 1]).toBe(0);
    });

    it('should return null for initial period', () => {
      // 订正：生产不足 period+1 根时全为 null（旧自抄补 50）。
      const rsi = calculateRSI([1, 2, 3, 4, 5], 14);
      expect(rsi).toEqual([null, null, null, null, null]);
      expect(rsi[0]).toBeNull();
    });

    it('should be in 0-100 range', () => {
      const closes = Array.from({ length: 50 }, (_, i) => 100 + 10 * Math.sin(i * 0.5));
      const rsi = calculateRSI(closes);
      expect(rsi).toHaveLength(50);
      expect(rsi.slice(0, 14).every(v => v === null)).toBe(true);
      for (let i = 14; i < rsi.length; i++) {
        expect(typeof rsi[i]).toBe('number');
        expect(rsi[i] as number).toBeGreaterThanOrEqual(0);
        expect(rsi[i] as number).toBeLessThanOrEqual(100);
      }
    });

    it('should handle empty data', () => {
      expect(calculateRSI([])).toEqual([]);
    });

    it('should handle flat prices', () => {
      const rsi = calculateRSI(Array(20).fill(100), 14);
      expect(rsi[13]).toBeNull();
      expect(rsi[19]).toBe(100);
    });

    it('should handle custom period with Wilder smoothing', () => {
      const closes = Array.from({ length: 20 }, (_, i) => i % 2 === 0 ? 100 : 99);
      const rsi = calculateRSI(closes, 5);
      expect(rsi).toHaveLength(20);
      expect(rsi[4]).toBeNull();
      expect(rsi[5] as number).toBeCloseTo(40, 5);
      // Wilder 平滑第二步：avgGain=0.52 / avgLoss=0.48 → RSI=52；简单滚动均值不会得到该值。
      expect(rsi[6] as number).toBeCloseTo(52, 5);
    });
  });
});

// Form state management（未迁移，见文件头第三节）
describe('Form State Management', () => {
  interface FormField {
    value: string; error: string; touched: boolean; dirty: boolean;
  }

  const createFormState = (initial: Record<string, string>) => {
    const fields: Record<string, FormField> = {};
    for (const [key, value] of Object.entries(initial)) {
      fields[key] = { value, error: '', touched: false, dirty: false };
    }
    return {
      fields,
      isValid: true,
      isDirty: false,
      touchedCount: 0,
      updateField: (key: string, value: string) => {
        if (fields[key]) {
          fields[key] = { ...fields[key], value, dirty: value !== initial[key] };
        }
      },
      touchField: (key: string) => {
        if (fields[key]) {
          fields[key] = { ...fields[key], touched: true };
        }
      },
      setFieldError: (key: string, error: string) => {
        if (fields[key]) {
          fields[key] = { ...fields[key], error };
        }
      },
      validate: (rules: Record<string, (v: string) => string>) => {
        let valid = true;
        for (const [key, rule] of Object.entries(rules)) {
          if (fields[key]) {
            const error = rule(fields[key].value);
            fields[key] = { ...fields[key], error, touched: true };
            if (error) valid = false;
          }
        }
        return valid;
      },
      reset: () => {
        for (const [key, value] of Object.entries(initial)) {
          fields[key] = { value, error: '', touched: false, dirty: false };
        }
      },
      getValues: () => {
        const result: Record<string, string> = {};
        for (const [key, field] of Object.entries(fields)) {
          result[key] = field.value;
        }
        return result;
      },
    };
  };

  it('should create form with initial values', () => {
    const form = createFormState({ name: '', email: '' });
    expect(form.fields['name'].value).toBe('');
    expect(form.fields['email'].value).toBe('');
  });

  it('should update field value', () => {
    const form = createFormState({ name: '' });
    form.updateField('name', 'John');
    expect(form.fields['name'].value).toBe('John');
  });

  it('should mark field as dirty', () => {
    const form = createFormState({ name: 'original' });
    form.updateField('name', 'changed');
    expect(form.fields['name'].dirty).toBe(true);
  });

  it('should not mark same value as dirty', () => {
    const form = createFormState({ name: 'same' });
    form.updateField('name', 'same');
    expect(form.fields['name'].dirty).toBe(false);
  });

  it('should touch field', () => {
    const form = createFormState({ name: '' });
    form.touchField('name');
    expect(form.fields['name'].touched).toBe(true);
  });

  it('should set field error', () => {
    const form = createFormState({ name: '' });
    form.setFieldError('name', 'Required');
    expect(form.fields['name'].error).toBe('Required');
  });

  it('should validate with rules', () => {
    const form = createFormState({ name: '', email: 'test@test.com' });
    const valid = form.validate({
      name: v => v ? '' : 'Name is required',
      email: v => v.includes('@') ? '' : 'Invalid email',
    });
    expect(valid).toBe(false);
    expect(form.fields['name'].error).toBe('Name is required');
    expect(form.fields['email'].error).toBe('');
  });

  it('should return valid when all rules pass', () => {
    const form = createFormState({ name: 'John', email: 'a@b.com' });
    const valid = form.validate({
      name: v => v ? '' : 'Required',
      email: v => v.includes('@') ? '' : 'Invalid',
    });
    expect(valid).toBe(true);
  });

  it('should touch all fields on validate', () => {
    const form = createFormState({ name: 'John' });
    form.validate({ name: () => '' });
    expect(form.fields['name'].touched).toBe(true);
  });

  it('should reset to initial values', () => {
    const form = createFormState({ name: 'initial' });
    form.updateField('name', 'changed');
    form.touchField('name');
    form.setFieldError('name', 'error');
    form.reset();
    expect(form.fields['name'].value).toBe('initial');
    expect(form.fields['name'].dirty).toBe(false);
    expect(form.fields['name'].touched).toBe(false);
    expect(form.fields['name'].error).toBe('');
  });

  it('should get all values', () => {
    const form = createFormState({ a: '1', b: '2' });
    form.updateField('a', '10');
    const values = form.getValues();
    expect(values).toEqual({ a: '10', b: '2' });
  });

  it('should handle non-existent field update', () => {
    const form = createFormState({ name: '' });
    form.updateField('nonexistent', 'value');
    expect(form.fields['nonexistent']).toBeUndefined();
  });

  it('should handle multiple fields validation', () => {
    const form = createFormState({ a: '', b: '', c: 'filled' });
    form.validate({
      a: v => v ? '' : 'Required',
      b: v => v ? '' : 'Required',
      c: v => v ? '' : 'Required',
    });
    expect(form.fields['a'].error).toBe('Required');
    expect(form.fields['b'].error).toBe('Required');
    expect(form.fields['c'].error).toBe('');
  });
});

// Search and filter combinations
describe('Search and Filter Combinations', () => {
  type Stock = {
    code: string; name: string; industry: string;
    price: number; marketCap: number; pe: number;
    changePercent: number; volume: number;
  };

  interface StockFilters {
    industry?: string;
    minPrice?: number;
    maxPrice?: number;
    minPE?: number;
    maxPE?: number;
    minMarketCap?: number;
  }

  const mockStocks: Stock[] = [
    { code: '600519', name: '贵州茅台', industry: '白酒', price: 1800, marketCap: 2e12, pe: 35, changePercent: 2.5, volume: 50000 },
    { code: '000858', name: '五粮液', industry: '白酒', price: 150, marketCap: 5e11, pe: 25, changePercent: 1.8, volume: 80000 },
    { code: '000001', name: '平安银行 PingAn', industry: '银行', price: 12, marketCap: 2e11, pe: 6, changePercent: -0.5, volume: 1e8 },
    { code: '601398', name: '工商银行', industry: '银行', price: 5, marketCap: 1.8e12, pe: 5, changePercent: 0.3, volume: 2e8 },
    { code: '300750', name: '宁德时代', industry: '新能源', price: 200, marketCap: 8e11, pe: 50, changePercent: 3.2, volume: 100000 },
  ];

  // 生产 bloombergExportEngine.filterData 依赖 xlsx 不可用（D43）；改用 dataTable.DataTableProcessor。
  const searchStocks = (stocks: Stock[], query: string): Stock[] => {
    if (!query.trim()) return stocks;
    const matched = new Set<string>();
    for (const keyword of query.trim().split(/\s+/)) {
      for (const column of ['code', 'name', 'industry'] as const) {
        const rows = new DataTableProcessor<Stock>(stocks)
          .filter({ column, operator: 'contains', value: keyword })
          .execute().data;
        rows.forEach(row => matched.add(row.code));
      }
    }
    return stocks.filter(s => matched.has(s.code));
  };

  const filterStocks = (stocks: Stock[], filters: StockFilters): Stock[] => {
    const processor = new DataTableProcessor<Stock>(stocks);
    if (filters.industry !== undefined) {
      processor.filter({ column: 'industry', operator: 'eq', value: filters.industry });
    }
    if (filters.minPrice !== undefined) {
      processor.filter({ column: 'price', operator: 'gte', value: filters.minPrice });
    }
    if (filters.maxPrice !== undefined) {
      processor.filter({ column: 'price', operator: 'lte', value: filters.maxPrice });
    }
    if (filters.minPE !== undefined) {
      processor.filter({ column: 'pe', operator: 'gte', value: filters.minPE });
    }
    if (filters.maxPE !== undefined) {
      processor.filter({ column: 'pe', operator: 'lte', value: filters.maxPE });
    }
    if (filters.minMarketCap !== undefined) {
      processor.filter({ column: 'marketCap', operator: 'gte', value: filters.minMarketCap });
    }
    return processor.execute().data;
  };

  const sortStocks = (stocks: Stock[], field: keyof Stock, order: 'asc' | 'desc'): Stock[] =>
    new DataTableProcessor<Stock>(stocks).sortBy(String(field), order).execute().data;

  it('should search by code', () => {
    const result = searchStocks(mockStocks, '600519');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('贵州茅台');
  });

  it('should search by name', () => {
    const result = searchStocks(mockStocks, '茅台');
    expect(result).toHaveLength(1);
    expect(result[0].code).toBe('600519');
  });

  it('should search by industry', () => {
    const result = searchStocks(mockStocks, '银行');
    expect(result).toHaveLength(2);
    expect(result.map(s => s.code)).toEqual(['000001', '601398']);
  });

  it('should search case insensitive', () => {
    const result = searchStocks(mockStocks, 'pingan');
    expect(result).toHaveLength(1);
    expect(result[0].code).toBe('000001');
  });

  it('should return all for empty query', () => {
    expect(searchStocks(mockStocks, '')).toHaveLength(5);
    expect(searchStocks(mockStocks, '   ')).toHaveLength(5);
  });

  it('should return empty for no match', () => {
    expect(searchStocks(mockStocks, '不存在')).toHaveLength(0);
  });

  it('should filter by industry', () => {
    const result = filterStocks(mockStocks, { industry: '白酒' });
    expect(result).toHaveLength(2);
    expect(result.map(s => s.name)).toEqual(['贵州茅台', '五粮液']);
  });

  it('should filter by price range', () => {
    const result = filterStocks(mockStocks, { minPrice: 100, maxPrice: 500 });
    expect(result).toHaveLength(2);
    expect(result.map(s => s.code)).toEqual(['000858', '300750']);
  });

  it('should filter by PE range', () => {
    const result = filterStocks(mockStocks, { minPE: 0, maxPE: 10 });
    expect(result).toHaveLength(2);
  });

  it('should filter by min market cap', () => {
    const result = filterStocks(mockStocks, { minMarketCap: 1e12 });
    expect(result).toHaveLength(2);
    expect(result.map(s => s.code)).toEqual(['600519', '601398']);
  });

  it('should combine search and filter', () => {
    const searched = searchStocks(mockStocks, '银行');
    const filtered = filterStocks(searched, { maxPE: 10 });
    expect(filtered).toHaveLength(2);
  });

  it('should sort ascending', () => {
    const result = sortStocks(mockStocks, 'price', 'asc');
    expect(result[0].price).toBe(5);
    expect(result[result.length - 1].price).toBe(1800);
  });

  it('should sort descending', () => {
    const result = sortStocks(mockStocks, 'changePercent', 'desc');
    expect(result[0].changePercent).toBe(3.2);
    expect(result[1].changePercent).toBe(2.5);
  });

  it('should sort by name alphabetically', () => {
    const result = sortStocks(mockStocks, 'name', 'asc');
    expect(result).toHaveLength(5);
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].name <= result[i].name).toBe(true);
    }
  });

  it('should not mutate original', () => {
    const original = mockStocks.map(s => s.code);
    sortStocks(mockStocks, 'price', 'desc');
    filterStocks(mockStocks, { industry: '白酒' });
    expect(mockStocks.map(s => s.code)).toEqual(original);
    expect(mockStocks[0].price).toBe(1800);
  });

  it('should handle empty stocks', () => {
    expect(searchStocks([], 'test')).toEqual([]);
    expect(filterStocks([], { industry: 'test' })).toEqual([]);
    expect(sortStocks([], 'price', 'asc')).toEqual([]);
  });

  it('should filter with multiple conditions', () => {
    const result = filterStocks(mockStocks, {
      minPrice: 10, maxPrice: 200, minPE: 5, maxPE: 30, industry: '白酒',
    });
    expect(result).toHaveLength(1);
    expect(result[0].code).toBe('000858');
  });

  it('should list unique industries', () => {
    const values = new DataTableProcessor<Stock>(mockStocks).uniqueValues('industry');
    expect(values).toEqual(['新能源', '白酒', '银行']);
  });
});
