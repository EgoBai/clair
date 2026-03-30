import { describe, it, expect } from 'vitest';

// Test dataExport utility functions
describe('数据导出工具', () => {
  describe('escapeCSV', () => {
    // We test the exported functions and column definitions
    it('STOCK_EXPORT_COLUMNS 应该有12个列定义', async () => {
      const { STOCK_EXPORT_COLUMNS } = await import('../utils/dataExport');
      expect(STOCK_EXPORT_COLUMNS).toHaveLength(12);
    });

    it('KLINE_EXPORT_COLUMNS 应该有7个列定义', async () => {
      const { KLINE_EXPORT_COLUMNS } = await import('../utils/dataExport');
      expect(KLINE_EXPORT_COLUMNS).toHaveLength(7);
    });

    it('BACKTEST_EXPORT_COLUMNS 应该有7个列定义', async () => {
      const { BACKTEST_EXPORT_COLUMNS } = await import('../utils/dataExport');
      expect(BACKTEST_EXPORT_COLUMNS).toHaveLength(7);
    });

    it('股票导出列应该包含必要字段', async () => {
      const { STOCK_EXPORT_COLUMNS } = await import('../utils/dataExport');
      const keys = STOCK_EXPORT_COLUMNS.map(c => c.key);
      expect(keys).toContain('symbol');
      expect(keys).toContain('name');
      expect(keys).toContain('price');
      expect(keys).toContain('changePercent');
      expect(keys).toContain('volume');
      expect(keys).toContain('turnover');
    });

    it('K线导出列应该包含OHLC字段', async () => {
      const { KLINE_EXPORT_COLUMNS } = await import('../utils/dataExport');
      const keys = KLINE_EXPORT_COLUMNS.map(c => c.key);
      expect(keys).toContain('open');
      expect(keys).toContain('high');
      expect(keys).toContain('low');
      expect(keys).toContain('close');
      expect(keys).toContain('volume');
    });

    it('回测导出列应该包含交易字段', async () => {
      const { BACKTEST_EXPORT_COLUMNS } = await import('../utils/dataExport');
      const keys = BACKTEST_EXPORT_COLUMNS.map(c => c.key);
      expect(keys).toContain('date');
      expect(keys).toContain('type');
      expect(keys).toContain('price');
      expect(keys).toContain('quantity');
    });

    it('formatVolume 应该正确格式化成交量', async () => {
      const { formatVolume } = await import('../utils/dataExport');
      expect(formatVolume(0)).toBe('');
      expect(formatVolume(100)).toBe('100');
      expect(formatVolume(10000)).toBe('1万');
      expect(formatVolume(100000000)).toBe('1.00亿');
    });

    it('formatTurnover 应该正确格式化成交额', async () => {
      const { formatTurnover } = await import('../utils/dataExport');
      expect(formatTurnover(0)).toBe('');
      expect(formatTurnover(100.5)).toBe('100.50');
      expect(formatTurnover(10000)).toBe('1万');
      expect(formatTurnover(100000000)).toBe('1.00亿');
    });

    it('列定义的format函数应该正确格式化涨跌幅', async () => {
      const { STOCK_EXPORT_COLUMNS } = await import('../utils/dataExport');
      const changeCol = STOCK_EXPORT_COLUMNS.find(c => c.key === 'changePercent');
      expect(changeCol).toBeDefined();
      expect(changeCol!.format!(2.5)).toBe('+2.50');
      expect(changeCol!.format!(-1.23)).toBe('-1.23');
      expect(changeCol!.format!(null)).toBe('');
    });

    it('列定义的format函数应该正确格式化价格', async () => {
      const { STOCK_EXPORT_COLUMNS } = await import('../utils/dataExport');
      const priceCol = STOCK_EXPORT_COLUMNS.find(c => c.key === 'price');
      expect(priceCol).toBeDefined();
      expect(priceCol!.format!(123.45)).toBe('123.45');
      expect(priceCol!.format!(null)).toBe('');
    });

    it('列定义的format函数应该正确格式化PE', async () => {
      const { STOCK_EXPORT_COLUMNS } = await import('../utils/dataExport');
      const peCol = STOCK_EXPORT_COLUMNS.find(c => c.key === 'peRatio');
      expect(peCol).toBeDefined();
      expect(peCol!.format!(15.67)).toBe('15.67');
      expect(peCol!.format!(null)).toBe('-');
    });

    it('每列应该有key和label', async () => {
      const { STOCK_EXPORT_COLUMNS, KLINE_EXPORT_COLUMNS, BACKTEST_EXPORT_COLUMNS } = await import('../utils/dataExport');
      const all = [...STOCK_EXPORT_COLUMNS, ...KLINE_EXPORT_COLUMNS, ...BACKTEST_EXPORT_COLUMNS];
      for (const col of all) {
        expect(col.key).toBeTruthy();
        expect(col.label).toBeTruthy();
      }
    });
  });
});
