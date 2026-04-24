import { describe, it, expect } from 'vitest';
import {
  exportDataToCsv,
  exportDataToJson,
  generateFilename,
} from '../utils/chartExport';
import type { ChartExportData, ExportFormat } from '../utils/chartExport';

describe('图表导出工具', () => {
  const mockData: ChartExportData = {
    title: 'A股行情分析',
    labels: ['1月', '2月', '3月', '4月'],
    datasets: [
      { name: '上证指数', values: [3200, 3300, 3150, 3400], color: '#1890ff' },
      { name: '深证成指', values: [11000, 11500, 10800, 12000], color: '#52c41a' },
    ],
    metadata: { source: 'AI分析', period: '2024' },
  };

  describe('exportDataToCsv', () => {
    it('应生成有效的CSV', () => {
      const csv = exportDataToCsv(mockData);
      expect(csv).toBeTruthy();
      const lines = csv.split('\n').filter(l => l.trim());
      expect(lines.length).toBeGreaterThan(4);
    });

    it('应包含标题', () => {
      const csv = exportDataToCsv(mockData);
      expect(csv).toContain('A股行情分析');
    });

    it('应包含表头', () => {
      const csv = exportDataToCsv(mockData);
      expect(csv).toContain('标签');
      expect(csv).toContain('上证指数');
      expect(csv).toContain('深证成指');
    });

    it('应包含数据行', () => {
      const csv = exportDataToCsv(mockData);
      expect(csv).toContain('1月');
      expect(csv).toContain('3200');
      expect(csv).toContain('11000');
    });

    it('应包含元数据', () => {
      const csv = exportDataToCsv(mockData);
      expect(csv).toContain('AI分析');
      expect(csv).toContain('2024');
    });

    it('应正确处理引号', () => {
      const data: ChartExportData = {
        title: 'Test',
        labels: ['A"B'],
        datasets: [{ name: 'Test', values: [1] }],
      };
      const csv = exportDataToCsv(data);
      // 引号应被转义为双引号
      expect(csv).toContain('"A""B"');
    });

    it('应处理空数据集', () => {
      const data: ChartExportData = {
        title: 'Empty',
        labels: [],
        datasets: [],
      };
      const csv = exportDataToCsv(data);
      expect(csv).toContain('Empty');
    });

    it('无标题时不应包含标题行', () => {
      const data: ChartExportData = {
        title: '',
        labels: ['A'],
        datasets: [{ name: 'X', values: [1] }],
      };
      const csv = exportDataToCsv(data);
      expect(csv).not.toContain('# ');
    });
  });

  describe('exportDataToJson', () => {
    it('应生成有效的JSON', () => {
      const json = exportDataToJson(mockData);
      expect(() => JSON.parse(json)).not.toThrow();
    });

    it('应包含标题', () => {
      const json = exportDataToJson(mockData);
      const parsed = JSON.parse(json);
      expect(parsed.title).toBe('A股行情分析');
    });

    it('应包含导出时间戳', () => {
      const json = exportDataToJson(mockData);
      const parsed = JSON.parse(json);
      expect(parsed.exportedAt).toBeTruthy();
    });

    it('应包含数据集', () => {
      const json = exportDataToJson(mockData);
      const parsed = JSON.parse(json);
      expect(parsed.datasets.length).toBe(2);
      expect(parsed.datasets[0].name).toBe('上证指数');
      expect(parsed.datasets[0].data).toEqual([3200, 3300, 3150, 3400]);
    });

    it('应包含标签', () => {
      const json = exportDataToJson(mockData);
      const parsed = JSON.parse(json);
      expect(parsed.labels).toEqual(['1月', '2月', '3月', '4月']);
    });

    it('应包含元数据', () => {
      const json = exportDataToJson(mockData);
      const parsed = JSON.parse(json);
      expect(parsed.metadata.source).toBe('AI分析');
    });

    it('应保留颜色信息', () => {
      const json = exportDataToJson(mockData);
      const parsed = JSON.parse(json);
      expect(parsed.datasets[0].color).toBe('#1890ff');
    });
  });

  describe('generateFilename', () => {
    it('应包含基本名称', () => {
      const filename = generateFilename('chart', 'png');
      expect(filename).toContain('chart');
    });

    it('应包含扩展名', () => {
      const filename = generateFilename('test', 'csv');
      expect(filename).toMatch(/\.csv$/);
    });

    it('应包含时间戳', () => {
      const filename = generateFilename('test', 'json');
      // 时间戳格式: YYYY-MM-DDTHH-MM-SS
      expect(filename).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}/);
    });

    it.each(['png', 'svg', 'csv', 'json'] as ExportFormat[])('应支持 %s 格式', (format) => {
      const filename = generateFilename('test', format);
      expect(filename).toMatch(new RegExp(`\\.${format}$`));
    });
  });

  describe('CSV格式验证', () => {
    it('数据行应有正确的列数', () => {
      const csv = exportDataToCsv(mockData);
      const lines = csv.split('\n');
      // 找到表头行（包含"标签"的行）
      const headerIdx = lines.findIndex(l => l.includes('标签'));
      expect(headerIdx).toBeGreaterThanOrEqual(0);
      const headerCols = lines[headerIdx].split(',').length;
      // 数据行（表头之后，空行或#之前）
      for (let i = headerIdx + 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line || line.startsWith('#')) break;
        expect(line.split(',').length).toBe(headerCols);
      }
    });
  });

  describe('JSON结构验证', () => {
    it('数据集应有name和data字段', () => {
      const json = exportDataToJson(mockData);
      const parsed = JSON.parse(json);
      parsed.datasets.forEach((ds: any) => {
        expect(ds.name).toBeTruthy();
        expect(Array.isArray(ds.data)).toBe(true);
      });
    });

    it('数据点数量应与标签数量一致', () => {
      const json = exportDataToJson(mockData);
      const parsed = JSON.parse(json);
      parsed.datasets.forEach((ds: any) => {
        expect(ds.data.length).toBe(parsed.labels.length);
      });
    });
  });
});
