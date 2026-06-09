/**
 * AI策略推荐 API
 * 基于用户输入和市场数据，AI推荐投资策略
 */

import { Router, Request, Response } from 'express';
import { db } from '../db/dbFactory';
import { asyncHandler, sendSuccess, sendValidationError } from '../utils/apiResponse';
import { chatStream, type AIMessage } from '../services/aiService';

const router = Router();

// ==================== AI策略推荐 ====================

router.post('/ai/strategy-recommend', asyncHandler(async (req: Request, res: Response) => {
  const { 
    risk_level = 'moderate',  // conservative, moderate, aggressive
    investment_horizon = 'medium',  // short, medium, long
    focus = 'balanced',  // value, growth, momentum, dividend, balanced
    capital_size = 'medium',  // small (<10万), medium (10-100万), large (>100万)
    watchlist = []  // 用户自选股票列表
  } = req.body;

  // 获取市场数据摘要
  let marketSummary = '';
  try {
    // 获取涨跌统计
    const stats = await db.connection('daily_quotes')
      .join('stocks', 'stocks.id', 'daily_quotes.stock_id')
      .whereRaw('daily_quotes.trade_date = (SELECT MAX(trade_date) FROM daily_quotes)')
      .select(
        db.connection.raw('COUNT(*) as total'),
        db.connection.raw('SUM(CASE WHEN change_percent > 0 THEN 1 ELSE 0 END) as up_count'),
        db.connection.raw('SUM(CASE WHEN change_percent < 0 THEN 1 ELSE 0 END) as down_count'),
        db.connection.raw('SUM(CASE WHEN change_percent >= 9.9 THEN 1 ELSE 0 END) as limit_up'),
        db.connection.raw('SUM(CASE WHEN change_percent <= -9.9 THEN 1 ELSE 0 END) as limit_down'),
        db.connection.raw('AVG(change_percent) as avg_change'),
        db.connection.raw('AVG(turnover_rate) as avg_turnover')
      )
      .first();

    marketSummary = `
当前市场概况：
- 上涨/下跌：${stats?.up_count || 0}/${stats?.down_count || 0}
- 涨停/跌停：${stats?.limit_up || 0}/${stats?.limit_down || 0}
- 平均涨跌幅：${parseFloat(stats?.avg_change || '0').toFixed(2)}%
- 平均换手率：${parseFloat(stats?.avg_turnover || '0').toFixed(2)}%
`;
  } catch (e) {
    console.warn('获取市场数据失败:', e);
  }

  // 获取热门行业
  let industrySummary = '';
  try {
    const hotIndustries = await db.connection('daily_quotes')
      .join('stocks', 'stocks.id', 'daily_quotes.stock_id')
      .whereRaw('daily_quotes.trade_date = (SELECT MAX(trade_date) FROM daily_quotes)')
      .whereNotNull('stocks.industry')
      .select('stocks.industry')
      .avg('daily_quotes.change_percent as avg_change')
      .count('* as count')
      .groupBy('stocks.industry')
      .orderBy('avg_change', 'desc')
      .limit(10);

    industrySummary = '\n热门行业：\n' + 
      hotIndustries.map((i: any) => 
        `- ${i.industry}: 平均涨幅 ${parseFloat(i.avg_change).toFixed(2)}%`
      ).join('\n');
  } catch (e) {
    console.warn('获取行业数据失败:', e);
  }

  // 构建Prompt
  const systemPrompt = `你是澄观，一位专业的AI投资研究助手。基于用户的配置偏好和当前市场数据，推荐合适的投资策略。

用户偏好：
- 风险偏好：${risk_level === 'conservative' ? '保守型' : risk_level === 'aggressive' ? '激进型' : '稳健型'}
- 投资周期：${investment_horizon === 'short' ? '短期(1-4周)' : investment_horizon === 'long' ? '长期(3个月以上)' : '中期(1-3个月)'}
- 投资风格：${focus === 'value' ? '价值投资' : focus === 'growth' ? '成长投资' : focus === 'momentum' ? '动量策略' : focus === 'dividend' ? '高股息' : '均衡配置'}
- 资金规模：${capital_size === 'small' ? '小型(<10万)' : capital_size === 'large' ? '大型(>100万)' : '中型(10-100万)'}

${marketSummary}
${industrySummary}

请根据以上信息，推荐2-3个具体的投资策略，每个策略包含：
1. 策略名称
2. 策略描述
3. 核心逻辑（为什么适合当前市场和用户偏好）
4. 筛选条件（具体的指标和阈值）
5. 风险提示

输出格式要求：
- 使用JSON格式返回
- 包含strategies数组
- 每个strategy包含: name, description, logic, conditions (数组，每项包含field, operator, value), risk_warning`;

  const messages: AIMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: '请根据我的偏好和当前市场情况，推荐合适的投资策略。' }
  ];

  try {
    // 使用流式响应
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const stream = chatStream({ messages });
    
    for await (const chunk of stream) {
      res.write(`data: ${JSON.stringify({ content: chunk.content, done: chunk.done })}\n\n`);
      
      if (chunk.done) {
        res.end();
      }
    }
  } catch (error) {
    console.error('AI策略推荐失败:', error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: 'AI策略推荐失败',
        details: error instanceof Error ? error.message : '未知错误'
      });
    }
  }
}));

// ==================== 获取市场洞察 ====================

router.get('/ai/market-insights', asyncHandler(async (_req: Request, res: Response) => {
  try {
    // 获取最新交易日
    const latestDate = await db.connection('daily_quotes')
      .max('trade_date as date')
      .first();

    if (!latestDate?.date) {
      return sendSuccess(res, { insights: [], date: null });
    }

    // 获取市场统计数据
    const stats = await db.connection('daily_quotes')
      .where('trade_date', latestDate.date)
      .select(
        db.connection.raw('COUNT(*) as total_stocks'),
        db.connection.raw('AVG(change_percent) as market_avg'),
        db.connection.raw('STDDEV(change_percent) as market_volatility'),
        db.connection.raw('SUM(CASE WHEN change_percent > 3 THEN 1 ELSE 0 END) as strong_up'),
        db.connection.raw('SUM(CASE WHEN change_percent < -3 THEN 1 ELSE 0 END) as strong_down'),
        db.connection.raw('AVG(turnover_rate) as avg_turnover')
      )
      .first();

    // 生成洞察
    const insights = [];
    
    if (stats) {
      const avgChange = parseFloat(stats.market_avg || '0');
      const volatility = parseFloat(stats.market_volatility || '0');
      
      // 市场情绪洞察
      if (avgChange > 1) {
        insights.push({
          type: 'bullish',
          title: '市场情绪偏多',
          description: `市场平均涨幅 ${avgChange.toFixed(2)}%，上涨动能较强`,
          suggestion: '可适当增加仓位，关注强势板块'
        });
      } else if (avgChange < -1) {
        insights.push({
          type: 'bearish',
          title: '市场情绪偏空',
          description: `市场平均跌幅 ${Math.abs(avgChange).toFixed(2)}%，下跌压力较大`,
          suggestion: '建议控制仓位，等待企稳信号'
        });
      } else {
        insights.push({
          type: 'neutral',
          title: '市场震荡整理',
          description: `市场涨跌幅 ${avgChange.toFixed(2)}%，多空博弈中`,
          suggestion: '可关注结构性机会，轻仓操作'
        });
      }

      // 波动率洞察
      if (volatility > 3) {
        insights.push({
          type: 'volatile',
          title: '市场波动加大',
          description: `波动率 ${volatility.toFixed(2)}%，个股分化明显`,
          suggestion: '注意风险控制，设置止损'
        });
      }

      // 强势股洞察
      const strongUpRatio = (parseInt(stats.strong_up) / parseInt(stats.total_stocks)) * 100;
      if (strongUpRatio > 20) {
        insights.push({
          type: 'opportunity',
          title: '强势股活跃',
          description: `${strongUpRatio.toFixed(1)}% 的股票涨幅超过3%`,
          suggestion: '可关注动量策略，把握强势股机会'
        });
      }
    }

    sendSuccess(res, {
      date: latestDate.date,
      stats,
      insights
    });
  } catch (error) {
    console.error('获取市场洞察失败:', error);
    sendSuccess(res, { insights: [], date: null });
  }
}));

export default router;
