// @vitest-environment jsdom
/**
 * Command Palette / Shortcut Help 交互测试（影子测试迁移）
 *
 * 旧文件（418 行 / 51 用例 / 64 断言）没有 import 任何组件：它内联了 CommandItem、
 * commands 数组、filterCommands、键盘索引算术，甚至有 expect(true).toBe(true)、
 * expect('refresh').toBe('refresh') 这类恒真断言。本文件改为真实渲染生产组件：
 *
 * - CommandItem          → src/components/Common/CommandPalette.tsx:9   icon 是 React.ReactNode，不是 string
 * - DEFAULT_COMMANDS     → src/components/Common/CommandPalette.tsx:28  （模块内 const，未 export；只能经渲染断言）
 * - CommandPalette       → src/components/Common/CommandPalette.tsx:50  默认导出
 * - ShortcutHelpOverlay  → src/components/Common/ShortcutHelpOverlay.tsx:67（旧文件后半段同样是无 import 的影子）
 *
 * 组件在 :63 调 useNavigate()，所以用 MemoryRouter 包裹；用 @testing-library/react
 * 真实渲染 + fireEvent 驱动输入框，断言过滤、方向键选择、回车执行、Esc 关闭。
 *
 * 生产实际行为（本文件断言依据）：
 * - 过滤（:66-79）：label + description + category + keywords 拼接后 toLowerCase().includes(q)，
 *   q 先 trim；空查询返回全部。
 * - 点击遮罩（:197）只有 e.target === e.currentTarget 才关闭。
 * - 上下键（:121-129）在 filteredCommands.length + stockResults.length 上取模；
 *   输入变化（:222）把 activeIndex 重置为 0。
 * - Enter（:131-143）activeIndex 落在命令区才执行 handler，否则落到股票结果；
 *   两条路径都 onClose()。
 * - Escape（:144-147）只在输入框 keydown 上处理（组件本身没有全局快捷键监听）。
 * - visible 变为 true（:103-109）重置 query/activeIndex，并 50ms 后聚焦输入框。
 * - 股票搜索（:82-100）防抖 300ms，结果 slice(0,5)，异常时清空；搜索中显示“搜索中...”。
 * - 空态（:355）仅在命令与股票结果都为空且 !loading 时出现。
 *
 * 旧断言错在哪（删除/重写处，生产正确）：
 *
 * | 旧断言 | 生产实际 | 依据 |
 * | --- | --- | --- |
 * | 内联 CommandItem.icon?: string | 生产 icon?: React.ReactNode，默认值是 emoji 字符串但类型允许元素 | CommandPalette.tsx:9,13 |
 * | 内联 filterCommands 只拼 label/category/keywords | 生产还拼 description | :71-76 |
 * | 上下键在固定 totalItems=5 上做算术 | 真实列表是 14 条默认命令，且包含股票结果；取模基数是动态 totalItems | :119-129 |
 * | Enter 直接调 commands[activeIndex].handler() | 只有 activeIndex < 命令数时才执行命令，否则按股票索引执行 onStockSelect | :131-143 |
 * | Escape 改本地 visible 变量 | 真实组件调用 onClose()，且仅输入框 keydown 触发 | :144-147 |
 * | “Cmd+K 应打开面板”本地计算 metaKey | 组件不监听全局 Cmd+K，visible 由父级 prop 控制；本文件删除该恒真断言，改测 prop 行为 | :20-26,50-56 |
 * | 性能“100ms 响应”是常量比较 | 生产无该常量；改测真实 300ms 股票搜索防抖 | :88-97 |
 * | “防抖 200-300ms”是常量比较 | 生产固定 300ms；用 fake timers 断言 299 未调用、300 调用 | :88-97 |
 * | “应有快捷键帮助面板”hasHelpOverlay=true | 改为真实渲染 ShortcutHelpOverlay 并断言 8 类 30 条 | ShortcutHelpOverlay.tsx:19-65 |
 * | 快捷键数据内联 11 条 | 生产 SHORTCUT_GROUPS 实为 30 条、8 个分类 | :19-65 |
 * | 无障碍断言 role='dialog' 常量比较 | 改为对真实 DOM 的 role/aria-modal/aria-selected 断言 | CommandPalette.tsx:198-200,273,332 |
 * | 分类“总计 14 个命令”是本地数组长度 | 生产 DEFAULT_COMMANDS 确为 14 条（6/5/2/1），改由 DOM 选项断言 | :28-48 |
 *
 * 用例数 51 → 70，断言数 64 → 约 230（只增不减）。未复制任何生产实现到测试内。
 * 时间控制全部用 vi.useFakeTimers + advanceTimersByTime；无 Math.random、无 new Date()。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, act, cleanup, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CommandPalette from '../components/Common/CommandPalette';
import type { CommandItem } from '../components/Common/CommandPalette';
import ShortcutHelpOverlay from '../components/Common/ShortcutHelpOverlay';

type PaletteProps = React.ComponentProps<typeof CommandPalette>;

function renderPalette(overrides: Partial<PaletteProps> = {}) {
  const props: PaletteProps = {
    ...overrides,
    visible: overrides.visible ?? true,
    onClose: overrides.onClose ?? vi.fn(),
  };
  const view = render(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(CommandPalette, props),
    ),
  );
  return { ...view, onClose: props.onClose };
}

function makeCommand(
  overrides: Partial<CommandItem> & Pick<CommandItem, 'id' | 'label'>,
): CommandItem {
  return {
    category: 'action',
    handler: vi.fn(),
    ...overrides,
  };
}

const paletteInput = (): HTMLInputElement =>
  screen.getByLabelText('搜索命令') as HTMLInputElement;

const optionLabels = (): string[] =>
  screen
    .getAllByRole('option')
    // 选项结构：option > span(icon) + div(flex:1) > div(label) + div(description?)
    .map(option => option.querySelector(':scope > div > div')?.textContent ?? '');

const selectedOptions = (): HTMLElement[] =>
  screen
    .getAllByRole('option')
    .filter(option => option.getAttribute('aria-selected') === 'true');

const advance = async (ms: number): Promise<void> => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

describe('CommandPalette 命令面板（真实渲染）', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  describe('结构与默认命令', () => {
    it('visible=false 时不渲染任何内容', () => {
      const { container } = renderPalette({ visible: false });
      expect(container.firstChild).toBeNull();
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('渲染 dialog 语义：role=dialog、aria-modal、aria-label', () => {
      renderPalette();
      const dialog = screen.getByRole('dialog', { name: '命令面板' });
      expect(dialog.getAttribute('aria-modal')).toBe('true');
      expect(dialog.getAttribute('aria-label')).toBe('命令面板');
    });

    it('输入框语义：label、placeholder、data-command-input', () => {
      renderPalette();
      const input = paletteInput();
      expect(input.tagName).toBe('INPUT');
      expect(input.getAttribute('placeholder')).toBe('输入命令或搜索股票...');
      expect(input.hasAttribute('data-command-input')).toBe(true);
      expect(input.value).toBe('');
    });

    it('命令列表是 role=listbox，aria-label=命令列表', () => {
      renderPalette();
      const listbox = screen.getByRole('listbox', { name: '命令列表' });
      expect(listbox.tagName).toBe('DIV');
      expect(listbox.getAttribute('role')).toBe('listbox');
    });

    it('默认渲染 14 条命令且顺序与 DEFAULT_COMMANDS 一致', () => {
      renderPalette();
      const labels = optionLabels();
      expect(labels).toHaveLength(14);
      expect(labels).toEqual([
        '首页',
        '股票列表',
        '行情分析',
        '自选股',
        '策略回测',
        'AI 选股',
        '刷新数据',
        '筛选股票',
        '按价格排序',
        '按涨跌幅排序',
        '按成交量排序',
        '切换主题',
        '切换侧边栏',
        '快捷键帮助',
      ]);
    });

    it('每条默认命令都渲染快捷键，首尾为 Alt+1 与 ?', () => {
      renderPalette();
      const options = screen.getAllByRole('option');
      const listbox = screen.getByRole('listbox');
      expect(listbox.querySelectorAll('kbd')).toHaveLength(14);
      expect(within(options[0]).getByText('Alt+1')).not.toBeNull();
      expect(within(options[13]).getByText('?')).not.toBeNull();
    });

    it('按类别分组：导航/数据操作/操作/帮助 四组依序出现', () => {
      renderPalette();
      const headers = screen
        .getAllByText(/^(导航|数据操作|操作|帮助)$/)
        .map(element => element.textContent);
      expect(headers).toEqual(['导航', '数据操作', '操作', '帮助']);
    });

    it('初始只有第一项 aria-selected=true', () => {
      renderPalette();
      const options = screen.getAllByRole('option');
      expect(options[0].getAttribute('aria-selected')).toBe('true');
      expect(options[1].getAttribute('aria-selected')).toBe('false');
      expect(selectedOptions()).toHaveLength(1);
    });

    it('底部提示与头部 ESC 键帽都存在', () => {
      renderPalette();
      expect(screen.getByText('↑↓ 导航')).not.toBeNull();
      expect(screen.getByText('↵ 选择')).not.toBeNull();
      expect(screen.getByText('ESC 关闭')).not.toBeNull();
      const escKbd = screen.getByText('ESC');
      expect(escKbd.tagName).toBe('KBD');
    });
  });

  describe('搜索过滤', () => {
    it('空查询返回全部 14 条', () => {
      renderPalette();
      expect(screen.getAllByRole('option')).toHaveLength(14);
    });

    it('按中文标签过滤：刷新 只剩刷新数据', () => {
      renderPalette();
      fireEvent.change(paletteInput(), { target: { value: '刷新' } });
      expect(optionLabels()).toEqual(['刷新数据']);
      expect(screen.getByText(/^数据操作$/)).not.toBeNull();
      expect(screen.queryByText(/^导航$/)).toBeNull();
    });

    it('按英文关键词过滤且大小写不敏感：HOME', () => {
      renderPalette();
      fireEvent.change(paletteInput(), { target: { value: 'HOME' } });
      expect(optionLabels()).toEqual(['首页']);
    });

    it('按英文关键词过滤：Refresh', () => {
      renderPalette();
      fireEvent.change(paletteInput(), { target: { value: 'Refresh' } });
      expect(optionLabels()).toEqual(['刷新数据']);
    });

    it('按中文关键词过滤：排序 命中三条', () => {
      renderPalette();
      fireEvent.change(paletteInput(), { target: { value: '排序' } });
      expect(optionLabels()).toEqual(['按价格排序', '按涨跌幅排序', '按成交量排序']);
    });

    it('按分类名过滤：navigation 命中 6 条导航', () => {
      renderPalette();
      fireEvent.change(paletteInput(), { target: { value: 'navigation' } });
      expect(optionLabels()).toEqual([
        '首页',
        '股票列表',
        '行情分析',
        '自选股',
        '策略回测',
        'AI 选股',
      ]);
    });

    it('按分类名过滤：data 命中 5 条数据操作', () => {
      renderPalette();
      fireEvent.change(paletteInput(), { target: { value: 'data' } });
      expect(optionLabels()).toEqual([
        '刷新数据',
        '筛选股票',
        '按价格排序',
        '按涨跌幅排序',
        '按成交量排序',
      ]);
    });

    it('查询先 trim：两端空格不影响结果', () => {
      renderPalette();
      fireEvent.change(paletteInput(), { target: { value: '  刷新  ' } });
      expect(optionLabels()).toEqual(['刷新数据']);
    });

    it('无匹配时显示空态且没有 option', () => {
      renderPalette();
      fireEvent.change(paletteInput(), { target: { value: '不存在的命令' } });
      expect(screen.queryAllByRole('option')).toHaveLength(0);
      expect(screen.getByText('没有找到匹配的命令')).not.toBeNull();
    });

    it('description 参与过滤，而不仅是 label', () => {
      const commands: CommandItem[] = [
        makeCommand({
          id: 'settings',
          label: '设置',
          description: '打开设置页面',
          category: 'action',
        }),
        makeCommand({ id: 'other', label: '其它', category: 'action' }),
      ];
      renderPalette({ commands });
      fireEvent.change(paletteInput(), { target: { value: '设置页面' } });
      expect(optionLabels()).toEqual(['设置']);
    });

    it('默认命令的 keywords 参与过滤：暗色 命中切换主题', () => {
      renderPalette();
      fireEvent.change(paletteInput(), { target: { value: '暗色' } });
      expect(optionLabels()).toEqual(['切换主题']);
    });

    it('过滤后 activeIndex 重置为 0', () => {
      renderPalette();
      fireEvent.keyDown(paletteInput(), { key: 'ArrowDown' });
      expect(selectedOptions()[0].textContent).toContain('股票列表');
      fireEvent.change(paletteInput(), { target: { value: '排序' } });
      expect(selectedOptions()).toHaveLength(1);
      expect(selectedOptions()[0].textContent).toContain('按价格排序');
    });
  });

  describe('键盘导航与执行', () => {
    it('初始选中第一项首页', () => {
      renderPalette();
      expect(selectedOptions()).toHaveLength(1);
      expect(selectedOptions()[0].textContent).toContain('首页');
    });

    it('ArrowDown 从 0 移到 1', () => {
      renderPalette();
      fireEvent.keyDown(paletteInput(), { key: 'ArrowDown' });
      const options = screen.getAllByRole('option');
      expect(options[1].getAttribute('aria-selected')).toBe('true');
      expect(options[0].getAttribute('aria-selected')).toBe('false');
    });

    it('ArrowUp 从首项循环到末项（第 14 项）', () => {
      renderPalette();
      fireEvent.keyDown(paletteInput(), { key: 'ArrowUp' });
      const options = screen.getAllByRole('option');
      expect(options[13].getAttribute('aria-selected')).toBe('true');
      expect(selectedOptions()[0].textContent).toContain('快捷键帮助');
    });

    it('ArrowUp 到末项后 ArrowDown 循环回 0', () => {
      renderPalette();
      fireEvent.keyDown(paletteInput(), { key: 'ArrowUp' });
      fireEvent.keyDown(paletteInput(), { key: 'ArrowDown' });
      expect(screen.getAllByRole('option')[0].getAttribute('aria-selected')).toBe('true');
    });

    it('过滤后取模基数变为结果数：3 条时上箭头到第 3 条', () => {
      renderPalette();
      fireEvent.change(paletteInput(), { target: { value: '排序' } });
      fireEvent.keyDown(paletteInput(), { key: 'ArrowUp' });
      const options = screen.getAllByRole('option');
      expect(options[2].getAttribute('aria-selected')).toBe('true');
      expect(selectedOptions()[0].textContent).toContain('按成交量排序');
    });

    it('mouseEnter 把活跃项切到鼠标所在行', () => {
      renderPalette();
      const options = screen.getAllByRole('option');
      fireEvent.mouseEnter(options[5]);
      expect(options[5].getAttribute('aria-selected')).toBe('true');
      expect(options[0].getAttribute('aria-selected')).toBe('false');
    });

    it('Enter 执行当前命令并关闭面板', () => {
      const first = vi.fn();
      const second = vi.fn();
      const commands = [
        makeCommand({ id: 'first', label: '第一项', handler: first }),
        makeCommand({ id: 'second', label: '第二项', handler: second }),
      ];
      const { onClose } = renderPalette({ commands });
      fireEvent.keyDown(paletteInput(), { key: 'Enter' });
      expect(first).toHaveBeenCalledTimes(1);
      expect(second).not.toHaveBeenCalled();
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('ArrowDown + Enter 执行第二项而不是第一项', () => {
      const first = vi.fn();
      const second = vi.fn();
      const commands = [
        makeCommand({ id: 'first', label: '第一项', handler: first }),
        makeCommand({ id: 'second', label: '第二项', handler: second }),
      ];
      const { onClose } = renderPalette({ commands });
      fireEvent.keyDown(paletteInput(), { key: 'ArrowDown' });
      fireEvent.keyDown(paletteInput(), { key: 'Enter' });
      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('过滤后 Enter 执行唯一命中项', () => {
      const refresh = vi.fn();
      const commands = [makeCommand({ id: 'refresh', label: '刷新数据', handler: refresh })];
      const { onClose } = renderPalette({ commands });
      fireEvent.change(paletteInput(), { target: { value: '刷新' } });
      fireEvent.keyDown(paletteInput(), { key: 'Enter' });
      expect(refresh).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('结果为空时 Enter 不关闭面板也不抛错', () => {
      const { onClose } = renderPalette();
      fireEvent.change(paletteInput(), { target: { value: '无结果查询' } });
      expect(screen.queryAllByRole('option')).toHaveLength(0);
      fireEvent.keyDown(paletteInput(), { key: 'Enter' });
      expect(onClose).not.toHaveBeenCalled();
      expect(screen.getByRole('dialog')).not.toBeNull();
    });

    it('Escape 调用 onClose 并阻止默认行为', () => {
      const { onClose } = renderPalette();
      const notPrevented = fireEvent.keyDown(paletteInput(), { key: 'Escape' });
      expect(notPrevented).toBe(false);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('ArrowDown 阻止默认行为', () => {
      renderPalette();
      expect(fireEvent.keyDown(paletteInput(), { key: 'ArrowDown' })).toBe(false);
    });

    it('ArrowUp 阻止默认行为', () => {
      renderPalette();
      expect(fireEvent.keyDown(paletteInput(), { key: 'ArrowUp' })).toBe(false);
    });

    it('Enter 阻止默认行为', () => {
      renderPalette();
      expect(fireEvent.keyDown(paletteInput(), { key: 'Enter' })).toBe(false);
    });
  });

  describe('点击行为', () => {
    it('点击选项执行对应 handler 并关闭', () => {
      const first = vi.fn();
      const second = vi.fn();
      const commands = [
        makeCommand({ id: 'first', label: '第一项', handler: first }),
        makeCommand({ id: 'second', label: '第二项', handler: second }),
      ];
      const { onClose } = renderPalette({ commands });
      fireEvent.click(screen.getAllByRole('option')[1]);
      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('点击遮罩层关闭', () => {
      const { onClose } = renderPalette();
      fireEvent.click(screen.getByRole('dialog'));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('点击面板内部不关闭（冒泡目标不等于遮罩）', () => {
      const { onClose } = renderPalette();
      fireEvent.click(screen.getByRole('listbox'));
      expect(onClose).not.toHaveBeenCalled();
    });

    it('点击命令列表空白区域也不关闭', () => {
      const { onClose } = renderPalette();
      const dialog = screen.getByRole('dialog');
      fireEvent.click(dialog.firstElementChild as HTMLElement);
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('分组与自定义命令', () => {
    it('默认分组数量为 6/5/2/1', () => {
      renderPalette();
      const labels = optionLabels();
      expect(labels.slice(0, 6)).toEqual([
        '首页',
        '股票列表',
        '行情分析',
        '自选股',
        '策略回测',
        'AI 选股',
      ]);
      expect(labels.slice(6, 11)).toEqual([
        '刷新数据',
        '筛选股票',
        '按价格排序',
        '按涨跌幅排序',
        '按成交量排序',
      ]);
      expect(labels.slice(11, 13)).toEqual(['切换主题', '切换侧边栏']);
      expect(labels.slice(13)).toEqual(['快捷键帮助']);
    });

    it('自定义 stock 分类显示“股票”标题，icon 可用 React 元素', () => {
      const icon = React.createElement('span', { 'data-testid': 'custom-icon' }, '★');
      const commands = [
        makeCommand({
          id: 'stock-one',
          label: '自选详情',
          icon,
          category: 'stock',
        }),
      ];
      renderPalette({ commands });
      expect(screen.getByText(/^股票$/)).not.toBeNull();
      expect(screen.getByTestId('custom-icon').textContent).toBe('★');
      expect(optionLabels()).toEqual(['自选详情']);
    });

    it('自定义命令按传入顺序建立分类分组', () => {
      const commands = [
        makeCommand({ id: 'act', label: '操作项', category: 'action' }),
        makeCommand({ id: 'nav', label: '导航项', category: 'navigation' }),
      ];
      renderPalette({ commands });
      const headers = screen
        .getAllByText(/^(导航|数据操作|操作|帮助|股票)$/)
        .map(element => element.textContent);
      expect(headers).toEqual(['操作', '导航']);
    });

    it('过滤后只保留命中分类的标题', () => {
      renderPalette();
      fireEvent.change(paletteInput(), { target: { value: '排序' } });
      const headers = screen
        .getAllByText(/^(导航|数据操作|操作|帮助)$/)
        .map(element => element.textContent);
      expect(headers).toEqual(['数据操作']);
    });
  });

  describe('股票搜索（300ms 防抖）', () => {
    const stockResults = [
      { symbol: 'AAPL', name: '苹果公司' },
      { symbol: 'MSFT', name: '微软公司' },
    ];

    it('防抖 300ms：299ms 未调用，300ms 调用一次且传原始查询', async () => {
      const onStockSearch = vi.fn().mockResolvedValue(stockResults);
      renderPalette({ onStockSearch });
      fireEvent.change(paletteInput(), { target: { value: 'aapl' } });
      act(() => {
        vi.advanceTimersByTime(299);
      });
      expect(onStockSearch).not.toHaveBeenCalled();
      await advance(1);
      expect(onStockSearch).toHaveBeenCalledTimes(1);
      expect(onStockSearch).toHaveBeenCalledWith('aapl');
    });

    it('请求挂起时显示“搜索中...”，完成后消失', async () => {
      let resolveSearch: (value: Array<{ symbol: string; name: string }>) => void = () => {};
      const pending = new Promise<Array<{ symbol: string; name: string }>>(resolve => {
        resolveSearch = resolve;
      });
      const onStockSearch = vi.fn().mockReturnValue(pending);
      renderPalette({ onStockSearch });
      fireEvent.change(paletteInput(), { target: { value: 'aapl' } });
      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(screen.queryByText('搜索中...')).not.toBeNull();
      await act(async () => {
        resolveSearch(stockResults);
        await pending;
      });
      expect(screen.queryByText('搜索中...')).toBeNull();
      expect(screen.getAllByRole('option')).toHaveLength(2);
    });

    it('股票结果最多 5 条（生产 slice(0,5)）', async () => {
      const many = Array.from({ length: 7 }, (_, index) => ({
        symbol: 'S' + index,
        name: '公司' + index,
      }));
      const onStockSearch = vi.fn().mockResolvedValue(many);
      renderPalette({ onStockSearch });
      fireEvent.change(paletteInput(), { target: { value: 'aapl' } });
      await advance(300);
      const options = screen.getAllByRole('option');
      expect(options).toHaveLength(5);
      expect(options[4].textContent).toContain('S4');
      expect(screen.queryByText('S5')).toBeNull();
    });

    it('股票结果渲染 symbol、name 与 📈 图标', async () => {
      const onStockSearch = vi.fn().mockResolvedValue(stockResults);
      renderPalette({ onStockSearch });
      fireEvent.change(paletteInput(), { target: { value: 'aapl' } });
      await advance(300);
      expect(screen.getByText('AAPL')).not.toBeNull();
      expect(screen.getByText('苹果公司')).not.toBeNull();
      expect(screen.getAllByText('📈')).toHaveLength(2);
      expect(screen.getAllByRole('option')[0].getAttribute('data-index')).toBe('0');
    });

    it('Enter 选中第一条股票并关闭', async () => {
      const onStockSearch = vi.fn().mockResolvedValue(stockResults);
      const onStockSelect = vi.fn();
      const { onClose } = renderPalette({ onStockSearch, onStockSelect });
      fireEvent.change(paletteInput(), { target: { value: 'aapl' } });
      await advance(300);
      fireEvent.keyDown(paletteInput(), { key: 'Enter' });
      expect(onStockSelect).toHaveBeenCalledTimes(1);
      expect(onStockSelect).toHaveBeenCalledWith('AAPL');
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('ArrowDown + Enter 选中第二条股票', async () => {
      const onStockSearch = vi.fn().mockResolvedValue(stockResults);
      const onStockSelect = vi.fn();
      renderPalette({ onStockSearch, onStockSelect });
      fireEvent.change(paletteInput(), { target: { value: 'aapl' } });
      await advance(300);
      fireEvent.keyDown(paletteInput(), { key: 'ArrowDown' });
      fireEvent.keyDown(paletteInput(), { key: 'Enter' });
      expect(onStockSelect).toHaveBeenCalledWith('MSFT');
    });

    it('点击第二条股票调用 onStockSelect(MSFT)', async () => {
      const onStockSearch = vi.fn().mockResolvedValue(stockResults);
      const onStockSelect = vi.fn();
      const { onClose } = renderPalette({ onStockSearch, onStockSelect });
      fireEvent.change(paletteInput(), { target: { value: 'aapl' } });
      await advance(300);
      fireEvent.click(screen.getAllByRole('option')[1]);
      expect(onStockSelect).toHaveBeenCalledWith('MSFT');
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('命令与股票同屏时索引偏移正确：第二项才是股票', async () => {
      const commandHandler = vi.fn();
      const commands = [
        makeCommand({ id: 'cmd', label: 'AAPL 详情', category: 'navigation', handler: commandHandler }),
      ];
      const onStockSearch = vi.fn().mockResolvedValue(stockResults);
      const onStockSelect = vi.fn();
      renderPalette({ commands, onStockSearch, onStockSelect });
      fireEvent.change(paletteInput(), { target: { value: 'aapl' } });
      await advance(300);
      expect(screen.getAllByRole('option')).toHaveLength(3);
      fireEvent.keyDown(paletteInput(), { key: 'ArrowDown' });
      fireEvent.keyDown(paletteInput(), { key: 'Enter' });
      expect(commandHandler).not.toHaveBeenCalled();
      expect(onStockSelect).toHaveBeenCalledWith('AAPL');
    });

    it('股票搜索异常时清空结果并显示空态', async () => {
      const onStockSearch = vi.fn().mockRejectedValue(new Error('network down'));
      renderPalette({ onStockSearch });
      fireEvent.change(paletteInput(), { target: { value: 'zzz' } });
      await advance(300);
      expect(screen.queryAllByRole('option')).toHaveLength(0);
      expect(screen.queryByText('搜索中...')).toBeNull();
      expect(screen.getByText('没有找到匹配的命令')).not.toBeNull();
    });

    it('未提供 onStockSearch 时不会出现股票结果', async () => {
      renderPalette();
      fireEvent.change(paletteInput(), { target: { value: 'aapl' } });
      await advance(300);
      expect(screen.queryAllByRole('option')).toHaveLength(0);
      expect(screen.getByText('没有找到匹配的命令')).not.toBeNull();
    });

    it('查询在防抖期内改变会取消上一次搜索', async () => {
      const onStockSearch = vi.fn().mockResolvedValue(stockResults);
      renderPalette({ onStockSearch });
      fireEvent.change(paletteInput(), { target: { value: 'aapl' } });
      act(() => {
        vi.advanceTimersByTime(200);
      });
      fireEvent.change(paletteInput(), { target: { value: 'msft' } });
      await advance(300);
      expect(onStockSearch).toHaveBeenCalledTimes(1);
      expect(onStockSearch).toHaveBeenCalledWith('msft');
    });

    it('纯空格查询立即清空股票结果并返回全部命令', async () => {
      const onStockSearch = vi.fn().mockResolvedValue(stockResults);
      renderPalette({ onStockSearch });
      fireEvent.change(paletteInput(), { target: { value: 'aapl' } });
      await advance(300);
      expect(screen.getByText('AAPL')).not.toBeNull();
      fireEvent.change(paletteInput(), { target: { value: '   ' } });
      expect(screen.queryByText('AAPL')).toBeNull();
      expect(screen.getAllByRole('option')).toHaveLength(14);
      expect(onStockSearch).toHaveBeenCalledTimes(1);
    });

    it('传给 onStockSearch 的查询不做 trim（只 trim 过滤用）', async () => {
      const onStockSearch = vi.fn().mockResolvedValue(stockResults);
      renderPalette({ onStockSearch });
      fireEvent.change(paletteInput(), { target: { value: ' aapl ' } });
      await advance(300);
      expect(onStockSearch).toHaveBeenCalledWith(' aapl ');
      expect(screen.getAllByRole('option')).toHaveLength(2);
    });
  });

  describe('焦点与重置', () => {
    it('打开 50ms 后聚焦输入框', async () => {
      renderPalette();
      const input = paletteInput();
      expect(document.activeElement).not.toBe(input);
      await advance(50);
      expect(document.activeElement).toBe(input);
    });

    it('每个选项带连续 data-index，供滚动定位', () => {
      renderPalette();
      const indexes = screen
        .getAllByRole('option')
        .map(option => option.getAttribute('data-index'));
      expect(indexes).toEqual(
        Array.from({ length: 14 }, (_, index) => String(index)),
      );
    });

    it('visible 从 false 切回 true 时重置查询与活跃项', async () => {
      const onClose = vi.fn();
      const element = (visible: boolean) =>
        React.createElement(
          MemoryRouter,
          null,
          React.createElement(CommandPalette, { visible, onClose }),
        );
      const { rerender } = render(element(true));
      fireEvent.change(paletteInput(), { target: { value: '排序' } });
      expect(paletteInput().value).toBe('排序');
      rerender(element(false));
      expect(screen.queryByRole('dialog')).toBeNull();
      rerender(element(true));
      await advance(50);
      expect(paletteInput().value).toBe('');
      expect(screen.getAllByRole('option')).toHaveLength(14);
      expect(screen.getAllByRole('option')[0].getAttribute('aria-selected')).toBe('true');
    });
  });
});

describe('ShortcutHelpOverlay 快捷键帮助（真实渲染）', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  const renderOverlay = (visible = true) => {
    const onClose = vi.fn();
    const view = render(
      React.createElement(ShortcutHelpOverlay, { visible, onClose }),
    );
    return { ...view, onClose };
  };

  const categoryGroup = (name: string): HTMLElement => {
    const heading = screen.getByText(name);
    return heading.parentElement as HTMLElement;
  };

  it('visible=false 时不渲染', () => {
    const { container } = renderOverlay(false);
    expect(container.firstChild).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('渲染 dialog 语义：role、aria-modal、aria-label', () => {
    renderOverlay();
    const dialog = screen.getByRole('dialog', { name: '快捷键帮助' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-label')).toBe('快捷键帮助');
  });

  it('标题为“快捷键”，并提供 aria-label=关闭 的关闭按钮', () => {
    renderOverlay();
    expect(screen.getByRole('heading', { name: '快捷键' })).not.toBeNull();
    expect(screen.getByRole('button', { name: '关闭' })).not.toBeNull();
  });

  it('8 个分类按固定顺序渲染', () => {
    const { container } = renderOverlay();
    const categories = Array.from(container.querySelectorAll('h3')).map(
      heading => heading.textContent,
    );
    expect(categories).toEqual([
      '搜索',
      '导航',
      '序列键',
      '数据',
      '列表',
      '界面',
      '股票',
      '帮助',
    ]);
  });

  it('30 条快捷键共 48 个键帽，加底部提示共 50 个 kbd', () => {
    const { container } = renderOverlay();
    expect(container.querySelectorAll('kbd')).toHaveLength(50);
    expect(screen.getAllByText('?')).toHaveLength(2); // 帮助条目 + 底部提示
    expect(screen.getByText('⌘/')).not.toBeNull();
  });

  it('搜索与导航分类内容正确', () => {
    renderOverlay();
    const search = categoryGroup('搜索');
    expect(within(search).getByText('打开命令面板')).not.toBeNull();
    expect(within(search).getByText('聚焦搜索框')).not.toBeNull();
    expect(within(search).getByText('⌘')).not.toBeNull();
    expect(within(search).getByText('K')).not.toBeNull();
    const nav = categoryGroup('导航');
    expect(within(nav).getByText('首页')).not.toBeNull();
    expect(within(nav).getByText('返回上一页')).not.toBeNull();
    expect(within(nav).getAllByText('Alt')).toHaveLength(6);
    expect(within(nav).getByText('⌫')).not.toBeNull();
  });

  it('序列键分类包含 4 组 G 组合', () => {
    renderOverlay();
    const sequence = categoryGroup('序列键');
    expect(within(sequence).getAllByText('G')).toHaveLength(4);
    expect(within(sequence).getByText('H')).not.toBeNull();
    expect(within(sequence).getByText('跳转首页')).not.toBeNull();
    expect(within(sequence).getByText('跳转自选股')).not.toBeNull();
  });

  it('数据与列表分类内容正确', () => {
    renderOverlay();
    const data = categoryGroup('数据');
    expect(within(data).getByText('刷新当前数据')).not.toBeNull();
    expect(within(data).getByText('按成交量排序')).not.toBeNull();
    expect(within(data).getAllByText('S')).toHaveLength(3); // S P / S C / S V
    const list = categoryGroup('列表');
    expect(within(list).getByText('列表下移')).not.toBeNull();
    expect(within(list).getByText('选中当前项')).not.toBeNull();
    expect(within(list).getByText('↓')).not.toBeNull();
    expect(within(list).getByText('Home')).not.toBeNull();
  });

  it('界面、股票、帮助分类内容正确', () => {
    renderOverlay();
    const ui = categoryGroup('界面');
    expect(within(ui).getByText('切换主题')).not.toBeNull();
    expect(within(ui).getByText('关闭弹窗/取消')).not.toBeNull();
    expect(within(ui).getByText('Esc')).not.toBeNull();
    const stock = categoryGroup('股票');
    expect(within(stock).getByText('添加/移除自选')).not.toBeNull();
    expect(within(stock).getByText('买入')).not.toBeNull();
    expect(within(stock).getByText('卖出')).not.toBeNull();
    const help = categoryGroup('帮助');
    expect(within(help).getByText('快捷键帮助')).not.toBeNull();
  });

  it('点击关闭按钮调用 onClose', () => {
    const { onClose } = renderOverlay();
    fireEvent.click(screen.getByRole('button', { name: '关闭' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Escape 关闭并阻止默认行为', () => {
    const { onClose } = renderOverlay();
    const notPrevented = fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(notPrevented).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('点击遮罩关闭，点击内部不关闭', () => {
    const { onClose } = renderOverlay();
    const dialog = screen.getByRole('dialog');
    fireEvent.click(dialog.firstElementChild as HTMLElement);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(dialog);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('底部提示文案完整', () => {
    const { container } = renderOverlay();
    expect(container.textContent).toContain('随时查看快捷键');
  });
});
