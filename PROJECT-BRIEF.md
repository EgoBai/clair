# 澄观 Clair — 项目全貌

> 本文档用于新Agent/协作者快速了解项目全部上下文。
> 最后更新: 2026-07-24

---

## 一、项目定位

**澄观 Clair** — AI陪伴式投资研究助手

核心循环: **发掘 → 筛选 → 自选 → 复盘**（不做交易管理）

对标产品: 同花顺/富途牛牛/芝士财富（功能深度） + Linear/Notion（UX设计）

生产地址: https://egobai.github.io/clair/
API: https://clair-api.pages.dev
GitHub: https://github.com/EgoBai/clair

---

## 二、技术栈

| 层 | 技术 |
|---|------|
| 前端 | React 18 + TypeScript + Vite + Ant Design 5 |
| 后端 | Express + TypeScript + PostgreSQL |
| Worker | Cloudflare Pages Functions (纯JS) |
| 部署 | GitHub Pages (前端) + Cloudflare Pages (API) |
| AI | DeepSeek v4-pro (问答/筛选/总结) |
| 测试 | Vitest (前端17681+ / 后端14489+) |
| 可视化 | ECharts 5 (按需引入) + React Flow (产业链) |

---

## 三、项目结构

```
a-stock-website/
├── frontend/src/
│   ├── pages/          # 7个核心页面
│   │   ├── DiscoverPage.tsx       # 市场洞察(首页)
│   │   ├── ScreenerPage.tsx       # 策略选股
│   │   ├── WatchlistHubPage.tsx   # 自选组合(含AI复盘)
│   │   ├── RadarPage.tsx          # 潜力雷达
│   │   ├── IndustryMapPage.tsx    # 产业地图
│   │   ├── StockDetailPage.tsx    # 个股详情
│   │   └── KnowledgeBase.tsx      # 投资笔记
│   ├── components/AI/
│   │   ├── FloatingChat.tsx       # 全局浮动AI助手
│   │   └── ChatPanel.tsx          # 对话面板
│   ├── styles/         # 暗色主题样式
│   └── routes/         # 路由配置
├── backend/src/
│   ├── api/            # REST API路由
│   ├── db/             # PostgreSQL数据层
│   ├── data-sync/      # 腾讯API数据同步
│   └── services/       # 业务逻辑
├── clair-worker/        # Cloudflare Worker
├── shared/types.ts     # 前后端共享类型
└── docs/harness/       # 设计文档+知识库
```

## 四、核心页面功能

| 页面 | 路由 | 核心功能 |
|------|------|----------|
| 市场洞察 | `/` | 市场总览+板块景气度+多维热力图+AI解读 |
| 策略选股 | `/screener` | 10指标筛选+8策略模板+AI助手栏 |
| 自选组合 | `/watchlist` | 自选追踪+AI复盘(双Tab) |
| 潜力雷达 | `/radar` | 百分位评分+优质池(≥80)+因子雷达图 |
| 产业地图 | `/industry-map` | 9条产业链上游→下游图谱+AI解读 |
| 个股详情 | `/stocks/:code` | K线+多信号+AI诊断 |
| 投资笔记 | `/knowledge` | 知识积累(统计+分类+手动/AI笔记) |

---

## 五、API端点

### 市场数据
- `GET /api/market/summary` — 全市场总览
- `GET /api/stocks?pageSize=N` — 股票列表
- `POST /api/stocks/batch/quotes` — 批量行情

### 板块分析
- `GET /api/sectors/momentum` — 行业景气度(31一级行业)
- `GET /api/sectors/:code/multidim-v3` — 单板块10维评分
- `POST /api/sectors/multidim-v3/batch` — 批量多维度
- ⚠️ `GET /api/sectors/concept` — **不存在,待创建**

### AI功能
- `POST /api/ai/gems` — 潜力雷达(默认minScore=80)
- `POST /api/ai/filter` — AI自然语言筛选
- `POST /api/ai/watchlist-summary` — 自选总结

### 产业链
- `GET /api/industry-chains` — 9条产业链列表
- `GET /api/industry-chains/:id` — 单链详情(上游/中游/下游)

---

## 六、数据规范

### 数据源
- 主数据: 腾讯财经API → PostgreSQL (5541只A股)
- 同步频率: 每5分钟
- 市值单位: 后端万元 → 前端parseStockData转亿元
- PE/PB: null表示无数据, 0表示有效值为0

### 行业分类
- 一级: 31个申万行业
- 二级: 待补充(528只未分类)
- 概念: concept_tags表, 但API端点未创建

### 数据质量红线
- 5541只股票一只不能少
- 行业分类要准确
- "编译通过"≠"功能可用" — 必须curl+浏览器端到端验证
- 不接受虚构/硬编码数据
- 数据必须真实有效

---

## 七、设计规范

### 视觉风格
- **暗色主题**: 背景 #0f172a, 卡片 #1a2332
- **涨跌颜色**: 红涨(#ef4444) 绿跌(#22c55e)
- **强调色**: 紫色系(#667eea, #ec4899)
- **参考**: 同花顺暗色模式 + Linear简洁风

### UX原则
- 打开即见数据, 不空等
- AI陪伴式引导 > 冷冰冰数据终端
- 做减法, 不追求大而全
- 能点击的地方都给下钻能力

### 移动端
- 6核心页面375px无水平滚动
- Antd Table: `scroll={{ x: 'max-content' }}`
- 响应式: `pages-responsive.css`

---

## 八、团队习惯

### 开发风格
- 默认授权推进, 不反复询问
- 先做计划→评估合理性→想清楚再做→高效执行
- 重大里程碑才通知用户(微信channel: o9cq801eUCrV_kql58sw2tUqPus0@im.wechat)

### 多Agent协作
- Hermes: 后端/API/数据/AI模型/部署
- MiMoCode/WorkBuddy: 前端UI/UX/响应式/视觉/测试
- 共享: CLAIR-STANDARDS.md + DEV-COORDINATION.md
- 任务分派: 主Agent拆解→验收标准→并行执行→汇总

### 质量要求
- "编译通过"≠"功能可用" — 端到端验证必须
- 数据必须真实有效
- 功能必须端到端可运行, 不是停留在演示
- 参考成熟产品水准(同花顺/富途/芝士财富)
- 白色背景禁止
- 空壳功能禁止

### Loop迭代
```
Observe → Compare(Ideate → Prioritize → Plan) → Execute → Verify → Record
```

---

## 九、当前已知问题

> 最近核对：2026-08-03。原 P0 三项已全部解决，详见「已解决」小节，勿再按旧标注排期。

### 🔴 P0 (阻塞)

当前无阻塞项。

### 🟡 P1 (修复)
1. 策略回测流程断裂(缺日期选择器)
2. 产业地图缺少节点下钻(点击→公司列表)
3. 投资笔记入口可见性低

### 🔵 待后端接入 (前端已就绪, 当前为诚实空态)

以下页面前端已按「诚实数据红线」清除演示兜底, 后端实时接口尚未接入, 页面显示
`Empty` + 「后端未接入」显式标注; 后端源打通后即自动填充, 前端无需再改:

- 北向资金 (NorthBoundPage) / 港股通 (HKConnectPage)
- 研报中心 (ReportCenterPage) / 因子实验室 (FactorLabPage)
- 资金流向的市场级 5 档聚合 (FundFlowPage 市场概览卡)

### 🟢 已解决 (2026-08-03 核对)

1. ~~概念板块无数据 — `/api/sectors/concept` 不存在(404)~~
   → 端点已存在于 `backend/src/api/sectors.ts:123`, 由 `services/conceptBoardService.ts` 提供。
   注: 旧诊断记的文件名 `sector.ts` 有误, 实际为 `sectors.ts`, 这是当时误判 404 的原因之一。
2. ~~二级行业无数据~~
   → `backend/src/api/industries.ts` 支持 `?level=2`, 前端 DiscoverPage 已接真实源并端到端验证。
3. ~~DiscoverPage排序/热力图逻辑混乱~~
   → `displayMode` 已收敛为 `'list' | 'heatmap'` 两态, 排序维度 `sortBy` 独立拆出;
   热力图展示全部 14 维矩阵且行序跟随 `sortBy`, 与列表完全一致。

### 🟢 已完成
- TS: 前端0 后端0 ✅
- 测试: 17681+14489 pass ✅
- 多维矩阵v3 (10维度) ✅
- 雷达v3 (百分位模型) ✅
- 9产业链统一标准 ✅
- PWA离线支持 ✅
- 自选+复盘合并 ✅

---

## 十、输出约束

1. 修改前先读 `DEV-COORDINATION.md` 避免冲突
2. 提交格式: `feat(模块): 简短描述` / `fix: 简短描述`
3. 每个commit后推送到 `git push origin main`
4. 编译验证: `npx tsc --noEmit` (前后端分别)
5. 后端启动: `npx tsx src/index.ts` (端口3001)
6. 前端启动: `npx vite --host 127.0.0.1 --port 5173`
7. 不用sleep+curl验证服务, 直接检查端口占用
8. 改后端后kill旧进程再重启
9. 搜索用数据库层ILIKE, 不走前端过滤
10. React Hook不能在嵌套函数中调用
