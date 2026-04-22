# Round 11: 键盘快捷键+交互效率对标 Linear/Notion

**日期**: 2026-04-17
**轮次**: 11 (迭代 926)
**焦点**: 键盘快捷键系统 + 命令面板 + 交互效率

## 改进内容

### 1. CommandPalette 命令面板 (Linear/Notion 风格)
- **文件**: `frontend/src/components/Common/CommandPalette.tsx`
- Cmd+K / Ctrl+K 打开命令面板
- 支持搜索命令、页面导航、股票搜索
- 命令按类别分组 (导航/数据/操作/帮助)
- 每个命令显示快捷键提示
- 键盘导航: ↑↓ 移动, Enter 选择, Esc 关闭
- ARIA 无障碍: role=dialog, role=listbox, role=option
- 防抖股票搜索 (300ms)
- 点击遮罩层关闭

### 2. ShortcutHelpOverlay 快捷键帮助面板
- **文件**: `frontend/src/components/Common/ShortcutHelpOverlay.tsx`
- 按 ? 键打开快捷键帮助
- 按类别分组展示所有快捷键
- 覆盖: 搜索、导航、序列键、数据、列表、界面、股票、帮助
- 每个快捷键显示按键组合 (kbd 样式)
- 底部提示: 随时按 ? 查看帮助

### 3. 增强快捷键引擎
- **文件**: `frontend/src/utils/shortcutEngine.ts`
- 新增数据操作快捷键:
  - `R` - 刷新数据
  - `F` - 打开筛选器
  - `S P` - 按价格排序 (序列键)
  - `S C` - 按涨跌幅排序
  - `S V` - 按成交量排序
- 新增命令面板快捷键: `Ctrl+K`
- 新增快捷键帮助: `Shift+/`
- 总计 30+ 快捷键定义

### 4. 测试覆盖
- **文件**: `frontend/src/__tests__/commandPalette.test.ts`
- 51 个测试全部通过
- 覆盖:
  - 命令项结构 (ID/标签/分类/快捷键/keywords)
  - 搜索过滤逻辑 (标签/英文/拼音/大小写)
  - 键盘导航 (↑↓循环/Enter选择/Esc关闭)
  - 命令分类 (导航6/数据5/操作2/帮助1)
  - 快捷键帮助完整性
  - Linear/Notion 对标 (Cmd+K/发现性/数据操作)
  - 性能响应性 (<100ms/防抖300ms)
  - 无障碍 (role/aria-modal/aria-selected)

## Linear/Notion 对标分析

| 特性 | Linear | Notion | AStock (Before) | AStock (After) |
|------|--------|--------|-----------------|----------------|
| 命令面板 | Cmd+K | Cmd+K | ❌ | ✅ Cmd+K |
| 命令搜索 | ✅ | ✅ | ❌ | ✅ |
| 分类显示 | ✅ | ✅ | ❌ | ✅ |
| 快捷键提示 | ✅ | ✅ | 部分 | ✅ 完整 |
| 快捷键帮助 | ? | Cmd+/ | ❌ | ✅ ? |
| 数据操作快捷键 | ✅ | ✅ | ❌ | ✅ R/F/S系列 |
| 序列键 | ❌ | ❌ | ✅ g+h | ✅ g+h, s+p |
| 键盘导航 | ✅ | ✅ | 部分 | ✅ 完整 |
| ARIA 无障碍 | ✅ | ✅ | 部分 | ✅ 完整 |

## 统计
- 新增组件: 2 (CommandPalette, ShortcutHelpOverlay)
- 新增测试: 51
- 新增快捷键: 6 (R, F, S+P, S+C, S+V, ?)
- 总快捷键数: 30+
- 测试通过: 31423 (全项目) / 17111 (前端)
- 前端测试失败: 6 (均为预存问题, 非本轮引入)
