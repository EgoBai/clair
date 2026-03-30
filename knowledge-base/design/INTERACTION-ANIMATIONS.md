# 交互动画设计

## 设计原则

1. **有意义** — 动画服务于功能，不炫技
2. **快速** — 大部分动画 < 300ms
3. **可关闭** — respects prefers-reduced-motion
4. **一致性** — 统一的缓动函数和时长

## 动画类型

### 1. 淡入 (fadeIn) — 0.3s
用于模态框、弹窗、通知出现

### 2. 上滑淡入 (slideUp) — 0.35s
用于卡片、列表项出现，给人"从下方升起"的感觉

### 3. 缩放淡入 (scaleIn) — 0.25s
用于下拉菜单、小弹窗出现

### 4. 数字跳动 (numberPop) — 0.3s
用于实时行情数字更新，给予"数据变了"的视觉反馈

### 5. 列表交错动画 (stagger-list)
列表项依次出现，间隔 30ms，最多 10 项

### 6. 涨跌闪烁 (flash-rise/flash-fall) — 0.6s
价格变化时背景闪红/闪绿，提醒用户关注

### 7. 进度条动画 (progress-bar)
使用 cubic-bezier 缓动，避免线性生硬

## 缓动函数

- `ease-out` — 大多数出现动画
- `ease-in-out` — 位置变化
- `cubic-bezier(0.4, 0, 0.2, 1)` — Material Design 标准

## 性能注意

- 只对 `opacity` 和 `transform` 做动画（GPU 加速）
- 避免 `width/height/top/left` 触发重排
- 大量元素使用 `will-change` 优化

## 减弱动画

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

## CSS 类参考

| 类名 | 动画 | 用途 |
|------|------|------|
| `.animate-fade-in` | fadeIn 0.3s | 通用淡入 |
| `.animate-slide-up` | slideUp 0.35s | 卡片/列表 |
| `.animate-scale-in` | scaleIn 0.25s | 弹窗/菜单 |
| `.animate-number-pop` | numberPop 0.3s | 数字更新 |
| `.stagger-list` | 交错延迟 | 列表动画 |
| `.flash-rise` | flashRed 0.6s | 涨闪烁 |
| `.flash-fall` | flashGreen 0.6s | 跌闪烁 |
