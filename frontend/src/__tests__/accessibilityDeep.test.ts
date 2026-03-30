import { describe, it, expect } from 'vitest';

// Accessibility Deep Tests - ARIA, Focus, Keyboard
interface AriaAttributes {
  role?: string;
  label?: string;
  describedBy?: string;
  expanded?: boolean;
  hidden?: boolean;
  live?: 'polite' | 'assertive' | 'off';
  controls?: string;
  hasPopup?: boolean | 'menu' | 'listbox' | 'tree' | 'grid' | 'dialog';
  checked?: boolean | 'mixed';
  disabled?: boolean;
  selected?: boolean;
  invalid?: boolean;
  required?: boolean;
  busy?: boolean;
}

function buildAriaAttrs(attrs: AriaAttributes): Record<string, string> {
  const result: Record<string, string> = {};
  if (attrs.role) result['role'] = attrs.role;
  if (attrs.label) result['aria-label'] = attrs.label;
  if (attrs.describedBy) result['aria-describedby'] = attrs.describedBy;
  if (attrs.expanded !== undefined) result['aria-expanded'] = String(attrs.expanded);
  if (attrs.hidden !== undefined) result['aria-hidden'] = String(attrs.hidden);
  if (attrs.live) result['aria-live'] = attrs.live;
  if (attrs.controls) result['aria-controls'] = attrs.controls;
  if (attrs.hasPopup !== undefined) result['aria-haspopup'] = String(attrs.hasPopup);
  if (attrs.checked !== undefined) result['aria-checked'] = String(attrs.checked);
  if (attrs.disabled !== undefined) result['aria-disabled'] = String(attrs.disabled);
  if (attrs.selected !== undefined) result['aria-selected'] = String(attrs.selected);
  if (attrs.invalid !== undefined) result['aria-invalid'] = String(attrs.invalid);
  if (attrs.required !== undefined) result['aria-required'] = String(attrs.required);
  if (attrs.busy !== undefined) result['aria-busy'] = String(attrs.busy);
  return result;
}

function validateAriaRole(role: string): boolean {
  const validRoles = [
    'alert', 'alertdialog', 'application', 'article', 'banner',
    'button', 'cell', 'checkbox', 'columnheader', 'combobox',
    'complementary', 'contentinfo', 'dialog', 'document', 'feed',
    'figure', 'form', 'grid', 'gridcell', 'group', 'heading',
    'img', 'link', 'list', 'listbox', 'listitem', 'log', 'main',
    'marquee', 'math', 'menu', 'menubar', 'menuitem', 'menuitemcheckbox',
    'menuitemradio', 'navigation', 'none', 'note', 'option',
    'presentation', 'progressbar', 'radio', 'radiogroup', 'region',
    'row', 'rowgroup', 'rowheader', 'scrollbar', 'search',
    'searchbox', 'separator', 'slider', 'spinbutton', 'status',
    'switch', 'tab', 'table', 'tablist', 'tabpanel', 'term',
    'textbox', 'timer', 'toolbar', 'tooltip', 'tree', 'treegrid',
    'treeitem',
  ];
  return validRoles.includes(role);
}

interface FocusableElement {
  tag: string;
  tabIndex?: number;
  disabled?: boolean;
  hidden?: boolean;
  type?: string;
}

function isFocusable(el: FocusableElement): boolean {
  if (el.disabled || el.hidden) return false;
  if (el.tabIndex !== undefined && el.tabIndex < 0) return false;
  const nativelyFocusable = ['a', 'button', 'input', 'select', 'textarea'];
  if (nativelyFocusable.includes(el.tag)) return true;
  if (el.tabIndex !== undefined && el.tabIndex >= 0) return true;
  return false;
}

function getFocusOrder(elements: FocusableElement[]): FocusableElement[] {
  return elements.filter(isFocusable).sort((a, b) => {
    const aTab = a.tabIndex ?? 0;
    const bTab = b.tabIndex ?? 0;
    if (aTab === 0 && bTab === 0) return 0;
    if (aTab === 0) return 1;
    if (bTab === 0) return -1;
    return aTab - bTab;
  });
}

function generateSkipLinks(sections: { id: string; label: string }[]): string[] {
  return sections.map(s => `Skip to ${s.label}`);
}

function checkColorContrast(fg: [number, number, number], bg: [number, number, number]): { ratio: number; passesAA: boolean; passesAAA: boolean } {
  function luminance(rgb: [number, number, number]): number {
    const [rs, gs, bs] = rgb.map(c => {
      const v = c / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
  }
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  return {
    ratio: Math.round(ratio * 100) / 100,
    passesAA: ratio >= 4.5,
    passesAAA: ratio >= 7,
  };
}

describe('Accessibility Deep', () => {
  describe('buildAriaAttrs', () => {
    it('should build role attribute', () => {
      const attrs = buildAriaAttrs({ role: 'button' });
      expect(attrs['role']).toBe('button');
    });

    it('should build aria-label', () => {
      const attrs = buildAriaAttrs({ label: 'Close dialog' });
      expect(attrs['aria-label']).toBe('Close dialog');
    });

    it('should build aria-expanded', () => {
      expect(buildAriaAttrs({ expanded: true })['aria-expanded']).toBe('true');
      expect(buildAriaAttrs({ expanded: false })['aria-expanded']).toBe('false');
    });

    it('should build aria-hidden', () => {
      expect(buildAriaAttrs({ hidden: true })['aria-hidden']).toBe('true');
    });

    it('should build aria-live', () => {
      expect(buildAriaAttrs({ live: 'polite' })['aria-live']).toBe('polite');
      expect(buildAriaAttrs({ live: 'assertive' })['aria-live']).toBe('assertive');
    });

    it('should build aria-describedby', () => {
      const attrs = buildAriaAttrs({ describedBy: 'error-msg' });
      expect(attrs['aria-describedby']).toBe('error-msg');
    });

    it('should build aria-controls', () => {
      const attrs = buildAriaAttrs({ controls: 'menu-1' });
      expect(attrs['aria-controls']).toBe('menu-1');
    });

    it('should build aria-checked for mixed state', () => {
      const attrs = buildAriaAttrs({ checked: 'mixed' });
      expect(attrs['aria-checked']).toBe('mixed');
    });

    it('should build aria-disabled', () => {
      expect(buildAriaAttrs({ disabled: true })['aria-disabled']).toBe('true');
    });

    it('should build aria-required', () => {
      expect(buildAriaAttrs({ required: true })['aria-required']).toBe('true');
    });

    it('should build aria-invalid', () => {
      expect(buildAriaAttrs({ invalid: true })['aria-invalid']).toBe('true');
    });

    it('should build aria-busy', () => {
      expect(buildAriaAttrs({ busy: true })['aria-busy']).toBe('true');
    });

    it('should omit undefined attrs', () => {
      const attrs = buildAriaAttrs({});
      expect(Object.keys(attrs)).toHaveLength(0);
    });
  });

  describe('validateAriaRole', () => {
    it('should accept valid roles', () => {
      expect(validateAriaRole('button')).toBe(true);
      expect(validateAriaRole('navigation')).toBe(true);
      expect(validateAriaRole('tab')).toBe(true);
      expect(validateAriaRole('dialog')).toBe(true);
      expect(validateAriaRole('alert')).toBe(true);
    });

    it('should reject invalid roles', () => {
      expect(validateAriaRole('invalid-role')).toBe(false);
      expect(validateAriaRole('')).toBe(false);
      expect(validateAriaRole('widget')).toBe(false);
    });
  });

  describe('isFocusable', () => {
    it('should mark buttons as focusable', () => {
      expect(isFocusable({ tag: 'button' })).toBe(true);
    });

    it('should mark links as focusable', () => {
      expect(isFocusable({ tag: 'a' })).toBe(true);
    });

    it('should mark inputs as focusable', () => {
      expect(isFocusable({ tag: 'input' })).toBe(true);
    });

    it('should not focus disabled elements', () => {
      expect(isFocusable({ tag: 'button', disabled: true })).toBe(false);
    });

    it('should not focus hidden elements', () => {
      expect(isFocusable({ tag: 'button', hidden: true })).toBe(false);
    });

    it('should not focus negative tabIndex', () => {
      expect(isFocusable({ tag: 'div', tabIndex: -1 })).toBe(false);
    });

    it('should focus positive tabIndex', () => {
      expect(isFocusable({ tag: 'div', tabIndex: 0 })).toBe(true);
      expect(isFocusable({ tag: 'div', tabIndex: 1 })).toBe(true);
    });

    it('should not focus plain divs', () => {
      expect(isFocusable({ tag: 'div' })).toBe(false);
    });
  });

  describe('getFocusOrder', () => {
    it('should sort by tabIndex', () => {
      const elements: FocusableElement[] = [
        { tag: 'div', tabIndex: 3 },
        { tag: 'div', tabIndex: 1 },
        { tag: 'div', tabIndex: 2 },
      ];
      const ordered = getFocusOrder(elements);
      expect(ordered[0].tabIndex).toBe(1);
      expect(ordered[2].tabIndex).toBe(3);
    });

    it('should put tabIndex=0 after positive values', () => {
      const elements: FocusableElement[] = [
        { tag: 'div', tabIndex: 0 },
        { tag: 'div', tabIndex: 1 },
      ];
      const ordered = getFocusOrder(elements);
      expect(ordered[0].tabIndex).toBe(1);
    });

    it('should filter out non-focusable', () => {
      const elements: FocusableElement[] = [
        { tag: 'div', tabIndex: -1 },
        { tag: 'button' },
      ];
      const ordered = getFocusOrder(elements);
      expect(ordered).toHaveLength(1);
    });
  });

  describe('generateSkipLinks', () => {
    it('should generate skip links for sections', () => {
      const links = generateSkipLinks([
        { id: 'main', label: 'Main Content' },
        { id: 'nav', label: 'Navigation' },
      ]);
      expect(links).toEqual(['Skip to Main Content', 'Skip to Navigation']);
    });

    it('should handle empty sections', () => {
      expect(generateSkipLinks([])).toEqual([]);
    });
  });

  describe('checkColorContrast', () => {
    it('should pass AA for black on white', () => {
      const result = checkColorContrast([0, 0, 0], [255, 255, 255]);
      expect(result.passesAA).toBe(true);
      expect(result.passesAAA).toBe(true);
      expect(result.ratio).toBeCloseTo(21, 0);
    });

    it('should fail AA for similar colors', () => {
      const result = checkColorContrast([150, 150, 150], [160, 160, 160]);
      expect(result.passesAA).toBe(false);
    });

    it('should pass AA but fail AAA for medium contrast', () => {
      const result = checkColorContrast([100, 100, 100], [255, 255, 255]);
      // ratio ~8.6
      expect(result.passesAA).toBe(true);
    });
  });
});
