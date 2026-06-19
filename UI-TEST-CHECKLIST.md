# 澄观 Clair — 系统化UI质量测试方案

> 目标：从根本上避免颜色对比度、控件重叠、响应式适配等原则性UI问题

---

## 一、颜色对比度测试（每次发版前必查）

### 1.1 深色/浅色模式全覆盖

| 检查项 | 深色预期 | 浅色预期 | 工具 |
|--------|---------|---------|------|
| 正文文字 vs 背景 | WCAG AA (≥4.5:1) | WCAG AA (≥4.5:1) | DevTools Color Picker |
| 辅助文字 vs 背景 | WCAG AA Large (≥3:1) | 同上 | 同上 |
| 链接/按钮文字 vs 背景 | ≥4.5:1 | ≥4.5:1 | 同上 |
| 选中态 vs 非选中态 | 明显区分(≥3:1) | 明显区分 | 视觉 |
| disabled态文字 | 灰暗但不消失 | 灰暗但不消失 | 视觉 |

### 1.2 CSS变量完整性检查

```bash
# 查找所有CSS变量，确保都有定义
grep -roh "var(--[a-zA-Z0-9_-]*" src/styles/ --include="*.css" | sort -u
```

**强制规则：** 
- 所有 `var(--xxx, fallback)` 的 fallback 必须是该模式下可用的值
- 禁止使用仅浅色模式有效的 fallback（如 `#9ca3af` 在深色背景不可见）

### 1.3 已知问题模式（红线）

| 模式 | 禁止 | 必须用 |
|------|------|--------|
| 未定义CSS变量 | `var(--color-text-muted, #9ca3af)` | `var(--text-secondary, #8b949e)` |
| 写在TS中的硬编码颜色 | `color: '#333'` | 使用 THEME 常量 |
| 白色背景（深色模式闪白） | `background: #fff` | `background: var(--bg-base)` |

---

## 二、响应式适配测试

### 2.1 断点检查

| 断点 | 设备 | 首页 | 筛选 | 自选 | 复盘 | 产业地图 |
|------|------|------|------|------|------|---------|
| 375px (iPhone SE) | 竖屏 | [ ] | [ ] | [ ] | [ ] | [ ] |
| 390px (iPhone 14) | 竖屏 | [ ] | [ ] | [ ] | [ ] | [ ] |
| 768px (iPad mini) | 竖屏 | [ ] | [ ] | [ ] | [ ] | [ ] |
| 1024px (iPad) | 横屏 | [ ] | [ ] | [ ] | [ ] | [ ] |
| 1440px (Desktop) | — | [ ] | [ ] | [ ] | [ ] | [ ] |

### 2.2 移动端特殊检查

- [ ] TabBar文字清晰可读（深色+浅色）
- [ ] 底部安全区适配（iPhone notch）
- [ ] 触摸目标 ≥ 48px（按钮不重叠）
- [ ] 横向滚动不出现（表格除外）
- [ ] 弹窗不超出屏幕
- [ ] 键盘弹出不遮挡输入框

---

## 三、控件布局测试

### 3.1 元素重叠检查

| 检查场景 | 方法 |
|---------|------|
| 固定定位元素（TabBar/FAB）不遮挡内容 | 滚动到页面底部检查 |
| 弹窗/Drawer z-index 不冲突 | 全部弹窗测试一遍 |
| Tooltip/Select下拉不超出屏幕 | 边缘位置的元素hover测试 |

### 3.2 表格/卡片适配

- [ ] 表格在 375px 宽度下可读（不压缩到1列文字都看不见）
- [ ] 卡片间距一致（不留白不均）
- [ ] 长数字/文本不溢出（ellipsis或换行）

---

## 四、自动化检查脚本

### 4.1 对比度扫描
```bash
# 使用 axe-core 或 lighthouse 扫描
npx lighthouse http://localhost:5173 --view --chrome-flags="--headless" \
  --only-categories=accessibility
```

### 4.2 硬编码颜色扫描
```bash
# 查找所有硬编码背景色（非var的）
grep -rn "background:\s*#[0-9a-f]\|background:\s*rgb\|background:\s*white" \
  src/ --include="*.tsx" --include="*.css" | grep -v node_modules
```

### 4.3 CSS变量有效性
```bash
grep -roh "var(--[^,)]*" src/styles/ --include="*.css" | sort -u | while read v; do
  name=$(echo "$v" | sed 's/var(//')
  grep -q "$name" src/styles/design-system.css || echo "UNDEFINED: $v"
done
```

---

## 五、执行流程

**每次PR/发版前：**

1. `npm run build` 通过
2. 运行对比度扫描
3. 手动检查 5 种断点 × 5 个核心页面 = 25 个视图
4. 深色/浅色模式各走一遍
5. 修复所有 FAIL 项后再发版

---

*最后更新: 2026-06-19 | 版本 v1.0*
