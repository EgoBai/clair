import { describe, it, expect } from 'vitest';
import {
  formatNumber,
  formatPercent,
  formatCurrency,
  formatDate,
  escapeCSVValue,
  exportToCSV,
  exportToJSON,
  exportToHTML,
  exportData,
  filterData,
  sortData,
  groupData,
  aggregateData,
  generateReport,
  batchExport,
  formatChangePercent,
  formatVolume,
  formatTurnover,
  formatPE,
  type ExportColumn,
  type ReportTemplate,
} from '../utils/exportEngine';

// ==================== 测试数据 ====================

const mockData = [
  { id: 1, name: '贵州茅台', price: 1800, change: 2.5, volume: 50000000, marketCap: 2.3e12 },
  { id: 2, name: '宁德时代', price: 220, change: -1.2, volume: 80000000, marketCap: 5000e8 },
  { id: 3, name: '中国平安', price: 45, change: 0.8, volume: 30000000, marketCap: 8000e8 },
  { id: 4, name: '招商银行', price: 35, change: -0.5, volume: 20000000, marketCap: 7000e8 },
  { id: 5, name: '比亚迪', price: 280, change: 3.2, volume: 60000000, marketCap: 8000e8 },
];

const columns: ExportColumn[] = [
  { key: 'name', label: '名称' },
  { key: 'price', label: '价格', format: (v) => formatNumber(v) },
  { key: 'change', label: '涨跌幅', format: (v) => formatChangePercent(v) },
  { key: 'volume', label: '成交量', format: (v) => formatVolume(v) },
];

// ==================== 格式化函数测试 ====================

describe('formatNumber', () => {
  it('应格式化数字', () => {
    expect(formatNumber(1234.567)).toContain('1');
  });

  it('空值应返回-', () => {
    expect(formatNumber(null)).toBe('-');
    expect(formatNumber(undefined)).toBe('-');
  });

  it('NaN应返回字符串', () => {
    expect(formatNumber('abc')).toBe('abc');
  });
});

describe('formatPercent', () => {
  it('应格式化百分比', () => {
    expect(formatPercent(0.1234)).toBe('12.34%');
    expect(formatPercent(0.05)).toBe('5.00%');
  });

  it('空值应返回-', () => {
    expect(formatPercent(null)).toBe('-');
  });
});

describe('formatCurrency', () => {
  it('应格式化人民币', () => {
    const result = formatCurrency(1.5e12);
    expect(result).toContain('万亿');
  });

  it('亿级应正确格式化', () => {
    const result = formatCurrency(5e8);
    expect(result).toContain('亿');
  });

  it('万级应正确格式化', () => {
    const result = formatCurrency(5e4);
    expect(result).toContain('万');
  });

  it('空值应返回-', () => {
    expect(formatCurrency(null)).toBe('-');
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

  it('无效日期应返回原始值', () => {
    expect(formatDate('invalid')).toBe('invalid');
  });

  it('空值应返回-', () => {
    expect(formatDate(null)).toBe('-');
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

// ==================== CSV导出测试 ====================

describe('exportToCSV', () => {
  it('应导出CSV格式', () => {
    const result = exportToCSV(mockData, { columns, filename: 'stocks' });
    expect(result.filename).toBe('stocks.csv');
    expect(result.mimeType).toBe('text/csv');
    expect(result.rowCount).toBe(5);
    expect(result.columnCount).toBe(4);
    expect(result.content).toContain('名称');
    expect(result.content).toContain('贵州茅台');
  });

  it('不含表头时应不添加', () => {
    const result = exportToCSV(mockData, { columns, includeHeader: false });
    const firstLine = result.content.split('\n')[0];
    expect(firstLine).not.toContain('名称');
  });

  it('应包含时间戳', () => {
    const result = exportToCSV(mockData, { columns, includeTimestamp: true });
    expect(result.content).toContain('导出时间');
  });

  it('空数据应返回空内容', () => {
    const result = exportToCSV([], { columns });
    expect(result.rowCount).toBe(0);
  });
});

// ==================== JSON导出测试 ====================

describe('exportToJSON', () => {
  it('应导出JSON格式', () => {
    const result = exportToJSON(mockData, { columns, filename: 'stocks' });
    expect(result.filename).toBe('stocks.json');
    expect(result.mimeType).toBe('application/json');

    const parsed = JSON.parse(result.content);
    expect(parsed.data.length).toBe(5);
    expect(parsed.rowCount).toBe(5);
  });

  it('应有导出时间', () => {
    const result = exportToJSON(mockData, { columns, includeTimestamp: true });
    const parsed = JSON.parse(result.content);
    expect(parsed.exportTime).toBeTruthy();
  });
});

// ==================== HTML导出测试 ====================

describe('exportToHTML', () => {
  it('应导出HTML表格', () => {
    const result = exportToHTML(mockData, { columns, filename: 'stocks' });
    expect(result.filename).toBe('stocks.html');
    expect(result.mimeType).toBe('text/html');
    expect(result.content).toContain('<table');
    expect(result.content).toContain('<th');
    expect(result.content).toContain('贵州茅台');
  });

  it('应转义HTML特殊字符', () => {
    const data = [{ name: '<script>alert(1)</script>', price: 100 }];
    const result = exportToHTML(data, { columns: [{ key: 'name', label: '名' }, { key: 'price', label: '价' }] });
    expect(result.content).not.toContain('<script>');
    expect(result.content).toContain('&lt;script&gt;');
  });
});

// ==================== 通用导出测试 ====================

describe('exportData', () => {
  it('应根据格式导出', () => {
    const csv = exportData(mockData, { format: 'csv', columns });
    expect(csv.filename).toContain('.csv');

    const json = exportData(mockData, { format: 'json', columns });
    expect(json.filename).toContain('.json');

    const html = exportData(mockData, { format: 'html', columns });
    expect(html.filename).toContain('.html');
  });

  it('默认应导出CSV', () => {
    const result = exportData(mockData, { columns });
    expect(result.mimeType).toBe('text/csv');
  });
});

// ==================== 数据处理测试 ====================

describe('filterData', () => {
  it('应过滤等值', () => {
    const result = filterData(mockData, [{ key: 'name', operator: 'eq', value: '贵州茅台' }]);
    expect(result.length).toBe(1);
  });

  it('应过滤大于', () => {
    const result = filterData(mockData, [{ key: 'price', operator: 'gt', value: 100 }]);
    expect(result.every(r => r.price > 100)).toBe(true);
  });

  it('应过滤包含', () => {
    const result = filterData(mockData, [{ key: 'name', operator: 'contains', value: '银行' }]);
    expect(result.length).toBe(1);
    expect(result[0].name).toContain('银行');
  });

  it('空过滤器应返回全部', () => {
    const result = filterData(mockData, []);
    expect(result.length).toBe(5);
  });

  it('多条件应同时满足', () => {
    const result = filterData(mockData, [
      { key: 'price', operator: 'gt', value: 30 },
      { key: 'change', operator: 'gt', value: 0 },
    ]);
    expect(result.every(r => r.price > 30 && r.change > 0)).toBe(true);
  });
});

describe('sortData', () => {
  it('应升序排序', () => {
    const result = sortData(mockData, 'price', 'asc');
    for (let i = 1; i < result.length; i++) {
      expect(result[i].price).toBeGreaterThanOrEqual(result[i - 1].price);
    }
  });

  it('应降序排序', () => {
    const result = sortData(mockData, 'price', 'desc');
    for (let i = 1; i < result.length; i++) {
      expect(result[i].price).toBeLessThanOrEqual(result[i - 1].price);
    }
  });

  it('不应修改原数组', () => {
    const original = [...mockData];
    sortData(mockData, 'price', 'desc');
    expect(mockData).toEqual(original);
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
    const result = aggregateData(mockData, [{ key: 'price', type: 'sum' }]);
    expect(result['price_sum']).toBeGreaterThan(0);
  });

  it('应计算avg', () => {
    const result = aggregateData(mockData, [{ key: 'price', type: 'avg' }]);
    expect(result['price_avg']).toBeGreaterThan(0);
  });

  it('应计算count', () => {
    const result = aggregateData(mockData, [{ key: 'price', type: 'count' }]);
    expect(result['price_count']).toBe(5);
  });

  it('应计算min/max', () => {
    const result = aggregateData(mockData, [
      { key: 'price', type: 'min' },
      { key: 'price', type: 'max' },
    ]);
    expect(result['price_min']).toBeLessThanOrEqual(result['price_max']);
  });
});

// ==================== 报告生成测试 ====================

describe('generateReport', () => {
  const template: ReportTemplate = {
    id: '1',
    name: '股票报告',
    description: '测试报告',
    columns,
    sortBy: 'price',
    sortOrder: 'desc',
    aggregations: [{ key: 'price', type: 'avg' }],
  };

  it('应生成报告', () => {
    const result = generateReport(mockData, template);
    expect(result.export.rowCount).toBe(5);
    expect(result.summary.totalRows).toBe(5);
    expect(result.summary.overall['price_avg']).toBeGreaterThan(0);
  });

  it('带过滤器应减少行数', () => {
    const filtered: ReportTemplate = {
      ...template,
      filters: [{ key: 'price', operator: 'gt', value: 100 }],
    };
    const result = generateReport(mockData, filtered);
    expect(result.summary.totalRows).toBeLessThan(5);
  });

  it('带分组应有groups', () => {
    const grouped: ReportTemplate = {
      ...template,
      groupBy: 'name',
    };
    const result = generateReport(mockData, grouped);
    expect(result.summary.groups.length).toBe(5);
  });
});

describe('batchExport', () => {
  it('应批量导出', () => {
    const reports = [
      { data: mockData, template: { id: '1', name: 'r1', description: '', columns }, format: 'csv' as const },
      { data: mockData, template: { id: '2', name: 'r2', description: '', columns }, format: 'json' as const },
    ];
    const results = batchExport(reports);
    expect(results.length).toBe(2);
    expect(results[0].mimeType).toBe('text/csv');
    expect(results[1].mimeType).toBe('application/json');
  });
});

// ==================== 股票专用格式化测试 ====================

describe('formatChangePercent', () => {
  it('正数应加+前缀', () => {
    expect(formatChangePercent(2.5)).toBe('+2.50%');
  });

  it('负数应正常显示', () => {
    expect(formatChangePercent(-1.2)).toBe('-1.20%');
  });

  it('零应不加前缀', () => {
    expect(formatChangePercent(0)).toBe('0.00%');
  });
});

describe('formatVolume', () => {
  it('亿级应格式化', () => {
    expect(formatVolume(5e8)).toContain('亿手');
  });

  it('万级应格式化', () => {
    expect(formatVolume(5e5)).toContain('万手');
  });

  it('小数应格式化', () => {
    expect(formatVolume(500)).toContain('手');
  });
});

describe('formatTurnover', () => {
  it('万亿级应格式化', () => {
    expect(formatTurnover(1.5e12)).toContain('万亿');
  });

  it('亿级应格式化', () => {
    expect(formatTurnover(5e8)).toContain('亿');
  });
});

describe('formatPE', () => {
  it('正PE应正常显示', () => {
    expect(formatPE(25.5)).toBe('25.50');
  });

  it('负PE应显示亏损', () => {
    expect(formatPE(-10)).toContain('亏');
  });

  it('空值应返回-', () => {
    expect(formatPE(null)).toBe('-');
  });
});
