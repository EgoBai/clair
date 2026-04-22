import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  formatNumber,
  formatPercent,
  formatCurrency,
  formatDate,
  formatChangePercent,
  formatVolume,
  formatTurnover,
  formatPE,
  formatMarketCap,
  escapeCSVValue,
  exportToCSV,
  exportToExcel,
  exportToJSON,
  exportToHTML,
  exportData,
  downloadExport,
  filterData,
  sortData,
  groupData,
  aggregateData,
  generateReport,
  batchExport,
  STOCK_LIST_COLUMNS,
  KLINE_COLUMNS,
  BACKTEST_COLUMNS,
  FINANCIAL_COLUMNS,
  registerReportTemplate,
  getReportTemplate,
  getAllReportTemplates,
  type ExportColumn,
  type ReportTemplate,
} from '../utils/bloombergExportEngine';

// Mock file-saver
vi.mock('file-saver', () => ({
  saveAs: vi.fn(),
}));

// Mock xlsx
vi.mock('xlsx', () => ({
  utils: {
    book_new: vi.fn(() => ({ SheetNames: [], Sheets: {} })),
    aoa_to_sheet: vi.fn(() => ({ '!cols': [], '!merges': [] })),
    book_append_sheet: vi.fn(),
  },
  write: vi.fn(() => new ArrayBuffer(0)),
}));

// ==================== 测试数据 ====================

const mockStockData = [
  { symbol: '600519', name: '贵州茅台', price: 1800, changePercent: 2.5, volume: 50000000, turnover: 9e10, peRatio: 45.5, marketCap: 2.3e12 },
  { symbol: '300750', name: '宁德时代', price: 220, changePercent: -1.2, volume: 80000000, turnover: 1.76e10, peRatio: 35.2, marketCap: 5000e8 },
  { symbol: '601318', name: '中国平安', price: 45, changePercent: 0.8, volume: 30000000, turnover: 1.35e9, peRatio: 12.8, marketCap: 8000e8 },
  { symbol: '600036', name: '招商银行', price: 35, changePercent: -0.5, volume: 20000000, turnover: 7e8, peRatio: 8.5, marketCap: 7000e8 },
  { symbol: '002594', name: '比亚迪', price: 280, changePercent: 3.2, volume: 60000000, turnover: 1.68e10, peRatio: 65.3, marketCap: 8000e8 },
];

const columns: ExportColumn[] = [
  { key: 'symbol', label: '股票代码', width: 12 },
  { key: 'name', label: '名称', width: 16 },
  { key: 'price', label: '价格', format: (v) => formatNumber(v, 2), width: 10, align: 'right' },
  { key: 'changePercent', label: '涨跌幅', format: (v) => formatChangePercent(v), width: 12, align: 'right' },
  { key: 'volume', label: '成交量', format: (v) => formatVolume(v), width: 12, align: 'right' },
];

// ==================== 格式化函数测试 ====================

describe('Bloomberg Export Engine - 格式化函数', () => {
  describe('formatNumber', () => {
    it('应格式化数字并保留精度', () => {
      expect(formatNumber(1234.567, 2)).toContain('1');
      expect(formatNumber(1234.567, 2)).toContain('.');
    });

    it('应处理空值', () => {
      expect(formatNumber(null, 2)).toBe('-');
      expect(formatNumber(undefined, 2)).toBe('-');
    });

    it('应处理NaN', () => {
      expect(formatNumber('abc', 2)).toBe('abc');
    });

    it('应支持不同精度', () => {
      const result = formatNumber(1234.5, 0);
      expect(result).toBeTruthy();
    });
  });

  describe('formatPercent', () => {
    it('应格式化百分比', () => {
      expect(formatPercent(0.1234, 2)).toBe('12.34%');
      expect(formatPercent(0.05, 2)).toBe('5.00%');
    });

    it('应处理空值', () => {
      expect(formatPercent(null, 2)).toBe('-');
    });

    it('应处理负值', () => {
      expect(formatPercent(-0.1, 2)).toBe('-10.00%');
    });
  });

  describe('formatCurrency', () => {
    it('应格式化人民币万亿级', () => {
      const result = formatCurrency(1.5e12, 'CNY', 2);
      expect(result).toContain('万亿');
      expect(result).toContain('¥');
    });

    it('应格式化人民币亿级', () => {
      const result = formatCurrency(5e8, 'CNY', 2);
      expect(result).toContain('亿');
      expect(result).toContain('¥');
    });

    it('应格式化人民币万级', () => {
      const result = formatCurrency(5e4, 'CNY', 2);
      expect(result).toContain('万');
      expect(result).toContain('¥');
    });

    it('应处理空值', () => {
      expect(formatCurrency(null, 'CNY', 2)).toBe('-');
    });

    it('应支持其他货币', () => {
      const result = formatCurrency(1000, 'USD', 2);
      expect(result).toContain('$');
    });
  });

  describe('formatDate', () => {
    it('应格式化日期', () => {
      const date = new Date('2026-03-31T10:30:00');
      const result = formatDate(date, 'YYYY-MM-DD');
      expect(result).toBe('2026-03-31');
    });

    it('应格式化日期时间', () => {
      const date = new Date('2026-03-31T10:30:45');
      const result = formatDate(date, 'YYYY-MM-DD HH:mm:ss');
      expect(result).toContain('10:30:45');
    });

    it('应处理无效日期', () => {
      expect(formatDate('invalid', 'YYYY-MM-DD')).toBe('invalid');
    });

    it('应处理空值', () => {
      expect(formatDate(null, 'YYYY-MM-DD')).toBe('-');
    });
  });

  describe('formatChangePercent', () => {
    it('正数应加+前缀', () => {
      expect(formatChangePercent(2.5, 2)).toBe('+2.50%');
    });

    it('负数应正常显示', () => {
      expect(formatChangePercent(-1.2, 2)).toBe('-1.20%');
    });

    it('零应不加前缀', () => {
      expect(formatChangePercent(0, 2)).toBe('0.00%');
    });

    it('应处理空值', () => {
      expect(formatChangePercent(null, 2)).toBe('-');
    });
  });

  describe('formatVolume', () => {
    it('亿级应格式化', () => {
      expect(formatVolume(5e8)).toContain('亿');
    });

    it('万级应格式化', () => {
      expect(formatVolume(5e5)).toContain('万');
    });

    it('小数应格式化', () => {
      expect(formatVolume(500)).toBe('500');
    });

    it('应处理空值', () => {
      expect(formatVolume(null)).toBe('-');
    });
  });

  describe('formatTurnover', () => {
    it('万亿级应格式化', () => {
      expect(formatTurnover(1.5e12)).toContain('万亿');
    });

    it('亿级应格式化', () => {
      expect(formatTurnover(5e8)).toContain('亿');
    });

    it('应处理空值', () => {
      expect(formatTurnover(null)).toBe('-');
    });
  });

  describe('formatPE', () => {
    it('正PE应正常显示', () => {
      expect(formatPE(25.5, 2)).toBe('25.50');
    });

    it('负PE应显示亏损', () => {
      expect(formatPE(-10, 2)).toContain('亏损');
    });

    it('空值应返回-', () => {
      expect(formatPE(null, 2)).toBe('-');
    });
  });

  describe('formatMarketCap', () => {
    it('万亿级应格式化', () => {
      expect(formatMarketCap(1.5e12)).toContain('万亿');
    });

    it('亿级应格式化', () => {
      expect(formatMarketCap(5e8)).toContain('亿');
    });
  });

  describe('escapeCSVValue', () => {
    it('普通值不应加引号', () => {
      expect(escapeCSVValue('hello')).toBe('hello');
    });

    it('含分隔符应加引号', () => {
      expect(escapeCSVValue('a,b')).toBe('"a,b"');
    });

    it('含引号应转义', () => {
      expect(escapeCSVValue('a"b')).toBe('"a""b"');
    });

    it('含换行应加引号', () => {
      expect(escapeCSVValue('a\nb')).toBe('"a\nb"');
    });
  });
});

// ==================== 导出函数测试 ====================

describe('Bloomberg Export Engine - 导出函数', () => {
  describe('exportToCSV', () => {
    it('应导出CSV格式', () => {
      const result = exportToCSV(mockStockData, { columns, filename: 'stocks' });
      expect(result.filename).toBe('stocks.csv');
      expect(result.mimeType).toBe('text/csv;charset=utf-8');
      expect(result.rowCount).toBe(5);
      expect(result.columnCount).toBe(5);
      expect(result.format).toBe('csv');
    });

    it('应包含表头', () => {
      const result = exportToCSV(mockStockData, { columns, includeHeader: true });
      const content = result.content as string;
      expect(content).toContain('股票代码');
      expect(content).toContain('名称');
    });

    it('不含表头时应不添加', () => {
      const result = exportToCSV(mockStockData, { columns, includeHeader: false });
      const content = result.content as string;
      expect(content).not.toContain('股票代码');
    });

    it('应包含时间戳', () => {
      const result = exportToCSV(mockStockData, { columns, includeTimestamp: true });
      const content = result.content as string;
      expect(content).toContain('导出时间');
    });

    it('空数据应返回空内容', () => {
      const result = exportToCSV([], { columns });
      expect(result.rowCount).toBe(0);
    });

    it('应包含BOM头', () => {
      const result = exportToCSV(mockStockData, { columns, encoding: 'utf-8' });
      const content = result.content as string;
      expect(content.charCodeAt(0)).toBe(0xFEFF);
    });
  });

  describe('exportToJSON', () => {
    it('应导出JSON格式', () => {
      const result = exportToJSON(mockStockData, { columns, filename: 'stocks' });
      expect(result.filename).toBe('stocks.json');
      expect(result.mimeType).toBe('application/json');
      expect(result.format).toBe('json');

      const parsed = JSON.parse(result.content as string);
      expect(parsed.data.length).toBe(5);
      expect(parsed.metadata.rowCount).toBe(5);
    });

    it('应包含元数据', () => {
      const result = exportToJSON(mockStockData, { columns, includeTimestamp: true });
      const parsed = JSON.parse(result.content as string);
      expect(parsed.exportTime).toBeTruthy();
    });

    it('应包含标题', () => {
      const result = exportToJSON(mockStockData, { columns, title: '股票列表' });
      const parsed = JSON.parse(result.content as string);
      expect(parsed.title).toBe('股票列表');
    });
  });

  describe('exportToHTML', () => {
    it('应导出HTML表格', () => {
      const result = exportToHTML(mockStockData, { columns, filename: 'stocks' });
      expect(result.filename).toBe('stocks.html');
      expect(result.mimeType).toBe('text/html');
      expect(result.format).toBe('pdf');

      const content = result.content as string;
      expect(content).toContain('<table');
      expect(content).toContain('<th');
      expect(content).toContain('贵州茅台');
    });

    it('应转义HTML特殊字符', () => {
      const data = [{ name: '<script>alert(1)</script>', price: 100 }];
      const result = exportToHTML(data, { 
        columns: [{ key: 'name', label: '名' }, { key: 'price', label: '价' }] 
      });
      const content = result.content as string;
      expect(content).not.toContain('<script>');
      expect(content).toContain('&lt;script&gt;');
    });

    it('应包含标题', () => {
      const result = exportToHTML(mockStockData, { 
        columns, 
        title: '测试标题',
        subtitle: '测试副标题',
      });
      const content = result.content as string;
      expect(content).toContain('测试标题');
      expect(content).toContain('测试副标题');
    });

    it('应包含数据汇总', () => {
      const result = exportToHTML(mockStockData, { 
        columns, 
        includeSummary: true 
      });
      const content = result.content as string;
      expect(content).toContain('共 5 条记录');
    });
  });

  describe('exportToExcel', () => {
    it('应导出Excel格式', () => {
      const result = exportToExcel(mockStockData, { columns, filename: 'stocks' });
      expect(result.filename).toBe('stocks.xlsx');
      expect(result.mimeType).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      expect(result.format).toBe('xlsx');
      expect(result.rowCount).toBe(5);
    });

    it('应设置Sheet名称', () => {
      const result = exportToExcel(mockStockData, { 
        columns, 
        filename: 'stocks',
        sheetName: '股票数据' 
      });
      expect(result.filename).toBe('stocks.xlsx');
    });
  });

  describe('exportData', () => {
    it('应根据格式导出', () => {
      const csv = exportData(mockStockData, { format: 'csv', columns });
      expect(csv.filename).toContain('.csv');

      const json = exportData(mockStockData, { format: 'json', columns });
      expect(json.filename).toContain('.json');

      const html = exportData(mockStockData, { format: 'pdf', columns });
      expect(html.filename).toContain('.html');

      const xlsx = exportData(mockStockData, { format: 'xlsx', columns });
      expect(xlsx.filename).toContain('.xlsx');
    });

    it('默认应导出CSV', () => {
      const result = exportData(mockStockData, { columns });
      expect(result.mimeType).toBe('text/csv;charset=utf-8');
    });
  });
});

// ==================== 数据处理测试 ====================

describe('Bloomberg Export Engine - 数据处理', () => {
  describe('filterData', () => {
    it('应过滤等值', () => {
      const result = filterData(mockStockData, [{ key: 'name', operator: 'eq', value: '贵州茅台' }]);
      expect(result.length).toBe(1);
      expect(result[0].name).toBe('贵州茅台');
    });

    it('应过滤不等值', () => {
      const result = filterData(mockStockData, [{ key: 'name', operator: 'neq', value: '贵州茅台' }]);
      expect(result.length).toBe(4);
    });

    it('应过滤大于', () => {
      const result = filterData(mockStockData, [{ key: 'price', operator: 'gt', value: 100 }]);
      expect(result.every(r => r.price > 100)).toBe(true);
    });

    it('应过滤大于等于', () => {
      const result = filterData(mockStockData, [{ key: 'price', operator: 'gte', value: 220 }]);
      expect(result.every(r => r.price >= 220)).toBe(true);
    });

    it('应过滤小于', () => {
      const result = filterData(mockStockData, [{ key: 'price', operator: 'lt', value: 100 }]);
      expect(result.every(r => r.price < 100)).toBe(true);
    });

    it('应过滤包含', () => {
      const result = filterData(mockStockData, [{ key: 'name', operator: 'contains', value: '银行' }]);
      expect(result.length).toBe(1);
      expect(result[0].name).toContain('银行');
    });

    it('应过滤开头匹配', () => {
      const result = filterData(mockStockData, [{ key: 'name', operator: 'startsWith', value: '贵州' }]);
      expect(result.length).toBe(1);
    });

    it('应过滤结尾匹配', () => {
      const result = filterData(mockStockData, [{ key: 'name', operator: 'endsWith', value: '时代' }]);
      expect(result.length).toBe(1);
    });

    it('空过滤器应返回全部', () => {
      const result = filterData(mockStockData, []);
      expect(result.length).toBe(5);
    });

    it('多条件应同时满足', () => {
      const result = filterData(mockStockData, [
        { key: 'price', operator: 'gt', value: 30 },
        { key: 'changePercent', operator: 'gt', value: 0 },
      ]);
      expect(result.every(r => r.price > 30 && r.changePercent > 0)).toBe(true);
    });
  });

  describe('sortData', () => {
    it('应升序排序', () => {
      const result = sortData(mockStockData, 'price', 'asc');
      for (let i = 1; i < result.length; i++) {
        expect(result[i].price).toBeGreaterThanOrEqual(result[i - 1].price);
      }
    });

    it('应降序排序', () => {
      const result = sortData(mockStockData, 'price', 'desc');
      for (let i = 1; i < result.length; i++) {
        expect(result[i].price).toBeLessThanOrEqual(result[i - 1].price);
      }
    });

    it('不应修改原数组', () => {
      const original = [...mockStockData];
      sortData(mockStockData, 'price', 'desc');
      expect(mockStockData).toEqual(original);
    });

    it('应支持中文排序', () => {
      const result = sortData(mockStockData, 'name', 'asc');
      expect(result.length).toBe(5);
    });
  });

  describe('groupData', () => {
    it('应按字段分组', () => {
      const data = [
        { sector: '科技', name: 'A' },
        { sector: '金融', name: 'B' },
        { sector: '科技', name: 'C' },
      ];
      const groups = groupData(data, 'sector');
      expect(groups.size).toBe(2);
      expect(groups.get('科技')?.length).toBe(2);
      expect(groups.get('金融')?.length).toBe(1);
    });

    it('空值应归入未分组', () => {
      const data = [{ name: 'A' }, { name: 'B' }];
      const groups = groupData(data, 'sector');
      expect(groups.has('未分组')).toBe(true);
    });
  });

  describe('aggregateData', () => {
    it('应计算sum', () => {
      const result = aggregateData(mockStockData, [{ key: 'price', type: 'sum' }]);
      expect(result['price_sum']).toBeGreaterThan(0);
    });

    it('应计算avg', () => {
      const result = aggregateData(mockStockData, [{ key: 'price', type: 'avg' }]);
      expect(result['price_avg']).toBeGreaterThan(0);
    });

    it('应计算count', () => {
      const result = aggregateData(mockStockData, [{ key: 'price', type: 'count' }]);
      expect(result['price_count']).toBe(5);
    });

    it('应计算min/max', () => {
      const result = aggregateData(mockStockData, [
        { key: 'price', type: 'min' },
        { key: 'price', type: 'max' },
      ]);
      expect(result['price_min']).toBeLessThanOrEqual(result['price_max']);
    });

    it('应计算median', () => {
      const result = aggregateData(mockStockData, [{ key: 'price', type: 'median' }]);
      expect(result['price_median']).toBeGreaterThan(0);
    });

    it('应计算std', () => {
      const result = aggregateData(mockStockData, [{ key: 'price', type: 'std' }]);
      expect(result['price_std']).toBeGreaterThanOrEqual(0);
    });
  });
});

// ==================== 报告生成测试 ====================

describe('Bloomberg Export Engine - 报告生成', () => {
  const template: ReportTemplate = {
    id: 'test-1',
    name: '股票报告',
    description: '测试报告模板',
    columns,
    sortBy: 'price',
    sortOrder: 'desc',
    aggregations: [{ key: 'price', type: 'avg' }],
  };

  describe('generateReport', () => {
    it('应生成报告', () => {
      const result = generateReport(mockStockData, template);
      expect(result.export.rowCount).toBe(5);
      expect(result.summary.totalRows).toBe(5);
      expect(result.summary.overall['price_avg']).toBeGreaterThan(0);
    });

    it('带过滤器应减少行数', () => {
      const filtered: ReportTemplate = {
        ...template,
        filters: [{ key: 'price', operator: 'gt', value: 100 }],
      };
      const result = generateReport(mockStockData, filtered);
      expect(result.summary.totalRows).toBeLessThan(5);
    });

    it('带分组应有groups', () => {
      const grouped: ReportTemplate = {
        ...template,
        groupBy: 'symbol',
      };
      const result = generateReport(mockStockData, grouped);
      expect(result.summary.groups.length).toBe(5);
    });

    it('应限制行数', () => {
      const limited: ReportTemplate = {
        ...template,
        limit: 3,
      };
      const result = generateReport(mockStockData, limited);
      expect(result.summary.totalRows).toBe(3);
    });

    it('应支持不同格式', () => {
      const csvResult = generateReport(mockStockData, template, 'csv');
      expect(csvResult.export.filename).toContain('.csv');

      const jsonResult = generateReport(mockStockData, template, 'json');
      expect(jsonResult.export.filename).toContain('.json');
    });
  });

  describe('batchExport', () => {
    it('应批量导出', () => {
      const reports = [
        { data: mockStockData, template, format: 'csv' as const },
        { data: mockStockData, template, format: 'json' as const },
      ];
      const results = batchExport(reports);
      expect(results.length).toBe(2);
      expect(results[0].mimeType).toBe('text/csv;charset=utf-8');
      expect(results[1].mimeType).toBe('application/json');
    });
  });
});

// ==================== 模板管理测试 ====================

describe('Bloomberg Export Engine - 模板管理', () => {
  beforeEach(() => {
    // 清除之前注册的模板
    const templates = getAllReportTemplates();
    templates.forEach(t => {
      // 无法直接清除，但测试会覆盖
    });
  });

  it('应注册模板', () => {
    const template: ReportTemplate = {
      id: 'test-template',
      name: '测试模板',
      description: '测试描述',
      columns: STOCK_LIST_COLUMNS,
    };
    registerReportTemplate(template);
    const retrieved = getReportTemplate('test-template');
    expect(retrieved).toBeDefined();
    expect(retrieved?.name).toBe('测试模板');
  });

  it('应获取所有模板', () => {
    const templates = getAllReportTemplates();
    expect(Array.isArray(templates)).toBe(true);
  });

  it('不存在的模板应返回undefined', () => {
    const template = getReportTemplate('non-existent');
    expect(template).toBeUndefined();
  });
});

// ==================== 预定义列测试 ====================

describe('Bloomberg Export Engine - 预定义列', () => {
  it('STOCK_LIST_COLUMNS 应包含必要字段', () => {
    expect(STOCK_LIST_COLUMNS.length).toBeGreaterThan(0);
    expect(STOCK_LIST_COLUMNS.some(c => c.key === 'symbol')).toBe(true);
    expect(STOCK_LIST_COLUMNS.some(c => c.key === 'name')).toBe(true);
    expect(STOCK_LIST_COLUMNS.some(c => c.key === 'price')).toBe(true);
  });

  it('KLINE_COLUMNS 应包含K线字段', () => {
    expect(KLINE_COLUMNS.length).toBeGreaterThan(0);
    expect(KLINE_COLUMNS.some(c => c.key === 'open')).toBe(true);
    expect(KLINE_COLUMNS.some(c => c.key === 'high')).toBe(true);
    expect(KLINE_COLUMNS.some(c => c.key === 'low')).toBe(true);
    expect(KLINE_COLUMNS.some(c => c.key === 'close')).toBe(true);
  });

  it('BACKTEST_COLUMNS 应包含回测字段', () => {
    expect(BACKTEST_COLUMNS.length).toBeGreaterThan(0);
    expect(BACKTEST_COLUMNS.some(c => c.key === 'date')).toBe(true);
    expect(BACKTEST_COLUMNS.some(c => c.key === 'type')).toBe(true);
  });

  it('FINANCIAL_COLUMNS 应包含财务字段', () => {
    expect(FINANCIAL_COLUMNS.length).toBeGreaterThan(0);
    expect(FINANCIAL_COLUMNS.some(c => c.key === 'revenue')).toBe(true);
    expect(FINANCIAL_COLUMNS.some(c => c.key === 'netProfit')).toBe(true);
  });
});
