# K 线全量回填执行方案

> 日期：2026-11-04 ｜ 范围：方案 + Phase 1 执行（只写 `daily_quotes_hist`，`daily_quotes` 一行不动；Phase 2~4 未执行）
> 依据：`KLINE-STORAGE-DESIGN.md`（表结构）、`KLINE-BACKFILL-PILOT.md`（pilot 实测）+ 本机 2026-11-04 实测
> 结论：P1 已于 2026-11-04 执行完成（3,760 只 / +439,205 行 / 25.2 min，见 §十）；全量 3 年估算 ≈80~95 分钟 / +约 374 万行 / 体积 +590 MB
> 口径：P1 验收按 hist 数据层（不再补写 daily_quotes）；用户可见修复需 Phase 4 Reader 切换（独立批准）

## 一、现状基线（本机实测）

| 表 | 行数 | 标的 | 日期范围 | 体积 | 结构 |
|---|---|---|---|---|---|
| `daily_quotes` | 539,829 | 5,212 | 2001-01-18~2026-11-03 | 134 MB（堆 80/索引 54） | 无分区；PK id + (stock_id,trade_date) 唯一，另有 1 条同列重复索引 |
| `daily_quotes_hist` | 587,683 | 799 | 2018-01-02~2026-10-30 | 104 MB（堆 88/索引 16） | 按年分区 2018~2026 + `_default`（0 行）；PK + BRIN |
| `stocks` | 5,546 | — | is_active 全 true | — | 其中 5,210 只在 2026-06-09 后有行情；336 只退市/无近期行情 |

P0 载体日真身已实测补齐（2026-07-10=5,191 行、2026-09-04=5,189 行，均为全市场量级）→ #92 剩余工作面即 P1 + 全量历史深度。

**P1 缺口实测（2026-01-05~06-08）**

| 项 | 实测 | 说明 |
|---|---|---|
| 交易日数 | **101** | hist 799 只 DISTINCT trade_date；工单 103 天已作废（Lead 2026-11-04 裁定按实测重定基线） |
| daily_quotes 每日行数 | 74 天恰好 24 行；94 天 ≤100 行；区间合计 5,113 行 | 工单写「每天仅 11 行」，现为 24 行/日（多轮修复脚本叠加，来源未逐一定论） |
| hist 同区间 | 80,587 行 / 799 只（每日 794~799） | pilot 已覆盖 799 只 |
| 两表交集 | 2,482 行，close 不一致 **498 行 / 6 只** | 6 只均为已知 qfq 残污标的 |
| 预计缺口 | 目标每日 ≈5,185（近 99 日日均 5,190 − 6 月后新上市 9 只）×101≈52.4 万 − 现有并集 83,218 → **约 44.0 万行** | |

## 二、数据源与限流（Q1）

| 项 | 腾讯 fqkline（价格/量） | 同花顺 v6/line（成交额/换手率） |
|---|---|---|
| 端点 | `web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=<sh600519 / sz000001>,day,<start>,<end>,800,bfq`，备域 `ifzq.gtimg.cn` | `d.10jqka.com.cn/v6/line/hs_<code>/01/<year>.js` |
| 实测 | 3 年 726 根 **1 次请求** / 53.8 KB / 0.19 s；101 天 8.8 KB / 0.12 s | 一年一文件（2026 文件已含至 11-03）/ 15.7 KB / 0.09 s |
| 限流 | pilot 不限速 ≈4,000 请求/146 s（≈27 rps）后 HTTP 501，cool-down >4 分钟；本轮 24 请求 @≈4.1 rps **100% 200**（p50 118 ms / p95 160 ms） | 501/429/503=限流；退市股 404（实测 hs_000005=404、hs_000003=502） |
| 重试 | 4 次：700 ms×2ⁿ+抖动，25 s 超时，双域轮换 | 5 次：限流 2.5 s×2ⁿ，其余 700 ms×2ⁿ；404=NODATA 不重试 |
| 失败语义 | NO_UPSTREAM 跳过；OHLC 不自洽整只拒写 | 无成交额则该日不写（turnover NOT NULL，绝不填 0） |

- **批量与速率**：单只单事务多值 INSERT（726 行×14 列=10,164 参数 < PG 65,535 上限）；并发 4~5、全局 `--rps 6`（≈360 请求/分），3 年 5 请求/只、P1 缺口 2 请求/只。
- **断点续跑**：JSON checkpoint 在 COMMIT 后落盘；pilot 已实测 kill -9：5 只已 checkpoint 且库内各 2,100+ 行，续跑 OK=5/SKIP=5，不重复不跳段。注意 `--recheck` 只在注释声明、代码未实现（见 §八）。

## 三、落库设计（Q2）

| 判定 | 结论与依据 |
|---|---|
| 用哪张表 | **只写 `daily_quotes_hist`**，`daily_quotes` 一行不动（pilot 已验证，结构见 DESIGN §2） |
| daily_quotes 能否承载 | **不能**：无分区、PK id + 重复索引、日均 259 B/行，4M 行≈1.0 GB 且写放大落在热表；口径混用（volume 手/股、qfq 残污） |
| hist 容量 | 实测 185.6 B/行（104 MB/587,683）；3.74M 行 ≈**694 MB**；库 260 MB→≈850 MB（磁盘余 28 GiB） |
| 分区/索引 | 2023-11-01~2026-10-30 全被 2023~2026 分区覆盖，无需建分区；PK(stock_id,trade_date) 覆盖单标的区间，BRIN(trade_date) 覆盖截面；`_default` 实测 0 行 |
| 写入方式 | 单只单事务批量 `INSERT ... VALUES×N ON CONFLICT DO NOTHING`；**不用 COPY**（不支持 ON CONFLICT；且实测 573,608 行/146 s，DB 非瓶颈） |
| 幂等 | PK + DO NOTHING，RETURNING rowCount=真实新增；pilot 两轮重跑新增 0；修复才用 `--overwrite`（带 ingested_at>1 天保护） |

## 四、双表口径与防双写（Q3）

| 日期段 | 准表 | 依据 |
|---|---|---|
| 2023-11-01~2026-06-08 | **hist** | hist=腾讯 bfq、单位统一、带血缘；daily_quotes 同段为 qfq/载体行 |
| 2026-06-09~2026-11-03 | **daily_quotes** | 实时采集写入；与 hist 重叠段实测 0 差异 |
| 回填新增 | 只写 hist | pilot 573,608 行全部落 hist |

- **无任何双写**：`rg daily_quotes_hist backend frontend data-collector` = 0 处；hist 唯一写入方是 `scripts/data/backfill-kline-pilot.cjs`；daily_quotes 由采集器/修复脚本写，两条链路物理隔离。
- **冲突面**：全历史重叠 85,321 行中 5,499 行 close 不一致（11 只 qfq 残污），**全部在 2026-06-09 前**；其中 P1 区间 498 行/6 只。视图 `v_daily_quotes_all` 热表优先 → 这些行会遮蔽 hist 正确值，Reader 切换前须按 DESIGN §7.5 清洗（先备份，需批准）。
- **防双写纪律**：① P1~P3 只写 hist；② 冻结 `backfill-kline-history.cjs`（它往 daily_quotes 写 qfq 价，正是 24 行/日来源）；③ 不把 hist 写入挂进采集器；④ P2 四天（05-28/05-29/06-04/06-05）归另一工单，不碰。

## 五、时间与资源估算（Q4，rps=6）

| 阶段 | 标的 | 请求 | 实测/预计纯跑 | 新增行 | 体积增量 |
|---|---|---|---|---|---|
| Phase 1 P1 缺口（已完成） | 4,391→3,780（首跑 601 后断点续跑） | 7,564（2/只） | **25.2 min** | **439,205** | **+67 MB** |
| Phase 2 扩到 3,000 | +2,201（3 年） | 8,804（4/只，2026 已缓存） | 25~30 min | ≈135.7 万 | +252 MB |
| Phase 3 全量 | +2,210（3 年） | 8,840（4/只） | 25~30 min | ≈136.4 万 | +253 MB |
| 合计 | 5,210 | 26,466 | **80~95 min** | **≈374 万** | hist 104→≈694 MB |

- 估算口径：3 年 726 交易日；pilot 实测 718 行/只（含停牌缺日）→ 5,210×718≈374 万（上界 726×5,210=378 万）。
- **后台任务：是**。用受管后台 job（禁 shell `&`），逐阶段独立 checkpoint + report JSON；**不需要断点表**（文件 checkpoint 已实测可靠，DB 侧可用 ingested_at 反查）。
- 资源：磁盘余 28 GiB；WAL 单阶段 ≤1.4M 行按 ≤400 B/行估 ≈0.55 GB，低于 max_wal_size 1 GB 自动 checkpoint；无需调参。

## 六、回滚与校验（Q5）

| 层级 | 做法 |
|---|---|
| L1 逻辑回滚（默认） | 阶段开始前记录时刻 T，回滚 = `DELETE FROM daily_quotes_hist WHERE ingested_at >= T AND trade_date BETWEEN ...`（DO NOTHING 保证 pilot 行 ingested_at 不变，只删本阶段新增） |
| L2 物理备份/重建 | Phase 1 前 `pg_dump -d clair -Fc` 全库（实测 44 MB/5 s，已存 /tmp）；极端回滚 = `DROP TABLE` + 重跑 DDL + 重跑 pilot（799 只≈11 min） |
| 若动 daily_quotes（仅 Phase 4） | 先 `CREATE TABLE ..._bak`，回滚 = 反向 UPDATE |

| 校验项 | 判据 | 已有证据 |
|---|---|---|
| 抽样 20 只×5 日逐字段对拍腾讯 bfq + THS 成交额 | 六字段 maxAbsDiff=0 | pilot 6 只×30 日全 0 |
| 全表隐含均价 `turnover/volume ∈ [low,high]` | ≥99.9% | pilot 99.9547% |
| 每日行数 | P1：101/101 天 hist ≥5,000；Phase 3：726/726 天 ≥5,000 | P1 已达成：101 天日均 5,139~5,187（§十）；Phase 3 未开始 |
| 与 daily_quotes 重叠对拍 | 2026-06-09 后 0 差异 | 实测 0；5,499 全在切换点前 |
| 幂等重跑 | 新增 0 行 | pilot 两轮 0 |
| 分区兜底 | `_default`=0 行 | 实测 0 |

## 七、分阶段实施（Q6）

| 阶段 | 动作 | 验收判据（机器可验） | 失败处理 |
|---|---|---|---|
| 0 前置 | 重定工单基线（101 天/24 行）；dump 备份；确认 `_default`=0；冻结旧脚本 | Lead 书面确认新基线；dump 文件存在 | 不符即停 |
| 1 P1 缺口 | 4,411 只×2026-01-05~06-08 写入 hist（2026-11-04 已完成，见 §十） | 101/101 天 ≥5,000；累计≈103 万行；20 只 0 差；重跑 0 新增 | 抽样不符即停 + L1 回滚 |
| 2 扩到 3,000 | 新增 2,201 只×3 年（symbol 升序前 2,201） | 完整 3 年标的（≥700 行）=3,000；累计≈238 万行；非缺口日均 ≥2,950；20 只 0 差 | 同上 |
| 3 全量 | 新增 2,210 只×3 年（余量） | 726/726 天 ≥5,000；完整标的=5,210；累计≈373 万行；与 live 重叠 0 差 | 同上 |
| 4 读取切换（另批需批准） | 按 §九 三步走；切换暂不批准 | 见 §九 | 见 §九 |

- 阶段对应：工单的「先 800 只」= 已完成 pilot（799 只）；本方案先插 Phase 1 补 P1 缺口拿最小闭环，Phase 2/3 即「再 3,000 → 全量」。
- 顺序理由：P1 先拿 44 万行；2/3 复用 P1 已缓存的 2026 年 THS 文件（每只省 1 请求）。一次性全量=26,050 请求（少 416 次）但无早期交付。
- Phase 1 执行命令（Phase 2/3 换 start/end、标的清单与 checkpoint）：

```bash
node scripts/data/backfill-kline-pilot.cjs --universe all --start 2026-01-05 --end 2026-06-08 --apply \
  --concurrency 4 --sleep-ms 120 --rps 6 \
  --checkpoint scripts/data/.backfill-p1.ckpt.json --report scripts/data/.backfill-p1.report.json
```

## 八、风险与待修

| 风险 | 影响 | 对策 |
|---|---|---|
| 同花顺 501 | 全量约 1.76 万次 THS 请求可能中断 | 重试已内建；失败率 >5% 降 `--rps 4` 并分片，阶段间天然冷却 |
| 336 只退市/无近期行情 | THS 404 无成交额 | 不进清单，不影响全市场统计 |
| 腾讯 800 根硬上限 | >800 交易日静默截断 | 3 年 726 根 1 次内；脚本已有窗口回退（8 年实测 2,140 根） |
| P2 四天 620 行遮蔽 | 热表优先挡住 hist | 不碰，Phase 4 前由 P2 工单收口 |
| **工单数字不符** | 103 天/11 行 vs 实测 101 天/24 行 | **已按 Lead 2026-11-04 裁定修正：以实测 101 天/24 行为基线，工单数字作废** |
| 脚本缺口 | `--recheck` 未实现；无 `--universe all` | **已补**：两处 +19/−1 行（ed3081dd6），另 501 退避 19efc382f、不复权回退 fddd916bc、串号防护 72d269023 |

## 九、Phase 4 三步走（Lead 2026-11-04 裁定，切换暂不批准）

| 步骤 | 内容 | 状态 / 实测结果 |
|---|---|---|
| 1 建视图 | `v_daily_quotes_all` v2：历史段（≤2026-06-08）hist 优先、热段（≥2026-06-09）live、其余回退 live；新增 `_src` 与 `_qfq_suspect` 标记；不切换任何消费方 | 已建（DDL v2 已写入 scripts/data/ddl-daily-quotes-hist.sql 并执行） |
| 2 shadow 比对 | `scripts/data/shadow-kline-reader-diff.cjs`：20 只样本（11 qfq 残污 + 6 干净 + 3 本轮回填），比 A=getDailyQuotes 形态、B=/kline ASC LIMIT 250 形态，差异逐条分类落 JSON | 已跑通：A readerOnly=0、viewOnly=4,482、共同 8,425；差异分类 5,499 qfq 修正 / 9,443 qfq 派生 / 366 旧零换手率 / 77 量舍入 / 13 旧派生 / 55 估值 NULL，**UNEXPLAINED=0**（逐条差异 5,802 行见 `.shadow-reader-diff.json`） |
| 3 开关切换 | 环境变量默认 legacy、可一键回退；改动点仅 `Database.getDailyQuotes` 与 `stock.ts /kline` 两处取数 | **未实施**，待步骤 2 结果评审通过后另批；另：/kline 现为 ASC LIMIT 250，切视图会从「最近 250」变「最早 250」，须同步改 DESC 取数（shadow B 已暴露 853/1,984 窗口漂移） |

## 十、Phase 1 执行记录（2026-11-04，只写 hist）

| 动作 | 实测结果 |
|---|---|
| 备份 + 冒烟 | dump 44 MB/5 s（/tmp/clair_pre_backfill_20261104.dump，备份前 DB 260 MB）；20 只冒烟 20/20 OK、requests=40、7 s、inserted=1,774；verify 101 天 0 差 |
| 全量首跑 | 目标 4,391 只；601 只后腾讯 fqkline 双域 501 → kill，checkpoint 601（daily_quotes 全程 539,829 行未变） |
| 回退修复 | fddd916bc 不复权端点换主机短退避防假死；72d269023 THS 代码串号防护（价格锚定失败整只拒写）；此前 ed3081dd6 补 --universe all/--recheck |
| 全量续跑 | 目标 3,780 只 / 25.2 min / requests=7,564（腾讯 2 次/只，THS 命中本地缓存）/ inserted=377,994 / OK=3,760 / NO_AMOUNT=20 / DB_ERROR=FETCH_ERROR=0 |
| 累计效果 | hist 1,028,662 行、5,190 标的、182 MB（前 587,683/799/115 MB）；P1 区间 521,566 行、101 天日均 5,139~5,187、4,900 只满 101 天；本轮入库 439,205 行（bfq 60,202 / raw 379,003） |
| 验收（机器） | 101/101 天 ≥5,000 ✓；_default=0 ✓；同 checkpoint 重跑 0 新增 ✓；20 只新样本×101 天 maxAbsDiff=0 ✓；视图 101 天日均 5,139~5,194 |
| 未回填 20 只 | 5 指数（000001/000300/000905.SH、399001/399006.SZ，THS 无指数代码或串号）+ 15 只退市/停牌（THS 404 无成交额），按设计整只不写，非缺口 |
| 磁盘增量 | DB 271→338 MB（+67 MB）；hist 115→182 MB、2026 分区 39→106 MB；磁盘余 26 GiB |
| 后续 | Phase 2/3 另批（P2 先收口 620 行遮蔽）；Phase 4 见 §九，步骤 3 环境变量开关未实施、待评审；不 push |

## 附：本轮证据

- 证据：方案期只读实测（psql 基线/缺口/交集；curl+node 探针：腾讯 3 年/101 天、THS 2026、24 请求限流）+ Phase 1 执行与验收（§十）；关键文件 `scripts/data/backfill-kline-pilot.cjs`（限流/重试/断点/verify）、`scripts/data/ddl-daily-quotes-hist.sql`（分区/索引/视图）。
- 文档：`KLINE-STORAGE-DESIGN.md` §4.5（185 B/行实测）/§7.5（11 只清洗 SQL）、`KLINE-BACKFILL-PILOT.md`（pilot 全部实测与四证）；`backend/db/migrations/001_init_tables.sql:40-61` 已与线上表漂移，以 information_schema 为准。
