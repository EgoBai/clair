# 澄观 Clair 小程序 POC · ① 设计稿（信息架构 + 关键页规范）

> 文档性质：POC 阶段 0 设计稿，落地 `MINIPROGRAM-POC.md` §九·补 锁定决策。
> 技术栈：Taro 4.x (React) + NutUI React Taro + echarts-for-weixin + Zustand(Taro.storage) + Taro.request。
> 合规定位：**行情/资讯展示**；所有 AI 结论一律标注「研究参考，非投资建议」。
> 阶段 0 页面范围：**行情简化页 + AI 流式页**（自选 / 个股详情进阶段 1，本稿仅作占位规范）。

---

## 一、信息架构（Tab 结构）

### 1.1 MVP 全量 TabBar（5 Tab，阶段 0 仅启用其中 3 个）

```
Clair 小程序
├─ 行情 (tab)    ← 阶段 0 实现（行情简化页）
├─ 自选 (tab)    ← 阶段 1（占位）
├─ AI   (tab)    ← 阶段 0 实现（AI 流式对话）
├─ 资讯 (tab)    ← 阶段 1+（占位，POC 不实现）
└─ 我的 (tab)    ← 阶段 0 实现（仅登录态 + 通知中心入口，最小版）
```

> 说明：微信小程序 TabBar 最少 2 个、最多 5 个。阶段 0 落地 3 个 Tab（行情 / AI / 我的），
> 自选、资讯在 `app.config.ts` 中**不声明**（避免空 Tab 占位误导验收）。阶段 1 再扩展为 5 Tab。

### 1.2 下钻页（非 Tab，`Taro.navigateTo`）

| 页面 | 路由 | 阶段 |
|---|---|---|
| 个股详情 | `/pages/stock-detail/index?symbol=600519` | 阶段 1（本稿占位规范） |
| 板块详情 | `/pages/sector-detail/index?industry=白酒` | 阶段 1+ |
| 资讯详情 | `/pages/news-detail/index?id=...` | 阶段 1+ |

### 1.3 阶段 0 页面树（本次 POC 实际交付）

```
pages/
├── market/index       行情简化页（Tab）
├── ai-chat/index      AI 流式对话页（Tab）
└── profile/index      我的页（Tab，最小版：登录态 + 通知中心入口）
```

---

## 二、设计令牌（Design Tokens）映射

> 单一事实来源：`frontend/src/styles/theme.ts`（已 Read 核验）。以下为小程序侧令牌落地映射。
> 小程序落地方式：WXSS 支持 CSS 自定义属性，令牌在 `src/app.scss` 的 `page` 根选择器下定义为 CSS 变量，
> 页面/组件通过 `var(--color-*)` 引用；同时导出 TS 常量（`src/theme/tokens.ts`）供 echarts option / JSX 内联色使用。

### 2.1 颜色令牌（Color）

| 语义 | theme.ts 常量 | 值 | 小程序 CSS 变量 | 用途 |
|---|---|---|---|---|
| 页面背景 | `colors.page` | `#0a0e1a` | `--color-page` | 全局深色底 |
| 卡片背景 | `colors.card` | `#111827` | `--color-card` | 指数卡 / 列表项 |
| 卡片悬停 | `colors.cardHover` | `#1a2332` | `--color-card-hover` | 按压态 |
| 表面/输入框 | `colors.surface` | `#1e293b` | `--color-surface` | 输入框 / 气泡背景 |
| 边框 | `colors.border` | `#2d3748` | `--color-border` | 分隔线 |
| 浅边框 | `colors.borderLight` | `#374151` | `--color-border-light` | 高亮边框 |
| 主文字 | `colors.text` | `#f1f5f9` | `--color-text` | 标题 / 价格 |
| 次文字 | `colors.textSecondary` | `#94a3b8` | `--color-text-secondary` | 副标题 |
| 弱化文字 | `colors.textMuted` | `#64748b` | `--color-text-muted` | 时间戳 / 免责声明 |
| 主题蓝 | `colors.accent` | `#3b82f6` | `--color-accent` | 按钮 / 链接 / 高亮 |
| 浅蓝 | `colors.accentLight` | `#60a5fa` | `--color-accent-light` | 渐变高亮 |
| 蓝背景 | `colors.accentBg` | `#1e3a5f` | `--color-accent-bg` | 选中态背景 |
| 红涨 | `colors.up` | `#ef4444` | `--color-up` | 上涨 / 正数 |
| 绿跌 | `colors.down` | `#22c55e` | `--color-down` | 下跌 / 负数 |
| 平盘 | `colors.flat` | `#6b7280` | `--color-flat` | 平盘 / 零值 |
| 警告 | `colors.warning` | `#f59e0b` | `--color-warning` | 预警 / 提示 |

> 涨跌色规则（继承 theme.ts `getPriceColor`）：`change > 0` → 红 `--color-up`；`change < 0` → 绿 `--color-down`；`== 0` → 灰 `--color-flat`。
> **A 股语义：红涨绿跌**（与 Web 端一致，`up` 红、`down` 绿）。

### 2.2 字体 / 尺寸 / 圆角

| 语义 | theme.ts 常量 | 值 | 小程序落地 |
|---|---|---|---|
| 数字字体 | `typography.mono` | DIN Alternate / SF Mono / Menlo | `font-family: 'DIN Alternate','SF Mono',Menlo,monospace`，价格/涨跌幅统一用 |
| 中文字体 | `typography.chinese` | PingFang SC / Microsoft YaHei | 系统默认，无需声明 |
| 间距 | `spacing.xs/sm/md/lg/xl/xxl` | 4/8/12/16/24/32 | 用 rpx 换算（375 基准：1px = 2rpx） |
| 圆角 | `borderRadius.md/lg/xl` | 8/12/16 | 卡片 `lg`(12px)、按钮 `md`(8px) |

> rpx 换算：设计稿按 **375px 宽、无水平滚动**；`1px = 2rpx`。间距 16px → 32rpx。

### 2.3 echarts 图表令牌（行情简化页 K 线图）

| 项 | 值 |
|---|---|
| 涨（阳线）填充/边框 | `#ef4444` |
| 跌（阴线）填充/边框 | `#22c55e` |
| 网格线 | `#2d3748`（低透明度） |
| 坐标轴文字 | `#64748b` |
| 均线 MA5/MA20/MA60 | `#60a5fa` / `#f59e0b` / `#ec4899` |
| 背景 | 透明（继承页面 `#0a0e1a`） |

---

## 三、关键页规范

> 统一约束：375px 宽无水平滚动；默认深色；页面顶部无系统导航栏与小程序导航栏重复的标题，
> 用自定义导航或小程序默认导航栏（背景 `#0a0e1a`、文字 `#f1f5f9`）。

### 3.1 行情简化页（阶段 0 · 核心）

**路由**：`pages/market/index`（Tab）

**数据源（真实接口）**：
- `GET /api/market/realtime` —— 三大指数（上证/深证/创业板）+ 涨跌分布（breadth）
- `GET /api/market/kline?symbol=000001.SH&days=120` —— 上证指数日 K（用于 1 张 echarts 图）

**布局（自上而下）**：

1. **大盘指数卡**（轮询 `/market/realtime`，5–10s）
   - 三列：上证 / 深证 / 创业板；每列显示 指数名、点位（`typography.mono`）、涨跌幅（涨红跌绿）。
   - `dataSource: 'unavailable'` → 指数卡显示「数据源暂不可达」空态（灰字 + 占位），**不回填任何数字**。

2. **涨跌分布条**（breadth，来自 `/market/realtime`）
   - 涨 `up` / 跌 `down` / 涨停 `limitUp` / 跌停 `limitDown` / 成交额 `turnoverYi`。
   - 一条水平比例条：红色段（涨）vs 绿色段（跌）；`breadth === null` 时隐藏该模块。

3. **指数 K 线图**（`/market/kline`，1 张 echarts-for-weixin）
   - K 线（蜡烛）+ 成交量柱；`option` 为纯 JSON，复用 Web 端 echarts option。
   - `dataSource: 'unavailable'` 或 `dates.length === 0` → 图表区显示诚实空态文案「K 线数据暂不可达」，不渲染空坐标。

4. **页脚合规条**（固定）：`行情数据仅供参考，不构成投资建议`（`--color-text-muted`）。

**交互**：下拉刷新重拉数据；进入页面启动轮询，`onHide` 停止轮询（`onShow` 恢复），避免后台空转。

---

### 3.2 AI 流式对话页（阶段 0 · 核心）

**路由**：`pages/ai-chat/index`（Tab）

**数据源（真实接口）**：`POST /api/ai/chat`（SSE，`text/event-stream`，`wx.request enableChunked` 消费）

**布局**：

1. **消息列表**（滚动）
   - 用户气泡：右侧，`--color-accent-bg` 背景、`--color-text` 文字。
   - AI 气泡：左侧，`--color-card` 背景；**逐字流式输出**（`onChunkReceived` 累积解析 `data: {...}\n\n`）。
   - 流式进行中显示光标闪烁占位符。

2. **输入区**（吸底）
   - 输入框（`--color-surface`）+ 发送按钮（`--color-accent`）。
   - 发送后进入流式状态；流式结束（收到 `data: [DONE]`）恢复可输入。

3. **合规条**（每条 AI 回复底部或页脚固定）：
   `AI 内容为研究参考，非投资建议`（`--color-warning` 或 `--color-text-muted`）。

**边界处理（诚实降级）**：
- SSE 流无分块返回 / 请求失败 → 显示「AI 服务暂时不可用，请稍后重试」。
- 后端错误帧 `{"content":"\n\n⚠️ AI服务暂时不可用"}` → 原样渲染该文案，不伪造内容。

---

### 3.3 个股详情页（阶段 1 · 占位规范）

**路由**：`pages/stock-detail/index?symbol=600519`（`navigateTo`）

**规划数据源（阶段 1 才接入，本次仅定义布局骨架）**：
- 头部行情：`GET /api/stocks/:symbol`
- K 线：`GET /api/stocks/:symbol/kline`（或 `/api/market/kline`）
- 技术指标：`GET /api/indicators/:symbol`（MA/MACD/KDJ/RSI/BOLL）
- AI 诊断卡：`GET /api/ai/diagnose/:symbol`（标注「研究参考，非投资建议」）
- 财务：`GET /api/financials/summary?symbol=`

**布局骨架**：价格头卡 → K 线图（echarts，懒加载）→ AI 诊断卡 → 关键指标表 → 页脚合规条。

---

### 3.4 自选列表页（阶段 1 · 占位规范）

**路由**：`pages/watchlist/index`（Tab，阶段 1 启用）

**规划数据源**：`GET /api/watchlist`（JWT 鉴权）+ `POST /api/stocks/batch/quotes`（批量行情）

**布局骨架**：分组 Tab → 股票列表（代码/名称/最新价/涨跌幅，涨红跌绿）→ 空态「暂无自选，去行情页添加」→ 底部「去添加」按钮。

---

### 3.5 我的页（阶段 0 · 最小版）

**路由**：`pages/profile/index`（Tab）

**阶段 0 范围**：
- 登录态卡片：已登录显示昵称/邮箱（脱敏），未登录显示「登录 / 注册」按钮。
  - 数据源：`POST /api/user/login` / `POST /api/user/register`；`GET /api/user/profile`（Bearer）。
- 通知中心入口：显示未读角标（`GET /api/notifications/user/:userId/unread-count`），点击进入通知列表（阶段 0 仅入口，列表页可占位）。
- 设置项占位：主题（默认深色）、免责声明、关于。

---

## 四、视觉基线（阶段 0 两页共享）

- 背景 `#0a0e1a`；卡片 `#111827` + 边框 `#2d3748` + 圆角 12px。
- 数字统一 `font-family: mono`；涨跌幅颜色严格走 `getPriceColor` 规则。
- 空态统一样式：图标 + 灰字文案（`--color-text-muted`），居中，无假数据。
- 合规条统一样式：`--color-text-muted` 小字，页脚或列表底部固定出现。
