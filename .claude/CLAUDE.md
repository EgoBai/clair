# Clair (澄观) — Agent 操作手册

> 本文件是所有 Agent（MiMoCode/Hermes/子Agent）的**唯一入口上下文**。
> 每次新 session 启动时必须读取。

## 产品定位

**澄观 = AI陪伴式A股投资研究助手**
- 不是冷冰冰的数据终端，而是有温度的投资伙伴
- 核心循环：发掘→筛选→自选→复盘
- 目标用户：有1-5年经验的A股个人投资者，每天15-30分钟
- 差异化：AI是核心差异化，不是装饰

## 当前状态 (Phase 14)

```
构建: ✅ Vite + tsc 0错误
测试: ✅ 前端 17733 + 后端 14334 全绿
AI:   ✅ DeepSeek v4-pro, 9个端点
数据: ✅ 5544只A股 PostgreSQL
部署: ✅ GitHub Pages + Cloudflare Workers
```

## 开发循环 (Clair Loop)

每次迭代必须走完 6 步，不允许跳步：

```
SCAN → EVAL → PLAN → EXEC → VERIFY → CAPTURE
 ↑                                         │
 └─────────────── 下一轮 ←────────────────┘
```

| 步骤 | 动作 | 产出 | 耗时占比 |
|------|------|------|----------|
| SCAN | 读harness，扫描当前状态 | 知识更新 | 5% |
| EVAL | 对比设计目标，找最大差距 | 差距清单 | 10% |
| PLAN | 选最高优先级差距，制定计划 | 任务+验收标准 | 15% |
| EXEC | 按计划执行，Hermes主导+MiMoCode辅助 | 代码变更 | 40% |
| VERIFY | 测试+端到端验证+质量门禁 | 通过/不通过 | 15% |
| CAPTURE | 记录发现、决策、学到的教训 | harness更新 | 15% |

**关键原则：**
- 不为迭代而迭代——每轮必须缩小一个可度量的差距
- 没有验证的完成不是完成
- 每轮结束必须有 CAPTURE，否则下一轮缺乏输入

## Agent 分工

| 角色 | 职责 | 主导 |
|------|------|------|
| **Hermes Agent** | 任务编排、后端开发、AI功能、数据层 | ✅ 主导 |
| **MiMoCode** | 前端UI/UX、二次审核、优化建议、质量门禁 | 辅助 |
| **Builder** | 代码实现、测试编写 | 执行 |
| **Reviewer** | 代码审查、安全检查 | 审核 |
| **QA** | 端到端验证、回归测试 | 验证 |

## 文件结构

```
.claude/CLAUDE.md          ← 本文件（Agent入口）
docs/harness/
  PRODUCT-KB.md             ← 产品知识库（PRD演进、用户反馈、竞品）
  ENGINEERING-KB.md         ← 工程知识库（架构决策、编码规范、性能预算）
  DESIGN-KB.md              ← 设计知识库（设计系统、交互模式、响应式）
  DOMAIN-KB.md              ← 领域知识库（A股基础、技术指标、数据源）
  OPERATIONS-KB.md          ← 运维知识库（部署、调试、多Agent协议）
  ITERATION-LOG.md          ← 迭代日志（每轮SCAN→CAPTURE的记录）
DEV-COORDINATION.md         ← 实时协作看板
MULTI-AGENT.md              ← 子Agent共享上下文
```

## 质量门禁

每次提交必须通过：
1. `npx tsc --noEmit` — 0 TypeScript错误
2. `npx vitest run` — 测试全绿
3. `curl` 端到端 — API返回正确数据
4. 浏览器验证 — 页面渲染正常，交互可用
5. 暗色主题 — 无白色背景/浅色元素泄漏

## 禁止事项

- 禁止跳过 CAPTURE 直接进入下一轮
- 禁止"编译通过=功能可用"的假设
- 禁止 mock/假数据交付
- 禁止修改不属于自己负责的文件（文件锁）
- 禁止在没有验收标准的情况下开始任务
