import { describe, it, expect } from 'vitest';

describe('报表引擎与数据导出', () => {

  // CSV 生成
  const generateCSV = (headers: string[], rows: (string | number)[][], options?: { delimiter?: string; quote?: boolean }) => {
    const delimiter = options?.delimiter || ',';
    const quote = options?.quote !== false;
    const escape = (val: string | number) => {
      const str = String(val);
      if (quote && (str.includes(delimiter) || str.includes('"') || str.includes('\n'))) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };
    return [
      headers.map(escape).join(delimiter),
      ...rows.map(row => row.map(escape).join(delimiter)),
    ].join('\n');
  };

  describe('CSV生成', () => {
    it('基本CSV', () => {
      const csv = generateCSV(['A', 'B'], [[1, 2], [3, 4]]);
      expect(csv).toContain('A,B');
      expect(csv).toContain('1,2');
    });
    it('逗号转义', () => {
      const csv = generateCSV(['Name'], [['hello, world']]);
      expect(csv).toContain('"hello, world"');
    });
    it('引号转义', () => {
      const csv = generateCSV(['Name'], [['say "hi"']]);
      expect(csv).toContain('"say ""hi"""');
    });
    it('自定义分隔符', () => {
      const csv = generateCSV(['A', 'B'], [[1, 2]], { delimiter: '\t' });
      expect(csv).toContain('\t');
    });
    it('无引号模式', () => {
      const csv = generateCSV(['A'], [['hello, world']], { quote: false });
      expect(csv).not.toContain('"');
    });
    it('空行', () => {
      const csv = generateCSV(['A'], []);
      expect(csv).toBe('A');
    });
  });

  // JSON 报表
  const generateReport = (data: Record<string, unknown>[], groupBy: string, metrics: string[]) => {
    const groups = new Map<string, Record<string, unknown>[]>();
    for (const row of data) {
      const key = String(row[groupBy] || 'unknown');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(row);
    }
    return Array.from(groups.entries()).map(([key, rows]) => {
      const result: Record<string, unknown> = { [groupBy]: key, count: rows.length };
      for (const metric of metrics) {
        const values = rows.map(r => Number(r[metric]) || 0);
        result[`${metric}_sum`] = values.reduce((a, b) => a + b, 0);
        result[`${metric}_avg`] = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
        result[`${metric}_max`] = Math.max(...values);
        result[`${metric}_min`] = Math.min(...values);
      }
      return result;
    });
  };

  describe('JSON报表', () => {
    const data = [
      { sector: '科技', amount: 100, volume: 1000 },
      { sector: '科技', amount: 200, volume: 2000 },
      { sector: '金融', amount: 300, volume: 3000 },
    ];

    it('按行业分组', () => {
      const report = generateReport(data, 'sector', ['amount']);
      expect(report.length).toBe(2);
    });
    it('聚合指标', () => {
      const report = generateReport(data, 'sector', ['amount']);
      const tech = report.find(r => r.sector === '科技') as Record<string, unknown>;
      expect(tech.amount_sum).toBe(300);
      expect(tech.amount_avg).toBe(150);
    });
    it('多指标', () => {
      const report = generateReport(data, 'sector', ['amount', 'volume']);
      const tech = report.find(r => r.sector === '科技') as Record<string, unknown>;
      expect(tech).toHaveProperty('volume_sum');
      expect(tech).toHaveProperty('volume_avg');
    });
    it('最大最小值', () => {
      const report = generateReport(data, 'sector', ['amount']);
      const tech = report.find(r => r.sector === '科技') as Record<string, unknown>;
      expect(tech.amount_max).toBe(200);
      expect(tech.amount_min).toBe(100);
    });
    it('计数', () => {
      const report = generateReport(data, 'sector', ['amount']);
      const tech = report.find(r => r.sector === '科技') as Record<string, unknown>;
      expect(tech.count).toBe(2);
    });
  });

  // Markdown 表格
  const toMarkdownTable = (headers: string[], rows: (string | number)[][]) => {
    const align = headers.map(() => ':---');
    return [
      '| ' + headers.join(' | ') + ' |',
      '| ' + align.join(' | ') + ' |',
      ...rows.map(row => '| ' + row.join(' | ') + ' |'),
    ].join('\n');
  };

  describe('Markdown表格', () => {
    it('基本表格', () => {
      const md = toMarkdownTable(['Name', 'Price'], [['600519', '1800']]);
      expect(md).toContain('| Name | Price |');
      expect(md).toContain('| :--- | :--- |');
      expect(md).toContain('| 600519 | 1800 |');
    });
    it('空行只有表头', () => {
      const md = toMarkdownTable(['A'], []);
      const lines = md.split('\n');
      expect(lines.length).toBe(2);
    });
    it('多行表格', () => {
      const md = toMarkdownTable(['A'], [['1'], ['2'], ['3']]);
      expect(md.split('\n').length).toBe(5); // header + separator + 3 rows
    });
  });

  // HTML 报表
  const generateHTMLTable = (headers: string[], rows: (string | number)[][], options?: { className?: string }) => {
    const cls = options?.className ? ` class="${options.className}"` : '';
    const thead = `<thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>`;
    const tbody = `<tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>`;
    return `<table${cls}>${thead}${tbody}</table>`;
  };

  describe('HTML报表', () => {
    it('基本表格', () => {
      const html = generateHTMLTable(['A', 'B'], [[1, 2]]);
      expect(html).toContain('<table>');
      expect(html).toContain('<th>A</th>');
      expect(html).toContain('<td>1</td>');
    });
    it('CSS类名', () => {
      const html = generateHTMLTable(['A'], [[1]], { className: 'report' });
      expect(html).toContain('class="report"');
    });
    it('无类名', () => {
      const html = generateHTMLTable(['A'], [[1]]);
      expect(html).not.toContain('class=');
    });
    it('空行', () => {
      const html = generateHTMLTable(['A'], []);
      expect(html).toContain('<thead>');
      expect(html).toContain('<tbody>');
    });
  });

  // 数据格式化
  const formatReportValue = (value: number, type: 'currency' | 'percent' | 'number' | 'volume') => {
    switch (type) {
      case 'currency':
        if (Math.abs(value) >= 1e8) return `${(value / 1e8).toFixed(2)}亿`;
        if (Math.abs(value) >= 1e4) return `${(value / 1e4).toFixed(2)}万`;
        return `¥${value.toFixed(2)}`;
      case 'percent':
        return `${(value * 100).toFixed(2)}%`;
      case 'volume':
        if (value >= 1e8) return `${(value / 1e8).toFixed(2)}亿股`;
        if (value >= 1e4) return `${(value / 1e4).toFixed(2)}万股`;
        return `${value}股`;
      case 'number':
      default:
        return value.toLocaleString('zh-CN');
    }
  };

  describe('报表数据格式化', () => {
    it('亿级金额', () => {
      expect(formatReportValue(150000000, 'currency')).toContain('亿');
    });
    it('万级金额', () => {
      expect(formatReportValue(50000, 'currency')).toContain('万');
    });
    it('小金额', () => {
      expect(formatReportValue(100, 'currency')).toContain('¥');
    });
    it('百分比', () => {
      expect(formatReportValue(0.05, 'percent')).toBe('5.00%');
    });
    it('成交量-亿', () => {
      expect(formatReportValue(200000000, 'volume')).toContain('亿股');
    });
    it('成交量-万', () => {
      expect(formatReportValue(50000, 'volume')).toContain('万股');
    });
    it('数字千分位', () => {
      const result = formatReportValue(1234567, 'number');
      expect(result).toContain(',');
    });
  });

  // 报表调度
  const scheduleReport = (cron: string) => {
    const parts = cron.split(' ');
    if (parts.length !== 5) return { valid: false, error: 'invalid_format' };
    const [min, hour, day, month, dow] = parts;
    const validateField = (field: string, min: number, max: number) => {
      if (field === '*') return true;
      const num = parseInt(field);
      return !isNaN(num) && num >= min && num <= max;
    };
    if (!validateField(min, 0, 59)) return { valid: false, error: 'invalid_minute' };
    if (!validateField(hour, 0, 23)) return { valid: false, error: 'invalid_hour' };
    if (!validateField(day, 1, 31)) return { valid: false, error: 'invalid_day' };
    if (!validateField(month, 1, 12)) return { valid: false, error: 'invalid_month' };
    if (!validateField(dow, 0, 7)) return { valid: false, error: 'invalid_dow' };
    return { valid: true, schedule: { minute: min, hour, day, month, dayOfWeek: dow } };
  };

  describe('报表调度', () => {
    it('每天9点', () => {
      const result = scheduleReport('0 9 * * *');
      expect(result.valid).toBe(true);
    });
    it('每小时', () => {
      const result = scheduleReport('0 * * * *');
      expect(result.valid).toBe(true);
    });
    it('格式错误', () => {
      const result = scheduleReport('* * *');
      expect(result.valid).toBe(false);
    });
    it('无效分钟', () => {
      const result = scheduleReport('60 * * * *');
      expect(result.valid).toBe(false);
    });
    it('无效小时', () => {
      const result = scheduleReport('0 25 * * *');
      expect(result.valid).toBe(false);
    });
    it('每周一9点', () => {
      const result = scheduleReport('0 9 * * 1');
      expect(result.valid).toBe(true);
    });
  });

  // 报表模板
  const renderTemplate = (template: string, data: Record<string, unknown>) => {
    return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_, path: string) => {
      const keys = path.split('.');
      let value: unknown = data;
      for (const key of keys) {
        if (value == null) return '';
        value = (value as Record<string, unknown>)[key];
      }
      return String(value ?? '');
    });
  };

  describe('报表模板', () => {
    it('简单替换', () => {
      expect(renderTemplate('Hello {{name}}', { name: 'World' })).toBe('Hello World');
    });
    it('嵌套属性', () => {
      expect(renderTemplate('{{stock.code}}', { stock: { code: '600519' } })).toBe('600519');
    });
    it('缺失属性为空', () => {
      expect(renderTemplate('Hello {{missing}}', {})).toBe('Hello ');
    });
    it('多变量', () => {
      const result = renderTemplate('{{a}} + {{b}} = {{c}}', { a: 1, b: 2, c: 3 });
      expect(result).toBe('1 + 2 = 3');
    });
    it('无变量', () => {
      expect(renderTemplate('plain text', {})).toBe('plain text');
    });
  });

  // 汇总统计
  const summaryStats = (values: number[]) => {
    if (values.length === 0) return { count: 0, sum: 0, avg: 0, min: 0, max: 0, median: 0, std: 0 };
    const sorted = [...values].sort((a, b) => a - b);
    const sum = values.reduce((a, b) => a + b, 0);
    const avg = sum / values.length;
    const median = sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[Math.floor(sorted.length / 2)];
    const std = Math.sqrt(values.reduce((a, b) => a + (b - avg) ** 2, 0) / values.length);
    return { count: values.length, sum, avg, min: sorted[0], max: sorted[sorted.length - 1], median, std };
  };

  describe('汇总统计', () => {
    it('基本统计', () => {
      const result = summaryStats([1, 2, 3, 4, 5]);
      expect(result.sum).toBe(15);
      expect(result.avg).toBe(3);
      expect(result.min).toBe(1);
      expect(result.max).toBe(5);
      expect(result.median).toBe(3);
    });
    it('偶数个中位数', () => {
      const result = summaryStats([1, 2, 3, 4]);
      expect(result.median).toBe(2.5);
    });
    it('空数组', () => {
      const result = summaryStats([]);
      expect(result.count).toBe(0);
    });
    it('标准差', () => {
      const result = summaryStats([2, 4, 4, 4, 5, 5, 7, 9]);
      expect(result.std).toBeCloseTo(2);
    });
    it('单值', () => {
      const result = summaryStats([42]);
      expect(result.std).toBe(0);
      expect(result.median).toBe(42);
    });
  });
});
