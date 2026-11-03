/**
 * 影子测试迁移（批次 31b）
 *
 * 迁移前：本文件只 import vitest，formatNumber / formatDate / escapeCSV 三组实现全部自抄；迁移后：能对上生产导出的
 * 符号一律 import 真源，生产契约不同的 helper 保留本地并逐条注明「未迁移：生产对应导出契约不同」。
 * 用例数：29 → 32（原有 describe/it 保留并逐条按生产口径订正，另新增 3 条生产边界用例，只增不减）。
 *
 * 已绑定生产实现：
 * - formatNumber → frontend/src/utils/exportEngine.ts:73（null/undefined→'-' :74；Number 后 NaN→String(value) :75-76；
 *   其余 num.toLocaleString('zh-CN', { minimumFractionDigits, maximumFractionDigits }) :77-80；无 separator 参数）
 * - formatDate → frontend/src/utils/exportEngine.ts:112（falsy→'-' :113；Date 原样、其余 new Date(String(value)) :114；
 *   无效值原样返回 String(value) :115；YYYY/MM/DD/HH/mm/ss 替换链 :117-130）
 * - escapeCSVValue → frontend/src/utils/exportEngine.ts:136（含 delimiter/双引号/\n/\r 时双引号包裹并把内部引号翻倍 :137-139）
 * 跨包 import 先例：backend/src/__tests__/dataPipelineEngine.test.ts:55。
 *
 * 旧断言错在哪（旧值 → 生产值 + 依据行号）：
 * - 千分位分隔符：旧 formatNumber(1000000, 2, '.') 得 '1.000.000.00' → 生产 formatNumber 只有两参（exportEngine.ts:73），
 *   千分位由 toLocaleString('zh-CN') 固定为逗号（:77-80），得 '1,000,000.00'。
 * - NaN：旧 '0' → 生产 'NaN'（Number(NaN) 为 NaN 后 String(value)，exportEngine.ts:75-76）。
 * - Infinity：旧 '0' → 生产 '∞'（toLocaleString('zh-CN') 输出，exportEngine.ts:77-80；Node 25.8.0 实测）。
 * - formatDate 的 number 时间戳：旧实现 new Date(timestamp) 可格式化 → 生产 :114 对非 Date 输入执行 new Date(String(value))，
 *   数字字符串是无效日期，:115 原样返回 String(value)（如 '1710469800000'）；因此改传 Date 对象 / 带时间的字符串。
 * - formatDate('')：旧 'NaN-NaN-NaN' → 生产 '-'（exportEngine.ts:113 falsy 守卫）。
 * - escapeCSV 回车：旧实现不处理 '\r' → 生产 escapeCSVValue 会引号包裹（exportEngine.ts:137），补用例钉住。
 *
 * 未迁移（生产对应导出契约不同，保留本地 helper，断言值与旧文件保持一致）：
 * - arrayToCSV：生产 exportToCSV 返回 ExportResult（含 filename/mimeType/size/rowCount/columnCount，exportEngine.ts:148-190），
 *   默认 includeTimestamp 追加「# 导出时间」「# 数据行数」（:174-178），列配置是 columns[{ key,label,format }] 而非 fields+headers，
 *   与本文件「返回纯 CSV 文本 + fields/headers」契约不同。本地保留拼装，值格式化委托已绑定的生产 formatNumber/formatDate/escapeCSVValue；
 * 注意生产 formatNumber 无 separator 参数（:73），config.numberFormat.thousandSeparator 已不生效。
 * - arrayToJSON：生产 exportToJSON 返回 ExportResult 且内容包装为 { data, exportTime, rowCount }（exportEngine.ts:195-230），
 *   列 key 同时作源字段与输出键（:206-208），无法用 headers 做中文重命名，契约不同。
 * - generateReportSummary：生产 aggregateData 返回扁平的 { 'price_sum': … } 且键名带聚合后缀（exportEngine.ts:381-412，:392-406
 *   四舍五入两位，count 统计 v !== 0 :400），与本文件 { sum, avg, min, max, count } 结构不同；全仓无同形报告摘要导出。
 *
 * 新增用例（29 → 32）：
 * - formatNumber › null 与 undefined 返回占位符（exportEngine.ts:74）
 * - formatDate › 空值返回占位符（exportEngine.ts:113）
 * - escapeCSV › 含回车应该被引号包裹（exportEngine.ts:137）
 */

import { describe, it, expect } from 'vitest';
import {
  formatNumber,
  formatDate,
  escapeCSVValue,
} from '../../../frontend/src/utils/exportEngine';

// 本地导出配置类型（生产用 ExportOptions/ExportColumn，见 exportEngine.ts:10-27，契约不同故未迁移）。
interface ExportConfig {
  format: 'csv' | 'json' | 'xlsx';
  fields: string[];
  headers: Record<string, string>;
  dateFormat: string;
  numberFormat: { decimal: number; thousandSeparator: string };
  filters?: Record<string, any>;
}

// 未迁移：生产对应导出契约不同（exportToCSV 返回 ExportResult 并追加时间戳，exportEngine.ts:148-190）。
// 本地保留 CSV 文本拼装，值格式化委托已绑定的生产 formatNumber / formatDate / escapeCSVValue。
function arrayToCSV(data: Record<string, any>[], config: ExportConfig): string {
  const lines: string[] = [];

  // Header row
  if (config.fields.length > 0) {
    const headers = config.fields.map(f => escapeCSVValue(config.headers[f] || f));
    lines.push(headers.join(','));
  }

  // Data rows
  for (const row of data) {
    const values = config.fields.map(f => {
      const val = row[f];
      if (val === null || val === undefined) return '';
      // 生产 formatNumber 无 separator 参数（exportEngine.ts:73），千分位固定为 zh-CN 逗号。
      if (typeof val === 'number') return formatNumber(val, config.numberFormat.decimal);
      if (typeof val === 'string' && /\d{4}-\d{2}-\d{2}/.test(val)) return formatDate(val, config.dateFormat);
      return escapeCSVValue(String(val));
    });
    lines.push(values.join(','));
  }

  return lines.join('\n');
}

// 未迁移：生产 exportToJSON 返回 ExportResult 并包装 { data, exportTime, rowCount }（exportEngine.ts:195-230），契约不同。
function arrayToJSON(data: Record<string, any>[], config: ExportConfig): string {
  const filtered = data.map(row => {
    const obj: Record<string, any> = {};
    for (const f of config.fields) {
      obj[config.headers[f] || f] = row[f];
    }
    return obj;
  });
  return JSON.stringify(filtered, null, 2);
}

// 未迁移：生产 aggregateData 返回 { 'price_sum': … } 扁平结构（exportEngine.ts:381-412），无 { sum, avg, min, max, count } 导出。
function generateReportSummary(data: Record<string, any>[], numericFields: string[]): Record<string, { sum: number; avg: number; min: number; max: number; count: number }> {
  const summary: Record<string, { sum: number; avg: number; min: number; max: number; count: number }> = {};

  for (const field of numericFields) {
    const values = data.map(r => r[field]).filter(v => typeof v === 'number' && !isNaN(v));
    if (values.length === 0) {
      summary[field] = { sum: 0, avg: 0, min: 0, max: 0, count: 0 };
      continue;
    }
    summary[field] = {
      sum: values.reduce((a, b) => a + b, 0),
      avg: values.reduce((a, b) => a + b, 0) / values.length,
      min: Math.min(...values),
      max: Math.max(...values),
      count: values.length,
    };
  }

  return summary;
}

describe('数据导出/报告生成', () => {
  describe('formatNumber', () => {
    it('应该正确格式化整数', () => {
      expect(formatNumber(1000000, 2)).toBe('1,000,000.00');
    });

    it('应该正确格式化小数', () => {
      expect(formatNumber(1234.5, 2)).toBe('1,234.50');
    });

    it('应该支持不同的小数位数', () => {
      expect(formatNumber(1234.5678, 0)).toBe('1,235');
      expect(formatNumber(1234.5678, 4)).toBe('1,234.5678');
    });

    it('千分位固定为 zh-CN 逗号（生产无 separator 参数）', () => {
      expect(formatNumber(1000000, 2)).toBe('1,000,000.00');
    });

    it('NaN 原样返回字符串', () => {
      expect(formatNumber(NaN)).toBe('NaN');
    });

    it('Infinity 按 zh-CN 数字格式输出', () => {
      expect(formatNumber(Infinity)).toBe('∞');
    });

    it('负数应该正确格式化', () => {
      expect(formatNumber(-1234.56, 2)).toBe('-1,234.56');
    });

    it('零应该正确处理', () => {
      expect(formatNumber(0, 2)).toBe('0.00');
    });

    it('小数应该正确处理', () => {
      expect(formatNumber(0.123, 3)).toBe('0.123');
    });

    it('null 与 undefined 返回占位符', () => {
      expect(formatNumber(null)).toBe('-');
      expect(formatNumber(undefined)).toBe('-');
    });
  });

  describe('formatDate', () => {
    it('应该格式化为默认格式', () => {
      const result = formatDate(new Date('2024-03-15T10:30:00'));
      expect(result).toBe('2024-03-15');
    });

    it('应该支持自定义格式', () => {
      const result = formatDate(new Date('2024-03-15T10:30:45'), 'YYYY/MM/DD HH:mm:ss');
      expect(result).toBe('2024/03/15 10:30:45');
    });

    it('应该支持字符串输入', () => {
      // 使用带时间的本地时间字符串，避免 date-only 按 UTC 解析造成跨时区日期偏移。
      const result = formatDate('2024-06-01T12:00:00', 'MM-DD');
      expect(result).toBe('06-01');
    });

    it('应该支持全格式', () => {
      const result = formatDate(new Date('2024-01-05T08:09:07'), 'YYYY-MM-DD HH:mm:ss');
      expect(result).toBe('2024-01-05 08:09:07');
    });

    it('空值返回占位符', () => {
      expect(formatDate('')).toBe('-');
      expect(formatDate(null)).toBe('-');
    });
  });

  describe('escapeCSV', () => {
    it('普通字符串不需要转义', () => {
      expect(escapeCSVValue('hello')).toBe('hello');
    });

    it('含逗号应该被引号包裹', () => {
      expect(escapeCSVValue('hello,world')).toBe('"hello,world"');
    });

    it('含引号应该被双引号转义', () => {
      expect(escapeCSVValue('say "hi"')).toBe('"say ""hi"""');
    });

    it('含换行应该被引号包裹', () => {
      expect(escapeCSVValue('line1\nline2')).toBe('"line1\nline2"');
    });

    it('空字符串不应该被包裹', () => {
      expect(escapeCSVValue('')).toBe('');
    });

    it('含回车应该被引号包裹', () => {
      expect(escapeCSVValue('line1\rline2')).toBe('"line1\rline2"');
    });
  });

  describe('arrayToCSV', () => {
    const config: ExportConfig = {
      format: 'csv',
      fields: ['code', 'name', 'price', 'change'],
      headers: { code: '代码', name: '名称', price: '价格', change: '涨跌幅' },
      dateFormat: 'YYYY-MM-DD',
      numberFormat: { decimal: 2, thousandSeparator: ',' },
    };

    it('应该生成正确的CSV格式', () => {
      const data = [
        { code: '600000', name: '浦发银行', price: 10.5, change: 2.3 },
        { code: '000001', name: '平安银行', price: 15.2, change: -1.1 },
      ];
      const csv = arrayToCSV(data, config);
      const lines = csv.split('\n');
      expect(lines).toHaveLength(3); // 1 header + 2 data
      expect(lines[0]).toBe('代码,名称,价格,涨跌幅');
    });

    it('应该格式化数字', () => {
      const data = [{ code: '600000', name: 'test', price: 10000.5, change: 2.3 }];
      const csv = arrayToCSV(data, config);
      expect(csv).toContain('10,000.50');
    });

    it('空数据应该只返回header', () => {
      const csv = arrayToCSV([], config);
      expect(csv).toBe('代码,名称,价格,涨跌幅');
    });

    it('应该正确处理逗号分隔的值', () => {
      const data = [{ code: '600000', name: '浦发,银行', price: 10.5, change: 2.3 }];
      const csv = arrayToCSV(data, config);
      expect(csv).toContain('"浦发,银行"');
    });
  });

  describe('arrayToJSON', () => {
    it('应该生成有效的JSON', () => {
      const config: ExportConfig = {
        format: 'json',
        fields: ['code', 'name'],
        headers: { code: '代码', name: '名称' },
        dateFormat: 'YYYY-MM-DD',
        numberFormat: { decimal: 2, thousandSeparator: ',' },
      };
      const data = [{ code: '600000', name: '浦发银行', price: 10.5 }];
      const json = arrayToJSON(data, config);
      const parsed = JSON.parse(json);
      expect(parsed).toHaveLength(1);
      expect(parsed[0]).toHaveProperty('代码');
      expect(parsed[0]).toHaveProperty('名称');
      expect(parsed[0]).not.toHaveProperty('price');
    });

    it('应该使用中文header名', () => {
      const config: ExportConfig = {
        format: 'json',
        fields: ['code'],
        headers: { code: '股票代码' },
        dateFormat: 'YYYY-MM-DD',
        numberFormat: { decimal: 2, thousandSeparator: ',' },
      };
      const data = [{ code: '600000' }];
      const json = arrayToJSON(data, config);
      const parsed = JSON.parse(json);
      expect(parsed[0]['股票代码']).toBe('600000');
    });
  });

  describe('generateReportSummary', () => {
    it('应该计算正确的统计摘要', () => {
      const data = [
        { price: 10, volume: 1000 },
        { price: 20, volume: 2000 },
        { price: 30, volume: 3000 },
      ];
      const summary = generateReportSummary(data, ['price', 'volume']);
      expect(summary.price.sum).toBe(60);
      expect(summary.price.avg).toBe(20);
      expect(summary.price.min).toBe(10);
      expect(summary.price.max).toBe(30);
      expect(summary.price.count).toBe(3);
    });

    it('应该跳过非数字字段', () => {
      const data = [{ name: 'test', value: 10 }];
      const summary = generateReportSummary(data, ['value']);
      expect(summary.value.count).toBe(1);
    });

    it('空数据应该返回零值', () => {
      const summary = generateReportSummary([], ['price']);
      expect(summary.price.sum).toBe(0);
      expect(summary.price.count).toBe(0);
    });

    it('应该正确处理NaN值', () => {
      const data = [{ price: 10 }, { price: NaN }, { price: 30 }];
      const summary = generateReportSummary(data, ['price']);
      expect(summary.price.count).toBe(2);
      expect(summary.price.sum).toBe(40);
    });

    it('应该支持多个字段', () => {
      const data = [
        { a: 1, b: 10, c: 100 },
        { a: 2, b: 20, c: 200 },
      ];
      const summary = generateReportSummary(data, ['a', 'b', 'c']);
      expect(summary.a.avg).toBe(1.5);
      expect(summary.b.avg).toBe(15);
      expect(summary.c.avg).toBe(150);
    });
  });
});
