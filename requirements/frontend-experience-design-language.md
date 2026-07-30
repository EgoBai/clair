# 澄观 Clair · 前端体验设计语言（Frontend Experience Design Language）

> 文档类型：需求 / 设计语言规范（PRD-类，描述性，不写实现代码）
> 适用里程碑：**D7 前端现代化**
> 关联决策：**D5**（接入真实 LLM、游戏化体验闭环）、**D6**（轻量静态 UI 守卫先行）
> 关联架构：`design/ai-native-architecture.md`（4 阶段迁移 P0–P3）、`requirements/gamification-framework-schema.md`（JourneyStage / Quest / Achievement / CompanionState / ConditionExpr）、`design/ui-quality-guard-design.md`（3 层 UI 守卫，轻量先行）

---

## 0. 对齐声明（Alignment）

| 战略决策 | 本文档如何承接 |
|----------|----------------|
| D5：用**真实 LLM** 构建下一代人机交互；游戏化闭环 **探索→求证→决策→复盘→成长** | §1 体验哲学、§3.5 AI Companion 在场、§3.1 对话/智能体界面 均围绕该闭环设计 |
| D5：深层 AI 能力，区别于"信息聚合/展示/分发"类工具 | §1 显式对比"表单/表格/按钮"旧范式；数据作为**论证素材**而非堆砌 |
| D6：先做轻量静态 UI 守卫（ESLint 自定义规则 + ts-morph AST + 正则/数据基线），完整 3 层后续 | §5 迁移路径与 §6 验收门槛与守卫耦合；新 token 以 CSS 变量 + 受控组件形式落地，便于 AST 校验 |
| D7：采用**最现代、面向未来**的设计语言与框架；适配多端 + 小程序；**优先 web 多尺寸体验**，保留小程序可移植性 | §2 设计 token、§4 响应式与多端策略、§4.3 小程序可移植性约束 |
| 4 阶段迁移 P0–P3（`design/ai-native-architecture.md`） | §5 将体验语言落地映射为 P0→P3 增量演进 |

> 注：当前前端已实现 antd 5 + 自研 `styles/theme.ts`（深色优先、红涨绿跌、A 股语义色）。本语言**不推翻**既有栈，而是在其上叠加一套 **token 驱动 + 动效 + AI 陪伴在场** 的统一层，迁移须可灰度、可回退（见 §5）。

---

## 1. 体验哲学（Experience Philosophy）

### 1.1 一句话定位

> **澄观不是"另一个炒股软件界面"，而是一个由 AI 伙伴陪伴、以动效表达状态、用数据讲故事的投研工作台。**

### 1.2 三大支柱

1. **表达性（Expressive）**——界面用颜色、深度、动效传达"市场情绪"与"AI 在想什么"，而非仅罗列数字。
2. **动效丰富（Motion-rich）**——状态变化必有可感知的过渡（加载、流式输出、升级、信号触发），动效是信息层而非装饰。
3. **AI 陪伴驱动（AI-Companion-Driven）**——AI 不是右下角一个聊天按钮，而是贯穿全链路的"在场者"，主动引导用户走过 **探索→求证→决策→复盘→成长**。

### 1.3 范式对比：旧 → 新

| 维度 | 当前范式（表单/表格/按钮） | 目标范式（表达性 / 陪伴 / 数据叙事） |
|------|---------------------------|--------------------------------------|
| 信息组织 | 静态表格 + 表单筛选 | 对话驱动 + 渐进披露 + 图表即内容 |
| AI 位置 | `FloatingChat` 浮层（被动唤起） | AI Companion 常驻在场，主动提示下一步 |
| 状态表达 | hover/loading 文本 | 流式打字、数字滚动、升级光效、信号脉冲 |
| 数据角色 | 填充单元格 | 作为"论证素材"嵌入叙述与图表 |
| 导航 | 侧栏 + 4 个页面平铺 | 闭环旅程（JourneyStage）驱动，进度可见 |
| 交互 | 点击为主 | 手势 / 触控 / 键鼠 **三端能力对等**（§3.3） |
| 反馈 | toast/报错 | 游戏化成就（Achievement）+ 伙伴情绪（CompanionState） |

### 1.4 体验闭环映射

将 D5 的游戏化闭环与既有"发掘→筛选→自选→复盘"对齐，并扩展为成长闭环：

| 阶段 | 中文 | 界面意图 | AI Companion 行为（CompanionState.loopPhase） |
|------|------|----------|----------------------------------------------|
| Explore | 探索 | 市场全景、潜力雷达、行业地图 | 抛出观察、"今日值得看"引导 |
| Research | 求证 | 个股诊断、多信号、回测、因子 | 调取证据、对比历史十倍股特征 |
| Decide | 决策 | 策略模板、自选信号、组合 | 给出可解释的风险/机会摘要 |
| Review | 复盘 | 复盘页、笔记、投资日志 | 对照当初判断，标记偏差 |
| LevelUp | 成长 | 成就、旅程进度、伙伴升级 | 解锁新阶段（JourneyStage）、庆祝动效 |

---

## 2. 设计 Token 提案（Design Tokens）

> 原则：以 **CSS 自定义属性（CSS Variables）为单一事实来源**，antd 5 `theme.token` 通过 ConfigProvider 读取同一套变量，避免双份真相。所有 token 必须可被 D6 的静态守卫扫描（命名前缀 `clair-`）。

### 2.1 颜色系统（Color）

**语义分层**：原始色（primitive）→ 语义色（semantic）→ 场景色（surface）。深色为默认（继承现有 `theme.ts`），**新增浅色主题**与多设备密度。

| Token | 深色（默认） | 浅色 | 说明 |
|-------|-------------|------|------|
| `--clair-bg-base` | `#0a0e1a` | `#f5f7fa` | 页面底色 |
| `--clair-bg-surface` | `#111827` | `#ffffff` | 卡片/面板 |
| `--clair-bg-elevated` | `#1a2332` | `#ffffff` | 浮层/弹窗 |
| `--clair-bg-sunken` | `#1e293b` | `#eef1f5` | 输入框/凹陷区 |
| `--clair-border-default` | `#2d3748` | `#e2e8f0` | 默认边框 |
| `--clair-border-strong` | `#374151` | `#cbd5e1` | 强边框 |
| `--clair-text-primary` | `#f1f5f9` | `#0f172a` | 主文字 |
| `--clair-text-secondary` | `#94a3b8` | `#475569` | 次文字 |
| `--clair-text-muted` | `#64748b` | `#94a3b8` | 弱文字 |
| `--clair-accent` | `#3b82f6` | `#2563eb` | 品牌主色（AI 蓝） |
| `--clair-accent-soft` | `#1e3a5f` | `#dbeafe` | 主色浅底 |
| `--clair-up` | `#ef4444` | `#dc2626` | **红涨**（A 股语义，不可反转） |
| `--clair-down` | `#22c55e` | `#16a34a` | **绿跌** |
| `--clair-flat` | `#6b7280` | `#94a3b8` | 平盘 |
| `--clair-warning` | `#f59e0b` | `#d97706` | 预警/金 |
| `--clair-glow` | `rgba(59,130,246,.45)` | `rgba(37,99,235,.30)` | AI 在场辉光 |

> **强约束**：`--clair-up/down` 固定为红涨绿跌，**绝不**因国际化或浅色主题改变方向（合规与用户肌肉记忆）。

### 2.2 间距标度（Spacing）— 4dp 基数 + 流式

| Token | 值(px) | 用途 |
|-------|--------|------|
| `--clair-space-1` | 4 | 微间距/分隔线 |
| `--clair-space-2` | 8 | 图标与文字 |
| `--clair-space-3` | 12 | 控件内边距 |
| `--clair-space-4` | 16 | 卡片内边距（移动端） |
| `--clair-space-5` | 20 | 模块间距 |
| `--clair-space-6` | 24 | 卡片内边距（桌面默认） |
| `--clair-space-8` | 32 | 区块间距 |
| `--clair-space-10` | 40 | 页面留白 |
| `--clair-space-12` | 48 | 大区块 |

> 流式扩展：容器级间距随断点缩放（`--clair-space-section` 在桌面 = 40，移动 = 24），见 §4.1。

### 2.3 字体排印（Typography）

| 层级 | 字号(px) | 行高 | 字重 | 字体栈 |
|------|----------|------|------|--------|
| Display | 32 / 28(移动) | 1.2 | 700 | `chinese` 栈 |
| H1 | 24 | 1.3 | 700 | `chinese` |
| H2 | 20 | 1.35 | 600 | `chinese` |
| H3 | 16 | 1.4 | 600 | `chinese` |
| Body | 14 | 1.5 | 400 | `chinese` |
| Caption | 12 | 1.4 | 400 | `chinese` |
| **Number** | 同层级 | 1.2 | 600 | **等宽数字栈**（`'DIN Alternate','SF Mono','Menlo',monospace`，`font-variant-numeric: tabular-nums`） |

> 数字一律用等宽 tabular-nums，避免流式输出时数字跳动。中文栈沿用现有 `'PingFang SC','Microsoft YaHei'` 系统字体（**不引入网络字体**，保障小程序/弱网可移植）。

### 2.4 圆角（Border-Radius）

| Token | 值(px) | 用途 |
|-------|--------|------|
| `--clair-radius-sm` | 6 | 标签/芯片 |
| `--clair-radius-md` | 10 | 按钮/输入框 |
| `--clair-radius-lg` | 14 | 卡片 |
| `--clair-radius-xl` | 20 | 面板/弹层 |
| `--clair-radius-pill` | 999 | 胶囊/进度 |

### 2.5 层级与阴影（Elevation）

| Token | 深色阴影 | 浅色阴影 | 用途 |
|-------|----------|----------|------|
| `--clair-elev-1` | `0 1px 3px rgba(0,0,0,.3)` | `0 1px 2px rgba(15,23,42,.08)` | 卡片静止 |
| `--clair-elev-2` | `0 4px 12px rgba(0,0,0,.4)` | `0 4px 12px rgba(15,23,42,.12)` | 卡片悬停 |
| `--clair-elev-3` | `0 8px 24px rgba(0,0,0,.5)` | `0 12px 32px rgba(15,23,42,.18)` | 浮层/弹窗 |
| `--clair-glow-ai` | `0 0 0 1px var(--clair-accent), 0 0 24px var(--clair-glow)` | 同左 | AI 在场描边/光晕 |

> 小程序（§4.3）中 `box-shadow` 支持有限，移动端优先用 **边框 + 背景对比** 表达层级，光晕仅用于关键 AI 状态。

### 2.6 动效（Motion）— 时长 + 缓动

| Token | 值 | 用途 |
|-------|----|------|
| `--clair-motion-fast` | 120ms | 微交互（hover、切换） |
| `--clair-motion-base` | 200ms | 标准过渡（入场、折叠） |
| `--clair-motion-slow` | 320ms | 页面级转场 |
| `--clair-motion-stream` | 按字 ~24ms | AI 流式打字节奏 |
| 缓动 `ease-standard` | `cubic-bezier(.4,0,.2,1)` | 通用 |
| 缓动 `ease-emphasized` | `cubic-bezier(.2,0,0,1)` | 强调/入场 |
| 缓动 `spring-soft` | 刚度 220 / 阻尼 22 | 弹性回弹（卡片、伙伴出现） |

> **无障碍**：所有动效必须遵守 `@media (prefers-reduced-motion: reduce)` —— 时长归零、禁用位移动画，仅保留透明度淡入。

---

## 3. 核心体验模式（Core Experience Patterns）

### 3.1 对话 / 智能体界面（Conversational / Agentic Surfaces）

- **主对话为一级界面**：`FloatingChat` 升级为可停靠/可全屏的 **Agent Surface**，支持"对话 + 内联图表 + 可执行卡片（加入自选/跑回测）"混合流。
- **Agentic 卡片**：AI 返回的不是纯文本，而是结构化"行动卡"（ActionCard），可点击触发下游任务（求证→决策）。
- **流式即状态**：LLM 输出逐字渲染，配合打字光标与数字滚动；长任务显示进度（求证中的多信号拉取）。

### 3.2 渐进披露（Progressive Disclosure）

- **三层展开**：概览（一句话结论）→ 证据（图表/数据）→ 细节（原始指标/来源）。默认只给第一层，用户或伙伴引导才展开。
- **AI 引导式披露**：Companion 依据 `CompanionState` 与当前 `loopPhase`，主动把"下一步该看的证据"推到前台，而非用户自己翻。

### 3.3 手势 / 触控 / 桌面能力对等（Gesture + Touch + Desktop Parity）

| 交互 | 桌面 | 触控/移动 | 说明 |
|------|------|-----------|------|
| 主操作 | 点击 / 悬停预览 | 点按 / 长按菜单 | 悬停效果必须有触控等价（如长按） |
| 次要操作 | 右键菜单 | 滑动/底部菜单 | 不依赖 hover-only 功能 |
| 导航 | 侧栏 + ⌘K | 底部 Tab + 手势返回 | 全局快捷键与手势并存 |
| 图表探索 | 框选/滚轮缩放 | 双指缩放/拖动 | 图表交互三端一致 |

> 规则：**任何 hover-only 功能都视为缺陷**（D6 守卫应拦截）。

### 3.4 数据可视化优先布局（Data-Viz-Forward Layouts）

- 图表是**一等公民**，不是卡片里的小部件：K 线、热力图、资金流、产业链图谱占据主视觉区。
- **图表即论证**：每个图表配一句 AI 解读（narrative），与 §3.2 披露联动。
- 保留既有 echarts/recharts/reactflow 资产，统一套用 `--clair-*` 图表主题（已存在 `chart-theme.ts` 体系，本语言将其纳入 token 治理）。

### 3.5 AI Companion 在场（AI Companion Presence）

> 承接 `gamification-framework-schema.md` 的 `CompanionState`，将其**可见化**为界面元素。

- **形态**：常驻的"伙伴光球（Companion Orb）"——位于导航锚点/页面侧缘，带辉光（`--clair-glow-ai`）。
- **状态表达**（读 `CompanionState`）：
  - `mood`：平静 / 思考 / 兴奋 / 警示 → 光球颜色与微动效
  - `loopPhase`：探索/求证/决策/复盘/成长 → 光球相位与提示语
  - `activeQuest`：当前任务进度 → 光球外环进度环
  - `level`：成长等级 → 解锁时的庆祝动效（spring-soft + glow）
- **引导闭环**：伙伴按阶段主动发声（"发现一只高景气个股，要求证吗？"），把 §1.4 的闭环变成可感知的旅程。
- **不喧宾夺主**：默认静默微光，仅在关键节点（信号触发、成就、升级）主动提示，遵守 reduced-motion。

---

## 4. 响应式与多端策略（Responsive & Multi-Device）

### 4.1 流式布局 + 断点系统（Breakpoints）

| 断点 | 范围 | 布局策略 |
|------|------|----------|
| `xs` 移动 | < 480px | 单列；底部 Tab；图表全宽可横屏 |
| `sm` 平板竖 | 480–767px | 单列/松散双列；触控优先 |
| `md` 平板横 | 768–1023px | 双列；侧栏可收起 |
| `lg` 桌面 | 1024–1439px | 三列；常驻侧栏 |
| `xl` 大屏 | ≥ 1440px | 多列；信息密度提升，留白增大 |

- 间距/字号使用 **流式 clamp()**（如 `clamp(14px, 1vw+12px, 16px)`）平滑过渡，而非硬跳。
- 容器最大宽 1440px 居中（沿用现有 `max-width:1400px` 习惯，微调为 token 化）。

### 4.2 触控目标尺寸（Touch Targets）

| 元素 | 最小尺寸 | 说明 |
|------|----------|------|
| 可点控件（按钮/芯片） | **44×44px**（iOS HIG）/ 48×48 推荐 | 移动端强制 |
| 列表行 | 高度 ≥ 48px | 避免误触 |
| 图表热点 | 触发区 ≥ 40px | 双指缩放友好 |
| 间距（可点元素间） | ≥ 8px | 防重叠 |

### 4.3 小程序可移植性（Mini-Program Portability）

> 目标：web 优先做深，同时**保留**向 Taro/uni-app 小程序迁移的可能，不锁死。

**必须避免（Avoid）**
- 重度 `position: fixed` 全屏浮层（小程序导航栏/胶囊冲突）→ 改用页面内嵌或自定义导航槽。
- `backdrop-filter`、复杂多层 `box-shadow`、模糊玻璃（小程序渲染支持差）→ 用实底 + 边框替代。
- `:hover`-only 交互、`:focus-within` 复杂态（小程序无 hover）→ 见 §3.3 对等规则。
- 运行时访问 `window`/`document`/`navigator` 的硬代码（小程序无 DOM）→ 浏览器能力走适配层（capability adapter）。
- 网络字体 / `localStorage` 强依赖（`localStorage` 在部分小程序受限）→ 用封装的 `storage` 抽象（现有 Zustand 持久化已近此模式）。
- CSS 变量以外的动态样式注入（小程序样式需编译期确定）→ token 全部以 CSS 变量落地。

**如何保持可移植（Keep Portable）**
- 所有视觉差异收敛进 **`--clair-*` token + 布局原子组件（Box/Stack/Grid/Card）**；小程序端仅替换渲染适配层，不动业务组件。
- 状态层（Zustand：`useGamificationStore`、CompanionState）与框架无关，可直接复用。
- AI 对话/流式用统一 service 层（现有 `aiService.ts`），UI 与传输解耦。
- 动效优先用 transform/opacity（小程序 `animation` 友好），避免 layout 触发属性。

---

## 5. 迁移原则（Transition Principles）— 增量演进对齐 P0–P3

> 与 `design/ai-native-architecture.md` 的 4 阶段迁移对齐。原则：**antd 5 不移除**，新语言以"覆盖层 + 受控组件"灰度叠加，每阶段可独立回退，且每阶段产出必须满足 D6 静态守卫。

| 阶段 | 迁移目标 | 本语言落地动作 | 验收（含 D6 守卫） |
|------|----------|----------------|--------------------|
| **P0 地基** | LLM 接入就绪、token 单一真相 | 落地 `--clair-*` CSS 变量 + antd `theme.token` 桥接；迁移现有 `theme.ts` 颜色/间距到变量 | 守卫扫描：所有颜色/间距引用经 token，无魔法值 |
| **P1 在场** | Companion 可见、闭环引导 | 实现 Companion Orb（读 CompanionState）；对话 Surface 可停靠；流式动效（§2.6/§3.1） | 守卫扫描：无 hover-only 交互；reduced-motion 分支存在 |
| **P2 表达** | 数据叙事、渐进披露、手势对等 | 图表主题 token 化（§3.4）；ActionCard/渐进披露（§3.2）；触控目标 44px（§4.2） | 守卫扫描：触控目标 ≥ 44px；图表配 AI 解读 |
| **P3 多端** | 响应式完善 + 小程序可移植 | 流式断点（§4.1）；移除 §4.3「避免项」；抽象 `storage`/能力适配层 | 守卫扫描：无 `window/document` 硬引用；无固定浮层锁死 |

**迁移纪律**
- 保留现有 `FloatingChat`、`chart-theme.ts`、`useGamificationStore` 作为资产，仅做包装与 token 化，不重写。
- 任何新组件须使用 `--clair-*` token；旧组件在对应阶段内逐步替换，禁止一次性大改（防回归）。
- 设计 token 变更须经 D6 AST 校验（命名/取值合规）后再合入。

---

## 6. 验收与质量门槛（Acceptance & Quality Gates）

- **D6 轻量守卫耦合**：本语言的每条强约束（红涨绿跌、无 hover-only、触控 ≥44px、reduced-motion、token 无魔法值、无 `window` 硬引用）都应可表达为 ESLint 自定义规则 / ts-morph AST 检查，随 P0–P3 分阶段启用。
- **可感知动效覆盖率**：核心状态变化（加载、流式、升级、信号）100% 有动效；reduced-motion 下 100% 退化为淡入。
- **三端对等**：同一功能在桌面/平板/手机的交互完备度一致（无"仅桌面可用"功能）。
- **可移植自检**：`grep` 无 `position:fixed` 全屏锁、`backdrop-filter`、`window.`/`document.` 业务硬引用（适配层除外）。

---

## 7. 开放问题（Open Questions）

1. 浅色主题是否需在 P0 同步交付，还是 P2 再补？（建议 P0 预留 token，P2 启用。）
2. AI Companion 光球的"个性/称呼"是否可配置？是否涉及用户隐私文案？
3. 小程序目标运行时是 Taro 还是 uni-app？影响 §4.3 适配层选型。
4. 动效库选型：Framer Motion（web 强） vs CSS 变量 + 轻量 spring（更利于小程序）——建议 web 端用前者、小程序端降级为 CSS。
5. 现有 4 页面（发掘/筛选/自选/复盘）是否按 §1.4 扩展为 5 阶段旅程导航，还是保留 4 入口 + 成长页？

---

*— 文档结束 · 由 software-product-manager-2 产出，供 D7 前端现代化使用。所有内容均为描述性规范，不涉及源码修改。*
