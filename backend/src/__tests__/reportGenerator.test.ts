import { describe, it, expect, beforeEach } from 'vitest';

/**
 * 报表生成器测试（影子测试核对结论：生产无同契约导出）
 *
 * 逐条核对任务指定的三个候选模块后确认均不是本测试 ReportGenerator 的真源：
 * - frontend/src/utils/researchReportEngine.ts:88-286 只导出 ratingToNumber / trackRatingChanges /
 *   analyzeConsensus / analyzeReportSentiment / findMostDivided（研报评级变化与一致预期），
 *   没有 createReport / registerDataSource / generate / exportCSV 等报表构建契约。
 * - frontend/src/utils/researchReportAnalysisEngine.ts:43-242 的 ResearchReportEngine 只有
 *   calculateConsensus / evaluateAnalystAccuracy / calculateSentimentIndex / analyzeRatingChanges，
 *   入参是 ResearchReport（stockCode/brokerName/rating/targetPrice），没有 ReportConfig / 分页 / 分组。
 * - frontend/src/utils/financialReportEngine.ts:89-321 只做财报同比环比、杜邦分析、健康评分、预警，
 *   与报表生成器无交集。
 * 全仓检索也没有其他 ReportGenerator / createReport 生产定义，故保留内联实现作为测试替身；
 * 同时用固定时钟 + 自增序号替代随机数与当前时间，保证每次运行结果确定。
 */

// 固定时钟：2024-01-02T09:30:00Z，供 generatedAt 与历史记录使用（不使用无参 new Date）。
const FIXED_NOW = 1704187800000;

// Report Generator Engine
interface ReportColumn {
  id: string;
  name: string;
  field: string;
  type: 'string' | 'number' | 'date' | 'boolean' | 'currency' | 'percentage';
  width?: number;
  align?: 'left' | 'center' | 'right';
  sortable: boolean;
  filterable: boolean;
  aggregation?: 'sum' | 'avg' | 'min' | 'max' | 'count' | 'distinct';
  format?: string;
  visible: boolean;
}

interface ReportFilter {
  id: string;
  field: string;
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'in' | 'between' | 'is_null' | 'is_not_null';
  value: unknown;
  value2?: unknown;
  logic: 'and' | 'or';
}

interface ReportGrouping {
  field: string;
  sortOrder: 'asc' | 'desc';
  showSubtotals: boolean;
  collapsed: boolean;
}

interface ReportConfig {
  id: string;
  name: string;
  description: string;
  columns: ReportColumn[];
  filters: ReportFilter[];
  groupings: ReportGrouping[];
  sortBy: { field: string; order: 'asc' | 'desc' }[];
  pagination: { page: number; pageSize: number };
  charts: { type: string; xField: string; yField: string }[];
  schedule?: { cron: string; recipients: string[] };
  format: 'html' | 'pdf' | 'csv' | 'excel' | 'json';
  header: { title: string; logo?: string; date: string };
  footer: { text: string; pageNumbers: boolean };
}

interface ReportResult {
  data: Record<string, unknown>[];
  totalRows: number;
  aggregations: Record<string, number>;
  groups: Record<string, Record<string, unknown>[]>;
  charts: { type: string; data: unknown[] }[];
  generatedAt: Date;
  executionTime: number;
}

class ReportGenerator {
  private reports: Map<string, ReportConfig> = new Map();
  private dataSources: Map<string, Record<string, unknown>[]> = new Map();
  private history: { reportId: string; generatedAt: Date; format: string }[] = [];
  // 确定性序号：替代「当前时钟 + 随机数」生成 id，保证同一用例每次运行 id 一致。
  private sequence = 0;

  createReport(config: Omit<ReportConfig, 'id'>): ReportConfig {
    // 旧内联实现用当前时钟与随机数拼接 id（非确定性，且触发测试禁用模式）；改为自增序号。
    const id = `rpt_${++this.sequence}`;
    const report: ReportConfig = { ...config, id };
    this.reports.set(id, report);
    return report;
  }

  registerDataSource(name: string, data: Record<string, unknown>[]): void {
    this.dataSources.set(name, data);
  }

  async generate(reportId: string, dataSource?: string): Promise<ReportResult> {
    const report = this.reports.get(reportId);
    if (!report) throw new Error('Report not found');

    let data = this.dataSources.get(dataSource ?? 'default') ?? [];

    // Apply filters
    data = this.applyFilters(data, report.filters);

    // Apply sorting
    data = this.applySorting(data, report.sortBy);

    // Calculate aggregations
    const aggregations = this.calculateAggregations(data, report.columns);

    // Apply grouping
    const groups = this.applyGrouping(data, report.groupings);

    // Apply pagination
    const totalRows = data.length;
    const { page, pageSize } = report.pagination;
    data = data.slice((page - 1) * pageSize, page * pageSize);

    const result: ReportResult = {
      data,
      totalRows,
      aggregations,
      groups,
      charts: report.charts.map(c => ({ type: c.type, data: [] })),
      // 旧内联实现取当前时钟；改为固定时刻 + 固定耗时，执行结果可复现。
      generatedAt: new Date(FIXED_NOW),
      executionTime: 0,
    };

    this.history.push({ reportId, generatedAt: result.generatedAt, format: report.format });
    return result;
  }

  private applyFilters(data: Record<string, unknown>[], filters: ReportFilter[]): Record<string, unknown>[] {
    if (filters.length === 0) return data;
    return data.filter(row => {
      return filters.every(f => {
        const value = row[f.field];
        switch (f.operator) {
          case 'eq': return value === f.value;
          case 'neq': return value !== f.value;
          case 'gt': return (value as number) > (f.value as number);
          case 'gte': return (value as number) >= (f.value as number);
          case 'lt': return (value as number) < (f.value as number);
          case 'lte': return (value as number) <= (f.value as number);
          case 'contains': return String(value).includes(String(f.value));
          case 'in': return (f.value as unknown[]).includes(value);
          case 'between': return (value as number) >= (f.value as number) && (value as number) <= (f.value2 as number);
          case 'is_null': return value === null || value === undefined;
          case 'is_not_null': return value !== null && value !== undefined;
          default: return true;
        }
      });
    });
  }

  private applySorting(data: Record<string, unknown>[], sortBy: ReportConfig['sortBy']): Record<string, unknown>[] {
    if (sortBy.length === 0) return data;
    return [...data].sort((a, b) => {
      for (const { field, order } of sortBy) {
        const va = a[field] as number;
        const vb = b[field] as number;
        if (va < vb) return order === 'asc' ? -1 : 1;
        if (va > vb) return order === 'asc' ? 1 : -1;
      }
      return 0;
    });
  }

  private calculateAggregations(data: Record<string, unknown>[], columns: ReportColumn[]): Record<string, number> {
    const result: Record<string, number> = {};
    for (const col of columns) {
      if (!col.aggregation) continue;
      const values = data.map(r => r[col.field] as number).filter(v => typeof v === 'number');
      switch (col.aggregation) {
        case 'sum': result[col.id] = values.reduce((a, b) => a + b, 0); break;
        case 'avg': result[col.id] = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0; break;
        case 'min': result[col.id] = Math.min(...values); break;
        case 'max': result[col.id] = Math.max(...values); break;
        case 'count': result[col.id] = values.length; break;
        case 'distinct': result[col.id] = new Set(values).size; break;
      }
    }
    return result;
  }

  private applyGrouping(data: Record<string, unknown>[], groupings: ReportGrouping[]): Record<string, Record<string, unknown>[]> {
    if (groupings.length === 0) return { all: data };
    const groups: Record<string, Record<string, unknown>[]> = {};
    const field = groupings[0].field;
    for (const row of data) {
      const key = String(row[field] ?? 'Unknown');
      if (!groups[key]) groups[key] = [];
      groups[key].push(row);
    }
    return groups;
  }

  exportCSV(reportId: string, data: Record<string, unknown>[]): string {
    const report = this.reports.get(reportId);
    if (!report) throw new Error('Report not found');
    const visibleCols = report.columns.filter(c => c.visible);
    const headers = visibleCols.map(c => c.name);
    const rows = data.map(row => visibleCols.map(c => String(row[c.field] ?? '')));
    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  }

  exportJSON(reportId: string, data: Record<string, unknown>[]): string {
    return JSON.stringify(data, null, 2);
  }

  addColumn(reportId: string, column: Omit<ReportColumn, 'id'>): void {
    const report = this.reports.get(reportId);
    if (report) {
      // 旧内联实现用当前时钟生成列 id；改为自增序号。
      report.columns.push({ ...column, id: `col_${++this.sequence}` });
    }
  }

  removeColumn(reportId: string, columnId: string): boolean {
    const report = this.reports.get(reportId);
    if (!report) return false;
    const idx = report.columns.findIndex(c => c.id === columnId);
    if (idx >= 0) {
      report.columns.splice(idx, 1);
      return true;
    }
    return false;
  }

  addFilter(reportId: string, filter: Omit<ReportFilter, 'id'>): void {
    const report = this.reports.get(reportId);
    if (report) {
      // 旧内联实现用当前时钟生成过滤器 id；改为自增序号。
      report.filters.push({ ...filter, id: `flt_${++this.sequence}` });
    }
  }

  cloneReport(reportId: string): ReportConfig | null {
    const report = this.reports.get(reportId);
    if (!report) return null;
    return this.createReport({ ...report, name: `${report.name} (copy)` });
  }

  scheduleReport(reportId: string, cron: string, recipients: string[]): boolean {
    const report = this.reports.get(reportId);
    if (!report) return false;
    report.schedule = { cron, recipients };
    return true;
  }

  getHistory(): { reportId: string; generatedAt: Date; format: string }[] {
    return [...this.history];
  }

  getReport(id: string): ReportConfig | undefined {
    return this.reports.get(id);
  }
}

describe('Report Generator', () => {
  let generator: ReportGenerator;
  const sampleData = [
    { name: 'AAPL', price: 150, volume: 1000000, sector: 'Tech', change: 2.5 },
    { name: 'GOOGL', price: 2800, volume: 500000, sector: 'Tech', change: -1.2 },
    { name: 'JPM', price: 150, volume: 800000, sector: 'Finance', change: 1.8 },
    { name: 'GS', price: 380, volume: 300000, sector: 'Finance', change: -0.5 },
    { name: 'XOM', price: 85, volume: 1200000, sector: 'Energy', change: 3.1 },
  ];

  beforeEach(() => {
    generator = new ReportGenerator();
    generator.registerDataSource('default', sampleData);
    generator.registerDataSource('stocks', sampleData);
  });

  it('should create report', () => {
    const report = generator.createReport({
      name: 'Stock Report',
      description: 'Daily stock report',
      columns: [
        { id: 'c1', name: 'Name', field: 'name', type: 'string', sortable: true, filterable: true, visible: true },
        { id: 'c2', name: 'Price', field: 'price', type: 'number', sortable: true, filterable: true, visible: true, aggregation: 'avg' },
      ],
      filters: [],
      groupings: [],
      sortBy: [],
      pagination: { page: 1, pageSize: 10 },
      charts: [],
      format: 'html',
      header: { title: 'Stock Report', date: '2024-01-01' },
      footer: { text: 'Generated by system', pageNumbers: true },
    });
    expect(report.name).toBe('Stock Report');
    expect(report.id).toBeTruthy();
  });

  it('should generate report', async () => {
    const report = generator.createReport({
      name: 'Test', description: '',
      columns: [{ id: 'c1', name: 'Name', field: 'name', type: 'string', sortable: true, filterable: true, visible: true }],
      filters: [], groupings: [], sortBy: [],
      pagination: { page: 1, pageSize: 10 },
      charts: [],
      format: 'json',
      header: { title: 'T', date: '2024' },
      footer: { text: '', pageNumbers: false },
    });
    const result = await generator.generate(report.id);
    expect(result.data).toHaveLength(5);
    expect(result.totalRows).toBe(5);
  });

  it('should apply filters', async () => {
    const report = generator.createReport({
      name: 'Filtered', description: '',
      columns: [{ id: 'c1', name: 'Name', field: 'name', type: 'string', sortable: true, filterable: true, visible: true }],
      filters: [{ id: 'f1', field: 'sector', operator: 'eq', value: 'Tech', logic: 'and' }],
      groupings: [], sortBy: [],
      pagination: { page: 1, pageSize: 10 },
      charts: [],
      format: 'html',
      header: { title: '', date: '' },
      footer: { text: '', pageNumbers: false },
    });
    const result = await generator.generate(report.id);
    expect(result.data).toHaveLength(2);
  });

  it('should apply sorting', async () => {
    const report = generator.createReport({
      name: 'Sorted', description: '',
      columns: [{ id: 'c1', name: 'Price', field: 'price', type: 'number', sortable: true, filterable: true, visible: true }],
      filters: [], groupings: [],
      sortBy: [{ field: 'price', order: 'desc' }],
      pagination: { page: 1, pageSize: 10 },
      charts: [],
      format: 'html',
      header: { title: '', date: '' },
      footer: { text: '', pageNumbers: false },
    });
    const result = await generator.generate(report.id);
    expect((result.data[0] as any).price).toBe(2800);
  });

  it('should paginate', async () => {
    const report = generator.createReport({
      name: 'Paginated', description: '',
      columns: [{ id: 'c1', name: 'Name', field: 'name', type: 'string', sortable: true, filterable: true, visible: true }],
      filters: [], groupings: [], sortBy: [],
      pagination: { page: 2, pageSize: 2 },
      charts: [],
      format: 'html',
      header: { title: '', date: '' },
      footer: { text: '', pageNumbers: false },
    });
    const result = await generator.generate(report.id);
    expect(result.data).toHaveLength(2);
    expect(result.totalRows).toBe(5);
  });

  it('should calculate aggregations', async () => {
    const report = generator.createReport({
      name: 'Agg', description: '',
      columns: [
        { id: 'c1', name: 'Price', field: 'price', type: 'number', sortable: true, filterable: true, visible: true, aggregation: 'sum' },
        { id: 'c2', name: 'Vol', field: 'volume', type: 'number', sortable: true, filterable: true, visible: true, aggregation: 'max' },
      ],
      filters: [], groupings: [], sortBy: [],
      pagination: { page: 1, pageSize: 10 },
      charts: [],
      format: 'html',
      header: { title: '', date: '' },
      footer: { text: '', pageNumbers: false },
    });
    const result = await generator.generate(report.id);
    expect(result.aggregations.c1).toBe(150 + 2800 + 150 + 380 + 85);
    expect(result.aggregations.c2).toBe(1200000);
  });

  it('should export CSV', () => {
    const report = generator.createReport({
      name: 'CSV', description: '',
      columns: [{ id: 'c1', name: 'Name', field: 'name', type: 'string', sortable: true, filterable: true, visible: true }],
      filters: [], groupings: [], sortBy: [],
      pagination: { page: 1, pageSize: 10 },
      charts: [],
      format: 'csv',
      header: { title: '', date: '' },
      footer: { text: '', pageNumbers: false },
    });
    const csv = generator.exportCSV(report.id, sampleData);
    expect(csv).toContain('Name');
    expect(csv).toContain('AAPL');
  });

  it('should export JSON', () => {
    const report = generator.createReport({
      name: 'JSON', description: '',
      columns: [{ id: 'c1', name: 'Name', field: 'name', type: 'string', sortable: true, filterable: true, visible: true }],
      filters: [], groupings: [], sortBy: [],
      pagination: { page: 1, pageSize: 10 },
      charts: [],
      format: 'json',
      header: { title: '', date: '' },
      footer: { text: '', pageNumbers: false },
    });
    const json = generator.exportJSON(report.id, sampleData);
    expect(JSON.parse(json)).toHaveLength(5);
  });

  it('should add and remove columns', () => {
    const report = generator.createReport({
      name: 'Cols', description: '',
      columns: [{ id: 'c1', name: 'Name', field: 'name', type: 'string', sortable: true, filterable: true, visible: true }],
      filters: [], groupings: [], sortBy: [],
      pagination: { page: 1, pageSize: 10 },
      charts: [],
      format: 'html',
      header: { title: '', date: '' },
      footer: { text: '', pageNumbers: false },
    });
    generator.addColumn(report.id, { name: 'Price', field: 'price', type: 'number', sortable: true, filterable: true, visible: true });
    expect(generator.getReport(report.id)!.columns).toHaveLength(2);
  });

  it('should add filter', () => {
    const report = generator.createReport({
      name: 'F', description: '',
      columns: [{ id: 'c1', name: 'Name', field: 'name', type: 'string', sortable: true, filterable: true, visible: true }],
      filters: [], groupings: [], sortBy: [],
      pagination: { page: 1, pageSize: 10 },
      charts: [],
      format: 'html',
      header: { title: '', date: '' },
      footer: { text: '', pageNumbers: false },
    });
    generator.addFilter(report.id, { field: 'price', operator: 'gt', value: 100, logic: 'and' });
    expect(generator.getReport(report.id)!.filters).toHaveLength(1);
  });

  it('should clone report', () => {
    const report = generator.createReport({
      name: 'Original', description: '',
      columns: [], filters: [], groupings: [], sortBy: [],
      pagination: { page: 1, pageSize: 10 },
      charts: [],
      format: 'html',
      header: { title: '', date: '' },
      footer: { text: '', pageNumbers: false },
    });
    const clone = generator.cloneReport(report.id);
    expect(clone?.name).toContain('copy');
  });

  it('should schedule report', () => {
    const report = generator.createReport({
      name: 'Sched', description: '',
      columns: [], filters: [], groupings: [], sortBy: [],
      pagination: { page: 1, pageSize: 10 },
      charts: [],
      format: 'html',
      header: { title: '', date: '' },
      footer: { text: '', pageNumbers: false },
    });
    expect(generator.scheduleReport(report.id, '0 9 * * 1', ['a@b.com'])).toBe(true);
    expect(generator.getReport(report.id)!.schedule?.cron).toBe('0 9 * * 1');
  });

  it('should track history', async () => {
    const report = generator.createReport({
      name: 'Hist', description: '',
      columns: [{ id: 'c1', name: 'Name', field: 'name', type: 'string', sortable: true, filterable: true, visible: true }],
      filters: [], groupings: [], sortBy: [],
      pagination: { page: 1, pageSize: 10 },
      charts: [],
      format: 'html',
      header: { title: '', date: '' },
      footer: { text: '', pageNumbers: false },
    });
    await generator.generate(report.id);
    expect(generator.getHistory()).toHaveLength(1);
  });

  it('should apply grouping', async () => {
    const report = generator.createReport({
      name: 'Grouped', description: '',
      columns: [{ id: 'c1', name: 'Name', field: 'name', type: 'string', sortable: true, filterable: true, visible: true }],
      filters: [],
      groupings: [{ field: 'sector', sortOrder: 'asc', showSubtotals: true, collapsed: false }],
      sortBy: [],
      pagination: { page: 1, pageSize: 10 },
      charts: [],
      format: 'html',
      header: { title: '', date: '' },
      footer: { text: '', pageNumbers: false },
    });
    const result = await generator.generate(report.id);
    expect(Object.keys(result.groups)).toContain('Tech');
    expect(Object.keys(result.groups)).toContain('Finance');
  });

  it('should handle between filter', async () => {
    const report = generator.createReport({
      name: 'Between', description: '',
      columns: [{ id: 'c1', name: 'Price', field: 'price', type: 'number', sortable: true, filterable: true, visible: true }],
      filters: [{ id: 'f1', field: 'price', operator: 'between', value: 100, value2: 200, logic: 'and' }],
      groupings: [], sortBy: [],
      pagination: { page: 1, pageSize: 10 },
      charts: [],
      format: 'html',
      header: { title: '', date: '' },
      footer: { text: '', pageNumbers: false },
    });
    const result = await generator.generate(report.id);
    expect(result.data.length).toBeGreaterThan(0);
    for (const row of result.data) {
      expect(row.price as number).toBeGreaterThanOrEqual(100);
      expect(row.price as number).toBeLessThanOrEqual(200);
    }
  });

  it('should handle in filter', async () => {
    const report = generator.createReport({
      name: 'In', description: '',
      columns: [{ id: 'c1', name: 'Name', field: 'name', type: 'string', sortable: true, filterable: true, visible: true }],
      filters: [{ id: 'f1', field: 'name', operator: 'in', value: ['AAPL', 'GOOGL'], logic: 'and' }],
      groupings: [], sortBy: [],
      pagination: { page: 1, pageSize: 10 },
      charts: [],
      format: 'html',
      header: { title: '', date: '' },
      footer: { text: '', pageNumbers: false },
    });
    const result = await generator.generate(report.id);
    expect(result.data).toHaveLength(2);
  });
});
