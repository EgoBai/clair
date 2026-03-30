import { describe, it, expect } from 'vitest';

// Widget and dashboard configuration tests
describe('Widget & Dashboard Configuration', () => {
  // Widget layout
  describe('Widget Layout', () => {
    interface Widget {
      id: string;
      type: 'chart' | 'table' | 'card' | 'gauge';
      x: number;
      y: number;
      w: number;
      h: number;
    }

    function validateLayout(widgets: Widget[]): string[] {
      const errors: string[] = [];
      // Check for overlaps
      for (let i = 0; i < widgets.length; i++) {
        for (let j = i + 1; j < widgets.length; j++) {
          const a = widgets[i], b = widgets[j];
          if (a.x < b.x + b.w && a.x + a.w > b.x &&
              a.y < b.y + b.h && a.y + a.h > b.y) {
            errors.push(`Overlap: ${a.id} and ${b.id}`);
          }
        }
      }
      // Check bounds
      for (const w of widgets) {
        if (w.x < 0 || w.y < 0) errors.push(`Negative position: ${w.id}`);
        if (w.w <= 0 || w.h <= 0) errors.push(`Invalid size: ${w.id}`);
      }
      return errors;
    }

    function compactLayout(widgets: Widget[], columns: number): Widget[] {
      const sorted = [...widgets].sort((a, b) => a.y - b.y || a.x - b.x);
      const heights = new Array(columns).fill(0);
      return sorted.map(w => {
        let bestX = 0, bestY = Infinity;
        for (let x = 0; x <= columns - w.w; x++) {
          const maxY = Math.max(...heights.slice(x, x + w.w));
          if (maxY < bestY) { bestY = maxY; bestX = x; }
        }
        const newW = { ...w, x: bestX, y: bestY };
        for (let x = bestX; x < bestX + w.w; x++) {
          heights[x] = bestY + w.h;
        }
        return newW;
      });
    }

    it('should detect overlapping widgets', () => {
      const widgets: Widget[] = [
        { id: 'a', type: 'card', x: 0, y: 0, w: 2, h: 2 },
        { id: 'b', type: 'card', x: 1, y: 1, w: 2, h: 2 },
      ];
      const errors = validateLayout(widgets);
      expect(errors.some(e => e.includes('Overlap'))).toBe(true);
    });

    it('should pass non-overlapping layout', () => {
      const widgets: Widget[] = [
        { id: 'a', type: 'card', x: 0, y: 0, w: 2, h: 2 },
        { id: 'b', type: 'card', x: 2, y: 0, w: 2, h: 2 },
      ];
      expect(validateLayout(widgets)).toHaveLength(0);
    });

    it('should detect invalid sizes', () => {
      const widgets: Widget[] = [
        { id: 'a', type: 'card', x: 0, y: 0, w: 0, h: 2 },
      ];
      expect(validateLayout(widgets).length).toBeGreaterThan(0);
    });

    it('should compact layout', () => {
      const widgets: Widget[] = [
        { id: 'a', type: 'card', x: 0, y: 10, w: 2, h: 2 },
        { id: 'b', type: 'card', x: 4, y: 0, w: 2, h: 2 },
      ];
      const compacted = compactLayout(widgets, 4);
      expect(compacted[0].y).toBe(0); // should pack to top
    });
  });

  // Dashboard preset configurations
  describe('Dashboard Presets', () => {
    interface DashboardPreset {
      name: string;
      widgets: { type: string; config: Record<string, unknown> }[];
    }

    const presets: DashboardPreset[] = [
      {
        name: 'trader',
        widgets: [
          { type: 'kline', config: { symbol: 'default', period: 'day' } },
          { type: 'orderbook', config: { depth: 5 } },
          { type: 'time-share', config: {} },
          { type: 'positions', config: {} },
        ],
      },
      {
        name: 'analyst',
        widgets: [
          { type: 'sector-heatmap', config: {} },
          { type: 'fund-flow', config: { period: 'week' } },
          { type: 'market-breadth', config: {} },
          { type: 'financials', config: {} },
        ],
      },
      {
        name: 'overview',
        widgets: [
          { type: 'market-summary', config: {} },
          { type: 'top-movers', config: { count: 5 } },
          { type: 'news-feed', config: { limit: 10 } },
        ],
      },
    ];

    it('should have unique preset names', () => {
      const names = presets.map(p => p.name);
      expect(new Set(names).size).toBe(names.length);
    });

    it('should have widgets in each preset', () => {
      for (const preset of presets) {
        expect(preset.widgets.length).toBeGreaterThan(0);
      }
    });

    it('should have type for each widget', () => {
      for (const preset of presets) {
        for (const widget of preset.widgets) {
          expect(widget.type).toBeTruthy();
        }
      }
    });

    it('should have config for each widget', () => {
      for (const preset of presets) {
        for (const widget of preset.widgets) {
          expect(widget.config).toBeDefined();
        }
      }
    });
  });

  // Widget refresh strategy
  describe('Widget Refresh Strategy', () => {
    interface RefreshConfig {
      intervalMs: number;
      strategy: 'polling' | 'websocket' | 'manual';
      paused: boolean;
    }

    class WidgetRefreshManager {
      private configs = new Map<string, RefreshConfig>();

      register(id: string, config: RefreshConfig) {
        this.configs.set(id, config);
      }

      shouldRefresh(id: string): boolean {
        const config = this.configs.get(id);
        if (!config || config.paused) return false;
        return config.strategy !== 'manual';
      }

      getInterval(id: string): number {
        return this.configs.get(id)?.intervalMs ?? 0;
      }

      pause(id: string) {
        const config = this.configs.get(id);
        if (config) config.paused = true;
      }

      resume(id: string) {
        const config = this.configs.get(id);
        if (config) config.paused = false;
      }

      pauseAll() {
        this.configs.forEach(c => c.paused = true);
      }

      getActiveCount(): number {
        let count = 0;
        this.configs.forEach(c => { if (!c.paused && c.strategy !== 'manual') count++; });
        return count;
      }
    }

    it('should register widget', () => {
      const mgr = new WidgetRefreshManager();
      mgr.register('w1', { intervalMs: 5000, strategy: 'polling', paused: false });
      expect(mgr.shouldRefresh('w1')).toBe(true);
    });

    it('should not refresh manual widgets', () => {
      const mgr = new WidgetRefreshManager();
      mgr.register('w1', { intervalMs: 5000, strategy: 'manual', paused: false });
      expect(mgr.shouldRefresh('w1')).toBe(false);
    });

    it('should not refresh paused widgets', () => {
      const mgr = new WidgetRefreshManager();
      mgr.register('w1', { intervalMs: 5000, strategy: 'polling', paused: true });
      expect(mgr.shouldRefresh('w1')).toBe(false);
    });

    it('should pause and resume', () => {
      const mgr = new WidgetRefreshManager();
      mgr.register('w1', { intervalMs: 5000, strategy: 'polling', paused: false });
      mgr.pause('w1');
      expect(mgr.shouldRefresh('w1')).toBe(false);
      mgr.resume('w1');
      expect(mgr.shouldRefresh('w1')).toBe(true);
    });

    it('should pause all widgets', () => {
      const mgr = new WidgetRefreshManager();
      mgr.register('w1', { intervalMs: 1000, strategy: 'polling', paused: false });
      mgr.register('w2', { intervalMs: 2000, strategy: 'websocket', paused: false });
      mgr.pauseAll();
      expect(mgr.getActiveCount()).toBe(0);
    });

    it('should count active widgets', () => {
      const mgr = new WidgetRefreshManager();
      mgr.register('w1', { intervalMs: 1000, strategy: 'polling', paused: false });
      mgr.register('w2', { intervalMs: 2000, strategy: 'websocket', paused: false });
      mgr.register('w3', { intervalMs: 3000, strategy: 'manual', paused: false });
      mgr.register('w4', { intervalMs: 4000, strategy: 'polling', paused: true });
      expect(mgr.getActiveCount()).toBe(2);
    });
  });
});
