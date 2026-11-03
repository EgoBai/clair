/**
 * 仪表盘自定义布局测试
 * 覆盖布局验证、重叠检测、自动排列、Widget缩放、布局克隆、网格利用率
 *
 * 迁移说明：断言已绑定生产实现 frontend/src/utils/dashboardLayoutEngine.ts。
 * 未迁移：Widget 尺寸缩放钳制——生产引擎无 resize 能力、也无行数概念，
 * 该用例保留本地 resizeWidget 并标注「未迁移」。
 */

import { describe, it, expect } from 'vitest';
import {
  validateLayout,
  checkOverlap,
  autoArrange,
  cloneLayout,
  getLayoutStats,
  type DashboardLayout,
  type DashboardWidget,
} from '../utils/dashboardLayoutEngine';

function makeWidget(overrides: Partial<DashboardWidget> = {}): DashboardWidget {
  return {
    id: 'w1',
    type: 'chart',
    title: '图表',
    position: { x: 0, y: 0, w: 6, h: 4 },
    config: {},
    visible: true,
    locked: false,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function makeLayout(overrides: Partial<DashboardLayout> = {}): DashboardLayout {
  return {
    id: 'layout1',
    name: '默认',
    columns: 12,
    rowHeight: 80,
    gap: 8,
    widgets: [],
    isDefault: false,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

const sampleLayout = makeLayout({
  widgets: [
    makeWidget({ id: 'w1', position: { x: 0, y: 0, w: 6, h: 4 } }),
    makeWidget({ id: 'w2', type: 'table', position: { x: 6, y: 0, w: 6, h: 4 } }),
  ],
});

// 未迁移：生产 dashboardLayoutEngine 没有 resize（也无行数上限概念），
// 该能力仅本用例使用，保留本地实现待生产补齐。
function resizeWidget(
  widget: DashboardWidget,
  newW: number,
  newH: number,
  gridCols: number,
  gridRows: number,
): DashboardWidget {
  return {
    ...widget,
    position: {
      ...widget.position,
      w: Math.min(newW, gridCols - widget.position.x),
      h: Math.min(newH, gridRows - widget.position.y),
    },
  };
}

describe('仪表盘自定义布局', () => {
  describe('布局验证', () => {
    it('合法布局应通过验证', () => {
      const result = validateLayout(sampleLayout);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('列数超出1-24应失败', () => {
      const result = validateLayout(makeLayout({ columns: 25 }));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Columns must be between 1 and 24'))).toBe(true);
    });

    it('重复Widget ID应失败', () => {
      const bad = makeLayout({
        widgets: [makeWidget({ id: 'dup' }), makeWidget({ id: 'dup' })],
      });
      const result = validateLayout(bad);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Duplicate widget ID'))).toBe(true);
    });

    it('Widget超出列边界应告警而非报错', () => {
      const bad = makeLayout({
        widgets: [makeWidget({ position: { x: 10, y: 0, w: 6, h: 4 } })],
      });
      const result = validateLayout(bad);
      expect(result.valid).toBe(true);
      expect(result.warnings.some(w => w.includes('overflows columns'))).toBe(true);
    });

    it('负位置应失败', () => {
      const bad = makeLayout({
        widgets: [makeWidget({ position: { x: -1, y: 0, w: 2, h: 2 } })],
      });
      const result = validateLayout(bad);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('negative position'))).toBe(true);
    });
  });

  describe('重叠检测', () => {
    it('不重叠应返回false', () => {
      expect(checkOverlap(
        { x: 0, y: 0, w: 6, h: 4 },
        { x: 6, y: 0, w: 6, h: 4 },
      )).toBe(false);
    });

    it('重叠应返回true', () => {
      expect(checkOverlap(
        { x: 0, y: 0, w: 6, h: 4 },
        { x: 3, y: 2, w: 6, h: 4 },
      )).toBe(true);
    });

    it('空布局应通过验证且无重叠警告', () => {
      const result = validateLayout(makeLayout());
      expect(result.valid).toBe(true);
      expect(result.warnings).toEqual([]);
    });
  });

  describe('自动排列', () => {
    it('应将widget排列到网格中且不重叠', () => {
      const layout = makeLayout({
        widgets: [
          makeWidget({ id: 'w1', position: { x: 0, y: 0, w: 4, h: 3 } }),
          makeWidget({ id: 'w2', type: 'table', position: { x: 0, y: 0, w: 4, h: 3 } }),
          makeWidget({ id: 'w3', type: 'gauge', position: { x: 0, y: 0, w: 4, h: 3 } }),
        ],
      });
      const arranged = autoArrange(layout);
      const byId = new Map(arranged.widgets.map(w => [w.id, w]));
      expect(byId.get('w1')!.position).toEqual({ x: 0, y: 0, w: 4, h: 3 });
      expect(byId.get('w2')!.position).toEqual({ x: 4, y: 0, w: 4, h: 3 });
      expect(byId.get('w3')!.position).toEqual({ x: 8, y: 0, w: 4, h: 3 });
      expect(checkOverlap(byId.get('w1')!.position, byId.get('w2')!.position)).toBe(false);
    });
  });

  describe('Widget缩放（未迁移）', () => {
    it('应限制在网格边界内', () => {
      const widget = makeWidget({ position: { x: 8, y: 6, w: 2, h: 2 } });
      const resized = resizeWidget(widget, 10, 10, 12, 8);
      expect(resized.position.w).toBe(4);
      expect(resized.position.h).toBe(2);
      expect(widget.position.w).toBe(2);
    });
  });

  describe('布局克隆', () => {
    it('应创建带新ID的布局副本', () => {
      const cloned = cloneLayout(sampleLayout, '副本');
      expect(cloned.name).toBe('副本');
      expect(cloned.id).not.toBe(sampleLayout.id);
      expect(cloned.isDefault).toBe(false);
      expect(cloned.widgets).toHaveLength(sampleLayout.widgets.length);
      expect(cloned.widgets[0]).not.toBe(sampleLayout.widgets[0]);
      expect(cloned.widgets[0].id).not.toBe(sampleLayout.widgets[0].id);
    });
  });

  describe('网格利用率', () => {
    it('应计算使用率', () => {
      // 2 个 6x4 组件占满 12 列 x 4 行
      expect(getLayoutStats(sampleLayout).gridUtilization).toBe(100);
    });

    it('空布局应为0', () => {
      expect(getLayoutStats(makeLayout()).gridUtilization).toBe(0);
    });
  });
});
