import { describe, it, expect } from 'vitest';
import {
  createAriaAttributes,
  generateAriaId,
  createLabelAssociation,
  createDescriptionAssociation,
  parseColor,
  relativeLuminance,
  calculateContrastRatio,
  checkColorContrast,
  suggestContrastFix,
  createKeyboardMap,
  normalizeKey,
  matchKeyEvent,
  formatShortcutHelp,
  createAnnouncement,
  formatTableForScreenReader,
  formatListForScreenReader,
  auditAccessibility,
  type KeyboardShortcut,
} from '../utils/a11yEngine';

// ==================== ARIA辅助测试 ====================

describe('createAriaAttributes', () => {
  it('应生成正确的ARIA属性', () => {
    const attrs = createAriaAttributes({
      role: 'button',
      label: '关闭',
      expanded: true,
      disabled: false,
    });
    expect(attrs['role']).toBe('button');
    expect(attrs['aria-label']).toBe('关闭');
    expect(attrs['aria-expanded']).toBe(true);
  });

  it('undefined值不应包含', () => {
    const attrs = createAriaAttributes({ role: 'button' });
    expect(attrs['aria-label']).toBeUndefined();
  });

  it('应处理所有属性类型', () => {
    const attrs = createAriaAttributes({
      hidden: true,
      checked: 'mixed',
      live: 'polite',
      current: 'page',
      level: 2,
      valueMin: 0,
      valueMax: 100,
      valueNow: 50,
      valueText: '50%',
    });
    expect(attrs['aria-hidden']).toBe(true);
    expect(attrs['aria-checked']).toBe('mixed');
    expect(attrs['aria-live']).toBe('polite');
    expect(attrs['aria-current']).toBe('page');
    expect(attrs['aria-level']).toBe(2);
    expect(attrs['aria-valuemin']).toBe(0);
    expect(attrs['aria-valuemax']).toBe(100);
    expect(attrs['aria-valuenow']).toBe(50);
    expect(attrs['aria-valuetext']).toBe('50%');
  });
});

describe('generateAriaId', () => {
  it('应生成唯一ID', () => {
    const id1 = generateAriaId();
    const id2 = generateAriaId();
    expect(id1).not.toBe(id2);
  });

  it('应有前缀', () => {
    const id = generateAriaId('input');
    expect(id.startsWith('input-')).toBe(true);
  });

  it('默认前缀应为aria', () => {
    const id = generateAriaId();
    expect(id.startsWith('aria-')).toBe(true);
  });
});

describe('createLabelAssociation', () => {
  it('应创建关联', () => {
    const assoc = createLabelAssociation('email', 'email-label');
    expect(assoc.input['aria-labelledby']).toBe('email-label');
    expect(assoc.input.id).toBe('email');
    expect(assoc.label.for).toBe('email');
    expect(assoc.label.id).toBe('email-label');
  });
});

describe('createDescriptionAssociation', () => {
  it('应创建描述关联', () => {
    const assoc = createDescriptionAssociation('pwd', 'pwd-hint');
    expect(assoc.input['aria-describedby']).toBe('pwd-hint');
    expect(assoc.desc.id).toBe('pwd-hint');
  });
});

// ==================== 色彩对比度测试 ====================

describe('parseColor', () => {
  it('应解析6位hex', () => {
    const result = parseColor('#ff0000');
    expect(result).toEqual({ r: 255, g: 0, b: 0 });
  });

  it('应解析无#的hex', () => {
    expect(parseColor('00ff00')).toEqual({ r: 0, g: 255, b: 0 });
  });

  it('应解析3位hex', () => {
    expect(parseColor('#f00')).toEqual({ r: 255, g: 0, b: 0 });
  });

  it('应解析rgb()', () => {
    expect(parseColor('rgb(128, 64, 32)')).toEqual({ r: 128, g: 64, b: 32 });
  });

  it('无效颜色应返回null', () => {
    expect(parseColor('not-a-color')).toBeNull();
  });
});

describe('relativeLuminance', () => {
  it('白色应为1', () => {
    expect(relativeLuminance(255, 255, 255)).toBeCloseTo(1, 2);
  });

  it('黑色应接近0', () => {
    expect(relativeLuminance(0, 0, 0)).toBeCloseTo(0, 2);
  });

  it('亮度应在0-1之间', () => {
    const lum = relativeLuminance(128, 128, 128);
    expect(lum).toBeGreaterThan(0);
    expect(lum).toBeLessThan(1);
  });
});

describe('calculateContrastRatio', () => {
  it('黑白应有最大对比度', () => {
    const ratio = calculateContrastRatio('#000000', '#ffffff');
    expect(ratio).toBeGreaterThan(20);
  });

  it('相同颜色应为1:1', () => {
    const ratio = calculateContrastRatio('#808080', '#808080');
    expect(ratio).toBe(1);
  });

  it('无效颜色应返回0', () => {
    expect(calculateContrastRatio('invalid', '#fff')).toBe(0);
  });
});

describe('checkColorContrast', () => {
  it('黑白应通过所有WCAG标准', () => {
    const result = checkColorContrast('#000000', '#ffffff');
    expect(result.passes.AA_normal).toBe(true);
    expect(result.passes.AA_large).toBe(true);
    expect(result.passes.AAA_normal).toBe(true);
    expect(result.passes.AAA_large).toBe(true);
  });

  it('浅灰白应不通过AA普通', () => {
    const result = checkColorContrast('#cccccc', '#ffffff');
    expect(result.passes.AA_normal).toBe(false);
  });

  it('应返回正确的比率', () => {
    const result = checkColorContrast('#333333', '#ffffff');
    expect(result.ratio).toBeGreaterThan(1);
  });
});

describe('suggestContrastFix', () => {
  it('应返回建议颜色', () => {
    const fix = suggestContrastFix('#cccccc', '#ffffff', 4.5);
    if (fix) {
      expect(fix.startsWith('#')).toBe(true);
      const result = checkColorContrast(fix, '#ffffff');
      expect(result.ratio).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('无效颜色应返回null', () => {
    expect(suggestContrastFix('invalid', '#fff')).toBeNull();
  });
});

// ==================== 键盘导航测试 ====================

describe('normalizeKey', () => {
  it('应规范化按键', () => {
    expect(normalizeKey({ key: 'a', action: '', description: '' })).toBe('a');
    expect(normalizeKey({ key: 'Enter', action: '', description: '' })).toBe('enter');
  });

  it('应包含修饰键', () => {
    expect(normalizeKey({
      key: 's', modifiers: ['ctrl'], action: '', description: '',
    })).toBe('ctrl+s');
    expect(normalizeKey({
      key: 'z', modifiers: ['ctrl', 'shift'], action: '', description: '',
    })).toBe('ctrl+shift+z');
  });
});

describe('createKeyboardMap', () => {
  it('应创建快捷键映射', () => {
    const shortcuts: KeyboardShortcut[] = [
      { key: 's', modifiers: ['ctrl'], action: 'save', description: '保存' },
      { key: 'z', modifiers: ['ctrl'], action: 'undo', description: '撤销' },
    ];
    const map = createKeyboardMap(shortcuts);
    expect(map.get('ctrl+s')?.action).toBe('save');
    expect(map.get('ctrl+z')?.action).toBe('undo');
  });
});

describe('matchKeyEvent', () => {
  it('应匹配正确事件', () => {
    const shortcut: KeyboardShortcut = {
      key: 's', modifiers: ['ctrl'], action: 'save', description: '保存',
    };
    expect(matchKeyEvent(
      { key: 's', ctrlKey: true, altKey: false, shiftKey: false, metaKey: false },
      shortcut,
    )).toBe(true);
  });

  it('不匹配的修饰键应失败', () => {
    const shortcut: KeyboardShortcut = {
      key: 's', modifiers: ['ctrl'], action: 'save', description: '保存',
    };
    expect(matchKeyEvent(
      { key: 's', ctrlKey: false, altKey: false, shiftKey: false, metaKey: false },
      shortcut,
    )).toBe(false);
  });

  it('大小写不敏感', () => {
    const shortcut: KeyboardShortcut = { key: 'A', action: '', description: '' };
    expect(matchKeyEvent(
      { key: 'a', ctrlKey: false, altKey: false, shiftKey: false, metaKey: false },
      shortcut,
    )).toBe(true);
  });
});

describe('formatShortcutHelp', () => {
  it('应格式化帮助文本', () => {
    const shortcuts: KeyboardShortcut[] = [
      { key: 's', modifiers: ['ctrl'], action: 'save', description: '保存' },
      { key: 'Enter', action: 'submit', description: '提交' },
    ];
    const help = formatShortcutHelp(shortcuts);
    expect(help.length).toBe(2);
    expect(help[0].keys).toContain('Ctrl');
    expect(help[0].description).toBe('保存');
    expect(help[1].keys).toContain('ENTER');
  });
});

// ==================== 屏幕阅读器测试 ====================

describe('createAnnouncement', () => {
  it('应创建公告', () => {
    const ann = createAnnouncement('加载完成', 'polite');
    expect(ann.message).toBe('加载完成');
    expect(ann.priority).toBe('polite');
    expect(ann.timestamp).toBeGreaterThan(0);
  });

  it('默认优先级应为polite', () => {
    const ann = createAnnouncement('test');
    expect(ann.priority).toBe('polite');
  });
});

describe('formatTableForScreenReader', () => {
  it('应格式化表格', () => {
    const text = formatTableForScreenReader(
      ['名称', '价格'],
      [['茅台', '1800'], ['平安', '45']],
      '股票列表',
    );
    expect(text).toContain('股票列表');
    expect(text).toContain('2列');
    expect(text).toContain('2行');
    expect(text).toContain('茅台');
  });
});

describe('formatListForScreenReader', () => {
  it('应格式化列表', () => {
    const text = formatListForScreenReader(['苹果', '香蕉', '橙子']);
    expect(text).toContain('无序列表');
    expect(text).toContain('3项');
    expect(text).toContain('苹果');
  });

  it('有序列表应正确', () => {
    const text = formatListForScreenReader(['第一步', '第二步'], true);
    expect(text).toContain('有序列表');
  });
});

// ==================== 无障碍审计测试 ====================

describe('auditAccessibility', () => {
  it('应返回审计结果', () => {
    const result = auditAccessibility();
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.checks.length).toBeGreaterThan(0);
  });

  it('每个检查应有正确结构', () => {
    const result = auditAccessibility();
    result.checks.forEach(c => {
      expect(typeof c.name).toBe('string');
      expect(typeof c.passed).toBe('boolean');
      expect(typeof c.message).toBe('string');
    });
  });

  it('黑白配色应通过', () => {
    const result = auditAccessibility();
    const bwCheck = result.checks.find(c => c.name.includes('深色文字'));
    if (bwCheck) {
      expect(bwCheck.passed).toBe(true);
    }
  });
});
