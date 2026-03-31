/**
 * 数据表格工具
 * Data Table Utilities
 *
 * 排序、筛选、分页、列配置、导出
 */

export type SortDirection = 'asc' | 'desc' | null;

export interface SortConfig {
  column: string;
  direction: SortDirection;
}

export interface FilterConfig {
  column: string;
  operator: 'eq' | 'ne' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains' | 'startsWith' | 'between' | 'in';
  value: any;
  value2?: any;
}

export interface PaginationConfig {
  page: number;
  pageSize: number;
  total: number;
}

export interface TableResult<T> {
  data: T[];
  pagination: PaginationConfig;
  sort: SortConfig | null;
  filters: FilterConfig[];
}

/**
 * 数据表格处理器
 */
export class DataTableProcessor<T extends Record<string, any>> {
  private data: T[];
  private sort: SortConfig | null = null;
  private filters: FilterConfig[] = [];
  private page: number = 1;
  private pageSize: number = 20;

  constructor(data: T[]) {
    this.data = [...data];
  }

  /**
   * 排序
   */
  sortBy(column: string, direction: SortDirection): this {
    this.sort = direction ? { column, direction } : null;
    return this;
  }

  /**
   * 添加筛选
   */
  filter(config: FilterConfig): this {
    this.filters.push(config);
    return this;
  }

  /**
   * 清除筛选
   */
  clearFilters(): this {
    this.filters = [];
    return this;
  }

  /**
   * 设置分页
   */
  paginate(page: number, pageSize: number): this {
    this.page = page;
    this.pageSize = pageSize;
    return this;
  }

  /**
   * 执行处理
   */
  execute(): TableResult<T> {
    let result = [...this.data];

    // 筛选
    for (const f of this.filters) {
      result = result.filter(row => this.applyFilter(row[f.column], f));
    }

    // 排序
    if (this.sort) {
      const { column, direction } = this.sort;
      result.sort((a, b) => {
        const va = a[column];
        const vb = b[column];
        const cmp = va < vb ? -1 : va > vb ? 1 : 0;
        return direction === 'asc' ? cmp : -cmp;
      });
    }

    // 分页
    const total = result.length;
    const start = (this.page - 1) * this.pageSize;
    const paged = result.slice(start, start + this.pageSize);

    return {
      data: paged,
      pagination: {
        page: this.page,
        pageSize: this.pageSize,
        total,
      },
      sort: this.sort,
      filters: this.filters,
    };
  }

  /**
   * 获取所有唯一值（用于筛选器）
   */
  uniqueValues(column: string): any[] {
    const values = new Set(this.data.map(row => row[column]));
    return Array.from(values).sort();
  }

  private applyFilter(value: any, config: FilterConfig): boolean {
    switch (config.operator) {
      case 'eq': return value === config.value;
      case 'ne': return value !== config.value;
      case 'gt': return value > config.value;
      case 'lt': return value < config.value;
      case 'gte': return value >= config.value;
      case 'lte': return value <= config.value;
      case 'contains': return String(value).toLowerCase().includes(String(config.value).toLowerCase());
      case 'startsWith': return String(value).toLowerCase().startsWith(String(config.value).toLowerCase());
      case 'between': return value >= config.value && value <= config.value2;
      case 'in': return Array.isArray(config.value) && config.value.includes(value);
      default: return true;
    }
  }
}

/**
 * 导出为CSV
 */
export function exportToCSV<T extends Record<string, any>>(
  data: T[],
  columns: Array<{ key: keyof T; label: string }>
): string {
  const header = columns.map(c => c.label).join(',');
  const rows = data.map(row =>
    columns.map(c => {
      const val = row[c.key];
      if (typeof val === 'string' && (val.includes(',') || val.includes('"'))) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val ?? '';
    }).join(',')
  );
  return [header, ...rows].join('\n');
}
