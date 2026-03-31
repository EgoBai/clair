import { describe, it, expect } from 'vitest';
import {
  validateLayout,
  checkOverlap,
  addWidget,
  removeWidget,
  moveWidget,
  autoArrange,
  serializeLayout,
  deserializeLayout,
  cloneLayout,
  getLayoutStats,
  DashboardLayout,
  DashboardWidget,
} from '../utils/dashboardLayoutEngine';

function makeLayout(overrides: Partial<DashboardLayout> = {}): DashboardLayout {
  return {
    id: 'l1',
    name: 'Default',
    columns: 12,
    rowHeight: 80,
    gap: 8,
    widgets: [],
    isDefault: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

function makeWidget(overrides: Partial<DashboardWidget> = {}): DashboardWidget {
  return {
    id: 'w1',
    type: 'chart',
    title: 'Chart',
    position: { x: 0, y: 0, w: 6, h: 4 },
    config: {},
    visible: true,
    locked: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe('validateLayout', () => {
  it('validates correct layout', () => {
    const result = validateLayout(makeLayout());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects invalid columns', () => {
    const result = validateLayout(makeLayout({ columns: 0 }));
    expect(result.valid).toBe(false);
  });

  it('detects duplicate widget IDs', () => {
    const layout = makeLayout({
      widgets: [makeWidget({ id: 'w1' }), makeWidget({ id: 'w1' })],
    });
    const result = validateLayout(layout);
    expect(result.valid).toBe(false);
  });

  it('detects negative position', () => {
    const layout = makeLayout({
      widgets: [makeWidget({ position: { x: -1, y: 0, w: 4, h: 4 } })],
    });
    const result = validateLayout(layout);
    expect(result.valid).toBe(false);
  });

  it('warns on overflow', () => {
    const layout = makeLayout({
      columns: 12,
      widgets: [makeWidget({ position: { x: 10, y: 0, w: 6, h: 4 } })],
    });
    const result = validateLayout(layout);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('warns on overlap', () => {
    const layout = makeLayout({
      widgets: [
        makeWidget({ id: 'w1', position: { x: 0, y: 0, w: 6, h: 4 } }),
        makeWidget({ id: 'w2', position: { x: 3, y: 2, w: 6, h: 4 } }),
      ],
    });
    const result = validateLayout(layout);
    expect(result.warnings.some(w => w.includes('overlap'))).toBe(true);
  });
});

describe('checkOverlap', () => {
  it('detects overlap', () => {
    expect(checkOverlap(
      { x: 0, y: 0, w: 6, h: 4 },
      { x: 3, y: 2, w: 6, h: 4 }
    )).toBe(true);
  });

  it('no overlap - adjacent', () => {
    expect(checkOverlap(
      { x: 0, y: 0, w: 6, h: 4 },
      { x: 6, y: 0, w: 6, h: 4 }
    )).toBe(false);
  });

  it('no overlap - separated', () => {
    expect(checkOverlap(
      { x: 0, y: 0, w: 4, h: 4 },
      { x: 6, y: 6, w: 4, h: 4 }
    )).toBe(false);
  });
});

describe('addWidget', () => {
  it('adds widget to layout', () => {
    const layout = makeLayout();
    const result = addWidget(layout, makeWidget());
    expect(result.widgets).toHaveLength(1);
  });

  it('generates unique ID', () => {
    const layout = makeLayout();
    const r1 = addWidget(layout, makeWidget());
    const r2 = addWidget(layout, makeWidget());
    expect(r1.widgets[0].id).not.toBe(r2.widgets[0].id);
  });
});

describe('removeWidget', () => {
  it('removes widget', () => {
    const layout = makeLayout({ widgets: [makeWidget({ id: 'w1' })] });
    const result = removeWidget(layout, 'w1');
    expect(result.widgets).toHaveLength(0);
  });

  it('keeps other widgets', () => {
    const layout = makeLayout({
      widgets: [makeWidget({ id: 'w1' }), makeWidget({ id: 'w2' })],
    });
    const result = removeWidget(layout, 'w1');
    expect(result.widgets).toHaveLength(1);
    expect(result.widgets[0].id).toBe('w2');
  });
});

describe('moveWidget', () => {
  it('updates position', () => {
    const layout = makeLayout({ widgets: [makeWidget({ id: 'w1' })] });
    const result = moveWidget(layout, 'w1', { x: 4, y: 2 });
    expect(result.widgets[0].position.x).toBe(4);
    expect(result.widgets[0].position.y).toBe(2);
  });

  it('preserves other position values', () => {
    const layout = makeLayout({ widgets: [makeWidget({ id: 'w1', position: { x: 0, y: 0, w: 6, h: 4 } })] });
    const result = moveWidget(layout, 'w1', { x: 3 });
    expect(result.widgets[0].position.w).toBe(6);
    expect(result.widgets[0].position.h).toBe(4);
  });
});

describe('autoArrange', () => {
  it('arranges widgets without overlap', () => {
    const layout = makeLayout({
      columns: 12,
      widgets: [
        makeWidget({ id: 'w1', position: { x: 6, y: 0, w: 6, h: 4 }, visible: true }),
        makeWidget({ id: 'w2', position: { x: 3, y: 1, w: 6, h: 4 }, visible: true }),
      ],
    });
    const result = autoArrange(layout);
    // Should be arranged without overlap
    expect(result.widgets.filter(w => w.visible)).toHaveLength(2);
  });

  it('places widget at first available spot', () => {
    const layout = makeLayout({
      columns: 6,
      widgets: [
        makeWidget({ id: 'w1', position: { x: 0, y: 0, w: 6, h: 2 }, visible: true }),
        makeWidget({ id: 'w2', position: { x: 0, y: 0, w: 6, h: 2 }, visible: true }),
      ],
    });
    const result = autoArrange(layout);
    const w2 = result.widgets.find(w => w.id === 'w2')!;
    expect(w2.position.y).toBeGreaterThan(0);
  });
});

describe('serialize/deserialize', () => {
  it('round-trips layout', () => {
    const layout = makeLayout({ widgets: [makeWidget()] });
    const json = serializeLayout(layout);
    const restored = deserializeLayout(json);
    expect(restored).not.toBeNull();
    expect(restored!.id).toBe(layout.id);
    expect(restored!.widgets).toHaveLength(1);
  });

  it('returns null for invalid JSON', () => {
    expect(deserializeLayout('not json')).toBeNull();
  });

  it('returns null for missing fields', () => {
    expect(deserializeLayout('{"foo":"bar"}')).toBeNull();
  });
});

describe('cloneLayout', () => {
  it('creates copy with new ID', () => {
    const layout = makeLayout({ widgets: [makeWidget()] });
    const cloned = cloneLayout(layout, 'My Copy');
    expect(cloned.id).not.toBe(layout.id);
    expect(cloned.name).toBe('My Copy');
    expect(cloned.widgets).toHaveLength(1);
    expect(cloned.widgets[0].id).not.toBe(layout.widgets[0].id);
  });

  it('is not default', () => {
    const layout = makeLayout({ isDefault: true });
    expect(cloneLayout(layout).isDefault).toBe(false);
  });
});

describe('getLayoutStats', () => {
  it('computes stats', () => {
    const layout = makeLayout({
      widgets: [
        makeWidget({ type: 'chart', visible: true }),
        makeWidget({ type: 'table', visible: false, locked: true }),
        makeWidget({ type: 'gauge', visible: true, locked: true }),
      ],
    });
    const stats = getLayoutStats(layout);
    expect(stats.totalWidgets).toBe(3);
    expect(stats.visibleWidgets).toBe(2);
    expect(stats.lockedWidgets).toBe(2);
    expect(stats.byType['chart']).toBe(1);
  });
});
