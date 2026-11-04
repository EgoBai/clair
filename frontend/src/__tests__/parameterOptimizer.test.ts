import { describe, it, expect } from 'vitest';
import { generateWindows } from '../../../backend/src/services/walkForwardOptimizationEngine';

/**
 * 影子测试绑定说明（parameterOptimizer.test.ts）
 *
 * 生产无同契约导出：本文件的通用参数优化器（网格/随机/贝叶斯/遗传搜索、评分、最优参数选择、
 * 过拟合检测、稳定性分析）在仓内没有同签名/同语义导出，故这些段保留内联实现。已核对候选：
 * - backend/src/services/walkForwardOptimizationEngine.ts：仅 generateWindows:8、walkForwardScore:23、
 *   efficiencyRatio:33，无 ParamRange/objective/evaluate 通用寻优契约；其中 generateWindows 与本文件
 *   walkForward 的滑窗循环同契约，已绑定（见下）。
 * - backend/src/services/turnoverOptimizationEngine.ts:20 optimizeTurnover：换手率专用，无参数网格。
 * - backend/src/utils/queryOptimizer.ts：数据库查询缓存，顶层依赖 db/logger，与策略参数无关。
 * - frontend/src/utils/performanceOptimizer.ts：React 性能 hooks，不是策略参数寻优。
 * - frontend/src/utils/walkForwardEngine.ts:98 walkForwardBacktest：需要 optimizeFunc/backtestFunc，
 *   返回 windows/overallMetrics/parameterStability，不返回 trainScore/testScore/ratio；参数稳定性函数未导出。
 * - frontend/src/utils/meanReversionEngine.ts:583 optimizeMeanReversionParams：均值回归专用窗口/阈值网格，
 *   非通用 ParamRange/objective 契约。
 * - frontend/src/utils/portfolioOptimizer.ts：组合权重优化，非策略参数寻优。
 *
 * 已绑定生产：
 * - walkForward() 的窗口边界 -> backend/src/services/walkForwardOptimizationEngine.ts:8 generateWindows。
 *   旧内联循环 start + trainSize + testSize <= n，生产同条件；旧 testEnd 的 Math.min 在生产循环条件下恒等于
 *   trainEnd + testSize。该模块顶层 0 import，不依赖 xlsx/file-saver，跨包 import 在 CI 可解析。
 *
 * 确定性：不保留运行时随机数。贝叶斯扰动/接受与 walkForward 测试数据均改用固定种子 LCG。
 */

// ==================== 参数优化引擎 ====================

interface ParamRange {
  name: string;
  min: number;
  max: number;
  step: number;
  type: 'int' | 'float';
}

interface OptimizationResult {
  params: Record<string, number>;
  totalReturn: number;
  sharpeRatio: number;
  maxDrawdown: number;
  winRate: number;
  totalTrades: number;
  score: number;
}

interface OptimizationConfig {
  paramRanges: ParamRange[];
  objective: 'totalReturn' | 'sharpeRatio' | 'calmarRatio' | 'custom';
  maxIterations: number;
  metricWeights?: Record<string, number>;
}

class ParameterOptimizer {
  /** 网格搜索 */
  gridSearch(
    config: OptimizationConfig,
    evaluate: (params: Record<string, number>) => { totalReturn: number; sharpeRatio: number; maxDrawdown: number; winRate: number; totalTrades: number }
  ): OptimizationResult[] {
    const paramGrids = config.paramRanges.map(r => {
      const values: number[] = [];
      for (let v = r.min; v <= r.max; v += r.step) {
        values.push(r.type === 'int' ? Math.round(v) : Math.round(v * 1000) / 1000);
      }
      return { name: r.name, values };
    });

    const combinations = this.generateCombinations(paramGrids);
    const limited = combinations.slice(0, config.maxIterations);
    const results: OptimizationResult[] = [];

    for (const combo of limited) {
      const metrics = evaluate(combo);
      const score = this.calculateScore(metrics, config);
      results.push({ params: combo, ...metrics, score: Math.round(score * 100) / 100 });
    }

    return results.sort((a, b) => b.score - a.score);
  }

  /** 随机搜索 */
  randomSearch(
    config: OptimizationConfig,
    evaluate: (params: Record<string, number>) => { totalReturn: number; sharpeRatio: number; maxDrawdown: number; winRate: number; totalTrades: number },
    seed: number = 42
  ): OptimizationResult[] {
    const rng = this.createRNG(seed);
    const results: OptimizationResult[] = [];

    for (let i = 0; i < config.maxIterations; i++) {
      const params: Record<string, number> = {};
      for (const r of config.paramRanges) {
        const v = r.min + rng() * (r.max - r.min);
        params[r.name] = r.type === 'int' ? Math.round(v) : Math.round(v * 1000) / 1000;
      }
      const metrics = evaluate(params);
      const score = this.calculateScore(metrics, config);
      results.push({ params, ...metrics, score: Math.round(score * 100) / 100 });
    }

    return results.sort((a, b) => b.score - a.score);
  }

  /** 贝叶斯优化（简化版：基于梯度的局部搜索） */
  bayesianOptimize(
    config: OptimizationConfig,
    evaluate: (params: Record<string, number>) => { totalReturn: number; sharpeRatio: number; maxDrawdown: number; winRate: number; totalTrades: number },
    initialParams?: Record<string, number>,
    seed: number = 42
  ): OptimizationResult[] {
    // 旧实现用非确定性随机数做退火接受与扰动，同一测试重复运行结果不同；改为固定种子 LCG。
    const rng = this.createRNG(seed);
    const results: OptimizationResult[] = [];
    let current = initialParams || this.randomParams(config.paramRanges, 0);
    let currentMetrics = evaluate(current);
    let currentScore = this.calculateScore(currentMetrics, config);
    results.push({ params: { ...current }, ...currentMetrics, score: Math.round(currentScore * 100) / 100 });

    let temperature = 1.0;
    const coolingRate = 0.95;

    for (let i = 1; i < config.maxIterations; i++) {
      const neighbor = this.perturbParams(current, config.paramRanges, temperature, rng);
      const neighborMetrics = evaluate(neighbor);
      const neighborScore = this.calculateScore(neighborMetrics, config);
      const delta = neighborScore - currentScore;

      // 模拟退火接受准则：用注入的确定性 rng 替代旧非确定性随机源，种子固定后轨迹可复现。
      if (delta > 0 || rng() < Math.exp(delta / temperature)) {
        current = neighbor;
        currentMetrics = neighborMetrics;
        currentScore = neighborScore;
      }

      results.push({ params: { ...neighbor }, ...neighborMetrics, score: Math.round(neighborScore * 100) / 100 });
      temperature *= coolingRate;
    }

    return results.sort((a, b) => b.score - a.score);
  }

  /** 遗传算法优化 */
  geneticOptimize(
    config: OptimizationConfig,
    evaluate: (params: Record<string, number>) => { totalReturn: number; sharpeRatio: number; maxDrawdown: number; winRate: number; totalTrades: number },
    populationSize: number = 20,
    generations: number = 10
  ): OptimizationResult[] {
    const rng = this.createRNG(42);

    // 初始化种群
    let population: Record<string, number>[] = [];
    for (let i = 0; i < populationSize; i++) {
      population.push(this.randomParams(config.paramRanges, rng));
    }

    const allResults: OptimizationResult[] = [];

    for (let gen = 0; gen < generations; gen++) {
      // 评估适应度
      const evaluated = population.map(p => {
        const m = evaluate(p);
        const score = this.calculateScore(m, config);
        return { params: p, ...m, score: Math.round(score * 100) / 100 };
      });
      allResults.push(...evaluated);

      // 选择
      evaluated.sort((a, b) => b.score - a.score);
      const elite = evaluated.slice(0, Math.floor(populationSize / 2));

      // 交叉和变异
      const newPop: Record<string, number>[] = elite.map(e => ({ ...e.params }));
      while (newPop.length < populationSize) {
        const parent1 = elite[Math.floor(rng() * elite.length)].params;
        const parent2 = elite[Math.floor(rng() * elite.length)].params;
        const child = this.crossover(parent1, parent2, config.paramRanges, rng);
        newPop.push(this.mutate(child, config.paramRanges, rng, 0.1));
      }
      population = newPop;
    }

    // 评估最终种群
    const finalEval = population.map(p => {
      const m = evaluate(p);
      const score = this.calculateScore(m, config);
      return { params: p, ...m, score: Math.round(score * 100) / 100 };
    });
    allResults.push(...finalEval);

    return allResults.sort((a, b) => b.score - a.score);
  }

  /** 过拟合检测 */
  detectOverfitting(
    inSampleResults: OptimizationResult[],
    outOfSampleResults: OptimizationResult[]
  ): { isOverfit: boolean; degradation: number; confidence: number } {
    if (inSampleResults.length === 0 || outOfSampleResults.length === 0) {
      return { isOverfit: false, degradation: 0, confidence: 0 };
    }

    const inSampleBest = inSampleResults[0].score;
    const outOfSampleBest = outOfSampleResults[0].score;
    const degradation = inSampleBest > 0 ? ((inSampleBest - outOfSampleBest) / inSampleBest) * 100 : 0;

    // 统计检验
    const inScores = inSampleResults.slice(0, 10).map(r => r.score);
    const outScores = outOfSampleResults.slice(0, 10).map(r => r.score);
    const inMean = inScores.reduce((s, v) => s + v, 0) / inScores.length;
    const outMean = outScores.reduce((s, v) => s + v, 0) / outScores.length;

    return {
      isOverfit: degradation > 30,
      degradation: Math.round(degradation * 100) / 100,
      confidence: Math.min(1, Math.abs(inMean - outMean) / (inMean || 1)),
    };
  }

  /** 稳定性分析 */
  analyzeStability(results: OptimizationResult[], topN: number = 10): {
    paramStability: Record<string, { mean: number; std: number; cv: number }>;
    scoreStability: { mean: number; std: number; cv: number };
  } {
    const top = results.slice(0, topN);
    if (top.length === 0) {
      return { paramStability: {}, scoreStability: { mean: 0, std: 0, cv: 0 } };
    }

    const paramNames = Object.keys(top[0].params);
    const paramStability: Record<string, { mean: number; std: number; cv: number }> = {};

    for (const name of paramNames) {
      const values = top.map(r => r.params[name]);
      const mean = values.reduce((s, v) => s + v, 0) / values.length;
      const std = Math.sqrt(values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length);
      paramStability[name] = { mean: Math.round(mean * 100) / 100, std: Math.round(std * 100) / 100, cv: mean > 0 ? Math.round((std / mean) * 10000) / 10000 : 0 };
    }

    const scores = top.map(r => r.score);
    const scoreMean = scores.reduce((s, v) => s + v, 0) / scores.length;
    const scoreStd = Math.sqrt(scores.reduce((s, v) => s + Math.pow(v - scoreMean, 2), 0) / scores.length);

    return {
      paramStability,
      scoreStability: { mean: Math.round(scoreMean * 100) / 100, std: Math.round(scoreStd * 100) / 100, cv: scoreMean > 0 ? Math.round((scoreStd / scoreMean) * 10000) / 10000 : 0 },
    };
  }

  /** Walk-Forward 分析 */
  walkForward(
    config: OptimizationConfig,
    data: { returns: number[]; dates: string[] },
    trainRatio: number = 0.7,
    evaluate: (params: Record<string, number>, startIdx: number, endIdx: number) => { totalReturn: number; sharpeRatio: number; maxDrawdown: number; winRate: number; totalTrades: number }
  ): { trainScore: number; testScore: number; ratio: number }[] {
    const windowSize = Math.floor(data.returns.length * trainRatio);
    const stepSize = Math.floor(data.returns.length * (1 - trainRatio));
    const results: { trainScore: number; testScore: number; ratio: number }[] = [];

    // 窗口边界已绑定生产 generateWindows（backend/src/services/walkForwardOptimizationEngine.ts:8）：
    // 旧内联循环条件 start + trainSize + testSize <= n 与生产 while 条件一致；
    // 旧 testEnd 的 Math.min 在生产循环条件下恒等于 trainEnd + testSize。
    const windows = generateWindows(data.returns.length, {
      trainSize: windowSize,
      testSize: stepSize,
      stepSize,
    });

    for (const w of windows) {
      const trainStart = w.trainStart;
      const trainEnd = w.trainEnd;
      const testStart = w.testStart;
      const testEnd = w.testEnd;

      const trainResults = this.gridSearch(
        { ...config, maxIterations: Math.min(config.maxIterations, 50) },
        (params) => evaluate(params, trainStart, trainEnd)
      );

      // 保留原内联算法：测试集仍用 maxIterations:1 取网格首项，未复用训练最优参数。
      // 这是原影子实现的缺陷，本次只绑定窗口生成，不改变寻优语义（报告未迁移段）。
      const testResults = this.gridSearch(
        { ...config, maxIterations: 1 },
        (params) => evaluate(params, testStart, testEnd)
      );

      const trainScore = trainResults[0]?.score || 0;
      const testScore = testResults[0]?.score || 0;

      results.push({
        trainScore: Math.round(trainScore * 100) / 100,
        testScore: Math.round(testScore * 100) / 100,
        ratio: trainScore > 0 ? Math.round((testScore / trainScore) * 100) / 100 : 0,
      });
    }

    return results;
  }

  // ==================== 私有方法 ====================

  private generateCombinations(grids: { name: string; values: number[] }[]): Record<string, number>[] {
    if (grids.length === 0) return [{}];
    const [first, ...rest] = grids;
    const restCombos = this.generateCombinations(rest);
    const result: Record<string, number>[] = [];
    for (const v of first.values) {
      for (const combo of restCombos) {
        result.push({ [first.name]: v, ...combo });
      }
    }
    return result;
  }

  private calculateScore(metrics: { totalReturn: number; sharpeRatio: number; maxDrawdown: number; winRate: number; totalTrades: number }, config: OptimizationConfig): number {
    if (config.objective === 'totalReturn') return metrics.totalReturn;
    if (config.objective === 'sharpeRatio') return metrics.sharpeRatio;
    if (config.objective === 'calmarRatio') return metrics.maxDrawdown > 0 ? metrics.totalReturn / metrics.maxDrawdown : metrics.totalReturn;

    // custom
    const w = config.metricWeights || { totalReturn: 1, sharpeRatio: 1, maxDrawdown: -1, winRate: 0.5 };
    return (metrics.totalReturn * (w.totalReturn || 0)) +
      (metrics.sharpeRatio * (w.sharpeRatio || 0) * 10) +
      (metrics.maxDrawdown * (w.maxDrawdown || 0)) +
      (metrics.winRate * (w.winRate || 0));
  }

  private randomParams(ranges: ParamRange[], seedOrRng: number | (() => number)): Record<string, number> {
    const rng = typeof seedOrRng === 'function' ? seedOrRng : this.createRNG(seedOrRng);
    const params: Record<string, number> = {};
    for (const r of ranges) {
      const v = r.min + rng() * (r.max - r.min);
      params[r.name] = r.type === 'int' ? Math.round(v) : Math.round(v * 1000) / 1000;
    }
    return params;
  }

  private perturbParams(params: Record<string, number>, ranges: ParamRange[], temperature: number, rng: () => number): Record<string, number> {
    // 旧实现用两次环境随机数选参数/扰动；改为同一 rng，保持算法形状但结果可复现。
    const newParams = { ...params };
    const idx = Math.floor(rng() * ranges.length);
    const range = ranges[idx];
    const delta = (range.max - range.min) * temperature * (rng() - 0.5) * 0.5;
    const newVal = Math.max(range.min, Math.min(range.max, params[range.name] + delta));
    newParams[range.name] = range.type === 'int' ? Math.round(newVal) : Math.round(newVal * 1000) / 1000;
    return newParams;
  }

  private crossover(p1: Record<string, number>, p2: Record<string, number>, ranges: ParamRange[], rng: () => number): Record<string, number> {
    const child: Record<string, number> = {};
    for (const r of ranges) {
      child[r.name] = rng() > 0.5 ? p1[r.name] : p2[r.name];
    }
    return child;
  }

  private mutate(params: Record<string, number>, ranges: ParamRange[], rng: () => number, rate: number): Record<string, number> {
    const newParams = { ...params };
    for (const r of ranges) {
      if (rng() < rate) {
        const v = r.min + rng() * (r.max - r.min);
        newParams[r.name] = r.type === 'int' ? Math.round(v) : Math.round(v * 1000) / 1000;
      }
    }
    return newParams;
  }

  private createRNG(seed: number): () => number {
    let s = seed;
    return () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff; };
  }
}

// ==================== 测试数据 ====================

const simpleEvaluator = (params: Record<string, number>) => {
  const { fast, slow } = params;
  // 模拟: 快线太短不好，太长也不好
  const optFast = 5, optSlow = 20;
  const dist = Math.abs(fast - optFast) + Math.abs(slow - optSlow);
  const totalReturn = 20 - dist * 0.5;
  const sharpeRatio = 1.5 - dist * 0.05;
  const maxDrawdown = 10 + dist * 0.3;
  const winRate = 60 - dist * 0.5;
  const totalTrades = Math.max(0, 100 - dist * 2);
  return { totalReturn, sharpeRatio, maxDrawdown, winRate, totalTrades };
};

const paramRanges: ParamRange[] = [
  { name: 'fast', min: 3, max: 15, step: 1, type: 'int' },
  { name: 'slow', min: 15, max: 40, step: 5, type: 'int' },
];

// 固定种子 LCG：替代 walkForward 用例里的运行时随机数，保证 200 个收益序列可复现。
const createTestRNG = (seed: number): (() => number) => {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
};

// ==================== 测试 ====================

describe('ParameterOptimizer 参数优化引擎', () => {
  describe('网格搜索', () => {
    it('应返回排序结果', () => {
      const opt = new ParameterOptimizer();
      const results = opt.gridSearch({ paramRanges, objective: 'sharpeRatio', maxIterations: 100 }, simpleEvaluator);
      expect(results.length).toBeGreaterThan(0);
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
      }
    });

    it('应找到最优参数附近', () => {
      const opt = new ParameterOptimizer();
      const results = opt.gridSearch({ paramRanges, objective: 'totalReturn', maxIterations: 500 }, simpleEvaluator);
      expect(results[0].params.fast).toBeCloseTo(5, 0);
      expect(results[0].params.slow).toBeCloseTo(20, 0);
    });

    it('应限制迭代次数', () => {
      const opt = new ParameterOptimizer();
      const results = opt.gridSearch({ paramRanges, objective: 'totalReturn', maxIterations: 10 }, simpleEvaluator);
      expect(results.length).toBeLessThanOrEqual(10);
    });

    it('结果应包含所有指标', () => {
      const opt = new ParameterOptimizer();
      const results = opt.gridSearch({ paramRanges, objective: 'totalReturn', maxIterations: 50 }, simpleEvaluator);
      for (const r of results) {
        expect(r.params).toBeDefined();
        expect(r.totalReturn).toBeDefined();
        expect(r.sharpeRatio).toBeDefined();
        expect(r.maxDrawdown).toBeDefined();
        expect(r.winRate).toBeDefined();
        expect(r.score).toBeDefined();
      }
    });
  });

  describe('随机搜索', () => {
    it('应返回指定数量的结果', () => {
      const opt = new ParameterOptimizer();
      const results = opt.randomSearch({ paramRanges, objective: 'totalReturn', maxIterations: 20 }, simpleEvaluator);
      expect(results.length).toBe(20);
    });

    it('相同种子应返回相同结果', () => {
      const opt = new ParameterOptimizer();
      const r1 = opt.randomSearch({ paramRanges, objective: 'totalReturn', maxIterations: 10 }, simpleEvaluator, 42);
      const r2 = opt.randomSearch({ paramRanges, objective: 'totalReturn', maxIterations: 10 }, simpleEvaluator, 42);
      expect(r1[0].params).toEqual(r2[0].params);
    });

    it('应按分数排序', () => {
      const opt = new ParameterOptimizer();
      const results = opt.randomSearch({ paramRanges, objective: 'sharpeRatio', maxIterations: 20 }, simpleEvaluator);
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
      }
    });
  });

  describe('贝叶斯优化', () => {
    it('应返回至少一个结果', () => {
      const opt = new ParameterOptimizer();
      const results = opt.bayesianOptimize({ paramRanges, objective: 'sharpeRatio', maxIterations: 10 }, simpleEvaluator);
      expect(results.length).toBe(10);
    });

    it('应逐步改进', () => {
      const opt = new ParameterOptimizer();
      const results = opt.bayesianOptimize({ paramRanges, objective: 'totalReturn', maxIterations: 20 }, simpleEvaluator);
      // 最佳结果应在前几名
      const bestScore = Math.max(...results.map(r => r.score));
      expect(results[0].score).toBeCloseTo(bestScore, 0);
    });

    it('固定种子应可复现', () => {
      const opt = new ParameterOptimizer();
      const r1 = opt.bayesianOptimize({ paramRanges, objective: 'totalReturn', maxIterations: 20 }, simpleEvaluator, undefined, 7);
      const r2 = opt.bayesianOptimize({ paramRanges, objective: 'totalReturn', maxIterations: 20 }, simpleEvaluator, undefined, 7);
      // 旧实现用非确定性随机数，同一输入两次结果不同；现断言固定种子下参数与分数逐项一致。
      expect(r1.map(r => r.params)).toEqual(r2.map(r => r.params));
      expect(r1.map(r => r.score)).toEqual(r2.map(r => r.score));
    });
  });

  describe('遗传算法', () => {
    it('应返回所有代的结果', () => {
      const opt = new ParameterOptimizer();
      const results = opt.geneticOptimize(
        { paramRanges, objective: 'totalReturn', maxIterations: 100 },
        simpleEvaluator, 10, 3
      );
      expect(results.length).toBe(30 + 10); // 3代*10 + 最终10
    });

    it('应按分数排序', () => {
      const opt = new ParameterOptimizer();
      const results = opt.geneticOptimize(
        { paramRanges, objective: 'sharpeRatio', maxIterations: 100 },
        simpleEvaluator, 10, 3
      );
      for (let i = 1; i < Math.min(results.length, 20); i++) {
        expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
      }
    });
  });

  describe('过拟合检测', () => {
    it('应检测无过拟合', () => {
      const opt = new ParameterOptimizer();
      const inSample = [{ params: { fast: 5, slow: 20 }, totalReturn: 15, sharpeRatio: 1.2, maxDrawdown: 12, winRate: 55, totalTrades: 80, score: 15 }];
      const outOfSample = [{ params: { fast: 5, slow: 20 }, totalReturn: 14, sharpeRatio: 1.1, maxDrawdown: 13, winRate: 54, totalTrades: 78, score: 14 }];
      const result = opt.detectOverfitting(inSample, outOfSample);
      expect(result.isOverfit).toBe(false);
      expect(result.degradation).toBeLessThan(30);
    });

    it('应检测过拟合', () => {
      const opt = new ParameterOptimizer();
      const inSample = [{ params: { fast: 3, slow: 15 }, totalReturn: 50, sharpeRatio: 3, maxDrawdown: 5, winRate: 80, totalTrades: 200, score: 50 }];
      const outOfSample = [{ params: { fast: 3, slow: 15 }, totalReturn: 5, sharpeRatio: 0.3, maxDrawdown: 30, winRate: 45, totalTrades: 100, score: 5 }];
      const result = opt.detectOverfitting(inSample, outOfSample);
      expect(result.isOverfit).toBe(true);
    });

    it('空数据应返回安全值', () => {
      const opt = new ParameterOptimizer();
      const result = opt.detectOverfitting([], []);
      expect(result.isOverfit).toBe(false);
      expect(result.degradation).toBe(0);
    });
  });

  describe('稳定性分析', () => {
    it('应计算参数稳定性', () => {
      const opt = new ParameterOptimizer();
      const results = opt.gridSearch({ paramRanges, objective: 'sharpeRatio', maxIterations: 100 }, simpleEvaluator);
      const stability = opt.analyzeStability(results, 10);
      expect(stability.paramStability.fast).toBeDefined();
      expect(stability.paramStability.slow).toBeDefined();
      expect(stability.paramStability.fast.std).toBeGreaterThanOrEqual(0);
      expect(stability.scoreStability.std).toBeGreaterThanOrEqual(0);
    });

    it('空数据应返回安全值', () => {
      const opt = new ParameterOptimizer();
      const stability = opt.analyzeStability([]);
      expect(stability.paramStability).toEqual({});
      expect(stability.scoreStability.mean).toBe(0);
    });
  });

  describe('Walk-Forward', () => {
    it('应返回窗口分析结果', () => {
      const opt = new ParameterOptimizer();
      const rng = createTestRNG(20240101);
      const data = {
        returns: Array.from({ length: 200 }, () => (rng() - 0.5) * 0.02),
        dates: Array.from({ length: 200 }, (_, i) => `2024-01-${String(i + 1).padStart(2, '0')}`),
      };
      const results = opt.walkForward(
        { paramRanges, objective: 'totalReturn', maxIterations: 20 },
        data, 0.7,
        (params, start, end) => simpleEvaluator(params)
      );
      expect(results.length).toBeGreaterThan(0);
      // 200 个收益、trainRatio=0.7 -> 窗宽 140/步长 60，生产 generateWindows 只产出 1 个窗口。
      expect(results.length).toBe(1);
      for (const r of results) {
        expect(typeof r.trainScore).toBe('number');
        expect(typeof r.testScore).toBe('number');
        expect(typeof r.ratio).toBe('number');
      }
    });
  });

  describe('不同目标函数', () => {
    it('应支持totalReturn目标', () => {
      const opt = new ParameterOptimizer();
      const results = opt.gridSearch({ paramRanges, objective: 'totalReturn', maxIterations: 50 }, simpleEvaluator);
      expect(results[0].score).toBe(results[0].totalReturn);
    });

    it('应支持sharpeRatio目标', () => {
      const opt = new ParameterOptimizer();
      const results = opt.gridSearch({ paramRanges, objective: 'sharpeRatio', maxIterations: 50 }, simpleEvaluator);
      expect(results[0].score).toBe(results[0].sharpeRatio);
    });

    it('应支持calmarRatio目标', () => {
      const opt = new ParameterOptimizer();
      const results = opt.gridSearch({ paramRanges, objective: 'calmarRatio', maxIterations: 50 }, simpleEvaluator);
      expect(results[0].score).toBeDefined();
    });

    it('应支持custom目标', () => {
      const opt = new ParameterOptimizer();
      const results = opt.gridSearch({
        paramRanges, objective: 'custom', maxIterations: 50,
        metricWeights: { totalReturn: 2, sharpeRatio: 1, maxDrawdown: -0.5 },
      }, simpleEvaluator);
      expect(results[0].score).toBeDefined();
    });
  });
});
