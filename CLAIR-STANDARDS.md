# Clair 自主迭代引擎 — Harness & Loop

> 设计日期: 2026-07-01
> 定位: Hermes 主Agent + 子Agent集群的自主迭代操作系统

---

## 一、Harness（知识底座）

Harness 是所有自主决策的"事实锚点"。Agent 做任何判断时，必须先查 Harness，而非凭记忆或猜测。

### 1.1 产品基准 (Product Baseline)

| 维度 | 对标产品 | 达标标准 |
|------|----------|----------|
| 市场数据 | 同花顺/东方财富 | 5541只全量, 涨跌/成交/涨跌停误差<5% |
| 行情延迟 | 同花顺 | 交易时段≤5分钟延迟 |
| 行业分类 | 申万2021 + 东财 | 一级31类覆盖率>90% |
| 筛选体验 | 富途牛牛 | 10+筛选维度, 策略模板可复用 |
| AI分析 | 芝士财富 | 引用真实数据, 非虚构, 有深度 |
| UI/UX | Linear/Notion | 暗色主题, 红涨绿跌, 间距统一, 流畅动画 |
| 移动端 | 同花顺APP | 响应式布局, 触控友好 |

### 1.2 数据标准 (Data Standards)

```
市场总成交: 参考同花顺(35753亿), 误差±5%
涨跌分布: 参考同花顺(4676跌/790涨), 误差±3%
涨停/跌停: A股 ±10%基准, 科创板/创业板 ±20%, ST ±5%
PE/PB: 动态市盈率/市净率, 负值显示为"亏损"
市值: 亿元单位, 保留1位小数
```

### 1.3 API 契约 (API Contracts)

| 端点 | 本地后端 | 生产Worker | 状态 |
|------|----------|------------|------|
| /api/market/summary | ✅ PostgreSQL | ❌ Worker无DB | 生产不可用 |
| /api/stocks | ✅ flat字段 | ✅ latestQuote嵌套 | 格式不一致 |
| /api/ai/gems | ✅ 个性化reasons | ✅ 通用reasons | Worker待同步 |
| /api/industry-chains | ✅ 完整数据 | ✅ 静态数据 | 一致 |

### 1.4 工程标准 (Engineering Standards)

```
编译: tsc --noEmit 0新增错误 (预存30个前端+21个后端允许)
测试: 后端14334/14334, 前端17657/17663 (6个worker超时可接受)
构建: vite build成功, dist < 3.5MB
部署: GitHub Actions自动, Worker需手动wranger deploy
推送: git push origin main, 超时走auto-sync
```

### 1.5 多Agent协作协议

```
Hermes(主): 编排/分解/分派/验收/总结, 不写代码
子Agent(leaf): 并行执行, 一文件一Agent, ≤3个并行
MiMoCode: 前端UI/UX/多端适配, 通过DEV-COORDINATION.md协调
边界: 主Agent做IO重活(数据拉取/浏览器QA/lint), 子Agent做代码修改
```

---

## 二、Loop（迭代引擎）

Loop 的目标：**逼近产品基准，而非为迭代而迭代**。

### 2.1 执行节奏

```
轻量循环(Light): 每完成一轮任务后自动触发, 3-5分钟
  → 检查编译/测试/API健康 + 记录本轮成果

标准循环(Standard): 每3-5轮轻量后触发, 10-15分钟  
  → 完整QA + 对标Harness + 生成新idea + 排优先级

深度循环(Deep): 每日1次(或重大版本前), 30-60分钟
  → 全量审计 + 技术债务评估 + roadmap更新 + skill沉淀
```

### 2.2 八步循环流程

```
┌─────────────────────────────────────────────────┐
│ 1. OBSERVE  → 收集当前状态                       │
│    git log / tsc / tests / API health / browser   │
│                                                     │
│ 2. COMPARE  → 对标Harness基准                     │
│    数据误差? UX差距? 功能缺失? 编译/测试通过?     │
│                                                     │
│ 3. IDEATE   → 生成改进idea                        │
│    基于差距 + 竞品参考 + 用户反馈 + 技术趋势      │
│                                                     │
│ 4. PRIORITIZE → 排序(P0阻塞/P1体验/P2增强/P3远期) │
│    只取Top 3, 防止任务膨胀                        │
│                                                     │
│ 5. PLAN     → 拆解为可执行子任务                   │
│    每个子任务有: 文件范围/验收标准/预计耗时        │
│                                                     │
│ 6. EXECUTE  → 主Agent编排, 子Agent并行执行         │
│    MiMoCode任务写入DEV-COORDINATION.md             │
│                                                     │
│ 7. VERIFY   → curl + browser + test 三重验证       │
│    编译通过≠功能可用, 必须端到端                   │
│                                                     │
│ 8. RECORD   → 更新memory/roadmap/skills/log        │
│    每步决策有据可查, 可回溯                        │
└─────────────────────────────────────────────────┘
```

### 2.3 触发信号 (Trigger Signals)

**立即触发标准循环**:
- 用户发送新反馈/问题
- 子Agent报告异常
- API健康检查失败
- tsc编译新增错误

**延迟触发标准循环**:
- 完成3轮轻量循环后
- Git push成功(新代码已部署)
- 连续修复3+个bug后

**触发深度循环**:
- 每日自动(cron)
- Phase版本号变更
- 重大架构决策前

### 2.4 新Idea生成规则

```
来源1: Harness对标差距 (如"PE数据误差>5%" → 修复数据源)
来源2: 竞品功能对比 (如"同花顺有资金流向" → 评估是否做)
来源3: 用户显式反馈 (最高优先级)
来源4: 技术债务发现 (如"30个预存TS错误" → 分批修复)
来源5: 自主探索发现 (浏览器端到端QA中发现的新问题)

过滤规则:
- 不做"交易管理"(产品红线)
- 不增加复杂度(做减法)
- 必须端到端可验证(非空壳)
- 优先AI差异化功能(非通用CRUD)
```

---

## 三、记录体系

### 3.1 文件结构

```
~/.openclaw/workspace/a-stock-website/
├── CLAIR-ROADMAP.md          ← 研发总规划(Phase版本)
├── CLAIR-STANDARDS.md        ← 本文档(Harness+Loop)
├── DEV-COORDINATION.md       ← MiMoCode协作看板
├── MULTI-AGENT.md            ← 子Agent共享简报
├── PERFORMANCE_OPTIMIZATION.md ← 性能优化记录
├── memory/
│   └── YYYY-MM-DD.md         ← 每日开发日志
├── scripts/                  ← 数据脚本
└── backend/frontend/         ← 代码
```

### 3.2 日志格式

每天产出一份开发日志，格式：
```markdown
## YYYY-MM-DD 开发日志
### Loop周期: L3-S1 (第3轮轻量, 第1轮标准)
### 状态快照: 编译✅ 测试✅ API✅
### 本轮成果: [具体列出]
### 对标差距: [与Harness的差距]
### 新Idea: [本轮产生的新想法]
### 下轮计划: [Top 3任务]
```

---

## 四、MiMoCode 协作协议

### 4.1 任务分派

在 DEV-COORDINATION.md 中创建任务卡片：
```markdown
## 🎯 MiMoCode任务 — YYYY-MM-DD
### 任务: [名称]
- 文件: [具体文件路径]
- 描述: [做什么]
- API契约: [如有后端依赖,列出端点]
- 验收标准: [如何验证完成]
- 优先级: P0/P1/P2
```

### 4.2 交接信号

- Hermes完成 → 更新DEV-COORDINATION.md状态为"后端就绪"
- MiMoCode认领 → 更新状态为"前端进行中"  
- 双方完成 → 标记"✅"并记录验证结果

---

## 五、启动指令

本Loop从下一个轻量循环开始执行。主Agent自主判断触发条件，
不需要用户每次确认。只在以下情况暂停：
1. 需要用户决策的重大选择
2. Phase版本里程碑达成
3. 发现需要用户操作的阻塞(如配API Key)
