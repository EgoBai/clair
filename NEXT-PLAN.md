# 澄观下一步开发计划

> 2026-06-18 | 基于当前状态制定

## 当前状态总结

```
Phase 5: AI原生化  ████████████░░░░ 75% ✅
Sprint 2: 产品打磨  ████████░░░░░░░░ 50% 🔄
```

### 已完成
- ✅ AI基础架构：aiService + ChatPanel + API路由
- ✅ DeepSeek API Key 已配置
- ✅ Sprint 1 全部完成（对话式筛选+复盘联动）
- ✅ Sprint 2 P0 完成（产业地图+个股详情页+复盘AI分析）
- ✅ StockDetailPage 集成 MultiSignalPanel + AI诊断

### 待完成
- 🔄 DiscoverPage AI解读增强（替换模板为LLM）
- 🔄 WatchlistPage 智能提醒（接入AI分析）
- 🔄 ReviewPage AI复盘（交易行为分析）
- 🔄 前端体验统一（加载/空/错态统一组件）
- 🔄 移动端深度优化
- 🔄 AI上下文增强

---

## 下一步计划（本周 6/18-6/24）

### P0 — 今天完成（必须）

| # | 任务 | 验收标准 | 预估 |
|---|------|----------|------|
| 1 | **DiscoverPage AI解读增强** | 市场解读由LLM生成，非模板 | 2h |
| 2 | **端到端验证** | 4页核心循环完整可用 | 1h |

### P1 — 本周完成（重要）

| # | 任务 | 验收标准 | 预估 |
|---|------|----------|------|
| 3 | **WatchlistPage AI总结** | 自选股AI分析+推荐相似股 | 3h |
| 4 | **ReviewPage AI复盘** | 交易行为分析+改进建议 | 3h |
| 5 | **前端体验统一** | 加载/空/错态统一组件 | 2h |

### P2 — 下周启动（战略）

| # | 任务 | 验收标准 | 预估 |
|---|------|----------|------|
| 6 | **潜力股雷达页面** | 综合评分Top50+多维度可视化 | 1d |
| 7 | **AI知识库建设** | 行业分类+策略参数+投资话术 | 1d |

---

## 详细任务说明

### 任务1: DiscoverPage AI解读增强

**目标**: 将市场解读从模板替换为LLM生成

**当前状态**:
- `clair-worker/worker.js` 中 `generateMarketInsight()` 使用规则引擎
- 输出是固定模板，非AI生成

**修改方案**:
```javascript
// 替换 generateMarketInsight() 为LLM调用
async function generateMarketInsight(marketData) {
  const prompt = `基于以下A股市场数据，生成今日市场解读：
  
大盘指数：${JSON.stringify(marketData.indices)}
板块数据：${JSON.stringify(marketData.sectors)}
资金流向：${JSON.stringify(marketData.capitalFlow)}

输出格式：
## 市场基本面
（估值水平、盈利趋势、政策面）

## 资金面
（主力资金、北向资金、成交量）

## 政策面
（政策动向、行业催化）

## 风险提示
（需要关注的风险因素）`;

  return await llm.generate(prompt);
}
```

**验收标准**:
- [ ] GET /api/ai/market-insight 返回LLM生成内容
- [ ] 内容包含基本面+资金面+政策面+风险提示
- [ ] 前端显示AI解读卡片（12秒内加载）

---

### 任务2: 端到端验证

**目标**: 确保4页核心循环完整可用

**验证清单**:
```bash
# 1. 启动服务
cd ~/.openclaw/workspace/a-stock-website
./start.sh  # 或手动启动backend + frontend

# 2. 浏览器验证
- [ ] 首页：9指数卡片显示真实数据
- [ ] 发掘页：板块景气度+AI解读
- [ ] 筛选页：对话式筛选可用
- [ ] 自选股：添加/删除/实时行情
- [ ] 详情页：K线+策略+AI诊断
- [ ] 复盘页：AI分析可用

# 3. curl验证API
curl http://localhost:3001/api/stocks?limit=5
curl http://localhost:3001/api/ai/market-insight
curl http://localhost:3001/api/ai/chat -d '{"message":"分析今日市场"}'
```

**验收标准**:
- [ ] 4页核心循环无崩溃
- [ ] AI功能端到端可体验
- [ ] 数据真实准确（非mock）

---

### 任务3: WatchlistPage AI总结

**目标**: 自选股页面增加AI分析

**功能设计**:
1. **AI组合总结**：分析自选股整体表现
2. **相似股推荐**：基于自选推荐相似标的
3. **异动提醒**：价格/成交量异常时提醒

**实现方案**:
```typescript
// backend/src/api/ai-watchlist.ts
router.get('/ai/watchlist/summary', async (req, res) => {
  const watchlist = await db.getUserWatchlist(req.userId);
  const stocks = await Promise.all(
    watchlist.map(s => getStockWithQuotes(s.symbol))
  );
  
  const prompt = `分析以下自选股组合：
${stocks.map(s => `${s.symbol} ${s.name} ${s.change}%`).join('\n')}

请提供：
1. 组合整体表现评估
2. 风险集中度分析
3. 相似标的推荐（3只）
4. 调仓建议`;

  const analysis = await llm.generate(prompt);
  res.json({ stocks, analysis });
});
```

**验收标准**:
- [ ] /api/ai/watchlist/summary 返回分析结果
- [ ] 前端显示AI总结卡片
- [ ] 相似股推荐可点击跳转

---

### 任务4: ReviewPage AI复盘

**目标**: 复盘页面接入真实AI分析

**功能设计**:
1. **交易行为分析**：分析买卖时机、仓位管理
2. **策略回测对比**：AI策略 vs 买入持有
3. **改进建议**：基于历史给出具体建议

**实现方案**:
```typescript
// backend/src/api/ai-review.ts
router.post('/ai/review/analyze', async (req, res) => {
  const { trades, period } = req.body;
  
  const prompt = `分析以下交易记录：
${trades.map(t => `${t.date} ${t.action} ${t.symbol} ${t.price} ${t.shares}`).join('\n')}

请分析：
1. 交易频率是否合理
2. 买卖时机评价
3. 仓位管理建议
4. 策略改进建议`;

  const analysis = await llm.generate(prompt);
  res.json({ analysis });
});
```

**验收标准**:
- [ ] /api/ai/review/analyze 返回分析结果
- [ ] 前端显示AI复盘卡片
- [ ] 改进建议具体可执行

---

### 任务5: 前端体验统一

**目标**: 统一加载/空/错态组件

**组件设计**:
```tsx
// frontend/src/components/common/LoadingState.tsx
export const LoadingState = ({ text = '加载中...' }) => (
  <div className="flex items-center justify-center p-8">
    <Spin size="large" />
    <span className="ml-3 text-gray-500">{text}</span>
  </div>
);

// frontend/src/components/common/EmptyState.tsx
export const EmptyState = ({ icon, title, description }) => (
  <div className="flex flex-col items-center justify-center p-8 text-gray-400">
    {icon}
    <h3 className="mt-4 text-lg font-medium">{title}</h3>
    <p className="mt-2 text-sm">{description}</p>
  </div>
);

// frontend/src/components/common/ErrorState.tsx
export const ErrorState = ({ error, onRetry }) => (
  <div className="flex flex-col items-center justify-center p-8 text-red-500">
    <ExclamationCircleIcon className="w-12 h-12" />
    <h3 className="mt-4 text-lg font-medium">出错了</h3>
    <p className="mt-2 text-sm">{error.message}</p>
    <Button onClick={onRetry} className="mt-4">重试</Button>
  </div>
);
```

**验收标准**:
- [ ] 所有页面使用统一组件
- [ ] 加载状态有spinner
- [ ] 空状态有友好提示
- [ ] 错误状态有重试按钮

---

## 战略规划（下周+）

### 潜力股雷达页面

**核心价值**: 帮用户发现"下一个中际旭创"

**功能设计**:
1. **多维度评分模型**
   - 基本面：营收增速、利润增速、毛利率变化
   - 行业景气：板块景气度 > 60
   - 资金面：机构持仓变化、北向资金流入
   - 动量：近期涨幅趋势、换手率

2. **综合评分Top50榜单**
   - 每个维度可视化展示
   - AI解读为什么这只股票有潜力
   - 预警机制：评分变化通知

3. **AI知识库支撑**
   - 申万行业分类+概念分类
   - 经典选股策略参数
   - 历史十倍股共同特征
   - 常见暴雷信号

**验收标准**:
- [ ] /api/ai/potential-stocks 返回Top50评分
- [ ] 前端显示潜力股雷达页面
- [ ] 每只股票有AI解读
- [ ] 评分变化有通知

---

## 执行原则

1. **一次做完** — 一个功能一次提交，不拆分
2. **验证再交** — curl + 浏览器确认才提交
3. **用户优先** — 只做用户能感知的改进
4. **不写文档** — 除非里程碑节点

---

## 时间线

```
本周（6/18-6/24）：
├── 今天：DiscoverPage AI解读增强 + 端到端验证
├── 明天：WatchlistPage AI总结
├── 后天：ReviewPage AI复盘
├── 周四：前端体验统一
└── 周五：测试 + 修复bug

下周（6/25-7/1）：
├── 潜力股雷达页面设计
├── AI知识库建设
└── Phase 5 交付验收

后续：
├── Phase 6 产品打磨
└── 启动 MediaForge 编辑器
```

---

## 相关文件

- 项目代码：`~/.openclaw/workspace/a-stock-website/`
- 开发计划：`DEV-PLAN-V2.md`, `DEV-SPRINT-2.md`
- 产品战略：`STRATEGY.md`
- PRD：`PRD.md`
- GitHub：https://github.com/EgoBai/clair.git
