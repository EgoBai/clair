# 澄观 Clair · AI-native 投研助手

基于 **React 18 + TypeScript + Vite + Ant Design 5 + ECharts** 的 A 股行情分析与投研平台。接入**真实大模型**（非规则引擎）驱动全部 AI 能力，并以**游戏化体验闭环（探索 → 求证 → 决策 → 复盘 → 成长）**串联个股研究、风险管理和社区协作，提供实时行情、技术分析、量化策略、AI 智能分析等一站式投资工具。

## ✨ 核心功能

### 📊 数据展示
- **实时行情** - WebSocket 实时推送（1-5秒更新）
- **K 线图表** - 多周期切换（5m/15m/60m/日/周/月）
- **分时图** - 实时价格曲线 + 均价线
- **技术指标** - MACD / KDJ / RSI / BOLL / EMA
- **资金流向** - 主力/超大单/大单/中单/小单
- **行业热力图** - 板块涨跌一览
- **大宗交易** - 折溢价分析、营业部追踪
- **股东增减持** - 增/减/新/退 四类变动
- **限售解禁** - 日历可视化、市值排行

### 🔍 选股工具
- **智能搜索** - 8级匹配 + 拼音首字母 (`⌘K`)
- **自选股** - 分组管理、拖拽排序
- **选股器** - 25+ 筛选条件，预设策略模板
- **高级筛选** - AND/OR 逻辑组合，技术指标条件
- **AI 智能选股** - 5种策略（价值/成长/技术/动量/逆向）

### 📈 量化分析
- **策略回测** - 均线交叉 / RSI / MACD 三种策略
- **风险指标** - 夏普比率、最大回撤、波动率
- **交易统计** - 胜率、盈亏比、连续盈亏
- **投资组合** - 持仓管理、资产配置、盈亏分析

### 🤖 AI 智能
- **市场解读** - 自动生成行情分析报告
- **止盈止损** - ATR/均线/百分比三种方法
- **板块轮动** - 四阶段判断 + 动量评分
- **AI 个股诊断** - 5维度评分 + 四档评级
- **智能预警建议** - AI 自动推荐预警规则
- **复权处理** - 前复权/后复权/不复权

### 💬 社交与资讯
- **新闻资讯** - 5大分类、情感分析
- **社交讨论** - 投资观点分享、热度排行
- **预警系统** - 价格/涨跌幅/成交量预警

## 🏗️ 技术架构

```
┌─────────────────────────────────────────────────────┐
│                    前端 (React 18)                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────────┐ │
│  │  Pages   │ │Components│ │  Hooks   │ │  Store  │ │
│  │ 14 页面  │ │ Charts   │ │WebSocket │ │ Zustand │ │
│  └──────────┘ │ Common   │ │Shortcuts │ │persist  │ │
│               │ Layout   │ │ Gestrue  │ └─────────┘ │
│               │ Stock    │ └──────────┘             │
│               └──────────┘                          │
│  ┌──────────────────────────────────────────────┐   │
│  │  Services: API / WebSocket / Push / Offline  │   │
│  └──────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────┐   │
│  │  Utils: Theme / Perf / A11y / i18n / Export  │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
                          ↕ HTTP / WS
┌─────────────────────────────────────────────────────┐
│                   后端 (Express/Node)                 │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────────┐ │
│  │  API层   │ │ 中间件层  │ │ 工具层   │ │ 数据层  │ │
│  │ 15+ 路由 │ │安全/限流 │ │搜索/缓存│ │DB/WS   │ │
│  │          │ │验证/CSRF │ │回测/AI  │ │同步    │ │
│  └──────────┘ └──────────┘ └──────────┘ └─────────┘ │
└─────────────────────────────────────────────────────┘
                          ↕
┌─────────────────────────────────────────────────────┐
│                    数据层                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐            │
│  │PostgreSQL│ │  Redis   │ │ WebSocket│            │
│  │ 主数据库  │ │ 缓存层   │ │ 实时推送  │            │
│  └──────────┘ └──────────┘ └──────────┘            │
│  ┌──────────────────────────────────────────┐      │
│  │  数据源: 新浪/腾讯/东方财富              │      │
│  └──────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────┘
```

### 前端技术栈
| 技术 | 用途 |
|------|------|
| React 18 | UI 框架 |
| TypeScript 5 | 类型安全 |
| Ant Design 5 | UI 组件库 |
| ECharts | 数据可视化 |
| Recharts | 轻量图表 |
| Zustand | 状态管理 |
| React Router 6 | 路由 |
| Axios | HTTP 请求 |
| Vite 8 | 构建工具（当前 ^8.0.10） |

### 后端技术栈
| 技术 | 用途 |
|------|------|
| Node.js + Express | 服务器框架 |
| PostgreSQL | 主数据库 |
| WebSocket | 实时通信 |
| Joi | 输入验证 |
| JWT | 身份认证 |

## 🚀 快速开始

```bash
# 克隆项目
git clone <repository-url>
cd a-stock-website

# 安装依赖
npm install

# 配置环境变量
cp frontend/.env.example frontend/.env
cp backend/src/.env.example backend/src/.env

# 启动开发服务器
npm run dev

# 运行测试
npm test

# 构建生产版本
npm run build
```

## 📁 项目结构

```
a-stock-website/
├── frontend/                 # 前端应用
│   ├── src/
│   │   ├── components/       # 组件
│   │   │   ├── Charts/       # 图表组件 (8个)
│   │   │   ├── Common/       # 通用组件 (8个)
│   │   │   ├── Layout/       # 布局组件
│   │   │   ├── Market/       # 市场组件
│   │   │   ├── Mobile/       # 移动端组件
│   │   │   └── Stock/        # 股票组件
│   │   ├── pages/            # 页面组件 (24+，含 _archived 归档页)
│   │   ├── hooks/            # 自定义 Hooks (8个)
│   │   ├── services/         # API/WS 服务
│   │   ├── store/            # Zustand Store
│   │   ├── utils/            # 工具函数
│   │   ├── i18n/             # 国际化
│   │   └── __tests__/        # 前端测试 (13个)
│   ├── e2e/                  # E2E 测试
│   └── vite.config.ts
├── backend/                  # 后端应用
│   └── src/
│       ├── api/              # API 路由 (15个)
│       ├── middleware/        # 中间件 (5个)
│       ├── utils/            # 工具类 (7个)
│       ├── indicators/       # 技术指标
│       ├── db/               # 数据库
│       ├── websocket/        # WebSocket
│       ├── docs/             # API 文档
│       └── __tests__/        # 后端测试 (17个)
├── shared/                   # 共享类型/工具
├── data-collector/           # 数据采集服务
├── knowledge-base/           # 知识库
│   ├── design/               # 设计文档 (14篇)
│   └── patterns/             # 设计模式 (8篇)
├── docs/                     # 项目文档
│   ├── COMPONENT-API.md      # 组件 API 文档
│   ├── DEPLOYMENT.md         # 部署指南
│   ├── CONTRIBUTING.md       # 贡献指南
│   └── USER-MANUAL.md        # 用户手册
├── CHANGELOG.md              # 变更日志
└── README.md
```

## ⌨️ 快捷键

| 快捷键 | 功能 |
|--------|------|
| `⌘/Ctrl + K` | 聚焦搜索框 |
| `/` | 聚焦搜索框 (GitHub 风格) |
| `Esc` | 关闭弹窗 / 取消搜索 |
| `Alt + 1` | 跳转首页 |
| `Alt + 2` | 跳转股票列表 |
| `Alt + 3` | 跳转行情分析 |
| `Alt + T` | 循环切换主题 |

## 📊 测试覆盖

| 模块 | 测试文件 | 用例数 |
|------|---------|--------|
| 技术指标 | `indicators.test.ts` | 25+ |
| 搜索引擎 | `search.test.ts` | 20+ |
| 查询缓存 | `queryCache.test.ts` | 15+ |
| 自选股 | `watchlist.test.ts` | 15+ |
| 回测引擎 | `backtest.test.ts` | 20+ |
| 投资组合 | `portfolio.test.ts` | 10+ |
| 新闻 | `news.test.ts` | 10+ |
| 复权引擎 | `exRights.test.ts` | 25+ |
| AI 分析 | `aiMarketAnalysis.test.ts` | 15+ |
| 安全加固 | `securityEnhanced.test.ts` | 20+ |
| 数据校验 | `dataValidation.test.ts` | 15+ |
| API 集成 | `api-integration.test.ts` | 15+ |
| 前端格式化 | `formatters.test.ts` | 20+ |
| 组件 | `components.test.tsx` | 15+ |
| 快捷键 | `shortcuts.test.ts` | 10+ |
| 无障碍 | `accessibility.test.ts` | 15+ |
| 性能 | `performance.test.ts` | 10+ |
| Web Vitals | `webVitals.test.ts` | 15+ |
| 离线模式 | `offline.test.ts` | 10+ |
| 快照 | `snapshots.test.tsx` | 15+ |
| 图表系统 | `chartSystem.test.ts` | 25+ |
| 空状态+错误 | `emptyStates.test.tsx` | 30+ |
| 大宗交易+AI选股 | `blockTradesAndAI.test.ts` | 37 |
| 渲染优化 | `renderOptimize.test.ts` | 24 |
| 盘口 | `orderBook.test.ts` | 11 |
| 融资融券 | `margin.test.ts` | 11 |
| 龙虎榜 | `topTraders.test.ts` | 13 |
| 财务报表 | `financials.test.ts` | 12 |
| 股票对比 | `stockCompare.test.ts` | 8 |
| 行业板块 | `sectorAnalysis.test.ts` | 10 |
| 用户系统 | `user.test.ts` | 15 |
| 性能监控 | `performanceMonitor.test.ts` | 10 |
| 数据源 | `dataSource.test.ts` | 10 |
| **合计（早期快照·已过时）** | **36 个测试文件** | **439+ 用例（实际 857 文件）** |

## 📖 知识库

项目内置了 37 篇设计文档，记录了架构决策和最佳实践：

### 设计文档 (18篇)
- K线图设计、搜索优化、WebSocket集成、自选股系统、回测引擎、投资组合管理、复权设计、AI分析设计、安全加固、性能优化、测试策略、分时图设计、社交功能、高级筛选器、大宗交易设计、增减持/解禁设计、AI选股设计、渲染性能设计

### 设计模式 (8篇)
- WebSocket集成模式、WebSocket容灾、前端状态管理、PWA/移动端、数据异常检测、离线模式、安全加固模式、高级筛选器模式

## 📜 版本历史 / Version History

完整变更日志见 [CHANGELOG.md](./CHANGELOG.md)。

### 近期战略里程碑
- **内核完成 R301–R400（百轮迭代）**：~19,215 行代码、100+ 功能模块，覆盖技术分析、风险管理、图表交互、社区/笔记/观点、智能提醒、北向资金/融资融券、个股深度/行业比较、宏观/全球联动、数据导入导出、个性化设置。
- **市场洞察页硬伤修复**：修复 `DiscoverPage` 六级逻辑硬伤与 `++` 符号 bug；demoData 回归测试 164 项全绿，`tsc` + `build` 通过。
- **轻量静态 UI 质量守卫 D6 / S6-1**：`npm run guard`（ts-morph AST + 基线扫描）覆盖 585 文件 = 0 ERROR，发现 6 处死 `useState` 与 9 处硬编码空兜底（INFO）。
- **前端现代化战略 D7**：架构师《前端现代化技术战略》 + 产品经理《前端体验设计语言》，决策含 React 19 审慎升级、motion 动效、Zustand 保持、CSS 变量 token 单一真相源、antd5 + echarts 共存边界、Taro 4 小程序可移植、P0–P3 迁移。
- **战略重构决策 D4–D8**：D4 专业数据源（Tushare Pro / AkShare / Alpha Vantage，后端代理）；D5 真实大模型 + 游戏化闭环；D6 轻量静态 UI 守卫先行；D7 前端现代化多端 + 小程序；D8 版本历史与主页面同步（本任务）。

### 战略设计文档
- [前端现代化技术战略（架构师，D7）](./design/frontend-modernization-strategy.md)
- [前端体验设计语言（产品经理，D7）](./requirements/frontend-experience-design-language.md)
- [UI 质量守卫设计（D6）](./design/ui-quality-guard-design.md)

### 部署
项目提供容器化部署：`docker-compose.yml`（配合 `frontend/Dockerfile` 与 `backend/Dockerfile`），另有 `docker-compose.prod.yml` / `docker-compose.canary.yml` / `docker-compose.blue-green.yml` 等环境编排，详见 [DEPLOY.md](./DEPLOY.md) 与 [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md)。

## 🔧 开发工具

```bash
# 代码检查
npm run lint

# 测试
npm test                    # 运行所有测试
npm run test:frontend       # 前端测试
npm run test:backend        # 后端测试

# 构建
npm run build

# 数据采集
npm run data:collect
```

## 📝 贡献

详见 [CONTRIBUTING.md](./docs/CONTRIBUTING.md)

## 📄 许可证

MIT License

---

**版本**: 主版本 3.2.0+ · 详见 [CHANGELOG.md](./CHANGELOG.md)
