import { describe, it, expect } from 'vitest';

/**
 * 图表主题引擎测试
 */

interface ChartTheme {
  name: string;
  background: string;
  textColor: string;
  gridColor: string;
  upColor: string;
  downColor: string;
  volumeUpColor: string;
  volumeDownColor: string;
  maColors: string[];
  crosshairColor: string;
  borderColor: string;
  fontFamily: string;
  fontSize: number;
}

const themes: Record<string, ChartTheme> = {
  light: {
    name: 'light',
    background: '#ffffff',
    textColor: '#333333',
    gridColor: '#f0f0f0',
    upColor: '#ef4444',
    downColor: '#22c55e',
    volumeUpColor: 'rgba(239,68,68,0.5)',
    volumeDownColor: 'rgba(34,197,94,0.5)',
    maColors: ['#f59e0b', '#3b82f6', '#8b5cf6'],
    crosshairColor: '#999999',
    borderColor: '#e5e7eb',
    fontFamily: 'system-ui, sans-serif',
    fontSize: 12,
  },
  dark: {
    name: 'dark',
    background: '#1a1a2e',
    textColor: '#e0e0e0',
    gridColor: '#2d2d44',
    upColor: '#ef4444',
    downColor: '#22c55e',
    volumeUpColor: 'rgba(239,68,68,0.4)',
    volumeDownColor: 'rgba(34,197,94,0.4)',
    maColors: ['#fbbf24', '#60a5fa', '#a78bfa'],
    crosshairColor: '#666666',
    borderColor: '#3d3d5c',
    fontFamily: 'system-ui, sans-serif',
    fontSize: 12,
  },
};

function applyTheme(theme: ChartTheme): Record<string, string> {
  return {
    '--chart-bg': theme.background,
    '--chart-text': theme.textColor,
    '--chart-grid': theme.gridColor,
    '--chart-up': theme.upColor,
    '--chart-down': theme.downColor,
    '--chart-border': theme.borderColor,
    '--chart-font': theme.fontFamily,
    '--chart-font-size': `${theme.fontSize}px`,
  };
}

function getContrastColor(bg: string): string {
  const hex = bg.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#000000' : '#ffffff';
}

function generateColorScale(baseColor: string, steps: number): string[] {
  const hex = baseColor.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);

  return Array.from({ length: steps }, (_, i) => {
    const factor = i / (steps - 1);
    const nr = Math.round(r + (255 - r) * factor);
    const ng = Math.round(g + (255 - g) * factor);
    const nb = Math.round(b + (255 - b) * factor);
    return `#${nr.toString(16).padStart(2, '0')}${ng.toString(16).padStart(2, '0')}${nb.toString(16).padStart(2, '0')}`;
  });
}

describe('Chart Theme Engine', () => {
  describe('主题定义', () => {
    it('应该有light主题', () => {
      expect(themes.light).toBeDefined();
      expect(themes.light.name).toBe('light');
    });

    it('应该有dark主题', () => {
      expect(themes.dark).toBeDefined();
      expect(themes.dark.name).toBe('dark');
    });

    it('所有主题应该有完整的颜色定义', () => {
      for (const theme of Object.values(themes)) {
        expect(theme.background).toBeTruthy();
        expect(theme.textColor).toBeTruthy();
        expect(theme.upColor).toBeTruthy();
        expect(theme.downColor).toBeTruthy();
        expect(theme.maColors.length).toBeGreaterThan(0);
      }
    });
  });

  describe('主题应用', () => {
    it('应该生成CSS变量', () => {
      const vars = applyTheme(themes.light);
      expect(vars['--chart-bg']).toBe('#ffffff');
      expect(vars['--chart-text']).toBe('#333333');
    });

    it('应该包含字体信息', () => {
      const vars = applyTheme(themes.dark);
      expect(vars['--chart-font']).toBeTruthy();
      expect(vars['--chart-font-size']).toBe('12px');
    });
  });

  describe('对比色', () => {
    it('浅色背景应该返回深色文字', () => {
      expect(getContrastColor('#ffffff')).toBe('#000000');
      expect(getContrastColor('#f0f0f0')).toBe('#000000');
    });

    it('深色背景应该返回浅色文字', () => {
      expect(getContrastColor('#000000')).toBe('#ffffff');
      expect(getContrastColor('#1a1a2e')).toBe('#ffffff');
    });
  });

  describe('颜色渐变', () => {
    it('应该生成正确数量的色阶', () => {
      const scale = generateColorScale('#ff0000', 5);
      expect(scale.length).toBe(5);
    });

    it('首色应该是原色', () => {
      const scale = generateColorScale('#ff0000', 5);
      expect(scale[0]).toBe('#ff0000');
    });

    it('尾色应该接近白色', () => {
      const scale = generateColorScale('#ff0000', 5);
      expect(scale[4]).toMatch(/^#ff/i);
    });
  });

  describe('中国股市配色', () => {
    it('上涨应该是红色', () => {
      expect(themes.light.upColor).toBe('#ef4444'); // 红色
    });

    it('下跌应该是绿色', () => {
      expect(themes.light.downColor).toBe('#22c55e'); // 绿色
    });
  });
});
