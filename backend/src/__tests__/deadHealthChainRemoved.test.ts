/**
 * 台账 #38 · 死 health 链清理守卫（删除 ≠ 回归：防止被「补回来」）
 *
 * 事实（2026-11-04 复核，rg 全仓证据）：
 *   - backend/src/api/health.ts      只有自身 test 动态 import，全仓无 app.use 挂载 → 从未对外提供过 /health
 *   - backend/src/services/healthCheck.ts 只被 backend/src/api/health.ts import
 *   - 真实 /health 是 backend/src/app.ts:372 的内联 handler（Render render.yaml healthCheckPath 打的就是它）
 * 保留这两个文件会让读者以为「/api/health 是个真端点」，并让 health 测试覆盖一个没人挂载的假对象。
 * 裁决：删除。本测试是这条清理的机器判据 —— 文件复活 / 被再次 import 即红。
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const SRC_DIR = join(__dirname, '..');

/** 两个已删除的死文件（相对 backend/src） */
const DEAD_FILES = ['api/health.ts', 'services/healthCheck.ts'];

/** 递归列出 backend/src 下的生产 ts（跳过 node_modules 与 __tests__） */
function getAllTsFiles(dir: string, base = ''): string[] {
  const files: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return files;
  }
  for (const entry of entries) {
    if (entry === 'node_modules' || entry === '__tests__' || entry.startsWith('.')) continue;
    const fullPath = join(dir, entry);
    const relPath = base ? `${base}/${entry}` : entry;
    try {
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        files.push(...getAllTsFiles(fullPath, relPath));
      } else if (
        /\.(ts|tsx)$/.test(entry) &&
        !entry.endsWith('.d.ts') &&
        !entry.endsWith('.test.ts') &&
        !entry.endsWith('.test.tsx')
      ) {
        files.push(relPath);
      }
    } catch {
      // 读不到就跳过（权限/竞态），不让守卫本身成为 flaky
    }
  }
  return files;
}

describe('#38 · 死 health 链已清理且不得复活', () => {
  it('api/health.ts 与 services/healthCheck.ts 必须已删除', () => {
    for (const rel of DEAD_FILES) {
      expect(existsSync(join(SRC_DIR, rel)), `${rel} 仍在：零引用死代码，会误导读者并制造假覆盖`).toBe(false);
    }
  });

  it('backend/src 生产代码不得再 import 这两个模块', () => {
    const importRe = /(?:from|require\()\s*['"][^'"]*(?:api\/health|services\/healthCheck)['"]/;
    const offenders: string[] = [];
    for (const rel of getAllTsFiles(SRC_DIR)) {
      let src: string;
      try {
        src = readFileSync(join(SRC_DIR, rel), 'utf-8');
      } catch {
        continue;
      }
      // 去掉注释，避免历史注释里的提及被误判成 import
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
      if (importRe.test(code)) offenders.push(rel);
    }
    expect(offenders, `以下文件仍在 import 已删除的死 health 链：${offenders.join(', ')}`).toEqual([]);
  });

  it('真实 /health 仍由 app.ts 内联 handler 提供（清理不得误伤真源）', () => {
    const appSrc = readFileSync(join(SRC_DIR, 'app.ts'), 'utf-8');
    expect(appSrc).toMatch(/app\.get\(\s*['"]\/health['"]/);
    // 诚实降级契约的唯一真源仍在使用
    expect(appSrc).toContain('deriveHealthContract');
  });
});
