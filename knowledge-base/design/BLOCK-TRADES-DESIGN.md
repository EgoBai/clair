# 大宗交易设计文档

## 概述
大宗交易是指达到规定的最低限额的证券单笔买卖申报，买卖双方经过协议达成一致并经交易所确定成交的证券交易。

## 数据模型

### BlockTrade
| 字段 | 类型 | 说明 |
|------|------|------|
| id | number | 记录ID |
| symbol | string | 股票代码 |
| name | string | 股票名称 |
| tradeDate | string | 交易日期 |
| price | number | 成交价 |
| closePrice | number | 收盘价 |
| volume | number | 成交量（股）|
| amount | number | 成交金额 |
| discount | number | 折溢价率（%）|
| buyer | string | 买方营业部 |
| seller | string | 卖方营业部 |

### 折溢价率计算
```
discount = (成交价 - 收盘价) / 收盘价 × 100
```
- 正值 = 溢价成交（买方看好）
- 负值 = 折价成交（可能有套利或减持压力）

## API 设计

| 端点 | 方法 | 说明 |
|------|------|------|
| /api/block-trades | GET | 大宗交易列表（支持日期/股票筛选） |
| /api/block-trades/overview | GET | 今日概览统计 |
| /api/block-trades/:symbol | GET | 个股历史 |

## 可视化方案

### 统计卡片
- 成交笔数、总成交额、平均折溢价率
- 溢价/折价分布进度条

### 表格
- 金银铜排名、涨跌着色
- 折溢价率标签（红涨绿跌）
- 营业部名称 Tooltip 截断

## 参考
- 东方财富大宗交易数据
- 数据缓存 5 分钟
