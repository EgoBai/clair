import { describe, it, expect } from 'vitest';

describe('UI Polish Utilities', () => {
  describe('animateValue', () => {
    it('should be importable', async () => {
      const mod = await import('../utils/uiPolish');
      expect(mod.animateValue).toBeDefined();
      expect(typeof mod.animateValue).toBe('function');
    });
  });

  describe('flashChange', () => {
    it('should be a function', async () => {
      const mod = await import('../utils/uiPolish');
      expect(typeof mod.flashChange).toBe('function');
    });
  });

  describe('bounceIn', () => {
    it('should be a function', async () => {
      const mod = await import('../utils/uiPolish');
      expect(typeof mod.bounceIn).toBe('function');
    });
  });

  describe('slideToDelete', () => {
    it('should be a function', async () => {
      const mod = await import('../utils/uiPolish');
      expect(typeof mod.slideToDelete).toBe('function');
    });
  });

  describe('typewriter', () => {
    it('should return stop and promise', async () => {
      const mod = await import('../utils/uiPolish');
      const mockEl = { textContent: '' } as unknown as HTMLElement;
      const result = mod.typewriter(mockEl, 'test', 1);
      expect(result).toHaveProperty('stop');
      expect(result).toHaveProperty('promise');
      expect(typeof result.stop).toBe('function');
      // Clean up
      result.stop();
      await result.promise;
    });

    it('should type characters one by one', async () => {
      const mod = await import('../utils/uiPolish');
      const mockEl = { textContent: '' } as unknown as HTMLElement;
      const result = mod.typewriter(mockEl, 'ab', 10);
      await result.promise;
      expect(mockEl.textContent).toBe('ab');
    });
  });

  describe('shake', () => {
    it('should be a function', async () => {
      const mod = await import('../utils/uiPolish');
      expect(typeof mod.shake).toBe('function');
    });
  });

  describe('addGlowEffect', () => {
    it('should return cleanup function', async () => {
      const mod = await import('../utils/uiPolish');
      const listeners: Record<string, EventListener[]> = {};
      const mockEl = {
        style: {} as CSSStyleDeclaration,
        addEventListener: (ev: string, fn: EventListener) => {
          listeners[ev] = listeners[ev] || [];
          listeners[ev].push(fn);
        },
        removeEventListener: (ev: string, fn: EventListener) => {
          listeners[ev] = (listeners[ev] || []).filter((f) => f !== fn);
        },
      } as unknown as HTMLElement;

      const cleanup = mod.addGlowEffect(mockEl);
      expect(typeof cleanup).toBe('function');
      cleanup();
      expect(listeners['mousemove']).toHaveLength(0);
      expect(listeners['mouseleave']).toHaveLength(0);
    });
  });

  describe('animateBadge', () => {
    it('should be a function', async () => {
      const mod = await import('../utils/uiPolish');
      expect(typeof mod.animateBadge).toBe('function');
    });

    it('should not animate when from equals to', async () => {
      const mod = await import('../utils/uiPolish');
      const mockEl = { textContent: '5', style: {} as CSSStyleDeclaration, setAttribute: () => {} } as unknown as HTMLElement;
      // Should not throw
      mod.animateBadge(mockEl, 5, 5);
      expect(mockEl.textContent).toBe('5');
    });
  });

  describe('animateReorder', () => {
    it('should be a function', async () => {
      const mod = await import('../utils/uiPolish');
      expect(typeof mod.animateReorder).toBe('function');
    });
  });

  describe('flipCard', () => {
    it('should be a function', async () => {
      const mod = await import('../utils/uiPolish');
      expect(typeof mod.flipCard).toBe('function');
    });
  });
});
