#!/usr/bin/env node

/**
 * 性能检查脚本
 * 检查代码中的性能问题
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 配置
const CONFIG = {
  // 检查的文件类型
  fileExtensions: ['.tsx', '.ts', '.jsx', '.js'],
  
  // 忽略的目录
  ignoreDirs: ['node_modules', '.git', 'dist', 'build', 'coverage'],
  
  // 性能问题规则
  rules: {
    // 缺少useMemo
    missingUseMemo: {
      pattern: /const\s+(\w+)\s*=\s*(?!useMemo|useState|useRef|useCallback)(?:[^{};]+\s*=\s*)?(?:\([^)]*\)\s*=>|[^{};]+\()?\s*\{[^}]*\}/,
      message: '复杂计算应该使用useMemo进行优化',
      severity: 'warning'
    },
    
    // 缺少useCallback
    missingUseCallback: {
      pattern: /const\s+(\w+)\s*=\s*(?:\([^)]*\)\s*=>|[^{};]+\()?\s*\{[^}]*\}(?!\s*useCallback)/,
      message: '事件处理函数应该使用useCallback进行优化',
      severity: 'warning'
    },
    
    // 内联函数定义
    inlineFunction: {
      pattern: /onClick\s*=\s*\{\s*(?:\([^)]*\)\s*=>|[^{};]+\()?\s*\{[^}]*\}\s*\}/,
      message: '避免在JSX中内联定义函数，应该使用useCallback',
      severity: 'warning'
    },
    
    // 内联对象定义
    inlineObject: {
      pattern: /style\s*=\s*\{\s*\{[^}]*\}\s*\}/,
      message: '避免在JSX中内联定义对象，应该使用useMemo',
      severity: 'warning'
    },
    
    // 缺少React.memo
    missingReactMemo: {
      pattern: /export\s+(?:default\s+)?(?:const\s+)?(\w+)\s*=\s*(?:\([^)]*\)\s*=>|[^{};]+\()?\s*\{[^}]*\}(?!\s*React\.memo)/,
      message: '纯展示组件应该使用React.memo进行优化',
      severity: 'info'
    },
    
    // 大组件警告
    largeComponent: {
      maxLines: 300,
      message: '组件过大，建议拆分为更小的组件',
      severity: 'warning'
    },
    
    // 缺少懒加载
    missingLazyLoad: {
      pattern: /import\s+.*from\s+['"](\.\.?\/[^'"]+\.(?:tsx|ts|jsx|js))['"]/,
      check: (match, filePath) => {
        const importPath = match[1];
        const fullPath = path.resolve(path.dirname(filePath), importPath);
        
        if (fs.existsSync(fullPath)) {
          const stats = fs.statSync(fullPath);
          return stats.size > 10240; // 10KB以上
        }
        return false;
      },
      message: '大文件应该使用懒加载（React.lazy）',
      severity: 'warning'
    },
    
    // 直接使用img标签
    directImgTag: {
      pattern: /<img[^>]*>/g,
      message: '应该使用LazyImage组件代替img标签',
      severity: 'warning'
    }
  },
  
  // 输出格式
  output: {
    format: 'table', // table, json, markdown
    showAll: false,  // 是否显示所有文件，包括没有问题的
    outputFile: './performance-check-report.md'
  }
};

// 性能问题收集
const issues = [];

/**
 * 检查单个文件
 */
function checkFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const fileName = path.basename(filePath);
  
  const fileIssues = [];
  
  // 检查大组件
  if (lines.length > CONFIG.rules.largeComponent.maxLines) {
    fileIssues.push({
      rule: 'largeComponent',
      line: 1,
      message: CONFIG.rules.largeComponent.message,
      severity: CONFIG.rules.largeComponent.severity,
      detail: `组件有 ${lines.length} 行代码，超过 ${CONFIG.rules.largeComponent.maxLines} 行限制`
    });
  }
  
  // 检查其他规则
  Object.keys(CONFIG.rules).forEach(ruleName => {
    const rule = CONFIG.rules[ruleName];
    
    if (rule.pattern) {
      const matches = content.matchAll(rule.pattern);
      
      for (const match of matches) {
        // 计算行号
        const matchText = match[0];
        const matchIndex = match.index;
        const linesBefore = content.substring(0, matchIndex).split('\n');
        const lineNumber = linesBefore.length;
        
        let shouldReport = true;
        
        // 如果有自定义检查函数
        if (rule.check) {
          shouldReport = rule.check(match, filePath);
        }
        
        if (shouldReport) {
          fileIssues.push({
            rule: ruleName,
            line: lineNumber,
            message: rule.message,
            severity: rule.severity,
            detail: matchText.substring(0, 100) + '...'
          });
        }
      }
    }
  });
  
  if (fileIssues.length > 0) {
    issues.push({
      file: filePath,
      issues: fileIssues
    });
  } else if (CONFIG.output.showAll) {
    issues.push({
      file: filePath,
      issues: []
    });
  }
}

/**
 * 递归检查目录
 */
function checkDirectory(dirPath) {
  const items = fs.readdirSync(dirPath);
  
  for (const item of items) {
    const fullPath = path.join(dirPath, item);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      if (!CONFIG.ignoreDirs.includes(item)) {
        checkDirectory(fullPath);
      }
    } else if (CONFIG.fileExtensions.some(ext => item.endsWith(ext))) {
      checkFile(fullPath);
    }
  }
}

/**
 * 生成报告
 */
function generateReport() {
  const totalIssues = issues.reduce((sum, file) => sum + file.issues.length, 0);
  
  // 按严重程度统计
  const severityCounts = {
    error: 0,
    warning: 0,
    info: 0
  };
  
  issues.forEach(file => {
    file.issues.forEach(issue => {
      severityCounts[issue.severity] = (severityCounts[issue.severity] || 0) + 1;
    });
  });
  
  // 按规则统计
  const ruleCounts = {};
  issues.forEach(file => {
    file.issues.forEach(issue => {
      ruleCounts[issue.rule] = (ruleCounts[issue.rule] || 0) + 1;
    });
  });
  
  // 生成Markdown报告
  let markdown = `# 性能检查报告\n\n`;
  markdown += `**检查时间**: ${new Date().toLocaleString('zh-CN')}\n\n`;
  
  // 摘要
  markdown += `## 摘要\n\n`;
  markdown += `| 指标 | 数量 |\n`;
  markdown += `|------|------|\n`;
  markdown += `| 检查文件数 | ${issues.length} |\n`;
  markdown += `| 发现问题数 | ${totalIssues} |\n`;
  markdown += `| 错误级别问题 | ${severityCounts.error} |\n`;
  markdown += `| 警告级别问题 | ${severityCounts.warning} |\n`;
  markdown += `| 信息级别问题 | ${severityCounts.info} |\n\n`;
  
  // 问题分布
  if (Object.keys(ruleCounts).length > 0) {
    markdown += `## 问题分布\n\n`;
    markdown += `| 问题类型 | 数量 | 描述 |\n`;
    markdown += `|----------|------|------|\n`;
    
    Object.entries(ruleCounts).sort((a, b) => b[1] - a[1]).forEach(([rule, count]) => {
      const ruleConfig = CONFIG.rules[rule];
      markdown += `| ${rule} | ${count} | ${ruleConfig?.message || ''} |\n`;
    });
    
    markdown += `\n`;
  }
  
  // 详细问题列表
  if (totalIssues > 0) {
    markdown += `## 详细问题列表\n\n`;
    
    issues.forEach(file => {
      if (file.issues.length > 0) {
        markdown += `### ${path.relative(process.cwd(), file.file)}\n\n`;
        
        file.issues.forEach(issue => {
          const severityIcon = {
            error: '❌',
            warning: '⚠️',
            info: 'ℹ️'
          }[issue.severity] || '📝';
          
          markdown += `${severityIcon} **第 ${issue.line} 行**: ${issue.message}\n\n`;
          markdown += `   规则: ${issue.rule}\n`;
          if (issue.detail) {
            markdown += `   代码: \`${issue.detail}\`\n`;
          }
          markdown += `\n`;
        });
      }
    });
  } else {
    markdown += `## 检查结果\n\n`;
    markdown += `✅ 恭喜！没有发现性能问题。\n\n`;
  }
  
  // 优化建议
  markdown += `## 优化建议\n\n`;
  
  if (ruleCounts.missingUseMemo) {
    markdown += `### 缺少useMemo (${ruleCounts.missingUseMemo}处)\n\n`;
    markdown += `1. 识别复杂计算，使用useMemo缓存结果\n`;
    markdown += `2. 确保依赖项数组正确\n`;
    markdown += `3. 避免在useMemo中产生副作用\n\n`;
  }
  
  if (ruleCounts.missingUseCallback) {
    markdown += `### 缺少useCallback (${ruleCounts.missingUseCallback}处)\n\n`;
    markdown += `1. 事件处理函数应该使用useCallback包装\n`;
    markdown += `2. 避免在子组件中创建新函数引用\n`;
    markdown += `3. 合理设置依赖项数组\n\n`;
  }
  
  if (ruleCounts.inlineFunction || ruleCounts.inlineObject) {
    markdown += `### 内联定义 (${(ruleCounts.inlineFunction || 0) + (ruleCounts.inlineObject || 0)}处)\n\n`;
    markdown += `1. 避免在JSX中内联定义函数和对象\n`;
    markdown += `2. 将内联定义提取到组件外部\n`;
    markdown += `3. 使用useMemo和useCallback进行优化\n\n`;
  }
  
  if (ruleCounts.missingReactMemo) {
    markdown += `### 缺少React.memo (${ruleCounts.missingReactMemo}处)\n\n`;
    markdown += `1. 纯展示组件应该使用React.memo包装\n`;
    markdown += `2. 实现自定义的props比较函数\n`;
    markdown += `3. 避免在React.memo组件中使用不稳定的props\n\n`;
  }
  
  if (ruleCounts.largeComponent) {
    markdown += `### 大组件问题 (${ruleCounts.largeComponent}处)\n\n`;
    markdown += `1. 将大组件拆分为更小的功能组件\n`;
    markdown += `2. 使用组合模式代替继承\n`;
    markdown += `3. 提取可复用的逻辑到自定义Hook\n\n`;
  }
  
  if (ruleCounts.missingLazyLoad) {
    markdown += `### 缺少懒加载 (${ruleCounts.missingLazyLoad}处)\n\n`;
    markdown += `1. 大组件应该使用React.lazy进行懒加载\n`;
    markdown += `2. 配合Suspense显示加载状态\n`;
    markdown += `3. 实现错误边界处理加载失败\n\n`;
  }
  
  if (ruleCounts.directImgTag) {
    markdown += `### 直接使用img标签 (${ruleCounts.directImgTag}处)\n\n`;
    markdown += `1. 使用LazyImage组件代替img标签\n`;
    markdown += `2. 配置合适的懒加载参数\n`;
    markdown += `3. 为关键图片设置预加载\n\n`;
  }
  
  // 通用建议
  markdown += `## 通用性能优化建议\n\n`;
  markdown += `1. **代码分割**: 使用路由级和组件级代码分割\n`;
  markdown += `2. **图片优化**: 使用懒加载、响应式图片和WebP格式\n`;
  markdown += `3. **资源预加载**: 预加载关键CSS、字体和图片\n`;
  markdown += `4. **缓存策略**: 合理设置HTTP缓存头\n`;
  markdown += `5. **监控分析**: 使用性能监控工具持续优化\n`;
  
  // 保存报告
  fs.writeFileSync(CONFIG.output.outputFile, markdown);
  
  return {
    totalFiles: issues.length,
    totalIssues,
    severityCounts,
    ruleCounts,
    reportFile: CONFIG.output.outputFile
  };
}

/**
 * 控制台输出
 */
function consoleOutput(report) {
  console.log('🎯 性能检查完成\n');
  console.log('📊 检查结果:');
  console.log(`   检查文件: ${report.totalFiles}`);
  console.log(`   发现问题: ${report.totalIssues}`);
  console.log(`   错误: ${report.severityCounts.error}`);
  console.log(`   警告: ${report.severityCounts.warning}`);
  console.log(`   信息: ${report.severityCounts.info}`);
  
  if (report.totalIssues > 0) {
    console.log('\n📋 问题分布:');
    Object.entries(report.ruleCounts).sort((a, b) => b[1] - a[1]).forEach(([rule, count]) => {
      const ruleConfig = CONFIG.rules[rule];
      console.log(`   ${rule}: ${count} (${ruleConfig?.message})`);
    });
  }
  
  console.log(`\n📄 详细报告: ${report.reportFile}`);
  
  if (report.severityCounts.error > 0) {
    console.log('\n❌ 发现错误级别问题，请立即修复');
    process.exit(1);
  } else if (report.severityCounts.warning > 0) {
    console.log('\n⚠️  发现警告级别问题，建议修复');
    process.exit(0);
  } else {
    console.log('\n✅ 检查通过，没有发现性能问题');
    process.exit(0);
  }
}

/**
 * 主函数
 */
function main() {
  console.log('🔍 开始性能检查...\n');
  
  // 检查src目录
  const srcDir = path.join(process.cwd(), 'src');
  if (!fs.existsSync(srcDir)) {
    console.error('❌ 找不到src目录');
    process.exit(1);
  }
  
  checkDirectory(srcDir);
  
  // 生成报告
  const report = generateReport();
  
  // 控制台输出
  consoleOutput(report);
}

// 运行主函数
main();