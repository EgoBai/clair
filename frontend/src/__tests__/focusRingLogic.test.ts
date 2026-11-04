import { describe, it, expect, afterEach } from 'vitest';
import { createFocusTrap, getFocusableElements } from '../utils/a11yEngine';

/**
 * 影子测试迁移（批次 32b）— FocusRing 焦点环 / 键盘导航 / FocusTrap
 *
 * 迁移前：本文件自抄 10 个 helper（getFocusableElements/findNextFocusable/findNextFocusableWrapped/
 * handleKeyDown/shouldPreventDefault/calcFocusRingStyle/getElementsInGroup/getNextGroup/createFocusTrap/
 * isValidTabIndex），不 import 任何生产模块。
 * 迁移后：能在生产仓找到同契约导出的符号改为 import 真源；纯数据版焦点集合改名
 * getFocusableElementsData 保留给未迁移 helper；其余按「未迁移·生产缺口」原样内联。
 * 用例数：27 → 28（原有 describe/it 全保留；原 getFocusableElements 组 3 条重写为 DOM 契约并新增 1 条，
 * 原 createFocusTrap 组 2 条重写为生产激活/恢复契约）。
 *
 * ── 一、绑定真源 ──
 * | 本文件符号 | 生产文件:行 | 契约 |
 * | getFocusableElements | frontend/src/utils/a11yEngine.ts:386-394 | 入参 HTMLElement 容器；selector :387-391
 * |   |   | （a[href]/button/input/select/textarea/[tabindex]:not([tabindex="-1"])/[contenteditable]）；
 * |   |   | querySelectorAll 返回 DOM 文档序，不做 tabIndex 排序。 |
 * | createFocusTrap | frontend/src/utils/a11yEngine.ts:399-420 | 返回 { activate, deactivate, isActive }
 * |   |   | （isActive 为 getter :419）；activate 记录 activeElement 并聚焦第一个可聚焦元素（:407-411），
 * |   |   | deactivate 恢复 previousFocus（:414-417）。 |
 *
 * ── 二、旧断言订正（旧值 → 生产值 + file:line）──
 * | 旧断言 | 生产值 + 位置 |
 * | getFocusableElements 入参是 FocusableElement[] 纯数据、按 tabIndex 升序排序 | 入参是 HTMLElement 容器，
 * |   | 返回 querySelectorAll 文档序、不排序（a11yEngine.ts:393）；用例改为 tabIndex 2 在前、1 在后的 DOM，
 * |   | 断言 ['b','a']。 |
 * | tabIndex<0 一律被过滤（原 x: tabIndex -1 用例） | 生产只按属性排除非按钮的 [tabindex="-1"]（:390），
 * |   | 而 button 命中 button:not([disabled])（:388），即使 tabindex="-1" 仍返回；用例改为 div tabindex=-1 排除、
 * |   | div tabindex=0 保留，并新增 button tabindex=-1 仍命中。 |
 * | createFocusTrap 返回 { firstElement, lastElement, canTrap } | 生产返回 { activate, deactivate, isActive }
 * |   | （:399-403），不导出 first/last/canTrap；断言改为 activate 后 document.activeElement 为第一个可聚焦元素、
 * |   | isActive true→false、deactivate 恢复触发元素焦点。 |
 * | 空元素时 canTrap=false | 空容器 activate 不抛错、isActive=true、焦点不移动（:410-411 的 length 守卫），
 * |   | deactivate 后 activeElement 仍为 body。 |
 *
 * ── 三、未迁移·生产缺口 ──
 * - findNextFocusable / findNextFocusableWrapped：生产用 accessibility.ts:368 useArrowNavigation 对真实 DOM 直接
 *   focus（loop 默认 true :371，环回取模 :422-423），没有「返回下一个 FocusableElement」的纯函数导出，
 *   现有纯数据 helper 无同契约可替换，保留内联。
 * - handleKeyDown / shouldPreventDefault：生产无 key→direction 纯函数，按键映射内嵌在 useArrowNavigation 的
 *   keydown 回调（accessibility.ts:399-421），且默认 orientation='vertical' 时 ArrowLeft/ArrowRight 直接 return
 *   （:400-408），与旧「左右键分别映射 next/prev」不一致，不能以生产为准硬改断言，保留内联。
 * - calcFocusRingStyle：生产 FocusRing 组件用 CSS outline/outline-offset（components/Common/FocusRing.tsx:14-27），
 *   无 rect→{top,left,width,height,borderWidth} 计算导出，保留内联。
 * - getElementsInGroup / getNextGroup / isValidTabIndex：frontend/src、backend/src、shared 非测试源码均无同名或
 *   同契约导出（rg getNextGroup|isValidTabIndex 仅命中本文件），保留内联。
 * - 内联 getFocusableElementsData：生产 getFocusableElements 已改签名为 DOM 容器，上述未迁移 helper 仍依赖纯数据
 *   版本，故更名保留，避免与 import 的生产符号同名。
 */

type FocusDirection = 'next' | 'prev' | 'first' | 'last';
type FocusTrapMode = 'loop' | 'stop' | 'none';

interface FocusableElement {
  id: string;
  tabIndex: number;
  disabled: boolean;
  group?: string;
}

interface FocusRingConfig {
  trapMode: FocusTrapMode;
  autoFocus: boolean;
  restoreFocus: boolean;
  wrapAround: boolean;
}

/**
 * 未迁移：纯数据版焦点集合，供 findNextFocusable/findNextFocusableWrapped/getElementsInGroup 使用。
 * 生产 getFocusableElements 只接收 HTMLElement 容器（a11yEngine.ts:386），契约不同。
 */
function getFocusableElementsData(elements: FocusableElement[]): FocusableElement[] {
  return elements
    .filter(el => !el.disabled && el.tabIndex >= 0)
    .sort((a, b) => a.tabIndex - b.tabIndex);
}

function findNextFocusable(
  elements: FocusableElement[],
  currentId: string,
  direction: FocusDirection = 'next'
): FocusableElement | null {
  const focusable = getFocusableElementsData(elements);
  if (focusable.length === 0) return null;

  const currentIdx = focusable.findIndex(el => el.id === currentId);
  if (currentIdx === -1) {
    return direction === 'last' ? focusable[focusable.length - 1] : focusable[0];
  }

  switch (direction) {
    case 'next':
      return focusable[currentIdx + 1] ?? null;
    case 'prev':
      return focusable[currentIdx - 1] ?? null;
    case 'first':
      return focusable[0];
    case 'last':
      return focusable[focusable.length - 1];
  }
}

function findNextFocusableWrapped(
  elements: FocusableElement[],
  currentId: string,
  direction: 'next' | 'prev' = 'next'
): FocusableElement | null {
  const focusable = getFocusableElementsData(elements);
  if (focusable.length === 0) return null;

  const currentIdx = focusable.findIndex(el => el.id === currentId);
  if (currentIdx === -1) return focusable[0];

  if (direction === 'next') {
    return focusable[(currentIdx + 1) % focusable.length];
  } else {
    return focusable[(currentIdx - 1 + focusable.length) % focusable.length];
  }
}

function handleKeyDown(
  key: string,
  config: FocusRingConfig
): FocusDirection | null {
  switch (key) {
    case 'Tab':
      return null; // Browser default
    case 'ArrowDown':
    case 'ArrowRight':
      return 'next';
    case 'ArrowUp':
    case 'ArrowLeft':
      return 'prev';
    case 'Home':
      return 'first';
    case 'End':
      return 'last';
    default:
      return null;
  }
}

function shouldPreventDefault(key: string, config: FocusRingConfig): boolean {
  const handled = ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'];
  return handled.includes(key);
}

function calcFocusRingStyle(
  elementRect: { width: number; height: number; x: number; y: number },
  offset = 2,
  borderWidth = 2
): {
  top: number;
  left: number;
  width: number;
  height: number;
  borderWidth: number;
} {
  return {
    top: elementRect.y - offset,
    left: elementRect.x - offset,
    width: elementRect.width + offset * 2,
    height: elementRect.height + offset * 2,
    borderWidth,
  };
}

function getElementsInGroup(
  elements: FocusableElement[],
  group: string
): FocusableElement[] {
  return getFocusableElementsData(elements).filter(el => el.group === group);
}

function getNextGroup(
  groups: string[],
  currentGroup: string
): string | null {
  const idx = groups.indexOf(currentGroup);
  if (idx === -1) return groups[0] ?? null;
  return groups[(idx + 1) % groups.length] ?? null;
}

function isValidTabIndex(tabIndex: number): boolean {
  return Number.isInteger(tabIndex) && tabIndex >= -1 && tabIndex <= 32767;
}

// 把可聚焦元素挂到 jsdom 文档里，供生产 getFocusableElements/createFocusTrap 使用。
function mountFocusables(html: string): HTMLElement {
  const container = document.createElement('div');
  container.innerHTML = html;
  document.body.appendChild(container);
  return container;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('FocusRing 焦点环逻辑', () => {
  const mockElements: FocusableElement[] = [
    { id: 'btn1', tabIndex: 0, disabled: false },
    { id: 'btn2', tabIndex: 1, disabled: false },
    { id: 'btn3', tabIndex: 2, disabled: true },
    { id: 'btn4', tabIndex: 3, disabled: false },
  ];

  describe('getFocusableElements（生产 a11yEngine:386）', () => {
    it('should filter out disabled elements', () => {
      const container = mountFocusables(
        '<button id="ok">ok</button><button id="disabled" disabled>no</button><input id="inp" disabled />'
      );
      expect(getFocusableElements(container).map(el => el.id)).toEqual(['ok']);
    });

    it('should keep DOM order instead of tabIndex order', () => {
      const container = mountFocusables(
        '<button id="b" tabindex="2">b</button><button id="a" tabindex="1">a</button>'
      );
      const ids = getFocusableElements(container).map(el => el.id);
      // 生产 querySelectorAll 文档序、不排序（a11yEngine.ts:393）
      expect(ids).toEqual(['b', 'a']);
      expect(getFocusableElements(container).map(el => el.tabIndex)).toEqual([2, 1]);
    });

    it('should filter out tabindex=-1 non-button element', () => {
      const container = mountFocusables(
        '<div id="neg" tabindex="-1">n</div><div id="zero" tabindex="0">z</div>'
      );
      const ids = getFocusableElements(container).map(el => el.id);
      expect(ids).not.toContain('neg');
      expect(ids).toContain('zero');
    });

    it('should include negative-tabindex button, link and contenteditable', () => {
      const container = mountFocusables(
        '<button id="negBtn" tabindex="-1">b</button>' +
        '<a id="link" href="#x">l</a>' +
        '<div id="editable" contenteditable="true">e</div>'
      );
      const ids = getFocusableElements(container).map(el => el.id);
      // button 命中 button:not([disabled])（a11yEngine.ts:388），即使 tabindex=-1 仍返回
      expect(ids).toContain('negBtn');
      expect(ids).toContain('link');
      expect(ids).toContain('editable');
    });
  });

  describe('findNextFocusable（未迁移）', () => {
    it('should find next element', () => {
      const next = findNextFocusable(mockElements, 'btn1', 'next');
      expect(next?.id).toBe('btn2');
    });

    it('should skip disabled elements', () => {
      const next = findNextFocusable(mockElements, 'btn2', 'next');
      expect(next?.id).toBe('btn4');
    });

    it('should return null at end', () => {
      expect(findNextFocusable(mockElements, 'btn4', 'next')).toBeNull();
    });

    it('should return null at start going prev', () => {
      expect(findNextFocusable(mockElements, 'btn1', 'prev')).toBeNull();
    });

    it('should find first from unknown element', () => {
      const next = findNextFocusable(mockElements, 'unknown', 'next');
      expect(next?.id).toBe('btn1');
    });

    it('should find last directly', () => {
      const last = findNextFocusable(mockElements, 'btn1', 'last');
      expect(last?.id).toBe('btn4');
    });
  });

  describe('findNextFocusableWrapped（未迁移）', () => {
    it('should wrap around forward', () => {
      const next = findNextFocusableWrapped(mockElements, 'btn4', 'next');
      expect(next?.id).toBe('btn1');
    });

    it('should wrap around backward', () => {
      const prev = findNextFocusableWrapped(mockElements, 'btn1', 'prev');
      expect(prev?.id).toBe('btn4');
    });
  });

  describe('handleKeyDown（未迁移）', () => {
    const config: FocusRingConfig = { trapMode: 'loop', autoFocus: true, restoreFocus: true, wrapAround: true };

    it('should map arrow keys to directions', () => {
      expect(handleKeyDown('ArrowDown', config)).toBe('next');
      expect(handleKeyDown('ArrowUp', config)).toBe('prev');
      expect(handleKeyDown('ArrowRight', config)).toBe('next');
      expect(handleKeyDown('ArrowLeft', config)).toBe('prev');
    });

    it('should map Home/End', () => {
      expect(handleKeyDown('Home', config)).toBe('first');
      expect(handleKeyDown('End', config)).toBe('last');
    });

    it('should not handle Tab', () => {
      expect(handleKeyDown('Tab', config)).toBeNull();
    });

    it('should not handle unknown keys', () => {
      expect(handleKeyDown('a', config)).toBeNull();
      expect(handleKeyDown('Enter', config)).toBeNull();
    });
  });

  describe('shouldPreventDefault（未迁移）', () => {
    const config: FocusRingConfig = { trapMode: 'loop', autoFocus: true, restoreFocus: true, wrapAround: true };

    it('should prevent arrow keys', () => {
      expect(shouldPreventDefault('ArrowDown', config)).toBe(true);
    });

    it('should prevent Home/End', () => {
      expect(shouldPreventDefault('Home', config)).toBe(true);
    });

    it('should not prevent Tab', () => {
      expect(shouldPreventDefault('Tab', config)).toBe(false);
    });
  });

  describe('calcFocusRingStyle（未迁移）', () => {
    it('should calculate ring dimensions', () => {
      const style = calcFocusRingStyle({ x: 100, y: 50, width: 200, height: 40 });
      expect(style.top).toBe(48);
      expect(style.left).toBe(98);
      expect(style.width).toBe(204);
      expect(style.height).toBe(44);
    });

    it('should respect custom offset', () => {
      const style = calcFocusRingStyle({ x: 100, y: 50, width: 200, height: 40 }, 5);
      expect(style.top).toBe(45);
      expect(style.width).toBe(210);
    });
  });

  describe('getElementsInGroup（未迁移）', () => {
    it('should filter by group', () => {
      const els: FocusableElement[] = [
        { id: 'a', tabIndex: 0, disabled: false, group: 'header' },
        { id: 'b', tabIndex: 1, disabled: false, group: 'body' },
        { id: 'c', tabIndex: 2, disabled: false, group: 'header' },
      ];
      expect(getElementsInGroup(els, 'header')).toHaveLength(2);
    });
  });

  describe('getNextGroup（未迁移）', () => {
    it('should cycle through groups', () => {
      const groups = ['header', 'body', 'footer'];
      expect(getNextGroup(groups, 'header')).toBe('body');
      expect(getNextGroup(groups, 'footer')).toBe('header');
    });

    it('should return first for unknown group', () => {
      expect(getNextGroup(['a', 'b'], 'unknown')).toBe('a');
    });
  });

  describe('createFocusTrap（生产 a11yEngine:399）', () => {
    it('should fix focus on first element and restore it on deactivate', () => {
      const trigger = document.createElement('button');
      trigger.id = 'trigger';
      document.body.appendChild(trigger);
      trigger.focus();

      const container = mountFocusables('<button id="f1">1</button><button id="f2">2</button>');
      const trap = createFocusTrap(container);

      expect(trap.isActive).toBe(false);
      trap.activate();
      expect(trap.isActive).toBe(true);
      expect(document.activeElement?.id).toBe('f1');

      trap.deactivate();
      expect(trap.isActive).toBe(false);
      expect(document.activeElement?.id).toBe('trigger');
    });

    it('should handle empty container without moving focus', () => {
      const container = mountFocusables('');
      const trap = createFocusTrap(container);

      expect(() => trap.activate()).not.toThrow();
      expect(trap.isActive).toBe(true);
      expect(document.activeElement).toBe(document.body);

      trap.deactivate();
      expect(trap.isActive).toBe(false);
    });
  });

  describe('isValidTabIndex（未迁移）', () => {
    it('should accept valid values', () => {
      expect(isValidTabIndex(0)).toBe(true);
      expect(isValidTabIndex(-1)).toBe(true);
      expect(isValidTabIndex(32767)).toBe(true);
    });

    it('should reject invalid values', () => {
      expect(isValidTabIndex(-2)).toBe(false);
      expect(isValidTabIndex(32768)).toBe(false);
      expect(isValidTabIndex(1.5)).toBe(false);
    });
  });
});