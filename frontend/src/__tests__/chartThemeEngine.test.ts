import { describe, it, expect } from 'vitest';

// 图表主题引擎
interface ChartTheme {
  bg: string; grid: string; textColor: string;
  upColor: string; downColor: string;
  volumeUp: string; volumeDown: string;
  ma5: string; ma10: string; ma20: string;
  cursor: string; crosshair: string;
}

const THEMES: Record<string, ChartTheme> = {
  dark: {
    bg: '#1a1a2e', grid: '#2d2d44', textColor: '#8888aa',
    upColor: '#ef4444', downColor: '#22c55e',
    volumeUp: 'rgba(239,68,68,0.5)', volumeDown: 'rgba(34,197,94,0.5)',
    ma5: '#f59e0b', ma10: '#3b82f6', ma20: '#a855f7',
    cursor: '#ffffff', crosshair: '#666688',
  },
  light: {
    bg: '#ffffff', grid: '#e5e7eb', textColor: '#6b7280',
    upColor: '#dc2626', downColor: '#16a34a',
    volumeUp: 'rgba(220,38,38,0.4)', volumeDown: 'rgba(22,163,74,0.4)',
    ma5: '#d97706', ma10: '#2563eb', ma20: '#9333ea',
    cursor: '#111827', crosshair: '#9ca3af',
  },
};

function getTheme(name: string): ChartTheme {
  return THEMES[name] || THEMES.dark;
}

function generateChartCSS(theme: ChartTheme): string {
  return `.chart-container{background:${theme.bg};color:${theme.textColor}}.grid-line{stroke:${theme.grid}}.crosshair{stroke:${theme.crosshair}}`;
}

function interpolateColor(color1: string, color2: string, ratio: number): string {
  const hex = (c: string) => parseInt(c, 16);
  const r1 = hex(color1.slice(1, 3)), g1 = hex(color1.slice(3, 5)), b1 = hex(color1.slice(5, 7));
  const r2 = hex(color2.slice(1, 3)), g2 = hex(color2.slice(3, 5)), b2 = hex(color2.slice(5, 7));
  const r = Math.round(r1 + (r2 - r1) * ratio);
  const g = Math.round(g1 + (g2 - g1) * ratio);
  const b = Math.round(b1 + (b2 - b1) * ratio);
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
}

function getGradientColors(start: string, end: string, steps: number): string[] {
  return Array.from({ length: steps }, (_, i) => interpolateColor(start, end, i / (steps - 1)));
}

function applyOpacity(hexColor: string, opacity: number): string {
  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${opacity})`;
}

function getContrastColor(bg: string): string {
  const r = parseInt(bg.slice(1, 3), 16);
  const g = parseInt(bg.slice(3, 5), 16);
  const b = parseInt(bg.slice(5, 7), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.5 ? '#000000' : '#ffffff';
}

describe('图表主题引擎', () => {
  describe('主题获取', () => {
    it('dark主题应包含正确的配色', () => {
      const theme = getTheme('dark');
      expect(theme.bg).toBe('#1a1a2e');
      expect(theme.upColor).toBe('#ef4444');
      expect(theme.downColor).toBe('#22c55e');
    });

    it('light主题应包含正确的配色', () => {
      const theme = getTheme('light');
      expect(theme.bg).toBe('#ffffff');
    });

    it('未知主题应返回dark', () => {
      expect(getTheme('nonexistent').bg).toBe('#1a1a2e');
    });
  });

  describe('CSS生成', () => {
    it('应生成包含背景色的CSS', () => {
      const css = generateChartCSS(getTheme('dark'));
      expect(css).toContain('#1a1a2e');
      expect(css).toContain('.chart-container');
    });

    it('应包含网格线样式', () => {
      const css = generateChartCSS(getTheme('dark'));
      expect(css).toContain('.grid-line');
    });
  });

  describe('颜色插值', () => {
    it('ratio=0应返回起始色', () => {
      expect(interpolateColor('#ff0000', '#0000ff', 0)).toBe('#ff0000');
    });

    it('ratio=1应返回结束色', () => {
      expect(interpolateColor('#ff0000', '#0000ff', 1)).toBe('#0000ff');
    });

    it('ratio=0.5应返回中间色', () => {
      const result = interpolateColor('#000000', '#ffffff', 0.5);
      expect(result).toMatch(/^#[0-9a-f]{6}$/);
    });
  });

  describe('渐变色生成', () => {
    it('应生成指定步数的颜色', () => {
      const colors = getGradientColors('#000000', '#ffffff', 5);
      expect(colors.length).toBe(5);
    });

    it('首尾应匹配起止色', () => {
      const colors = getGradientColors('#ff0000', '#0000ff', 3);
      expect(colors[0]).toBe('#ff0000');
      expect(colors[2]).toBe('#0000ff');
    });
  });

  describe('透明度', () => {
    it('应生成rgba格式', () => {
      expect(applyOpacity('#ff0000', 0.5)).toBe('rgba(255,0,0,0.5)');
    });

    it('opacity=1应完全不透明', () => {
      expect(applyOpacity('#00ff00', 1)).toBe('rgba(0,255,0,1)');
    });
  });

  describe('对比色', () => {
    it('浅色背景应返回黑色文字', () => {
      expect(getContrastColor('#ffffff')).toBe('#000000');
    });

    it('深色背景应返回白色文字', () => {
      expect(getContrastColor('#000000')).toBe('#ffffff');
    });
  });
});
