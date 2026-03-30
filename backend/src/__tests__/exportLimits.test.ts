/**
 * 导出限制系统 - Round 175
 * 覆盖：CSV/JSON/PDF导出限制、格式验证、水印、批量导出控制
 */
import { describe, it, expect } from 'vitest';

// ============ 类型 ============

type ExportFormat = 'csv' | 'json' | 'xlsx' | 'pdf';

interface ExportRequest {
  userId: string;
  format: ExportFormat;
  dataType: 'stocks' | 'portfolio' | 'backtest' | 'screener';
  rows: number;
  dateRange: { from: string; to: string };
  columns?: string[];
}

interface ExportResult {
  success: boolean;
  filename: string;
  size: number;
  rowCount: number;
  watermark?: string;
  error?: string;
  code?: string;
}

// ============ 限制配置 ============

const EXPORT_LIMITS = {
  free: {
    maxRows: 100,
    maxExportsPerDay: 3,
    allowedFormats: ['csv'] as ExportFormat[],
    watermark: 'A股分析-免费版',
    maxDateRangeDays: 30,
  },
  pro: {
    maxRows: 10000,
    maxExportsPerDay: 50,
    allowedFormats: ['csv', 'json', 'xlsx', 'pdf'] as ExportFormat[],
    watermark: '',
    maxDateRangeDays: 365,
  },
  enterprise: {
    maxRows: 100000,
    maxExportsPerDay: 500,
    allowedFormats: ['csv', 'json', 'xlsx', 'pdf'] as ExportFormat[],
    watermark: '',
    maxDateRangeDays: 3650,
  },
};

// ============ 导出引擎 ============

class ExportEngine {
  private dailyExports: Map<string, number> = new Map();
  private planResolver: (userId: string) => string;

  constructor(planResolver?: (userId: string) => string) {
    this.planResolver = planResolver || ((uid) => {
      if (uid.startsWith('ent_')) return 'enterprise';
      if (uid.startsWith('pro_')) return 'pro';
      return 'free';
    });
  }

  validate(req: ExportRequest): { valid: boolean; error?: string; code?: string } {
    const plan = this.planResolver(req.userId);
    const limits = EXPORT_LIMITS[plan as keyof typeof EXPORT_LIMITS] || EXPORT_LIMITS.free;

    // 格式检查
    if (!limits.allowedFormats.includes(req.format)) {
      return { valid: false, error: `${plan}套餐不支持${req.format}格式`, code: 'FORMAT_NOT_ALLOWED' };
    }

    // 行数检查
    if (req.rows > limits.maxRows) {
      return { valid: false, error: `最多导出${limits.maxRows}行`, code: 'MAX_ROWS_EXCEEDED' };
    }

    // 日导出次数检查
    const today = this.getDailyExports(req.userId);
    if (today >= limits.maxExportsPerDay) {
      return { valid: false, error: '今日导出次数已用完', code: 'DAILY_LIMIT_EXCEEDED' };
    }

    // 日期范围检查
    const days = this.dateRangeDays(req.dateRange);
    if (days > limits.maxDateRangeDays) {
      return { valid: false, error: `最多查询${limits.maxDateRangeDays}天`, code: 'DATE_RANGE_EXCEEDED' };
    }

    // 列数检查（防止导出过多列）
    if (req.columns && req.columns.length > 50) {
      return { valid: false, error: '最多选择50个字段', code: 'TOO_MANY_COLUMNS' };
    }

    return { valid: true };
  }

  export(req: ExportRequest): ExportResult {
    const validation = this.validate(req);
    if (!validation.valid) {
      return {
        success: false,
        filename: '',
        size: 0,
        rowCount: 0,
        error: validation.error,
        code: validation.code,
      };
    }

    const plan = this.planResolver(req.userId);
    const limits = EXPORT_LIMITS[plan as keyof typeof EXPORT_LIMITS];
    const filename = this.generateFilename(req);

    // 记录导出
    this.incrementDailyExports(req.userId);

    return {
      success: true,
      filename,
      size: req.rows * 100, // 估算大小
      rowCount: req.rows,
      watermark: limits.watermark || undefined,
    };
  }

  private getDailyExports(userId: string): number {
    const key = `${userId}:${new Date().toISOString().slice(0, 10)}`;
    return this.dailyExports.get(key) || 0;
  }

  private incrementDailyExports(userId: string) {
    const key = `${userId}:${new Date().toISOString().slice(0, 10)}`;
    this.dailyExports.set(key, this.getDailyExports(userId) + 1);
  }

  private dateRangeDays(range: { from: string; to: string }): number {
    const from = new Date(range.from);
    const to = new Date(range.to);
    return Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
  }

  private generateFilename(req: ExportRequest): string {
    const date = new Date().toISOString().slice(0, 10);
    return `${req.dataType}_${date}.${req.format}`;
  }
}

describe('导出限制系统', () => {
  let engine: ExportEngine;

  beforeEach(() => {
    engine = new ExportEngine();
  });

  describe('格式限制', () => {
    it('免费用户只能导出CSV', () => {
      const csvReq: ExportRequest = {
        userId: 'free_001', format: 'csv', dataType: 'stocks',
        rows: 50, dateRange: { from: '2024-01-01', to: '2024-01-31' },
      };
      expect(engine.validate(csvReq).valid).toBe(true);

      const pdfReq = { ...csvReq, format: 'pdf' as ExportFormat };
      expect(engine.validate(pdfReq).valid).toBe(false);
      expect(engine.validate(pdfReq).code).toBe('FORMAT_NOT_ALLOWED');
    });

    it('专业用户支持所有格式', () => {
      for (const format of ['csv', 'json', 'xlsx', 'pdf'] as ExportFormat[]) {
        const req: ExportRequest = {
          userId: 'pro_001', format, dataType: 'stocks',
          rows: 100, dateRange: { from: '2024-01-01', to: '2024-01-31' },
        };
        expect(engine.validate(req).valid).toBe(true);
      }
    });
  });

  describe('行数限制', () => {
    it('免费用户最多100行', () => {
      const req: ExportRequest = {
        userId: 'free_001', format: 'csv', dataType: 'stocks',
        rows: 101, dateRange: { from: '2024-01-01', to: '2024-01-31' },
      };
      const result = engine.validate(req);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('MAX_ROWS_EXCEEDED');
    });

    it('专业用户最多10000行', () => {
      const req: ExportRequest = {
        userId: 'pro_001', format: 'csv', dataType: 'stocks',
        rows: 10001, dateRange: { from: '2024-01-01', to: '2024-01-31' },
      };
      expect(engine.validate(req).valid).toBe(false);
    });

    it('企业用户最多100000行', () => {
      const req: ExportRequest = {
        userId: 'ent_001', format: 'csv', dataType: 'stocks',
        rows: 99999, dateRange: { from: '2024-01-01', to: '2024-01-31' },
      };
      expect(engine.validate(req).valid).toBe(true);
    });
  });

  describe('日导出次数限制', () => {
    it('免费用户每天3次', () => {
      const req: ExportRequest = {
        userId: 'free_001', format: 'csv', dataType: 'stocks',
        rows: 10, dateRange: { from: '2024-01-01', to: '2024-01-31' },
      };
      for (let i = 0; i < 3; i++) {
        const result = engine.export(req);
        expect(result.success).toBe(true);
      }
      const result = engine.export(req);
      expect(result.success).toBe(false);
      expect(result.code).toBe('DAILY_LIMIT_EXCEEDED');
    });

    it('专业用户每天50次', () => {
      const req: ExportRequest = {
        userId: 'pro_001', format: 'csv', dataType: 'stocks',
        rows: 10, dateRange: { from: '2024-01-01', to: '2024-01-31' },
      };
      for (let i = 0; i < 50; i++) {
        expect(engine.export(req).success).toBe(true);
      }
      expect(engine.export(req).success).toBe(false);
    });

    it('不同用户计数独立', () => {
      const req1: ExportRequest = {
        userId: 'free_001', format: 'csv', dataType: 'stocks',
        rows: 10, dateRange: { from: '2024-01-01', to: '2024-01-31' },
      };
      const req2 = { ...req1, userId: 'free_002' };
      for (let i = 0; i < 3; i++) {
        engine.export(req1);
      }
      expect(engine.export(req1).success).toBe(false);
      expect(engine.export(req2).success).toBe(true);
    });
  });

  describe('日期范围限制', () => {
    it('免费用户最多30天', () => {
      const req: ExportRequest = {
        userId: 'free_001', format: 'csv', dataType: 'stocks',
        rows: 10, dateRange: { from: '2024-01-01', to: '2024-02-01' },
      };
      const result = engine.validate(req);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('DATE_RANGE_EXCEEDED');
    });

    it('专业用户最多365天', () => {
      const req: ExportRequest = {
        userId: 'pro_001', format: 'csv', dataType: 'stocks',
        rows: 10, dateRange: { from: '2024-01-01', to: '2024-12-31' },
      };
      expect(engine.validate(req).valid).toBe(true);
    });
  });

  describe('导出结果', () => {
    it('成功导出应返回正确文件名', () => {
      const req: ExportRequest = {
        userId: 'free_001', format: 'csv', dataType: 'stocks',
        rows: 10, dateRange: { from: '2024-01-01', to: '2024-01-31' },
      };
      const result = engine.export(req);
      expect(result.filename).toContain('stocks');
      expect(result.filename).toContain('.csv');
    });

    it('免费用户导出应带水印', () => {
      const req: ExportRequest = {
        userId: 'free_001', format: 'csv', dataType: 'stocks',
        rows: 10, dateRange: { from: '2024-01-01', to: '2024-01-31' },
      };
      const result = engine.export(req);
      expect(result.watermark).toBe('A股分析-免费版');
    });

    it('专业用户导出不应有水印', () => {
      const req: ExportRequest = {
        userId: 'pro_001', format: 'csv', dataType: 'stocks',
        rows: 10, dateRange: { from: '2024-01-01', to: '2024-01-31' },
      };
      const result = engine.export(req);
      expect(result.watermark).toBeUndefined();
    });

    it('失败导出应返回错误码', () => {
      const req: ExportRequest = {
        userId: 'free_001', format: 'pdf', dataType: 'stocks',
        rows: 10, dateRange: { from: '2024-01-01', to: '2024-01-31' },
      };
      const result = engine.export(req);
      expect(result.success).toBe(false);
      expect(result.code).toBeDefined();
      expect(result.error).toBeDefined();
    });
  });

  describe('列数限制', () => {
    it('最多50列', () => {
      const req: ExportRequest = {
        userId: 'pro_001', format: 'csv', dataType: 'stocks',
        rows: 10, dateRange: { from: '2024-01-01', to: '2024-01-31' },
        columns: Array.from({ length: 51 }, (_, i) => `col${i}`),
      };
      const result = engine.validate(req);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('TOO_MANY_COLUMNS');
    });

    it('50列应通过', () => {
      const req: ExportRequest = {
        userId: 'pro_001', format: 'csv', dataType: 'stocks',
        rows: 10, dateRange: { from: '2024-01-01', to: '2024-01-31' },
        columns: Array.from({ length: 50 }, (_, i) => `col${i}`),
      };
      expect(engine.validate(req).valid).toBe(true);
    });
  });
});
