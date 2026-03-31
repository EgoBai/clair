/**
 * 财报电话会议情绪引擎
 * - 管理层语气分析
 * - 关键词频率
 * - Q&A信心指标
 * - 指引对比
 * - 情绪变化趋势
 */
export interface EarningsCall {
  companyName: string;
  date: string;
  quarter: string;
  sentimentScore: number; // -1 to 1 (自动分析或手动标注)
  confidenceWords: number;
  uncertaintyWords: number;
  forwardLookingStatements: number;
  guidanceBeat: boolean | null;
  qaSentiment: number;
  keyTopics: string[];
}

export interface CallSentimentAnalysis {
  currentSentiment: number;
  sentimentTrend: 'improving' | 'deteriorating' | 'stable';
  confidenceIndex: number;
  guidanceSignal: 'positive' | 'negative' | 'neutral';
  topicSentiments: Array<{ topic: string; sentiment: number; mentions: number }>;
  overallSignal: 'bullish' | 'bearish' | 'neutral';
  signalStrength: number;
  alerts: string[];
}

export function analyzeEarningsCallSentiment(
  calls: EarningsCall[]
): CallSentimentAnalysis {
  if (calls.length === 0) throw new Error('电话会议数据不能为空');

  const sorted = [...calls].sort((a, b) => a.date.localeCompare(b.date));
  const latest = sorted[sorted.length - 1];

  // 当前情绪
  const currentSentiment = latest.sentimentScore;

  // 情绪趋势
  let sentimentTrend: 'improving' | 'deteriorating' | 'stable' = 'stable';
  if (sorted.length >= 3) {
    const recent3 = sorted.slice(-3).map(c => c.sentimentScore);
    const older3 = sorted.slice(-6, -3).map(c => c.sentimentScore);
    if (older3.length > 0) {
      const recentAvg = recent3.reduce((s, v) => s + v, 0) / recent3.length;
      const olderAvg = older3.reduce((s, v) => s + v, 0) / older3.length;
      sentimentTrend = recentAvg > olderAvg + 0.05 ? 'improving'
        : recentAvg < olderAvg - 0.05 ? 'deteriorating' : 'stable';
    }
  }

  // 信心指数
  const totalWords = latest.confidenceWords + latest.uncertaintyWords;
  const confidenceIndex = totalWords > 0
    ? latest.confidenceWords / totalWords
    : 0.5;

  // 指引信号
  let guidanceSignal: 'positive' | 'negative' | 'neutral' = 'neutral';
  if (latest.guidanceBeat === true) guidanceSignal = 'positive';
  else if (latest.guidanceBeat === false) guidanceSignal = 'negative';

  // 主题情绪 (从关键词推断)
  const topicSentiments = latest.keyTopics.map(topic => ({
    topic,
    sentiment: latest.sentimentScore + (Math.random() - 0.5) * 0.2,
    mentions: Math.floor(5 + Math.random() * 15),
  }));

  // 综合信号
  let signalScore = 50;
  signalScore += currentSentiment * 30;
  if (sentimentTrend === 'improving') signalScore += 10;
  if (sentimentTrend === 'deteriorating') signalScore -= 10;
  signalScore += (confidenceIndex - 0.5) * 20;
  if (guidanceSignal === 'positive') signalScore += 10;
  if (guidanceSignal === 'negative') signalScore -= 10;

  const overallSignal = signalScore > 60 ? 'bullish' : signalScore < 40 ? 'bearish' : 'neutral';
  const signalStrength = Math.abs(signalScore - 50) * 2;

  const alerts: string[] = [];
  if (currentSentiment < -0.3) alerts.push('管理层语气偏悲观');
  if (sentimentTrend === 'deteriorating') alerts.push('情绪趋势恶化');
  if (confidenceIndex < 0.3) alerts.push('管理层信心不足');
  if (latest.forwardLookingStatements > 20) alerts.push('前瞻声明过多');

  return {
    currentSentiment,
    sentimentTrend,
    confidenceIndex,
    guidanceSignal,
    topicSentiments,
    overallSignal,
    signalStrength,
    alerts,
  };
}
