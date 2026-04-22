#!/usr/bin/env node

/**
 * 性能测试脚本
 * 用于验证第19轮迭代的性能优化效果
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 配置
const CONFIG = {
  // 测试目标
  targets: [
    { url: 'http://localhost:3000', name: '首页' },
    { url: 'http://localhost:3000/stocks', name: '股票列表页' },
    { url: 'http://localhost:3000/performance-demo', name: '性能演示页' }
  ],
  
  // 性能指标阈值
  thresholds: {
    firstContentfulPaint: 1500, // 1.5秒
    largestContentfulPaint: 2500, // 2.5秒
    cumulativeLayoutShift: 0.1,
    firstInputDelay: 100, // 100毫秒
    speedIndex: 3000, // 3秒
    totalBlockingTime: 300 // 300毫秒
  },
  
  // 测试次数
  runs: 3,
  
  // 输出目录
  outputDir: './performance-reports'
};

// 创建输出目录
if (!fs.existsSync(CONFIG.outputDir)) {
  fs.mkdirSync(CONFIG.outputDir, { recursive: true });
}

// 性能测试结果
const results = {
  timestamp: new Date().toISOString(),
  config: CONFIG,
  tests: []
};

/**
 * 运行Lighthouse测试
 */
async function runLighthouseTest(url, name) {
  console.log(`🚀 开始测试: ${name} (${url})`);
  
  const testResults = {
    name,
    url,
    runs: [],
    summary: {}
  };
  
  for (let i = 0; i < CONFIG.runs; i++) {
    console.log(`  第 ${i + 1}/${CONFIG.runs} 次测试...`);
    
    try {
      // 运行Lighthouse测试
      const output = execSync(
        `npx lighthouse ${url} --output=json --output-path=${path.join(CONFIG.outputDir, `${name.replace(/\s+/g, '-')}-run-${i + 1}.json`)} --chrome-flags="--headless"`,
        { encoding: 'utf-8', stdio: 'pipe' }
      );
      
      const report = JSON.parse(output);
      const metrics = extractMetrics(report);
      
      testResults.runs.push({
        run: i + 1,
        metrics,
        timestamp: new Date().toISOString()
      });
      
      console.log(`    完成: FCP=${metrics.firstContentfulPaint}ms, LCP=${metrics.largestContentfulPaint}ms`);
      
    } catch (error) {
      console.error(`    测试失败: ${error.message}`);
      testResults.runs.push({
        run: i + 1,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
    
    // 等待一段时间再进行下一次测试
    if (i < CONFIG.runs - 1) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  // 计算平均值
  if (testResults.runs.length > 0 && !testResults.runs[0].error) {
    testResults.summary = calculateSummary(testResults.runs);
    testResults.passed = checkThresholds(testResults.summary);
  }
  
  return testResults;
}

/**
 * 从Lighthouse报告中提取关键指标
 */
function extractMetrics(report) {
  const audits = report.audits;
  
  return {
    firstContentfulPaint: audits['first-contentful-paint']?.numericValue || 0,
    largestContentfulPaint: audits['largest-contentful-paint']?.numericValue || 0,
    cumulativeLayoutShift: audits['cumulative-layout-shift']?.numericValue || 0,
    firstInputDelay: audits['max-potential-fid']?.numericValue || 0,
    speedIndex: audits['speed-index']?.numericValue || 0,
    totalBlockingTime: audits['total-blocking-time']?.numericValue || 0,
    
    // 其他有用指标
    timeToInteractive: audits['interactive']?.numericValue || 0,
    serverResponseTime: audits['server-response-time']?.numericValue || 0,
    mainThreadWork: audits['mainthread-work-breakdown']?.numericValue || 0,
    
    // 性能评分
    performanceScore: report.categories?.performance?.score * 100 || 0,
    
    // 资源信息
    totalBytes: report.audits['total-byte-weight']?.numericValue || 0,
    unusedBytes: report.audits['unused-javascript']?.numericValue || 0,
    imageBytes: report.audits['uses-optimized-images']?.details?.items?.reduce((sum, item) => sum + (item.totalBytes || 0), 0) || 0
  };
}

/**
 * 计算测试结果摘要
 */
function calculateSummary(runs) {
  const metrics = {};
  const validRuns = runs.filter(run => !run.error);
  
  if (validRuns.length === 0) {
    return {};
  }
  
  // 初始化指标对象
  const firstRun = validRuns[0].metrics;
  Object.keys(firstRun).forEach(key => {
    metrics[key] = {
      values: [],
      avg: 0,
      min: Infinity,
      max: -Infinity,
      stdDev: 0
    };
  });
  
  // 收集所有值
  validRuns.forEach(run => {
    Object.keys(run.metrics).forEach(key => {
      metrics[key].values.push(run.metrics[key]);
    });
  });
  
  // 计算统计信息
  Object.keys(metrics).forEach(key => {
    const values = metrics[key].values;
    const sum = values.reduce((a, b) => a + b, 0);
    
    metrics[key].avg = sum / values.length;
    metrics[key].min = Math.min(...values);
    metrics[key].max = Math.max(...values);
    
    // 计算标准差
    const mean = metrics[key].avg;
    const squareDiffs = values.map(value => Math.pow(value - mean, 2));
    const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / values.length;
    metrics[key].stdDev = Math.sqrt(avgSquareDiff);
  });
  
  return metrics;
}

/**
 * 检查是否满足阈值要求
 */
function checkThresholds(summary) {
  if (!summary || Object.keys(summary).length === 0) {
    return false;
  }
  
  const failedMetrics = [];
  
  Object.keys(CONFIG.thresholds).forEach(metric => {
    if (summary[metric] && summary[metric].avg > CONFIG.thresholds[metric]) {
      failedMetrics.push({
        metric,
        value: summary[metric].avg,
        threshold: CONFIG.thresholds[metric]
      });
    }
  });
  
  return {
    passed: failedMetrics.length === 0,
    failedMetrics,
    performanceScore: summary.performanceScore?.avg || 0
  };
}

/**
 * 生成测试报告
 */
function generateReport() {
  const report = {
    ...results,
    overall: {
      totalTests: results.tests.length,
      passedTests: results.tests.filter(t => t.passed?.passed).length,
      failedTests: results.tests.filter(t => !t.passed?.passed).length,
      averagePerformanceScore: results.tests.reduce((sum, test) => sum + (test.passed?.performanceScore || 0), 0) / results.tests.length
    }
  };
  
  // 保存详细报告
  const reportFile = path.join(CONFIG.outputDir, `performance-report-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
  
  // 生成简版报告
  const summaryFile = path.join(CONFIG.outputDir, 'performance-summary.md');
  const summary = generateSummaryMarkdown(report);
  fs.writeFileSync(summaryFile, summary);
  
  return report;
}

/**
 * 生成Markdown格式的摘要报告
 */
function generateSummaryMarkdown(report) {
  let markdown = `# 性能测试报告\n\n`;
  markdown += `**测试时间**: ${new Date(report.timestamp).toLocaleString('zh-CN')}\n\n`;
  
  // 总体结果
  markdown += `## 总体结果\n\n`;
  markdown += `| 指标 | 值 |\n`;
  markdown += `|------|-----|\n`;
  markdown += `| 总测试页面 | ${report.overall.totalTests} |\n`;
  markdown += `| 通过测试 | ${report.overall.passedTests} |\n`;
  markdown += `| 失败测试 | ${report.overall.failedTests} |\n`;
  markdown += `| 平均性能评分 | ${report.overall.averagePerformanceScore.toFixed(1)}/100 |\n\n`;
  
  // 各页面测试结果
  markdown += `## 各页面测试结果\n\n`;
  
  report.tests.forEach(test => {
    const status = test.passed?.passed ? '✅ 通过' : '❌ 失败';
    markdown += `### ${test.name} ${status}\n\n`;
    markdown += `**URL**: ${test.url}\n\n`;
    
    if (test.summary && Object.keys(test.summary).length > 0) {
      markdown += `| 指标 | 平均值 | 最小值 | 最大值 | 阈值 | 状态 |\n`;
      markdown += `|------|--------|--------|--------|------|------|\n`;
      
      Object.keys(CONFIG.thresholds).forEach(metric => {
        if (test.summary[metric]) {
          const value = test.summary[metric].avg;
          const threshold = CONFIG.thresholds[metric];
          const passed = value <= threshold;
          const status = passed ? '✅' : '❌';
          
          markdown += `| ${metric} | ${value.toFixed(0)}ms | ${test.summary[metric].min.toFixed(0)}ms | ${test.summary[metric].max.toFixed(0)}ms | ${threshold}ms | ${status} |\n`;
        }
      });
    }
    
    if (test.passed && !test.passed.passed && test.passed.failedMetrics) {
      markdown += `\n**失败指标**:\n`;
      test.passed.failedMetrics.forEach(failed => {
        markdown += `- ${failed.metric}: ${failed.value.toFixed(0)}ms > ${failed.threshold}ms\n`;
      });
    }
    
    markdown += `\n`;
  });
  
  // 性能建议
  markdown += `## 性能优化建议\n\n`;
  
  const allFailedMetrics = report.tests.flatMap(test => 
    test.passed?.failedMetrics?.map(fm => ({
      page: test.name,
      ...fm
    })) || []
  );
  
  if (allFailedMetrics.length > 0) {
    markdown += `### 需要优化的指标\n\n`;
    
    const byMetric = allFailedMetrics.reduce((acc, fm) => {
      if (!acc[fm.metric]) {
        acc[fm.metric] = [];
      }
      acc[fm.metric].push(fm);
      return acc;
    }, {});
    
    Object.keys(byMetric).forEach(metric => {
      markdown += `#### ${metric}\n\n`;
      markdown += `影响页面: ${byMetric[metric].map(fm => fm.page).join(', ')}\n\n`;
      
      // 提供优化建议
      const suggestions = {
        firstContentfulPaint: [
          '优化关键CSS，减少渲染阻塞',
          '预加载关键资源',
          '减少服务器响应时间',
          '使用CDN加速静态资源'
        ],
        largestContentfulPaint: [
          '优化图片加载（使用懒加载和响应式图片）',
          '预加载关键图片',
          '优化字体加载',
          '减少JavaScript执行时间'
        ],
        cumulativeLayoutShift: [
          '为图片和媒体元素指定尺寸',
          '避免在现有内容上方插入内容',
          '使用transform动画代替影响布局的属性',
          '预加载字体'
        ],
        firstInputDelay: [
          '减少JavaScript执行时间',
          '使用Web Workers处理复杂计算',
          '优化事件处理函数',
          '避免长任务'
        ],
        speedIndex: [
          '优化首屏渲染',
          '使用服务器端渲染或静态生成',
          '减少关键资源数量',
          '优化资源加载顺序'
        ],
        totalBlockingTime: [
          '拆分长任务',
          '使用requestIdleCallback处理低优先级任务',
          '优化JavaScript执行',
          '减少DOM操作'
        ]
      };
      
      if (suggestions[metric]) {
        markdown += `优化建议:\n`;
        suggestions[metric].forEach(suggestion => {
          markdown += `- ${suggestion}\n`;
        });
      }
      
      markdown += `\n`;
    });
  } else {
    markdown += `✅ 所有性能指标均达到要求，继续保持！\n\n`;
  }
  
  // 后续步骤
  markdown += `## 后续步骤\n\n`;
  markdown += `1. 查看详细报告: \`${path.relative(process.cwd(), path.join(CONFIG.outputDir, path.basename(reportFile)))}\`\n`;
  markdown += `2. 针对失败指标进行优化\n`;
  markdown += `3. 重新运行性能测试验证优化效果\n`;
  markdown += `4. 将性能测试集成到CI/CD流程中\n`;
  
  return markdown;
}

/**
 * 主函数
 */
async function main() {
  console.log('🎯 开始第19轮迭代性能测试\n');
  console.log(`配置信息:`);
  console.log(`- 测试页面: ${CONFIG.targets.map(t => t.name).join(', ')}`);
  console.log(`- 测试次数: ${CONFIG.runs}次/页面`);
  console.log(`- 输出目录: ${CONFIG.outputDir}\n`);
  
  // 检查Lighthouse是否可用
  try {
    execSync('npx lighthouse --version', { stdio: 'pipe' });
  } catch (error) {
    console.error('❌ Lighthouse未安装，请先安装: npm install -g lighthouse');
    process.exit(1);
  }
  
  // 运行所有测试
  for (const target of CONFIG.targets) {
    const testResult = await runLighthouseTest(target.url, target.name);
    results.tests.push(testResult);
  }
  
  // 生成报告
  const report = generateReport();
  
  console.log('\n📊 测试完成！');
  console.log(`总体结果:`);
  console.log(`- 总测试: ${report.overall.totalTests}`);
  console.log(`- 通过: ${report.overall.passedTests}`);
  console.log(`- 失败: ${report.overall.failedTests}`);
  console.log(`- 平均性能评分: ${report.overall.averagePerformanceScore.toFixed(1)}/100`);
  
  // 输出报告位置
  console.log(`\n📄 报告已生成:`);
  console.log(`- 详细报告: ${path.join(CONFIG.outputDir, path.basename(Object.keys(report).includes('reportFile') ? report.reportFile : 'performance-report-*.json'))}`);
  console.log(`- 摘要报告: ${path.join(CONFIG.outputDir, 'performance-summary.md')}`);
  
  // 如果有失败测试，返回非零退出码
  if (report.overall.failedTests > 0) {
    console.log('\n❌ 有测试未通过，请查看报告并优化');
    process.exit(1);
  } else {
    console.log('\n✅ 所有测试通过！');
    process.exit(0);
  }
}

// 运行主函数
main().catch(error => {
  console.error('测试执行失败:', error);
  process.exit(1);
});