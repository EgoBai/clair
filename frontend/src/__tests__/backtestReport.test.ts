import { describe, it, expect } from 'vitest';

// ==================== 回测报告生成器 ====================

interface ReportMetrics {
  strategyName: string;
  symbol: string;
  startDate: string;
  endDate: string;
  initialCapital: number;
  finalValue: number;
  totalReturn: number;
  annualizedReturn: number;
  maxDrawdown: number;
  sharpeRatio: number;
  sortinoRatio: number;
  winRate: number;
  totalTrades: number;
  profitFactor: number;
  avgHoldingDays: number;
  volatility: number;
  benchmarkReturn: number;
}

interface ReportConfig {
  format: 'markdown' | 'html' | 'json' | 'csv';
  includeCharts: boolean;
  includeTrades: boolean;
  includeMonthly: boolean;
  language: 'zh' | 'en';
  sections: string[];
}

class BacktestReportGenerator {
  /** 生成Markdown报告 */
  generateMarkdown(metrics: ReportMetrics, monthlyReturns?: { year: number; month: number; return: number }[]): string {
    let report = '';

    report += `# 回测报告: ${metrics.strategyName}\n\n`;
    report += `**标的:** ${metrics.symbol}  \n`;
    report += `**区间:** ${metrics.startDate} ~ ${metrics.endDate}  \n`;
    report += `**初始资金:** ¥${metrics.initialCapital.toLocaleString()}  \n\n`;

    report += `## 收益指标\n\n`;
    report += `| 指标 | 数值 |\n|------|------|\n`;
    report += `| 最终资产 | ¥${metrics.finalValue.toLocaleString()} |\n`;
    report += `| 总收益率 | ${metrics.totalReturn.toFixed(2)}% |\n`;
    report += `| 年化收益率 | ${metrics.annualizedReturn.toFixed(2)}% |\n`;
    report += `| 基准收益 | ${metrics.benchmarkReturn.toFixed(2)}% |\n`;
    report += `| 超额收益 | ${(metrics.totalReturn - metrics.benchmarkReturn).toFixed(2)}% |\n\n`;

    report += `## 风险指标\n\n`;
    report += `| 指标 | 数值 |\n|------|------|\n`;
    report += `| 最大回撤 | ${metrics.maxDrawdown.toFixed(2)}% |\n`;
    report += `| 波动率 | ${metrics.volatility.toFixed(2)}% |\n`;
    report += `| 夏普比率 | ${metrics.sharpeRatio.toFixed(2)} |\n`;
    report += `| 索提诺比率 | ${metrics.sortinoRatio.toFixed(2)} |\n\n`;

    report += `## 交易统计\n\n`;
    report += `| 指标 | 数值 |\n|------|------|\n`;
    report += `| 总交易次数 | ${metrics.totalTrades} |\n`;
    report += `| 胜率 | ${metrics.winRate.toFixed(2)}% |\n`;
    report += `| 盈亏比 | ${metrics.profitFactor.toFixed(2)} |\n`;
    report += `| 平均持仓天数 | ${metrics.avgHoldingDays.toFixed(1)} |\n\n`;

    if (monthlyReturns && monthlyReturns.length > 0) {
      report += `## 月度收益\n\n`;
      report += `| 年份 | 1月 | 2月 | 3月 | 4月 | 5月 | 6月 | 7月 | 8月 | 9月 | 10月 | 11月 | 12月 | 全年 |\n`;
      report += `|------|-----|-----|-----|-----|-----|-----|-----|-----|-----|------|------|------|------|\n`;

      const years = [...new Set(monthlyReturns.map(m => m.year))].sort();
      for (const year of years) {
        const yearData = monthlyReturns.filter(m => m.year === year);
        let row = `| ${year} |`;
        let yearTotal = 0;
        for (let m = 1; m <= 12; m++) {
          const monthData = yearData.find(d => d.month === m);
          const val = monthData?.return || 0;
          yearTotal += val;
          row += ` ${val.toFixed(1)}% |`;
        }
        row += ` ${yearTotal.toFixed(1)}% |\n`;
        report += row;
      }
      report += '\n';
    }

    report += `---\n*报告生成时间: ${new Date().toISOString()}*\n`;
    return report;
  }

  /** 生成HTML报告 */
  generateHTML(metrics: ReportMetrics, theme: 'light' | 'dark' = 'light'): string {
    const bg = theme === 'dark' ? '#1a1a2e' : '#ffffff';
    const text = theme === 'dark' ? '#e0e0e0' : '#333';
    const cardBg = theme === 'dark' ? '#16213e' : '#f8f9fa';
    const accent = metrics.totalReturn >= 0 ? '#00c853' : '#ff1744';

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>回测报告 - ${metrics.strategyName}</title>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:${bg};color:${text};max-width:1200px;margin:0 auto;padding:20px}
  .header{text-align:center;margin-bottom:30px}
  .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:16px;margin-bottom:30px}
  .card{background:${cardBg};border-radius:12px;padding:20px;text-align:center}
  .card .value{font-size:2em;font-weight:700;color:${accent}}
  .card .label{font-size:0.9em;opacity:0.7;margin-top:4px}
  table{width:100%;border-collapse:collapse;margin:20px0}
  th,td{padding:10px;text-align:right;border-bottom:1px solid ${theme === 'dark' ? '#333' : '#eee'}}
  th{text-align:left;font-weight:600}
  .section{margin-bottom:30px}
  .section h2{border-bottom:2px solid ${accent};padding-bottom:8px}
</style>
</head>
<body>
<div class="header">
  <h1>📊 ${metrics.strategyName}</h1>
  <p>${metrics.symbol} | ${metrics.startDate} ~ ${metrics.endDate}</p>
</div>
<div class="cards">
  <div class="card"><div class="value">${metrics.totalReturn.toFixed(2)}%</div><div class="label">总收益率</div></div>
  <div class="card"><div class="value">${metrics.sharpeRatio.toFixed(2)}</div><div class="label">夏普比率</div></div>
  <div class="card"><div class="value">${metrics.maxDrawdown.toFixed(2)}%</div><div class="label">最大回撤</div></div>
  <div class="card"><div class="value">${metrics.winRate.toFixed(1)}%</div><div class="label">胜率</div></div>
</div>
<div class="section"><h2>收益指标</h2>
<table><tr><th>初始资金</th><td>¥${metrics.initialCapital.toLocaleString()}</td></tr>
<tr><th>最终资产</th><td>¥${metrics.finalValue.toLocaleString()}</td></tr>
<tr><th>年化收益率</th><td>${metrics.annualizedReturn.toFixed(2)}%</td></tr>
<tr><th>基准收益</th><td>${metrics.benchmarkReturn.toFixed(2)}%</td></tr></table></div>
<div class="section"><h2>风险指标</h2>
<table><tr><th>波动率</th><td>${metrics.volatility.toFixed(2)}%</td></tr>
<tr><th>索提诺比率</th><td>${metrics.sortinoRatio.toFixed(2)}</td></tr>
<tr><th>盈亏比</th><td>${metrics.profitFactor.toFixed(2)}</td></tr>
<tr><th>交易次数</th><td>${metrics.totalTrades}</td></tr></table></div>
<footer style="text-align:center;opacity:0.5;margin-top:40px">
<p>生成时间: ${new Date().toISOString()}</p></footer>
</body></html>`;
  }

  /** 生成CSV报告 */
  generateCSV(metrics: ReportMetrics, trades?: { date: string; type: string; price: number; quantity: number }[]): string {
    let csv = '指标,数值\n';
    csv += `策略名称,${metrics.strategyName}\n`;
    csv += `标的,${metrics.symbol}\n`;
    csv += `开始日期,${metrics.startDate}\n`;
    csv += `结束日期,${metrics.endDate}\n`;
    csv += `初始资金,${metrics.initialCapital}\n`;
    csv += `最终资产,${metrics.finalValue}\n`;
    csv += `总收益率,${metrics.totalReturn}%\n`;
    csv += `年化收益率,${metrics.annualizedReturn}%\n`;
    csv += `最大回撤,${metrics.maxDrawdown}%\n`;
    csv += `夏普比率,${metrics.sharpeRatio}\n`;
    csv += `索提诺比率,${metrics.sortinoRatio}\n`;
    csv += `胜率,${metrics.winRate}%\n`;
    csv += `交易次数,${metrics.totalTrades}\n`;
    csv += `盈亏比,${metrics.profitFactor}\n`;
    csv += `波动率,${metrics.volatility}%\n`;
    csv += `基准收益,${metrics.benchmarkReturn}%\n`;

    if (trades && trades.length > 0) {
      csv += '\n交易明细\n日期,类型,价格,数量\n';
      for (const t of trades) {
        csv += `${t.date},${t.type},${t.price},${t.quantity}\n`;
      }
    }

    return csv;
  }

  /** 生成JSON报告 */
  generateJSON(metrics: ReportMetrics, extra?: Record<string, any>): string {
    const report = {
      ...metrics,
      excessReturn: Math.round((metrics.totalReturn - metrics.benchmarkReturn) * 100) / 100,
      calmarRatio: metrics.maxDrawdown > 0 ? Math.round((metrics.annualizedReturn / metrics.maxDrawdown) * 100) / 100 : null,
      generatedAt: new Date().toISOString(),
      ...extra,
    };
    return JSON.stringify(report, null, 2);
  }

  /** 生成对比报告 */
  generateComparisonReport(
    strategies: ReportMetrics[],
    config: { format: 'markdown' | 'html' | 'json' }
  ): string {
    if (config.format === 'json') {
      return JSON.stringify({ strategies, generatedAt: new Date().toISOString() }, null, 2);
    }

    let report = config.format === 'markdown' ? '# 策略对比报告\n\n' : '<h1>策略对比报告</h1>';

    // 对比表格
    const headers = ['策略', '总收益', '年化', '最大回撤', '夏普', '胜率', '盈亏比'];
    if (config.format === 'markdown') {
      report += '| ' + headers.join(' | ') + ' |\n';
      report += '|' + headers.map(() => '------').join('|') + '|\n';
      for (const s of strategies) {
        report += `| ${s.strategyName} | ${s.totalReturn.toFixed(2)}% | ${s.annualizedReturn.toFixed(2)}% | ${s.maxDrawdown.toFixed(2)}% | ${s.sharpeRatio.toFixed(2)} | ${s.winRate.toFixed(1)}% | ${s.profitFactor.toFixed(2)} |\n`;
      }
    } else {
      report += '<table><tr>' + headers.map(h => `<th>${h}</th>`).join('') + '</tr>';
      for (const s of strategies) {
        report += `<tr><td>${s.strategyName}</td><td>${s.totalReturn.toFixed(2)}%</td><td>${s.annualizedReturn.toFixed(2)}%</td><td>${s.maxDrawdown.toFixed(2)}%</td><td>${s.sharpeRatio.toFixed(2)}</td><td>${s.winRate.toFixed(1)}%</td><td>${s.profitFactor.toFixed(2)}</td></tr>`;
      }
      report += '</table>';
    }

    // 最佳策略
    const best = strategies.reduce((a, b) => a.sharpeRatio > b.sharpeRatio ? a : b);
    report += config.format === 'markdown'
      ? `\n**最优策略 (夏普):** ${best.strategyName} (${best.sharpeRatio.toFixed(2)})\n`
      : `<p><strong>最优策略:</strong> ${best.strategyName} (${best.sharpeRatio.toFixed(2)})</p>`;

    return report;
  }
}

// ==================== 测试数据 ====================

const sampleMetrics: ReportMetrics = {
  strategyName: '双均线交叉', symbol: '000001.SZ', startDate: '2024-01-01', endDate: '2024-12-31',
  initialCapital: 100000, finalValue: 118500, totalReturn: 18.5, annualizedReturn: 18.5,
  maxDrawdown: 8.2, sharpeRatio: 1.45, sortinoRatio: 1.82, winRate: 58.3,
  totalTrades: 42, profitFactor: 1.95, avgHoldingDays: 8.5, volatility: 15.2, benchmarkReturn: 5.8,
};

const sampleMonthly = [
  { year: 2024, month: 1, return: 2.1 }, { year: 2024, month: 2, return: -1.3 },
  { year: 2024, month: 3, return: 3.5 }, { year: 2024, month: 4, return: 1.8 },
];

// ==================== 测试 ====================

describe('BacktestReportGenerator 回测报告生成器', () => {
  const gen = new BacktestReportGenerator();

  describe('Markdown报告', () => {
    it('应包含基本信息', () => {
      const md = gen.generateMarkdown(sampleMetrics);
      expect(md).toContain('双均线交叉');
      expect(md).toContain('000001.SZ');
      expect(md).toContain('2024-01-01');
      expect(md).toContain('2024-12-31');
    });

    it('应包含收益指标', () => {
      const md = gen.generateMarkdown(sampleMetrics);
      expect(md).toContain('18.50%');
      expect(md).toContain('夏普比率');
      expect(md).toContain('1.45');
    });

    it('应包含风险指标', () => {
      const md = gen.generateMarkdown(sampleMetrics);
      expect(md).toContain('最大回撤');
      expect(md).toContain('8.20%');
      expect(md).toContain('波动率');
    });

    it('应包含交易统计', () => {
      const md = gen.generateMarkdown(sampleMetrics);
      expect(md).toContain('交易次数');
      expect(md).toContain('42');
      expect(md).toContain('胜率');
    });

    it('应包含月度收益', () => {
      const md = gen.generateMarkdown(sampleMetrics, sampleMonthly);
      expect(md).toContain('月度收益');
      expect(md).toContain('1月');
    });

    it('应计算超额收益', () => {
      const md = gen.generateMarkdown(sampleMetrics);
      expect(md).toContain('12.70%'); // 18.5 - 5.8
    });
  });

  describe('HTML报告', () => {
    it('应生成合法HTML', () => {
      const html = gen.generateHTML(sampleMetrics);
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('</html>');
    });

    it('应包含策略名', () => {
      const html = gen.generateHTML(sampleMetrics);
      expect(html).toContain('双均线交叉');
    });

    it('应支持暗色主题', () => {
      const light = gen.generateHTML(sampleMetrics, 'light');
      const dark = gen.generateHTML(sampleMetrics, 'dark');
      expect(light).toContain('#ffffff');
      expect(dark).toContain('#1a1a2e');
    });

    it('应包含关键指标卡片', () => {
      const html = gen.generateHTML(sampleMetrics);
      expect(html).toContain('总收益率');
      expect(html).toContain('夏普比率');
      expect(html).toContain('最大回撤');
    });

    it('收益为负时应显示红色', () => {
      const negMetrics = { ...sampleMetrics, totalReturn: -5.3 };
      const html = gen.generateHTML(negMetrics);
      expect(html).toContain('#ff1744');
    });
  });

  describe('CSV报告', () => {
    it('应生成CSV格式', () => {
      const csv = gen.generateCSV(sampleMetrics);
      expect(csv).toContain('指标,数值');
      expect(csv).toContain('策略名称,双均线交叉');
    });

    it('应包含所有指标', () => {
      const csv = gen.generateCSV(sampleMetrics);
      expect(csv).toContain('总收益率');
      expect(csv).toContain('夏普比率');
      expect(csv).toContain('胜率');
    });

    it('应包含交易明细', () => {
      const trades = [{ date: '2024-01-05', type: 'buy', price: 10, quantity: 100 }];
      const csv = gen.generateCSV(sampleMetrics, trades);
      expect(csv).toContain('交易明细');
      expect(csv).toContain('2024-01-05,buy,10,100');
    });
  });

  describe('JSON报告', () => {
    it('应生成合法JSON', () => {
      const json = gen.generateJSON(sampleMetrics);
      const parsed = JSON.parse(json);
      expect(parsed.strategyName).toBe('双均线交叉');
    });

    it('应包含额外字段', () => {
      const json = gen.generateJSON(sampleMetrics, { customField: 'test' });
      const parsed = JSON.parse(json);
      expect(parsed.customField).toBe('test');
    });

    it('应计算派生指标', () => {
      const json = gen.generateJSON(sampleMetrics);
      const parsed = JSON.parse(json);
      expect(parsed.excessReturn).toBe(12.7);
      expect(parsed.calmarRatio).toBeCloseTo(2.26, 1);
    });
  });

  describe('对比报告', () => {
    const strategies = [
      sampleMetrics,
      { ...sampleMetrics, strategyName: 'RSI策略', totalReturn: 12.3, sharpeRatio: 1.1, maxDrawdown: 10.5 },
    ];

    it('Markdown对比应包含表格', () => {
      const md = gen.generateComparisonReport(strategies, { format: 'markdown' });
      expect(md).toContain('策略对比报告');
      expect(md).toContain('双均线交叉');
      expect(md).toContain('RSI策略');
    });

    it('应标识最优策略', () => {
      const md = gen.generateComparisonReport(strategies, { format: 'markdown' });
      expect(md).toContain('最优策略');
      expect(md).toContain('双均线交叉');
    });

    it('HTML对比应包含表格', () => {
      const html = gen.generateComparisonReport(strategies, { format: 'html' });
      expect(html).toContain('<table>');
      expect(html).toContain('RSI策略');
    });

    it('JSON对比应合法', () => {
      const json = gen.generateComparisonReport(strategies, { format: 'json' });
      const parsed = JSON.parse(json);
      expect(parsed.strategies.length).toBe(2);
    });
  });

  describe('边界情况', () => {
    it('零回撤应正确处理', () => {
      const m = { ...sampleMetrics, maxDrawdown: 0 };
      const json = gen.generateJSON(m);
      const parsed = JSON.parse(json);
      expect(parsed.calmarRatio).toBeNull();
    });

    it('无月度数据时不包含月度表', () => {
      const md = gen.generateMarkdown(sampleMetrics);
      expect(md).not.toContain('月度收益');
    });

    it('负收益HTML应正确着色', () => {
      const negMetrics = { ...sampleMetrics, totalReturn: -10 };
      const html = gen.generateHTML(negMetrics);
      expect(html).toContain('-10.00%');
    });
  });
});
