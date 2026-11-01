-- ============================================================================
-- daily_quotes_hist：日线历史深档（不复权）
-- 设计说明：docs/harness/KLINE-STORAGE-DESIGN.md
--
-- 口径：
--   价格       不复权（原始成交价），元/股。CHECK (price_adj='N') 物理拒绝 qfq/hfq
--   成交量     股（统一，不再有主板「手」/科创板「股」的分裂）
--   成交额     元（上游两位小数原样，不做万元取整）
--   market_cap 万元；历史行一律 NULL（上游不提供，禁止估算）
--
-- 幂等：PRIMARY KEY (stock_id, trade_date) + ON CONFLICT DO NOTHING
-- 分区：PARTITION BY RANGE (trade_date)，按自然年
--
-- 幂等执行：本文件可重复执行（IF NOT EXISTS）
-- ============================================================================

CREATE TABLE IF NOT EXISTS daily_quotes_hist (
    stock_id        integer       NOT NULL,
    trade_date      date          NOT NULL,

    -- 价格（不复权，元/股）
    open_price      numeric(10,2) NOT NULL,
    high_price      numeric(10,2) NOT NULL,
    low_price       numeric(10,2) NOT NULL,
    close_price     numeric(10,2) NOT NULL,
    prev_close      numeric(10,2),

    -- 量额（股 / 元）
    volume_shares   bigint        NOT NULL,
    turnover_cny    numeric(20,2) NOT NULL,

    -- 派生（同一条不复权序列内部计算；无上游则 NULL）
    change_amount   numeric(10,2),
    change_percent  numeric(8,4),
    amplitude       numeric(8,4),
    turnover_rate   numeric(8,4),

    -- 估值（历史行恒 NULL）
    market_cap_wan  numeric(20,2),
    pe_ratio        double precision,
    pb_ratio        double precision,

    -- 口径与血缘
    price_adj       char(1)       NOT NULL DEFAULT 'N',
    price_source    varchar(16)   NOT NULL DEFAULT 'tencent_bfq',
    amount_source   varchar(16)   NOT NULL DEFAULT 'ths',
    ingested_at     timestamptz   NOT NULL DEFAULT now(),

    CONSTRAINT dqh_pkey PRIMARY KEY (stock_id, trade_date),
    CONSTRAINT dqh_stock_fk FOREIGN KEY (stock_id) REFERENCES stocks(id) ON DELETE CASCADE,

    CONSTRAINT dqh_price_adj_raw_only CHECK (price_adj = 'N'),

    CONSTRAINT dqh_price_positive CHECK (
        open_price > 0 AND high_price > 0 AND low_price > 0 AND close_price > 0),
    CONSTRAINT dqh_hl_order  CHECK (high_price >= low_price),
    CONSTRAINT dqh_high_cap CHECK (high_price >= open_price AND high_price >= close_price),
    CONSTRAINT dqh_low_floor CHECK (low_price  <= open_price AND low_price  <= close_price),

    CONSTRAINT dqh_volume_nonneg CHECK (volume_shares >= 0),
    CONSTRAINT dqh_turnover_nonneg CHECK (turnover_cny >= 0),

    -- 量额互校：隐含均价必须落在 0.01 ~ 100000 元/股
    CONSTRAINT dqh_amount_volume_ratio CHECK (
        volume_shares = 0
        OR (turnover_cny >= volume_shares * 0.01
            AND turnover_cny <= volume_shares * 100000)),

    CONSTRAINT dqh_pct_range CHECK (
        change_percent IS NULL OR (change_percent BETWEEN -100 AND 200))
) PARTITION BY RANGE (trade_date);

COMMENT ON TABLE  daily_quotes_hist IS
  '日线历史深档。价格=不复权(元/股)，成交量=股，成交额=元。与 daily_quotes（元/万元/手&股混用）的映射见 docs/harness/KLINE-STORAGE-DESIGN.md §5/§7。';
COMMENT ON COLUMN daily_quotes_hist.price_adj     IS 'N=不复权。本表 CHECK 只允许 N；存复权数据必须新建列/新表。';
COMMENT ON COLUMN daily_quotes_hist.volume_shares IS '成交量，单位【股】（= 手 × 100）。统一后不再有主板/科创板单位分裂。';
COMMENT ON COLUMN daily_quotes_hist.turnover_cny  IS '成交额，单位【元】（上游两位小数原样）。不做万元取整。';
COMMENT ON COLUMN daily_quotes_hist.market_cap_wan IS '总市值，单位【万元】（与 stocks.market_cap 一致）。历史行恒 NULL。';
COMMENT ON COLUMN daily_quotes_hist.price_source  IS '价格/成交量来源。tencent_bfq = 腾讯 fqkline bfq（不复权）。';
COMMENT ON COLUMN daily_quotes_hist.amount_source IS '成交额来源。ths = 同花顺 v6/line（成交额与复权口径无关，可跨源）。';

-- 分区（按自然年）
CREATE TABLE IF NOT EXISTS daily_quotes_hist_2018 PARTITION OF daily_quotes_hist FOR VALUES FROM ('2018-01-01') TO ('2019-01-01');
CREATE TABLE IF NOT EXISTS daily_quotes_hist_2019 PARTITION OF daily_quotes_hist FOR VALUES FROM ('2019-01-01') TO ('2020-01-01');
CREATE TABLE IF NOT EXISTS daily_quotes_hist_2020 PARTITION OF daily_quotes_hist FOR VALUES FROM ('2020-01-01') TO ('2021-01-01');
CREATE TABLE IF NOT EXISTS daily_quotes_hist_2021 PARTITION OF daily_quotes_hist FOR VALUES FROM ('2021-01-01') TO ('2022-01-01');
CREATE TABLE IF NOT EXISTS daily_quotes_hist_2022 PARTITION OF daily_quotes_hist FOR VALUES FROM ('2022-01-01') TO ('2023-01-01');
CREATE TABLE IF NOT EXISTS daily_quotes_hist_2023 PARTITION OF daily_quotes_hist FOR VALUES FROM ('2023-01-01') TO ('2024-01-01');
CREATE TABLE IF NOT EXISTS daily_quotes_hist_2024 PARTITION OF daily_quotes_hist FOR VALUES FROM ('2024-01-01') TO ('2025-01-01');
CREATE TABLE IF NOT EXISTS daily_quotes_hist_2025 PARTITION OF daily_quotes_hist FOR VALUES FROM ('2025-01-01') TO ('2026-01-01');
CREATE TABLE IF NOT EXISTS daily_quotes_hist_2026 PARTITION OF daily_quotes_hist FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');
CREATE TABLE IF NOT EXISTS daily_quotes_hist_default PARTITION OF daily_quotes_hist DEFAULT;

-- 索引：(a) 单标的区间 → 主键覆盖；(b) 截面聚合 → BRIN
CREATE INDEX IF NOT EXISTS dqh_date_brin ON daily_quotes_hist USING brin (trade_date) WITH (pages_per_range = 32);

-- 兼容视图：把历史表投影回 daily_quotes 的存量口径（热表优先，避免重复行）
CREATE OR REPLACE VIEW v_daily_quotes_all AS
SELECT
    q.id, q.stock_id, q.trade_date,
    q.open_price, q.close_price, q.high_price, q.low_price,
    q.volume, q.turnover, q.change_amount, q.change_percent, q.amplitude, q.turnover_rate,
    q.market_cap, q.pe_ratio, q.pb_ratio,
    'live'::text AS _src
  FROM daily_quotes q
UNION ALL
SELECT
    NULL::integer AS id, h.stock_id, h.trade_date,
    h.open_price, h.close_price, h.high_price, h.low_price,
    CASE WHEN s.code LIKE '688%' OR s.code LIKE '689%' THEN h.volume_shares
         ELSE h.volume_shares / 100 END AS volume,
    round(h.turnover_cny / 10000) * 10000 AS turnover,
    h.change_amount, h.change_percent, h.amplitude, h.turnover_rate,
    h.market_cap_wan AS market_cap, h.pe_ratio, h.pb_ratio,
    'hist'::text AS _src
  FROM daily_quotes_hist h
  JOIN stocks s ON s.id = h.stock_id
 WHERE NOT EXISTS (
    SELECT 1 FROM daily_quotes q2
     WHERE q2.stock_id = h.stock_id AND q2.trade_date = h.trade_date
 );

COMMENT ON VIEW v_daily_quotes_all IS
  'daily_quotes（本期热数据，存量口径）+ daily_quotes_hist（历史深档，回退为存量口径）。热表优先，同一 (stock_id,trade_date) 不重复。';
