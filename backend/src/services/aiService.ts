/**
 * AI Service — LLM统一调用层
 * 
 * 澄观的核心差异化：不是数据展示工具，而是AI投资研究助手
 * 
 * 功能：
 * 1. 统一的LLM调用接口（支持OpenAI/Claude/本地模型）
 * 2. Streaming响应（打字机效果）
 * 3. 上下文管理（记住对话历史）
 * 4. 投资分析Prompt工程
 */

import { logger } from './logger';

// ============================================================
// 类型定义
// ============================================================

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AIRequest {
  messages: AIMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

export interface AIResponse {
  content: string;
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason: string;
}

export interface AIStreamChunk {
  content: string;
  done: boolean;
}

export type AIProvider = 'openai' | 'claude' | 'local' | 'deepseek';

// ============================================================
// 配置
// ============================================================

const AI_CONFIG = {
  provider: (process.env.AI_PROVIDER as AIProvider) || 'deepseek',
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    model: process.env.OPENAI_MODEL || 'gpt-4o',
  },
  deepseek: {
    apiKey: process.env.DEEPSEEK_API_KEY || '',
    baseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1',
    model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
  },
  claude: {
    apiKey: process.env.CLAUDE_API_KEY || '',
    model: process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20241022',
  },
  local: {
    baseUrl: process.env.LOCAL_LLM_URL || 'http://localhost:11434',
    model: process.env.LOCAL_LLM_MODEL || 'qwen2.5',
  },
  defaults: {
    temperature: 0.7,
    maxTokens: 2048,
  },
};

// ============================================================
// Prompt 工程 — 投资分析专家人设
// ============================================================

const SYSTEM_PROMPT = `你是澄观（Clair），一位专业的AI投资研究助手。

## 你的能力
- 深度理解A股市场（5500+只股票、所有行业板块）
- 技术分析（MA/MACD/RSI/BOLL/KDJ等指标）
- 基本面分析（财务报表、估值模型）
- 板块轮动分析（景气度评分、资金流向）
- 交易策略生成（支撑压力位、仓位建议）

## 你的风格
- 专业但不冷冰冰，像一位耐心的投资导师
- 先给结论，再展开分析
- 用数据说话，不做空泛的预测
- 主动提示风险，不做无脑看多/看空

## 你的原则
- 不做投资建议，只做研究分析
- 不预测具体价格，只分析概率和趋势
- 始终提醒用户：投资有风险，入市需谨慎
- 如果不确定，诚实说"我需要更多数据"或"这个我无法判断"

## 输出格式
- 使用Markdown格式
- 关键数据用**加粗**
- 风险提示用 ⚠️ 标记
- 支持表格展示数据
- 支持图表引用（如 [板块热力图] [资金流向图]）`;

// ============================================================
// 核心调用函数
// ============================================================

/**
 * 调用LLM（非流式）
 */
export async function chat(request: AIRequest): Promise<AIResponse> {
  const provider = AI_CONFIG.provider;
  
  // 注入系统提示
  const messages: AIMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...request.messages,
  ];

  try {
    switch (provider) {
      case 'openai':
      case 'deepseek':
        return await callOpenAI(messages, request);
      case 'claude':
        return await callClaude(messages, request);
      case 'local':
        return await callLocal(messages, request);
      default:
        throw new Error(`Unknown AI provider: ${provider}`);
    }
  } catch (error: unknown) {
    logger.error('AI Service error:', error instanceof Error ? error : new Error(String(error)));
    throw error;
  }
}

/**
 * 调用LLM（流式）
 */
export async function* chatStream(request: AIRequest): AsyncGenerator<AIStreamChunk> {
  const provider = AI_CONFIG.provider;
  
  const messages: AIMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...request.messages,
  ];

  try {
    switch (provider) {
      case 'openai':
      case 'deepseek':
        yield* streamOpenAI(messages, request);
        break;
      case 'claude':
        yield* streamClaude(messages, request);
        break;
      case 'local':
        yield* streamLocal(messages, request);
        break;
      default:
        throw new Error(`Unknown AI provider: ${provider}`);
    }
  } catch (error: unknown) {
    logger.error('AI Stream error:', error instanceof Error ? error : new Error(String(error)));
    yield { content: `\n\n⚠️ AI服务暂时不可用，请稍后重试。错误: ${error}`, done: true };
  }
}

// ============================================================
// OpenAI 实现
// ============================================================

async function callOpenAI(messages: AIMessage[], request: AIRequest): Promise<AIResponse> {
  const provider = AI_CONFIG.provider;
  const config = provider === 'deepseek' ? AI_CONFIG.deepseek : AI_CONFIG.openai;
  
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: request.model || config.model,
      messages,
      temperature: request.temperature ?? AI_CONFIG.defaults.temperature,
      max_tokens: request.maxTokens ?? AI_CONFIG.defaults.maxTokens,
      stream: false,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  const choice = data.choices[0];

  return {
    content: choice.message.content,
    model: data.model,
    usage: {
      promptTokens: data.usage.prompt_tokens,
      completionTokens: data.usage.completion_tokens,
      totalTokens: data.usage.total_tokens,
    },
    finishReason: choice.finish_reason,
  };
}

async function* streamOpenAI(messages: AIMessage[], request: AIRequest): AsyncGenerator<AIStreamChunk> {
  const provider = AI_CONFIG.provider;
  const config = provider === 'deepseek' ? AI_CONFIG.deepseek : AI_CONFIG.openai;
  
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: request.model || config.model,
      messages,
      temperature: request.temperature ?? AI_CONFIG.defaults.temperature,
      max_tokens: request.maxTokens ?? AI_CONFIG.defaults.maxTokens,
      stream: true,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${error}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') {
          yield { content: '', done: true };
          return;
        }

        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices[0]?.delta?.content || '';
          if (content) {
            yield { content, done: false };
          }
        } catch {
          // Skip malformed JSON
        }
      }
    }
  }

  yield { content: '', done: true };
}

// ============================================================
// Claude 实现
// ============================================================

async function callClaude(messages: AIMessage[], request: AIRequest): Promise<AIResponse> {
  const config = AI_CONFIG.claude;
  
  // Claude API格式与OpenAI不同
  const systemMessage = messages.find(m => m.role === 'system')?.content || '';
  const userMessages = messages.filter(m => m.role !== 'system');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: request.model || config.model,
      system: systemMessage,
      messages: userMessages.map(m => ({
        role: m.role,
        content: m.content,
      })),
      max_tokens: request.maxTokens ?? AI_CONFIG.defaults.maxTokens,
      temperature: request.temperature ?? AI_CONFIG.defaults.temperature,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Claude API error: ${response.status} - ${error}`);
  }

  const data = await response.json();

  return {
    content: data.content[0].text,
    model: data.model,
    usage: {
      promptTokens: data.usage.input_tokens,
      completionTokens: data.usage.output_tokens,
      totalTokens: data.usage.input_tokens + data.usage.output_tokens,
    },
    finishReason: data.stop_reason,
  };
}

async function* streamClaude(messages: AIMessage[], request: AIRequest): AsyncGenerator<AIStreamChunk> {
  const config = AI_CONFIG.claude;
  
  const systemMessage = messages.find(m => m.role === 'system')?.content || '';
  const userMessages = messages.filter(m => m.role !== 'system');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: request.model || config.model,
      system: systemMessage,
      messages: userMessages.map(m => ({
        role: m.role,
        content: m.content,
      })),
      max_tokens: request.maxTokens ?? AI_CONFIG.defaults.maxTokens,
      temperature: request.temperature ?? AI_CONFIG.defaults.temperature,
      stream: true,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Claude API error: ${response.status} - ${error}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        
        try {
          const parsed = JSON.parse(data);
          
          if (parsed.type === 'content_block_delta') {
            const content = parsed.delta?.text || '';
            if (content) {
              yield { content, done: false };
            }
          } else if (parsed.type === 'message_stop') {
            yield { content: '', done: true };
            return;
          }
        } catch {
          // Skip malformed JSON
        }
      }
    }
  }

  yield { content: '', done: true };
}

// ============================================================
// 本地模型实现（Ollama兼容）
// ============================================================

async function callLocal(messages: AIMessage[], request: AIRequest): Promise<AIResponse> {
  const config = AI_CONFIG.local;
  
  const response = await fetch(`${config.baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: request.model || config.model,
      messages,
      temperature: request.temperature ?? AI_CONFIG.defaults.temperature,
      max_tokens: request.maxTokens ?? AI_CONFIG.defaults.maxTokens,
      stream: false,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Local LLM error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  const choice = data.choices[0];

  return {
    content: choice.message.content,
    model: data.model,
    usage: {
      promptTokens: data.usage?.prompt_tokens || 0,
      completionTokens: data.usage?.completion_tokens || 0,
      totalTokens: data.usage?.total_tokens || 0,
    },
    finishReason: choice.finish_reason,
  };
}

async function* streamLocal(messages: AIMessage[], request: AIRequest): AsyncGenerator<AIStreamChunk> {
  const config = AI_CONFIG.local;
  
  const response = await fetch(`${config.baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: request.model || config.model,
      messages,
      temperature: request.temperature ?? AI_CONFIG.defaults.temperature,
      max_tokens: request.maxTokens ?? AI_CONFIG.defaults.maxTokens,
      stream: true,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Local LLM error: ${response.status} - ${error}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') {
          yield { content: '', done: true };
          return;
        }

        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices[0]?.delta?.content || '';
          if (content) {
            yield { content, done: false };
          }
        } catch {
          // Skip malformed JSON
        }
      }
    }
  }

  yield { content: '', done: true };
}

// ============================================================
// 便捷方法 — 投资分析专用
// ============================================================

/**
 * AI市场解读
 */
export async function analyzeMarket(marketData: any): Promise<string> {
  const response = await chat({
    messages: [
      {
        role: 'user',
        content: `请分析当前A股市场状况：

## 大盘数据
- 上证指数: ${marketData.shanghai?.price} (${marketData.shanghai?.change}%)
- 深证成指: ${marketData.shenzhen?.price} (${marketData.shenzhen?.change}%)
- 创业板指: ${marketData.chinext?.price} (${marketData.chinext?.change}%)

## 市场情绪
- 涨跌比: ${marketData.advanceCount}/${marketData.declineCount}
- 涨停: ${marketData.limitUp}只
- 跌停: ${marketData.limitDown}只
- 成交额: ${marketData.turnover}亿

请从以下角度分析：
1. 市场整体趋势判断
2. 资金流向分析
3. 板块轮动信号
4. 短期风险提示
5. 操作建议`,
      },
    ],
    temperature: 0.5,
  });

  return response.content;
}

/**
 * AI个股诊断
 */
export async function diagnoseStock(stockData: any): Promise<string> {
  const response = await chat({
    messages: [
      {
        role: 'user',
        content: `请诊断这只股票：

## 基本信息
- 股票: ${stockData.name} (${stockData.symbol})
- 行业: ${stockData.industry}
- 当前价: ${stockData.price}
- 涨跌幅: ${stockData.change}%

## 估值指标
- PE(TTM): ${stockData.pe}
- PB: ${stockData.pb}
- ROE: ${stockData.roe}%
- 市值: ${stockData.marketCap}亿

## 技术指标
- MA5: ${stockData.ma5}
- MA20: ${stockData.ma20}
- MA60: ${stockData.ma60}
- MACD: ${stockData.macd}
- RSI14: ${stockData.rsi}

请从以下角度诊断：
1. 估值是否合理
2. 技术面趋势
3. 基本面质量
4. 综合评分（0-100）
5. 风险提示`,
      },
    ],
    temperature: 0.5,
  });

  return response.content;
}

/**
 * AI策略建议
 */
export async function generateStrategy(stockData: any, userPreference?: any): Promise<string> {
  const response = await chat({
    messages: [
      {
        role: 'user',
        content: `请为这只股票制定交易策略：

## 股票信息
- 股票: ${stockData.name} (${stockData.symbol})
- 当前价: ${stockData.price}
- 技术面: ${JSON.stringify(stockData.technicalIndicators)}

## 用户偏好
- 风险承受: ${userPreference?.riskLevel || '中等'}
- 投资周期: ${userPreference?.horizon || '1-2周'}
- 仓位: ${userPreference?.position || '轻仓'}

请提供：
1. 买入时机和价格区间
2. 止损位和止盈位
3. 仓位建议
4. 关键关注的技术信号
5. 风险提示`,
      },
    ],
    temperature: 0.5,
  });

  return response.content;
}

/**
 * 通用对话
 */
export async function chatWithAI(userMessage: string, context?: any[]): Promise<string> {
  const messages: AIMessage[] = [];
  
  // 添加上下文
  if (context) {
    messages.push(...context);
  }
  
  messages.push({
    role: 'user',
    content: userMessage,
  });

  const response = await chat({ messages });
  return response.content;
}

// ============================================================
// 健康检查
// ============================================================

export async function healthCheck(): Promise<{ status: string; provider: string; model: string }> {
  try {
    const response = await chat({
      messages: [{ role: 'user', content: '你好，请用一句话介绍你自己。' }],
      maxTokens: 100,
    });
    
    return {
      status: 'ok',
      provider: AI_CONFIG.provider,
      model: response.model,
    };
  } catch (error) {
    return {
      status: 'error',
      provider: AI_CONFIG.provider,
      model: '',
    };
  }
}

export default {
  chat,
  chatStream,
  analyzeMarket,
  diagnoseStock,
  generateStrategy,
  chatWithAI,
  healthCheck,
};
