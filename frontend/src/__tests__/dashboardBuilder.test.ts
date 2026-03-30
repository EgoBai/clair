import { describe, it, expect, beforeEach } from 'vitest';

// Custom Dashboard Builder
interface DashboardWidget {
  id: string;
  type: 'chart' | 'table' | 'metric' | 'heatmap' | 'gauge' | 'map' | 'news' | 'watchlist';
  title: string;
  position: { x: number; y: number; w: number; h: number };
  config: Record<string, unknown>;
  dataSource: string;
  refreshInterval: number;
  visible: boolean;
  locked: boolean;
}

interface DashboardLayout {
  id: string;
  name: string;
  description: string;
  widgets: DashboardWidget[];
  gridSize: { columns: number; rowHeight: number };
  breakpoints: Record<string, number>;
  createdAt: Date;
  updatedAt: Date;
  isDefault: boolean;
  isShared: boolean;
}

interface DashboardTemplate {
  id: string;
  name: string;
  category: string;
  widgets: Omit<DashboardWidget, 'id'>[];
  preview: string;
  tags: string[];
}

class DashboardBuilder {
  private layouts: Map<string, DashboardLayout> = new Map();
  private templates: Map<string, DashboardTemplate> = new Map();
  private activeLayoutId: string | null = null;
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private subscriptions: Map<string, (layout: DashboardLayout) => void> = new Map();

  createLayout(name: string, description = ''): DashboardLayout {
    const layout: DashboardLayout = {
      id: `layout_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      name,
      description,
      widgets: [],
      gridSize: { columns: 12, rowHeight: 80 },
      breakpoints: { lg: 1200, md: 996, sm: 768, xs: 480 },
      createdAt: new Date(),
      updatedAt: new Date(),
      isDefault: false,
      isShared: false,
    };
    this.layouts.set(layout.id, layout);
    this.saveUndo();
    return layout;
  }

  addWidget(layoutId: string, widget: Omit<DashboardWidget, 'id'>): DashboardWidget {
    const layout = this.layouts.get(layoutId);
    if (!layout) throw new Error('Layout not found');

    const newWidget: DashboardWidget = {
      ...widget,
      id: `widget_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    };
    layout.widgets.push(newWidget);
    layout.updatedAt = new Date();
    this.saveUndo();
    this.notify(layout);
    return newWidget;
  }

  removeWidget(layoutId: string, widgetId: string): boolean {
    const layout = this.layouts.get(layoutId);
    if (!layout) return false;
    const idx = layout.widgets.findIndex(w => w.id === widgetId);
    if (idx >= 0) {
      layout.widgets.splice(idx, 1);
      layout.updatedAt = new Date();
      this.saveUndo();
      this.notify(layout);
      return true;
    }
    return false;
  }

  moveWidget(layoutId: string, widgetId: string, position: { x: number; y: number }): boolean {
    const layout = this.layouts.get(layoutId);
    if (!layout) return false;
    const widget = layout.widgets.find(w => w.id === widgetId);
    if (widget) {
      widget.position.x = position.x;
      widget.position.y = position.y;
      layout.updatedAt = new Date();
      return true;
    }
    return false;
  }

  resizeWidget(layoutId: string, widgetId: string, size: { w: number; h: number }): boolean {
    const layout = this.layouts.get(layoutId);
    if (!layout) return false;
    const widget = layout.widgets.find(w => w.id === widgetId);
    if (widget) {
      widget.position.w = Math.max(1, size.w);
      widget.position.h = Math.max(1, size.h);
      layout.updatedAt = new Date();
      return true;
    }
    return false;
  }

  toggleWidgetVisibility(layoutId: string, widgetId: string): boolean {
    const layout = this.layouts.get(layoutId);
    if (!layout) return false;
    const widget = layout.widgets.find(w => w.id === widgetId);
    if (widget) {
      widget.visible = !widget.visible;
      return true;
    }
    return false;
  }

  duplicateWidget(layoutId: string, widgetId: string): DashboardWidget | null {
    const layout = this.layouts.get(layoutId);
    if (!layout) return null;
    const widget = layout.widgets.find(w => w.id === widgetId);
    if (!widget) return null;
    return this.addWidget(layoutId, {
      ...widget,
      title: `${widget.title} (copy)`,
      position: { ...widget.position, x: widget.position.x + 1 },
    });
  }

  checkOverlap(layoutId: string): string[] {
    const layout = this.layouts.get(layoutId);
    if (!layout) return [];
    const conflicts: string[] = [];
    const widgets = layout.widgets;
    for (let i = 0; i < widgets.length; i++) {
      for (let j = i + 1; j < widgets.length; j++) {
        const a = widgets[i].position;
        const b = widgets[j].position;
        if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) {
          conflicts.push(`${widgets[i].id} overlaps with ${widgets[j].id}`);
        }
      }
    }
    return conflicts;
  }

  autoArrange(layoutId: string): void {
    const layout = this.layouts.get(layoutId);
    if (!layout) return;
    const cols = layout.gridSize.columns;
    let currentX = 0;
    let currentY = 0;
    let maxHeight = 0;

    for (const widget of layout.widgets) {
      if (!widget.visible) continue;
      if (currentX + widget.position.w > cols) {
        currentX = 0;
        currentY += maxHeight;
        maxHeight = 0;
      }
      widget.position.x = currentX;
      widget.position.y = currentY;
      currentX += widget.position.w;
      maxHeight = Math.max(maxHeight, widget.position.h);
    }
    layout.updatedAt = new Date();
  }

  fromTemplate(templateId: string, name: string): DashboardLayout {
    const template = this.templates.get(templateId);
    if (!template) throw new Error('Template not found');

    const layout = this.createLayout(name, `From template: ${template.name}`);
    for (const widget of template.widgets) {
      this.addWidget(layout.id, widget);
    }
    return layout;
  }

  registerTemplate(template: Omit<DashboardTemplate, 'id'>): string {
    const id = `tpl_${Date.now()}`;
    this.templates.set(id, { ...template, id });
    return id;
  }

  undo(): boolean {
    if (this.undoStack.length === 0) return false;
    this.redoStack.push(this.undoStack.pop()!);
    return true;
  }

  redo(): boolean {
    if (this.redoStack.length === 0) return false;
    this.undoStack.push(this.redoStack.pop()!);
    return true;
  }

  private saveUndo(): void {
    this.undoStack.push(JSON.stringify(Array.from(this.layouts.values())));
    this.redoStack = [];
  }

  subscribe(id: string, callback: (layout: DashboardLayout) => void): void {
    this.subscriptions.set(id, callback);
  }

  unsubscribe(id: string): void {
    this.subscriptions.delete(id);
  }

  private notify(layout: DashboardLayout): void {
    for (const cb of this.subscriptions.values()) {
      cb(layout);
    }
  }

  exportLayout(layoutId: string): string {
    const layout = this.layouts.get(layoutId);
    if (!layout) throw new Error('Layout not found');
    return JSON.stringify(layout, null, 2);
  }

  importLayout(json: string): DashboardLayout {
    const data = JSON.parse(json);
    const layout: DashboardLayout = {
      ...data,
      id: `layout_${Date.now()}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.layouts.set(layout.id, layout);
    return layout;
  }

  getLayout(id: string): DashboardLayout | undefined {
    return this.layouts.get(id);
  }

  getAllLayouts(): DashboardLayout[] {
    return Array.from(this.layouts.values());
  }

  deleteLayout(id: string): boolean {
    return this.layouts.delete(id);
  }

  setActive(id: string): void {
    this.activeLayoutId = id;
  }

  getActive(): DashboardLayout | null {
    return this.activeLayoutId ? this.layouts.get(this.activeLayoutId) ?? null : null;
  }

  getTemplates(): DashboardTemplate[] {
    return Array.from(this.templates.values());
  }

  getWidgetCount(layoutId: string): number {
    return this.layouts.get(layoutId)?.widgets.length ?? 0;
  }
}

describe('Dashboard Builder', () => {
  let builder: DashboardBuilder;

  beforeEach(() => {
    builder = new DashboardBuilder();
  });

  it('should create layout', () => {
    const layout = builder.createLayout('My Dashboard');
    expect(layout.name).toBe('My Dashboard');
    expect(layout.widgets).toHaveLength(0);
    expect(layout.gridSize.columns).toBe(12);
  });

  it('should add widget', () => {
    const layout = builder.createLayout('Test');
    const widget = builder.addWidget(layout.id, {
      type: 'chart',
      title: 'Price Chart',
      position: { x: 0, y: 0, w: 6, h: 4 },
      config: {},
      dataSource: 'stocks',
      refreshInterval: 5000,
      visible: true,
      locked: false,
    });
    expect(widget.id).toBeTruthy();
    expect(widget.title).toBe('Price Chart');
    expect(builder.getWidgetCount(layout.id)).toBe(1);
  });

  it('should remove widget', () => {
    const layout = builder.createLayout('Test');
    const widget = builder.addWidget(layout.id, {
      type: 'table', title: 'T', position: { x: 0, y: 0, w: 4, h: 3 },
      config: {}, dataSource: 's', refreshInterval: 0, visible: true, locked: false,
    });
    expect(builder.removeWidget(layout.id, widget.id)).toBe(true);
    expect(builder.getWidgetCount(layout.id)).toBe(0);
  });

  it('should move widget', () => {
    const layout = builder.createLayout('Test');
    const widget = builder.addWidget(layout.id, {
      type: 'metric', title: 'M', position: { x: 0, y: 0, w: 2, h: 2 },
      config: {}, dataSource: 's', refreshInterval: 0, visible: true, locked: false,
    });
    builder.moveWidget(layout.id, widget.id, { x: 4, y: 2 });
    const updated = builder.getLayout(layout.id)!;
    expect(updated.widgets[0].position.x).toBe(4);
    expect(updated.widgets[0].position.y).toBe(2);
  });

  it('should resize widget', () => {
    const layout = builder.createLayout('Test');
    const widget = builder.addWidget(layout.id, {
      type: 'chart', title: 'C', position: { x: 0, y: 0, w: 4, h: 3 },
      config: {}, dataSource: 's', refreshInterval: 0, visible: true, locked: false,
    });
    builder.resizeWidget(layout.id, widget.id, { w: 8, h: 6 });
    expect(builder.getLayout(layout.id)!.widgets[0].position.w).toBe(8);
  });

  it('should toggle widget visibility', () => {
    const layout = builder.createLayout('Test');
    const widget = builder.addWidget(layout.id, {
      type: 'news', title: 'N', position: { x: 0, y: 0, w: 3, h: 3 },
      config: {}, dataSource: 's', refreshInterval: 0, visible: true, locked: false,
    });
    builder.toggleWidgetVisibility(layout.id, widget.id);
    expect(builder.getLayout(layout.id)!.widgets[0].visible).toBe(false);
  });

  it('should duplicate widget', () => {
    const layout = builder.createLayout('Test');
    const widget = builder.addWidget(layout.id, {
      type: 'gauge', title: 'G', position: { x: 0, y: 0, w: 2, h: 2 },
      config: { max: 100 }, dataSource: 's', refreshInterval: 0, visible: true, locked: false,
    });
    const dup = builder.duplicateWidget(layout.id, widget.id);
    expect(dup).toBeTruthy();
    expect(dup!.title).toContain('copy');
    expect(builder.getWidgetCount(layout.id)).toBe(2);
  });

  it('should check overlaps', () => {
    const layout = builder.createLayout('Test');
    builder.addWidget(layout.id, {
      type: 'chart', title: 'A', position: { x: 0, y: 0, w: 6, h: 4 },
      config: {}, dataSource: 's', refreshInterval: 0, visible: true, locked: false,
    });
    builder.addWidget(layout.id, {
      type: 'chart', title: 'B', position: { x: 2, y: 1, w: 6, h: 4 },
      config: {}, dataSource: 's', refreshInterval: 0, visible: true, locked: false,
    });
    const conflicts = builder.checkOverlap(layout.id);
    expect(conflicts.length).toBeGreaterThan(0);
  });

  it('should auto arrange', () => {
    const layout = builder.createLayout('Test');
    for (let i = 0; i < 4; i++) {
      builder.addWidget(layout.id, {
        type: 'metric', title: `W${i}`, position: { x: 0, y: 0, w: 3, h: 2 },
        config: {}, dataSource: 's', refreshInterval: 0, visible: true, locked: false,
      });
    }
    builder.autoArrange(layout.id);
    const widgets = builder.getLayout(layout.id)!.widgets;
    expect(widgets[1].position.x).toBe(3);
  });

  it('should register and use template', () => {
    const tplId = builder.registerTemplate({
      name: 'Trading Overview',
      category: 'trading',
      widgets: [
        { type: 'chart', title: 'Chart', position: { x: 0, y: 0, w: 12, h: 6 }, config: {}, dataSource: 's', refreshInterval: 0, visible: true, locked: false },
      ],
      preview: '',
      tags: ['trading'],
    });
    const layout = builder.fromTemplate(tplId, 'My Trading');
    expect(layout.widgets).toHaveLength(1);
  });

  it('should export and import layout', () => {
    const layout = builder.createLayout('Exportable');
    builder.addWidget(layout.id, {
      type: 'map', title: 'M', position: { x: 0, y: 0, w: 6, h: 4 },
      config: {}, dataSource: 's', refreshInterval: 0, visible: true, locked: false,
    });
    const json = builder.exportLayout(layout.id);
    const imported = builder.importLayout(json);
    expect(imported.widgets).toHaveLength(1);
  });

  it('should delete layout', () => {
    const layout = builder.createLayout('Temp');
    expect(builder.deleteLayout(layout.id)).toBe(true);
    expect(builder.getLayout(layout.id)).toBeUndefined();
  });

  it('should set and get active layout', () => {
    const layout = builder.createLayout('Active');
    builder.setActive(layout.id);
    expect(builder.getActive()?.id).toBe(layout.id);
  });

  it('should subscribe and unsubscribe', () => {
    let called = false;
    builder.subscribe('test', () => { called = true; });
    const layout = builder.createLayout('Test');
    builder.addWidget(layout.id, {
      type: 'watchlist', title: 'W', position: { x: 0, y: 0, w: 3, h: 6 },
      config: {}, dataSource: 's', refreshInterval: 0, visible: true, locked: false,
    });
    expect(called).toBe(true);
    builder.unsubscribe('test');
  });

  it('should get all layouts', () => {
    builder.createLayout('L1');
    builder.createLayout('L2');
    expect(builder.getAllLayouts()).toHaveLength(2);
  });

  it('should handle undo and redo', () => {
    builder.createLayout('Test');
    expect(builder.undo()).toBe(true);
    expect(builder.redo()).toBe(true);
  });

  it('should get templates', () => {
    builder.registerTemplate({ name: 'T1', category: 'c', widgets: [], preview: '', tags: [] });
    expect(builder.getTemplates()).toHaveLength(1);
  });

  it('should handle resize to minimum', () => {
    const layout = builder.createLayout('Test');
    const widget = builder.addWidget(layout.id, {
      type: 'heatmap', title: 'H', position: { x: 0, y: 0, w: 4, h: 4 },
      config: {}, dataSource: 's', refreshInterval: 0, visible: true, locked: false,
    });
    builder.resizeWidget(layout.id, widget.id, { w: -5, h: -3 });
    expect(builder.getLayout(layout.id)!.widgets[0].position.w).toBe(1);
    expect(builder.getLayout(layout.id)!.widgets[0].position.h).toBe(1);
  });
});
