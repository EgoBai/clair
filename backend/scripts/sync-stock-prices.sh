#!/bin/bash
# 更新stocks表的最新价格（从daily_quotes同步）
# 建议每5分钟运行一次（与DataSync同步）

PGPASSWORD=postgres psql -h localhost -U postgres -d clair -c "
UPDATE stocks SET 
  current_price = dq.close_price,
  change_amount = dq.change_amount,
  change_percent = dq.change_percent,
  volume = dq.volume,
  turnover = dq.turnover,
  high_price = dq.high_price,
  low_price = dq.low_price,
  open_price = dq.open_price,
  market_cap = dq.market_cap,
  turnover_rate = dq.turnover_rate
FROM (
  SELECT DISTINCT ON (stock_id) 
    stock_id, close_price, change_amount, change_percent, 
    volume, turnover, high_price, low_price, open_price, 
    market_cap, turnover_rate
  FROM daily_quotes 
  ORDER BY stock_id, trade_date DESC
) dq
WHERE stocks.id = dq.stock_id AND stocks.is_active = true;
" 2>&1 | grep -E "UPDATE|ERROR"
