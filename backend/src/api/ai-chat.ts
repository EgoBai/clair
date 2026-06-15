/**
 * AI API Routes — AI对话和分析接口
 * 
 * 澄观的核心AI能力入口
 */

import { Router, Request, Response } from 'express';
import { asyncHandler } from '../utils/apiResponse';
import aiService from '../services/aiService';
import { logger } from '../services/logger';
import { getDb } from '../db/dbFactory';

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
  ];

  // 自动注入实时市场数据作为上下文
  try {
    const db = getDb();
    const topSectors = await db.getSectorMomentumScore();
    const top5 = topSectors.slice(0, 5);
    const marketContext = `
【当前市场数据】
- 时间: ${new Date().toLocaleString('zh-CN')}
- 板块景气度Top5: ${top5.map(s => `${s.industry}(${s.score}分, 涨${s.avg_change_percent}%)`).join(', ')}
- 涨停热点: ${top5.filter(s => s.limit_up_count > 0).map(s => `${s.industry}(${s.limit_up_count}家涨停)`).join(', ') || '无'}
- 市场情绪: ${(top5.reduce((a, b) => a + Number(b.avg_change_percent), 0) / top5.length).toFixed(2)}%平均涨幅`;

    // 如果有symbol参数，注入个股数据
    let stockContext = '';
    const symbol = req.body.symbol;
    if (symbol) {
      const stock = await db.connection('stocks').where('symbol', symbol).first();
      if (stock) {
        stockContext = `\n\n【当前股票】${stock.name}(${stock.symbol}) — 价格${stock.current_price}, 涨幅${stock.change_percent}%, 行业${stock.industry}, 市值${(Number(stock.market_cap)/1e4).toFixed(0)}亿`;
      }
    }

    messages.unshift({
      role: 'system',
      content: `${marketContext}${stockContext}\n\n请基于以上实时市场数据回答用户问题。`,
    });
  } catch (e) {
    // 数据注入失败不阻塞对话
  }

  messages.push({ role: 'user' as const, content: message });

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

// ============================================================
// 市场洞察（DiscoverPage 专用）
// ============================================================

router.get('/ai/market-insight', asyncHandler(async (_req: Request, res: Response) => {
  try {
    // 从数据库获取真实市场数据
    const { getDb } = await import('../db/dbFactory');
    const db = getDb();
    
    // 获取市场摘要
    const today = new Date();
    const marketSummary = await db.getMarketSummary(today);
    
    // 提取数据
    const risingStocks = marketSummary?.risingStocks || 0;
    const fallingStocks = marketSummary?.fallingStocks || 0;
    const avgChange = marketSummary?.totalStocks > 0 
      ? (risingStocks - fallingStocks) / marketSummary.totalStocks * 100 
      : 0;
    
    // 获取领涨板块（前5）
    const topSectors = (marketSummary?.industryPerformance || [])
      .slice(0, 5)
      .map((s: any) => ({ 
        industry: s.industry, 
        avgChange: parseFloat(s.avg_change_percent || 0).toFixed(2) 
      }));

    // 使用 LLM 生成市场解读
    const prompt = `请根据以下A股市场数据，生成结构化的市场解读报告。

## 市场数据
- 涨跌比: ${risingStocks}:${fallingStocks}
- 总股票数: ${marketSummary?.totalStocks || 0}
- 平均涨跌幅: ${avgChange.toFixed(2)}%
- 领涨板块: ${topSectors.map((s: any) => `${s.industry}(+${s.avgChange}%)`).join(', ')}

## 输出格式要求
请严格按照以下JSON格式输出，不要添加任何其他内容：

{
  "mood": "市场情绪（强势上攻/温和上行/震荡整理/弱势调整/恐慌下跌）",
  "moodEmoji": "对应emoji（🔥/📈/📊/📉/❄️）",
  "sections": [
    {"icon": "📊", "title": "基本面", "text": "2-3行分析"},
    {"icon": "💰", "title": "资金面", "text": "2-3行分析"},
    {"icon": "📰", "title": "政策面", "text": "2-3行分析"}
  ]
}

注意：text中可以用**加粗**标记重点，用·或-标记列表项。`;

    const aiResponse = await aiService.chat({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.5,
      maxTokens: 1000,
    });

    // 解析 AI 响应
    let aiData: any;
    try {
      // 提取 JSON 部分
      const jsonMatch = aiResponse.content.match(/\{[\s\S]*\}/);
      aiData = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch {
      aiData = null;
    }

    // 如果 AI 解析失败，使用默认值
    if (!aiData) {
      const mood = avgChange > 1 ? '强势上攻' : avgChange > 0 ? '温和上行' : avgChange > -1 ? '震荡整理' : '弱势调整';
      const moodEmoji = avgChange > 1 ? '🔥' : avgChange > 0 ? '📈' : avgChange > -1 ? '📊' : '📉';
      aiData = {
        mood,
        moodEmoji,
        sections: [
          { icon: '📊', title: '基本面', text: `市场${mood}，涨跌比${risingStocks}:${fallingStocks}` },
          { icon: '💰', title: '资金面', text: `总股票数${marketSummary?.totalStocks || 0}只` },
          { icon: '📰', title: '政策面', text: '暂无重大政策消息' },
        ],
      };
    }

    res.json({
      data: {
        ...aiData,
        marketBreadth: { up: risingStocks, down: fallingStocks },
        avgIndexChange: avgChange,
        limitUpCount: 0, // 涨停数据需要额外计算
        limitDownCount: 0, // 跌停数据需要额外计算
        topSectors,
      },
    });
  } catch (error) {
    logger.error('Market insight error:', error as Error);
    res.status(500).json({ error: '市场洞察生成失败' });
  }
}));

// ============================================================
// 自选股追踪总结（WatchlistPage 专用）
// ============================================================

router.post('/ai/watchlist-summary', asyncHandler(async (req: Request, res: Response) => {
  const { symbols, quotes } = req.body;

  if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
    res.status(400).json({ error: '请提供自选股列表' });
    return;
  }

  try {
    // 构建股票数据摘要
    const stockSummary = symbols.map((sym: string, i: number) => {
      const q = quotes?.[i] || {};
      return `- ${sym}: 价格${q.price || 'N/A'}, 涨跌幅${q.changePercent || 0}%, 换手率${q.turnoverRate || 0}%`;
    }).join('\n');

    const prompt = `请为以下自选股组合生成追踪总结报告。

## 自选股数据
${stockSummary}

## 输出要求
1. 整体表现概述（1-2句话）
2. 板块分布分析
3. 值得关注的信号（异动、趋势变化）
4. 操作建议（简短）

请用简洁的中文回答，控制在200字以内。`;

    const aiResponse = await aiService.chat({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.5,
      maxTokens: 500,
    });

    res.json({ summary: aiResponse.content });
  } catch (error) {
    logger.error('Watchlist summary error:', error as Error);
    res.status(500).json({ error: '追踪总结生成失败' });
  }
}));

// ============================================================
// 交易行为分析（ReviewPage 专用）
// ============================================================

router.post('/ai/trade-analysis', asyncHandler(async (req: Request, res: Response) => {
  const { trades, stats } = req.body;

  try {
    const prompt = `请根据以下交易记录，分析用户的交易行为模式并给出改进建议。

## 交易统计
- 总交易次数: ${stats?.totalTrades || 0}
- 胜率: ${stats?.winRate || 0}%
- 平均持仓天数: ${stats?.avgHoldingDays || 0}
- 总收益率: ${stats?.totalReturn || 0}%
- 最大回撤: ${stats?.maxDrawdown || 0}%

## 近期交易记录
${trades?.slice(0, 10).map((t: any) =>
  `- ${t.symbol} ${t.type} ${t.date} 价格${t.price} 数量${t.quantity} 收益${t.profit || 'N/A'}`
).join('\n') || '暂无交易记录'}

## 输出要求
请从以下维度分析：
1. 交易频率与时机偏好
2. 止损/止盈行为模式
3. 持仓周期分布
4. 策略使用偏好
5. 风险暴露评估
6. 改进建议

请用简洁的中文回答，控制在300字以内。`;

    const aiResponse = await aiService.chat({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.5,
      maxTokens: 800,
    });

    res.json({ analysis: aiResponse.content });
  } catch (error) {
    logger.error('Trade analysis error:', error as Error);
    res.status(500).json({ error: '交易分析失败' });
  }
}));

router.get('/ai/health', asyncHandler(async (_req: Request, res: Response) => {
  const health = await aiService.healthCheck();
  res.json(health);
}));

export default router;
