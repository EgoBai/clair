import { describe, it, expect } from 'vitest';

// Tooltip定位和弹出层逻辑测试
describe('Tooltip Positioning Logic', () => {
  interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
  }

  type Placement = 'top' | 'bottom' | 'left' | 'right';

  const calcPosition = (
    trigger: Rect,
    tooltip: Rect,
    viewport: Rect,
    placement: Placement = 'top'
  ): { x: number; y: number; placement: Placement } => {
    let x = 0, y = 0;
    let finalPlacement = placement;

    switch (placement) {
      case 'top':
        x = trigger.x + trigger.width / 2 - tooltip.width / 2;
        y = trigger.y - tooltip.height - 8;
        if (y < viewport.y) finalPlacement = 'bottom';
        break;
      case 'bottom':
        x = trigger.x + trigger.width / 2 - tooltip.width / 2;
        y = trigger.y + trigger.height + 8;
        if (y + tooltip.height > viewport.y + viewport.height) finalPlacement = 'top';
        break;
      case 'left':
        x = trigger.x - tooltip.width - 8;
        y = trigger.y + trigger.height / 2 - tooltip.height / 2;
        if (x < viewport.x) finalPlacement = 'right';
        break;
      case 'right':
        x = trigger.x + trigger.width + 8;
        y = trigger.y + trigger.height / 2 - tooltip.height / 2;
        if (x + tooltip.width > viewport.x + viewport.width) finalPlacement = 'left';
        break;
    }

    // Re-calculate if placement changed
    if (finalPlacement !== placement) {
      switch (finalPlacement) {
        case 'top':
          x = trigger.x + trigger.width / 2 - tooltip.width / 2;
          y = trigger.y - tooltip.height - 8;
          break;
        case 'bottom':
          x = trigger.x + trigger.width / 2 - tooltip.width / 2;
          y = trigger.y + trigger.height + 8;
          break;
        case 'right':
          x = trigger.x + trigger.width + 8;
          y = trigger.y + trigger.height / 2 - tooltip.height / 2;
          break;
      }
    }

    // Clamp to viewport
    x = Math.max(viewport.x, Math.min(x, viewport.x + viewport.width - tooltip.width));
    y = Math.max(viewport.y, Math.min(y, viewport.y + viewport.height - tooltip.height));

    return { x, y, placement: finalPlacement };
  };

  const viewport: Rect = { x: 0, y: 0, width: 1000, height: 600 };

  // 基础定位
  describe('Basic Positioning', () => {
    it('should position above trigger for top placement', () => {
      const trigger: Rect = { x: 400, y: 300, width: 100, height: 40 };
      const tooltip: Rect = { x: 0, y: 0, width: 120, height: 30 };
      const pos = calcPosition(trigger, tooltip, viewport, 'top');
      expect(pos.y).toBeLessThan(trigger.y);
    });

    it('should position below trigger for bottom placement', () => {
      const trigger: Rect = { x: 400, y: 300, width: 100, height: 40 };
      const tooltip: Rect = { x: 0, y: 0, width: 120, height: 30 };
      const pos = calcPosition(trigger, tooltip, viewport, 'bottom');
      expect(pos.y).toBeGreaterThan(trigger.y + trigger.height);
    });

    it('should position left of trigger', () => {
      const trigger: Rect = { x: 400, y: 300, width: 100, height: 40 };
      const tooltip: Rect = { x: 0, y: 0, width: 120, height: 30 };
      const pos = calcPosition(trigger, tooltip, viewport, 'left');
      expect(pos.x).toBeLessThan(trigger.x);
    });

    it('should position right of trigger', () => {
      const trigger: Rect = { x: 400, y: 300, width: 100, height: 40 };
      const tooltip: Rect = { x: 0, y: 0, width: 120, height: 30 };
      const pos = calcPosition(trigger, tooltip, viewport, 'right');
      expect(pos.x).toBeGreaterThan(trigger.x + trigger.width);
    });
  });

  // 翻转逻辑
  describe('Flip Logic', () => {
    it('should flip to bottom when no room on top', () => {
      const trigger: Rect = { x: 400, y: 10, width: 100, height: 40 };
      const tooltip: Rect = { x: 0, y: 0, width: 120, height: 30 };
      const pos = calcPosition(trigger, tooltip, viewport, 'top');
      expect(pos.placement).toBe('bottom');
    });

    it('should flip to top when no room on bottom', () => {
      const trigger: Rect = { x: 400, y: 580, width: 100, height: 40 };
      const tooltip: Rect = { x: 0, y: 0, width: 120, height: 30 };
      const pos = calcPosition(trigger, tooltip, viewport, 'bottom');
      expect(pos.placement).toBe('top');
    });

    it('should flip to right when no room on left', () => {
      const trigger: Rect = { x: 5, y: 300, width: 100, height: 40 };
      const tooltip: Rect = { x: 0, y: 0, width: 120, height: 30 };
      const pos = calcPosition(trigger, tooltip, viewport, 'left');
      expect(pos.placement).toBe('right');
    });
  });

  // 视口钳制
  describe('Viewport Clamping', () => {
    it('should clamp x to viewport left', () => {
      const trigger: Rect = { x: 0, y: 300, width: 50, height: 40 };
      const tooltip: Rect = { x: 0, y: 0, width: 120, height: 30 };
      const pos = calcPosition(trigger, tooltip, viewport, 'bottom');
      expect(pos.x).toBeGreaterThanOrEqual(0);
    });

    it('should clamp x to viewport right', () => {
      const trigger: Rect = { x: 950, y: 300, width: 50, height: 40 };
      const tooltip: Rect = { x: 0, y: 0, width: 120, height: 30 };
      const pos = calcPosition(trigger, tooltip, viewport, 'bottom');
      expect(pos.x + 120).toBeLessThanOrEqual(1000);
    });

    it('should clamp y to viewport top', () => {
      const trigger: Rect = { x: 400, y: 0, width: 100, height: 40 };
      const tooltip: Rect = { x: 0, y: 0, width: 120, height: 30 };
      const pos = calcPosition(trigger, tooltip, viewport, 'top');
      expect(pos.y).toBeGreaterThanOrEqual(0);
    });
  });

  // 中心对齐
  describe('Center Alignment', () => {
    it('should center tooltip on trigger horizontally', () => {
      const trigger: Rect = { x: 400, y: 300, width: 100, height: 40 };
      const tooltip: Rect = { x: 0, y: 0, width: 80, height: 30 };
      const pos = calcPosition(trigger, tooltip, viewport, 'top');
      const triggerCenter = trigger.x + trigger.width / 2;
      const tooltipCenter = pos.x + tooltip.width / 2;
      expect(Math.abs(triggerCenter - tooltipCenter)).toBeLessThan(1);
    });

    it('should center tooltip on trigger vertically', () => {
      const trigger: Rect = { x: 400, y: 300, width: 100, height: 40 };
      const tooltip: Rect = { x: 0, y: 0, width: 80, height: 30 };
      const pos = calcPosition(trigger, tooltip, viewport, 'left');
      const triggerCenter = trigger.y + trigger.height / 2;
      const tooltipCenter = pos.y + tooltip.height / 2;
      expect(Math.abs(triggerCenter - tooltipCenter)).toBeLessThan(1);
    });
  });

  // Popover定位
  describe('Popover Positioning', () => {
    const calcPopoverPos = (trigger: Rect, popoverW: number, popoverH: number, vw: number, vh: number) => {
      let x = trigger.x;
      let y = trigger.y + trigger.height + 4;
      if (x + popoverW > vw) x = vw - popoverW;
      if (y + popoverH > vh) y = trigger.y - popoverH - 4;
      return { x, y };
    };

    it('should position below trigger', () => {
      const trigger: Rect = { x: 100, y: 100, width: 80, height: 30 };
      const pos = calcPopoverPos(trigger, 200, 150, 1000, 600);
      expect(pos.y).toBe(134); // 100 + 30 + 4
    });

    it('should shift left when near right edge', () => {
      const trigger: Rect = { x: 900, y: 100, width: 80, height: 30 };
      const pos = calcPopoverPos(trigger, 200, 150, 1000, 600);
      expect(pos.x).toBe(800); // 1000 - 200
    });

    it('should flip above when near bottom', () => {
      const trigger: Rect = { x: 100, y: 550, width: 80, height: 30 };
      const pos = calcPopoverPos(trigger, 200, 150, 1000, 600);
      expect(pos.y).toBe(396); // 550 - 150 - 4
    });
  });

  // Dropdown定位
  describe('Dropdown Positioning', () => {
    const calcDropdownPos = (trigger: Rect, dropdownW: number, dropdownH: number, vh: number) => {
      let y = trigger.y + trigger.height;
      let direction: 'down' | 'up' = 'down';
      if (y + dropdownH > vh) {
        y = trigger.y - dropdownH;
        direction = 'up';
      }
      return { x: trigger.x, y, direction };
    };

    it('should drop down normally', () => {
      const trigger: Rect = { x: 100, y: 100, width: 120, height: 32 };
      const pos = calcDropdownPos(trigger, 200, 150, 600);
      expect(pos.direction).toBe('down');
      expect(pos.y).toBe(132);
    });

    it('should drop up when near bottom', () => {
      const trigger: Rect = { x: 100, y: 550, width: 120, height: 32 };
      const pos = calcDropdownPos(trigger, 200, 150, 600);
      expect(pos.direction).toBe('up');
    });
  });
});
