/**
 * 机器学习信号融合引擎
 * - 多信号加权融合
 * - 自适应信号权重
 * - 信号质量评分
 * - 贝叶斯信号更新
 * - 集成投票机制
 * - 信号衰减模型
 */

export interface Signal {
  name: string;
  value: number;       // -1 to 1
  confidence: number;  // 0 to 1
  timestamp: number;
  category: 'technical' | 'fundamental' | 'sentiment' | 'macro';
}

export interface FusedSignal {
  value: number;
  confidence: number;
  direction: 'long' | 'short' | 'neutral';
  contributors: Array<{ name: string; weight: number; contribution: number }>;
  agreement: number;   // 0-1, how much signals agree
}

export interface SignalQuality {
  name: string;
  accuracy: number;
  precision: number;
  recall: number;
  sharpeRatio: number;
  maxDrawdown: number;
  decayFactor: number;
}

export interface BayesianUpdate {
  prior: number;
  likelihood: number;
  posterior: number;
  signalStrength: number;
  bayesFactor: number;
}

export interface EnsembleVote {
  longVotes: number;
  shortVotes: number;
  neutralVotes: number;
  majority: 'long' | 'short' | 'neutral';
  conviction: number;
}

export interface SignalDecay {
  originalValue: number;
  currentValue: number;
  halfLife: number;
  elapsedTime: number;
  decayedConfidence: number;
}

export class MLSignalFusionEngine {
  /**
   * 加权信号融合
   */
  weightedFusion(signals: Signal[], weights?: Map<string, number>): FusedSignal {
    if (signals.length === 0) {
      return { value: 0, confidence: 0, direction: 'neutral', contributors: [], agreement: 0 };
    }

    let totalWeight = 0;
    let weightedSum = 0;
    const contributors: Array<{ name: string; weight: number; contribution: number }> = [];

    for (const sig of signals) {
      const baseWeight = weights?.get(sig.name) ?? 1;
      const weight = baseWeight * sig.confidence;
      weightedSum += sig.value * weight;
      totalWeight += weight;
      contributors.push({ name: sig.name, weight, contribution: sig.value * weight });
    }

    const value = totalWeight > 0 ? weightedSum / totalWeight : 0;

    // Agreement: how aligned are signals
    const directions = signals.map(s => Math.sign(s.value));
    const agreementCount = directions.filter(d => d === Math.sign(value)).length;
    const agreement = signals.length > 0 ? agreementCount / signals.length : 0;

    // Confidence: weighted average confidence * agreement
    const avgConf = signals.reduce((s, sig) => s + sig.confidence, 0) / signals.length;
    const confidence = avgConf * agreement;

    const direction = value > 0.1 ? 'long' : value < -0.1 ? 'short' : 'neutral';

    // Normalize contributions
    const totalContrib = contributors.reduce((s, c) => s + Math.abs(c.contribution), 0) || 1;
    contributors.forEach(c => c.contribution = Math.abs(c.contribution) / totalContrib);

    return { value, confidence, direction, contributors, agreement };
  }

  /**
   * 自适应权重更新
   */
  adaptiveWeights(
    signals: Signal[],
    actualReturns: number[],
    learningRate: number = 0.05
  ): Map<string, number> {
    const weights = new Map<string, number>();
    signals.forEach(s => weights.set(s.name, 1));

    if (actualReturns.length === 0) return weights;

    // Update weights based on prediction accuracy
    for (const sig of signals) {
      let correctCount = 0;
      for (let i = 0; i < Math.min(actualReturns.length, 20); i++) {
        const predicted = Math.sign(sig.value);
        const actual = Math.sign(actualReturns[i]);
        if (predicted === actual) correctCount++;
      }
      const accuracy = correctCount / Math.min(actualReturns.length, 20);
      const currentWeight = weights.get(sig.name) || 1;
      const targetWeight = accuracy * 2; // Scale to [0, 2]
      weights.set(sig.name, currentWeight + learningRate * (targetWeight - currentWeight));
    }

    return weights;
  }

  /**
   * 信号质量评分
   */
  scoreSignalQuality(
    name: string,
    predictions: number[],
    actuals: number[]
  ): SignalQuality {
    const n = Math.min(predictions.length, actuals.length);
    if (n === 0) {
      return { name, accuracy: 0, precision: 0, recall: 0, sharpeRatio: 0, maxDrawdown: 0, decayFactor: 1 };
    }

    let tp = 0, fp = 0, fn = 0, tn = 0, correct = 0;
    const returns: number[] = [];

    for (let i = 0; i < n; i++) {
      const pred = Math.sign(predictions[i]);
      const actual = Math.sign(actuals[i]);
      if (pred === actual) correct++;

      if (pred > 0 && actual > 0) tp++;
      else if (pred > 0 && actual <= 0) fp++;
      else if (pred <= 0 && actual > 0) fn++;
      else tn++;

      // Strategy return
      returns.push(pred * actuals[i]);
    }

    const accuracy = correct / n;
    const precision = (tp + fp) > 0 ? tp / (tp + fp) : 0;
    const recall = (tp + fn) > 0 ? tp / (tp + fn) : 0;

    // Sharpe ratio
    const meanReturn = returns.reduce((s, v) => s + v, 0) / n;
    const stdReturn = Math.sqrt(returns.reduce((s, v) => s + (v - meanReturn) ** 2, 0) / n);
    const sharpeRatio = stdReturn > 0 ? (meanReturn / stdReturn) * Math.sqrt(252) : 0;

    // Max drawdown
    let peak = 1, maxDD = 0;
    let cum = 1;
    for (const r of returns) {
      cum *= (1 + r);
      peak = Math.max(peak, cum);
      maxDD = Math.min(maxDD, (cum - peak) / peak);
    }

    // Decay factor based on recent accuracy
    const recentN = Math.min(20, n);
    const recentCorrect = predictions.slice(-recentN).filter((p, i) =>
      Math.sign(p) === Math.sign(actuals.slice(-recentN)[i])
    ).length;
    const recentAccuracy = recentCorrect / recentN;
    const decayFactor = recentAccuracy / (accuracy || 1);

    return { name, accuracy, precision, recall, sharpeRatio, maxDrawdown: maxDD, decayFactor: Math.max(0.1, Math.min(2, decayFactor)) };
  }

  /**
   * 贝叶斯信号更新
   */
  bayesianUpdate(
    priorProb: number,
    signalStrength: number,
    signalReliability: number = 0.7
  ): BayesianUpdate {
    // P(up | signal) using Bayes theorem
    // P(up | s) = P(s | up) * P(up) / P(s)
    const prior = Math.max(0.01, Math.min(0.99, priorProb));

    // Likelihood: probability of observing this signal strength given direction
    const likelihood = signalReliability * Math.abs(signalStrength) +
      (1 - signalReliability) * 0.5;

    // Evidence
    const evidence = likelihood * prior + (1 - likelihood) * (1 - prior);

    // Posterior
    const posterior = evidence > 0 ? (likelihood * prior) / evidence : prior;

    // Bayes factor
    const bayesFactor = (1 - prior) > 0 ? (posterior / (1 - posterior)) / (prior / (1 - prior)) : 1;

    return {
      prior,
      likelihood,
      posterior: Math.max(0, Math.min(1, posterior)),
      signalStrength: Math.abs(signalStrength),
      bayesFactor
    };
  }

  /**
   * 集成投票
   */
  ensembleVote(signals: Signal[], threshold: number = 0.1): EnsembleVote {
    let longVotes = 0, shortVotes = 0, neutralVotes = 0;

    for (const sig of signals) {
      if (sig.value > threshold && sig.confidence > 0.3) longVotes++;
      else if (sig.value < -threshold && sig.confidence > 0.3) shortVotes++;
      else neutralVotes++;
    }

    const total = signals.length || 1;
    let majority: 'long' | 'short' | 'neutral';
    if (longVotes > shortVotes && longVotes > neutralVotes) majority = 'long';
    else if (shortVotes > longVotes && shortVotes > neutralVotes) majority = 'short';
    else majority = 'neutral';

    const maxVotes = Math.max(longVotes, shortVotes, neutralVotes);
    const conviction = maxVotes / total;

    return { longVotes, shortVotes, neutralVotes, majority, conviction };
  }

  /**
   * 信号衰减
   */
  decaySignal(signal: Signal, currentTime: number, halfLifeSeconds: number = 3600): SignalDecay {
    const elapsedTime = (currentTime - signal.timestamp) / 1000;
    const decayRate = Math.log(2) / halfLifeSeconds;
    const decayFactor = Math.exp(-decayRate * Math.max(0, elapsedTime));

    return {
      originalValue: signal.value,
      currentValue: signal.value * decayFactor,
      halfLife: halfLifeSeconds,
      elapsedTime,
      decayedConfidence: signal.confidence * decayFactor
    };
  }

  /**
   * 信号冲突检测
   */
  detectConflicts(signals: Signal[]): {
    conflicts: Array<{ signal1: string; signal2: string; severity: number }>;
    overallCoherence: number;
  } {
    const conflicts: Array<{ signal1: string; signal2: string; severity: number }> = [];

    for (let i = 0; i < signals.length; i++) {
      for (let j = i + 1; j < signals.length; j++) {
        const s1 = signals[i], s2 = signals[j];
        // Conflict if signals point in opposite directions with high confidence
        if (Math.sign(s1.value) !== Math.sign(s2.value) &&
            s1.confidence > 0.5 && s2.confidence > 0.5) {
          const severity = Math.abs(s1.value - s2.value) * s1.confidence * s2.confidence;
          conflicts.push({ signal1: s1.name, signal2: s2.name, severity });
        }
      }
    }

    // Overall coherence
    const totalPairs = (signals.length * (signals.length - 1)) / 2;
    const conflictPairs = conflicts.length;
    const overallCoherence = totalPairs > 0 ? 1 - conflictPairs / totalPairs : 1;

    return { conflicts, overallCoherence };
  }
}
