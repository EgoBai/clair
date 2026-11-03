# K 线全量回填执行方案

> 日期：2026-11-04 ｜ 范围：**只出方案，不改代码、不跑回填**（本轮零写入）
> 依据：`KLINE-STORAGE-DESIGN.md`（表结构）、`KLINE-BACKFILL-PILOT.md`（pilot 实测）+ 本机 2026-11-04 实测
> 结论：复用 hist 分区表 + pilot 脚本，P1 缺口 4,411 只×2 请求 ≈30 分钟；全量 3 年 ≈80~95 分钟 / +约 374 万行 / 体积 +590 MB
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
| 交易日数 | **101** | hist 799 只 DISTINCT trade_date；工单写 103，差 2 → 需重定基线 |
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

| 阶段 | 标的 | 请求 | 预计纯跑 | 新增行 | 体积增量 |
|---|---|---|---|---|---|
| Phase 1 P1 缺口 | 4,411（5,210−799） | 8,822（2/只） | 25~30 min | ≈44.0 万 | +82 MB |
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
| L2 物理备份 | Phase 1 前 `pg_dump -d clair -t 'daily_quotes_hist*' -Fc`（104 MB，含分区）；P2/P3 体积大，靠 L1 + 上游可重放 |
| L3 重建 | `DROP TABLE` + 重跑 DDL + 重跑 pilot（799 只≈11 min，可完全恢复） |
| 若动 daily_quotes（仅 Phase 4） | 先 `CREATE TABLE ..._bak`，回滚 = 反向 UPDATE |

| 校验项 | 判据 | 已有证据 |
|---|---|---|
| 抽样 20 只×5 日逐字段对拍腾讯 bfq + THS 成交额 | 六字段 maxAbsDiff=0 | pilot 6 只×30 日全 0 |
| 全表隐含均价 `turnover/volume ∈ [low,high]` | ≥99.9% | pilot 99.9547% |
| 每日行数 | P1：101/101 天 hist ≥5,000；Phase 3：726/726 天 ≥5,000 | 当前 726 天全部不足（仅 799 行） |
| 与 daily_quotes 重叠对拍 | 2026-06-09 后 0 差异 | 实测 0；5,499 全在切换点前 |
| 幂等重跑 | 新增 0 行 | pilot 两轮 0 |
| 分区兜底 | `_default`=0 行 | 实测 0 |

## 七、分阶段实施（Q6）

| 阶段 | 动作 | 验收判据（机器可验） | 失败处理 |
|---|---|---|---|
| 0 前置 | 重定工单基线（101 天/24 行）；dump 备份；确认 `_default`=0；冻结旧脚本 | Lead 书面确认新基线；dump 文件存在 | 不符即停 |
| 1 P1 缺口 | 4,411 只×2026-01-05~06-08 写入 hist | 101/101 天 ≥5,000；累计≈103 万行；20 只 0 差；重跑 0 新增 | 抽样不符即停 + L1 回滚 |
| 2 扩到 3,000 | 新增 2,201 只×3 年（symbol 升序前 2,201） | 完整 3 年标的（≥700 行）=3,000；累计≈238 万行；非缺口日均 ≥2,950；20 只 0 差 | 同上 |
| 3 全量 | 新增 2,210 只×3 年（余量） | 726/726 天 ≥5,000；完整标的=5,210；累计≈373 万行；与 live 重叠 0 差 | 同上 |
| 4 读取切换（另批需批准） | 清洗 5,499 行/11 只 → Reader 切 `v_daily_quotes_all` | 视图逐日达标 + K 线接口/页面 e2e 抽样 | 回滚 Reader 一行改动 |

- 阶段对应：工单的「先 800 只」= 已完成 pilot（799 只）；本方案先插 Phase 1 补 P1 缺口拿最小闭环，Phase 2/3 即「再 3,000 → 全量」。
- 顺序理由：P1 先拿 44 万行；2/3 复用 P1 已缓存的 2026 年 THS 文件（每只省 1 请求）。一次性全量=26,050 请求（少 416 次）但无早期交付。
- Phase 1 执行命令（Phase 2/3 换 start/end、标的清单与 checkpoint）：

```bash
cd ~/.openclaw/workspace/a-stock-website
SYMS=$(psql -d clair -Atc "SELECT string_agg(s.symbol, ',') FROM stocks s
  WHERE EXISTS (SELECT 1 FROM daily_quotes q WHERE q.stock_id=s.id AND q.trade_date>='2026-06-09')
    AND NOT EXISTS (SELECT 1 FROM daily_quotes_hist h WHERE h.stock_id=s.id)")
node scripts/data/backfill-kline-pilot.cjs --symbols "$SYMS" \
  --start 2026-01-05 --end 2026-06-08 --apply \
  --concurrency 4 --sleep-ms 120 --rps 6 \
  --checkpoint scripts/data/.backfill-p1.ckpt.json \
  --report scripts/data/.backfill-p1.report.json
```

## 八、风险与待修

| 风险 | 影响 | 对策 |
|---|---|---|
| 同花顺 501 | 全量约 1.76 万次 THS 请求可能中断 | 重试已内建；失败率 >5% 降 `--rps 4` 并分片，阶段间天然冷却 |
| 336 只退市/无近期行情 | THS 404 无成交额 | 不进清单，不影响全市场统计 |
| 腾讯 800 根硬上限 | >800 交易日静默截断 | 3 年 726 根 1 次内；脚本已有窗口回退（8 年实测 2,140 根） |
| P2 四天 620 行遮蔽 | 热表优先挡住 hist | 不碰，Phase 4 前由 P2 工单收口 |
| **工单数字不符** | 103 天/11 行 vs 实测 101 天/24 行 | **执行前置 gate：Lead 重定基线，否则违反「与工单数字不符立即停止」** |
| 脚本缺口 | `--recheck` 未实现；无 `--universe all` | 本轮不改码；执行轮打 ≤20 行补丁，或用本文 `--symbols` 兜底 |

## 附：本轮证据

- 只读实测：psql `clair` 基线/缺口/交集统计；curl+node 探针（腾讯 3 年/101 天、THS 2026、24 请求限流探测）。**未写任何表、未跑回填**。
- 关键文件：`scripts/data/backfill-kline-pilot.cjs`（限流/重试/断点/verify）、`scripts/data/ddl-daily-quotes-hist.sql`（分区/索引/视图）、`backend/db/migrations/001_init_tables.sql:40-61`（**已与线上表漂移**：线上有 change_amount/created_at，无 change/updated_at/circulating_market_cap → 以 information_schema 为准）。
- 文档：`KLINE-STORAGE-DESIGN.md` §4.5（185 B/行实测）/§7.5（11 只清洗 SQL）、`KLINE-BACKFILL-PILOT.md`（pilot 全部实测与四证）。
