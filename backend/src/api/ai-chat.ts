/**
 * AI API Routes — AI对话和分析接口
 * 
 * 澄观的核心AI能力入口
 */

import { Router, Request, Response } from 'express';
import { asyncHandler } from '../utils/apiResponse';
import aiService from '../services/aiService';
import { logger } from '../services/logger';

const router = Router();

// ============================================================
// 对话接口（流式）
// ============================================================

router.post('/ai/chat', asyncHandler(async (req: Request, res: Response) => {
  const { message, context, stream = true } = req.body;

  if (!message) {
    res.status(400).json({ error: 'Message is required' });
    return;
  }

  // 构建消息历史
  const messages = [
    ...(context || []).map((msg: any) => ({
      role: msg.role,
      content: msg.content,
    })),
    { role: 'user' as const, content: message },
  ];

  if (stream) {
    // 流式响应
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
      const stream = aiService.chatStream({ messages });

      for await (const chunk of stream) {
        if (chunk.done) {
          res.write('data: [DONE]\n\n');
        } else {
          res.write(`data: ${JSON.stringify({ content: chunk.content })}\n\n`);
        }
      }

      res.end();
    } catch (error) {
      logger.error('AI chat stream error:', error as Error);
      res.write(`data: ${JSON.stringify({ content: '\n\n⚠️ AI服务暂时不可用' })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    }
  } else {
    // 非流式响应
    try {
      const response = await aiService.chat({ messages });
      res.json({
        content: response.content,
        model: response.model,
        usage: response.usage,
      });
    } catch (error) {
      logger.error('AI chat error:', error as Error);
      res.status(500).json({ error: 'AI服务暂时不可用' });
    }
  }
}));

// ============================================================
// 市场分析
// ============================================================

router.get('/ai/market-analysis', asyncHandler(async (_req: Request, res: Response) => {
  try {
    // TODO: 从实际数据源获取市场数据
    const marketData = {
      shanghai: { price: '3200', change: '0.5' },
      shenzhen: { price: '10500', change: '0.8' },
      chinext: { price: '2100', change: '1.2' },
      advanceCount: 3200,
      declineCount: 1800,
      limitUp: 45,
      limitDown: 12,
      turnover: 8500,
    };

    const analysis = await aiService.analyzeMarket(marketData);
    res.json({ analysis });
  } catch (error) {
    logger.error('Market analysis error:', error as Error);
    res.status(500).json({ error: '市场分析失败' });
  }
}));

// ============================================================
// 个股诊断
// ============================================================

router.get('/ai/diagnose/:symbol', asyncHandler(async (req: Request, res: Response) => {
  const { symbol } = req.params;

  try {
    // TODO: 从数据库/缓存获取股票数据
    const stockData = {
      name: '示例股票',
      symbol,
      industry: '示例行业',
      price: '100.00',
      change: '2.5',
      pe: '15.5',
      pb: '1.8',
      roe: '12.5',
      marketCap: '500',
      ma5: '99.5',
      ma20: '98.0',
      ma60: '95.0',
      macd: '0.5',
      rsi: '65',
    };

    const diagnosis = await aiService.diagnoseStock(stockData);
    res.json({ diagnosis });
  } catch (error) {
    logger.error('Stock diagnosis error:', error as Error);
    res.status(500).json({ error: '个股诊断失败' });
  }
}));

// ============================================================
// 策略建议
// ============================================================

router.post('/ai/strategy', asyncHandler(async (req: Request, res: Response) => {
  const { symbol, riskLevel, horizon, position } = req.body;

  try {
    // TODO: 从数据库/缓存获取股票数据
    const stockData = {
      name: '示例股票',
      symbol,
      price: '100.00',
      technicalIndicators: {
        ma5: '99.5',
        ma20: '98.0',
        macd: '0.5',
        rsi: '65',
      },
    };

    const userPreference = {
      riskLevel: riskLevel || '中等',
      horizon: horizon || '1-2周',
      position: position || '轻仓',
    };

    const strategy = await aiService.generateStrategy(stockData, userPreference);
    res.json({ strategy });
  } catch (error) {
    logger.error('Strategy generation error:', error as Error);
    res.status(500).json({ error: '策略生成失败' });
  }
}));

// ============================================================
// 每日简报
// ============================================================

router.get('/ai/daily-briefing', asyncHandler(async (_req: Request, res: Response) => {
  try {
    // TODO: 聚合多个数据源生成简报
    const briefing = await aiService.chatWithAI(
      '请生成今日A股市场简报，包括：\n1. 大盘表现\n2. 热点板块\n3. 重要消息\n4. 操作建议'
    );
    res.json({ briefing });
  } catch (error) {
    logger.error('Daily briefing error:', error as Error);
    res.status(500).json({ error: '简报生成失败' });
  }
}));

// ============================================================
// 健康检查
// ============================================================

router.get('/ai/health', asyncHandler(async (_req: Request, res: Response) => {
  const health = await aiService.healthCheck();
  res.json(health);
}));

export default router;
