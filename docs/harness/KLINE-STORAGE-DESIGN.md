# K 线存储结构设计（daily_quotes_hist）

> 日期：2026-11-02（周一，交易日）
> 作者：数据工程子 Agent（general-purpose-5）
> 背景：`daily_quotes` 长周期 K 线被截断，用户拍板「先回填沪深300+中证500 约 800 只，跑通验证后再逐步全量」。
> 本文回答「是否改造 / DDL / 分区 / 索引 / 空间 / 口径防护 / 幂等 / 与现存代码衔接」八问。
> 本文所有数字均为本机 `psql -d clair` 实测，非估算（标 [估] 的除外）。

---

## 0. 先说三条实测事实（设计的出发点）

### 0.1 存量真实深度：不是 250 根，是 ~97 根

```
daily_quotes: 529,453 行 / 5,212 只 / 2001-01-18 ~ 2026-10-30
```

按「某交易日有行」统计 2026 年：

| 单日行数区间 | 交易日数 | 说明 |
|---|---|---|
| ≥ 5000（全市场） | **97** | 真正的全市场日线，5,182~5,199 只/日 |
| 500 ~ 1,999 | 4 | 残缺 |
| 50 ~ 499 | 3 | 残缺 |
| < 50 | **94** | 18~25 只/日，属"载体行"（carrier days），非全市场 |

即：**真正可用的全市场交易日只有 97 天**，其余日期是少量标的的孤立行。
这解释了「5,181 只标的 K 线数在 60~249 之间」——不是 250，是 ~97。
长周期回测（如 2024-01-01 起）实际只跑到 2026-06 附近，前置区间被静默跳过。

### 0.2 存量价格口径 = **以「最近除权日」为基准的 qfq 快照**，98.6% 标的上恰好等于不复权

⚠️ 本节结论经过两次实测修正，早期版本（以及 2026-10-24 的脚本注释）都不准确，以此为准。

**第一次实测（只看 2026-06 除权日附近，得到错误结论）**：茅台 600519 在 2026-06-26 除权（每股派 28.024 元），

| 交易日 | 库内 close | 腾讯 bfq | 腾讯 qfq |
|---|---|---|---|
| 2026-06-22 | 1241.41 | 1241.410 | 1213.386 |
| 2026-06-25 | 1212.10 | 1212.100 | 1184.076 |
| 2026-06-26 | 1168.63 | 1168.630 | 1168.630 |
| 2026-10-30 | 1392.05 | 1392.050 | 1392.050 |

此区间内库内**严格等于 bfq**。但如果就此判定「存量 = 不复权」就**错了**——这个区间恰好落在
「qfq 快照 == bfq」的平坦区，检验点选错了。

**第二次实测（全量对拍，结论修正）**：用本次回填的 `daily_quotes_hist`（腾讯 bfq，真不复权）
与存量 `daily_quotes` 做全量逐日对拍，**85,321 个重叠行 / 799 只标的**：

| 维度 | 结果 |
|---|---|
| close 完全一致 | 788 / 799 只（**98.62%**） |
| close 存在差异 | **11 只（1.38%）**，共 5,499 行（6.44%） |

11 只的差额结构（这是判定口径的关键指纹）：

| 标的 | 差异行数 | 首/末差异日 | 差额取值数 | 差额区间 |
|---|---|---|---|---|
| 002594.SZ | 422 | 2023-11-01 ~ 2025-07-28 | 403 | 113.69 ~ **271.32** |
| 300308.SZ | 604 | 2023-11-01 ~ 2026-04-29 | 133 | 1.00 ~ 55.85 |
| 600519.SH | 519 | 2023-11-01 ~ 2025-12-18 | 5 | 23.96 ~ 125.50 |
| 300750.SZ | 598 | 2023-11-01 ~ 2026-04-21 | 5 | 6.96 ~ 18.78 |
| 601398.SH | 610 | 2023-11-01 ~ 2026-05-12 | 5 | 0.17 ~ 0.93 |
| …（其余 6 只同型） | | | | |

**差额是「分段常数、逐段递减、末端归零」**——这是前复权的标准指纹：
每跨过一次除权日，扣减额就少一段，直到最近一次除权日之后归零。

⇒ **准确结论**：存量 `daily_quotes` 是「**以各标的最近一次除权日为基准写入的 qfq 快照**」。
- 对 788 只（98.62%）标的，考察区间内没有除权事件，qfq 快照**数值上等于** bfq → 看起来像不复权；
- 对 11 只（1.38%）标的，存量是 qfq，**不等于**不复权，最大单日价差 **271.32 元/股**（002594）。

⇒ **设计含义（重要）**：
1. 新表用腾讯 `bfq` 存**真不复权**，是本任务要求的正确口径，不受存量污染影响；
2. 但**绝对不能**假设「存量也是不复权」就把两者 UNION 起来 —— 对那 11 只标的，3 年 K 线会在
   除权分界处出现 6.96 ~ 271.32 元/股的假跳空。切换 Reader 之前必须先清掉这 11 只（见 §7.5）。
3. 这也解释了历史事故里「约 5.5% 标的价位错」为何看起来像不复权：**多数标的本来就没有除权**，
   只有少数标的能暴露 qfq 痕迹，抽样越少越容易误判。

### 0.3 存量单位口径（实测，与任务书一致，但有一处**板级不一致的坑**）

| 字段 | 库内单位 | 证据 |
|---|---|---|
| `turnover` | **元**，但按「万元」四舍五入留下 4 个尾零 | 600519 2026-06-22：同花顺 7,163,236,300 → 库内 7,163,240,000（= round(716323.63万)=716324万） |
| `market_cap` | **万元** | 任务书给定，未改动 |
| `volume` | **主板/创业板 = 手；科创板 688 = 股** | 688981 2026-10-30 库内 29,998,989 = 腾讯 29,998,989（股）；000001 库内 1,864,245 = 腾讯 1,864,245（手） |
| 价格 | **不复权**，`numeric(10,2)` | 见 0.2 |

⚠️ `volume` 的「同一列两种单位」是**存量缺陷**（腾讯上游对 688 直接给股，采集端原样落库）。
新表统一为 **股**，并在视图层按板块回退，保证老读者行为不变（详见 §5、§7）。

### 0.4 上游可用性实测（2026-11-02，`curl --noproxy '*'`）

| 源 | 端点 | 结果 | 可提供 |
|---|---|---|---|
| 腾讯 fqkline | `web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=<sym>,day,<beg>,<end>,<n>,bfq` | **200 可用** | 不复权 OHLC + 成交量（原样单位）+ 一次 726 根/3 年 |
| 同花顺 | `d.10jqka.com.cn/v6/line/hs_<code>/01/<year>.js` | **200 可用** | **成交额（元，两位小数）**、换手率；价格是 **qfq**（不可用于价格） |
| 东财 push2his | `push2his.eastmoney.com / push2.eastmoney.com` | **HTTP 000 全灭** | — |
| 东财 datacenter | `datacenter-web.eastmoney.com` | **200 可用** | 指数成分（`RPT_INDEX_TS_COMPONENT`，TYPE=1 沪深300 / TYPE=3 中证500） |
| 网易 | `quotes.money.163.com/service/chddata.html` | **502** | — |

**结论：无单一源同时提供「不复权价 + 成交额」**（东财被墙、网易 502）。
因此采用 **A/B 双源拼装**，并明确各自的职责边界：

- **价格 / 成交量 ← 腾讯 `bfq`**（唯一的不复权可信源，且其成交量单位与库内存量逐字节一致）
- **成交额 ← 同花顺**（成交额是「当天真实成交的钱」，**与复权口径无关**，因此可跨源使用）

这条拼装不是妥协式凑数，有硬证据：库内 529k 行的 `turnover` 全部来自同花顺且逐日精确吻合（见 §0.3），
说明历史存量本身就是这么拼的。本次只是把「价格」从同花顺 qfq 换成腾讯 bfq。

---

## 1. 判断：改造 `daily_quotes` 还是新建历史表？

**结论：新建 `daily_quotes_hist`（按年分区），`daily_quotes` 一行不动。**

判断依据（按权重排序）：

| 维度 | 改造 `daily_quotes`（原地转分区表） | 新建 `daily_quotes_hist` |
|---|---|---|
| 停机风险 | 必须 `ALTER TABLE ... RENAME` + `CREATE ... PARTITION OF` + 全量 `INSERT SELECT` 529k 行，期间**写路径中断**。当前 `daily_quotes` 有采集器在写（`ON CONFLICT DO UPDATE`），并与 5 个其他 Agent 在途任务共享同一库。 | 只 `CREATE TABLE`，零锁、零中断。 |
| 回滚成本 | 需反向重建，且期间已写入的新行会丢。 | `DROP TABLE` 一条命令，无副作用。 |
| 读取方兼容 | 表名不变，理论上零改动。 | 需 1 处改动（或加视图，见 §7）。 |
| 口径修正机会 | 被存量列名绑架（`turnover` / `volume` 双单位 / `market_cap` 万元），无法改名。 | 可以一次性把「元 / 股」显式化，用 CHECK 焊死。 |
| 与本轮任务边界 | 任务书红线：「若判断需要迁移生产库结构，先上报，不要擅自 ALTER 现有表」。 | 属新增，不触碰既有表。 |
| 最终形态 | 更干净（单表）。 | 需长期维护「双表 + 视图」的过渡态。 |

**取舍**：本轮选新建。理由不是「新建更好」，而是**当前共享工作区的并发前提下，原地重建的爆炸半径不可接受**。
`daily_quotes` 现在是热写表、有 5+ 个 Agent 在改动、且刚经历过口径事故（库内还留着 9 张 `*_bak_*` 备份表），
此时做「整表 rename + 复制 529k 行」是在别人正在铺轨的时候拆桥。

**收敛路径（分三步，本轮只做第 1 步）**：

1. **本轮**：`daily_quotes_hist` 建成分区表 + 回填 800 只 pilot，`daily_quotes` 不动。读取方通过视图可选接入。
2. **下一轮（需批准）**：把 `daily_quotes` 里 `trade_date < 'YYYY-01-01'` 的行迁入 `daily_quotes_hist`，`daily_quotes` 瘦身为「当年热表」。
3. **终态（需批准 + 停机窗口）**：`daily_quotes` 重建为同结构与历史表合并、按年分区，历史表 `ATTACH` 成它自己的分区，视图退场。

---

## 2. DDL（可直接执行）

```sql
-- ============================================================================
-- daily_quotes_hist：日线历史深档（不复权）
--
-- 口径（与 daily_quotes 的映射关系见 §5 / §7）：
--   价格      : 不复权（原始成交价），单位 元/股。DDL 层 CHECK 焊死 price_adj='N'
--   成交量    : 股（统一！不再区分主板「手」/ 科创板「股」）
--   成交额    : 元，保留上游两位小数（不再做「万元取整」的有损写入）
--   market_cap: 万元（与存量一致），历史行一律 NULL（上游不提供，绝不估算）
--
-- 分区：PARTITION BY RANGE (trade_date)，按自然年
-- 幂等：PRIMARY KEY (stock_id, trade_date) + ON CONFLICT DO NOTHING
-- ============================================================================
CREATE TABLE daily_quotes_hist (
    stock_id        integer       NOT NULL,
    trade_date      date          NOT NULL,

    -- ---- 价格（不复权，元/股）----
    open_price      numeric(10,2) NOT NULL,
    high_price      numeric(10,2) NOT NULL,
    low_price       numeric(10,2) NOT NULL,
    close_price     numeric(10,2) NOT NULL,
    prev_close      numeric(10,2),

    -- ---- 量额（股 / 元）----
    volume_shares   bigint        NOT NULL,
    turnover_cny    numeric(20,2) NOT NULL,

    -- ---- 派生（由同一条不复权序列内部计算，无上游则不写）----
    change_amount   numeric(10,2),
    change_percent  numeric(8,4),
    amplitude       numeric(8,4),
    turnover_rate   numeric(8,4),

    -- ---- 估值（历史行恒 NULL）----
    market_cap_wan  numeric(20,2),
    pe_ratio        double precision,
    pb_ratio        double precision,

    -- ---- 口径与血缘（防止三类事故复发，强制 NOT NULL）----
    price_adj       char(1)       NOT NULL DEFAULT 'N',   -- N=不复权 / Q=前复权 / H=后复权
    price_source    varchar(16)   NOT NULL DEFAULT 'tencent_bfq',
    amount_source   varchar(16)   NOT NULL DEFAULT 'ths',
    ingested_at     timestamptz   NOT NULL DEFAULT now(),

    -- ================= 约束 =================
    CONSTRAINT dqh_pkey PRIMARY KEY (stock_id, trade_date),
    CONSTRAINT dqh_stock_fk FOREIGN KEY (stock_id) REFERENCES stocks(id) ON DELETE CASCADE,

    -- 复权口径：本表只允许不复权。要存 qfq/hfq 必须新建列或新表，不在此开后门。
    CONSTRAINT dqh_price_adj_raw_only CHECK (price_adj = 'N'),

    -- 价格自洽：正数、高低夹住开收
    CONSTRAINT dqh_price_positive CHECK (
        open_price > 0 AND high_price > 0 AND low_price > 0 AND close_price > 0),
    CONSTRAINT dqh_hl_order  CHECK (high_price >= low_price),
    CONSTRAINT dqh_high_cap CHECK (high_price >= open_price AND high_price >= close_price),
    CONSTRAINT dqh_low_floor CHECK (low_price  <= open_price AND low_price  <= close_price),

    -- 量额非负
    CONSTRAINT dqh_volume_nonneg CHECK (volume_shares >= 0),
    CONSTRAINT dqh_turnover_nonneg CHECK (turnover_cny >= 0),

    -- 量额互校：隐含均价必须落在 0.01 ~ 100000 元/股
    --   作用：拦「元 ↔ 万元」10000 倍错位、拦「手 ↔ 股」100 倍错位的大头
    --   说明：这是护栏不是证明；真正的证明是「源字段原样搬运 + 对拍」（见 §5.4）
    CONSTRAINT dqh_amount_volume_ratio CHECK (
        volume_shares = 0
        OR (turnover_cny >= volume_shares * 0.01
            AND turnover_cny <= volume_shares * 100000)),

    CONSTRAINT dqh_pct_range CHECK (
        change_percent IS NULL OR (change_percent BETWEEN -100 AND 200))
);

COMMENT ON TABLE  daily_quotes_hist IS
  '日线历史深档。价格=不复权(元/股)，成交量=股，成交额=元。与 daily_quotes（元/万元/手&股混用）的口径映射见 docs/harness/KLINE-STORAGE-DESIGN.md §5/§7。';
COMMENT ON COLUMN daily_quotes_hist.price_adj      IS 'N=不复权。本表 CHECK 只允许 N；存复权数据必须新建列/新表。';
COMMENT ON COLUMN daily_quotes_hist.volume_shares   IS '成交量，单位【股】（= 手 × 100）。统一后不再有主板/科创板单位分裂。';
COMMENT ON COLUMN daily_quotes_hist.turnover_cny    IS '成交额，单位【元】（上游两位小数原样）。不做万元取整。';
COMMENT ON COLUMN daily_quotes_hist.market_cap_wan  IS '总市值，单位【万元】（与 stocks.market_cap 一致）。历史行恒 NULL。';

-- ================= 分区（按自然年）=================
CREATE TABLE daily_quotes_hist_2022 PARTITION OF daily_quotes_hist
    FOR VALUES FROM ('2022-01-01') TO ('2023-01-01');
CREATE TABLE daily_quotes_hist_2023 PARTITION OF daily_quotes_hist
    FOR VALUES FROM ('2023-01-01') TO ('2024-01-01');
CREATE TABLE daily_quotes_hist_2024 PARTITION OF daily_quotes_hist
    FOR VALUES FROM ('2024-01-01') TO ('2025-01-01');
CREATE TABLE daily_quotes_hist_2025 PARTITION OF daily_quotes_hist
    FOR VALUES FROM ('2025-01-01') TO ('2026-01-01');
CREATE TABLE daily_quotes_hist_2026 PARTITION OF daily_quotes_hist
    FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');

-- 兜底分区：写入超出已建年份时不至于整批失败（运维应按下表及时补建）
CREATE TABLE daily_quotes_hist_default PARTITION OF daily_quotes_hist DEFAULT;

-- ================= 索引 =================
-- (a) 单标的按日期区间取 K 线 —— 全表最高频（存量同类索引 3.39 亿次扫描中的 2,948 万次）
--     走分区表的主键即可：PRIMARY KEY (stock_id, trade_date) 天然覆盖
--     `WHERE stock_id = ? AND trade_date BETWEEN ? AND ?`
--     ⇒ 无需再建 idx(stock_id, trade_date)。存量里那条独立索引是纯冗余。

-- (b) 全市场按某交易日聚合（截面查询：涨幅榜、广度、板块统计）
--     用 BRIN 而非 btree：按年分区后每个分区约 130 万行、物理上按 trade_date 近似有序，
--     BRIN 一个分区只占几十 KB，而 btree(trade_date) 要 ~15 MB/年。
CREATE INDEX dqh_date_brin ON daily_quotes_hist USING brin (trade_date)
    WITH (pages_per_range = 32);

-- (c) 行业/板块截面（stocks join 后按行业聚合）走 stocks 侧索引，本表不建。
```

> **为什么不在 `daily_quotes_hist` 上留自增 `id`**：存量 `daily_quotes` 的 `daily_quotes_pkey`
> 占 17 MB，`idx_scan` 仅 84,047 次（基本来自 FK 校验），是纯负担。复合主键 `(stock_id, trade_date)`
> 同时充当「唯一键」与「单标的区间扫描索引」，一石二鸟。

---

## 3. 分区策略：按年，还是按月？

**结论：按自然年 `PARTITION BY RANGE (trade_date)`。**

量化依据：

| 量级 | 数值 |
|---|---|
| 全市场单日行数 | 5,200（实测 5,182~5,199） |
| 单年交易日 | ~243（A 股年均） |
| **单年行数** | **≈ 1.26 M 行** |
| 单行堆占用 [估] | ~140 B（见 §4） |
| **单年分区堆大小** | **≈ 180 MB** |
| 单年分区索引（PK） | ≈ 50 MB |
| 单年分区索引（BRIN） | < 0.1 MB |

- **按月**：单分区 105k 行 / ~15 MB。5 年 = 60 个分区 → 60 张表 + 60 个 PK 索引 + 60 个 BRIN，
  规划器每次查询要做 60 路 Append 剪枝，`pg_class`/`pg_attribute` 元数据膨胀，收益（省 IO）相对于
  全市场按日聚合的扫描量（一天 5,200 行 = 一次分区扫描 1/243）没有额外增益。**过度分区**。
- **按年**：5 年 5 个分区。典型查询：
  - 单标的 3 年 K 线 → 命中 3 个分区，每分区内 PK 区间扫描，剪枝后只读几千行；
  - 全市场按日 → 只命中 1 个分区（剪掉 4/5）；
  - 5 年全量因子回算 → 顺序扫 5 个分区，与不分区等价（无惩罚）。
- **按年还带来「退休即 DETACH」**：A 股量化常用 5 年窗口，超窗口的年份 `ALTER TABLE ... DETACH PARTITION`
  后归档到冷存储，主表体积恒定 —— 这是按月也给不了的运维收益（按月退休粒度太细，一年要 DETACH 12 次）。

**边界处理**：建了 `_default` 兜底分区，防止「上游给到 2027 年数据」时整批 INSERT 因无匹配分区而失败。
运维约定：每自然年初补建下一年分区，补建后把 `_default` 中该年的行 `INSERT ... SELECT` 迁入并 `DELETE`。

---

## 4. 空间估算

### 4.1 实测基线（存量 `daily_quotes`，529,453 行）

| 项 | 实测 |
|---|---|
| 平均行字节（`avg(pg_column_size(t))`） | **132 B** |
| 堆 | 77 MB → **152 B/行**（含死元组与页内空隙） |
| 索引合计 | 53 MB → **102 B/行** |
| `pg_total_relation_size` | **131 MB** → **259 B/行** |
| 数据库总大小 | 152 MB |

存量索引明细（这是"可省"的地方）：

| 索引 | 大小 | idx_scan | 判定 |
|---|---|---|---|
| `daily_quotes_pkey` (id) | 17 MB | 84,047 | 代理主键，仅 FK 校验用 → **新表删除** |
| `daily_quotes_stock_id_trade_date_key` | 15 MB | 29,478,915 | 真主力 → **新表作为 PK 保留** |
| `idx_daily_quotes_stock_date` | 16 MB | 3,392,804 | 前缀与上一条完全相同 → **纯冗余，新表不建** |
| `idx_daily_quotes_date` | 5.9 MB | 18,701 | 截面查询需要 → **新表用 BRIN 代替（省 99%）** |

### 4.2 新表单行估算 [估]

| 组成 | 字节 |
|---|---|
| 元组头 23 → 对齐 | 24 |
| `stock_id` int4 + `trade_date` date | 8 |
| 5×`numeric(10,2)` 价格 + `prev_close` | 6 × 9 = 54 |
| `volume_shares` int8 | 8 |
| `turnover_cny` numeric(20,2) | 10 |
| 派生 3×numeric(8,4) + numeric(10,2) | 6×3 + 9 = 27 |
| `price_adj` char(1) + 2×varchar(16) + timestamptz | 2 + ~12 + 8 = 22 |
| 3 个估值列（历史恒 NULL，只占空位图） | ~1 |
| 对齐到 8 的倍数 | → **~152 B** |
| 页内开销（fillfactor≈100，8192B 页） | 实际 **~140~150 B/行** |

索引：PK `(stock_id, trade_date)` ≈ 40 B/行摊薄；BRIN ≈ 0.05 B/行。
**新表合计 ≈ 190 B/行**（vs 存量 259 B/行）→ **省 ~27%**。

### 4.3 1 / 3 / 5 年体积

| 年限 | 行数 | 旧结构（259 B/行） | **新结构（190 B/行）** | 差额 |
|---|---|---|---|---|
| 1 年 | 1.26 M | 326 MB | **239 MB** | −87 MB |
| 3 年 | 3.78 M | 979 MB | **718 MB** | −261 MB |
| 5 年 | 6.30 M | 1.63 GB | **1.20 GB** | −435 MB |

### 4.4 「不加分区」vs「按年分区」的体积差

| 项 | 不分区 | 按年分区（5 年） |
|---|---|---|
| 堆 | 1.13 GB | 1.13 GB |
| PK 索引 | 252 MB | 252 MB（每分区各 50 MB，合计相同） |
| BRIN | ~0.3 MB | ~0.3 MB |
| 分区路由/元数据开销 | 0 | +极少量（5 行 `pg_class`/`pg_inherits`，< 10 KB） |
| **合计** | **~1.38 GB** | **~1.38 GB（+1~3% 碎片差异）** |

**诚实结论：分区不省空间，甚至略增 1~3%（每个分区独立建索引，页尾填充更多）。**

### 4.5 实测校准（pilot 回填 587,683 行后回填，见 PILOT 报告）

| 项 | 设计估算 | **实测** |
|---|---|---|
| 平均行字节 `avg(pg_column_size)` | ~152 B | **151.0 B** |
| 堆 | ~140~150 B/行 | 88 MB / 587,683 = **157 B/行** |
| 索引 | ~40 B/行 | 16 MB / 587,683 = **28.5 B/行** |
| 合计 | ~190 B/行 | 104 MB / 587,683 = **185 B/行** |

实测比估算**更低**（索引 28.5 B/行 vs 估 40），原因是 PK 索引页填充优于预期。
按 185 B/行重算：1 年 1.26 M 行 ≈ **233 MB**，3 年 ≈ 700 MB，5 年 ≈ **1.16 GB**（与 §4.3 一致）。

- **省空间的是三件事**：砍掉冗余索引（−102 B/行 → −40 B/行）、砍掉代理主键、把 `numeric(20,2)` 的
  `turnover` 换成不再做万元取整的精确值（字节数不变，但语义损失消失）。
- **分区省的不是空间，是三样东西**：① 截面查询的 IO 放大（剪枝 4/5）；② 数据退休成本（DETACH）；
  ③ VACUUM/ANALYZE 的锁粒度（1.2 M 行/分区 vs 6.3 M 行整表）。

如果目标是**极致省空间**，还能再走两步（本轮不做，记录备选）：
1. `CLUSTER`/`ORDER BY stock_id, trade_date` 让 PK 索引失去必要性（堆本身有序），再省 252 MB/5 年；
   代价是新写入要重排，不适合日更表。
2. 价格改 `integer` 存「分」（×100），5 个价格列 54 B → 20 B，省 ~34 B/行 ≈ 214 MB/5 年；
   代价是所有下游算术要 ÷100，改造面大，收益不抵风险。

---

## 5. 口径与约束：如何在表结构层面焊死三类事故

三类历史事故：**① 元/万元错位 ② 手/股错位 ③ 复权/不复权混用**。逐条给结构性防护：

### 5.1 显式字段名（第一道防线：名字即单位）

| 现在（隐晦） | 新表（显式） |
|---|---|
| `turnover`（元？万元？） | `turnover_cny`（后缀 `_cny` = 元） |
| `volume`（手？股？） | `volume_shares`（后缀 `_shares` = 股） |
| `market_cap`（万元？亿？） | `market_cap_wan`（后缀 `_wan` = 万元） |
| 无复权标记 | `price_adj char(1)` NOT NULL |

后缀命名让「写错单位」从「运行期静默出错」变成「读代码的人一眼看出来」。
`rg "turnover_cny"` 能直接列出全部使用点。

### 5.2 CHECK 约束（第二道防线：写错就写不进）

| 事故 | 对应 CHECK | 说明 |
|---|---|---|
| 复权/不复权混用 | `CHECK (price_adj = 'N')` | **只允许不复权**。要存 qfq/hfq 必须新建列或新表，本表无后门。这是最强的一条：qfq 数据**物理上无法**写进本表。 |
| 元↔万元（10000×） | `dqh_amount_volume_ratio`：隐含均价 ∈ [0.01, 100000] 元 | 若把「万元」当「元」写入，隐含均价被放大 10000×，绝大多数标的会突破 100000 上限被拒。 |
| 手↔股（100×） | 同上 | 若 volume 错按「手」写入，隐含均价放大 100×；对股价 >1000 元的标的会被拒（如茅台 1400 → 140000 越界）。属部分覆盖。 |
| 负值/0 顶替 | `volume_shares >= 0`、`turnover_cny >= 0`、价格 > 0 | 拦「用 0 顶替缺失」。 |
| OHLC 不自洽 | `dqh_hl_order` / `dqh_high_cap` / `dqh_low_floor` | 拦错位/串行。 |

**这些 CHECK 是护栏，不是证明。** 它们只能拦住「数量级错位」，拦不住「同量级的口径漂移」
（例如整段复权因子差 2%，量级没变）。真正的证明只能是 §5.4 的对拍。

### 5.3 注释即文档（第三道防线）

`COMMENT ON TABLE/COLUMN`（见 DDL）把单位写进 `\d+ daily_quotes_hist` 的输出里。
任何人 `psql -c "\d+ daily_quotes_hist"` 就能看到单位，不需要翻代码、翻文档。

### 5.4 唯一真正的证明：源字段原样搬运 + 逐字段对拍

- **价格/成交量**：腾讯 `bfq` 的 OHLCV 五元组**逐字节照搬**，脚本内**不做任何乘除**。
  唯一允许的变形是 `volume_shares = raw × 100`（主板手→股）这一个**显式、具名、单点**的换算，
  且换算前后都用「库内存量行」验证过（688 反例证明不能一刀切 ×100，故按板块分支）。
- **成交额**：同花顺 `成交额(元)` 原样存，不做万元取整。
- **验证**：回填后随机抽标的 × 随机交易日，与上游原始报文逐字段比对，误差必须为 0（报告见 `KLINE-BACKFILL-PILOT.md`）。

### 5.5 关于 `market_cap_wan` / `pe_ratio` / `pb_ratio`

历史行上游不提供 → **一律 NULL**。禁止用「最新市值反推」或「股价×股本」估算填充：
那是造数。列可空是刻意设计，下游必须判空（这也是本表不在这些列上加 NOT NULL 的原因）。

---

## 6. 写入幂等

### 6.1 唯一键

`PRIMARY KEY (stock_id, trade_date)` —— 分区表的主键必须包含分区键 `trade_date`，此处天然满足。

### 6.2 三种 upsert 写法

**(a) 回填默认：`DO NOTHING`（绝不覆盖已有行）**

```sql
INSERT INTO daily_quotes_hist
  (stock_id, trade_date, open_price, high_price, low_price, close_price, prev_close,
   volume_shares, turnover_cny, change_amount, change_percent, amplitude, turnover_rate,
   price_adj, price_source, amount_source)
VALUES
  (:stock_id, :trade_date, :open, :high, :low, :close, :prev_close,
   :volume_shares, :turnover_cny, :chg, :chg_pct, :amp, :turn_rate,
   'N', 'tencent_bfq', 'ths')
ON CONFLICT (stock_id, trade_date) DO NOTHING;
```

配合 `INSERT ... SELECT ... RETURNING` 数不回 `xmax=0` 的行数即可统计「实际新增 vs 已存在」：

```sql
-- 统计本批真正写入的行数（DO NOTHING 时 RETURNING 只返回真正插入的行）
WITH ins AS (
  INSERT INTO daily_quotes_hist (...) VALUES (...) ON CONFLICT DO NOTHING
  RETURNING 1
) SELECT count(*) FROM ins;
```

**(b) 显式修复：`DO UPDATE`（仅当 `--overwrite` 且 `ingested_at` 更旧时才覆盖，防止旧数据盖新数据）**

```sql
ON CONFLICT (stock_id, trade_date) DO UPDATE
  SET open_price = EXCLUDED.open_price,
      high_price = EXCLUDED.high_price,
      low_price  = EXCLUDED.low_price,
      close_price= EXCLUDED.close_price,
      volume_shares = EXCLUDED.volume_shares,
      turnover_cny  = EXCLUDED.turnover_cny,
      price_adj  = EXCLUDED.price_adj,
      ingested_at = now()
  WHERE daily_quotes_hist.ingested_at < now() - interval '1 day';
```

`WHERE` 子句让重跑（同一批数据）不再触发实际写，避免无谓的 WAL / 死元组。

**(c) 批量：单语句多值 + 单事务**

每只标的 730 根 K 线装进一条 `INSERT ... VALUES (...),(...)`（约 730 × 17 个占位符），
一个事务内提交该标的全部年份。单标的失败整只回滚，不会留下半截序列。
不用 `COPY`：`COPY` 不支持 `ON CONFLICT`，与幂等冲突。

### 6.3 断点续传（与幂等正交的两件事）

| 机制 | 作用 |
|---|---|
| `ON CONFLICT DO NOTHING` | 保证「重复写不产生重复行」（**不重复**） |
| checkpoint 文件（每标的处理完即落盘） | 保证「kill 后不从头再跑」（**不跳段**的前提是 checkpoint 只在成功提交后写） |
| 启动时 `--recheck` 从库内反查 | 校验 checkpoint 与库内行数一致；不一致的标的重新处理（**不跳段**的兜底） |

链路：`拉上游 → 全量解析入内存 → 单事务 INSERT → 提交 → 写 checkpoint`。
checkpoint 写在提交**之后**，所以「已 checkpoint」必然意味着「已入库」；
反过来「未 checkpoint 但已入库」会被 `ON CONFLICT DO NOTHING` 吃掉，不会重复。

---

## 7. 与现存代码的衔接（最小改动）

### 7.1 现状读法

`backend/src/services/Database.ts` 等直接 `SELECT ... FROM daily_quotes WHERE stock_id = ? AND trade_date BETWEEN ? AND ?`，
假设 `turnover` 元、`volume` 手、价格不复权。

### 7.2 方案：兼容视图（Reader 零改动）

```sql
-- 把 daily_quotes_hist 投影回「存量口径」，供老读者无缝切换
CREATE OR REPLACE VIEW v_daily_quotes_all AS
-- 历史深档：单位回退到存量口径
SELECT
    h.stock_id,
    h.trade_date,
    h.open_price, h.high_price, h.low_price, h.close_price,
    -- 股 → 手（主板/创业板）；科创板存量本来就是股，保持股，避免改变老读者的计算结果
    CASE WHEN s.code LIKE '688%' THEN h.volume_shares
         ELSE h.volume_shares / 100 END              AS volume,
    -- 元 → 元，但回退成存量的「万元取整」精度，保证与热表数值可直接比较
    round(h.turnover_cny / 10000) * 10000            AS turnover,
    h.change_amount, h.change_percent, h.amplitude, h.turnover_rate,
    h.market_cap_wan AS market_cap,
    h.pe_ratio, h.pb_ratio,
    'hist'::text AS _src
  FROM daily_quotes_hist h
  JOIN stocks s ON s.id = h.stock_id
UNION ALL
-- 近期热表：原样
SELECT
    q.stock_id, q.trade_date,
    q.open_price, q.high_price, q.low_price, q.close_price,
    q.volume, q.turnover,
    q.change_amount, q.change_percent, q.amplitude, q.turnover_rate,
    q.market_cap, q.pe_ratio, q.pb_ratio,
    'live'::text AS _src
  FROM daily_quotes q;
```

**冲突处理**：同一 `(stock_id, trade_date)` 可能两边都有（回填 3 年必然覆盖热表的 2026 年区间）。
视图里 `UNION ALL` 会出重复行，因此**必须二选一**。生产上推荐：

```sql
-- 变体：热表优先（热表口径已修复且更"新"，历史表只补热表没有的日期）
CREATE OR REPLACE VIEW v_daily_quotes_all AS
SELECT ... FROM daily_quotes
UNION ALL
SELECT ... FROM daily_quotes_hist h
 WHERE NOT EXISTS (SELECT 1 FROM daily_quotes q
                    WHERE q.stock_id = h.stock_id AND q.trade_date = h.trade_date);
```

`NOT EXISTS` 在 `daily_quotes` 上有 PK 可用，单标的区间扫描代价可忽略。

### 7.3 阅读侧改动量

| 位置 | 改动 | 风险 |
|---|---|---|
| `Database.ts` 的取 K 线方法 | `FROM daily_quotes` → `FROM v_daily_quotes_all`（1 处字符串） | 极低；列名与单位完全不变 |
| 其他 `FROM daily_quotes` 的读查询 | 同上（逐处确认是否需要历史） | 低 |
| **写路径（采集器）** | **不改**，继续写 `daily_quotes` | 零 |

**本轮不改任何 Reader**：pilot 只验证「存储 + 回填 + 校验」链路。视图随 DDL 一起建好，
Reader 切换作为独立的、可灰度的一步，由 team-lead 决策（切换前必须先跑 §7.2 变体的行数/口径对拍）。

### 7.5 ⚠️ 切换前必须先做的清污（阻断项）

由 §0.2 实测，存量里 **11/799 只（1.38%）标的仍是 qfq**。视图 `v_daily_quotes_all` 在这 11 只上会
把「bfq 历史」和「qfq 近期」缝在一起，除权分界处产生 **6.96 ~ 271.32 元/股**的假跳空
（002594 最大 271.32），任何收益率 / 波动率 / 均线都会被污染。

**阻断条件**：`daily_quotes` 中这 11 只标的的行必须先重写为 bfq（可直接用 `daily_quotes_hist` 覆盖，
口径唯一、来源可追溯），才允许切换 Reader。清单：

```
002594.SZ 300308.SZ 600519.SH 300750.SZ 601398.SH 601288.SH
601939.SH 600941.SH 000001.SZ 688111.SH 688036.SH
```

判定 SQL（切换前必须返回 0）：

```sql
SELECT count(*) AS contaminated_symbols
  FROM (
    SELECT h.stock_id
      FROM daily_quotes_hist h
      JOIN daily_quotes q ON q.stock_id = h.stock_id AND q.trade_date = h.trade_date
     GROUP BY h.stock_id
    HAVING sum(CASE WHEN h.close_price <> q.close_price THEN 1 ELSE 0 END) > 0
  ) t;
```

覆盖脚本建议（**本轮不执行**，需 team-lead 批准；执行前照例 `pg_dump -t daily_quotes`）：

```sql
UPDATE daily_quotes q
   SET open_price = h.open_price, high_price = h.high_price,
       low_price  = h.low_price,  close_price = h.close_price,
       volume     = CASE WHEN s.code LIKE '688%' OR s.code LIKE '689%'
                         THEN h.volume_shares ELSE h.volume_shares / 100 END,
       turnover   = round(h.turnover_cny / 10000) * 10000
  FROM daily_quotes_hist h
  JOIN stocks s ON s.id = h.stock_id
 WHERE q.stock_id = h.stock_id
   AND q.trade_date = h.trade_date
   AND s.symbol IN ('002594.SZ','300308.SZ','600519.SH','300750.SZ','601398.SH',
                    '601288.SH','601939.SH','600941.SH','000001.SZ','688111.SH','688036.SH');
```

### 7.4 一个必须提前说清的坑

`daily_quotes.volume` 主板是手、科创板是股。任何「按体积/换手横向排序」的跨板块聚合
（如 `ORDER BY volume DESC` 全市场榜）在存量数据上**本身就是错的**（科创板被低估 100 倍）。
新表统一为股后可修正，但**修正会改变既有榜单结果**，属于产品可见变更 → 不在本轮范围，只做记录。

---

## 8. 结论摘要

1. **新建** `daily_quotes_hist`，不原地改造 `daily_quotes`（爆炸半径理由，§1）。
2. **按年 RANGE 分区**，单年 1.26 M 行 / ~180 MB，5 年 5 个分区；按月是过度分区（§3）。
3. **索引只要两个**：PK `(stock_id, trade_date)` 覆盖单标的区间；`BRIN(trade_date)` 覆盖截面聚合。
   存量 4 个索引（53 MB / 102 B/行）砍到 2 个（~40 B/行），**省 60% 索引空间**（§4.1）。
4. **体积**：190 B/行 vs 存量 259 B/行，5 年 1.20 GB vs 1.63 GB，**省 27%**。
   「分区 vs 不分区」体积几乎一样，分区省的是 IO 放大与退休成本（§4.4）。
5. **口径防护三层**：显式字段名（`turnover_cny` / `volume_shares` / `price_adj`）
   + CHECK（`price_adj='N'` 物理焊死不复权、量额隐含均价范围拦 10000× / 100× 错位）
   + COMMENT 进 `\d+`（§5）。
6. **幂等**：`PK + ON CONFLICT DO NOTHING`，checkpoint 在事务提交后写（§6）。
7. **衔接**：`v_daily_quotes_all` 兼容视图，Reader 改 1 处字符串；本轮不改 Reader（§7）。

---

## 附：DDL 执行记录

见 `docs/harness/KLINE-BACKFILL-PILOT.md`（建表时间、分区清单、回填耗时、校验结果、备份路径）。
