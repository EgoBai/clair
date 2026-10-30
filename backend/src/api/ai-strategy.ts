/**
 * AI策略推荐 API
 * 基于用户输入和市场数据，AI推荐投资策略
 */

import { Router, Request, Response } from 'express';
import { db } from '../db/dbFactory';
import { asyncHandler } from '../utils/apiResponse';
import { chatStream, type AIMessage } from '../services/aiService';

import { aiTiming } from '../middleware/aiTiming';

const router = Router();

// F12/A-07: AI 接口耗时日志（端点/状态/耗时/首字节）
router.use(aiTiming);

/**
 * 【P0-LEAK C-2 同族】错误文案脱敏。
 * 本端点走 chatStream → gatewayFetch：上游 401 时 HttpStatusError.message
 * 内含「上游 body 前 500 字符」，即掩码 key（实测 "****0a09"）。
 * 与 ai-filter.ts 的 redactSecrets 同款正则（两文件各自内联，避免 API 层
 * 互相 import）；响应体经此脱敏，不留任何 key 指纹——连掩码都不留。
 */
function redactSecrets(input: string): string {
  return input
    .replace(/\b(?:sk|rk|dk|fk)-[A-Za-z0-9_-]{4,}/g, '[REDACTED]')
    .replace(/\*{2,}[0-9a-zA-Z]{2,}/g, '[REDACTED]')
    .replace(/\bBearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/\b[A-Fa-f0-9]{32,}\b/g, '[REDACTED]');
}

// ==================== AI策略推荐 ====================

/**
 * 【诚实降级 · 与 ai-chat.ts 同口径，不另造文案】
 * 「LLM 网关不可用」= 依赖不可用的**业务性降级**，不是服务端崩溃。
 * 措辞沿用 ai-chat.ts sendUnavailable 的 "LLM 网关不可用 / 未生成任何…" 句式。
 */
const LLM_UNAVAILABLE_ERROR = 'AI策略推荐失败，请稍后重试';
const LLM_UNAVAILABLE_MESSAGE = 'LLM 网关不可用，未生成任何策略推荐';

/**
 * SSE 形态的降级终止帧发送器。
 *
 * 本端点在 try 开头就 setHeader('text/event-stream')，HTTP 状态码语义上本就是 200，
 * 头一旦发出就**改不了状态码**——所以「LLM 不可用」不能靠状态码表达，
 * 只能在**流内**发一个结构化终止事件：success:false + dataSource:'unavailable'
 * + code:'UPSTREAM_UNAVAILABLE' + 中文原因，再正常 res.end() 关流。
 * 绝不让前端收到空流 / 半截流就当成一次成功的策略推荐。
 */
function sendStreamUnavailable(res: Response, message: string): void {
  res.write(`data: ${JSON.stringify({
    content: `\n\n⚠️ ${message}`,
    done: true,
    success: false,
    dataSource: 'unavailable',
    code: 'UPSTREAM_UNAVAILABLE',
    error: LLM_UNAVAILABLE_ERROR,
    message,
  })}\n\n`);
  // 与 ai-chat.ts:158 同款终止标记，前端忽略无法 JSON.parse 的 [DONE] 帧
  res.write('data: [DONE]\n\n');
  res.end();
}

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
  // 诚实契约：真实行情是否成功注入 prompt（下面两段均为 best-effort，失败不静默）
  let marketDataInjected = false;
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
    // 有真实聚合行才算注入成功（stats 为 undefined 时上面会是全 0 的伪市场概况）
    if (stats && parseInt(stats.total) > 0) marketDataInjected = true;
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

    // 诚实契约：SSE 无顶层 JSON，把 dataSource 放进每一帧（done 帧必带）。
    // marketDataInjected=false 表示真实行情未能注入，此时 AI 输出未基于真实市场数据。
    const dataSource = marketDataInjected ? 'real' : 'unavailable';

    for await (const chunk of stream) {
      // 【诚实红线】aiService.chatStream 内部 catch 会把上游失败（401/402/超时/
      // 网络错误）**吞成**一个 done 帧：content 一律以 '\n\n⚠️' 起头
      // （见 aiService.ts:181-190），**不抛异常**，故外层 catch 收不到。
      // 若不在这里识别，这段错误文本会连同上面 dataSource:'real' 一起出街
      // ——等于把「LLM 网关不可用」粉饰成一次成功的策略推荐。
      if (chunk.done && /⚠️/.test(chunk.content || '')) {
        sendStreamUnavailable(res, LLM_UNAVAILABLE_MESSAGE);
        return;
      }

      res.write(`data: ${JSON.stringify({ content: chunk.content, done: chunk.done, dataSource })}\n\n`);

      if (chunk.done) {
        if (!marketDataInjected) {
          res.write(`data: ${JSON.stringify({ content: '', done: true, dataSource, message: '本地真实行情库未取到当日市场数据，本次策略推荐未基于真实市场统计' })}\n\n`);
        }
        res.write('data: [DONE]\n\n');
        res.end();
        return;
      }
    }

    // 流走完却**没有** done 帧（上游提前断流）：不补终止帧就是一条悬空连接，
    // 前端要么一直转圈、要么把半截内容当完整结果。如实标注为不可用。
    sendStreamUnavailable(res, 'LLM 网关未返回完整结果（流异常结束），未生成任何策略推荐');
  } catch (error) {
    // 【P0-LEAK C-2 同族】message 可能是 HttpStatusError 的「上游 401 body」，
    // 内含掩码 key——**响应体不透传上游 message**（与 ai-filter 外层 catch 同标准：
    // 不透传比正则脱敏更稳，无形态漏网）；日志经 redactSecrets 后落盘。
    // 另：上方已 setHeader('text/event-stream')，若不在 JSON 前覆盖回
    // application/json，这段错误体会带着 SSE 头出街（前端 res.json() 解析失败）。
    console.error('AI策略推荐失败:', redactSecrets(error instanceof Error ? error.message : String(error)));
    if (!res.headersSent) {
      // 头尚未发出：改写回 JSON 形态，与 ai-chat.ts sendUnavailable 同构 ——
      // 200 + success:false + dataSource:'unavailable' + code + 中文原因。
      // 为什么是 200 不是 500：LLM 网关不可用是**依赖不可用的业务性降级**，
      // 本服务已正常走完流程并如实回报「一条策略都没生成」；而前端 `if(!res.ok) throw`
      // 会在解析 body 之前就抛，500 会让这里的诚实标注永远传不到用户眼前。
      // 真正的代码 bug 才该 5xx（那类由 asyncHandler → globalErrorHandler 统一出）。
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.status(200).json({
        success: false,
        dataSource: 'unavailable',
        code: 'UPSTREAM_UNAVAILABLE',
        error: LLM_UNAVAILABLE_ERROR,
        message: LLM_UNAVAILABLE_MESSAGE,
        timestamp: new Date().toISOString(),
      });
      return;
    }
    // 头已发出：状态码动不了，只能在流内补发结构化降级终止帧。
    sendStreamUnavailable(res, LLM_UNAVAILABLE_MESSAGE);
  }
}));

// ==================== 获取市场洞察 ====================

/**
 * 诚实数据契约发送器（本文件统一出口）：顶层 dataSource 与 data 内同源。
 */
function sendHonest(
  res: Response,
  dataSource: 'real' | 'unavailable',
  data: Record<string, unknown>
): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(200).json({
    success: true,
    dataSource,
    data: { ...data, dataSource },
    timestamp: new Date().toISOString(),
  });
}

router.get('/ai/market-insights', asyncHandler(async (_req: Request, res: Response) => {
  try {
    // 获取最新交易日
    const latestDate = await db.connection('daily_quotes')
      .max('trade_date as date')
      .first();

    // 诚实空态：真实行情库无任何交易日 → unavailable，不用空 insights 冒充「今日无洞察」
    if (!latestDate?.date) {
      res.status(200).json({
        success: true,
        dataSource: 'unavailable',
        data: {
          insights: [], date: null, dataSource: 'unavailable',
          message: '本地真实行情库无任何交易日数据（daily_quotes 为空或未同步），未生成任何市场洞察',
        },
        timestamp: new Date().toISOString(),
      });
      return;
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
    const totalStocks = parseInt(stats.total_stocks) || 0;
    const strongUpRatio = totalStocks > 0
      ? (parseInt(stats.strong_up) / totalStocks) * 100
      : 0;
    if (strongUpRatio > 20) {
      insights.push({
        type: 'opportunity',
        title: '强势股活跃',
        description: `${strongUpRatio.toFixed(1)}% 的股票涨幅超过3%`,
        suggestion: '可关注动量策略，把握强势股机会'
      });
    }
    }

    sendHonest(res, 'real', {
      date: latestDate.date,
      stats,
      insights
    });
  } catch (error) {
    // 诚实红线：查询失败不能返回 {insights:[], date:null} 冒充「已查询但无洞察」
    console.error('获取市场洞察失败:', error);
    res.status(200).json({
      success: true,
      dataSource: 'unavailable',
      data: {
        insights: [], date: null, dataSource: 'unavailable',
        message: '本地真实行情库查询失败，未生成任何市场洞察',
      },
      timestamp: new Date().toISOString(),
    });
  }
}));

export default router;
