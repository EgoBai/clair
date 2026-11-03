/**
 * 死代码 / 遗留物隔离守卫
 *
 * 背景（2026-11 两次追溯事故的产物）：
 *
 * 1. `services/quantFactorEngine.ts`（20+ 因子、502 行）**零生产调用方**，
 *    真正对外供数的是 `services/factorEngine.ts`。两套因子定义并存时，
 *    下一个人很容易以为前者在线，照着它写文案/改口径 —— 本月的 net_margin
 *    「净利率」口径事故就是这么来的。
 *    裁决：**不删、不接**（删了要重写，接了会形成两套 IC 口径），改为「显式隔离」：
 *    生产代码一旦引用它，本测试立刻红 → 逼引用者先对齐口径、再删断言、留痕。
 *
 * 2. `financial_indicators` 表只有 DDL、**TS 代码零读写**（财务数据实时走
 *    financialsDataService，东财直连）。列名 `net_margin` 存在会持续诱导
 *    「仓库里存着净利率」的误判。裁决：不动 schema 结构，只做标注 + 守卫。
 *
 * 两个 needle 都用字符串拼接构造，避免本文件自身命中（即便将来排除规则变化）。
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const SRC_DIR = join(__dirname, '..');

/** 扫描 backend/src 下的 ts/tsx（跳过 node_modules 与 __tests__） */
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

/** 拼接构造 needle：保证本文件文本里不出现完整关键字 */
const ENGINE_NEEDLE = 'quant' + 'FactorEngine';
const LEGACY_TABLE_NEEDLE = 'financial' + '_indicators';
/** 被判定为「隔离对象自身」的文件：它的自述注释里必然出现自己的名字 */
const ENGINE_SELF = ['services', ENGINE_NEEDLE + '.ts'].join('/');

function filesContaining(needle: string): string[] {
  return getAllTsFiles(SRC_DIR).filter((rel) => {
    try {
      return readFileSync(join(SRC_DIR, rel), 'utf-8').includes(needle);
    } catch {
      return false;
    }
  });
}

describe('死代码隔离守卫', () => {
  it('扫描器可用（防止因路径/权限问题空集合导致守卫假绿）', () => {
    const files = getAllTsFiles(SRC_DIR);
    expect(files.length).toBeGreaterThan(100);
    expect(files).toContain(ENGINE_SELF);
  });

  it('quantFactorEngine 不得被生产代码引用（只有它自己和 __tests__ 可以）', () => {
    const offenders = filesContaining(ENGINE_NEEDLE).filter((f) => f !== ENGINE_SELF);
    // 红了怎么办：说明你把它接进生产了。正确顺序是
    //   1) 先与 services/factorEngine.ts 对齐因子定义/标准化/中性化/IC 窗口；
    //   2) 在 commit message 写清对齐结论；
    //   3) 再删掉这条断言。
    expect(offenders).toEqual([]);
  });

  it('financial_indicators 遗留表不得在 TS 代码里出现（DDL 之外零引用）', () => {
    const offenders = filesContaining(LEGACY_TABLE_NEEDLE);
    // 红了怎么办：说明有代码开始读写这张从未被写入的表。先确认口径与写入方，
    // 连同 db/schema.sql 的「历史遗留」注释一起更新，再删掉这条断言。
    expect(offenders).toEqual([]);
  });
});
