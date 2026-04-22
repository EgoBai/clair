#!/usr/bin/env node

/**
 * 性能优化检查脚本
 * 检查React组件中的常见性能问题
 */

const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, '../src');
const ISSUES = {
  MISSING_MEMO: 'missing-memo',
  MISSING_CALLBACK: 'missing-callback',
  MISSING_USEMEMO: 'missing-usememo',
  INVALID_DEPENDENCIES: 'invalid-dependencies',
  LARGE_COMPONENT: 'large-component',
  NO_ERROR_BOUNDARY: 'no-error-boundary',
  NO_LAZY_LOADING: 'no-lazy-loading',
};

class PerformanceChecker {
  constructor() {
    this.issues = [];
    this.componentCount = 0;
  }

  async run() {
    console.log('🔍 开始性能优化检查...\n');
    
    await this.scanDirectory(SRC_DIR);
    
    this.printReport();
    
    if (this.issues.length > 0) {
      process.exit(1);
    } else {
      console.log('✅ 所有检查通过！');
    }
  }

  async scanDirectory(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        if (!entry.name.includes('node_modules') && !entry.name.includes('.git')) {
          await this.scanDirectory(fullPath);
        }
      } else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) {
        await this.checkFile(fullPath);
      }
    }
  }

  async checkFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const fileName = path.basename(filePath);
    
    // 检查是否是React组件文件
    if (!this.isReactComponent(content)) {
      return;
    }
    
    this.componentCount++;
    
    // 检查各种性能问题
    this.checkMissingMemo(content, filePath, fileName);
    this.checkMissingUseCallback(content, filePath, fileName);
    this.checkMissingUseMemo(content, filePath, fileName);
    this.checkInvalidDependencies(content, filePath, fileName, lines);
    this.checkLargeComponent(content, filePath, fileName);
    this.checkErrorBoundary(content, filePath, fileName);
    this.checkLazyLoading(content, filePath, fileName);
  }

  isReactComponent(content) {
    return (
      content.includes('React.FC') ||
      content.includes('function Component') ||
      content.includes('class ') && content.includes('extends React.Component') ||
      content.includes('class ') && content.includes('extends Component')
    );
  }

  checkMissingMemo(content, filePath, fileName) {
    // 检查纯展示组件是否使用React.memo
    const hasProps = content.includes('props') || content.includes('{ ') && content.includes(' }: ');
    const hasState = content.includes('useState') || content.includes('this.state');
    const hasEffects = content.includes('useEffect') || content.includes('componentDid');
    
    if (hasProps && !hasState && !hasEffects && !content.includes('React.memo')) {
      this.addIssue(ISSUES.MISSING_MEMO, filePath, '纯展示组件应考虑使用React.memo');
    }
  }

  checkMissingUseCallback(content, filePath, fileName) {
    // 检查事件处理函数是否使用useCallback
    const eventHandlers = content.match(/const\s+(\w+)\s*=\s*\([^)]*\)\s*=>/g) || [];
    const useCallbacks = (content.match(/useCallback/g) || []).length;
    
    if (eventHandlers.length > 2 && useCallbacks < eventHandlers.length / 2) {
      this.addIssue(ISSUES.MISSING_CALLBACK, filePath, '事件处理函数应考虑使用useCallback');
    }
  }

  checkMissingUseMemo(content, filePath, fileName) {
    // 检查复杂计算是否使用useMemo
    const complexCalculations = [
      /\.filter\(/g,
      /\.map\(/g,
      /\.reduce\(/g,
      /\.sort\(/g,
      /JSON\.stringify/g,
      /JSON\.parse/g,
    ];
    
    let hasComplexCalc = false;
    for (const pattern of complexCalculations) {
      if ((content.match(pattern) || []).length > 0) {
        hasComplexCalc = true;
        break;
      }
    }
    
    const useMemos = (content.match(/useMemo/g) || []).length;
    
    if (hasComplexCalc && useMemos === 0) {
      this.addIssue(ISSUES.MISSING_USEMEMO, filePath, '复杂计算应考虑使用useMemo');
    }
  }

  checkInvalidDependencies(content, filePath, fileName, lines) {
    // 检查useCallback和useMemo的依赖项
    const callbackRegex = /useCallback\([^,]+,\s*\[([^\]]*)\]/g;
    const memoRegex = /useMemo\([^,]+,\s*\[([^\]]*)\]/g;
    
    let match;
    while ((match = callbackRegex.exec(content)) !== null) {
      const deps = match[1].trim();
      if (deps === '') {
        this.addIssue(ISSUES.INVALID_DEPENDENCIES, filePath, `useCallback缺少依赖项`);
      }
    }
    
    while ((match = memoRegex.exec(content)) !== null) {
      const deps = match[1].trim();
      if (deps === '') {
        this.addIssue(ISSUES.INVALID_DEPENDENCIES, filePath, `useMemo缺少依赖项`);
      }
    }
  }

  checkLargeComponent(content, filePath, fileName) {
    // 检查组件是否过大
    const lineCount = content.split('\n').length;
    if (lineCount > 300) {
      this.addIssue(ISSUES.LARGE_COMPONENT, filePath, `组件过大 (${lineCount}行)，应考虑拆分`);
    }
  }

  checkErrorBoundary(content, filePath, fileName) {
    // 检查关键组件是否有错误边界
    const isCritical = fileName.includes('Page') || 
                      fileName.includes('Dashboard') || 
                      fileName.includes('Layout');
    
    if (isCritical && !content.includes('ErrorBoundary') && !content.includes('componentDidCatch')) {
      this.addIssue(ISSUES.NO_ERROR_BOUNDARY, filePath, '关键组件应考虑添加错误边界');
    }
  }

  checkLazyLoading(content, filePath, fileName) {
    // 检查大型组件是否使用懒加载
    const lineCount = content.split('\n').length;
    const isPageComponent = fileName.includes('Page') && !fileName.includes('HomePage');
    
    if (isPageComponent && lineCount > 200 && !content.includes('React.lazy')) {
      this.addIssue(ISSUES.NO_LAZY_LOADING, filePath, '大型页面组件应考虑使用懒加载');
    }
  }

  addIssue(type, filePath, message) {
    const relativePath = path.relative(process.cwd(), filePath);
    this.issues.push({
      type,
      file: relativePath,
      message,
    });
  }

  printReport() {
    console.log(`📊 检查完成：扫描了 ${this.componentCount} 个组件，发现 ${this.issues.length} 个问题\n`);
    
    if (this.issues.length === 0) {
      return;
    }
    
    // 按问题类型分组
    const issuesByType = {};
    this.issues.forEach(issue => {
      if (!issuesByType[issue.type]) {
        issuesByType[issue.type] = [];
      }
      issuesByType[issue.type].push(issue);
    });
    
    // 打印每种类型的问题
    Object.entries(issuesByType).forEach(([type, issues]) => {
      console.log(`\n${this.getIssueTitle(type)} (${issues.length}个):`);
      issues.forEach(issue => {
        console.log(`  📍 ${issue.file}`);
        console.log(`     ${issue.message}`);
      });
    });
    
    console.log('\n' + '='.repeat(60));
    console.log('\n💡 优化建议：');
    console.log('1. 为纯展示组件添加 React.memo');
    console.log('2. 为事件处理函数添加 useCallback');
    console.log('3. 为复杂计算添加 useMemo');
    console.log('4. 确保依赖项数组完整');
    console.log('5. 拆分过大的组件');
    console.log('6. 为关键组件添加错误边界');
    console.log('7. 对大型页面使用懒加载');
  }

  getIssueTitle(type) {
    const titles = {
      [ISSUES.MISSING_MEMO]: '❌ 缺少React.memo',
      [ISSUES.MISSING_CALLBACK]: '❌ 缺少useCallback',
      [ISSUES.MISSING_USEMEMO]: '❌ 缺少useMemo',
      [ISSUES.INVALID_DEPENDENCIES]: '⚠️ 无效的依赖项',
      [ISSUES.LARGE_COMPONENT]: '📏 组件过大',
      [ISSUES.NO_ERROR_BOUNDARY]: '🛡️ 缺少错误边界',
      [ISSUES.NO_LAZY_LOADING]: '🐌 缺少懒加载',
    };
    return titles[type] || type;
  }
}

// 运行检查
const checker = new PerformanceChecker();
checker.run().catch(console.error);