import { describe, it, expect } from 'vitest';
import {
  PullRefreshController,
  InfiniteScrollController,
  ScrollPositionManager,
} from '../utils/scrollInteractionEngine';

describe('PullRefreshController', () => {
  describe('basic pull refresh flow', () => {
    it('starts in idle state', () => {
      const ctrl = new PullRefreshController();
      expect(ctrl.getState()).toBe('idle');
      expect(ctrl.getDistance()).toBe(0);
    });

    it('does not activate when scrollTop > 0', () => {
      const ctrl = new PullRefreshController();
      ctrl.start(100, 50);
      const r = ctrl.move(200);
      expect(r.distance).toBe(0);
    });

    it('activates when scrollTop = 0', () => {
      const ctrl = new PullRefreshController();
      ctrl.start(100, 0);
      const r = ctrl.move(150);
      expect(r.distance).toBeGreaterThan(0);
      expect(r.state).toBe('pulling');
    });

    it('reaches ready state when threshold met', () => {
      const ctrl = new PullRefreshController({ threshold: 80, resistance: 1 });
      ctrl.start(0, 0);
      const r = ctrl.move(100);
      expect(r.state).toBe('ready');
    });

    it('respects max distance', () => {
      const ctrl = new PullRefreshController({ maxDistance: 100, resistance: 1 });
      ctrl.start(0, 0);
      const r = ctrl.move(500);
      expect(r.distance).toBe(100);
    });

    it('respects resistance factor', () => {
      const ctrl = new PullRefreshController({ resistance: 0.3 });
      ctrl.start(0, 0);
      const r = ctrl.move(100);
      expect(r.distance).toBe(30);
    });
  });

  describe('end gesture', () => {
    it('triggers refresh when threshold met', () => {
      const ctrl = new PullRefreshController({ threshold: 50, resistance: 1 });
      ctrl.start(0, 0);
      ctrl.move(60);
      const r = ctrl.end();
      expect(r.shouldRefresh).toBe(true);
      expect(ctrl.getState()).toBe('refreshing');
    });

    it('does not trigger when below threshold', () => {
      const ctrl = new PullRefreshController({ threshold: 80, resistance: 1 });
      ctrl.start(0, 0);
      ctrl.move(30);
      const r = ctrl.end();
      expect(r.shouldRefresh).toBe(false);
      expect(ctrl.getState()).toBe('idle');
    });

    it('returns snap back duration', () => {
      const ctrl = new PullRefreshController({ snapBackDuration: 500 });
      ctrl.start(0, 0);
      const r = ctrl.end();
      expect(r.snapBackDuration).toBe(500);
    });
  });

  describe('complete & reset', () => {
    it('complete returns delay', () => {
      const ctrl = new PullRefreshController({ completeDelay: 800 });
      const r = ctrl.complete();
      expect(r.completeDelay).toBe(800);
      expect(ctrl.getState()).toBe('complete');
    });

    it('reset clears state', () => {
      const ctrl = new PullRefreshController();
      ctrl.start(0, 0);
      ctrl.move(100);
      ctrl.reset();
      expect(ctrl.getState()).toBe('idle');
      expect(ctrl.getDistance()).toBe(0);
    });
  });

  describe('getProgress & getIndicatorStyle', () => {
    it('progress is 0 at start', () => {
      const ctrl = new PullRefreshController();
      expect(ctrl.getProgress()).toBe(0);
    });

    it('progress reaches 1 at threshold', () => {
      const ctrl = new PullRefreshController({ threshold: 100, resistance: 1 });
      ctrl.start(0, 0);
      ctrl.move(100);
      expect(ctrl.getProgress()).toBe(1);
    });

    it('progress caps at 1', () => {
      const ctrl = new PullRefreshController({ threshold: 100, maxDistance: 200, resistance: 1 });
      ctrl.start(0, 0);
      ctrl.move(200);
      expect(ctrl.getProgress()).toBe(1);
    });

    it('indicator style reflects distance', () => {
      const ctrl = new PullRefreshController({ threshold: 100, resistance: 1 });
      ctrl.start(0, 0);
      ctrl.move(50);
      const style = ctrl.getIndicatorStyle();
      expect(style.translateY).toBe(50);
      expect(style.opacity).toBeGreaterThan(0);
      expect(style.rotate).toBeGreaterThan(0);
    });
  });
});

describe('InfiniteScrollController', () => {
  describe('trigger logic', () => {
    it('should not trigger when far from bottom', () => {
      const ctrl = new InfiniteScrollController({ threshold: 200 });
      expect(ctrl.shouldTrigger(0, 2000, 800)).toBe(false);
    });

    it('should trigger when near bottom', () => {
      const ctrl = new InfiniteScrollController({ threshold: 200, debounceMs: 0 });
      // scrollHeight(2000) - clientHeight(800) - scrollTop(1650) = 150 < 200
      expect(ctrl.shouldTrigger(1650, 2000, 800)).toBe(true);
    });

    it('should not trigger while loading', () => {
      const ctrl = new InfiniteScrollController({ threshold: 200, debounceMs: 0 });
      ctrl.startLoading();
      expect(ctrl.shouldTrigger(1650, 2000, 800)).toBe(false);
    });

    it('should debounce rapid triggers', () => {
      const ctrl = new InfiniteScrollController<string>({ threshold: 200, debounceMs: 500, pageSize: 5 });
      const now = 10000;
      expect(ctrl.shouldTrigger(1650, 2000, 800, now)).toBe(true);
      ctrl.startLoading(now);
      ctrl.loadSuccess(['a', 'b', 'c', 'd', 'e']); // full page, stays idle
      expect(ctrl.shouldTrigger(1650, 2000, 800, now + 100)).toBe(false);
      expect(ctrl.shouldTrigger(1650, 2000, 800, now + 600)).toBe(true);
    });
  });

  describe('load success', () => {
    it('accumulates items', () => {
      const ctrl = new InfiniteScrollController<string>({ pageSize: 3 });
      ctrl.startLoading();
      const r1 = ctrl.loadSuccess(['a', 'b', 'c']);
      expect(r1.items).toEqual(['a', 'b', 'c']);

      ctrl.startLoading();
      const r2 = ctrl.loadSuccess(['d', 'e', 'f']);
      expect(r2.items).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    });

    it('marks complete when data < pageSize', () => {
      const ctrl = new InfiniteScrollController<string>({ pageSize: 5 });
      ctrl.startLoading();
      ctrl.loadSuccess(['a', 'b']);
      expect(ctrl.getStatus()).toBe('complete');
    });

    it('stays idle when data == pageSize', () => {
      const ctrl = new InfiniteScrollController<string>({ pageSize: 3 });
      ctrl.startLoading();
      ctrl.loadSuccess(['a', 'b', 'c']);
      expect(ctrl.getStatus()).toBe('idle');
    });
  });

  describe('load error', () => {
    it('retries within limit', () => {
      const ctrl = new InfiniteScrollController({ retryLimit: 3 });
      ctrl.startLoading();
      const r = ctrl.loadError();
      expect(r.shouldRetry).toBe(true);
      expect(r.status).toBe('retrying');
    });

    it('stops retrying after limit', () => {
      const ctrl = new InfiniteScrollController({ retryLimit: 2 });
      ctrl.startLoading();
      ctrl.loadError();
      ctrl.startLoading();
      ctrl.loadError();
      ctrl.startLoading();
      const r = ctrl.loadError();
      expect(r.shouldRetry).toBe(false);
      expect(r.status).toBe('error');
    });

    it('increases delay on retry', () => {
      const ctrl = new InfiniteScrollController({ retryDelay: 1000 });
      ctrl.startLoading();
      const r1 = ctrl.loadError();
      ctrl.startLoading();
      const r2 = ctrl.loadError();
      expect(r2.retryDelay).toBeGreaterThan(r1.retryDelay);
    });

    it('resets error count on success', () => {
      const ctrl = new InfiniteScrollController({ retryLimit: 3 });
      ctrl.startLoading();
      ctrl.loadError();
      ctrl.startLoading();
      ctrl.loadSuccess(['x']);
      ctrl.startLoading();
      ctrl.loadError();
      expect(ctrl.loadError().shouldRetry).toBe(true);
    });
  });

  describe('pagination info', () => {
    it('returns correct pagination', () => {
      const ctrl = new InfiniteScrollController<string>({ pageSize: 2 });
      expect(ctrl.getPagination()).toEqual({ page: 0, totalLoaded: 0, hasMore: true });

      ctrl.startLoading();
      ctrl.loadSuccess(['a', 'b']);
      expect(ctrl.getPagination().page).toBe(1);
      expect(ctrl.getPagination().totalLoaded).toBe(2);
    });
  });

  describe('reset', () => {
    it('clears all state', () => {
      const ctrl = new InfiniteScrollController<string>();
      ctrl.startLoading();
      ctrl.loadSuccess(['a']);
      ctrl.reset();
      expect(ctrl.getStatus()).toBe('idle');
      expect(ctrl.getAllItems()).toEqual([]);
    });
  });

  describe('page eviction', () => {
    it('evicts old pages when over maxPages', () => {
      const ctrl = new InfiniteScrollController<string>({ pageSize: 1, maxPages: 2 });
      ctrl.startLoading();
      ctrl.loadSuccess(['a']);
      ctrl.startLoading();
      ctrl.loadSuccess(['b']);
      ctrl.startLoading();
      ctrl.loadSuccess(['c']);
      expect(ctrl.getCachedPageCount()).toBe(2);
      expect(ctrl.getAllItems()).toEqual(['b', 'c']);
    });
  });
});

describe('ScrollPositionManager', () => {
  it('saves and restores position', () => {
    const mgr = new ScrollPositionManager();
    mgr.save('/stocks', 500);
    expect(mgr.restore('/stocks')).toBe(500);
  });

  it('returns null for unknown path', () => {
    const mgr = new ScrollPositionManager();
    expect(mgr.restore('/unknown')).toBeNull();
  });

  it('clears specific path', () => {
    const mgr = new ScrollPositionManager();
    mgr.save('/a', 100);
    mgr.save('/b', 200);
    mgr.clear('/a');
    expect(mgr.restore('/a')).toBeNull();
    expect(mgr.restore('/b')).toBe(200);
  });

  it('clears all paths', () => {
    const mgr = new ScrollPositionManager();
    mgr.save('/a', 100);
    mgr.save('/b', 200);
    mgr.clear();
    expect(mgr.getAll()).toHaveLength(0);
  });

  it('evicts oldest entries when over limit', () => {
    const mgr = new ScrollPositionManager(2);
    mgr.save('/a', 100);
    mgr.save('/b', 200);
    mgr.save('/c', 300);
    expect(mgr.getAll()).toHaveLength(2);
    expect(mgr.restore('/a')).toBeNull();
    expect(mgr.restore('/b')).toBe(200);
    expect(mgr.restore('/c')).toBe(300);
  });

  it('overwrites existing path', () => {
    const mgr = new ScrollPositionManager();
    mgr.save('/a', 100);
    mgr.save('/a', 200);
    expect(mgr.restore('/a')).toBe(200);
    expect(mgr.getAll()).toHaveLength(1);
  });
});
