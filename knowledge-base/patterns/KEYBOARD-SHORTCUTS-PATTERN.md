# 键盘快捷键设计模式

## 设计原则

1. **符合用户习惯** — 参考 GitHub/TradingView/雪球等主流产品
2. **不与系统冲突** — 避免 Alt+F4、Ctrl+W 等系统保留组合
3. **输入框智能忽略** — 在 input/textarea 中自动忽略（Escape 除外）
4. **可发现性** — 提供快捷键面板（? 触发）

## 快捷键分类

### 搜索 (2个)
- `⌘/Ctrl + K` — 全局搜索聚焦（GitHub 风格）
- `/` — 快速搜索（GitHub 风格）

### 导航 (6个)
- `Alt + 1` — 首页
- `Alt + 2` — 股票列表
- `Alt + 3` — 行情分析
- `Alt + 4` — 自选股
- `Alt + 5` — 策略回测
- `Alt + 6` — AI 选股

### 操作 (4个)
- `Esc` — 关闭弹窗/取消搜索
- `Alt + T` — 循环切换主题
- `Alt + S` — 切换侧边栏
- `Backspace` — 返回上一页

## 实现模式

```typescript
// 忽略输入框的逻辑
const target = e.target as HTMLElement;
const isInput = target.tagName === 'INPUT' 
  || target.tagName === 'TEXTAREA' 
  || target.isContentEditable;

// Escape 在输入框中仍生效
if (e.key === 'Escape') { /* always handle */ }

// 其他快捷键在输入框中忽略
if (isInput) return;
```

## 测试策略

- 快捷键映射完整性测试
- 输入框忽略逻辑测试
- 修饰键组合冲突检测
- 事件派发验证

## 参考
- GitHub Keyboard Shortcuts
- TradingView Hotkeys
- Linear App Shortcuts
