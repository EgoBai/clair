# 澄观 Clair 前端「五维」实现审计报告

审计范围：`frontend/src` 全部页面与组件 + `clair-worker/worker.js` + `backend/src/api/sector-multidim*.ts`
审计日期：2026-09-02 ｜ 结论：**五维中「技术面/资金面」标签错配、「舆情面」实际不存在、「市场面」无统一实现，仅「基本面」散落在估值因子里**

---

## 0. 五维落地情况总览

| 维度 | 是否存在真实实现 | 落点 | 判定 |
|---|---|---|---|
| 技术面 | ❌ 名不副实 | `DiscoverPage.tsx:1386` 把「平均涨跌幅线性变换」叫技术面 | 错配（P0-2） |
| 市场面 | ⚠️ 无统一实体 | 散落在 `MarketSentiment`(情绪) / `MarketBreadthPanel`(宽度) / `MarketOverview`，**三者均无生产引用** | 空壳（P0-4） |
| 资金面 | ❌ 名不副实 | `DiscoverPage.tsx:1388` 把「成交量对数」叫资金面；真正的资金流 `CapitalFlowPanel` 零引用 | 错配 + 空壳（P0-2/P0-4） |
| 基本面 | ⚠️ 部分 | `RadarPage` 估值/规模/质量因子；`ScreenerPage` 估值·财务 | 可用但量纲错（P1-1） |
| 舆情面 | ❌ **完全缺失** | 仅 `DiscoverPage:113-114` 两个**冒名**维度（详见 P0-1） | 虚构（P0-1） |

---

## P0 — 阻塞 / 错误（必须修）

### P0-1 「舆情面」是冒名的：命名、公式、实现三者完全脱节

**证据链**

- `DiscoverPage.tsx:113` 标签「搜索热度」+ 公式 `'搜索热度=百度搜索指数归一化×20'` → 后端实现 `sector-multidim-v3.ts:295-307` `calcSearchHeat(distinctSubIndustries)`，实际按**板块涉及的细分领域/概念标签数量**分档（>15→20, >10→15, >5→10, else 5）
- `DiscoverPage.tsx:114` 标签「传播度」+ 公式 `'传播度=舆情扩散速率×20'` → 后端实现 `sector-multidim-v3.ts:309-325` `calcSpreadDegree(limitUpCount, totalStocks)`，实际按**涨停家数占比**分档

**影响**
- 全仓无任何百度指数 / 股吧热度 / 新闻情感数据源（已 grep `舆情|热搜|新闻面|消息面` 于 `pages/`、`components/`，仅命中上述两行 + `ReportCenterPage` 的研报摘要）。
- 用户看到「搜索热度 18 分」会理解为百度搜索指数，实际是「这个板块挂了 12 个概念标签」。这是**明示虚假口径**，直接触犯「不接受虚构数据」红线。
- 这两个维度通过 `sector-multidim-v3.ts:745` `boomScore = 扩散+回补+动量仓位+搜索热度+传播度` 进入景气度总分，污染核心排序指标。

**建议改法**
1. 短期：立即改名为「概念广度」「涨停扩散」，同步修正 `DiscoverPage.tsx:113-114` 的 `formula` 文案为真实口径。
2. 长期：接入真实舆情源（东财股吧热度、新闻情感打分、研报评级变动），新建独立 `sentimentScore`，与 `boomScore` 解耦，作为第五维独立展示。

---

### P0-2 板块三字段有三套标签，全部与后端口径不符

**后端真值**（`clair-worker/worker.js:433-437`）

```js
const breadthScore  = (upCount / count) * 100;                        // 上涨家数占比
const changeScore   = clamp(50 + avgChange * 6);                      // 涨跌幅线性变换
const volumeScore   = clamp(Math.log10(totalVolume / count + 1) * 8); // 平均成交量对数
const momentumScore = clamp(50 + avgChange * 5);                      // 涨跌幅线性变换
let score = momentumScore*0.35 + changeScore*0.25 + breadthScore*0.25 + volumeScore*0.15;
```

**三套前端标签对照**

| 位置 | 对 `changeScore` | 对 `volumeScore` | 对 `breadthScore` | 权重文案 |
|---|---|---|---|---|
| `DiscoverPage.tsx:780-787`（列表 Tooltip） | 🔥板块热度「平均涨跌幅的**绝对值**」 | 💰成交活跃「**总成交金额**」 | 🎯赚钱效应「**涨停家数**」 | 50 / 30 / 20 |
| `DiscoverPage.tsx:1386-1390`（板块详情） | **技术面** | **资金面** | 宽度 | 无 |
| 后端实际 | 涨跌幅线性变换（**非绝对值**，跌得狠反而低分） | 平均**成交量**（手）对数（非成交额/非资金流） | **上涨**家数占比（非涨停家数） | 25 / 15 / 25（+momentum 35） |

**逐条坐实的错配**
1. `changeScore` 不是绝对值 — 后端 `50 + avgChange*6`，跌 8% → 2 分，涨 8% → 98 分；Tooltip 写「绝对值，涨得越猛得分越高」，会让人以为深跌也是高分。
2. `volumeScore` 是**成交量（手）**不是成交额，`totalVolume` 由 `worker.js:415` 累加 `q.volume` 而来；成交额是 `q.turnover`（`worker.js:416`）。称「总成交金额」是错的。
3. `breadthScore` 是**上涨**家数占比，`worker.js:432` `upCount = changePercent > 0`，与涨停无关（涨停单独在 `limit_up_count`）。
4. 叫「技术面」/「资金面」均无依据：`changeScore` 不含任何 MA/MACD/RSI；`volumeScore` 不含任何主力净流入。真正的资金流在 `FundFlowPage`（`mainNet`）。
5. **权重 50/30/20 完全虚构**，后端是 35/25/25/15，且权重最高的 `momentumScore`(0.35) **从未在任何 UI 出现**。
6. 同页面还有第三处说法：`DiscoverPage.tsx:1248` 写死 `综合评分 = 板块热度×50% + 成交活跃×30% + 赚钱效应×20%`。

**附带数据缺陷**：`momentumScore` 与 `changeScore` 都由 `avgChange` 派生（5× vs 6×），完全共线，合计占 60% 权重 —— 所谓"多因子"实为单一价格信号重复计数。

**建议改法**
- 重命名：`changeScore`→「价格动能」、`volumeScore`→「量能活跃度」、`breadthScore`→「上涨广度」，补出 `momentumScore`。
- 修正 Tooltip：删除「绝对值」「总成交金额」「涨停家数」三处错误描述。
- 权重文案统一为 `动量35% + 价格25% + 广度25% + 量能15%`。
- 后端应去掉 `momentumScore`/`changeScore` 的共线重复，或改为多周期动量。

---

### P0-3 四套「多因子」接口版本并存，维度集合互相矛盾

- DiscoverPage → `multidim-v3`，**14 维**：`DiscoverPage.tsx:109-124` `DIM_REGISTRY`（注释 `:131` 指向 `sector-multidim-v3.ts:745`）；批量加载 `components/discover/loadMultidimBatched.ts:70`
- SectorDetailPage → `/api/sectors/:code/multidim`（**v1**），**5 维**：`SectorDetailPage.tsx:165`；雷达 keys `:184`
- RadarPage → `/api/ai/gems`，**6 因子**（动量/成交/估值/规模/行业/质量）：`RadarPage.tsx:59-66`
- ScreenerPage → 自选条件，**5 类**（行情·估值·财务·技术·行业）：`ScreenerPage.tsx:775`

后端侧确认：v1 = 5 维（`backend/src/api/sector-multidim.ts:5-10`、`:37-41`）；v3 = 14 维（`sector-multidim-v3.ts:75-78, 752-753`）。

**影响**：同一板块在 DiscoverPage 展示 14 维热力图，点进 SectorDetailPage 只有 5 维雷达，且共享维度（拥挤度 `crowding`、扩散度 `diffusion`）来自不同版本算法，分值可能对不上。用户会认为产品数据自相矛盾。

**建议改法**：全站统一到 `multidim-v3`；`SectorDetailPage.tsx:165` 改为请求 v3 并展示 14 维（与 DiscoverPage 共用 `DIM_REGISTRY`，把它抽到 `components/discover/` 下导出）。

---

### P0-4 四个五维相关组件是空壳：只有测试引用，零生产引用

全仓库 `grep -rln`（排除组件自身文件）结果，**生产引用均为 0**：

- `components/Market/CapitalFlowPanel.tsx`（「资金面评分」）→ 仅 `__tests__/capitalFlowPanel.test.tsx`、`__tests__/marketDashboard.test.ts`
- `components/Market/MarketSentiment.tsx`（情绪评分）→ 仅 `__tests__/components/MarketSentiment.test.tsx`、`__tests__/marketDashboard.test.ts`
- `components/AI/ModelExplanationViz.tsx`（fundamental/technical/sentiment/macro 四类）→ 仅 `__tests__/aiComponents.test.ts`
- `components/AI/StrategyComparison.tsx` → 仅 `__tests__/aiComponents.test.ts`

对照：真正被生产引用的同类组件是 `components/AI/MultiSignalPanel.tsx`（`pages/StockDetailPage.tsx:23,600`）。

**影响**：产品宣称的「资金面」「情绪面」在真实页面上**根本不存在**。这四个组件有完整实现 + 完整单测却从未挂载，是典型的「有代码无功能」，直接触犯「不接受空壳功能」红线；测试全绿反而掩盖了它们从未上线。

**建议改法**：(a) 在 StockDetailPage 诊断区、FundFlowPage 接入 `CapitalFlowPanel` 与 `MarketSentiment`；或 (b) 删除组件及其测试。不要保留无引用代码。

---

### P0-5 后端数据缺失时注入虚构「中性分 10」并计入总分

`backend/src/api/sector-multidim.ts` 共 5 处在数据缺失时返回硬编码 `score: 10`：`:74` `'PE数据缺失,默认中性分'`、`:104` `'无个股数据'`、`:128` `'样本不足'`、`:132` `'无成交'`、`:166` `'无小盘股'`；随后 `:390` `totalScore = crowding + diffusion + concentration + retail + recovery` 将其计入 0-100 总分。同样模式见于 `sector-multidim-v3.ts:331,334`（`momentumPosition`）。

**前端消费链**：`SectorDetailPage.tsx:190-192` `values = keys.map(k => dims[k].score)` → 虚构 10 直接画进雷达图；`:355` `综合得分: {totalScore}/100` 给出「良好/一般」评级；`:408` 渲染 `{dim.score}/20`，`:411` 渲染 `dim.label`（会显示「数据不足」）—— 这是唯一缓解，雷达图与总分仍被污染。

**影响**：一个 PE 数据全缺的板块，拥挤度稳定显示 10/20「轻度拥挤」，与真实算出的 10 分在 UI 上**完全无法区分**，且被计入总分参与板块排序。

**建议改法**：缺失时返回 `score: null`；前端该维渲染「—」+ 灰化，雷达图该轴置 0 并加虚线边框；总分仅在 5/14 维齐全时给出，否则显示「维度不全，仅供参考」。

---

### P0-6 路由不匹配：点击跳转 404

- 路由定义：`routes/index.tsx:79` → `path="stocks/:symbol"`
- 错误跳转：`pages/SectorDetailPage.tsx:515` → `navigate(\`/stock/${record.symbol}\`)`（**单数 `stock`**）
- 错误跳转：`pages/LockupCalendarPage.tsx:143` → `<a href={\`/stock/${record.symbol}\`}>`（单数 + 整页刷新）

**影响**：板块详情页的个股列表、解禁日历的股票名称，点击后全部落到 `NotFoundPage`（`routes/index.tsx:123`）。解禁日历用的是 `<a href>`，还会触发整页重载丢失 SPA 状态。

**建议改法**：统一为 `/stocks/${symbol}`；`<a href>` 改 `<Link to>`。

---

## P1 — 体验缺陷

### P1-1 RadarPage 雷达坐标轴 max 与后端因子满分全部不符

- 前端 `RadarPage.tsx:59-66`：`动量25 / 成交25 / 估值20 / 规模20 / 行业15 / 质量15`，合计 **120**
- 后端 `clair-worker/worker.js:2076-2079`：`computePercentileScores(..., 20)` 动量和成交、**`15`** 估值和规模；`:2089` `industryScore = (sectorHot/100)*15`；`:2092` `qualityScore = 15`
- 后端满分合计 **100**

**影响**：100 分制的数据画在 120 分制的轴上，每个轴系统性压缩约 17%；动量/成交轴只画到 80%（20/25），估值/规模轴只画到 75%（15/20）。雷达图形状失真，所有股票看起来都比实际"瘦"。

**建议改法**：`RADAR_INDICATORS` 改为 `[{动量,20},{成交,20},{估值,15},{规模,15},{行业,15},{质量,15}]`。

---

### P1-2 RadarPage「优质推荐」计数口径随筛选模式变化

```ts
// RadarPage.tsx:141-144
const premiumCount = useMemo(() => {
  if (scoreFilter === 'premium') return total;   // 后端 minScore=80 的全市场总数
  return gems.filter(g => g.score >= PREMIUM_THRESHOLD).length;  // 当前 Top50 里 ≥80 的个数
}, [gems, total, scoreFilter]);
```

**影响**：切到「全部」后，同一个「优质推荐」数字从「全市场 321 只」变成「Top50 中 47 只」，语义完全不同却共用同一标签（`:479`, `:510`）。用户会以为优质股突然变少了。

**建议改法**：拆成两个指标并分别命名（「全市场优质池」/「当前列表优质数」），或用同一口径（都向后端取总数）。

---

### P1-3 SectorDetailPage 雷达图混合正负极性维度，面积语义颠倒

- `SectorDetailPage.tsx:184-188`：五轴 `crowding / diffusion / concentration / retail / recovery`，全部 `max: 20`
- 但按 `DiscoverPage.tsx:116-122` 的极性定义：`crowding`、`concentration`、`retail` 是 `polarity: 'negative'`（**高分 = 风险高**），`diffusion`、`recovery` 是 `'positive'`

**影响**：雷达图上「面积大」通常读作「更好」，于是「拥挤度 18/20（极度拥挤，危险）」画出与「扩散度 18/20（高度扩散，健康）」一模一样的大凸起。用户会把高风险信号读成优势。

**建议改法**：负极性维度入图前做 `20 - score` 反转并改名（拥挤度→「不拥挤度」、集中度→「分散度」、散户情绪→「机构主导度」）；或改用横向条形图 + 按极性着色（参考 `DiscoverPage.tsx:164-170` 已有的 `getDimColor(score, polarity)` 实现）。

---

### P1-4 同一页面内两个评分配色完全相反

- `StockDetailPage.tsx:515`：`aiStrategy.score >= 70 ? COLOR_UP : aiStrategy.score >= 40 ? '#f59e0b' : COLOR_DOWN`
  - `COLOR_UP = THEME.up = var(--color-up)` = **红**（`StockDetailPage.tsx:34`）
- `StockDetailPage.tsx:653-659` 与 `:674`：`totalScore >= 70 ? '#22c55e' : ... : '#ef4444'` = **绿**

**影响**：同一屏内，策略评分高分显示红色（好），AI 诊断评分高分显示绿色（好）。用户无法建立稳定心智。

**建议改法**：评分语义统一为「高分=绿」，与涨跌红绿解耦，对齐 `DiscoverPage.tsx:408` 的 `scoreColor`（已是 70→`#22c55e` / 45→`#f59e0b` / 25→`#f97316` / else `#6b7280`）。

---

### P1-5 六套评分分级阈值互不相同

| 位置 | 阈值 | 标签 |
|---|---|---|
| `DiscoverPage.tsx:408-409` | 70 / 45 / 25 | 高景气/较活跃/一般/冷门 |
| `SectorDetailPage.tsx:107-110` | 80 / 60 / 40 | 优秀/良好/一般/偏弱 |
| `StockDetailPage.tsx:515` | 70 / 40 | — |
| `StockDetailPage.tsx:653-654` | 70 / 50 | — |
| `RadarPage.tsx:67-68` | 80 / 40 | 优质池 / 全部 |
| `MarketSentiment.tsx:46-52` | 60/30/10/-10/-30/-60 | 极度乐观→极度悲观 |

**影响**：同样是「52 分」，在 DiscoverPage 是「较活跃」，在 SectorDetailPage 是「一般」。

**建议改法**：抽出 `utils/scoreScale.ts`，导出 `getScoreTier(score)` 与 `getScoreColor(score)`，全站引用。

---

### P1-6 评分缺量纲解释，后端已返回说明但被丢弃

- `RadarPage.tsx:55-56` 声明了 `factors: Record<string, string>` 和 `scoring: string`
- 但全文件除这两行类型声明外**零使用**（`grep -n "scoring\|factors" pages/RadarPage.tsx` 仅命中 55、56 行）
- 后端确实产出了说明文本：`clair-worker/worker.js:2235` `'规模(0-15): 市值距理想区间百分位'`、`:2277` 单位说明
- 后端还有隐含量纲未在 UI 说明：`worker.js:2107` `totalScore = Math.max(30, Math.min(98, rawTotal))` —— **分数被钳制在 30-98**，意味着「40 分」其实是地板分

**影响**：用户看到「52 分」不知道是百分位还是绝对分，不知道 30-98 的钳制区间，也不知道「优质池 ≥80」意味着什么。

**建议改法**：把 `scoring` / `factors` 渲染为评分卡片脚注或 `Tooltip`；显式标注「百分位评分 · 满分 100 · 区间 30-98」。

---

### P1-7 AI 诊断空态文案写死「三个维度」，且与实际不符

- `StockDetailPage.tsx:714`：`点击"开始诊断"，AI 将从估值、技术面、基本面三个维度进行综合分析`
- 实际渲染的是后端返回的动态数组：`StockDetailPage.tsx:671` `aiDiagnosis.dimensions?.map(...)`

**影响**：五维诉求在个股详情页只承诺 3 维（且不含市场面/资金面/舆情面）；硬编码文案与后端实际维度数会脱节。

**建议改法**：改为「将从多个维度进行综合分析」，或按后端 `dimensions` 动态生成维度名列表。

---

### P1-8 数值未做空值保护

- `StockDetailPage.tsx:653` `aiDiagnosis.totalScore >= 70` → `undefined` 时三个比较全 false，恒显红色；`:659`/`:674` 渲染空白与 `undefined`
- `MarketSentiment.tsx:173` `(totalTurnover/1e12).toFixed(2)}万亿` → 渲染 `NaN万亿`；`:184` `avgChangePercent.toFixed(2)` → `TypeError` 崩溃
- `DiscoverPage.tsx:1381` `avg_change_percent.toFixed(2)` → `TypeError` 崩溃；`:1382` `formatBig(total_turnover)` → 渲染 `undefined`；`:792` `formatBig(Number(...))` → 渲染 `NaN`

**建议改法**：统一 `fmtNum(v, digits, fallback='—')`，所有渲染点接入。

---

### P1-9 板块详情「维度」与上方指标信息冗余 + 双重计数

`DiscoverPage.tsx:1376-1391` 同时展示 `:1380` 涨跌幅、`:1382` 成交额、`:1386` **技术面** `{changeScore}`（由同一个 `avgChange` 派生，`worker.js:434`）、`:1388` **资金面** `{volumeScore}`（由同一个 `totalVolume` 派生，`worker.js:435`）。

**影响**：三项「维度」有两项是上方指标的重述，数字翻倍而信息量未增；`changeScore` 与 `momentumScore` 同源于 `avgChange`，在总分中被算两遍（合计 60% 权重）。

**建议改法**：维度区只保留与上方**不重复**的信号（上涨广度、涨停家数），或把原始指标折叠为维度分的解释性副文本。

---

## P2 — 优化建议

### P2-1 `ModelExplanationViz` 大面积白色/浅色背景，违反暗色主题

`:151` Tooltip `background:'#fff'` + `border:'1px solid #ddd'`；`:172-176` 连接线 `#e8e8e8`；`:194` 节点 `border:'2px solid #fff'`；`:198-199` 步骤卡 `#f6ffed`/`#fff2e8`；`:138` Treemap `stroke="#fff"`；`:247-263` 四个 `<Card>` 未指定深色背景 → Antd 默认白底。

**改法**：全部替换为 `var(--card-bg)` / `var(--border-default)` / `var(--bg-secondary)`。

### P2-2 `MarketSentiment` 全卡片浅色底（明令禁止的白色背景）

`:108` `#f0f0f0`、`:158` `#fff1f0`、`:164` `#f6ffed`、`:170` `#e6f7ff`、`:178` `#fff7e6`；`:159,:166,:171,:179` `color:'#666'`；`:77-85` `<Card>` 默认白底；`:93` `<Tag color>` 用 Antd 调色板（`#faad14`/`#722ed1`/`#2f54eb`）脱离项目色板。

**改法**：同 P2-1；Tag 改用项目色 `#ef4444 / #f59e0b / #22c55e / #3b82f6`。

### P2-3 `CapitalFlowPanel` 硬编码色值，脱离设计令牌

`:35,:101,:107,:124,:140` `background:'#1a1a2e'`（项目卡片色为 `#1a2332`/`var(--card-bg)`）；`:63` 评分配色 `#e74c3c/#f39c12/#2ecc71`（项目为 `#ef4444/#f59e0b/#22c55e`）；`:87` Tab `#3498db`/`#2d2d44`。

**改法**：全部改用 `styles/theme-constants.ts` 的 `THEME` 常量。

### P2-4 `CapitalFlowPanel` 资金面评分高分用红色，与全站评分语义冲突

`:63` `fundFlowScore >= 70 ? '#e74c3c' : >= 40 ? '#f39c12' : '#2ecc71'` → 高分红、低分绿；而 `DiscoverPage.tsx:408`、`StockDetailPage.tsx:653` 均为「高分=绿」。

**改法**：评分配色统一用 `getScoreColor()`；红绿仅用于资金流向正负（`netMainFlow >= 0 ? 红 : 绿`，符合 A 股习惯）。

### P2-5 六个页面 Antd Table 缺 `scroll={{ x: 'max-content' }}`，375px 横向溢出

`SectorDetailPage.tsx:508`、`BacktestPage.tsx`、`FinancialsPage.tsx`(2 处)、`MarginTradingPage.tsx`、`PortfolioPage.tsx`、`TopTradersPage.tsx`(3 处)。对照已正确实现的 `DiscoverPage.tsx:1397`、`RadarPage.tsx:625`。

`SectorDetailPage` 尤其需要修复——`stockColumns`（`:251-259+`）含排名/代码/名称/权重(Progress)/… 至少 5 列，375px 必然溢出。

### P2-6 热力图 emphasis 白边

`DiscoverPage.tsx:632` `borderColor: '#fff'` → 改 `rgba(255,255,255,0.6)` 或 `var(--text-primary)`。

### P2-7 二级行业分支完全无评分/维度展示

`DiscoverPage.tsx:1319-1348`（`industryLevel === 2`）只渲染 名称/股票数/涨幅/换手，**无 score、无任何维度**；而一级分支 `renderScoreItem`（`:760-790`）有完整评分。后端已返回 `total_cap`（`backend/src/api/industries.ts:51`）但前端未使用。

**改法**：L2 接入 `multidim-v3` 展示景气度，或补上 `total_cap` 与涨幅排序。

### P2-8 舆情素材存在但未产品化

`DiscoverPage.tsx:1129-1150` 首页新闻区已有 `利好/利空/中性` 标签（`:1144-1146`，红=利好绿=利空，符合 A 股习惯），但仅 6 条列表、**无聚合评分、不进入任何维度面板**；`ReportCenterPage.tsx` 有完整研报情感聚合（`analyzeReportSentiment`、`:551`），但是独立页面，**与个股/板块五维面板无联动**。

**改法**：把新闻情感 + 研报情感聚合为 `sentimentScore(0-100)`，作为第五维接入 StockDetailPage 诊断面板与 SectorDetailPage 维度矩阵。

---

## 附录：修复优先级建议

1. **先做 P0-1 / P0-5**（虚构数据红线）：改名或接真实源、缺失返回 null
2. **再做 P0-2 / P0-6**（明显错误）：标签口径校正、路由修复
3. **然后 P0-3 / P0-4**（架构一致性）：统一 multidim-v3、空壳组件接入或删除
4. **最后 P1 / P2**：量纲对齐、配色统一、移动端适配
