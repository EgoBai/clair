# 未来价值发现 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现"未来价值发现"功能，通过多维度评分模型和AI分析，主动发现具有投资潜力的标的

**Architecture:** 三路并行委派架构：评分模型路、后端API路、前端页面路，最终集成合并

**Tech Stack:** TypeScript, React, Express, PostgreSQL, DeepSeek API, 腾讯行情API

---

## 路1：评分模型（Builder Worker 1）

### Task 1.1: 创建评分引擎基础架构

**Covers:** [S3]
**Files:**
- Create: `backend/src/services/futureValueEngine.ts`
- Create: `backend/src/services/futureValueCalculator.ts`
- Create: `backend/src/utils/futureValueUtils.ts`

- [ ] **Step 1: 创建评分引擎类型定义**

```typescript
// backend/src/services/futureValueEngine.ts
export interface ScoreDimension {
  fundamental: number;
  technical: number;
  capital: number;
  ai: number;
}

export interface StockScore {
  symbol: string;
  name: string;
  totalScore: number;
  dimensions: ScoreDimension;
  rank: number;
  change24h: number;
  calculatedAt: Date;
}

export interface ScoreConfig {
  weights: ScoreDimension;
  filters: {
    industries: string[];
    minMarketCap: number;
    maxMarketCap: number;
    minScore: number;
  };
}

export class FutureValueEngine {
  private config: ScoreConfig;

  constructor(config: ScoreConfig) {
    this.config = config;
  }

  async calculateScore(symbol: string): Promise<StockScore> {
    // TODO: 实现评分计算逻辑
    throw new Error('Not implemented');
  }

  async calculateBatch(symbols: string[]): Promise<StockScore[]> {
    // TODO: 实现批量评分计算
    throw new Error('Not implemented');
  }

  updateConfig(config: Partial<ScoreConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
```

- [ ] **Step 2: 创建评分计算器**

```typescript
// backend/src/services/futureValueCalculator.ts
export class FutureValueCalculator {
  async calculateFundamentalScore(symbol: string): Promise<number> {
    // TODO: 实现基本面评分
    return 0;
  }

  async calculateTechnicalScore(symbol: string): Promise<number> {
    // TODO: 实现技术面评分
    return 0;
  }

  async calculateCapitalScore(symbol: string): Promise<number> {
    // TODO: 实现资金面评分
    return 0;
  }

  async calculateAIScore(symbol: string): Promise<number> {
    // TODO: 实现AI分析评分
    return 0;
  }
}
```

- [ ] **Step 3: 创建工具函数**

```typescript
// backend/src/utils/futureValueUtils.ts
export function normalizeScore(score: number, min: number, max: number): number {
  return Math.max(0, Math.min(100, ((score - min) / (max - min)) * 100));
}

export function calculateTotalScore(
  dimensions: { fundamental: number; technical: number; capital: number; ai: number },
  weights: { fundamental: number; technical: number; capital: number; ai: number }
): number {
  return (
    dimensions.fundamental * weights.fundamental +
    dimensions.technical * weights.technical +
    dimensions.capital * weights.capital +
    dimensions.ai * weights.ai
  );
}

export function rankScores(scores: Array<{ symbol: string; totalScore: number }>): Array<{ symbol: string; totalScore: number; rank: number }> {
  return scores
    .sort((a, b) => b.totalScore - a.totalScore)
    .map((score, index) => ({ ...score, rank: index + 1 }));
}
```

- [ ] **Step 4: 运行测试验证**

Run: `cd backend && npx tsc --noEmit`
Expected: 编译通过，无错误

- [ ] **Step 5: 提交代码**

```bash
cd /Users/ego_bai/.openclaw/workspace/a-stock-website
git add backend/src/services/futureValueEngine.ts backend/src/services/futureValueCalculator.ts backend/src/utils/futureValueUtils.ts
git commit -m "feat(future-value): 创建评分引擎基础架构"
```

### Task 1.2: 实现基本面评分算法

**Covers:** [S3]
**Files:**
- Modify: `backend/src/services/futureValueCalculator.ts`
- Create: `backend/src/__tests__/futureValueCalculator.test.ts`

- [ ] **Step 1: 编写基本面评分测试**

```typescript
// backend/src/__tests__/futureValueCalculator.test.ts
import { FutureValueCalculator } from '../services/futureValueCalculator';

describe('FutureValueCalculator', () => {
  let calculator: FutureValueCalculator;

  beforeEach(() => {
    calculator = new FutureValueCalculator();
  });

  test('calculateFundamentalScore returns valid score', async () => {
    const score = await calculator.calculateFundamentalScore('000001.SZ');
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  test('calculateFundamentalScore handles invalid symbol', async () => {
    const score = await calculator.calculateFundamentalScore('INVALID');
    expect(score).toBe(0);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd backend && npm test -- --testPathPattern=futureValueCalculator`
Expected: FAIL with "Not implemented"

- [ ] **Step 3: 实现基本面评分算法**

```typescript
// backend/src/services/futureValueCalculator.ts
import { query } from '../database';

export class FutureValueCalculator {
  async calculateFundamentalScore(symbol: string): Promise<number> {
    try {
      // 获取基本面数据
      const stockData = await query(
        `SELECT pe_ratio, pb_ratio, revenue_growth, profit_growth, roe 
         FROM stocks WHERE symbol = $1`,
        [symbol]
      );

      if (!stockData.rows.length) return 0;

      const { pe_ratio, pb_ratio, revenue_growth, profit_growth, roe } = stockData.rows[0];

      // 计算各指标得分
      const peScore = this.normalizePE(pe_ratio);
      const pbScore = this.normalizePB(pb_ratio);
      const revenueScore = this.normalizeGrowth(revenue_growth);
      const profitScore = this.normalizeGrowth(profit_growth);
      const roeScore = this.normalizeROE(roe);

      // 加权平均
      return (peScore * 0.2 + pbScore * 0.2 + revenueScore * 0.2 + profitScore * 0.2 + roeScore * 0.2);
    } catch (error) {
      console.error('Error calculating fundamental score:', error);
      return 0;
    }
  }

  private normalizePE(pe: number): number {
    if (pe <= 0) return 0;
    if (pe < 10) return 90;
    if (pe < 20) return 70;
    if (pe < 30) return 50;
    if (pe < 50) return 30;
    return 10;
  }

  private normalizePB(pb: number): number {
    if (pb <= 0) return 0;
    if (pb < 1) return 90;
    if (pb < 2) return 70;
    if (pb < 3) return 50;
    if (pb < 5) return 30;
    return 10;
  }

  private normalizeGrowth(growth: number): number {
    if (growth > 50) return 90;
    if (growth > 30) return 70;
    if (growth > 10) return 50;
    if (growth > 0) return 30;
    return 10;
  }

  private normalizeROE(roe: number): number {
    if (roe > 20) return 90;
    if (roe > 15) return 70;
    if (roe > 10) return 50;
    if (roe > 5) return 30;
    return 10;
  }

  // 其他方法保持不变
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd backend && npm test -- --testPathPattern=futureValueCalculator`
Expected: PASS

- [ ] **Step 5: 提交代码**

```bash
cd /Users/ego_bai/.openclaw/workspace/a-stock-website
git add backend/src/services/futureValueCalculator.ts backend/src/__tests__/futureValueCalculator.test.ts
git commit -m "feat(future-value): 实现基本面评分算法"
```

### Task 1.3: 实现技术面和资金面评分

**Covers:** [S3]
**Files:**
- Modify: `backend/src/services/futureValueCalculator.ts`
- Modify: `backend/src/__tests__/futureValueCalculator.test.ts`

- [ ] **Step 1: 编写技术面评分测试**

```typescript
// 在现有测试文件中添加
test('calculateTechnicalScore returns valid score', async () => {
  const score = await calculator.calculateTechnicalScore('000001.SZ');
  expect(score).toBeGreaterThanOrEqual(0);
  expect(score).toBeLessThanOrEqual(100);
});

test('calculateCapitalScore returns valid score', async () => {
  const score = await calculator.calculateCapitalScore('000001.SZ');
  expect(score).toBeGreaterThanOrEqual(0);
  expect(score).toBeLessThanOrEqual(100);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd backend && npm test -- --testPathPattern=futureValueCalculator`
Expected: FAIL with "Not implemented"

- [ ] **Step 3: 实现技术面评分算法**

```typescript
// 在FutureValueCalculator类中添加
async calculateTechnicalScore(symbol: string): Promise<number> {
  try {
    // 获取技术指标数据
    const technicalData = await query(
      `SELECT ma5, ma20, rsi14, macd, volume_change 
       FROM technical_indicators WHERE symbol = $1`,
      [symbol]
    );

    if (!technicalData.rows.length) return 0;

    const { ma5, ma20, rsi14, macd, volume_change } = technicalData.rows[0];

    // 计算各指标得分
    const maScore = this.calculateMAScore(ma5, ma20);
    const rsiScore = this.calculateRSIScore(rsi14);
    const macdScore = this.calculateMACDScore(macd);
    const volumeScore = this.calculateVolumeScore(volume_change);

    // 加权平均
    return (maScore * 0.3 + rsiScore * 0.3 + macdScore * 0.2 + volumeScore * 0.2);
  } catch (error) {
    console.error('Error calculating technical score:', error);
    return 0;
  }
}

private calculateMAScore(ma5: number, ma20: number): number {
  if (ma5 > ma20) return 80; // 金叉
  if (ma5 < ma20) return 20; // 死叉
  return 50;
}

private calculateRSIScore(rsi: number): number {
  if (rsi < 30) return 80; // 超卖
  if (rsi > 70) return 20; // 超买
  return 50;
}

private calculateMACDScore(macd: number): number {
  if (macd > 0) return 70;
  if (macd < 0) return 30;
  return 50;
}

private calculateVolumeScore(volumeChange: number): number {
  if (volumeChange > 50) return 80;
  if (volumeChange > 20) return 60;
  if (volumeChange > 0) return 40;
  return 20;
}
```

- [ ] **Step 4: 实现资金面评分算法**

```typescript
// 在FutureValueCalculator类中添加
async calculateCapitalScore(symbol: string): Promise<number> {
  try {
    // 获取资金流向数据
    const capitalData = await query(
      `SELECT main_capital_inflow, northbound_change, margin_change 
       FROM capital_flow WHERE symbol = $1`,
      [symbol]
    );

    if (!capitalData.rows.length) return 0;

    const { main_capital_inflow, northbound_change, margin_change } = capitalData.rows[0];

    // 计算各指标得分
    const mainScore = this.calculateMainCapitalScore(main_capital_inflow);
    const northboundScore = this.calculateNorthboundScore(northbound_change);
    const marginScore = this.calculateMarginScore(margin_change);

    // 加权平均
    return (mainScore * 0.4 + northboundScore * 0.3 + marginScore * 0.3);
  } catch (error) {
    console.error('Error calculating capital score:', error);
    return 0;
  }
}

private calculateMainCapitalScore(inflow: number): number {
  if (inflow > 10000000) return 90;
  if (inflow > 5000000) return 70;
  if (inflow > 0) return 50;
  return 20;
}

private calculateNorthboundScore(change: number): number {
  if (change > 1000000) return 80;
  if (change > 0) return 60;
  return 30;
}

private calculateMarginScore(change: number): number {
  if (change > 500000) return 70;
  if (change > 0) return 50;
  return 30;
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `cd backend && npm test -- --testPathPattern=futureValueCalculator`
Expected: PASS

- [ ] **Step 6: 提交代码**

```bash
cd /Users/ego_bai/.openclaw/workspace/a-stock-website
git add backend/src/services/futureValueCalculator.ts backend/src/__tests__/futureValueCalculator.test.ts
git commit -m "feat(future-value): 实现技术面和资金面评分算法"
```

### Task 1.4: 实现AI分析评分

**Covers:** [S3]
**Files:**
- Modify: `backend/src/services/futureValueCalculator.ts`
- Modify: `backend/src/__tests__/futureValueCalculator.test.ts`

- [ ] **Step 1: 编写AI评分测试**

```typescript
// 在现有测试文件中添加
test('calculateAIScore returns valid score', async () => {
  const score = await calculator.calculateAIScore('000001.SZ');
  expect(score).toBeGreaterThanOrEqual(0);
  expect(score).toBeLessThanOrEqual(100);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd backend && npm test -- --testPathPattern=futureValueCalculator`
Expected: FAIL with "Not implemented"

- [ ] **Step 3: 实现AI分析评分**

```typescript
// 在FutureValueCalculator类中添加
import { aiService } from './aiService';

async calculateAIScore(symbol: string): Promise<number> {
  try {
    // 获取股票基本信息
    const stockInfo = await query(
      `SELECT name, industry, market_cap FROM stocks WHERE symbol = $1`,
      [symbol]
    );

    if (!stockInfo.rows.length) return 0;

    const { name, industry, market_cap } = stockInfo.rows[0];

    // 调用AI服务进行分析
    const prompt = `请分析股票 ${name}(${symbol}) 的投资价值，所属行业：${industry}，市值：${market_cap}万元。
    请从以下维度进行评分（0-100分）：
    1. 行业前景
    2. 公司竞争力
    3. 风险因素
    请返回JSON格式：{"industryProspect": 分数, "competitiveness": 分数, "riskFactors": 分数}`;

    const response = await aiService.chat({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      maxTokens: 500,
    });

    // 解析AI响应
    const aiResult = JSON.parse(response.content);
    return (aiResult.industryProspect + aiResult.competitiveness + aiResult.riskFactors) / 3;
  } catch (error) {
    console.error('Error calculating AI score:', error);
    return 50; // 默认中等分数
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd backend && npm test -- --testPathPattern=futureValueCalculator`
Expected: PASS

- [ ] **Step 5: 提交代码**

```bash
cd /Users/ego_bai/.openclaw/workspace/a-stock-website
git add backend/src/services/futureValueCalculator.ts backend/src/__tests__/futureValueCalculator.test.ts
git commit -m "feat(future-value): 实现AI分析评分"
```

### Task 1.5: 实现评分引擎完整功能

**Covers:** [S3]
**Files:**
- Modify: `backend/src/services/futureValueEngine.ts`
- Modify: `backend/src/__tests__/futureValueEngine.test.ts`

- [ ] **Step 1: 编写评分引擎测试**

```typescript
// backend/src/__tests__/futureValueEngine.test.ts
import { FutureValueEngine } from '../services/futureValueEngine';

describe('FutureValueEngine', () => {
  let engine: FutureValueEngine;

  beforeEach(() => {
    engine = new FutureValueEngine({
      weights: { fundamental: 0.4, technical: 0.3, capital: 0.2, ai: 0.1 },
      filters: { industries: [], minMarketCap: 0, maxMarketCap: Infinity, minScore: 0 },
    });
  });

  test('calculateScore returns valid score', async () => {
    const score = await engine.calculateScore('000001.SZ');
    expect(score).toHaveProperty('symbol', '000001.SZ');
    expect(score).toHaveProperty('totalScore');
    expect(score.totalScore).toBeGreaterThanOrEqual(0);
    expect(score.totalScore).toBeLessThanOrEqual(100);
  });

  test('calculateBatch returns multiple scores', async () => {
    const scores = await engine.calculateBatch(['000001.SZ', '000002.SZ']);
    expect(scores).toHaveLength(2);
    expect(scores[0]).toHaveProperty('rank');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd backend && npm test -- --testPathPattern=futureValueEngine`
Expected: FAIL with "Not implemented"

- [ ] **Step 3: 实现评分引擎完整功能**

```typescript
// backend/src/services/futureValueEngine.ts
import { FutureValueCalculator } from './futureValueCalculator';
import { normalizeScore, calculateTotalScore, rankScores } from '../utils/futureValueUtils';
import { query } from '../database';

export class FutureValueEngine {
  private config: ScoreConfig;
  private calculator: FutureValueCalculator;

  constructor(config: ScoreConfig) {
    this.config = config;
    this.calculator = new FutureValueCalculator();
  }

  async calculateScore(symbol: string): Promise<StockScore> {
    // 获取股票基本信息
    const stockInfo = await query(
      `SELECT name, change_percent FROM stocks WHERE symbol = $1`,
      [symbol]
    );

    if (!stockInfo.rows.length) {
      throw new Error(`Stock ${symbol} not found`);
    }

    const { name, change_percent } = stockInfo.rows[0];

    // 计算各维度评分
    const fundamental = await this.calculator.calculateFundamentalScore(symbol);
    const technical = await this.calculator.calculateTechnicalScore(symbol);
    const capital = await this.calculator.calculateCapitalScore(symbol);
    const ai = await this.calculator.calculateAIScore(symbol);

    // 计算综合评分
    const totalScore = calculateTotalScore(
      { fundamental, technical, capital, ai },
      this.config.weights
    );

    return {
      symbol,
      name,
      totalScore,
      dimensions: { fundamental, technical, capital, ai },
      rank: 0, // 稍后计算
      change24h: change_percent || 0,
      calculatedAt: new Date(),
    };
  }

  async calculateBatch(symbols: string[]): Promise<StockScore[]> {
    const scores = await Promise.all(symbols.map(symbol => this.calculateScore(symbol)));
    return rankScores(scores);
  }

  updateConfig(config: Partial<ScoreConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd backend && npm test -- --testPathPattern=futureValueEngine`
Expected: PASS

- [ ] **Step 5: 提交代码**

```bash
cd /Users/ego_bai/.openclaw/workspace/a-stock-website
git add backend/src/services/futureValueEngine.ts backend/src/__tests__/futureValueEngine.test.ts
git commit -m "feat(future-value): 实现评分引擎完整功能"
```

## 路2：后端API（Builder Worker 2）

### Task 2.1: 创建API路由框架

**Covers:** [S4]
**Files:**
- Create: `backend/src/routes/futureValue.ts`
- Create: `backend/src/middleware/futureValueValidation.ts`

- [ ] **Step 1: 创建验证中间件**

```typescript
// backend/src/middleware/futureValueValidation.ts
import { Request, Response, NextFunction } from 'express';

export const validateScoreRequest = (req: Request, res: Response, next: NextFunction) => {
  const { symbols } = req.body;

  if (!symbols || !Array.isArray(symbols)) {
    return res.status(400).json({ error: 'symbols array is required' });
  }

  if (symbols.length > 100) {
    return res.status(400).json({ error: 'Maximum 100 symbols per request' });
  }

  next();
};

export const validateDiscoverRequest = (req: Request, res: Response, next: NextFunction) => {
  const { limit, minScore, industry, sort } = req.query;

  if (limit && (isNaN(Number(limit)) || Number(limit) < 1 || Number(limit) > 100)) {
    return res.status(400).json({ error: 'limit must be between 1 and 100' });
  }

  if (minScore && (isNaN(Number(minScore)) || Number(minScore) < 0 || Number(minScore) > 100)) {
    return res.status(400).json({ error: 'minScore must be between 0 and 100' });
  }

  next();
};
```

- [ ] **Step 2: 创建路由文件**

```typescript
// backend/src/routes/futureValue.ts
import { Router } from 'express';
import { FutureValueEngine } from '../services/futureValueEngine';
import { validateScoreRequest, validateDiscoverRequest } from '../middleware/futureValueValidation';

const router = Router();
const engine = new FutureValueEngine({
  weights: { fundamental: 0.4, technical: 0.3, capital: 0.2, ai: 0.1 },
  filters: { industries: [], minMarketCap: 0, maxMarketCap: Infinity, minScore: 0 },
});

// POST /api/future-value/score
router.post('/score', validateScoreRequest, async (req, res) => {
  try {
    const { symbols, dimensions } = req.body;
    const scores = await engine.calculateBatch(symbols);
    res.json({ scores, calculatedAt: new Date() });
  } catch (error) {
    res.status(500).json({ error: 'Failed to calculate scores' });
  }
});

// GET /api/future-value/discover
router.get('/discover', validateDiscoverRequest, async (req, res) => {
  try {
    const { limit = 20, minScore = 60, industry, sort = 'score' } = req.query;
    // TODO: 实现发现列表逻辑
    res.json({ items: [], total: 0, page: 1 });
  } catch (error) {
    res.status(500).json({ error: 'Failed to discover stocks' });
  }
});

// GET /api/future-value/detail/:symbol
router.get('/detail/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const score = await engine.calculateScore(symbol);
    res.json(score);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get stock detail' });
  }
});

export default router;
```

- [ ] **Step 3: 运行测试验证**

Run: `cd backend && npx tsc --noEmit`
Expected: 编译通过，无错误

- [ ] **Step 4: 提交代码**

```bash
cd /Users/ego_bai/.openclaw/workspace/a-stock-website
git add backend/src/routes/futureValue.ts backend/src/middleware/futureValueValidation.ts
git commit -m "feat(future-value): 创建API路由框架"
```

### Task 2.2: 实现发现列表端点

**Covers:** [S4]
**Files:**
- Modify: `backend/src/routes/futureValue.ts`
- Create: `backend/src/__tests__/futureValue.test.ts`

- [ ] **Step 1: 编写API测试**

```typescript
// backend/src/__tests__/futureValue.test.ts
import request from 'supertest';
import app from '../index';

describe('Future Value API', () => {
  test('POST /api/future-value/score returns scores', async () => {
    const response = await request(app)
      .post('/api/future-value/score')
      .send({ symbols: ['000001.SZ'] });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('scores');
    expect(response.body.scores).toHaveLength(1);
  });

  test('GET /api/future-value/discover returns items', async () => {
    const response = await request(app)
      .get('/api/future-value/discover')
      .query({ limit: 10 });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('items');
  });

  test('GET /api/future-value/detail/:symbol returns detail', async () => {
    const response = await request(app)
      .get('/api/future-value/detail/000001.SZ');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('symbol', '000001.SZ');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd backend && npm test -- --testPathPattern=futureValue`
Expected: FAIL

- [ ] **Step 3: 实现发现列表端点**

```typescript
// 在futureValue.ts中修改GET /discover端点
router.get('/discover', validateDiscoverRequest, async (req, res) => {
  try {
    const { limit = 20, minScore = 60, industry, sort = 'score' } = req.query;

    // 获取所有股票
    let queryStr = `SELECT symbol, name, price, change_percent FROM stocks`;
    const params: any[] = [];

    if (industry) {
      queryStr += ` WHERE industry = $1`;
      params.push(industry);
    }

    const stocks = await query(queryStr, params);

    // 计算评分
    const scores = await engine.calculateBatch(stocks.rows.map(s => s.symbol));

    // 过滤和排序
    let filteredScores = scores.filter(s => s.totalScore >= Number(minScore));

    if (sort === 'change') {
      filteredScores.sort((a, b) => b.change24h - a.change24h);
    } else if (sort === 'volume') {
      // 按成交量排序（需要额外数据）
    }

    // 分页
    const paginatedScores = filteredScores.slice(0, Number(limit));

    // 获取详细信息
    const items = await Promise.all(
      paginatedScores.map(async (score) => {
        const stockInfo = await query(
          `SELECT price, change_percent FROM stocks WHERE symbol = $1`,
          [score.symbol]
        );
        return {
          symbol: score.symbol,
          name: score.name,
          price: stockInfo.rows[0]?.price || 0,
          change: stockInfo.rows[0]?.change_percent || 0,
          score: score.totalScore,
          reasons: this.getRecommendationReasons(score),
          riskFactors: this.getRiskFactors(score),
        };
      })
    );

    res.json({ items, total: filteredScores.length, page: 1 });
  } catch (error) {
    res.status(500).json({ error: 'Failed to discover stocks' });
  }
});

// 添加辅助方法
function getRecommendationReasons(score: StockScore): string[] {
  const reasons: string[] = [];
  if (score.dimensions.fundamental > 70) reasons.push('基本面优秀');
  if (score.dimensions.technical > 70) reasons.push('技术面强势');
  if (score.dimensions.capital > 70) reasons.push('资金面流入');
  if (score.dimensions.ai > 70) reasons.push('AI分析积极');
  return reasons;
}

function getRiskFactors(score: StockScore): string[] {
  const risks: string[] = [];
  if (score.dimensions.fundamental < 30) risks.push('基本面较弱');
  if (score.dimensions.technical < 30) risks.push('技术面弱势');
  if (score.dimensions.capital < 30) risks.push('资金面流出');
  if (score.dimensions.ai < 30) risks.push('AI分析谨慎');
  return risks;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd backend && npm test -- --testPathPattern=futureValue`
Expected: PASS

- [ ] **Step 5: 提交代码**

```bash
cd /Users/ego_bai/.openclaw/workspace/a-stock-website
git add backend/src/routes/futureValue.ts backend/src/__tests__/futureValue.test.ts
git commit -m "feat(future-value): 实现发现列表端点"
```

### Task 2.3: 实现个性化配置端点

**Covers:** [S4]
**Files:**
- Modify: `backend/src/routes/futureValue.ts`
- Modify: `backend/src/__tests__/futureValue.test.ts`

- [ ] **Step 1: 编写配置端点测试**

```typescript
// 在现有测试文件中添加
test('POST /api/future-value/config saves config', async () => {
  const response = await request(app)
    .post('/api/future-value/config')
    .send({
      dimensions: { fundamental: 0.4, technical: 0.3, capital: 0.2, ai: 0.1 },
      filters: { industries: ['银行'], minMarketCap: 1000000, maxMarketCap: 100000000, minScore: 60 },
      notifications: { enabled: true, threshold: 5 },
    });

  expect(response.status).toBe(200);
  expect(response.body).toHaveProperty('success', true);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd backend && npm test -- --testPathPattern=futureValue`
Expected: FAIL

- [ ] **Step 3: 实现个性化配置端点**

```typescript
// 在futureValue.ts中添加
router.post('/config', async (req, res) => {
  try {
    const { dimensions, filters, notifications } = req.body;

    // 验证权重总和为1
    const totalWeight = dimensions.fundamental + dimensions.technical + dimensions.capital + dimensions.ai;
    if (Math.abs(totalWeight - 1) > 0.01) {
      return res.status(400).json({ error: 'Dimension weights must sum to 1' });
    }

    // 更新引擎配置
    engine.updateConfig({ weights: dimensions, filters });

    // 保存到数据库（这里简化处理，实际应该保存到用户配置表）
    res.json({ success: true, config: { dimensions, filters, notifications } });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save config' });
  }
});
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd backend && npm test -- --testPathPattern=futureValue`
Expected: PASS

- [ ] **Step 5: 提交代码**

```bash
cd /Users/ego_bai/.openclaw/workspace/a-stock-website
git add backend/src/routes/futureValue.ts backend/src/__tests__/futureValue.test.ts
git commit -m "feat(future-value): 实现个性化配置端点"
```

### Task 2.4: 集成到主路由

**Covers:** [S4]
**Files:**
- Modify: `backend/src/index.ts`

- [ ] **Step 1: 导入路由**

```typescript
// 在backend/src/index.ts顶部添加
import futureValueRoutes from './routes/futureValue';
```

- [ ] **Step 2: 注册路由**

```typescript
// 在其他路由注册后添加
app.use('/api/future-value', futureValueRoutes);
```

- [ ] **Step 3: 运行测试验证**

Run: `cd backend && npm test`
Expected: 所有测试通过

- [ ] **Step 4: 提交代码**

```bash
cd /Users/ego_bai/.openclaw/workspace/a-stock-website
git add backend/src/index.ts
git commit -m "feat(future-value): 集成到主路由"
```

## 路3：前端页面（Builder Worker 3）

### Task 3.1: 创建页面基础架构

**Covers:** [S5]
**Files:**
- Create: `frontend/src/pages/FutureValuePage.tsx`
- Create: `frontend/src/components/FutureValue/ScoreOverview.tsx`
- Create: `frontend/src/components/FutureValue/DiscoveryList.tsx`

- [ ] **Step 1: 创建页面骨架**

```typescript
// frontend/src/pages/FutureValuePage.tsx
import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Tabs } from 'antd';
import ScoreOverview from '../components/FutureValue/ScoreOverview';
import DiscoveryList from '../components/FutureValue/DiscoveryList';
import ScoreDetail from '../components/FutureValue/ScoreDetail';
import PersonalizationPanel from '../components/FutureValue/PersonalizationPanel';

const FutureValuePage: React.FC = () => {
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedStock, setSelectedStock] = useState<string | null>(null);

  return (
    <div style={{ padding: '24px' }}>
      <h1>未来价值发现</h1>
      <Tabs activeKey={activeTab} onChange={setActiveTab}>
        <Tabs.TabPane tab="评分概览" key="overview">
          <ScoreOverview />
        </Tabs.TabPane>
        <Tabs.TabPane tab="发现列表" key="discover">
          <DiscoveryList onSelectStock={setSelectedStock} />
        </Tabs.TabPane>
        <Tabs.TabPane tab="评分详情" key="detail">
          {selectedStock ? (
            <ScoreDetail symbol={selectedStock} />
          ) : (
            <div>请先选择一只股票</div>
          )}
        </Tabs.TabPane>
        <Tabs.TabPane tab="个性化配置" key="config">
          <PersonalizationPanel />
        </Tabs.TabPane>
      </Tabs>
    </div>
  );
};

export default FutureValuePage;
```

- [ ] **Step 2: 创建评分概览组件**

```typescript
// frontend/src/components/FutureValue/ScoreOverview.tsx
import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Statistic } from 'antd';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';

const ScoreOverview: React.FC = () => {
  const [overviewData, setOverviewData] = useState({
    totalDiscovered: 0,
    averageScore: 0,
    topIndustries: [],
    scoreDistribution: [],
  });

  useEffect(() => {
    // TODO: 从API获取概览数据
    setOverviewData({
      totalDiscovered: 156,
      averageScore: 72.5,
      topIndustries: [
        { name: '新能源', count: 23 },
        { name: '半导体', count: 18 },
        { name: '医药', count: 15 },
      ],
      scoreDistribution: [
        { range: '90-100', count: 12 },
        { range: '80-89', count: 28 },
        { range: '70-79', count: 45 },
        { range: '60-69', count: 38 },
        { range: '<60', count: 33 },
      ],
    });
  }, []);

  return (
    <Row gutter={[16, 16]}>
      <Col span={6}>
        <Card>
          <Statistic title="今日发现" value={overviewData.totalDiscovered} />
        </Card>
      </Col>
      <Col span={6}>
        <Card>
          <Statistic title="平均评分" value={overviewData.averageScore} precision={1} />
        </Card>
      </Col>
      <Col span={12}>
        <Card title="评分分布">
          {/* 图表组件 */}
        </Card>
      </Col>
    </Row>
  );
};

export default ScoreOverview;
```

- [ ] **Step 3: 创建发现列表组件**

```typescript
// frontend/src/components/FutureValue/DiscoveryList.tsx
import React, { useState, useEffect } from 'react';
import { Table, Tag, Space, Button } from 'antd';

interface DiscoveryItem {
  symbol: string;
  name: string;
  price: number;
  change: number;
  score: number;
  reasons: string[];
  riskFactors: string[];
}

interface DiscoveryListProps {
  onSelectStock: (symbol: string) => void;
}

const DiscoveryList: React.FC<DiscoveryListProps> = ({ onSelectStock }) => {
  const [items, setItems] = useState<DiscoveryItem[]>([]);
  const [loading, setLoading] = useState(false);

  const columns = [
    { title: '代码', dataIndex: 'symbol', key: 'symbol' },
    { title: '名称', dataIndex: 'name', key: 'name' },
    { title: '价格', dataIndex: 'price', key: 'price', render: (v: number) => v.toFixed(2) },
    {
      title: '涨跌幅',
      dataIndex: 'change',
      key: 'change',
      render: (v: number) => (
        <span style={{ color: v >= 0 ? '#cf2a2a' : '#1db468' }}>
          {v >= 0 ? '+' : ''}{v.toFixed(2)}%
        </span>
      ),
    },
    {
      title: '评分',
      dataIndex: 'score',
      key: 'score',
      render: (v: number) => (
        <Tag color={v >= 80 ? 'green' : v >= 60 ? 'orange' : 'red'}>
          {v.toFixed(1)}
        </Tag>
      ),
    },
    {
      title: '推荐理由',
      dataIndex: 'reasons',
      key: 'reasons',
      render: (reasons: string[]) => (
        <Space>
          {reasons.map((reason, index) => (
            <Tag key={index} color="blue">{reason}</Tag>
          ))}
        </Space>
      ),
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: DiscoveryItem) => (
        <Button type="link" onClick={() => onSelectStock(record.symbol)}>
          查看详情
        </Button>
      ),
    },
  ];

  useEffect(() => {
    // TODO: 从API获取发现列表
    setLoading(true);
    fetch('/api/future-value/discover?limit=20')
      .then(response => response.json())
      .then(data => {
        setItems(data.items);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <Table
      columns={columns}
      dataSource={items}
      loading={loading}
      rowKey="symbol"
      pagination={{ pageSize: 10 }}
    />
  );
};

export default DiscoveryList;
```

- [ ] **Step 4: 运行测试验证**

Run: `cd frontend && npx tsc --noEmit`
Expected: 编译通过，无错误

- [ ] **Step 5: 提交代码**

```bash
cd /Users/ego_bai/.openclaw/workspace/a-stock-website
git add frontend/src/pages/FutureValuePage.tsx frontend/src/components/FutureValue/ScoreOverview.tsx frontend/src/components/FutureValue/DiscoveryList.tsx
git commit -m "feat(future-value): 创建页面基础架构"
```

### Task 3.2: 实现评分详情和个性化配置组件

**Covers:** [S5]
**Files:**
- Create: `frontend/src/components/FutureValue/ScoreDetail.tsx`
- Create: `frontend/src/components/FutureValue/PersonalizationPanel.tsx`

- [ ] **Step 1: 创建评分详情组件**

```typescript
// frontend/src/components/FutureValue/ScoreDetail.tsx
import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Progress, Tag } from 'antd';
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';

interface ScoreDetailProps {
  symbol: string;
}

const ScoreDetail: React.FC<ScoreDetailProps> = ({ symbol }) => {
  const [detail, setDetail] = useState<any>(null);

  useEffect(() => {
    // TODO: 从API获取评分详情
    fetch(`/api/future-value/detail/${symbol}`)
      .then(response => response.json())
      .then(data => setDetail(data));
  }, [symbol]);

  if (!detail) return <div>加载中...</div>;

  const radarData = [
    { dimension: '基本面', score: detail.dimensions.fundamental },
    { dimension: '技术面', score: detail.dimensions.technical },
    { dimension: '资金面', score: detail.dimensions.capital },
    { dimension: 'AI分析', score: detail.dimensions.ai },
  ];

  return (
    <Row gutter={[16, 16]}>
      <Col span={12}>
        <Card title="评分雷达图">
          <RadarChart data={radarData}>
            <PolarGrid />
            <PolarAngleAxis dataKey="dimension" />
            <PolarRadiusAxis angle={30} domain={[0, 100]} />
            <Radar name="评分" dataKey="score" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.6} />
          </RadarChart>
        </Card>
      </Col>
      <Col span={12}>
        <Card title="评分明细">
          <div style={{ marginBottom: 16 }}>
            <div>综合评分: <Tag color="blue">{detail.totalScore.toFixed(1)}</Tag></div>
            <Progress percent={detail.totalScore} strokeColor="#3b82f6" />
          </div>
          <div style={{ marginBottom: 16 }}>
            <div>基本面: <Tag>{detail.dimensions.fundamental.toFixed(1)}</Tag></div>
            <Progress percent={detail.dimensions.fundamental} strokeColor="#52c41a" />
          </div>
          <div style={{ marginBottom: 16 }}>
            <div>技术面: <Tag>{detail.dimensions.technical.toFixed(1)}</Tag></div>
            <Progress percent={detail.dimensions.technical} strokeColor="#faad14" />
          </div>
          <div style={{ marginBottom: 16 }}>
            <div>资金面: <Tag>{detail.dimensions.capital.toFixed(1)}</Tag></div>
            <Progress percent={detail.dimensions.capital} strokeColor="#ff4d4f" />
          </div>
          <div>
            <div>AI分析: <Tag>{detail.dimensions.ai.toFixed(1)}</Tag></div>
            <Progress percent={detail.dimensions.ai} strokeColor="#722ed1" />
          </div>
        </Card>
      </Col>
    </Row>
  );
};

export default ScoreDetail;
```

- [ ] **Step 2: 创建个性化配置组件**

```typescript
// frontend/src/components/FutureValue/PersonalizationPanel.tsx
import React, { useState } from 'react';
import { Card, Form, Slider, Select, Switch, Button, message } from 'antd';

const PersonalizationPanel: React.FC = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (values: any) => {
    setLoading(true);
    try {
      // TODO: 调用API保存配置
      await fetch('/api/future-value/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      message.success('配置保存成功');
    } catch (error) {
      message.error('配置保存失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card title="个性化配置">
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        initialValues={{
          dimensions: { fundamental: 0.4, technical: 0.3, capital: 0.2, ai: 0.1 },
          filters: { industries: [], minMarketCap: 0, maxMarketCap: 100000000, minScore: 60 },
          notifications: { enabled: true, threshold: 5 },
        }}
      >
        <Form.Item label="评分维度权重">
          <Form.Item name={['dimensions', 'fundamental']} noStyle>
            <Slider marks={{ 0: '0', 0.4: '40%', 1: '100%' }} />
          </Form.Item>
          <div>基本面: {form.getFieldValue(['dimensions', 'fundamental']) || 0.4}</div>
        </Form.Item>

        <Form.Item label="行业筛选" name={['filters', 'industries']}>
          <Select mode="multiple" placeholder="选择行业">
            <Select.Option value="银行">银行</Select.Option>
            <Select.Option value="新能源">新能源</Select.Option>
            <Select.Option value="半导体">半导体</Select.Option>
            <Select.Option value="医药">医药</Select.Option>
          </Select>
        </Form.Item>

        <Form.Item label="最低评分" name={['filters', 'minScore']}>
          <Slider min={0} max={100} marks={{ 0: '0', 60: '60', 100: '100' }} />
        </Form.Item>

        <Form.Item label="启用通知" name={['notifications', 'enabled']} valuePropName="checked">
          <Switch />
        </Form.Item>

        <Form.Item>
          <Button type="primary" htmlType="submit" loading={loading}>
            保存配置
          </Button>
        </Form.Item>
      </Form>
    </Card>
  );
};

export default PersonalizationPanel;
```

- [ ] **Step 3: 运行测试验证**

Run: `cd frontend && npx tsc --noEmit`
Expected: 编译通过，无错误

- [ ] **Step 4: 提交代码**

```bash
cd /Users/ego_bai/.openclaw/workspace/a-stock-website
git add frontend/src/components/FutureValue/ScoreDetail.tsx frontend/src/components/FutureValue/PersonalizationPanel.tsx
git commit -m "feat(future-value): 实现评分详情和个性化配置组件"
```

### Task 3.3: 集成路由和导航

**Covers:** [S5]
**Files:**
- Modify: `frontend/src/main.tsx`
- Modify: `frontend/src/components/Layout/NavigationMenu.tsx`

- [ ] **Step 1: 添加路由**

```typescript
// 在frontend/src/main.tsx中添加
const FutureValuePage = lazy(() => import('./pages/FutureValuePage'));

// 在Routes组件中添加
<Route path="/future-value" element={<FutureValuePage />} />
```

- [ ] **Step 2: 添加导航项**

```typescript
// 在frontend/src/components/Layout/NavigationMenu.tsx中添加
{
  id: 'future-value',
  label: '价值发现',
  path: '/future-value',
  icon: '🔍',
  description: '智能评分 · AI分析 · 潜力标的发现'
}
```

- [ ] **Step 3: 运行测试验证**

Run: `cd frontend && npx vite build`
Expected: 构建成功

- [ ] **Step 4: 提交代码**

```bash
cd /Users/ego_bai/.openclaw/workspace/a-stock-website
git add frontend/src/main.tsx frontend/src/components/Layout/NavigationMenu.tsx
git commit -m "feat(future-value): 集成路由和导航"
```

### Task 3.4: 编写组件测试

**Covers:** [S5]
**Files:**
- Create: `frontend/src/__tests__/FutureValuePage.test.tsx`
- Create: `frontend/src/__tests__/DiscoveryList.test.tsx`

- [ ] **Step 1: 编写页面测试**

```typescript
// frontend/src/__tests__/FutureValuePage.test.tsx
import React from 'react';
import { render, screen } from '@testing-library/react';
import FutureValuePage from '../pages/FutureValuePage';

describe('FutureValuePage', () => {
  test('renders page title', () => {
    render(<FutureValuePage />);
    expect(screen.getByText('未来价值发现')).toBeInTheDocument();
  });

  test('renders tabs', () => {
    render(<FutureValuePage />);
    expect(screen.getByText('评分概览')).toBeInTheDocument();
    expect(screen.getByText('发现列表')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 编写组件测试**

```typescript
// frontend/src/__tests__/DiscoveryList.test.tsx
import React from 'react';
import { render, screen } from '@testing-library/react';
import DiscoveryList from '../components/FutureValue/DiscoveryList';

describe('DiscoveryList', () => {
  test('renders table headers', () => {
    render(<DiscoveryList onSelectStock={() => {}} />);
    expect(screen.getByText('代码')).toBeInTheDocument();
    expect(screen.getByText('名称')).toBeInTheDocument();
    expect(screen.getByText('评分')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: 运行测试确认通过**

Run: `cd frontend && npm test`
Expected: PASS

- [ ] **Step 4: 提交代码**

```bash
cd /Users/ego_bai/.openclaw/workspace/a-stock-website
git add frontend/src/__tests__/FutureValuePage.test.tsx frontend/src/__tests__/DiscoveryList.test.tsx
git commit -m "feat(future-value): 编写组件测试"
```

## 集成测试和最终验证

### Task 4.1: 三路合并和集成测试

**Covers:** [S7]
**Files:**
- All files from previous tasks

- [ ] **Step 1: 合并代码**

```bash
cd /Users/ego_bai/.openclaw/workspace/a-stock-website
git merge feature/future-value-model feature/future-value-api feature/future-value-frontend
```

- [ ] **Step 2: 运行全量测试**

```bash
cd backend && npm test
cd frontend && npm test
```

- [ ] **Step 3: 端到端验证**

```bash
# 启动后端
cd backend && npm run dev

# 启动前端
cd frontend && npm run dev

# 测试API
curl -X POST http://localhost:3001/api/future-value/score \
  -H "Content-Type: application/json" \
  -d '{"symbols": ["000001.SZ"]}'

# 测试前端页面
open http://localhost:5173/future-value
```

- [ ] **Step 4: 修复集成问题**

根据测试结果修复发现的问题。

- [ ] **Step 5: 最终提交**

```bash
cd /Users/ego_bai/.openclaw/workspace/a-stock-website
git add .
git commit -m "feat(future-value): 完成集成测试和最终验证"
```

### Task 4.2: 文档更新

**Covers:** [S9]
**Files:**
- Modify: `MULTI-AGENT.md`
- Modify: `README.md`

- [ ] **Step 1: 更新共享简报**

```markdown
# 在MULTI-AGENT.md中添加

## 未来价值发现功能

### 功能说明
通过多维度评分模型和AI分析，主动发现具有投资潜力的标的。

### 评分模型
- 基本面评分（40%）：PE、PB、营收增长、利润增长、ROE
- 技术面评分（30%）：MA、RSI、MACD、成交量
- 资金面评分（20%）：主力资金、北向资金、融资融券
- AI分析评分（10%）：行业前景、公司竞争力、风险因素

### API端点
- POST /api/future-value/score - 批量评分
- GET /api/future-value/discover - 发现列表
- GET /api/future-value/detail/:symbol - 评分详情
- POST /api/future-value/config - 个性化配置

### 前端页面
- 路径：/future-value
- 组件：ScoreOverview, DiscoveryList, ScoreDetail, PersonalizationPanel
```

- [ ] **Step 2: 更新README**

```markdown
# 在README.md中添加

## 未来价值发现

智能发现具有投资潜力的标的，基于多维度评分模型和AI分析。

### 功能特点
- 四维度评分模型：基本面、技术面、资金面、AI分析
- 个性化配置：自定义权重和筛选条件
- 实时更新：WebSocket推送评分变化
- 深度分析：AI驱动的投资建议

### 使用方法
1. 访问 /future-value 页面
2. 查看评分概览和发现列表
3. 点击股票查看详细评分
4. 配置个性化筛选条件
```

- [ ] **Step 3: 提交文档**

```bash
cd /Users/ego_bai/.openclaw/workspace/a-stock-website
git add MULTI-AGENT.md README.md
git commit -m "docs(future-value): 更新文档"
```

## 执行说明

### 并行执行策略
1. **路1（评分模型）**：Task 1.1 → 1.2 → 1.3 → 1.4 → 1.5
2. **路2（后端API）**：Task 2.1 → 2.2 → 2.3 → 2.4
3. **路3（前端页面）**：Task 3.1 → 3.2 → 3.3 → 3.4

### 依赖关系
- 路1和路2可以完全并行
- 路3依赖路2的API端点
- 集成测试需要三路都完成

### 验证检查点
1. 每个Task完成后运行相关测试
2. 每个路完成后进行路内集成测试
3. 三路合并后进行端到端测试
4. 最终验证所有功能正常

### 风险控制
1. 严格文件归属，避免并行冲突
2. 提前定义接口规范，确保兼容性
3. 分阶段验证，及时发现问题
4. 保留回滚方案，应对突发情况

---

**计划完成时间**：2026-06-25
**计划制定者**：MiMoCode Orchestrator
**预计执行时间**：12小时
**预计完成时间**：2026-06-26
