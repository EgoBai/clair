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

    // 注入用户自选股作为个性化上下文
    const symbols: string[] = req.body.symbols || [];
    if (symbols.length > 0) {
      const watchlistStocks = await db.connection('stocks')
        .whereIn('symbol', symbols)
        .select('symbol', 'name', 'current_price', 'change_percent', 'industry');
      if (watchlistStocks.length > 0) {
        const info = watchlistStocks.map(s => 
          `${s.name}(${Number(s.change_percent)>0?'+':''}${s.change_percent}%)`
        ).join('、');
        stockContext += `\n\n【用户自选股】${info}（共${watchlistStocks.length}只）`;
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
    const { getDb } = await import('../db/dbFactory');
    const db = getDb();
    
    // 获取真实个股涨跌数据
    const marketSummary: any = await db.getMarketSummary(new Date());
    const risingStocks = marketSummary?.risingStocks ?? 0;
    const fallingStocks = marketSummary?.fallingStocks ?? 0;
    const unchangedStocks = marketSummary?.unchangedStocks ?? 0;
    const totalStocks = marketSummary?.totalStocks ?? (risingStocks + fallingStocks + unchangedStocks);
    const totalTurnover = Number(marketSummary?.totalTurnover) || 0;
    
    // 获取板块数据（领涨板块、涨停分布）
    const sectorScores = await db.getSectorMomentumScore();
    const scores = sectorScores || [];
    const top3 = scores.slice(0, 3);
    const topNames = top3.map((s: any) => `${s.industry}(${s.score}分${Number(s.avg_change_percent) >= 0 ? '+' : ''}${Number(s.avg_change_percent).toFixed(1)}%)`).join('、');
    const hotSectors = scores.filter((s: any) => (s.limit_up_count || 0) >= 2);
    const hotNames = hotSectors.map((s: any) => `${s.industry}${s.limit_up_count}只涨停`).join('、');
    
    // 涨停数（从板块增强数据汇总，MarketSummary不含limitUpCount）
    const enhancedSectors = await db.getSectorPerformanceEnhanced();
    const limitUpCount = (enhancedSectors || []).reduce((sum: number, s: any) => sum + (Number(s.limit_up_count) || 0), 0);
    
    // 基于个股数据的涨跌比例
    const upPct = totalStocks > 0 ? Math.round((risingStocks / totalStocks) * 100) : 0;
    
    // 成交额格式化
    const turnoverStr = totalTurnover > 1e12 
      ? `${(totalTurnover / 1e12).toFixed(2)}万亿` 
      : totalTurnover > 1e8 
        ? `${(totalTurnover / 1e8).toFixed(0)}亿`
        : totalTurnover > 0 ? `${(totalTurnover / 1e4).toFixed(0)}万` : '暂无数据';

    // 规则引擎即时生成（基于个股真实数据）
    let mood: string, moodEmoji: string, overview: string;
    if (upPct >= 65) {
      mood = '强势上攻'; moodEmoji = '🔥';
      overview = `市场做多情绪高涨，${risingStocks}只上涨、${fallingStocks}只下跌。`;
    } else if (upPct >= 45) {
      mood = '温和上行'; moodEmoji = '📈';
      overview = `市场结构性行情，${risingStocks}只上涨${fallingStocks}只下跌，资金聚焦热点。`;
    } else if (upPct >= 30) {
      mood = '震荡整理'; moodEmoji = '📊';
      overview = `市场分化明显，${risingStocks}只上涨${fallingStocks}只下跌，存量博弈特征突出。`;
    } else {
      mood = '弱势调整'; moodEmoji = '📉';
      overview = `市场情绪偏谨慎，${fallingStocks}只个股下跌，防御策略为主。`;
    }

    const insight = {
      mood, moodEmoji,
      overview,
      topSectors: topNames,
      hotSectors: hotNames || '无',
      risingStocks, fallingStocks, unchangedStocks, upPct,
      limitUpCount,
      totalTurnover: turnoverStr,
      _rawTotalTurnover: totalTurnover,
      sections: [
        {
          icon: '📊', title: '市场情绪',
          text: `**${mood}** · ${overview}\n\n**领涨板块**：${topNames}\n涨停${limitUpCount}家，集中：${hotNames || '今日无集中涨停板块'}`
        },
        {
          icon: '💰', title: '资金流向',
          text: `上涨**${risingStocks}**只，下跌**${fallingStocks}**只，平盘**${unchangedStocks}**只\n\n**成交额**：${turnoverStr}\n**涨停**：${limitUpCount}家\n**资金聚焦方向**：${topNames.split('、').slice(0, 2).join('、')}\n操作建议：${upPct >= 45 ? '可适度参与强势板块，设好止损' : '控制仓位，等待右侧信号'}`
        },
        {
          icon: '📰', title: '策略参考',
          text: `${upPct >= 45 ? '· 关注景气度>70的高景气板块\n· 注意板块轮动节奏\n· 强势板块回调可关注' : '· 防御型配置为主\n· 关注低估值高股息品种\n· 等待市场企稳信号'}\n\n⚠️ 以上为规则引擎分析，不构成投资建议`
        },
      ],
    };

    res.json({ success: true, data: insight });
  } catch (error) {
    res.status(500).json({ success: false, error: '获取市场洞察失败' });
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

// ============================================================
// AI市场解读（LLM生成）
// ============================================================

router.get('/ai/market-insight-llm', asyncHandler(async (_req: Request, res: Response) => {
  try {
    const db = getDb();
    
    // 获取板块数据
    const sectors = await db.getSectorMomentumScore();
    const topSectors = sectors.slice(0, 10);
    const bottomSectors = sectors.slice(-5).reverse();
    
    // 计算市场宽度
    const upSectors = sectors.filter(s => s.avg_change_percent > 0).length;
    const downSectors = sectors.filter(s => s.avg_change_percent < 0).length;
    const upRatio = Math.round((upSectors / (sectors.length || 1)) * 100);
    
    // 计算涨停跌停
    const limitUpSectors = sectors.filter(s => s.limit_up_count > 0);
    const totalLimitUp = limitUpSectors.reduce((sum, s) => sum + s.limit_up_count, 0);
    
    // 计算平均涨幅
    const avgChange = sectors.reduce((sum, s) => sum + s.avg_change_percent, 0) / (sectors.length || 1);
    
    // 构建市场数据
    const marketData = {
      sectors: topSectors.map(s => ({
        industry: s.industry,
        score: s.score,
        avgChange: s.avg_change_percent,
        limitUp: s.limit_up_count,
        stockCount: s.stock_count,
      })),
      bottomSectors: bottomSectors.map(s => ({
        industry: s.industry,
        score: s.score,
        avgChange: s.avg_change_percent,
      })),
      marketBreadth: {
        up: upSectors,
        down: downSectors,
        neutral: sectors.length - upSectors - downSectors,
        upRatio,
      },
      limitUp: totalLimitUp,
      avgChange: Math.round(avgChange * 100) / 100,
      timestamp: new Date().toISOString(),
    };
    
    // 使用LLM生成市场解读
    const prompt = `基于以下A股市场数据，生成今日市场解读：

## 板块数据（Top 10）
${topSectors.map(s => `- ${s.industry}: 景气度${s.score}分, 涨幅${s.avg_change_percent > 0 ? '+' : ''}${s.avg_change_percent}%, 涨停${s.limit_up_count}只, ${s.stock_count}只股票`).join('\n')}

## 市场宽度
- 上涨板块: ${upSectors}个
- 下跌板块: ${downSectors}个
- 平盘板块: ${sectors.length - upSectors - downSectors}个
- 上涨比例: ${upRatio}%

## 涨停统计
- 总涨停: ${totalLimitUp}只

## 平均涨幅
- 板块平均涨幅: ${avgChange > 0 ? '+' : ''}${avgChange}%

请从以下角度生成市场解读：

### 一、市场基本面
（指数表现、涨跌分布、涨停跌停、市场情绪判断）

### 二、资金面分析
（资金流入板块、资金流出板块、资金特征）

### 三、政策/消息面
（市场动态、政策观察、操作建议）

### 四、风险提示
（需要关注的风险因素）

输出格式要求：
1. 每个部分用**加粗标题**
2. 关键数据用**加粗**标注
3. 操作建议要具体可执行
4. 语言简洁专业，控制在500字以内
5. 不确定的信息明确标注"不确定"`;

    const aiResponse = await aiService.chat({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.5,
      maxTokens: 1000,
    });
    
    // 解析LLM输出，生成结构化数据
    const insight = parseMarketInsight(aiResponse.content, marketData);
    
    res.json({ data: insight, success: true });
  } catch (error) {
    logger.error('Market insight error:', error as Error);
    res.status(500).json({ error: '市场解读生成失败' });
  }
}));

/**
 * 解析LLM输出，生成结构化市场解读
 */
function parseMarketInsight(llmOutput: string, marketData: any) {
  // 提取各部分
  const sections = [];
  
  // 解析市场基本面
  const fundamentalMatch = llmOutput.match(/### 一、市场基本面([\s\S]*?)(?=### 二、|$)/);
  if (fundamentalMatch) {
    sections.push({
      title: '一、市场基本面',
      icon: '📊',
      text: formatInsightSection(fundamentalMatch[1]),
    });
  }
  
  // 解析资金面分析
  const capitalMatch = llmOutput.match(/### 二、资金面分析([\s\S]*?)(?=### 三、|$)/);
  if (capitalMatch) {
    sections.push({
      title: '二、资金面分析',
      icon: '💰',
      text: formatInsightSection(capitalMatch[1]),
    });
  }
  
  // 解析政策/消息面
  const policyMatch = llmOutput.match(/### 三、政策\/消息面([\s\S]*?)(?=### 四、|$)/);
  if (policyMatch) {
    sections.push({
      title: '三、政策/消息面',
      icon: '📰',
      text: formatInsightSection(policyMatch[1]),
    });
  }
  
  // 解析风险提示
  const riskMatch = llmOutput.match(/### 四、风险提示([\s\S]*?)$/);
  if (riskMatch) {
    sections.push({
      title: '四、风险提示',
      icon: '⚠️',
      text: formatInsightSection(riskMatch[1]),
    });
  }
  
  // 如果解析失败，使用整个输出
  if (sections.length === 0) {
    sections.push({
      title: '市场解读',
      icon: '📊',
      text: llmOutput,
    });
  }
  
  // 判断市场情绪
  const avgChange = marketData.avgChange;
  let mood, moodEmoji;
  if (avgChange > 1.5 && marketData.marketBreadth.upRatio > 70) {
    mood = '强势上攻';
    moodEmoji = '🔥';
  } else if (avgChange > 0.5) {
    mood = '温和上行';
    moodEmoji = '📈';
  } else if (avgChange > -0.3) {
    mood = '震荡整理';
    moodEmoji = '⚖️';
  } else if (avgChange > -1) {
    mood = '弱势调整';
    moodEmoji = '📉';
  } else {
    mood = '大幅下挫';
    moodEmoji = '🌧️';
  }
  
  return {
    mood,
    moodEmoji,
    sections,
    marketBreadth: {
      up: marketData.marketBreadth.up,
      down: marketData.marketBreadth.down,
      neutral: marketData.marketBreadth.neutral,
      breadthRatio: marketData.marketBreadth.upRatio / 100,
      stockUpRatio: marketData.marketBreadth.upRatio,
    },
    avgIndexChange: marketData.avgChange,
    topSectors: marketData.sectors.map((s: any) => ({
      industry: s.industry,
      score: s.score,
      avgChange: s.avgChange,
    })),
    weakSectors: marketData.bottomSectors.map((s: any) => ({
      industry: s.industry,
      score: s.score,
      avgChange: s.avgChange,
    })),
    limitUpCount: marketData.limitUp,
    limitDownCount: 0,
    timestamp: Date.now(),
  };
}

/**
 * 格式化洞察部分
 */
function formatInsightSection(text: string): string {
  return text
    .split('\n')
    .map(line => {
      // 处理标题
      if (line.startsWith('**') && line.endsWith('**')) {
        return line;
      }
      // 处理列表项
      if (line.startsWith('-') || line.startsWith('·') || line.startsWith('•')) {
        return line;
      }
      // 处理普通段落
      return line;
    })
    .filter(line => line.trim())
    .join('\n');
}

export default router;
