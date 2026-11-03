/**
 * 影子测试迁移：主题与样式系统
 *
 * 已绑定生产实现（唯一真源）：
 * - PRESET_THEMES（light/dark/trading/nature/warm）、getThemeById、mergeTheme、themeToCssVars、validateTheme
 *   frontend/src/utils/customThemes.ts:61-167,172-174,179-188,193-212,217-234
 * - parseColor、calculateContrastRatio、checkColorContrast
 *   frontend/src/utils/a11yEngine.ts:153-181,197-208,213-230
 * - relativeLuminance、contrastRatio、parseHexColor、checkContrast
 *   frontend/src/utils/accessibility.ts:95-101,106-110,115-132,137-162
 * - colors、getPriceColor
 *   frontend/src/styles/theme.ts:7-34,144-148
 * - CHART_COLORS
 *   frontend/src/styles/chart-theme.ts:10-37
 * - lerpColor
 *   frontend/src/utils/chartAnimation.ts:62-79
 *
 * 旧断言订正（旧值 → 生产值，依据行号）：
 * 1. 浅色 text '#333333' → '#262626'（customThemes.ts:70）
 * 2. 浅色 textSecondary '#666666' → '#8c8c8c'（customThemes.ts:70）
 * 3. 浅色 rise '#ff4d4f' → up '#cf1322'（customThemes.ts:71）
 * 4. 浅色 fall '#52c41a' → down '#3f8600'（customThemes.ts:71）
 * 5. 浅色 danger 键 #ff4d4f → error 键（值同为 #ff4d4f，customThemes.ts:69）
 * 6. 暗色 danger '#d32029' → error '#a61d24'（customThemes.ts:89）
 * 7. 暗色 rise '#d32029' → up '#cf1322'（customThemes.ts:92）
 * 8. 暗色 fall '#49aa19' → down '#3f8600'（customThemes.ts:92）
 * 9. 主题完整性断言键 rise/fall → 生产 up/down（customThemes.ts:6-20，13 键）
 * 10. CSS '--color-rise:' → '--color-up:'（themeToCssVars 使用原键名，customThemes.ts:197-199）
 * 11. CSS '--color-text-secondary:' → '--color-textSecondary:'（生产不做 kebab 转换，customThemes.ts:197-199）
 * 12. 涨跌色旧 LIGHT_THEME rise/fall/flat '#ff4d4f'/'#52c41a'/'#999999'
 *     → getPriceColor 的 colors.up '#ef4444'/down '#22c55e'/flat '#6b7280'（theme.ts:31-33,144-148）
 * 13. hexToRGB（无校验、不支持三位 hex）→ a11yEngine.parseColor（a11yEngine.ts:153-181）
 *     与 accessibility.parseHexColor（accessibility.ts:115-132）
 * 14. relativeLuminance(hex) → accessibility.relativeLuminance(r,g,b)，入参改为 RGB 分量（accessibility.ts:95-101）
 * 15. contrastRatio(hex,hex) → accessibility.contrastRatio(l1,l2)（入参改为亮度，accessibility.ts:106-110）
 *     以及 a11yEngine.calculateContrastRatio(hex,hex)（四舍五入 2 位，a11yEngine.ts:197-208）
 * 16. meetsWCAG → accessibility.checkContrast（accessibility.ts:137-162）
 *     与 a11yEngine.checkColorContrast（a11yEngine.ts:213-230）
 * 17. 单步渐变旧实现 t=NaN（只断言 length）→ 生产 lerpColor(start,end,0) 返回起始色（chartAnimation.ts:62-79）；
 *     本地 generateGradient 对 steps<=1 固定 t=0
 *
 * 未迁移（生产无对应导出，保留本地 helper）：
 * - generateGradient：生产只有 chartAnimation.lerpColor 的单点插值，没有多步采样导出。
 * - opacity：生产没有 hex→rgba 字符串导出；本地 helper 仅复用生产 parseColor 做解析。
 *
 * 用例名沿用影子测试原名（只增不减）；生产语义变化的用例在内部注明。
 * 全部使用固定夹具，不依赖随机数或当前时间。
 */

import { describe, it, expect } from 'vitest';
import {
  PRESET_THEMES,
  getThemeById,
  mergeTheme,
  themeToCssVars,
  validateTheme,
} from '../utils/customThemes';
import {
  parseHexColor,
  relativeLuminance,
  contrastRatio,
  checkContrast,
} from '../utils/accessibility';
import {
  parseColor,
  calculateContrastRatio,
  checkColorContrast,
} from '../utils/a11yEngine';
import { colors as designColors, getPriceColor } from '../styles/theme';
import { CHART_COLORS } from '../styles/chart-theme';
import { lerpColor } from '../utils/chartAnimation';

const lightTheme = PRESET_THEMES[0];
const darkTheme = PRESET_THEMES[1];

function hexLuminance(hex: string): number {
  const rgb = parseHexColor(hex);
  if (!rgb) throw new Error(`无法解析颜色: ${hex}`);
  return relativeLuminance(rgb[0], rgb[1], rgb[2]);
}

// 未迁移：生产无多步采样导出（仅 chartAnimation.lerpColor 单点插值），保留本地 helper。
function generateGradient(startColor: string, endColor: string, steps: number): string[] {
  const start = parseColor(startColor);
  const end = parseColor(endColor);
  if (!start || !end) throw new Error(`无法解析渐变色: ${startColor} / ${endColor}`);

  const colors: string[] = [];
  for (let i = 0; i < steps; i++) {
    const t = steps <= 1 ? 0 : i / (steps - 1);
    const r = Math.round(start.r + (end.r - start.r) * t);
    const g = Math.round(start.g + (end.g - start.g) * t);
    const b = Math.round(start.b + (end.b - start.b) * t);
    colors.push(
      `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
    );
  }
  return colors;
}

// 未迁移：生产无 hex→rgba 导出；此处仅复用生产 parseColor 解析。
function opacity(hex: string, alpha: number): string {
  const rgb = parseColor(hex);
  if (!rgb) throw new Error(`无法解析颜色: ${hex}`);
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

describe('主题与样式系统', () => {
  describe('主题常量', () => {
    it('浅色主题完整性', () => {
      // 用例名沿旧；生产键为 up/down（旧自抄为 rise/fall）。
      const keys = Object.keys(lightTheme.colors);
      expect(keys).toContain('primary');
      expect(keys).toContain('up');
      expect(keys).toContain('down');
      expect(keys).toContain('flat');
      expect(keys.length).toBe(13);
    });

    it('暗色主题完整性', () => {
      const keys = Object.keys(darkTheme.colors);
      expect(keys.length).toBe(Object.keys(lightTheme.colors).length);
    });

    it('A股红涨绿跌 - 浅色', () => {
      // 旧值 rise #ff4d4f / fall #52c41a；生产为 up #cf1322 / down #3f8600。
      expect(lightTheme.colors.up).toBe('#cf1322');
      expect(lightTheme.colors.down).toBe('#3f8600');
    });

    it('A股红涨绿跌 - 暗色', () => {
      // 旧值 rise #d32029 / fall #49aa19；生产为 up #cf1322 / down #3f8600。
      expect(darkTheme.colors.up).toBe('#cf1322');
      expect(darkTheme.colors.down).toBe('#3f8600');
    });

    it('所有颜色为有效hex', () => {
      const hexRegex = /^#[0-9a-f]{6}([0-9a-f]{2})?$/i;
      for (const theme of PRESET_THEMES) {
        for (const color of Object.values(theme.colors)) {
          expect(color).toMatch(hexRegex);
        }
        expect(validateTheme(theme).valid).toBe(true);
      }
    });

    it('预设主题包含五套配色', () => {
      expect(PRESET_THEMES).toHaveLength(5);
      expect(PRESET_THEMES.map((theme) => theme.id)).toEqual([
        'light',
        'dark',
        'trading',
        'nature',
        'warm',
      ]);
    });

    it('图表主题红涨绿跌', () => {
      expect(CHART_COLORS.up).toBe('#cf2a2a');
      expect(CHART_COLORS.down).toBe('#1db468');
      expect(CHART_COLORS.flat).toBe('#64748b');
      expect(CHART_COLORS.up).not.toBe(CHART_COLORS.down);
    });
  });

  describe('主题切换', () => {
    it('返回浅色主题', () => {
      expect(getThemeById('light')).toBe(lightTheme);
    });

    it('返回暗色主题', () => {
      expect(getThemeById('dark')).toBe(darkTheme);
    });

    it('暗色背景更深', () => {
      const lightBg = hexLuminance(lightTheme.colors.background);
      const darkBg = hexLuminance(darkTheme.colors.background);
      expect(darkBg).toBeLessThan(lightBg);
    });

    it('未知主题回退到默认亮色', () => {
      expect(getThemeById('does-not-exist')).toBe(PRESET_THEMES[0]);
    });

    it('mergeTheme 深合并保留基础字段', () => {
      const merged = mergeTheme(lightTheme, {
        colors: { ...lightTheme.colors, primary: '#123456' },
      });
      expect(merged.colors.primary).toBe('#123456');
      expect(merged.colors.success).toBe(lightTheme.colors.success);
      expect(merged.id).toBe(lightTheme.id);
      expect(merged.colors).not.toBe(lightTheme.colors);
    });
  });

  describe('CSS变量生成', () => {
    it('生成变量声明', () => {
      const css = themeToCssVars(lightTheme);
      expect(css).toContain('--color-primary:');
      // 旧断言 '--color-rise:'；生产色键为 up。
      expect(css).toContain('--color-up:');
      expect(css).not.toContain('--color-rise:');
      expect(css).toContain(':root {');
    });

    it('camelCase转kebab-case', () => {
      // 用例名沿旧；生产 themeToCssVars 使用原键名，不做 kebab 转换。
      const css = themeToCssVars(lightTheme);
      expect(css).toContain('--color-textSecondary:');
      expect(css).not.toContain('--color-text-secondary:');
    });

    it('CSS变量包含图表字号间距', () => {
      const css = themeToCssVars(lightTheme);
      expect(css).toContain('--chart-backgroundColor:');
      expect(css).toContain('--font-md:');
      expect(css).toContain('--space-md:');
      expect(css).toContain('--border-radius: 6px;');
    });
  });

  describe('颜色转换', () => {
    it('hex转RGB', () => {
      expect(parseColor('#ff0000')).toEqual({ r: 255, g: 0, b: 0 });
      expect(parseColor('#00ff00')).toEqual({ r: 0, g: 255, b: 0 });
      expect(parseColor('#0000ff')).toEqual({ r: 0, g: 0, b: 255 });
    });

    it('无#号', () => {
      expect(parseColor('ffffff')).toEqual({ r: 255, g: 255, b: 255 });
      expect(parseHexColor('ffffff')).toEqual([255, 255, 255]);
    });

    it('颜色解析支持三位hex与rgb()', () => {
      expect(parseColor('#abc')).toEqual({ r: 170, g: 187, b: 204 });
      expect(parseColor('rgb(12, 34, 56)')).toEqual({ r: 12, g: 34, b: 56 });
      expect(parseHexColor('#abc')).toEqual([170, 187, 204]);
    });

    it('无效颜色解析返回null', () => {
      expect(parseColor('not-a-color')).toBeNull();
      expect(parseColor('#abcd')).toBeNull();
      expect(parseHexColor('#12345')).toBeNull();
      expect(parseHexColor('#1234567')).toBeNull();
      expect(parseColor('xyz')).toBeNull();
    });
  });

  describe('对比度', () => {
    it('黑白对比度最高', () => {
      const l1 = hexLuminance('#000000');
      const l2 = hexLuminance('#ffffff');
      expect(contrastRatio(l1, l2)).toBeCloseTo(21, 1);
      expect(calculateContrastRatio('#000000', '#ffffff')).toBe(21);
    });

    it('同色对比度最低', () => {
      expect(contrastRatio(hexLuminance('#808080'), hexLuminance('#808080'))).toBe(1);
      expect(calculateContrastRatio('#808080', '#808080')).toBe(1);
    });

    it('WCAG AA通过', () => {
      expect(checkContrast('#000000', '#ffffff', 'AA').passes).toBe(true);
      expect(checkColorContrast('#000000', '#ffffff').passes.AA_normal).toBe(true);
    });

    it('WCAG AA失败', () => {
      expect(checkContrast('#aaaaaa', '#ffffff', 'AA').passes).toBe(false);
      expect(checkColorContrast('#aaaaaa', '#ffffff').passes.AA_normal).toBe(false);
    });

    it('WCAG AAA通过', () => {
      expect(checkContrast('#000000', '#ffffff', 'AAA').passes).toBe(true);
      expect(checkColorContrast('#000000', '#ffffff').passes.AAA_normal).toBe(true);
    });

    it('WCAG 大字号阈值更宽松', () => {
      const large = checkContrast('#888888', '#ffffff', 'AA', 'large');
      const normal = checkContrast('#888888', '#ffffff', 'AA', 'normal');
      expect(large.required).toBe(3);
      expect(large.passes).toBe(true);
      expect(large.ratio).toBeCloseTo(3.55, 1);
      expect(normal.required).toBe(4.5);
      expect(normal.passes).toBe(false);
    });

    it('无效颜色对比度为零', () => {
      expect(calculateContrastRatio('not-a-color', '#ffffff')).toBe(0);
      expect(checkContrast('not-a-color', '#ffffff')).toEqual({
        ratio: 0,
        passes: false,
        required: 4.5,
      });
      expect(checkColorContrast('not-a-color', '#ffffff').passes).toEqual({
        AA_normal: false,
        AA_large: false,
        AAA_normal: false,
        AAA_large: false,
      });
    });

    it('a11yEngine 四档判定一致', () => {
      const result = checkColorContrast('#888888', '#ffffff');
      expect(result.ratio).toBeCloseTo(3.55, 1);
      expect(result.passes).toEqual({
        AA_normal: false,
        AA_large: true,
        AAA_normal: false,
        AAA_large: false,
      });
      expect(result.foreground).toBe('#888888');
      expect(result.background).toBe('#ffffff');
    });
  });

  describe('涨跌颜色', () => {
    it('上涨用rise色', () => {
      // 用例名沿旧；生产 getPriceColor 上涨返回 colors.up（红）。
      expect(getPriceColor(2.5)).toBe(designColors.up);
      expect(getPriceColor(2.5)).toBe('#ef4444');
    });

    it('下跌用fall色', () => {
      expect(getPriceColor(-1.5)).toBe(designColors.down);
      expect(getPriceColor(-1.5)).toBe('#22c55e');
    });

    it('平盘用flat色', () => {
      expect(getPriceColor(0)).toBe(designColors.flat);
      expect(getPriceColor(0)).toBe('#6b7280');
    });
  });

  describe('渐变生成', () => {
    it('生成指定步数', () => {
      const gradient = generateGradient('#000000', '#ffffff', 5);
      expect(gradient).toHaveLength(5);
    });

    it('首尾颜色正确', () => {
      const gradient = generateGradient('#ff0000', '#0000ff', 3);
      expect(gradient[0]).toBe('#ff0000');
      expect(gradient[2]).toBe('#0000ff');
    });

    it('单步返回起始色', () => {
      const gradient = generateGradient('#123456', '#abcdef', 1);
      expect(gradient).toHaveLength(1);
      expect(gradient[0]).toBe('#123456');
      expect(lerpColor('#123456', '#abcdef', 0)).toBe('#123456');
    });

    it('渐变中点与生产 lerpColor 一致', () => {
      const mid = generateGradient('#000000', '#ffffff', 3)[1];
      expect(mid).toBe(lerpColor('#000000', '#ffffff', 0.5));
      expect(mid).toBe('#808080');
    });
  });

  describe('透明度', () => {
    it('生成rgba', () => {
      expect(opacity('#ff0000', 0.5)).toBe('rgba(255, 0, 0, 0.5)');
    });

    it('完全不透明', () => {
      expect(opacity('#000000', 1)).toBe('rgba(0, 0, 0, 1)');
    });

    it('完全透明', () => {
      expect(opacity('#ffffff', 0)).toBe('rgba(255, 255, 255, 0)');
    });

    it('透明度支持三位hex', () => {
      expect(opacity('#f00', 0.25)).toBe('rgba(255, 0, 0, 0.25)');
    });
  });
});
