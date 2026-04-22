import { describe, it, expect } from 'vitest';
import {
  ariaLabel,
  ariaDescribedBy,
  ariaLabelledBy,
  roleAria,
  tableAria,
  rowAria,
  cellAria,
  progressAria,
  loadingAria,
  relativeLuminance,
  contrastRatio,
  parseHexColor,
  checkContrast,
  auditColorContrast,
  validateAria,
} from '../utils/accessibility';

describe('accessibility', () => {
  describe('ARIA utilities', () => {
    it('should create aria-label', () => {
      expect(ariaLabel('搜索')).toEqual({ 'aria-label': '搜索' });
    });

    it('should create aria-describedby', () => {
      expect(ariaDescribedBy('desc-1')).toEqual({ 'aria-describedby': 'desc-1' });
    });

    it('should create aria-labelledby', () => {
      expect(ariaLabelledBy('label-1')).toEqual({ 'aria-labelledby': 'label-1' });
    });

    it('should create role with ARIA props', () => {
      const result = roleAria('button', { pressed: true, label: 'Toggle' });
      expect(result.role).toBe('button');
      expect((result as any)['aria-pressed']).toBe(true);
      expect((result as any)['aria-label']).toBe('Toggle');
    });

    it('should create table ARIA attributes', () => {
      const result = tableAria('股票列表', 100, 8);
      expect(result.role).toBe('table');
      expect((result as any)['aria-label']).toBe('股票列表');
      expect((result as any)['aria-rowcount']).toBe(100);
      expect((result as any)['aria-colcount']).toBe(8);
    });

    it('should create row ARIA attributes', () => {
      const result = rowAria(0, true);
      expect(result.role).toBe('row');
      expect(result['aria-rowindex']).toBe(1);
      expect(result['aria-selected']).toBe(true);
    });

    it('should create cell ARIA attributes', () => {
      const result = cellAria(2, 3);
      expect(result.role).toBe('cell');
      expect(result['aria-rowindex']).toBe(3);
      expect(result['aria-colindex']).toBe(4);
    });

    it('should create cell with header descriptor', () => {
      const result = cellAria(0, 0, 'col-price');
      expect(result['aria-describedby']).toBe('col-price');
    });

    it('should create progress ARIA', () => {
      const result = progressAria(75, 100, '加载进度');
      expect(result.role).toBe('progressbar');
      expect(result['aria-valuenow']).toBe(75);
      expect(result['aria-valuemax']).toBe(100);
      expect(result['aria-label']).toBe('加载进度');
    });

    it('should create loading ARIA', () => {
      const result = loadingAria();
      expect(result.role).toBe('status');
      expect(result['aria-busy']).toBe(true);
    });

    it('should create loading ARIA with custom label', () => {
      const result = loadingAria('数据加载中');
      expect(result['aria-label']).toBe('数据加载中');
    });
  });

  describe('Color contrast', () => {
    it('should calculate relative luminance for black', () => {
      const lum = relativeLuminance(0, 0, 0);
      expect(lum).toBe(0);
    });

    it('should calculate relative luminance for white', () => {
      const lum = relativeLuminance(255, 255, 255);
      expect(lum).toBeCloseTo(1, 2);
    });

    it('should calculate contrast ratio', () => {
      const ratio = contrastRatio(1, 0);
      expect(ratio).toBeCloseTo(21, 0); // max contrast
    });

    it('should parse 6-digit hex', () => {
      const result = parseHexColor('#ff0000');
      expect(result).toEqual([255, 0, 0]);
    });

    it('should parse 3-digit hex', () => {
      const result = parseHexColor('#f00');
      expect(result).toEqual([255, 0, 0]);
    });

    it('should parse without hash', () => {
      const result = parseHexColor('00ff00');
      expect(result).toEqual([0, 255, 0]);
    });

    it('should return array with NaN for invalid hex', () => {
      const result = parseHexColor('#xyz');
      expect(result).not.toBeNull();
      if (result) {
        expect(result.some(isNaN)).toBe(true);
      }
    });

    it('should return null for wrong length hex', () => {
      expect(parseHexColor('#12345')).toBeNull();
    });

    it('should check WCAG AA contrast for black on white', () => {
      const result = checkContrast('#000000', '#ffffff', 'AA');
      expect(result.passes).toBe(true);
      expect(result.ratio).toBeGreaterThanOrEqual(4.5);
    });

    it('should fail for low contrast', () => {
      const result = checkContrast('#aaaaaa', '#ffffff', 'AA');
      expect(result.passes).toBe(false);
    });

    it('should handle AAA level large text', () => {
      const result = checkContrast('#000000', '#ffffff', 'AAA', 'large');
      expect(result.passes).toBe(true);
      expect(result.required).toBe(4.5);
    });

    it('should return invalid for bad colors', () => {
      const result = checkContrast('#xyz', '#fff');
      expect(result.passes).toBe(false);
    });

    it('should audit multiple color pairs', () => {
      const pairs = [
        { fg: '#000', bg: '#fff', name: 'Black on White' },
        { fg: '#ccc', bg: '#fff', name: 'Light Gray on White' },
      ];
      const results = auditColorContrast(pairs);
      expect(results).toHaveLength(2);
      expect(results[0]!.passes).toBe(true);
      expect(results[1]!.name).toBe('Light Gray on White');
    });
  });

  describe('validateAria', () => {
    it('should detect missing aria-checked for checkbox role', () => {
      // Skip in environments without document
      if (typeof document === 'undefined') return;
      const el = document.createElement('div');
      el.setAttribute('role', 'checkbox');
      const errors = validateAria(el);
      expect(errors).toContain('role="checkbox" 需要 aria-checked');
    });

    it('should detect missing aria-selected for tab role', () => {
      if (typeof document === 'undefined') return;
      const el = document.createElement('div');
      el.setAttribute('role', 'tab');
      const errors = validateAria(el);
      expect(errors).toContain('role="tab" 需要 aria-selected');
    });

    it('should detect focusable in aria-hidden', () => {
      if (typeof document === 'undefined') return;
      const el = document.createElement('div');
      el.setAttribute('aria-hidden', 'true');
      const btn = document.createElement('button');
      btn.textContent = 'Click';
      el.appendChild(btn);
      const errors = validateAria(el);
      expect(errors.some(e => e.includes('aria-hidden'))).toBe(true);
    });

    it('should pass valid elements', () => {
      if (typeof document === 'undefined') return;
      const el = document.createElement('div');
      el.setAttribute('role', 'checkbox');
      el.setAttribute('aria-checked', 'false');
      const errors = validateAria(el);
      expect(errors).toHaveLength(0);
    });
  });
});
