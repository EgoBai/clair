import { describe, it, expect } from 'vitest';

// 无障碍引擎
interface A11yElement {
  role: string;
  label: string;
  value?: string;
  disabled?: boolean;
  required?: boolean;
  invalid?: boolean;
  describedBy?: string;
  expanded?: boolean;
  selected?: boolean;
  checked?: boolean;
  level?: number;
  posInSet?: number;
  setSize?: number;
}

interface A11yViolation {
  type: 'error' | 'warning';
  rule: string;
  message: string;
  element?: string;
}

class AccessibilityEngine {
  static validateARIA(element: A11yElement): A11yViolation[] {
    const violations: A11yViolation[] = [];
    if (!element.role) violations.push({ type: 'error', rule: 'aria-role', message: '缺少role属性' });
    if (['button', 'link', 'menuitem', 'tab', 'option'].includes(element.role) && !element.label) {
      violations.push({ type: 'error', rule: 'aria-label', message: `${element.role}需要label` });
    }
    if (element.invalid && !element.describedBy) {
      violations.push({ type: 'warning', rule: 'aria-describedby', message: 'invalid元素应有describedBy' });
    }
    if (element.role === 'textbox' && element.required && !element.label) {
      violations.push({ type: 'error', rule: 'required-label', message: '必填输入框需要label' });
    }
    return violations;
  }

  static validateHeadingHierarchy(headings: { level: number; text: string }[]): A11yViolation[] {
    const violations: A11yViolation[] = [];
    let prevLevel = 0;
    for (const h of headings) {
      if (h.level > prevLevel + 1 && prevLevel > 0) {
        violations.push({ type: 'warning', rule: 'heading-order', message: `跳过标题级别: h${prevLevel} → h${h.level}` });
      }
      if (h.level < 1 || h.level > 6) {
        violations.push({ type: 'error', rule: 'heading-level', message: `无效标题级别: h${h.level}` });
      }
      if (!h.text.trim()) {
        violations.push({ type: 'error', rule: 'heading-empty', message: '空标题' });
      }
      prevLevel = h.level;
    }
    return violations;
  }

  static calcContrastRatio(fg: string, bg: string): number {
    const lum = (hex: string) => {
      const rgb = [1, 3, 5].map(i => {
        const c = parseInt(hex.slice(i, i + 2), 16) / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
    };
    const l1 = lum(fg), l2 = lum(bg);
    const lighter = Math.max(l1, l2), darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
  }

  static checkColorContrast(fg: string, bg: string, level: 'AA' | 'AAA' = 'AA', isLargeText = false): { pass: boolean; ratio: number; required: number } {
    const ratio = this.calcContrastRatio(fg, bg);
    const required = level === 'AAA' ? (isLargeText ? 4.5 : 7) : (isLargeText ? 3 : 4.5);
    return { pass: ratio >= required, ratio, required };
  }

  static validateFormLabels(inputs: { id: string; label?: string; placeholder?: string; required?: boolean; type?: string }[]): A11yViolation[] {
    const violations: A11yViolation[] = [];
    for (const input of inputs) {
      if (!input.label && !input.placeholder) {
        violations.push({ type: 'error', rule: 'form-label', message: `输入框 ${input.id} 缺少标签` });
      }
      if (input.placeholder && !input.label) {
        violations.push({ type: 'warning', rule: 'placeholder-label', message: `输入框 ${input.id} 仅用placeholder作标签` });
      }
      if (input.type === 'password' && !input.label) {
        violations.push({ type: 'error', rule: 'password-label', message: `密码输入框 ${input.id} 必须有标签` });
      }
    }
    return violations;
  }

  static validateImageAlt(images: { src: string; alt?: string; decorative?: boolean }[]): A11yViolation[] {
    const violations: A11yViolation[] = [];
    for (const img of images) {
      if (!img.decorative && (img.alt === undefined || img.alt === null)) {
        violations.push({ type: 'error', rule: 'img-alt', message: `图片 ${img.src} 缺少alt属性` });
      }
      if (img.alt && /图片|image|photo|照片/i.test(img.alt)) {
        violations.push({ type: 'warning', rule: 'img-alt-descriptive', message: `图片 ${img.src} 的alt应更具描述性` });
      }
    }
    return violations;
  }

  static validateLinkText(links: { href: string; text: string }[]): A11yViolation[] {
    const violations: A11yViolation[] = [];
    const badTexts = ['点击这里', '这里', 'click here', 'here', '更多', 'more', '链接'];
    for (const link of links) {
      if (!link.text.trim()) {
        violations.push({ type: 'error', rule: 'link-text', message: `链接 ${link.href} 无文本` });
      } else if (badTexts.includes(link.text.toLowerCase().trim())) {
        violations.push({ type: 'warning', rule: 'link-text-descriptive', message: `链接文本 "${link.text}" 不够描述性` });
      }
    }
    return violations;
  }

  static validateTableAccessibility(table: { hasCaption: boolean; hasHeaders: boolean; headers: string[]; rows: string[][] }): A11yViolation[] {
    const violations: A11yViolation[] = [];
    if (!table.hasCaption) violations.push({ type: 'warning', rule: 'table-caption', message: '表格缺少caption' });
    if (!table.hasHeaders) violations.push({ type: 'error', rule: 'table-headers', message: '表格缺少表头' });
    if (table.headers.some(h => !h.trim())) violations.push({ type: 'error', rule: 'table-header-empty', message: '表头有空单元格' });
    for (const row of table.rows) {
      if (row.length !== table.headers.length) {
        violations.push({ type: 'error', rule: 'table-col-count', message: '行列数不匹配' });
        break;
      }
    }
    return violations;
  }

  static generateSkipLinks(headings: { level: number; text: string; id: string }[]): { href: string; label: string }[] {
    return headings.filter(h => h.level <= 2).map(h => ({
      href: `#${h.id}`,
      label: `跳转到: ${h.text}`,
    }));
  }

  static validateFocusOrder(elements: { tabIndex: number; role: string; visible: boolean }[]): A11yViolation[] {
    const violations: A11yViolation[] = [];
    const positive = elements.filter(e => e.tabIndex > 0);
    if (positive.length > 0) violations.push({ type: 'warning', rule: 'tabindex-positive', message: '避免使用正数tabIndex' });
    const invisible = elements.filter(e => e.tabIndex >= 0 && !e.visible);
    if (invisible.length > 0) violations.push({ type: 'warning', rule: 'focus-invisible', message: `${invisible.length}个可聚焦元素不可见` });
    return violations;
  }

  static suggestLandmarks(sections: { name: string; hasRole: boolean; role?: string }[]): { name: string; suggestedRole: string }[] {
    const roleMap: Record<string, string> = {
      header: 'banner', footer: 'contentinfo', nav: 'navigation',
      main: 'main', aside: 'complementary', search: 'search',
    };
    return sections.filter(s => !s.hasRole).map(s => ({
      name: s.name,
      suggestedRole: roleMap[s.name.toLowerCase()] || 'region',
    }));
  }

  static validateLiveRegions(regions: { role?: string; ariaLive?: string; content: string }[]): A11yViolation[] {
    const violations: A11yViolation[] = [];
    for (const r of regions) {
      if (r.content && !r.ariaLive && !r.role) {
        violations.push({ type: 'warning', rule: 'live-region', message: `动态内容应有aria-live属性` });
      }
    }
    return violations;
  }

  static scoreAccessibility(violations: A11yViolation[]): { score: number; grade: string; errors: number; warnings: number } {
    const errors = violations.filter(v => v.type === 'error').length;
    const warnings = violations.filter(v => v.type === 'warning').length;
    const score = Math.max(0, 100 - errors * 15 - warnings * 5);
    const grade = score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : 'D';
    return { score, grade, errors, warnings };
  }
}

describe('无障碍引擎', () => {
  describe('ARIA验证', () => {
    it('应该验证有效的ARIA元素', () => {
      expect(AccessibilityEngine.validateARIA({ role: 'button', label: '提交' })).toHaveLength(0);
    });

    it('应该检测缺少role', () => {
      const v = AccessibilityEngine.validateARIA({ role: '', label: '' });
      expect(v.some(e => e.rule === 'aria-role')).toBe(true);
    });

    it('应该检测缺少label', () => {
      const v = AccessibilityEngine.validateARIA({ role: 'button', label: '' });
      expect(v.some(e => e.rule === 'aria-label')).toBe(true);
    });

    it('应该检测invalid缺少describedBy', () => {
      const v = AccessibilityEngine.validateARIA({ role: 'textbox', label: 'test', invalid: true });
      expect(v.some(e => e.rule === 'aria-describedby')).toBe(true);
    });
  });

  describe('标题层级', () => {
    it('应该通过正确的标题层级', () => {
      const v = AccessibilityEngine.validateHeadingHierarchy([
        { level: 1, text: '标题' }, { level: 2, text: '子标题' }, { level: 3, text: '三级' },
      ]);
      expect(v).toHaveLength(0);
    });

    it('应该检测跳级', () => {
      const v = AccessibilityEngine.validateHeadingHierarchy([
        { level: 1, text: '标题' }, { level: 3, text: '跳级' },
      ]);
      expect(v.some(e => e.rule === 'heading-order')).toBe(true);
    });

    it('应该检测空标题', () => {
      const v = AccessibilityEngine.validateHeadingHierarchy([{ level: 1, text: '' }]);
      expect(v.some(e => e.rule === 'heading-empty')).toBe(true);
    });

    it('应该检测无效级别', () => {
      const v = AccessibilityEngine.validateHeadingHierarchy([{ level: 7, text: '错误' }]);
      expect(v.some(e => e.rule === 'heading-level')).toBe(true);
    });
  });

  describe('颜色对比度', () => {
    it('黑白应该通过AA标准', () => {
      const r = AccessibilityEngine.checkColorContrast('#000000', '#ffffff', 'AA');
      expect(r.pass).toBe(true);
    });

    it('浅灰白应该不通过AAA标准', () => {
      const r = AccessibilityEngine.checkColorContrast('#cccccc', '#ffffff', 'AAA');
      expect(r.pass).toBe(false);
    });
  });

  describe('表单标签', () => {
    it('应该通过有标签的表单', () => {
      expect(AccessibilityEngine.validateFormLabels([{ id: '1', label: '姓名' }])).toHaveLength(0);
    });

    it('应该检测缺少标签', () => {
      const v = AccessibilityEngine.validateFormLabels([{ id: '1' }]);
      expect(v.some(e => e.rule === 'form-label')).toBe(true);
    });

    it('应该检测密码输入框缺少标签', () => {
      const v = AccessibilityEngine.validateFormLabels([{ id: '1', type: 'password' }]);
      expect(v.some(e => e.rule === 'password-label')).toBe(true);
    });
  });

  describe('图片alt', () => {
    it('应该通过有alt的图片', () => {
      expect(AccessibilityEngine.validateImageAlt([{ src: 'a.jpg', alt: '产品展示' }])).toHaveLength(0);
    });

    it('应该检测缺少alt', () => {
      const v = AccessibilityEngine.validateImageAlt([{ src: 'a.jpg' }]);
      expect(v.some(e => e.rule === 'img-alt')).toBe(true);
    });

    it('应该放过装饰性图片', () => {
      expect(AccessibilityEngine.validateImageAlt([{ src: 'decorative.jpg', decorative: true }])).toHaveLength(0);
    });
  });

  describe('链接文本', () => {
    it('应该通过描述性链接', () => {
      expect(AccessibilityEngine.validateLinkText([{ href: '#', text: '查看详情' }])).toHaveLength(0);
    });

    it('应该检测"点击这里"', () => {
      const v = AccessibilityEngine.validateLinkText([{ href: '#', text: '点击这里' }]);
      expect(v.some(e => e.rule === 'link-text-descriptive')).toBe(true);
    });

    it('应该检测空链接', () => {
      const v = AccessibilityEngine.validateLinkText([{ href: '#', text: '' }]);
      expect(v.some(e => e.rule === 'link-text')).toBe(true);
    });
  });

  describe('表格无障碍', () => {
    it('应该通过完整的表格', () => {
      expect(AccessibilityEngine.validateTableAccessibility({
        hasCaption: true, hasHeaders: true, headers: ['A', 'B'], rows: [['1', '2']],
      })).toHaveLength(0);
    });

    it('应该检测缺少caption', () => {
      const v = AccessibilityEngine.validateTableAccessibility({
        hasCaption: false, hasHeaders: true, headers: ['A'], rows: [],
      });
      expect(v.some(e => e.rule === 'table-caption')).toBe(true);
    });
  });

  describe('跳过链接', () => {
    it('应该生成跳过链接', () => {
      const links = AccessibilityEngine.generateSkipLinks([
        { level: 1, text: '主标题', id: 'main' },
        { level: 2, text: '导航', id: 'nav' },
        { level: 3, text: '细节', id: 'detail' },
      ]);
      expect(links).toHaveLength(2);
      expect(links[0].href).toBe('#main');
    });
  });

  describe('焦点顺序', () => {
    it('应该检测正数tabIndex', () => {
      const v = AccessibilityEngine.validateFocusOrder([
        { tabIndex: 5, role: 'button', visible: true },
      ]);
      expect(v.some(e => e.rule === 'tabindex-positive')).toBe(true);
    });
  });

  describe('地标建议', () => {
    it('应该建议地标角色', () => {
      const suggestions = AccessibilityEngine.suggestLandmarks([
        { name: 'header', hasRole: false },
        { name: 'nav', hasRole: true, role: 'navigation' },
      ]);
      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].suggestedRole).toBe('banner');
    });
  });

  describe('无障碍评分', () => {
    it('应该给满分', () => {
      const s = AccessibilityEngine.scoreAccessibility([]);
      expect(s.grade).toBe('A');
      expect(s.score).toBe(100);
    });

    it('应该扣分', () => {
      const s = AccessibilityEngine.scoreAccessibility([
        { type: 'error', rule: 'test', message: 'err' },
        { type: 'warning', rule: 'test', message: 'warn' },
      ]);
      expect(s.score).toBeLessThan(100);
      expect(s.errors).toBe(1);
      expect(s.warnings).toBe(1);
    });
  });
});
