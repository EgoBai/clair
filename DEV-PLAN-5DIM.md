# 五维数据治理开发计划

> 配套文档：`五维数据体检报告.html`（体检结论与验证证据）｜ `HANDOFF.md`（交接快照）｜ `TEAM-STRUCTURE.md`（分工矩阵）
> 日期：2026-09-05 ｜ 范围：技术面 / 市场面 / 资金面 / 基本面 / 舆情面
> 原则：**不接受虚构数据 · 不接受空壳功能 · 编译通过 ≠ 功能可用**

---

## 〇、第二轮进展速览（2026-09-05 下午）

| 待办 | 结果 |
|------|------|
| P1 历史数据底座（第三节） | ✅ **v3-lite 引擎落地**：14 维中 8 维可算（实时 5 + 板块日 K 3），其余如实 null；`/api/cron/collect-history` 落库端点 + GitHub Actions 定时器就绪。前端 tsc 0 错误、受影响测试 136/136 过、本地 wrangler 全端点验证 |
| 空壳清理（第四节） | ✅ **4 组件全部处置**：CapitalFlowPanel 接入个股详情（新端点 `/api/fund-flow/:code`）、MarketSentiment 接入市场洞察（市场情绪卡）；ModelExplanationViz、StrategyComparison 连同测试删除（唯一数据源是随机数/硬编码） |
| 部署（第二节） | ⏸ 沙箱无推送条件（无凭据 + 网络墙），三条替代 runbook 见 HANDOFF.md §五 |
| 协作机制 | ✅ HANDOFF.md + TEAM-STRUCTURE.md + wb-issues 看板（见文档末尾说明） |

---

## 一、已完成（P0）

改动文件：

| 文件 | 改动 |
|------|------|
| `clair-worker/worker.js` | K 线三源降级（个股/指数/回测/策略/tech-batch **五条链路全部收编**）、市值/PB 真实化、新闻多源、个股新闻定向检索 |
| `frontend/src/pages/DiscoverPage.tsx` | 舆情维度正名、真实权重、三处 Tooltip 口径修正 |
| `frontend/src/pages/SectorDetailPage.tsx` | null 安全渲染、维度不全提示、404 诚实空态、下钻路由笔误修复 |
| `frontend/src/pages/RadarPage.tsx` | 雷达轴满分对齐后端（120 → 100） |
| `frontend/src/pages/LockupCalendarPage.tsx` | 下钻路由笔误修复（/stock → /stocks） |
| `backend/src/api/sector-multidim.ts` | 清除 5 处虚构分，总分改为维度齐全才计算 |

### 1. 技术面 — K 线从「整条 500」到「三源降级」

**根因**：腾讯 `web.ifzq.gtimg.cn` 按出口 IP **间歇性**返回 WAF 501 HTML 页，而原代码直接 `resp.json()`，HTML 触发 `Unexpected token '<'` 抛错。个股 K 线、指数 K 线、回测三条链路同时 500。

> 关键观察：复检时线上 K 线又恢复正常（640 根）——证明是间歇性封禁而非永久失效，这类故障最容易被误判为"偶发"而漏修。

**改法**：新增 `fetchDailyKLine()`，串行尝试 腾讯（前复权）→ 新浪（1023 根上限）→ 东财（前复权），先探测响应是否以 `<` 开头以识别 WAF 拦截页；全部失败时返回空数组 + `attempts` 明细，由前端诚实展示，**不用假数据填充**。

> 补充（9-05 复查）：单源直连不止 K 线两处——排查发现 **5 处**依赖同一腾讯 K 线上游：个股 K 线、指数 K 线、`/api/stocks/:code/strategy`、`/api/index/:code/strategy`、`/api/backtest/:code`、`/api/tech/batch`（复盘页 + 选股页的技术指标源）。现已全部收编进 `fetchDailyKLine` 多源链路，本地逐一实测通过。

**验证**：故障注入（腾讯源置为不可达）→ 自动降级新浪，`source: "sina"`，1023 根真实 K 线，HTTP 200。`tech/batch` 实测返回 600519（RSI 64 / MA20 1311.28）与 000001（RSI 82 / MA20 11.49）真实指标；回测 22 笔交易；双策略链路信号正常。

### 2. 基本面 — 市值从「硬编码 0」到真实值

个股详情把 `marketCap` / `circulatingMarketCap` **写死为 0**，而行情解析层本已能取到真实字段。修复后茅台返回总市值 16236.18 亿、PB 6.46。缺失时返回 `null`（渲染为 `—`）而非 0，避免 0 被误判为有效数值。

### 3. 舆情面 — 从「不存在」到真实可用

原状态：`/api/news` 恒返回 `[]`（东财 headline 接口已 404 下线，代码静默吞掉）；板块维度里叫「搜索热度=百度搜索指数」，实际算的是**概念标签数量**——属明示虚假口径。

改法分两层：
- **命名正名**：`searchHeat` → 「概念广度」，`spreadDegree` → 「涨停扩散」，公式文案同步改为真实口径
- **真实数据源**：新闻流改接东财 A 股新闻（column=347），个股新闻改用东财资讯搜索定向检索（快讯流个股命中实测为 0），附 `sentimentDistribution` 与 `disclaimer` 口径声明

### 4. 清除虚构分

`sector-multidim.ts` 5 处「数据缺失返回 `score: 10`」，与真实算出的 10 分在 UI 上无法区分，且被计入总分污染板块排序。改为 `null`，总分仅在五维齐全时计算，否则返回 `null` + `availableDimCount`。

---

## 二、待部署（P0 — 阻塞线上生效）

**沙箱已端到端验证通过，但线上运行的是 Cloudflare Pages 上的旧版本**，以下修复需部署后才生效：

- `/api/market/summary` 市场总览（线上 404，仓库已有实现）
- 新闻 / 舆情接口
- 个股真实市值与 PB
- K 线多源容错
- **第二轮新增**：v3-lite 多维矩阵（batch / 单板块 / v2 投影）、`/api/fund-flow/:code`、`/api/cron/collect-history`、市场情绪卡、个股资金流卡
- ⚠️ `worker.js` 已同步 `_worker.js`（9-05 复核完成，`node --check` 通过）

**部署方式**：推送至 `main`，GitHub Actions（`deploy-worker.yml`）自动部署到 `clair-api` 项目。**沙箱无推送条件**（无 git 凭据、api.github.com 不可达），三条替代 runbook 见 `HANDOFF.md` §五：有网开发机推送（推荐）/ 修复 github-connector / 用户提供 PAT。

**部署后回归清单**：

```bash
B=https://clair-api.pages.dev
curl "$B/api/market/summary"                 # 期望 200
curl "$B/api/stocks/600519/kline"            # 期望 200 且 data.source 非空
curl "$B/api/stocks/600519"                  # 期望 marketCap > 0
curl "$B/api/news?limit=5"                   # 期望 count > 0
curl "$B/api/news/600519"                    # 期望 count > 0
# —— 第二轮新增回归 ——
curl -X POST "$B/api/sectors/multidim-v3/batch" -H 'Content-Type: application/json' -d '{"codes":["银行","食品饮料"]}'   # 期望 meta.computed=2
curl "$B/api/sectors/银行/multidim"          # 期望 200，维度缺失时 totalScore=null
curl "$B/api/fund-flow/600519"               # 期望 source=eastmoney
curl "$B/api/cron/collect-history"           # 期望 sectors=31（需 push2his 可达，首次 ok 可能偏低属正常）
# —— 回测链路回归（2026-09-08 新增）——
curl -X POST "$B/api/backtest/run" -H 'Content-Type: application/json' \
  -d '{"symbol":"600519","strategy":"ma_cross","startDate":"2025-01-01","endDate":"2025-12-31"}'
  # 期望 200，data.totalTrades>0，data.source=tencent，data.benchmarkReturn 非 null
curl -X POST "$B/api/backtest/run" -H 'Content-Type: application/json' \
  -d '{"symbol":"600519","strategy":"ma_cross","startDate":"2025-01-01","endDate":"2025-01-10"}'
  # 期望 400「回测区间过短」
curl -X POST "$B/api/backtest/run" -H 'Content-Type: application/json' \
  -d '{"symbol":"600519","strategy":"martingale","startDate":"2024-01-01","endDate":"2024-12-31"}'
  # 期望 400「不支持的策略」
```

---

## 三、P1 — 架构短板：多维矩阵缺历史数据底座

> **9-05 状态：v3-lite 引擎已落地（步骤 3 完成），历史落库链路就绪待 push2his 恢复后验证全路径。**

**已实现（本轮）**：

- **v3-lite 14 维引擎**（`clair-worker/worker.js` `computeV3Lite`）：
  - 实时 5 维恒可算：crowding（板块 PE 全板块分位）、concentration（Top5 成交占比）、panic（跌>5% 占比）、volatility（振幅截面标准差）、spreadDegree（涨停占比）
  - 板块指数日 K 3 维：recovery（5日/20日日均涨幅差）、leverage（成交偏离 20 日均值）、fundFlow（近 5 日涨跌天数比）——依赖 push2his 或 KV `bkk:{BKcode}`
  - 个股历史 4 维（diffusion/retail/momIndex/momentumPosition）+ zScore（需 KV PE 历史≥20 点）+ searchHeat：数据可得前如实 `null` + 原因，**组合分仅在成分维齐全时计算**
  - 与 backend v3 同口径：`pctile` 线性插值分位数
- **关键发现**：东财行业板块（BK1200-BK1217 系列）与申万一级 31 行业 **1:1 精确同名**，无需映射维护
- **KV 落库端点**：`GET /api/cron/collect-history`（可选 CRON_TOKEN）——刷新 31 板块 K 线写 KV + 追加 PE 历史
- **定时器**：`.github/workflows/collect-history.yml`，交易日北京时间 15:30 自动触发（GitHub Actions cron 替代 Cloudflare 不支持的原生 cron）

**本地验证**：batch 端点 4/4 板块计算成功（meta `{computed:4, failed:[], source:'v3-lite'}`）；银行实时 5 维真实（crowding=20 合理——PE 全市场最低）；历史维诚实 null（detail 显示 push2his 网络阻断）；collect-history 31 板块全部尝试、失败不崩溃不虚构。

**剩余（等网络环境）**：

| 步骤 | 内容 | 状态 |
|------|------|------|
| 1 | 每日收盘后批量拉取全市场个股日线写 KV（当前仅板块指数级） | ⏳ 未开工，优先级随 v3-lite 效果评估 |
| 2 | Worker 内 MA20/动量/波动率计算（读 KV） | ✅ 引擎已含（板块级） |
| 3 | 补齐 `multidim-v3` 14 维路由 | ✅ 完成（v3-lite，8/14 维可算） |
| 4 | 前端 `SectorDetailPage` 从 v1 切到 v3 | ⏳ 未开工，建议部署后按 v2 投影灰度验证再切 |

**待验证**：push2his 恢复后（沙箱出口 IP 被封禁中）：① 手动触发 collect-history 确认 KV 写入 ② batch 端点确认 recovery/leverage/fundFlow 三维出真实分。

---

## 四、P1 — 去冗余：清理空壳 ✅ 已全部处置（9-05）

| 项 | 问题 | **处置结果** |
|----|------|------|
| `CapitalFlowPanel` | 「资金面评分」组件，生产引用 **0**（仅测试引用） | ✅ **接入个股详情页**：StockDetailPage fetch `/api/fund-flow/:code`（Worker 新端点，东财 f62/f184 实时净额 + 申万 31 板块排行）；双向流入/流出假条改为单条净额方向条（东财无买卖拆分口径），数据不可用不挂载 |
| `MarketSentiment` | 情绪评分，生产引用 **0** | ✅ **接入市场洞察页**：DiscoverPage「板块宽度」卡升级为「市场情绪」卡（消费 market/summary 涨跌家数/涨跌停/成交额/平均涨跌幅，不可用时诚实空态）；10 处亮色残留修复 |
| `ModelExplanationViz` | fundamental/technical/sentiment/macro 四类，生产引用 **0** | ✅ **删除**（连同 aiModelExplainer.ts 与对应测试）——唯一数据源是随机数，属虚构数据 |
| `StrategyComparison` | 生产引用 **0** | ✅ **删除**（连同测试）——硬编码绩效表，属虚构数据 |
| ~~`/api/tech/batch`~~ | **审计更正**：初判「无生产调用」有误——`ReviewPage`（复盘区间涨跌幅）与 `ScreenerPage`（选股）实际在用 | ✅ 不下线，已接入多源降级并实测 |
| ~~路由笔误~~ | `SectorDetailPage` / `LockupCalendarPage` 跳转 `/stock/:id`（单数）落到 404 | ✅ 已统一为 `/stocks/:id` |

> 这四个组件「有完整实现 + 完整单测却从未挂载」是最需要警惕的：测试全绿反而掩盖了它们从未上线。**新规约：新组件必须在同一轮挂载可达，否则不进主干**（见 TEAM-STRUCTURE.md FE Lane 红线）。

---

## 五、P2 — 体验打磨

1. **量纲解释**：所有评分补「这个分数意味着什么」——分位、区间、对比基准。用户看到 52 分应能立刻判断好坏。
2. **雷达图极性**：SectorDetailPage 混用正负极性维度（拥挤度 18/20 是危险，扩散度 18/20 是健康），面积语义颠倒。负极性维度入图前反转，或改横向条形图。
3. **计数口径**：RadarPage「优质推荐」在切换筛选模式时语义会变（全市场数 ↔ Top50 内数），拆分为两个独立指标。

---

## 六、工程约束与建议

- **上游单一依赖风险**：本次 K 线故障即源于单源强依赖。建议对所有外部数据源统一走「多源 + HTML 探测 + 显式失败原因」模式，避免再出现静默失败。
- **静默失败是头号敌人**：本次发现的两处最严重问题（东财 headline 404 后返回空数组、multidim 404 后渲染 `null`）都没有任何报错。**接口返回空必须区分「确实没有数据」和「上游挂了」**，并在响应中回传 `source` 与 `attempts`。
- **口径必须与实现同源**：虚构权重（50/30/20）与虚假公式（百度搜索指数）的根源是文档/文案与代码分离。建议把字段口径以常量形式定义在后端，前端直接消费，杜绝手写文案。
