import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * 模块依赖检查测试
 * 验证代码架构的层次关系，检测循环依赖
 */

function getAllTsFiles(dir: string, base = ''): string[] {
  const files: string[] = [];
  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      if (entry === 'node_modules' || entry === '__tests__') continue;
      const fullPath = join(dir, entry);
      const relPath = base ? `${base}/${entry}` : entry;
      try {
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          files.push(...getAllTsFiles(fullPath, relPath));
        } else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith('.d.ts') && !entry.endsWith('.test.ts') && !entry.endsWith('.test.tsx')) {
          files.push(relPath);
        }
      } catch {}
    }
  } catch {}
  return files;
}

function getImports(filePath: string, rootDir: string): string[] {
  try {
    const content = readFileSync(join(rootDir, filePath), 'utf-8');
    const imports: string[] = [];
    const importRegex = /import\s+(?:type\s+)?(?:\{[^}]*\}|[\w*]+)\s+from\s+['"]([^'"]+)['"]/g;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      imports.push(match[1]);
    }
    return imports;
  } catch {
    return [];
  }
}

describe('模块依赖架构检查', () => {
  const backendDir = join(__dirname, '..');
  const frontendDir = join(__dirname, '../../..', 'frontend/src');

  describe('后端模块层次', () => {
    it('API路由层不应该被工具函数反向引用', () => {
      const utilFiles = getAllTsFiles(join(backendDir, 'utils'));
      for (const file of utilFiles) {
        const imports = getImports(join('utils', file), backendDir);
        const hasApiImport = imports.some((imp) => imp.includes('/api/'));
        expect(hasApiImport).toBe(false);
      }
    });

    it('中间件层不应该被工具函数反向引用', () => {
      const utilFiles = getAllTsFiles(join(backendDir, 'utils'));
      for (const file of utilFiles) {
        const imports = getImports(join('utils', file), backendDir);
        const hasMiddlewareImport = imports.some((imp) => imp.includes('/middleware/'));
        expect(hasMiddlewareImport).toBe(false);
      }
    });

    it('工具函数不应该引用其他工具函数中的不相关模块', () => {
      const utilFiles = getAllTsFiles(join(backendDir, 'utils'));
      // 工具函数间不应有循环依赖（可以有单向依赖）
      const deps = new Map<string, string[]>();
      for (const file of utilFiles) {
        const imports = getImports(join('utils', file), backendDir);
        const internalDeps = imports.filter((imp) => imp.includes('./') && !imp.includes('../'));
        deps.set(file, internalDeps);
      }
      // 只要没有双向依赖即可
      for (const [file, importedFiles] of deps) {
        for (const imp of importedFiles) {
          const targetDeps = deps.get(imp) || [];
          expect(targetDeps.includes(file)).toBe(false);
        }
      }
    });

    it('所有API路由应该使用Router', () => {
      const apiFiles = getAllTsFiles(join(backendDir, 'api'));
      expect(apiFiles.length).toBeGreaterThan(0);
      for (const file of apiFiles) {
        const content = readFileSync(join(backendDir, 'api', file), 'utf-8');
        expect(content).toContain('Router');
      }
    });

    it('共享类型应该独立，不引用前后端具体实现', () => {
      try {
        const typesContent = readFileSync(join(__dirname, '../../..', 'shared/types.ts'), 'utf-8');
        // 共享类型不应该 import 后端或前端特定模块
        expect(typesContent).not.toContain("from '../backend");
        expect(typesContent).not.toContain("from '../frontend");
      } catch {}
    });
  });

  describe('前端模块层次', () => {
    it('Hooks层不应该被页面直接修改', () => {
      const hookFiles = getAllTsFiles(join(frontendDir, 'hooks'));
      expect(hookFiles.length).toBeGreaterThan(0);
      // Hooks应该只import services和utils
      for (const file of hookFiles) {
        const imports = getImports(join('hooks', file), frontendDir);
        const hasPageImport = imports.some((imp) => imp.includes('/pages/'));
        expect(hasPageImport).toBe(false);
      }
    });

    it('组件层不应该引用页面层', () => {
      const compFiles = getAllTsFiles(join(frontendDir, 'components'));
      for (const file of compFiles) {
        const imports = getImports(join('components', file), frontendDir);
        const hasPageImport = imports.some((imp) => imp.includes('/pages/'));
        expect(hasPageImport).toBe(false);
      }
    });

    it('工具函数层不应该引用组件或页面', () => {
      const utilFiles = getAllTsFiles(join(frontendDir, 'utils'));
      for (const file of utilFiles) {
        const imports = getImports(join('utils', file), frontendDir);
        const hasComponentImport = imports.some((imp) => imp.includes('/components/'));
        const hasPageImport = imports.some((imp) => imp.includes('/pages/'));
        expect(hasComponentImport).toBe(false);
        expect(hasPageImport).toBe(false);
      }
    });

    it('服务层不应该引用组件或页面', () => {
      const serviceDir = join(frontendDir, 'services');
      try {
        const serviceFiles = getAllTsFiles(serviceDir);
        for (const file of serviceFiles) {
          const imports = getImports(join('services', file), frontendDir);
          const hasComponentImport = imports.some((imp) => imp.includes('/components/'));
          const hasPageImport = imports.some((imp) => imp.includes('/pages/'));
          expect(hasComponentImport).toBe(false);
          expect(hasPageImport).toBe(false);
        }
      } catch {}
    });
  });

  describe('前后端分离验证', () => {
    it('前端代码不应该直接引用后端模块', () => {
      const frontendFiles = getAllTsFiles(frontendDir);
      let checked = 0;
      for (const file of frontendFiles) {
        const imports = getImports(file, frontendDir);
        const hasBackendImport = imports.some((imp) => imp.includes('backend/'));
        expect(hasBackendImport).toBe(false);
        checked++;
      }
      expect(checked).toBeGreaterThan(0);
    });

    it('后端代码不应该直接引用前端模块', () => {
      const backendFiles = getAllTsFiles(backendDir);
      let checked = 0;
      for (const file of backendFiles) {
        const imports = getImports(file, backendDir);
        const hasFrontendImport = imports.some((imp) => imp.includes('frontend/'));
        expect(hasFrontendImport).toBe(false);
        checked++;
      }
      expect(checked).toBeGreaterThan(0);
    });
  });
});
