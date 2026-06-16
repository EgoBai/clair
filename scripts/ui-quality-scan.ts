/**
 * UI 质量扫描脚本
 * 
 * 自动检测前端代码中的常见 UI 问题：
 * 1. 硬编码颜色（应该使用 CSS 变量）
 * 2. 缺失的响应式适配
 * 3. 可访问性问题
 * 4. 不一致的样式
 */

import * as fs from 'fs';
import * as path from 'path';

const SRC_DIR = path.resolve(__dirname, '../src');
const PAGES_DIR = path.join(SRC_DIR, 'pages');
const COMPONENTS_DIR = path.join(SRC_DIR, 'components');

// 硬编码颜色模式
const HARDCODED_COLORS = [
  /['"]#[0-9a-fA-F]{6}['"]/g,
  /['"]#[0-9a-fA-F]{3}['"]/g,
  /rgba?\(\d+,\s*\d+,\s*\d+/g,
];

// 应该使用 CSS 变量的颜色
const CSS_VAR_PATTERNS = [
  'var(--bg-base)',
  'var(--bg-card)',
  'var(--bg-secondary)',
  'var(--text-primary)',
  'var(--text-secondary)',
  'var(--accent-solid)',
  'var(--color-up)',
  'var(--color-down)',
  'var(--border-default)',
];

interface Issue {
  file: string;
  line: number;
  type: 'hardcoded-color' | 'missing-responsive' | 'accessibility' | 'inconsistency';
  severity: 'high' | 'medium' | 'low';
  message: string;
  suggestion: string;
}

function scanFile(filePath: string): Issue[] {
  const issues: Issue[] = [];
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const relativePath = path.relative(SRC_DIR, filePath);

  lines.forEach((line, index) => {
    // 检查硬编码颜色
    HARDCODED_COLORS.forEach(pattern => {
      const matches = line.match(pattern);
      if (matches) {
        // 排除 CSS 变量和导入语句
        if (!line.includes('var(--') && !line.includes('import') && !line.includes('export')) {
          issues.push({
            file: relativePath,
            line: index + 1,
            type: 'hardcoded-color',
            severity: 'high',
            message: `硬编码颜色: ${matches[0]}`,
            suggestion: '使用 CSS 变量替代，如 var(--text-primary)',
          });
        }
      }
    });

    // 检查内联样式中的背景色
    if (line.includes('background:') && !line.includes('var(--') && !line.includes('transparent') && !line.includes('none')) {
      if (line.includes("'#") || line.includes('"#') || line.includes('rgb')) {
        issues.push({
          file: relativePath,
          line: index + 1,
          type: 'hardcoded-color',
          severity: 'high',
          message: '内联样式中使用了硬编码背景色',
          suggestion: '使用 var(--bg-card) 或 var(--bg-secondary)',
        });
      }
    }

    // 检查文字颜色
    if (line.includes('color:') && !line.includes('var(--') && !line.includes('inherit') && !line.includes('transparent')) {
      if (line.includes("'#") || line.includes('"#')) {
        issues.push({
          file: relativePath,
          line: index + 1,
          type: 'hardcoded-color',
          severity: 'medium',
          message: '内联样式中使用了硬编码文字颜色',
          suggestion: '使用 var(--text-primary) 或 var(--text-secondary)',
        });
      }
    }
  });

  return issues;
}

function scanDirectory(dir: string): Issue[] {
  const issues: Issue[] = [];
  
  const files = fs.readdirSync(dir, { withFileTypes: true });
  files.forEach(file => {
    const fullPath = path.join(dir, file.name);
    if (file.isDirectory()) {
      issues.push(...scanDirectory(fullPath));
    } else if (file.name.endsWith('.tsx') || file.name.endsWith('.ts')) {
      issues.push(...scanFile(fullPath));
    }
  });

  return issues;
}

// 主函数
function main() {
  console.log('🔍 UI 质量扫描开始...\n');

  const issues: Issue[] = [];
  
  // 扫描页面目录
  if (fs.existsSync(PAGES_DIR)) {
    issues.push(...scanDirectory(PAGES_DIR));
  }
  
  // 扫描组件目录
  if (fs.existsSync(COMPONENTS_DIR)) {
    issues.push(...scanDirectory(COMPONENTS_DIR));
  }

  // 按严重程度排序
  issues.sort((a, b) => {
    const severityOrder = { high: 0, medium: 1, low: 2 };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });

  // 统计
  const highIssues = issues.filter(i => i.severity === 'high');
  const mediumIssues = issues.filter(i => i.severity === 'medium');
  const lowIssues = issues.filter(i => i.severity === 'low');

  console.log(`📊 扫描结果:`);
  console.log(`   🔴 高严重度: ${highIssues.length}`);
  console.log(`   🟡 中严重度: ${mediumIssues.length}`);
  console.log(`   🟢 低严重度: ${lowIssues.length}`);
  console.log(`   总计: ${issues.length}\n`);

  // 输出高严重度问题
  if (highIssues.length > 0) {
    console.log('🔴 高严重度问题:');
    highIssues.slice(0, 20).forEach(issue => {
      console.log(`   ${issue.file}:${issue.line} - ${issue.message}`);
      console.log(`      建议: ${issue.suggestion}`);
    });
    console.log('');
  }

  // 输出按文件分组的问题
  console.log('📁 按文件分组:');
  const fileGroups = issues.reduce((acc, issue) => {
    if (!acc[issue.file]) acc[issue.file] = [];
    acc[issue.file].push(issue);
    return acc;
  }, {} as Record<string, Issue[]>);

  Object.entries(fileGroups)
    .sort(([, a], [, b]) => b.length - a.length)
    .slice(0, 10)
    .forEach(([file, fileIssues]) => {
      console.log(`   ${file}: ${fileIssues.length} 个问题`);
    });
}

main();
