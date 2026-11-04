/**
 * 仪表盘自定义测试（迁移版）
 * 原文件：frontend/src/__tests__/dashboardCustomization.test.ts（636 行，纯自抄实现）
 *
 * ── 一、绑定真源（file:line）──
 * | 符号 | 生产实现 |
 * | validateLayout / checkOverlap / autoArrange | frontend/src/utils/dashboardLayoutEngine.ts:49 / :92 / :150 |
 * | PRESET_THEMES / getThemeById | frontend/src/utils/customThemes.ts:61 / :172 |
 * | mergeTheme / themeToCssVars / validateTheme | frontend/src/utils/customThemes.ts:179 / :193 / :217 |
 * | parseColor / relativeLuminance / calculateContrastRatio / checkColorContrast | frontend/src/utils/a11yEngine.ts:153 / :186 / :197 / :213 |
 * | calculateTooltipPosition | frontend/src/utils/chartInteractionEngine.ts:390 |
 * | BREAKPOINTS / GRID_PRESETS / getCurrentBreakpoint / calculateColumns / getAdaptiveConfig | frontend/src/utils/responsiveUtils.ts:8 / :27 / :58 / :130 / :258 |
 * | binData | frontend/src/utils/dataFlowEngine.ts:180 |
 *
 * 选型：对比度选 a11yEngine 而非 accessibility.ts，因为自抄副本是 hex 进 hex 出；
 * a11yEngine.calculateContrastRatio(color1, color2) 直接吃 hex 字符串并内部转亮度、四舍五入 2 位，
 * 与副本同构；accessibility.ts:95/:106 的 relativeLuminance/contrastRatio 吃亮度数值，需额外转换层。
 *
 * ── 二、旧断言订正（自抄 ⇄ 生产差异）──
 * 1. validateLayout 旧签名 (widgets, containerWidth) 把溢出/宽高不足都记为 error；生产签名 (layout)，
 *    溢出只进 warnings 且 valid 仍为 true，列数越界/重复 id 才进 errors，另无 minW/minH 字段。
 *    故 'should detect overflow' 由 valid=false 订正为 valid=true + warnings=['Widget a overflows columns']；
 *    'should detect min width violation' 的 minW 概念不存在，改为 w<1 触发 'Widget a has invalid size'。
 * 2. 旧 detectOverlaps 自抄返回 [id,id][]；生产 checkOverlap(a,b) 返回 boolean，重叠只在 validateLayout 的 warnings。
 * 3. 旧主题常量 bgPrimary/rise/fall、fonts、borderRadius 对象，生产为 colors.background/up/down、
 *    fontSize 字符串、borderRadius 数值；CSS 变量由 generateCSSVars（仅 colors）订正为 themeToCssVars（colors+chart+fontSize+spacing+border-radius，共 37 行）。
 * 4. 旧 validateTheme 返回 string[] 且空 rise 视为缺失（但旧断言只写 length>=0，属空洞断言）；
 *    生产返回 {valid, errors}，只校验 id/name/colors.primary，空字符串/缺失的单色不报错，非空格式错误才报。
 * 5. 旧 mergeThemes 带 s，生产 mergeTheme 单数，且仅深合 colors/chart/fontSize/spacing。
 * 6. 旧 contrastRatio 返回未取整浮点（用 closeTo）；生产 calculateContrastRatio 返回 2 位小数，#333333/#ffffff 精确 12.63。
 * 7. 旧 tooltip 偏移 +15/-10、下溢贴容器底；生产偏移 +10、默认右下、仅右/下翻转、左/上贴 offset。
 *    故 x 115→110、535→540、底部 y 用例由 <=600 订正为精确 520。
 * 8. 旧断点 576/768/992/1200/1600（xxl）；生产 640/768/1024/1280/1536（键名 2xl），
 *    故 600 由 sm→xs、1000 由 lg→md、1800 由 xxl→2xl；旧 getColumns md=3、xxl=6，生产 GRID_PRESETS md=2、2xl=4。
 * 9. 旧 binData 返回 start/end 且 min===max 时只回 1 箱；生产返回 min/max/items，恒回 binCount 箱，
 *    故单值用例 length 1→5（首箱 count=1，其余 0），键名 start/end 改 min/max。
 * 10. 旧 createPreset 依赖运行时当前时间且只断言 createdAt>0；本文件去掉时间依赖，createPreset 显式接收固定时间戳。
 *
 * ── 三、未迁移 / 生产缺口（保留内联的原因）──
 * - formatYAxis：生产无同契约导出。dataTransformUtils.ts:45 formatAmount 只做金额单位（万亿/亿/万）且无 type 参数，
 *   chartDataProcessing.ts 无坐标轴格式化。保留内联（含负成交量未走亿/万分支的既有行为）。
 * - createColorScale：生产 heatmapEngine.ts:60 getColorForValue 接固定 colorScheme 而非 colors[] 多段色标。
 * - shouldRefresh / prioritizeRefresh：全仓无此导出（scrollInteractionEngine.ts:69 的 end().shouldRefresh 契约不同）。
 * - resolveDataBinding：全仓无此导出（strategyShare.ts:176 renderShareTemplate 是扁平 key 模板，不解析嵌套路径）。
 * - createPreset / mergePresets / validatePreset：customThemes 只有内置 PRESET_THEMES，无用户预设 CRUD 导出。
 * - getResponsiveFontSize：responsiveUtils 无此导出，getAdaptiveConfig.fontSize 返回 clamp 字符串；保留内联，键名 xxl→2xl。
 * - cloneLayout / getLayoutStats：兄弟文件 dashboardCustomization2.test.ts 已绑定，本文件不重复覆盖。
 * - 生产缺口（仅记录，不改生产）：validateLayout 不校验 layout.id/name；单色空串不报错；
 *   binData 在 min===max 时仍切 binCount 个箱；calculateTooltipPosition 无左/上翻转换算，仅把负坐标贴到 offset。
 */

import { describe, it, expect } from 'vitest';
import {
  validateLayout,
  checkOverlap,
  autoArrange,
  type DashboardLayout,
  type DashboardWidget,
  type GridPosition,
  type WidgetType,
} from '../utils/dashboardLayoutEngine';
import {
  PRESET_THEMES,
  getThemeById,
  mergeTheme,
  themeToCssVars,
  validateTheme,
  type ThemeColors,
} from '../utils/customThemes';
import {
  parseColor,
  relativeLuminance,
  calculateContrastRatio,
  checkColorContrast,
} from '../utils/a11yEngine';
import { calculateTooltipPosition } from '../utils/chartInteractionEngine';
import {
  BREAKPOINTS,
  GRID_PRESETS,
  getCurrentBreakpoint,
  calculateColumns,
  getAdaptiveConfig,
  type Breakpoint,
} from '../utils/responsiveUtils';
import { binData } from '../utils/dataFlowEngine';

const FIXED_TS = 1700000000000;

function makeWidget(
  overrides: Partial<Omit<DashboardWidget, 'position'>> & { position?: Partial<GridPosition> } = {},
): DashboardWidget {
  const { position, ...rest } = overrides;
  return {
    id: 'w1',
    type: 'chart',
    title: 'W1',
    position: { x: 0, y: 0, w: 4, h: 2, ...position },
    config: {},
    visible: true,
    locked: false,
    createdAt: FIXED_TS,
    updatedAt: FIXED_TS,
    ...rest,
  };
}

function makeLayout(
  overrides: Partial<Omit<DashboardLayout, 'widgets'>> & { widgets?: DashboardWidget[] } = {},
): DashboardLayout {
  const { widgets, ...rest } = overrides;
  return {
    id: 'layout-1',
    name: '测试布局',
    columns: 12,
    rowHeight: 80,
    gap: 16,
    widgets: widgets ?? [],
    isDefault: false,
    createdAt: FIXED_TS,
    updatedAt: FIXED_TS,
    ...rest,
  };
}

function findWidget(layout: DashboardLayout, id: string): DashboardWidget {
  const found = layout.widgets.find(w => w.id === id);
  if (!found) throw new Error('widget not found: ' + id);
  return found;
}

// Dashboard Customization Engine
describe('Dashboard Customization Engine', () => {
  // Widget Layout System（绑定 dashboardLayoutEngine.ts:49/:92）
  describe('Widget Layout', () => {
    it('should validate correct layout', () => {
      const layout = makeLayout({
        columns: 12,
        widgets: [
          makeWidget({ id: 'a', position: { x: 0, y: 0, w: 6, h: 4 } }),
          makeWidget({ id: 'b', type: 'table', position: { x: 6, y: 0, w: 6, h: 4 } }),
        ],
      });
      const result = validateLayout(layout);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it('should detect overflow', () => {
      const layout = makeLayout({
        columns: 12,
        widgets: [makeWidget({ id: 'a', position: { x: 8, y: 0, w: 6, h: 4 } })],
      });
      const result = validateLayout(layout);
      // 生产把溢出记为 warning，valid 不受影响（旧断言写成 error + valid=false，已订正）
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toEqual(['Widget a overflows columns']);
    });

    it('should detect negative coordinates', () => {
      const layout = makeLayout({
        columns: 12,
        widgets: [makeWidget({ id: 'a', position: { x: -1, y: 0, w: 6, h: 4 } })],
      });
      const result = validateLayout(layout);
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(['Widget a has negative position']);
      expect(result.warnings).toHaveLength(0);
    });

    it('should detect min width violation', () => {
      // 生产无 minW/minH 概念，唯一的尺寸守卫是 w<1||h<1，旧 minW 用例订正为非法尺寸
      const layout = makeLayout({
        columns: 12,
        widgets: [makeWidget({ id: 'a', position: { x: 0, y: 0, w: 0, h: 4 } })],
      });
      const result = validateLayout(layout);
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(['Widget a has invalid size']);
    });

    it('should detect overlaps', () => {
      const layout = makeLayout({
        columns: 12,
        widgets: [
          makeWidget({ id: 'a', position: { x: 0, y: 0, w: 6, h: 4 } }),
          makeWidget({ id: 'b', type: 'table', position: { x: 4, y: 2, w: 6, h: 4 } }),
        ],
      });
      const result = validateLayout(layout);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toEqual(['Widgets a and b overlap']);
    });

    it('should reject duplicate widget ids', () => {
      const layout = makeLayout({
        columns: 12,
        widgets: [
          makeWidget({ id: 'a', position: { x: 0, y: 0, w: 4, h: 2 } }),
          makeWidget({ id: 'a', position: { x: 6, y: 0, w: 4, h: 2 } }),
        ],
      });
      const result = validateLayout(layout);
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(['Duplicate widget ID: a']);
    });

    it('should reject columns outside 1..24', () => {
      const zero = validateLayout(makeLayout({ columns: 0 }));
      const tooMany = validateLayout(makeLayout({ columns: 25 }));
      const upper = validateLayout(
        makeLayout({ columns: 24, widgets: [makeWidget({ id: 'a', position: { x: 0, y: 0, w: 1, h: 1 } })] }),
      );
      expect(zero.errors).toEqual(['Columns must be between 1 and 24']);
      expect(tooMany.errors).toEqual(['Columns must be between 1 and 24']);
      expect(upper.valid).toBe(true);
    });

    it('should not validate layout identity (production gap)', () => {
      // 生产不校验 layout.id/name，空串仍为合法布局
      const layout = makeLayout({
        id: '',
        name: '',
        columns: 12,
        widgets: [makeWidget({ id: 'a', position: { x: 0, y: 0, w: 4, h: 2 } })],
      });
      const result = validateLayout(layout);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it('should treat touching edges as non-overlapping', () => {
      const base = { x: 0, y: 0, w: 4, h: 2 };
      expect(checkOverlap(base, { x: 3, y: 1, w: 2, h: 2 })).toBe(true);
      expect(checkOverlap(base, { x: 4, y: 0, w: 2, h: 2 })).toBe(false);
      expect(checkOverlap(base, { x: 0, y: 2, w: 4, h: 2 })).toBe(false);
    });
  });

  // Widget Refresh Strategy（生产无导出，保留内联；见头注释第三节）
  describe('Widget Refresh', () => {
    interface RefreshConfig {
      widgetId: string;
      interval: number;
      lastRefresh: number;
      paused: boolean;
    }

    const shouldRefresh = (config: RefreshConfig, now: number) => {
      if (config.paused) return false;
      return now - config.lastRefresh >= config.interval;
    };

    const prioritizeRefresh = (configs: RefreshConfig[], now: number) => {
      return configs
        .filter(c => shouldRefresh(c, now))
        .sort((a, b) => (now - b.lastRefresh) / b.interval - (now - a.lastRefresh) / a.interval);
    };

    it('should trigger refresh when interval elapsed', () => {
      expect(shouldRefresh({ widgetId: 'a', interval: 5000, lastRefresh: 1000, paused: false }, 7000)).toBe(true);
    });

    it('should not trigger before interval', () => {
      expect(shouldRefresh({ widgetId: 'a', interval: 5000, lastRefresh: 5000, paused: false }, 8000)).toBe(false);
    });

    it('should not trigger when paused', () => {
      expect(shouldRefresh({ widgetId: 'a', interval: 5000, lastRefresh: 1000, paused: true }, 7000)).toBe(false);
    });

    it('should trigger exactly on the interval boundary', () => {
      expect(shouldRefresh({ widgetId: 'a', interval: 5000, lastRefresh: 6000, paused: false }, 11000)).toBe(true);
      expect(shouldRefresh({ widgetId: 'a', interval: 5000, lastRefresh: 6001, paused: false }, 11000)).toBe(false);
    });

    it('should prioritize most overdue widgets', () => {
      const configs: RefreshConfig[] = [
        { widgetId: 'a', interval: 5000, lastRefresh: 0, paused: false },
        { widgetId: 'b', interval: 10000, lastRefresh: 0, paused: false },
      ];
      const prioritized = prioritizeRefresh(configs, 15000);
      // a 逾期 300%，b 逾期 150%，a 在前
      expect(prioritized.map(c => c.widgetId)).toEqual(['a', 'b']);
      expect(prioritized).toHaveLength(2);
    });

    it('should drop not-due and paused widgets from priority list', () => {
      const configs: RefreshConfig[] = [
        { widgetId: 'a', interval: 5000, lastRefresh: 0, paused: false },
        { widgetId: 'b', interval: 10000, lastRefresh: 0, paused: false },
        { widgetId: 'c', interval: 100000, lastRefresh: 14000, paused: false },
        { widgetId: 'd', interval: 1000, lastRefresh: 0, paused: true },
      ];
      const prioritized = prioritizeRefresh(configs, 15000);
      expect(prioritized.map(c => c.widgetId)).toEqual(['a', 'b']);
      expect(configs[0].widgetId).toBe('a');
      expect(prioritized).not.toBe(configs);
    });
  });

  // Dashboard Preset Management（生产无 CRUD 导出，保留内联；固定时间戳替代运行时当前时间）
  describe('Dashboard Presets', () => {
    interface DashboardPreset {
      name: string;
      widgets: { type: WidgetType; config: Record<string, unknown> }[];
      createdAt: number;
    }

    const createPreset = (
      name: string,
      widgets: DashboardPreset['widgets'],
      createdAt: number,
    ): DashboardPreset => ({
      name,
      widgets,
      createdAt,
    });

    const mergePresets = (base: DashboardPreset, override: Partial<DashboardPreset>): DashboardPreset => ({
      ...base,
      ...override,
      widgets: override.widgets || base.widgets,
    });

    const validatePreset = (preset: DashboardPreset): string | null => {
      if (!preset.name || preset.name.trim().length === 0) return 'Name required';
      if (preset.widgets.length === 0) return 'At least one widget required';
      if (preset.widgets.length > 20) return 'Too many widgets';
      const types = new Set(preset.widgets.map(w => w.type));
      if (types.size !== preset.widgets.length) return 'Duplicate widget types';
      return null;
    };

    it('should create preset with timestamp', () => {
      const preset = createPreset('default', [{ type: 'chart', config: {} }], FIXED_TS);
      expect(preset.name).toBe('default');
      expect(preset.createdAt).toBe(FIXED_TS);
      expect(preset.widgets).toHaveLength(1);
      expect(preset.widgets[0].type).toBe('chart');
    });

    it('should merge presets', () => {
      const base = createPreset('base', [{ type: 'chart', config: {} }], FIXED_TS);
      const merged = mergePresets(base, { name: 'custom' });
      expect(merged.name).toBe('custom');
      expect(merged.widgets).toHaveLength(1);
      expect(merged.createdAt).toBe(FIXED_TS);
      expect(base.name).toBe('base');
    });

    it('should reject empty name', () => {
      expect(validatePreset({ name: '', widgets: [{ type: 'chart', config: {} }], createdAt: FIXED_TS })).toBe(
        'Name required',
      );
    });

    it('should reject empty widgets', () => {
      expect(validatePreset({ name: 'test', widgets: [], createdAt: FIXED_TS })).toBe('At least one widget required');
    });

    it('should accept valid preset', () => {
      expect(validatePreset({ name: 'test', widgets: [{ type: 'chart', config: {} }], createdAt: FIXED_TS })).toBeNull();
    });

    it('should reject whitespace-only name', () => {
      expect(
        validatePreset({ name: '   ', widgets: [{ type: 'chart', config: {} }], createdAt: FIXED_TS }),
      ).toBe('Name required');
    });

    it('should reject more than 20 widgets', () => {
      const widgets = Array.from({ length: 21 }, (_, i) => ({ type: 'chart' as WidgetType, config: { i } }));
      expect(validatePreset({ name: 'big', widgets, createdAt: FIXED_TS })).toBe('Too many widgets');
    });

    it('should reject duplicate widget types', () => {
      expect(
        validatePreset({
          name: 'dup',
          widgets: [
            { type: 'chart', config: {} },
            { type: 'chart', config: {} },
          ],
          createdAt: FIXED_TS,
        }),
      ).toBe('Duplicate widget types');
    });
  });

  // Grid Auto-Arrangement（绑定 dashboardLayoutEngine.ts:150）
  describe('Grid Auto-Arrange', () => {
    it('should arrange in columns', () => {
      const layout = makeLayout({
        columns: 2,
        widgets: [
          makeWidget({ id: 'a', position: { x: 0, y: 0, w: 1, h: 2 } }),
          makeWidget({ id: 'b', title: 'B', position: { x: 0, y: 0, w: 1, h: 3 } }),
          makeWidget({ id: 'c', title: 'C', position: { x: 0, y: 0, w: 1, h: 1 } }),
        ],
      });
      const arranged = autoArrange(layout);
      expect(findWidget(arranged, 'a').position).toEqual({ x: 0, y: 0, w: 1, h: 2 });
      expect(findWidget(arranged, 'b').position).toEqual({ x: 1, y: 0, w: 1, h: 3 });
      expect(findWidget(arranged, 'c').position).toEqual({ x: 0, y: 2, w: 1, h: 1 });
    });

    it('should minimize total height', () => {
      const layout = makeLayout({
        columns: 2,
        widgets: [
          makeWidget({ id: 'a', position: { x: 0, y: 0, w: 1, h: 4 } }),
          makeWidget({ id: 'b', title: 'B', position: { x: 0, y: 0, w: 1, h: 3 } }),
          makeWidget({ id: 'c', title: 'C', position: { x: 0, y: 0, w: 1, h: 2 } }),
          makeWidget({ id: 'd', title: 'D', position: { x: 0, y: 0, w: 1, h: 1 } }),
        ],
      });
      const arranged = autoArrange(layout);
      expect(findWidget(arranged, 'a').position).toEqual({ x: 0, y: 0, w: 1, h: 4 });
      expect(findWidget(arranged, 'b').position).toEqual({ x: 1, y: 0, w: 1, h: 3 });
      expect(findWidget(arranged, 'c').position).toEqual({ x: 1, y: 3, w: 1, h: 2 });
      expect(findWidget(arranged, 'd').position).toEqual({ x: 0, y: 4, w: 1, h: 1 });
      const maxY = Math.max(...arranged.widgets.map(w => w.position.y + w.position.h));
      expect(maxY).toBe(5);
    });

    it('should keep hidden widgets appended without arranging them', () => {
      const layout = makeLayout({
        columns: 2,
        widgets: [
          makeWidget({ id: 'a', position: { x: 0, y: 0, w: 2, h: 1 } }),
          makeWidget({ id: 'hidden', title: 'H', position: { x: 1, y: 3, w: 2, h: 1 }, visible: false }),
        ],
      });
      const arranged = autoArrange(layout);
      expect(arranged.widgets).toHaveLength(2);
      expect(arranged.widgets[1].id).toBe('hidden');
      expect(findWidget(arranged, 'hidden').position).toEqual({ x: 1, y: 3, w: 2, h: 1 });
      expect(findWidget(arranged, 'a').position).toEqual({ x: 0, y: 0, w: 2, h: 1 });
    });
  });

  // Widget Data Binding（生产无导出，保留内联）
  describe('Widget Data Binding', () => {
    const resolveDataBinding = (template: string, context: Record<string, unknown>) => {
      return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_, path: string) => {
        const keys = path.split('.');
        let value: unknown = context;
        for (const key of keys) {
          if (value === null || value === undefined) return '';
          value = (value as Record<string, unknown>)[key];
        }
        return String(value ?? '');
      });
    };

    it('should resolve simple binding', () => {
      expect(resolveDataBinding('Price: {{price}}', { price: 100 })).toBe('Price: 100');
    });

    it('should resolve nested binding', () => {
      expect(resolveDataBinding('{{stock.name}}', { stock: { name: '茅台' } })).toBe('茅台');
    });

    it('should handle missing key', () => {
      expect(resolveDataBinding('{{missing}}', {})).toBe('');
    });

    it('should resolve multiple bindings', () => {
      const result = resolveDataBinding('{{name}}: {{price}}', { name: 'MSFT', price: 300 });
      expect(result).toBe('MSFT: 300');
    });

    it('should stringify numeric zero', () => {
      expect(resolveDataBinding('{{price}}', { price: 0 })).toBe('0');
    });

    it('should handle missing nested key', () => {
      expect(resolveDataBinding('{{stock.missing}}', { stock: { name: '茅台' } })).toBe('');
    });
  });
});

// Theme System Deep（绑定 customThemes.ts 与 a11yEngine.ts）
describe('Theme System Deep', () => {
  const light = PRESET_THEMES[0];
  const dark = PRESET_THEMES[1];

  describe('Theme Presets', () => {
    it('should expose five built-in presets', () => {
      expect(PRESET_THEMES).toHaveLength(5);
      expect(PRESET_THEMES.map(t => t.id)).toEqual(['light', 'dark', 'trading', 'nature', 'warm']);
    });

    it('should resolve theme by id and fall back to light', () => {
      expect(getThemeById('dark')).toBe(dark);
      expect(getThemeById('dark').isDark).toBe(true);
      expect(getThemeById('missing')).toBe(light);
      expect(getThemeById('missing').id).toBe('light');
    });
  });

  describe('Theme Generation', () => {
    it('should generate CSS variables from theme', () => {
      const css = themeToCssVars(light);
      expect(css).toContain('--color-background: #f0f2f5;');
      expect(css).toContain('--color-up: #cf1322;');
      expect(css.startsWith(':root {')).toBe(true);
      expect(css.split('\n')).toHaveLength(37);
    });

    it('should preserve rise/fall colors across themes', () => {
      // 生产键名为 up/down（旧自抄用 rise/fall），色值也不同
      expect(light.colors.up).toBe('#cf1322');
      expect(dark.colors.up).toBe('#cf1322');
      expect(light.colors.down).toBe('#3f8600');
      expect(dark.colors.down).toBe('#3f8600');
      expect(PRESET_THEMES[2].colors.up).toBe('#ff1744');
    });

    it('should have different backgrounds', () => {
      expect(light.colors.background).toBe('#f0f2f5');
      expect(dark.colors.background).toBe('#141414');
      expect(light.colors.background).not.toBe(dark.colors.background);
    });

    it('should emit chart, font, spacing and radius variables', () => {
      const css = themeToCssVars(light);
      expect(css).toContain('--chart-ma5: #faad14;');
      expect(css).toContain('--chart-backgroundColor: #ffffff;');
      expect(css).toContain('--font-md: 14px;');
      expect(css).toContain('--space-md: 16px;');
      expect(css).toContain('--border-radius: 6px;');
      expect(css.endsWith('--border-radius: 6px;\n}')).toBe(true);
    });

    it('should render trading preset radius and primary color', () => {
      const css = themeToCssVars(PRESET_THEMES[2]);
      expect(css).toContain('--border-radius: 2px;');
      expect(css).toContain('--color-primary: #00bcd4;');
    });
  });

  describe('Theme Validation', () => {
    it('should pass valid theme', () => {
      expect(validateTheme(light)).toEqual({ valid: true, errors: [] });
      expect(validateTheme(light).valid).toBe(true);
    });

    it('should detect missing colors', () => {
      const bad = { ...light, colors: { ...light.colors, up: '' } };
      // 生产只校验 colors.primary 是否存在，空字符串的单色不报错（旧断言 length>=0 已订正为精确值）
      const result = validateTheme(bad);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should require theme id', () => {
      expect(validateTheme({ ...light, id: '' }).errors).toEqual(['主题ID不能为空']);
    });

    it('should require theme name', () => {
      expect(validateTheme({ ...light, name: '' }).errors).toEqual(['主题名称不能为空']);
    });

    it('should require primary color', () => {
      expect(validateTheme({ ...light, colors: { ...light.colors, primary: '' } }).errors).toEqual(['必须指定主色调']);
    });

    it('should reject malformed color values', () => {
      expect(validateTheme({ ...light, colors: { ...light.colors, error: 'red' } }).errors).toEqual([
        '颜色 error 格式无效: red',
      ]);
    });

    it('should accept 8-digit hex colors', () => {
      const result = validateTheme({ ...light, colors: { ...light.colors, up: '#cf132260' } });
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });

  describe('Theme Merging', () => {
    it('should merge color overrides', () => {
      const custom = mergeTheme(light, { colors: { up: '#ff0000' } as ThemeColors });
      expect(custom.colors.up).toBe('#ff0000');
      expect(custom.colors.background).toBe('#f0f2f5');
      expect(light.colors.up).toBe('#cf1322');
    });

    it('should override name', () => {
      const custom = mergeTheme(light, { name: 'custom-light' });
      expect(custom.name).toBe('custom-light');
      expect(custom.id).toBe('light');
    });

    it('should preserve unoverridden values', () => {
      const custom = mergeTheme(light, { colors: { ...light.colors, background: '#000000' } });
      expect(custom.colors.down).toBe('#3f8600');
      expect(custom.chart).toEqual(light.chart);
      expect(custom.fontSize).toEqual(light.fontSize);
      expect(custom.spacing).toEqual(light.spacing);
    });

    it('should deep-merge nested objects without sharing references', () => {
      const custom = mergeTheme(light, { name: 'custom-light' });
      expect(custom.colors).not.toBe(light.colors);
      expect(custom.chart).not.toBe(light.chart);
      expect(custom.fontSize).not.toBe(light.fontSize);
      expect(custom.spacing).not.toBe(light.spacing);
    });

    it('should keep base values when only name is overridden', () => {
      const custom = mergeTheme(light, { name: 'custom-light' });
      expect(custom.colors.up).toBe('#cf1322');
      expect(custom.borderRadius).toBe(6);
      expect(custom.isDark).toBe(false);
    });
  });

  describe('Color Contrast', () => {
    it('should parse hex and rgb colors', () => {
      expect(parseColor('#ffffff')).toEqual({ r: 255, g: 255, b: 255 });
      expect(parseColor('#fff')).toEqual({ r: 255, g: 255, b: 255 });
      expect(parseColor('rgb(51, 51, 51)')).toEqual({ r: 51, g: 51, b: 51 });
      expect(parseColor('red')).toBeNull();
    });

    it('should compute WCAG relative luminance', () => {
      expect(relativeLuminance(255, 255, 255)).toBe(1);
      expect(relativeLuminance(0, 0, 0)).toBe(0);
      expect(relativeLuminance(51, 51, 51)).toBe(0.033104766570885055);
    });

    it('should return 1 for same color', () => {
      expect(calculateContrastRatio('#ffffff', '#ffffff')).toBe(1);
      expect(calculateContrastRatio('#777777', '#777777')).toBe(1);
    });

    it('should return ~21 for black/white', () => {
      expect(calculateContrastRatio('#000000', '#ffffff')).toBe(21);
      expect(calculateContrastRatio('#ffffff', '#000000')).toBe(21);
    });

    it('should meet WCAG AA for text on bg', () => {
      const ratio = calculateContrastRatio('#333333', '#ffffff');
      expect(ratio).toBe(12.63);
      expect(ratio >= 4.5).toBe(true);
      const check = checkColorContrast('#333333', '#ffffff');
      expect(check.ratio).toBe(12.63);
      expect(check.passes.AA_normal).toBe(true);
      expect(check.passes.AA_large).toBe(true);
      expect(check.passes.AAA_normal).toBe(true);
      expect(check.passes.AAA_large).toBe(true);
    });

    it('should fail all thresholds for low contrast', () => {
      const check = checkColorContrast('#777777', '#777777');
      expect(check.ratio).toBe(1);
      expect(check.passes.AA_normal).toBe(false);
      expect(check.passes.AA_large).toBe(false);
      expect(check.passes.AAA_normal).toBe(false);
      expect(check.passes.AAA_large).toBe(false);
    });

    it('should return 0 for unparsable colors', () => {
      expect(calculateContrastRatio('red', '#ffffff')).toBe(0);
      expect(calculateContrastRatio('#ffffff', 'not-a-color')).toBe(0);
    });
  });
});

// Data Visualization Pipeline
describe('Data Visualization Pipeline', () => {
  // 生产无同契约导出（dataTransformUtils.formatAmount 只做金额单位），保留内联
  describe('Axis Formatting', () => {
    const formatYAxis = (value: number, type: 'price' | 'volume' | 'percent') => {
      switch (type) {
        case 'price':
          return value.toFixed(2);
        case 'volume':
          if (value >= 1e8) return (value / 1e8).toFixed(1) + '亿';
          if (value >= 1e4) return (value / 1e4).toFixed(1) + '万';
          return String(value);
        case 'percent':
          return value.toFixed(2) + '%';
      }
    };

    it('should format price to 2 decimals', () => {
      expect(formatYAxis(123.456, 'price')).toBe('123.46');
      expect(formatYAxis(0, 'price')).toBe('0.00');
    });

    it('should format volume in 亿', () => {
      expect(formatYAxis(5e8, 'volume')).toBe('5.0亿');
    });

    it('should format volume in 万', () => {
      expect(formatYAxis(150000, 'volume')).toBe('15.0万');
    });

    it('should format percentage', () => {
      expect(formatYAxis(3.45, 'percent')).toBe('3.45%');
      expect(formatYAxis(-1.5, 'percent')).toBe('-1.50%');
    });

    it('should leave sub-万 volume as raw number', () => {
      expect(formatYAxis(9999, 'volume')).toBe('9999');
    });
  });

  // 绑定 chartInteractionEngine.ts:390
  describe('Tooltip Positioning', () => {
    it('should position to right by default', () => {
      const pos = calculateTooltipPosition(100, 100, 150, 50, 800, 600);
      expect(pos).toEqual({ x: 110, y: 110 });
      expect(pos.x).toBe(110);
      expect(pos.y).toBe(110);
    });

    it('should flip to left when near right edge', () => {
      const pos = calculateTooltipPosition(700, 100, 150, 50, 800, 600);
      expect(pos.x).toBe(540);
      expect(pos.y).toBe(110);
      expect(pos).toEqual({ x: 540, y: 110 });
    });

    it('should clamp to bottom edge', () => {
      const pos = calculateTooltipPosition(100, 580, 150, 50, 800, 600);
      expect(pos.y).toBe(520);
      expect(pos.y + 50 <= 600).toBe(true);
      expect(pos).toEqual({ x: 110, y: 520 });
    });

    it('should clamp to top edge', () => {
      const pos = calculateTooltipPosition(100, 5, 150, 50, 800, 600);
      // 未触发下溢时 y 就是 mouseY+10，旧断言 y>=0 属空洞断言，已订正为精确 15
      expect(pos.y).toBe(15);
      expect(pos).toEqual({ x: 110, y: 15 });
    });

    it('should pin to offset when flipped above viewport', () => {
      const pos = calculateTooltipPosition(100, -100, 150, 50, 800, 600);
      expect(pos).toEqual({ x: 110, y: 10 });
      expect(pos.y).toBe(10);
    });

    it('should pin to offset when flipped left of viewport', () => {
      const pos = calculateTooltipPosition(-50, 100, 150, 50, 800, 600);
      expect(pos).toEqual({ x: 10, y: 110 });
      expect(pos.x).toBe(10);
    });

    it('should respect custom offset', () => {
      expect(calculateTooltipPosition(100, 100, 150, 50, 800, 600, 20)).toEqual({ x: 120, y: 120 });
    });

    it('should round fractional coordinates', () => {
      const pos = calculateTooltipPosition(100.4, 100.6, 150, 50, 800, 600);
      expect(pos.x).toBe(110);
      expect(pos.y).toBe(111);
    });
  });

  // 生产 heatmapEngine.getColorForValue 接固定 colorScheme，非 colors[] 多段色标，故保留内联
  describe('Color Scale', () => {
    const createColorScale = (value: number, min: number, max: number, colors: string[]) => {
      if (max === min) return colors[0];
      const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
      const idx = Math.min(Math.floor(t * (colors.length - 1)), colors.length - 2);
      return colors[idx];
    };

    it('should return first color at min', () => {
      expect(createColorScale(0, 0, 100, ['#00ff00', '#ffff00', '#ff0000'])).toBe('#00ff00');
    });

    it('should return near-last color at max', () => {
      // 满量程时 idx 被夹到 colors.length-2，返回倒数第二色
      expect(createColorScale(100, 0, 100, ['#00ff00', '#ffff00', '#ff0000'])).toBe('#ffff00');
    });

    it('should handle equal min/max', () => {
      expect(createColorScale(5, 5, 5, ['#00ff00', '#ff0000'])).toBe('#00ff00');
    });

    it('should clamp out-of-range values', () => {
      expect(createColorScale(-10, 0, 100, ['#00ff00', '#ff0000'])).toBe('#00ff00');
      expect(createColorScale(200, 0, 100, ['#00ff00', '#ffff00', '#ff0000'])).toBe('#ffff00');
    });

    it('should interpolate middle color for three-color scale', () => {
      expect(createColorScale(5, 0, 10, ['#ff0000', '#00ff00', '#0000ff'])).toBe('#00ff00');
      expect(createColorScale(6, 0, 10, ['#ff0000', '#00ff00', '#0000ff'])).toBe('#00ff00');
    });
  });

  // 绑定 dataFlowEngine.ts:180（键名 start/end → min/max，单值恒回 binCount 箱）
  describe('Data Binning', () => {
    it('should distribute values into bins', () => {
      const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const bins = binData(values, 5);
      expect(bins).toHaveLength(5);
      expect(bins.reduce((s, b) => s + b.count, 0)).toBe(10);
      expect(bins.map(b => b.count)).toEqual([2, 2, 2, 2, 2]);
      expect(bins[0].min).toBe(1);
      expect(bins[4].max).toBe(10);
      expect(bins.map(b => b.items)).toEqual([[1, 2], [3, 4], [5, 6], [7, 8], [9, 10]]);
      for (let i = 0; i < bins.length - 1; i++) {
        expect(bins[i].max).toBe(bins[i + 1].min);
      }
    });

    it('should handle single value', () => {
      const bins = binData([5], 5);
      // 生产无 min===max 单箱特例，恒回 binCount 箱（旧断言 length 1 已订正）
      expect(bins).toHaveLength(5);
      expect(bins[0]).toEqual({ min: 5, max: 6, count: 1, items: [5] });
      expect(bins.map(b => b.count)).toEqual([1, 0, 0, 0, 0]);
      expect(bins[4].max).toBe(10);
    });

    it('should handle empty array', () => {
      expect(binData([], 5)).toEqual([]);
    });

    it('should respect bin count', () => {
      const values = Array.from({ length: 100 }, (_, i) => i);
      const bins = binData(values, 10);
      expect(bins).toHaveLength(10);
      expect(bins.map(b => b.count)).toEqual([10, 10, 10, 10, 10, 10, 10, 10, 10, 10]);
      expect(bins[0].items).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
      expect(bins[9].items).toEqual([90, 91, 92, 93, 94, 95, 96, 97, 98, 99]);
      expect(bins[0].min).toBe(0);
      expect(bins[9].max).toBe(99);
    });

    it('should keep full bin count when all values are equal', () => {
      const bins = binData([5, 5, 5], 3);
      expect(bins).toHaveLength(3);
      expect(bins.map(b => b.count)).toEqual([3, 0, 0]);
      expect(bins[0].items).toEqual([5, 5, 5]);
      expect(bins[0].min).toBe(5);
      expect(bins[2].max).toBe(8);
    });

    it('should place maximum value in last bin', () => {
      const bins = binData([0, 100], 2);
      expect(bins).toHaveLength(2);
      expect(bins[0].items).toEqual([0]);
      expect(bins[1].items).toEqual([100]);
      expect(bins[1].max).toBe(100);
    });
  });
});

// Responsive Breakpoint Logic（绑定 responsiveUtils.ts）
describe('Responsive Breakpoint Logic', () => {
  const FONT_MULTIPLIERS: Record<Breakpoint, number> = {
    xs: 0.85,
    sm: 0.9,
    md: 1,
    lg: 1,
    xl: 1.05,
    '2xl': 1.1,
  };

  // 生产无 getResponsiveFontSize 导出，保留内联；旧 xxl 键改为生产键名 2xl
  const getResponsiveFontSize = (base: number, breakpoint: Breakpoint): number =>
    Math.round(base * FONT_MULTIPLIERS[breakpoint]);

  it('should expose breakpoint map', () => {
    expect(BREAKPOINTS).toEqual({ xs: 0, sm: 640, md: 768, lg: 1024, xl: 1280, '2xl': 1536 });
    expect(BREAKPOINTS['2xl']).toBe(1536);
  });

  it('should identify correct breakpoints', () => {
    expect(getCurrentBreakpoint(400)).toBe('xs');
    expect(getCurrentBreakpoint(600)).toBe('xs');
    expect(getCurrentBreakpoint(800)).toBe('md');
    expect(getCurrentBreakpoint(1000)).toBe('md');
    expect(getCurrentBreakpoint(1400)).toBe('xl');
    expect(getCurrentBreakpoint(1800)).toBe('2xl');
  });

  it('should honor exact breakpoint boundaries', () => {
    const cases: Array<[number, Breakpoint]> = [
      [0, 'xs'],
      [639, 'xs'],
      [640, 'sm'],
      [767, 'sm'],
      [768, 'md'],
      [1023, 'md'],
      [1024, 'lg'],
      [1279, 'lg'],
      [1280, 'xl'],
      [1535, 'xl'],
      [1536, '2xl'],
    ];
    for (const [width, expected] of cases) {
      expect(getCurrentBreakpoint(width)).toBe(expected);
    }
  });

  it('should return correct columns per breakpoint', () => {
    expect(GRID_PRESETS.xs.columns).toBe(1);
    expect(GRID_PRESETS.md.columns).toBe(2);
    expect(GRID_PRESETS.lg.columns).toBe(3);
    expect(GRID_PRESETS.xl.columns).toBe(4);
    expect(GRID_PRESETS['2xl'].columns).toBe(4);
  });

  it('should expose grid gap and padding', () => {
    expect(GRID_PRESETS.xs).toEqual({ columns: 1, gap: 8, padding: 12 });
    expect(GRID_PRESETS.md).toEqual({ columns: 2, gap: 16, padding: 20 });
    expect(GRID_PRESETS['2xl']).toEqual({ columns: 4, gap: 24, padding: 32 });
  });

  it('should hide sidebar on mobile', () => {
    expect(getAdaptiveConfig(400).sidebarVisible).toBe(false);
    expect(getAdaptiveConfig(767).sidebarVisible).toBe(false);
    expect(getAdaptiveConfig(768).sidebarVisible).toBe(true);
    expect(getAdaptiveConfig(800).sidebarVisible).toBe(true);
  });

  it('should calculate responsive columns', () => {
    expect(calculateColumns(1200, 200, 16)).toBe(5);
    expect(calculateColumns(2000, 100, 10)).toBe(6);
    expect(calculateColumns(100, 200, 16)).toBe(1);
    expect(calculateColumns(1200, 200, 16, 3)).toBe(3);
    expect(calculateColumns(0, 100, 10)).toBe(1);
  });

  it('should derive adaptive flags from width', () => {
    expect(getAdaptiveConfig(400)).toMatchObject({
      breakpoint: 'xs',
      isMobile: true,
      isTablet: false,
      isDesktop: false,
      columns: 1,
      sidebarVisible: false,
      tableScroll: true,
      touchFriendly: true,
    });
    expect(getAdaptiveConfig(800)).toMatchObject({
      breakpoint: 'md',
      isMobile: false,
      isTablet: true,
      isDesktop: false,
      columns: 2,
      sidebarVisible: true,
      tableScroll: false,
    });
    expect(getAdaptiveConfig(1024)).toMatchObject({
      breakpoint: 'lg',
      isMobile: false,
      isTablet: false,
      isDesktop: true,
      columns: 3,
    });
    expect(getAdaptiveConfig(1600)).toMatchObject({ breakpoint: '2xl', columns: 4 });
  });

  it('should scale font down on mobile', () => {
    expect(getResponsiveFontSize(16, 'xs')).toBe(14);
    expect(getResponsiveFontSize(16, 'sm')).toBe(14);
    expect(getResponsiveFontSize(16, 'md')).toBe(16);
  });

  it('should keep base font on desktop', () => {
    expect(getResponsiveFontSize(16, 'lg')).toBe(16);
    expect(getResponsiveFontSize(16, 'xl')).toBe(17);
  });

  it('should scale font up on large screens', () => {
    expect(getResponsiveFontSize(16, '2xl')).toBe(18);
    expect(getResponsiveFontSize(20, '2xl')).toBe(22);
  });
});

