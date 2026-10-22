# 已删除自动化配置备份（2026-10-23）

> 本文件用于留存两个已被删除的自动化的完整 prompt，便于将按需重建。
> 删除原因见文末「删除依据」。

---

## 一、Clair 进度看板自动刷新（automation-1786816465504）

- 原状态：PAUSED
- 原调度：`FREQ=DAILY;BYHOUR=3,15;BYMINUTE=0`（每日 03:00 / 15:00）
- 原 cwds：/Users/ego_bai/.openclaw/workspace/a-stock-website
- memory 最后更新：2026-08-30 03:01
- **删除依据**：用户已拍板「dashboard 自动化永久停用」（见 MEMORY.md 三大决策）。
  且自 8-30 起无任何 memory 更新，确认早已不产生价值。

### 原 prompt

（原文未随 view 返回完整正文；仅记录已知调度与状态。若需重建，参考其命名与
「scripts/gen_dashboard.py 于每日 03:00/15:00 自动刷新」的历史描述重新设计。）

---

## 二、澄观Clair自主推进循环（automation-1784829898221）

- 原状态：PAUSED
- 原调度：`FREQ=HOURLY;INTERVAL=6`（每 6 小时一轮）
- 原 cwds：/Users/ego_bai/.openclaw/workspace/a-stock-website/frontend
- memory 最后更新：2026-08-27 15:32
- 有效窗：validFrom 2026-07-24T03:00:00+08:00
- **删除依据**：
  1. 末次 run 为 2026-10-05，至删除日已停摆 **18 天**，无实际业务贡献；
  2. 其 memory 自 8-27 起无更新，确认早已空转/失效；
  3. **与当前「单通道红线」直接冲突**——本项目已确立由本 WorkBuddy 交互会话
     单通道推进（见 MEMORY.md 项目约定），该循环重启会再次造成双 agent
     并行写同一仓库，历史上已因此产生分叉与在途冲突；
  4. 其 prompt 中的关键规则（单通道红线、每轮收口、独立验证、决策门）已全部
     沉淀进 MEMORY.md 与 DEV-COORDINATION.md，无知识损失。

### 原 prompt（完整留存）

```
你是澄观 Clair 投研助手自主推进循环的主控制器。每次被触发 = 执行一轮完整循环
（计划→团队分工执行→测试→验收→复盘→再计划 + 决策门 + 专家团自我评估 + 循环总结推送）。
执行任务时默认以团队协作方式推进（分派子智能体分工），复盘时先独立验证子智能体产出再采信。

## 关键文件路径
- 计划中枢（每轮必须读写）：/Users/ego_bai/.openclaw/workspace/a-stock-website/PLAN.md
- 决策日志：/Users/ego_bai/.openclaw/workspace/a-stock-website/DECISION_LOG.md
- 生产版代码：/Users/ego_bai/.openclaw/workspace/a-stock-website/frontend/
- 共享类型：/Users/ego_bai/.openclaw/workspace/a-stock-website/shared/types.ts
- dev server：http://127.0.0.1:5173/（如未运行，用 nohup ./node_modules/.bin/vite --port 5173 启动）

## 每轮循环流程

### ① 计划 (Plan)
1. Read PLAN.md，读取"当前Sprint"和"下一任务"
2. 幂等检查（必做）：确认该任务对应功能是否已在代码中激活。若已激活，跳过取下一个任务
3. 取出下一个未完成任务，分解为可执行 Ticket（含明确验收标准）
4. 【防空转·自主改进池】若「下一任务」为空/需用户拍板，禁止纯待命空跑。
   按优先级取改进项：a) 技术债清偿 b) 测试覆盖补强 c) 文档-代码同步
   d) 性能优化 e) 小型体验优化。每轮最多推进 1 项，同样走完整流程。
   边界不变：技术选型/范围变更/资源投入/新数据源等重大决策仍需用户拍板。
   连续 5 轮无可做项 → 写 DECISION_LOG 标记停滞 + 推送提醒用户介入

### ② 团队分工执行 (Execute)
- 默认团队协作模式：用 Agent 工具分派子智能体
- 独立验证红线：子智能体汇报完成后，必须用 grep/read/curl 复核其产出，不轻信自报
- 每 Ticket 独立实现，遵循最小侵入原则

### ③ 测试 (Test)
cd /Users/ego_bai/.openclaw/workspace/a-stock-website/frontend
- ./node_modules/.bin/tsc --noEmit
- npm run build（若 safe-delete 钩子拦截，先 mv dist /tmp 再构建）
- 关键场景验证：curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:5173/<route>

### ④ 验收 (Accept)
对照验收标准逐项核查；fail 则反馈执行 agent 修复（最多1轮）

### ⑤ 复盘 (Review)
更新 PLAN.md：完成率/P0完成率/遗留问题/当前循环状态 + 改进池销号

### ⑥ 再计划 (Re-plan)
设计下一 Sprint 任务；逐项回答 PLAN.md 第五节评估清单 E1-E6

### ◆ 决策门 (Decision Gate)
有 🔴关键问题 / 🟠重大进展 / 🟡需用户决策 → 追加写 DECISION_LOG.md 并推送

### ★ 循环总结推送（每轮必做）
每轮结束生成简短总结（≤15行），按顺序推送：
1. 微信：读 .wechat_push.json，webhook 非空则执行 push_summary.sh
2. 邮件降级：mcp__agent-mail__SendMessage 发至 374070139@qq.com（skip_confirmation=true）
3. 兜底：落盘 summaries/loop-YYYYMMDD-HHmm.md
频率控制：开发轮/改进轮/新决策/红线异常/停滞 → 必发；纯健康巡检轮不发

## 重要约束
- 每轮只推进 1-2 个 Ticket，避免过度并行导致冲突
- 所有代码修改必须通过 tsc --noEmit + npm run build
- 不破坏现有功能，优先激活已有代码
- 技术选型/范围变更/资源投入等重大决策必须写入 DECISION_LOG.md 并提示用户
- 若连续2轮无进展，写入 DECISION_LOG.md 标记停滞，推送提醒用户介入
- 单通道红线：每轮开始 git status --short；
  PLAN.md/DECISION_LOG.md/.workbuddy/automations/*/memory.md 等记账类脏文件【容忍】；
  仅当生产源码在途（frontend/src/ backend/src/ miniprogram/ shared/ 出现 M/??）才判定红线触发
  → 暂停本轮并提示主理人，绝不擅自并行改库
- 每轮结束强制收口：逐文件 git add <具体路径> + commit（严禁 git add -A）
- 若 Sprint 全部完成且改进池为空且连续 5 轮无可做项，推送邮件并等待新指令
```

---

## 删除依据汇总（2026-10-23 验证结论）

| 自动化 | 状态 | 验证结果 | 处置 |
|---|---|---|---|
| 投研助手每日测评蜂群 | ACTIVE | 45 份报告，最新 10-22 21:05；5 画像 × 25 模块 + ~50 端点实测；发现真 P1（ai/filter 500 持续 6 日、000005.SZ 陈旧 2.6 年）；诚实红线连续 21 日清零 | 保留 |
| 澄观Clair每日00:00简明日报 | ACTIVE | 最新 10-22；7 段式 + 验证明细表（git/tsc/服务/记账 mtime）+ 推送通道第 37 次复核 | 保留 |
| 每日晨间AI资讯日报 | ACTIVE | 有运行但**零落盘零推送**，产出仅存于对话；属用户本职工作工具 | 保留，建议改造 |
| Clair 进度看板自动刷新 | PAUSED | 用户已拍板永久停用；memory 8-30 后无更新 | **已删除** |
| 澄观Clair自主推进循环 | PAUSED | 末次 run 10-05（停 18 天）；memory 8-27 后无更新；与单通道红线冲突 | **已删除** |
