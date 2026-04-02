/**
 * CI/CD Pipeline配置验证 - Round 183
 * 覆盖：GitHub Actions配置、Docker配置、环境变量管理
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// ROOT 指向项目根目录 (vitest 从 backend/ 运行, 需上溯一级)
const ROOT = join(process.cwd(), '..');

describe('CI/CD Pipeline验证', () => {
  describe('GitHub Actions', () => {
    const workflowDir = join(ROOT, '.github/workflows');

    it('应有workflow目录', () => {
      expect(existsSync(workflowDir)).toBe(true);
    });

    it('应有CI workflow文件', () => {
      if (!existsSync(workflowDir)) return;
      const files = require('fs').readdirSync(workflowDir).filter((f: string) => f.endsWith('.yml') || f.endsWith('.yaml'));
      expect(files.length).toBeGreaterThan(0);
    });
  });

  describe('Docker配置', () => {
    it('应有docker-compose.yml', () => {
      expect(existsSync(join(ROOT, 'docker-compose.yml'))).toBe(true);
    });

    it('docker-compose应定义服务', () => {
      const dcPath = join(ROOT, 'docker-compose.yml');
      if (!existsSync(dcPath)) return;
      const content = readFileSync(dcPath, 'utf-8');
      expect(content).toContain('services:');
    });

    it('docker-compose应有数据库服务', () => {
      const dcPath = join(ROOT, 'docker-compose.yml');
      if (!existsSync(dcPath)) return;
      const content = readFileSync(dcPath, 'utf-8');
      expect(content).toMatch(/postgres|mysql|mongodb/i);
    });
  });

  describe('项目配置完整性', () => {
    it('应有package.json', () => {
      expect(existsSync(join(ROOT, 'package.json'))).toBe(true);
    });

    it('应有vitest配置', () => {
      const hasVitestConfig = existsSync(join(ROOT, 'vitest.config.ts'))
        || existsSync(join(ROOT, 'vitest.config.js'));
      expect(hasVitestConfig).toBe(true);
    });

    it('应有.gitignore', () => {
      expect(existsSync(join(ROOT, '.gitignore'))).toBe(true);
    });

    it('.gitignore应包含node_modules', () => {
      const gi = readFileSync(join(ROOT, '.gitignore'), 'utf-8');
      expect(gi).toContain('node_modules');
    });

    it('.gitignore应包含.env', () => {
      const gi = readFileSync(join(ROOT, '.gitignore'), 'utf-8');
      expect(gi).toContain('.env');
    });
  });

  describe('后端配置', () => {
    it('应有TypeScript配置', () => {
      expect(existsSync(join(ROOT, 'backend/tsconfig.json'))).toBe(true);
    });

    it('应有app入口文件', () => {
      const hasApp = existsSync(join(ROOT, 'backend/src/app.ts'))
        || existsSync(join(ROOT, 'backend/src/index.ts'));
      expect(hasApp).toBe(true);
    });

    it('应有middleware目录', () => {
      expect(existsSync(join(ROOT, 'backend/src/middleware'))).toBe(true);
    });

    it('应有api目录', () => {
      expect(existsSync(join(ROOT, 'backend/src/api'))).toBe(true);
    });
  });

  describe('前端配置', () => {
    it('应有vite配置', () => {
      const hasVite = existsSync(join(ROOT, 'frontend/vite.config.ts'))
        || existsSync(join(ROOT, 'frontend/vite.config.js'));
      expect(hasVite).toBe(true);
    });

    it('应有main入口', () => {
      const hasMain = existsSync(join(ROOT, 'frontend/src/main.tsx'))
        || existsSync(join(ROOT, 'frontend/src/main.ts'));
      expect(hasMain).toBe(true);
    });

    it('应有App组件', () => {
      expect(existsSync(join(ROOT, 'frontend/src/App.tsx'))).toBe(true);
    });
  });

  describe('代码质量工具', () => {
    it('应有prettier配置', () => {
      const hasPrettier = existsSync(join(ROOT, '.prettierrc'))
        || existsSync(join(ROOT, '.prettierrc.json'))
        || existsSync(join(ROOT, 'prettier.config.js'));
      expect(hasPrettier).toBe(true);
    });

    it('应有husky配置', () => {
      expect(existsSync(join(ROOT, '.husky'))).toBe(true);
    });

    it('应有lint-staged配置', () => {
      expect(existsSync(join(ROOT, '.lintstagedrc.json'))).toBe(true);
    });
  });
});
