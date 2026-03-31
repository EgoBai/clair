// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { getStockShortcutHints } from '../hooks/useStockShortcuts';

describe('getStockShortcutHints', () => {
  it('应该返回快捷键提示数组', () => {
    const hints = getStockShortcutHints();
    expect(Array.isArray(hints)).toBe(true);
    expect(hints.length).toBeGreaterThan(0);
  });

  it('每个提示应该有 keys 和 description', () => {
    const hints = getStockShortcutHints();
    for (const hint of hints) {
      expect(hint.keys).toBeDefined();
      expect(Array.isArray(hint.keys)).toBe(true);
      expect(hint.description).toBeDefined();
      expect(typeof hint.description).toBe('string');
    }
  });

  it('应该包含 j/k 上下导航', () => {
    const hints = getStockShortcutHints();
    const jk = hints.find(h => h.keys.includes('j'));
    expect(jk).toBeDefined();
    expect(jk?.description).toContain('下');

    const kj = hints.find(h => h.keys.includes('k'));
    expect(kj).toBeDefined();
    expect(kj?.description).toContain('上');
  });

  it('应该包含 Enter 查看详情', () => {
    const hints = getStockShortcutHints();
    const enter = hints.find(h => h.keys.includes('Enter'));
    expect(enter).toBeDefined();
    expect(enter?.description).toContain('详情');
  });

  it('应该包含 W 添加自选', () => {
    const hints = getStockShortcutHints();
    const w = hints.find(h => h.keys.includes('W'));
    expect(w).toBeDefined();
    expect(w?.description).toContain('自选');
  });

  it('应该包含 B 买入', () => {
    const hints = getStockShortcutHints();
    const b = hints.find(h => h.keys.includes('B'));
    expect(b).toBeDefined();
    expect(b?.description).toContain('买入');
  });

  it('应该包含 S 卖出', () => {
    const hints = getStockShortcutHints();
    const s = hints.find(h => h.keys.includes('S'));
    expect(s).toBeDefined();
    expect(s?.description).toContain('卖出');
  });

  it('应该包含 Alt+C 加入对比', () => {
    const hints = getStockShortcutHints();
    const altC = hints.find(h => h.keys.includes('Alt') && h.keys.includes('C'));
    expect(altC).toBeDefined();
    expect(altC?.description).toContain('对比');
  });
});
