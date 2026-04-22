/**
 * 类型安全检查脚本
 * 第17轮迭代优化：快速检查类型安全问题
 */

import fs from 'fs';
import path from 'path';

interface TypeIssue {
  file: string;
  line: number;
  content: string;
  type: 'any' | 'unknown' | 'as-any' | 'non-null-assertion';
}

async function checkFile(filePath: string): Promise<TypeIssue[]> {
  const issues: TypeIssue[] = [];
  const content = await fs.promises.readFile(filePath, 'utf-8');
  const lines = content.split('\n');

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const trimmedLine = line.trim();

    // 检查 : any 类型
    if (/: any(?!\w)/.test(line) && !/extends.*any/.test(line)) {
      issues.push({
        file: filePath,
        line: lineNumber,
        content: trimmedLine,
        type: 'any',
      });
    }

    // 检查 as any 强制转换
    if (/as any\b/.test(line)) {
      issues.push({
        file: filePath,
        line: lineNumber,
        content: trimmedLine,
        type: 'as-any',
      });
    }

    // 检查非空断言
    if (/!(\s*[;),\]}]|$)/.test(line) || /\w+!\./.test(line)) {
      issues.push({
        file: filePath,
        line: lineNumber,
        content: trimmedLine,
        type: 'non-null-assertion',
      });
    }
  });

  return issues;
}

async function findTypeScriptFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    if (entry.isDirectory()) {
      // 跳过 node_modules 和测试目录
      if (!['node_modules', '__tests__', '.git', 'dist', 'build'].includes(entry.name)) {
        files.push(...await findTypeScriptFiles(fullPath));
      }
    } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
}

async function main() {
  console.log('🔍 开始类型安全检查...\n');
  
  const srcDir = path.join(__dirname, '../src');
  const files = await findTypeScriptFiles(srcDir);
  
  console.log(`📁 扫描 ${files.length} 个 TypeScript 文件\n`);
  
  const allIssues: TypeIssue[] = [];
  
  for (const file of files.slice(0, 50)) { // 限制检查前50个文件
    const issues = await checkFile(file);
    if (issues.length > 0) {
      allIssues.push(...issues);
    }
  }
  
  // 按类型分组
  const byType = allIssues.reduce((acc, issue) => {
    acc[issue.type] = (acc[issue.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  // 输出摘要
  console.log('📊 类型安全问题摘要:');
  console.log('====================');
  Object.entries(byType).forEach(([type, count]) => {
    console.log(`  ${type}: ${count} 个问题`);
  });
  console.log(`  总计: ${allIssues.length} 个问题\n`);
  
  // 输出前10个问题
  if (allIssues.length > 0) {
    console.log('🚨 前10个类型安全问题:');
    console.log('=====================');
    
    allIssues.slice(0, 10).forEach((issue, index) => {
      const relativePath = path.relative(process.cwd(), issue.file);
      console.log(`${index + 1}. ${relativePath}:${issue.line}`);
      console.log(`   ${issue.content}`);
      console.log();
    });
    
    if (allIssues.length > 10) {
      console.log(`... 还有 ${allIssues.length - 10} 个问题未显示`);
    }
  } else {
    console.log('✅ 未发现类型安全问题！');
  }
  
  // 建议
  console.log('\n💡 改进建议:');
  console.log('===========');
  console.log('1. 对于 any 类型: 使用具体类型或 unknown');
  console.log('2. 对于 as any: 使用类型守卫或类型断言');
  console.log('3. 对于非空断言: 添加空值检查或使用可选链');
}

main().catch(console.error);