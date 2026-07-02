# AI问答 + 个人知识库 — 开发计划

> 日期: 2026-07-01 | 优先级: P0 | 负责人: Hermes(后端/AI) + MiMoCode(前端/UX)

---

## 一、产品设计

### 1.1 核心理念

**让AI问答成为产品内最自然的交互方式。** 用户在任何有疑问的场景，都能立即向AI提问，获得专业、有深度、引用了真实数据的回答。同时，用户能保存有价值的知识，逐步构建自己的投资知识体系。

### 1.2 参考产品

| 产品 | 借鉴点 |
|------|--------|
| ChatGPT | 简洁对话、流式输出、会话管理 |
| Perplexity | 来源引用、相关追问、深度研究 |
| 同花顺AI问财 | 金融垂直、数据嵌入、快速指令 |
| Notion AI | 知识保存、分类整理、回顾 |

---

## 二、功能模块

### 2.1 P0: AI问答增强 (本轮)

#### 2.1.1 FloatingChat 全局入口 ✅已有
- 位置: AppLayout 右下角浮动按钮
- 现状: 已有基础对话+页面上下文感知
- 增强:
  - **猜你想问**: 基于当前页面+市场数据生成3-4个推荐问题
  - **实时数据注入**: system提示词注入risingStocks/fallingStocks/totalTurnover
  - **个股上下文**: 在个股页注入当前股价/涨跌幅/PE/行业

#### 2.1.2 页面嵌入式提问入口 (新增)
在以下位置嵌入"问AI"按钮:

| 页面 | 位置 | 触发场景 |
|------|------|----------|
| DiscoverPage | AI解读区下方 | "对这个分析有疑问？" |
| StockDetailPage | 多信号面板旁 | "深入分析这只股票" |
| IndustryMapPage | 产业链图下方 | "这个环节的投资逻辑？" |
| ScreenerPage | 筛选结果上方 | "优化筛选条件" |

#### 2.1.3 猜你想问 (新增)
每个页面对应的推荐问题：

```
市场洞察:
  💡 今天市场为什么涨/跌？
  💡 医药板块为什么领涨？
  💡 当前市场的主要风险是什么？
  💡 最近资金流向哪些板块？

策略选股:
  💡 帮我筛选低估值高增长股票
  💡 最近哪些行业景气度最高？
  💡 当前适合价值投资还是成长投资？

个股详情({name}):
  💡 {name}的估值合理吗？
  💡 {name}最近有什么利好/利空？
  💡 {name}的技术面走势如何？
  💡 {name}和同行业对比怎么样？

产业地图:
  💡 这条产业链的核心投资标的？
  💡 产业链哪个环节弹性最大？
  💡 国产替代的最新进展？

自选追踪:
  💡 我的自选股风险评估
  💡 自选股中哪些值得关注？
  💡 如何优化我的持仓组合？
```

### 2.2 P1: 个人知识库 (下一轮)

#### 2.2.1 功能设计
```
我的知识库 (/knowledge)
├── 📂 产业知识
│   ├── 半导体产业链投资逻辑
│   ├── 光伏行业景气度分析
│   └── AI算力需求趋势
├── 📂 投资方法
│   ├── PE/PB估值方法
│   ├── 技术指标使用指南
│   └── 仓位管理原则
├── 📂 关注概念
│   ├── 国产替代
│   ├── 新能源
│   └── 人工智能
└── 📂 学习笔记
    ├── 2024-07-01 市场复盘
    └── 交易心得
```

#### 2.2.2 保存流程
1. 在AI对话中, 每条AI回复下方有"保存到知识库"按钮
2. 点击后弹出分类选择 + 标签添加
3. 存入localStorage (v1), 后续可升级到后端

#### 2.2.3 知识回顾
- 在FloatingChat中可切换"知识库模式"
- 查看已保存的知识
- 基于已保存知识进行追问

### 2.3 P2: 指数/板块详情页AI嵌入 (后续)

- 指数页: 上证/深证/创业板 涨跌原因分析
- 板块页: 行业景气度/资金流向/龙头分析
- 概念页: 概念热度/政策面/产业链

---

## 三、技术实现

### 3.1 后端 (Hermes)

| 端点 | 方法 | 说明 | 状态 |
|------|------|------|------|
| /api/ai/chat | POST | 通用AI对话(流式) | ✅已有 |
| /api/ai/market-insight | GET | 市场洞察(规则) | ✅已有 |
| /api/ai/market-insight-llm | GET | 市场洞察(LLM) | ✅已有 |
| /api/ai/chat/context | POST | 带上下文的对话(新增) | 待实现 |

新端点 `/api/ai/chat/context`:
```json
POST { "message": "...", "context": { "page": "stock-detail", "symbol": "600519", "marketData": {...} } }
→ SSE流式返回
```

### 3.2 前端 (MiMoCode)

| 组件 | 文件 | 修改 |
|------|------|------|
| FloatingChat | AI/FloatingChat.tsx | 猜你想问+实时数据+知识库入口 |
| ChatPanel | AI/ChatPanel.tsx | 建议问题chip+输入增强 |
| SuggestedQuestions | AI/SuggestedQuestions.tsx | 新建 |
| KnowledgeBase | pages/KnowledgeBase.tsx | 新建(P1) |
| 页面嵌入按钮 | 各页面 | 新增"问AI"入口 |

### 3.3 数据流

```
用户点击"猜你想问" chip
  → FloatingChat 构造带context的消息
  → POST /api/ai/chat { message, context: { page, marketData, symbol? } }
  → 后端构造system prompt (注入实时数据+页面上下文)
  → DeepSeek API SSE流式返回
  → ChatPanel 逐字渲染markdown
  → 用户可保存到知识库
```

---

## 四、Loop 执行计划

### Step 6: Execute (本轮)
- Hermes: FloatingChat增强 + 猜你想问 + ChatPanel优化
- MiMoCode: 页面嵌入按钮 + 视觉优化 (通过DEV-COORDINATION.md分派)

### Step 7: Verify
- 浏览器验证: 每个页面打开FloatingChat → 测试猜你想问 → 发送问题 → 验证流式回复
- curl验证: /api/ai/chat 端点返回正确
- 编译验证: tsc --noEmit 0新增错误

### Step 8: Record
- 更新 memory/2026-07-01.md
- 更新 CLAIR-ROADMAP.md Phase 15
- MiMoCode任务写入DEV-COORDINATION.md
