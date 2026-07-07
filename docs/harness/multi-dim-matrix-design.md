# 多维矩阵热力图数据模型设计

> 版本: v2.0 | 日期: 2026-07-07 | 用于 DiscoverPage 板块景气矩阵

---

## 一、概述

为 DiscoverPage 的多维景气矩阵构建 **10维度评分模型**，覆盖三类数据源，每个维度 0-10 分，总分 0-100。

### 数据来源三元组

| 分类 | 说明 | 可信度 | 维度数 |
|------|------|--------|--------|
| **A. 市场交易数据** | 可靠 API，原始行情计算 | ⭐⭐⭐⭐⭐ | 4 |
| **B. 计算衍生指标** | 基于交易数据的二级衍生 | ⭐⭐⭐⭐ | 4 |
| **C. 社交媒体估算** | 代理变量/估算值 | ⭐⭐⭐ | 2 |

---

## 二、10维度模型定义

### A 类 — 市场交易数据 (4维度)

#### A1. 资金集中度 (Fund Concentration)
```
中文名: 资金集中度
字段名: fundConcentration
公式:   Top5个股成交额 / 板块总成交额 × 100%
分值:   40%-60% → 10分 (最优区间)
        <40% → 线性递减至0 (过度分散)
        >60% → 线性递减至0 (过度集中)
标签:   [过度集中 / 偏集中 / 分布合理 / 偏分散 / 过度分散]
```

#### A2. 资金回补度 (Fund Recovery)
```
中文名: 资金回补度
字段名: fundRecovery
公式:   近5日均涨幅 - 近20日均涨幅
分值:   正值越大→回补越强
        中期向好(ma20≥0): diff>3→10分, diff>0→8分, diff>-3→6分, else→3分
        中期偏弱(ma20<0): diff>5→9分, diff>2→7分, diff>0→4分, else→1分
标签:   [强势加速 / 温和上行 / 高位整理 / 短期回调 / 强力回补 / 温和反弹 / 弱反弹 / 持续走弱]
```

#### A3. 恐慌度 (Panic Index) ★新
```
中文名: 恐慌度
字段名: panicIndex
公式:   板块内跌幅 >5% 的个股数 / 板块总个股数 × 100%
分值:   panicPct <5% → 10分 (极度冷静)
        5%-10% → 8分
        10%-20% → 6分
        20%-30% → 4分
        30%-40% → 2分
        >40% → 0分 (极度恐慌)
注意:   反向指标——恐慌度越高，分数越低
标签:   [极度冷静 / 冷静 / 轻微恐慌 / 中度恐慌 / 重度恐慌 / 极度恐慌]
```

#### A4. 动摇度 (Volatility Index) ★新
```
中文名: 动摇度
字段名: volIndex
公式:   板块内所有个股当日振幅的标准差
        振幅 = (最高价 - 最低价) / 前收盘价 × 100%
分值:   标准差 <1.5% → 10分 (极度稳定)
        1.5%-2.5% → 8分
        2.5%-4% → 6分
        4%-6% → 4分
        6%-8% → 2分
        >8% → 0分 (剧烈动荡)
标签:   [极度稳定 / 稳定 / 轻微波动 / 动荡 / 剧烈动荡 / 崩盘级波动]
```

### B 类 — 计算衍生指标 (4维度)

#### B1. 拥挤度 (Crowding)
```
中文名: 拥挤度
字段名: crowding
公式:   板块PE在所有行业中的百分位排名
分值:   peRank越低(估值合理)→分数越高
        peRank=0→10分, peRank=1→0分 (线性)
标签:   [估值舒适 / 估值合理 / 轻度拥挤 / 高度拥挤]
```

#### B2. 扩散程度 (Diffusion)
```
中文名: 扩散程度
字段名: diffusion
公式:   收盘价 > MA20 的个股数 / 板块总个股数 × 100%
分值:   >80%→10分, 30-80%线性, <30%→0分
标签:   [全面扩散 / 半数走强 / 龙头拉抬 / 弱势集中]
```

#### B3. 小白指数 (Retail Index) ★已有
```
中文名: 小白指数
字段名: retailIndex
公式:   小市值(<100亿)个股中，换手率环比(月)激增>50%的占比
分值:   surgePct 0→0分, 0.5→10分 (线性，2x映射)
        反向指标: 小白越狂热→分数越低 (散户追高信号)
标签:   [无人问津 / 散户冷淡 / 散户关注 / 散户狂热]
```

#### B4. 宝妈指数 (Mom Index) ★新
```
中文名: 宝妈指数
字段名: momIndex
公式:   低价股(<20元)成交额占板块总成交额的比例，与上月对比的变化
定义:  低价股定义 = latest_price < 20 元
        当月低价成交占比 = sum(low_price_stock_turnover) / sector_total_turnover
        变化 = 当月占比 - 上月占比
分值:   变化 < -5pp → 10分 (资金从低价股撤离→理性)
        -5pp ~ -2pp → 8分
        -2pp ~ +2pp → 6分 (中性)
        +2pp ~ +5pp → 4分
        +5pp ~ +10pp → 2分
        > +10pp → 0分 (资金涌入低价股→散户化)
标签:   [理性配置 / 偏向高价 / 中性分布 / 散户流入 / 明显散户化 / 极度散户化]
```

### C 类 — 社交媒体估算 (2维度)

#### C1. 搜索热度 (Search Heat) ★新
```
中文名: 搜索热度
字段名: searchHeat
数据源: 代理变量 (无真实搜索API)
公式:   (板块关联概念标签数 / 全市场概念标签总数 × 50)
        + (板块近5日涨跌幅绝对值 / 全市场最大涨跌幅 × 50)
说明:   概念标签越多→关注度越高；涨跌幅度越大→搜索越多
分值:   0-20→2分, 20-40→4分, 40-60→6分, 60-80→8分, 80-100→10分
标签:   [无人关注 / 轻微关注 / 中等热度 / 热门关注 / 全网热搜]
```

#### C2. 传播扩散度 (Spread Index) ★新
```
中文名: 传播扩散度
字段名: spreadIndex
公式:   板块内涨停(涨幅≥9.9%)个股数 / 板块总个股数 × 100%
逻辑:   涨停家数越多→传播越广→社交讨论越激烈
分值:   0%→0分, >15%→10分 (线性)
标签:   [无人传播 / 小幅扩散 / 中等传播 / 广泛传播 / 病毒传播]
```

---

## 三、评分矩阵总结

| # | 维度 | 字段 | 类型 | 方向 | 权重 |
|---|------|------|------|------|------|
| A1 | 资金集中度 | fundConcentration | 市场交易 | 中性区间最优 | 1.0 |
| A2 | 资金回补度 | fundRecovery | 市场交易 | 正向 | 1.0 |
| A3 | 恐慌度 | panicIndex | 市场交易 | 反向 | 1.0 |
| A4 | 动摇度 | volIndex | 市场交易 | 反向 | 1.0 |
| B1 | 拥挤度 | crowding | 计算衍生 | 反向 | 1.0 |
| B2 | 扩散程度 | diffusion | 计算衍生 | 正向 | 1.0 |
| B3 | 小白指数 | retailIndex | 计算衍生 | 反向 | 1.0 |
| B4 | 宝妈指数 | momIndex | 计算衍生 | 反向 | 1.0 |
| C1 | 搜索热度 | searchHeat | 社交媒体 | 正向(中性) | 0.5 |
| C2 | 传播扩散度 | spreadIndex | 社交媒体 | 正向(中性) | 0.5 |

> **正向维度**: 值越大→得分越高 (扩散程度、回补度)  
> **反向维度**: 值越大→得分越低 (拥挤度、恐慌度、小白指数、宝妈指数、动摇度)  
> **中性维度**: 适度最优 (资金集中度 40-60%)  
> **中性正向**: 值越大越好但不含反指含义 (搜索热度、传播扩散度)  

---

## 四、API 设计

### 4.1 端点: `GET /api/sectors/:code/multidim-v2`

**请求**: 
```
GET /api/sectors/半导体/multidim-v2
```

**响应结构**:
```typescript
interface MultidimV2Response {
  success: true;
  data: {
    industry: string;
    totalScore: number;        // 0-100
    dimensions: {
      fundConcentration: DimensionScore;  // A1
      fundRecovery:      DimensionScore;  // A2
      panicIndex:        DimensionScore;  // A3
      volIndex:          DimensionScore;  // A4
      crowding:          DimensionScore;  // B1
      diffusion:         DimensionScore;  // B2
      retailIndex:       DimensionScore;  // B3
      momIndex:          DimensionScore;  // B4
      searchHeat:        DimensionScore;  // C1
      spreadIndex:       DimensionScore;  // C2
    };
    metadata: {
      stockCount: number;
      avgPE: number;
      medianPE: number;
      aboveMA20Pct: number;
      top5TurnoverPct: number;
      smallCapTurnoverSurge: number;
      ma5Change: number;
      ma20Change: number;
      panicPct: number;           // 跌幅>5%占比
      volStddev: number;          // 振幅标准差
      lowPriceTurnoverShare: number;   // 低价股成交占比(当月)
      lowPriceTurnoverSharePrev: number; // 低价股成交占比(上月)
      limitUpCount: number;       // 涨停家数
      conceptTagCount: number;    // 关联概念标签数
    };
  };
}

interface DimensionScore {
  score: number;    // 0-10
  label: string;    // 中文标签
  detail: string;   // 计算详情
  rawValue: number; // 原始计算值
}
```

### 4.2 批量端点: `GET /api/sectors/multidim-v2/batch`

```
GET /api/sectors/multidim-v2/batch?codes=半导体,白酒,新能源汽车
```

返回所有请求板块的 v2 数据，支持 DiscoverPage 一次拉取前15板块。

### 4.3 实现文件

```
backend/src/api/sector-multidim-v2.ts   ← 新建 (10维计算)
backend/src/api/sector-multidim.ts      ← 保留 (5维兼容)
```

---

## 五、前端热力图展示方案

### 5.1 展示模式: 矩阵热力图 (Matrix Heatmap)

```
           拥挤度  扩散  集中度  回补  恐慌  动摇  小白  宝妈  搜索  传播
半导体     ████   ████  ████   ████  ████  ████  ████  ████  ████  ████
白酒       ████   ████  ████   ████  ████  ████  ████  ████  ████  ████
新能源     ████   ████  ████   ████  ████  ████  ████  ████  ████  ████
...
```

### 5.2 色彩映射

| 分值 | 颜色 | 语义 |
|------|------|------|
| 0-2 | `#dc2626` (深红) | 危险/极差 |
| 3-4 | `#f97316` (橙) | 警告/偏差 |
| 5-6 | `#eab308` (黄) | 中性/一般 |
| 7-8 | `#22c55e` (绿) | 良好 |
| 9-10 | `#06b6d4` (青) | 优秀 |

### 5.3 技术实现

- 基于现有 `heatmapEngine.ts`，新增 `renderMultiDimMatrix()` 函数
- 使用 ECharts `heatmap` 系列 + `visualMap` 分段
- Tooltip: 悬浮显示维度名、原始值、计算详情
- 支持排序: 按总分/单维度/行业名排序
- 响应式: 桌面横向全宽，移动端可横向滚动

### 5.4 交互设计

1. **点击单元格** → 显示该板块该维度的详细分解
2. **点击行头(板块名)** → 跳转板块详情页 (现有 `openSector()` 行为)
3. **列头排序** → 点击维度名列头按该维度排序
4. **热力筛选** → 顶部滑块筛选总分范围 (如只看>60分的板块)
5. **维度切换** → 可隐藏/显示某些维度列 (节省空间)

### 5.5 组件路径

```
frontend/src/components/MultiDimHeatmap.tsx   ← 新建
frontend/src/utils/heatmapEngine.ts           ← 扩展 renderMultiDimMatrix()
```

---

## 六、计算依赖图

```
daily_quotes (原始数据)
  ├── close_price, change_percent, turnover, turnover_rate
  ├── market_cap, pe_ratio
  ├── high_price, low_price, pre_close
  │
  ├──→ A1 资金集中度: turnover排序, Top5占比
  ├──→ A2 资金回补度: change_percent 5日/20日均值
  ├──→ A3 恐慌度:     change_percent < -5%, 计数
  ├──→ A4 动摇度:     (high-low)/pre_close, 标准差
  │
  ├──→ B1 拥挤度:     pe_ratio, 跨行业百分位
  ├──→ B2 扩散程度:   close_price vs MA20
  ├──→ B3 小白指数:   market_cap<100亿, turnover_rate环比
  └──→ B4 宝妈指数:   close_price<20元, turnover占比环比
      
stocks 表 + concept_tags 表
  ├──→ C1 搜索热度: 概念标签计数 + 涨跌幅代理
  └──→ C2 传播扩散度: change_percent > 9.9%, 计数
```

---

## 七、数据表依赖

| 表 | 字段 | 用途 |
|----|------|------|
| `daily_quotes` | stock_id, trade_date, close_price, change_percent, turnover, turnover_rate, market_cap, pe_ratio, high_price, low_price, pre_close | A1-A4, B1-B4 |
| `stocks` | id, symbol, name, industry, is_active, market_cap | 行业分组、基础信息 |
| `concept_tags` | stock_id, tag_name | C1 搜索热度代理 |

---

## 八、实施计划

| 阶段 | 内容 | 预估 |
|------|------|------|
| Phase 1 | 后端 `sector-multidim-v2.ts` + 路由注册 | 1d |
| Phase 2 | 前端 `MultiDimHeatmap.tsx` 组件 | 1d |
| Phase 3 | 集成到 `DiscoverPage.tsx`，替换旧版多维展示 | 0.5d |
| Phase 4 | 测试 + 边界情况处理 (空板块/数据不足) | 0.5d |

---

## 九、风险与建议

1. **C类数据可信度低**: 搜索热度/传播扩散度为代理变量，前端应标注"估算"角标
2. **性能**: batch 端点为15板块×10维度，单次请求约8-12个SQL查询，建议加 Redis 缓存(TTL=5min)
3. **向后兼容**: 保留 `/api/sectors/:code/multidim` v1 端点
4. **移动端**: 10列热力图在小屏上需横向滚动，建议移动端默认显示5列(可切换)
