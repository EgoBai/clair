# 澄观 Clair — 前端体验现代化与多端适配架构策略（D7 定稿）

> 角色：架构师（高见远）。版本：D7 定稿，对齐 D5/D6/D7 与 `ai-native-architecture.md` 四阶段。
> 配套：PM《产品重构战略备忘录》《前端体验设计语言》（并行）；`gamification-framework-schema.md`（配置 Schema，结构冻结）；`ai-native-architecture.md`（LLM 集成 / `useAIStore` / `useGamificationStore` 数据结构）。
> 原则：**复用优先**（antd5 / Vite / Zustand / echarts 保留）；**纯展示层演进**，不触动 `demoData` 兜底；**现代化不为推翻重来**，而是叠加"现代交互骨架"。

---

## 0. 战略对齐（D5 / D6 / D7）

- **D5**：基于**真实大模型**（非规则）重做交互；下一代人机交互；游戏化循环 **探索→求证→决策→复盘→成长**；深度 AI；**不做"信息整合/展示/分发"工具复制品**。
- **D6**：先上**轻量静态 UI 守卫**，跑稳后再上**全量三层**（三层 = L1 令牌层 / L2 组件原语层 / L3 体验动效层）。
- **D7**：用**最现代、面向未来的设计语言与框架**重构交互（非控件/信息/按钮简单排布）；优先适配**各设备各尺寸网页体验**，同时保持**小程序可移植性**。
- 前端迁移须与 `ai-native-architecture.md` 四阶段对齐：**P0 基建硬化 → P1 单点真实化 → P2 游戏化叠加 → P3 全面差异化**。

---

## 1. 现状 Readiness 评估（基于代码核查）

| 维度 | 现状 | 就绪度 | 备注 |
|---|---|---|---|
| 动效/动画 | `MotionTokens.ts` 完善，但**无编排库**（无 motion/framer-motion），靠 CSS keyframes + 内联样式 | 中 | 有 token 无引擎 |
| 设计令牌 | **6 处冲突定义**（theme.ts / useThemeTokens.ts / themeEngine.ts / design-system.css / theme-constants.ts / antd ConfigProvider），数值打架（primary #3498db vs #3b82f6） | **低** | 最薄弱项，无唯一真相源 |
| 组件架构 | antd5 直接散用，无 compound/headless 层，`components/ui` 仅 toast | 低 | 缺平台无关/无障碍底座 |
| 状态管理 | Zustand + persist，现代健康；gamification/companion 未落地 | 高 | 扩展切片即可 |
| 响应式 | `responsiveUtils.ts`（Tailwind 断点、流体排版、`@container`、安全区、44px）+ `responsive.css` 较成熟 | 高 | 但断点三处不一致、容器查询未普及 |

**结论**：地基（状态/响应式）良好；现代化重心 = **令牌收敛 + 动画引擎 + headless 组件层**。

---

## 2. 技术选型决策（D7 三问）

### 2.1 是否升级 React 19
**审慎升级，不阻断 P0。** P0 维持 React 18 稳定；P1 末经兼容性验证后切 React 19，使用官方 `@ant-design/v5-patch-for-react-19` 修复 antd5 兼容，并验证 `echarts-for-react` / `recharts` / `react-window` 适配。**理由**：令牌/动效工作与框架版本无关；避免在基建硬化期引入 churn，降低风险。

### 2.2 新动画方案
引入 **`motion`**（Framer Motion 继任）+ 保留 `MotionTokens` 作入参；成就动画用 **Lottie**；微交互用 WAAPI。已具备 `prefersReducedMotion()`，作全局开关。**不引入 react-spring**（职责重叠）。

### 2.3 新状态方案
**保持 Zustand**，不引 Redux/Jotai。新增 `useGamificationStore`（成长/成就/任务/伴生）与 `useAIStore`（对话态/流式）切片，沿用 persist 模式，二者经 `eventBus` 联动但解耦。

### 2.4 设计令牌体系
**双轨**：`design-system.css` 的 **CSS 变量为运行时唯一真相**（primitive→semantic→component 三层）；新增 TS `tokens.ts` 仅做**类型安全消费 + 暗色映射**。暗色用 `[data-theme="dark"]` 切换语义变量；antd `ConfigProvider` 改为**读取 CSS 变量**映射，消除硬编码。废弃 `themeEngine.ts`/`useThemeTokens.ts` 冲突副本。

### 2.5 与 antd5 + echarts 共存策略（关键）
- **antd5**：保留处理**复杂数据栅格**（Table/Form/DatePicker/Select）。引入 Tailwind 须设 `corePlugins: { preflight: false }` **关闭 Tailwind 重置**，避免覆盖 antd CSS-in-JS 基础样式；primitives 用独立类名前缀 + CSS 变量隔离，杜绝样式冲突。
- **echarts**：保留 `echarts` + `echarts-for-react` 画金融图；chart theme 改为**消费设计令牌**（复用现有 `adaptiveChartTheme`/`themeEngine`），统一暗色与涨跌色，避免再写一套硬编码主题。
- **分工边界**：antd = 数据密集型表单/表格；echarts = 专业图表；自管 primitives + motion = 导航/卡片/弹层/伴生等现代交互壳。

---

## 3. 三层交互架构 + D6 渐进落地

- **L1 令牌层**：CSS 变量令牌（颜色/间距/圆角/字体/动效），全站唯一真相源。
- **L2 组件原语层**：基于 **Radix UI primitives（无障碍底座）+ motion** 的 `components/primitives`（Button/Card/Dialog/Drawer/Tabs/Tooltip），平台无关、不碰 DOM。
- **L3 体验动效层**：路由转场、列表 stagger、手势（拖拽/swipe/下拉刷新）、伴生 AI 进场/反馈。

**D6 安全发布**：先上**轻量静态 UI 守卫**——仅 L1 令牌 + 稳定骨架 + antd 兜底，**不开 motion/primitives 重写**，用 feature flag 控场；跑稳验证视觉/性能回归后，再开启 L2/L3 全量三层。降级路径清晰，任一新层出问题可秒级回退守卫态。

---

## 4. 响应式与多端（含小程序）架构

1. **断点统一**：以 `responsiveUtils.ts` 的 Tailwind 对齐值（xs0/sm640/md768/lg1024/xl1280/2xl1536）为唯一来源，废弃 `theme.ts`/`responsive.css` 旧数值。
2. **流式 + 容器查询**：推广既有 `containerQuery()` helper，卡片网格/看板随**容器**尺寸自适应；补全间距/圆角 `clamp()` 流体化。
3. **Mobile-First / 指针触控**：`responsive.css` 移动优先基线；`@media (hover:hover)` 区分悬停；触控 ≥44px（`validateTouchTarget`）；手势用 motion + 现有 `useMobileGestures`。
4. **安全区**：`env(safe-area-inset-*)` 固化到所有浮层（刘海/底部 Tab Bar）。
5. **密度自适应**：compact/comfortable 密度令牌，由 `useAppStore` 的 `UIPreferences` 切换（桌面 comfortable / 移动 compact）。
6. **小程序可移植**：推荐 **Taro 4（React 语法）+ 条件编译**（TSX 复用、Vite 兼容、Zustand/services/demoData 共享）；否决 kbone/uni-app/RNK。
   - **移植护栏（现在就做）**：避免 antd 强 DOM 组件（Modal/Message/Drawer portal）、browser-only API（`window`/`document`/`matchMedia` → 包 `usePlatform`）、固定 px（→rpx/令牌/流式）、DOM 内联动画（→motion 声明式）；采用令牌、平台无关组件、`platform/` 隔离 + `/* #ifdef MP */`。
   - **复用率预估**：页面级 70–80%，重写主要是导航壳/弹层/动画适配；P3 末以 Taro 跑通"自选股+伴生对话"验证壳。

---

## 5. 对游戏化 / AI Companion 交互的技术支撑

- **5.1 Companion 锚点**：以 `components/AI/FloatingChat.tsx` 升级为**常驻伴生层**（浮动气泡 + 展开面板 + 情境卡片）；语气由 `CompanionState.toneByBond`（low/mid/high）驱动。
- **5.2 动效反馈**：AI 流式 token 高亮、洞察卡 `scaleIn`；降级走 `demoData` 时给"演示数据"微标（动画提示而非阻断）。
- **5.3 成长 / 成就动画**：消费 `gamification-framework-schema.md`（JourneyStage/Quest/Achievement/LevelCurve）→ **Journey Engine**（配置驱动）解释 → 写 `useGamificationStore` → 广播 `achievement_unlocked` 事件（携 `narrativeCopy`）→ motion/Lottie 播放 XP 飞入、升级爆发、徽章弹层、streak 火焰。
- **5.4 架构衔接**：复用 `services/eventBus.ts`；`useGamificationStore.companion` 经 `selectCompanionContext()` 映射 `tone` 反向注入 `ChatPanel` 的 `systemHint`（与 `useAIStore` 联动）；动画在 portal/overlay，**不阻塞主流程与数据渲染**。

---

## 6. 分阶段迁移路径（对齐 P0–P3，含 D6 守卫）

| 阶段（对齐 AI-native） | 前端任务 | 依赖 | Ticket 量级 |
|---|---|---|---|
| **P0 基建硬化** | L1 令牌收敛（唯一真相源）；**轻量静态 UI 守卫先发（D6）**；React 19 兼容性验证（不切）；antd 消费 CSS 变量 | 无 | ~3–5 |
| **P1 单点真实化** | 引入 motion + L2 primitives 起步；**React 19 升级（验证后）**；流式 `ChatPanel` UI 支撑；Tailwind preflight 隔离 | P0 | ~5–7 |
| **P2 游戏化叠加** | L3 全量开启；`useGamificationStore` + Journey Engine + 成就动画；`useAIStore` 联动 + 伴生语气注入 | P1 | ~6–10 |
| **P3 全面差异化** | 响应式深化（容器查询/密度）；小程序护栏 + Taro 验证壳；全面差异化体验 | 全前置 | ~4–6 + 后续小程序独立项目 |

---

## 7. 风险与工作量总估

**主要风险**：① 令牌冲突视觉回归（缓解：P0 先收敛 + 视觉快照测试）；② Tailwind preflight 与 antd 冲突（缓解：关闭 preflight + 类名隔离）；③ motion 包体（缓解：按需 import、懒加载动画层）；④ React 19 兼容（缓解：antd patch + 逐项验证）；⑤ 小程序 DOM 兜底成本（缓解：P0/P1 即按护栏写）；⑥ 动画重排卡顿（缓解：优先 transform/opacity + reduced-motion）。

**总估**：前端专属约 **18–22 个 Ticket**，单人约 **10–14 周**；与 `ai-native-architecture.md` 总盘子并行（P0/P2 直接对齐）。

---

## 与配套文档分工
- **本文（D7 架构）**：技术选型、令牌、三层架构、动效引擎、antd/echarts 共存、响应式、小程序移植护栏、游戏化/伴生技术支撑、分阶段路径。
- **`ai-native-architecture.md`（架构）**：LLM 集成拓扑、降级闭环、`useAIStore`/`useGamificationStore` 数据结构与事件契约。
- **`product-reframing-strategy.md`（PM）**：体验原则、游戏化循环、D4 数据源。
- **`gamification-framework-schema.md`（PM）**：配置 Schema（结构冻结，P2 直接消费）。
- **`前端体验设计语言`（PM，并行）**：令牌语义提案、伴生叙事——本文以"令牌"为接口承接其语义定义。
