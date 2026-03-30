# 无障碍设计 (WCAG 2.1 AA)

## 合规标准

- WCAG 2.1 AA 级别
- 参考 WebAIM、a11y Project

## 核心实现

### 1. 焦点管理
- `focus-visible` 键盘导航时显示焦点环
- 焦点环 2px solid #3b82f6，偏移 2px
- 避免焦点陷阱（Modal 除外）

### 2. 屏幕阅读器
- `.sr-only` 视觉隐藏但可读
- `aria-live` 区域实时播报
- `aria-label` / `aria-describedby` 语义标注

### 3. 高对比度模式
- `data-high-contrast="true"` 激活
- 浅色模式：纯黑文字、黑色边框
- 深色模式：纯白文字、白色边框
- 焦点环加粗至 3px

### 4. 减弱动画
- `prefers-reduced-motion: reduce` 检测
- 所有动画/过渡缩减至 0.01ms
- 数字跳动、列表交错动画禁用

### 5. 触摸目标
- 最小 44x44px (WCAG 2.5.5)
- `.min-touch-target` CSS 类

### 6. 跳转链接
- `.skip-link` 首个可聚焦元素
- Tab 键后显示，跳过导航直达主内容

### 7. 语义化
- 正确使用 ARIA role (tab/navigation/search)
- Tab 组件 aria-selected 状态
- Live Region 区域 (polite/assertive)

## CSS 类参考

| 类名 | 用途 |
|------|------|
| `.sr-only` | 屏幕阅读器专用 |
| `.skip-link` | 跳转链接 |
| `.min-touch-target` | 最小触摸区域 |
| `.live-region` | 实时通知区域 |
| `[data-high-contrast]` | 高对比度模式 |
| `*:focus-visible` | 键盘焦点样式 |

## 测试检查清单

- [ ] Tab 键可访问所有交互元素
- [ ] 焦点顺序符合逻辑
- [ ] 颜色对比度 ≥ 4.5:1 (正文) / ≥ 3:1 (大字)
- [ ] 所有图片有 alt 属性
- [ ] 表单有 label 关联
- [ ] 键盘可完成所有操作
