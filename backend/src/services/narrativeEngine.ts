/**
 * LLM 叙事引擎
 * 基于多信号数据生成结构化分析报告
 * 
 * 已升级：使用 aiService 统一调用层，支持 OpenAI/Claude/本地模型
 */

import { createLogger } from '../utils/logger';
import { chat } from './aiService';
import type { MultiSignalResult, Signal } from './multiSignalEngine';

const log = createLogger('NarrativeEngine');

const SYSTEM_PROMPT = `你是一个专业的A股市场分析师。你的任务是根据多维度信号数据，生成结构化的市场分析报告。

## 核心原则

1. **只引用数据** — 不引用新闻、分析师观点、社交媒体
2. **多信号交叉验证** — 不从单一信号下结论，至少引用3个信号
3. **显式推理** — 解释"为什么这个数据指向这个判断"
4. **时间标签** — 每个信号标注其时间窗口（短期/中期/长期）
5. **结构化输出** — 必须按照以下格式输出

## 输出格式

### 数据摘要
| 信号 | 数据 | 含义 |
（每个信号一行，第三列是从数据到含义的推理）

### 分析
#### 共振信号
（哪些信号指向同一方向，形成什么判断）

#### 关键分歧
（哪些信号矛盾，为什么，谁更可信）

#### 时间分层
（短期/中期/长期各自指向什么）

### 概率估计
| 场景 | 概率 | 依据 |
（2-3个可能场景，概率之和为100%）

### 结论
> 一句话总结，包含概率估计

### 子结论
| 维度 | 判断 | 置信度 |
（短期/中期/长期/系统性风险）

### 监控信号
| 信号 | 当前值 | 阈值 | 含义 |
（3-5个需要关注的信号）

## 风险提示
- 以上分析基于历史数据和统计模型，不构成投资建议
- 市场有风险，投资需谨慎
- 过去的表现不代表未来收益`;

/**
 * 将信号数据格式化为 prompt
 */
function formatSignalsForPrompt(result: MultiSignalResult): string {
  const lines: string[] = [];
  
  lines.push(`## 股票: ${result.symbol}`);
  lines.push(`## 时间: ${result.timestamp}`);
  lines.push('');
  lines.push('## 信号数据');
  lines.push('');
  
  for (const signal of result.signals) {
    lines.push(`### ${signal.name}`);
    lines.push(`- 来源: ${signal.source}`);
    lines.push(`- 值: ${signal.value}`);
    lines.push(`- 方向: ${signal.direction}`);
    lines.push(`- 置信度: ${(signal.confidence * 100).toFixed(0)}%`);
    lines.push(`- 时间窗口: ${signal.timeframe === 'short' ? '短期(1-3个月)' : signal.timeframe === 'medium' ? '中期(3-12个月)' : '长期(1-3年)'}`);
    if (signal.detail) lines.push(`- 详情: ${signal.detail}`);
    lines.push('');
  }
  
  lines.push('## 信号汇总');
  lines.push(`- 看多信号权重: ${result.summary.bullish}`);
  lines.push(`- 看空信号权重: ${result.summary.bearish}`);
  lines.push(`- 整体方向: ${result.summary.overall}`);
  lines.push(`- 平均置信度: ${(result.summary.confidence * 100).toFixed(0)}%`);
  
  return lines.join('\n');
}

/**
 * 调用 LLM 生成叙事报告（使用 aiService 统一调用层）
 */
export async function generateNarrative(result: MultiSignalResult): Promise<string> {
  const userMessage = formatSignalsForPrompt(result);
  
  log.info(`Generating narrative for ${result.symbol} with ${result.signals.length} signals`);
  
  try {
    const response = await chat({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.3,
      maxTokens: 2000,
    });
    
    return response.content;
  } catch (e) {
    log.error(`LLM generation failed: ${e instanceof Error ? e : new Error(String(e))}`);
    log.warn('Falling back to template narrative');
    return generateTemplateNarrative(result);
  }
}

/**
 * 模板叙事（无LLM时的降级方案）
 */
export function generateTemplateNarrative(result: MultiSignalResult): string {
  const { signals, summary } = result;
  
  const bullishSignals = signals.filter(s => s.direction === 'bullish');
  const bearishSignals = signals.filter(s => s.direction === 'bearish');
  const neutralSignals = signals.filter(s => s.direction === 'neutral');
  
  let narrative = `# ${result.symbol} 多信号分析报告\n\n`;
  
  // 数据摘要
  narrative += `## 数据摘要\n\n`;
  narrative += `| 信号 | 数据 | 方向 | 置信度 |\n`;
  narrative += `|------|------|------|--------|\n`;
  for (const s of signals) {
    const dir = s.direction === 'bullish' ? '🟢 看多' : s.direction === 'bearish' ? '🔴 看空' : '🟡 中性';
    narrative += `| ${s.name} | ${s.value} | ${dir} | ${(s.confidence * 100).toFixed(0)}% |\n`;
  }
  
  // 分析
  narrative += `\n## 分析\n\n`;
  
  if (bullishSignals.length > 0) {
    narrative += `### 看多信号\n`;
    for (const s of bullishSignals) {
      narrative += `- **${s.name}**: ${s.value} (${s.detail || ''})\n`;
    }
    narrative += '\n';
  }
  
  if (bearishSignals.length > 0) {
    narrative += `### 看空信号\n`;
    for (const s of bearishSignals) {
      narrative += `- **${s.name}**: ${s.value} (${s.detail || ''})\n`;
    }
    narrative += '\n';
  }
  
  // 结论
  narrative += `## 结论\n\n`;
  const overallEmoji = summary.overall === 'bullish' ? '🟢' : summary.overall === 'bearish' ? '🔴' : '🟡';
  const overallText = summary.overall === 'bullish' ? '偏多' : summary.overall === 'bearish' ? '偏空' : '中性';
  
  narrative += `> ${overallEmoji} 综合 ${signals.length} 个信号，当前市场判断 **${overallText}** `;
  narrative += `(置信度 ${(summary.confidence * 100).toFixed(0)}%)\n\n`;
  
  narrative += `### 信号一致性\n`;
  narrative += `- 看多: ${bullishSignals.length} 个信号\n`;
  narrative += `- 看空: ${bearishSignals.length} 个信号\n`;
  narrative += `- 中性: ${neutralSignals.length} 个信号\n\n`;
  
  narrative += `---\n`;
  narrative += `*分析时间: ${result.timestamp}*\n`;
  narrative += `*数据来源: ${signals.map(s => s.source).join(', ')}*\n`;
  narrative += `*风险提示: 以上分析基于历史数据，不构成投资建议*\n`;
  
  return narrative;
}

export default { generateNarrative };
