import { describe, it, expect } from 'vitest';

// 仪表盘自定义布局引擎
interface Widget {
  id: string; type: 'chart' | 'table' | 'card' | 'heatmap';
  x: number; y: number; w: number; h: number;
  config: Record<string, any>;
}

interface DashboardLayout {
  id: string; name: string; widgets: Widget[];
  gridSize: { cols: number; rows: number };
}

function validateLayout(layout: DashboardLayout): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!layout.id) errors.push('缺少布局ID');
  if (!layout.name) errors.push('缺少布局名称');
  if (layout.gridSize.cols <= 0 || layout.gridSize.rows <= 0) errors.push('网格尺寸无效');
  layout.widgets.forEach((w, i) => {
    if (w.x < 0 || w.y < 0) errors.push(`Widget ${i} 位置为负`);
    if (w.w <= 0 || w.h <= 0) errors.push(`Widget ${i} 尺寸无效`);
    if (w.x + w.w > layout.gridSize.cols) errors.push(`Widget ${i} 超出列边界`);
    if (w.y + w.h > layout.gridSize.rows) errors.push(`Widget ${i} 超出行边界`);
  });
  return { valid: errors.length === 0, errors };
}

function detectOverlap(widgets: Widget[]): boolean {
  for (let i = 0; i < widgets.length; i++) {
    for (let j = i + 1; j < widgets.length; j++) {
      const a = widgets[i], b = widgets[j];
      if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) {
        return true;
      }
    }
  }
  return false;
}

function autoArrange(widgets: Widget[], cols: number): Widget[] {
  let x = 0, y = 0, rowHeight = 0;
  return widgets.map(w => {
    if (x + w.w > cols) { x = 0; y += rowHeight; rowHeight = 0; }
    const arranged = { ...w, x, y };
    x += w.w;
    rowHeight = Math.max(rowHeight, w.h);
    return arranged;
  });
}

function resizeWidget(widget: Widget, newW: number, newH: number, gridCols: number, gridRows: number): Widget {
  return {
    ...widget,
    w: Math.min(newW, gridCols - widget.x),
    h: Math.min(newH, gridRows - widget.y),
  };
}

function cloneLayout(layout: DashboardLayout, newName: string): DashboardLayout {
  return {
    ...layout,
    id: `${layout.id}_clone_${Date.now()}`,
    name: newName,
    widgets: layout.widgets.map(w => ({ ...w, id: `${w.id}_clone` })),
  };
}

function calcGridUtilization(layout: DashboardLayout): number {
  const total = layout.gridSize.cols * layout.gridSize.rows;
  if (total === 0) return 0;
  const used = layout.widgets.reduce((s, w) => s + w.w * w.h, 0);
  return (used / total) * 100;
}

describe('仪表盘自定义布局', () => {
  const sampleLayout: DashboardLayout = {
    id: 'layout1', name: '默认',
    gridSize: { cols: 12, rows: 8 },
    widgets: [
      { id: 'w1', type: 'chart', x: 0, y: 0, w: 6, h: 4, config: {} },
      { id: 'w2', type: 'table', x: 6, y: 0, w: 6, h: 4, config: {} },
    ],
  };

  describe('布局验证', () => {
    it('合法布局应通过验证', () => {
      expect(validateLayout(sampleLayout).valid).toBe(true);
    });

    it('缺少ID应失败', () => {
      expect(validateLayout({ ...sampleLayout, id: '' }).valid).toBe(false);
    });

    it('Widget超出边界应失败', () => {
      const bad = { ...sampleLayout, widgets: [{ id: 'w1', type: 'chart' as const, x: 10, y: 0, w: 6, h: 4, config: {} }] };
      expect(validateLayout(bad).valid).toBe(false);
    });

    it('负位置应失败', () => {
      const bad = { ...sampleLayout, widgets: [{ id: 'w1', type: 'chart' as const, x: -1, y: 0, w: 2, h: 2, config: {} }] };
      expect(validateLayout(bad).valid).toBe(false);
    });
  });

  describe('重叠检测', () => {
    it('不重叠应返回false', () => {
      expect(detectOverlap(sampleLayout.widgets)).toBe(false);
    });

    it('重叠应返回true', () => {
      const overlapping = [
        { id: 'w1', type: 'chart' as const, x: 0, y: 0, w: 6, h: 4, config: {} },
        { id: 'w2', type: 'table' as const, x: 3, y: 2, w: 6, h: 4, config: {} },
      ];
      expect(detectOverlap(overlapping)).toBe(true);
    });

    it('空数组应返回false', () => { expect(detectOverlap([])).toBe(false); });
  });

  describe('自动排列', () => {
    it('应将widget排列到网格中', () => {
      const widgets = [
        { id: 'w1', type: 'chart' as const, x: 0, y: 0, w: 4, h: 3, config: {} },
        { id: 'w2', type: 'table' as const, x: 0, y: 0, w: 4, h: 3, config: {} },
        { id: 'w3', type: 'card' as const, x: 0, y: 0, w: 4, h: 3, config: {} },
      ];
      const arranged = autoArrange(widgets, 12);
      expect(arranged[0].x).toBe(0);
      expect(arranged[1].x).toBe(4);
      expect(arranged[2].x).toBe(8);
    });
  });

  describe('Widget缩放', () => {
    it('应限制在网格边界内', () => {
      const widget = { id: 'w1', type: 'chart' as const, x: 8, y: 6, w: 2, h: 2, config: {} };
      const resized = resizeWidget(widget, 10, 10, 12, 8);
      expect(resized.w).toBeLessThanOrEqual(4);
      expect(resized.h).toBeLessThanOrEqual(2);
    });
  });

  describe('布局克隆', () => {
    it('应创建深拷贝', () => {
      const cloned = cloneLayout(sampleLayout, '副本');
      expect(cloned.name).toBe('副本');
      expect(cloned.id).not.toBe(sampleLayout.id);
      expect(cloned.widgets.length).toBe(sampleLayout.widgets.length);
    });
  });

  describe('网格利用率', () => {
    it('应计算使用率', () => {
      const utilization = calcGridUtilization(sampleLayout);
      expect(utilization).toBeGreaterThan(0);
      expect(utilization).toBeLessThanOrEqual(100);
    });

    it('空布局应为0', () => {
      expect(calcGridUtilization({ ...sampleLayout, widgets: [] })).toBe(0);
    });
  });
});
