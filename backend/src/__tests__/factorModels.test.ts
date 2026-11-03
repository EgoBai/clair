/**
 * 影子测试迁移（批次 31a）
 *
 * 本文件原来自抄生产实现（shadow test），现全部符号通过 import 绑定生产真源；
 * 用例数保持 24（4 + 4 + 4 + 5 + 3 + 4），只增不减。
 *
 * 一、绑定生产真源（文件:行号）
 * - calculateFamaFrench3(StockFactor,...) -> famaFrench3Factor(stockReturns, marketExcess, smb, hml)
 *   frontend/src/utils/factorAttributionEngine.ts:252（OLS 归因；系数/alpha/rSquared 见 :126-187）
 * - calculatePiotroskiFscore(StockFactor)  -> calculatePiotroskiScore(stmt, prevStmt)
 *   frontend/src/utils/financialAnalysisEngine.ts:259（9 条报表准则 :266-292）
 * - calculateAltmanZScore(6 个位置参数)    -> calculateAltmanZScore(FinancialData)
 *   frontend/src/utils/creditRiskEngine.ts:83（零资产早退 :87-93；zScore 保留 2 位 :114）
 * - momentumScore(prices, period)          -> MarketRegimeEngine.detectMomentumState(prices).shortMomentum
 *   frontend/src/utils/marketRegimeEngine.ts:163（默认 lookback 20/60/120 :64；calcMomentum :328-331）
 * - calculateQualityScore(StockFactor)     -> calculateQualityScore(stmt, prevStmt?)
 *   frontend/src/utils/financialAnalysisEngine.ts:159（四维加权，total=min(100,和) :224；grade :226-231）
 * - multiFactorRanking(StockFactor[])      -> quantScreening(FundamentalData[])
 *   frontend/src/utils/fundamentalQuantEngine.ts:43（价值/质量/成长/动量百分位评分 :47-90；排名 :114-118）
 *
 * 二、旧断言订正（旧值 → 生产值 + 生产文件:行号）
 * 1) Fama-French：旧自抄按市值/PE 分档给 expectedReturn（marketPremium=市场收益-无风险利率=0.06；
 *    sizeFactor 小盘 0.02/大盘 -0.01；valueFactor PE<15 为 0.015）。生产 famaFrench3Factor 是 4 参数
 *    OLS 回归归因（factorAttributionEngine.ts:252-292），无特征分档 API：weight=回归系数、alpha=截距×252、
 *    totalReturn=mean(y)×252、rSquared 来自残差。4 例改为断言回归系数 1.2/0.5/-0.3、年化值、
 *    R²≈1（无残差 rSquared:178）与 trackingError<1e-10（:278）。
 * 2) Piotroski：旧 8 条基于 StockFactor 的规则、score 0..8 → 生产 9 条报表准则、score 0..9
 *    （financialAnalysisEngine.ts:266-294；满分 旧 8 → 生产 9）。
 * 3) Altman：旧 6 位置参数、返回 score、X1=(totalAssets-totalLiabilities)/totalAssets、
 *    X4=marketCap/totalLiabilities 无零负债守卫 → 生产入参 FinancialData 对象、返回 zScore（:114）、
 *    X1=(currentAssets-currentLiabilities)/totalAssets（:95）、X4 在 totalLiabilities<=0 时取 10（:98）。
 *    本夹具令 currentAssets=totalAssets、currentLiabilities=totalLiabilities，故 safe 组 Z 值
 *    旧 13.73 → 生产 13.73（不变），distress 组 旧 0.55 → 生产 0.55（不变）；字段 score → zScore 为订正。
 *    零资产用例新增断言 probabilities {2 年:1, 4 年:1}（生产 :91）。
 * 4) Momentum：旧 momentumScore(prices, period=20) 返回 (last-past)/past，past=0 守卫返回 0
 *    → 生产 detectMomentumState 返回 {shortMomentum,...}（:179-184），长度 < period+1 返回 0
 *    （:329）。零基数（20 个 0 后接 10）生产无守卫 → Infinity，旧值 0 → 生产 Infinity，
 *    本文件按生产口径断言 Infinity 并在「生产缺口」记录。
 * 5) Quality：旧按 StockFactor 的 ROE/营收增长/负债率/股息各 25 分 → 生产按报表四维：
 *    盈利≤25、成长 12 起调≤27、稳定≤25、现金流≤25，totalScore=min(100, 和)（:224）。
 *    完美报表旧值 ≤100 → 生产理论满分 102 → 截断 100（盈利 25 + 成长 27 + 稳定 25 + 现金流 25）。
 * 6) Multi-Factor Ranking：旧自造 value/quality/growth/technical 四项加权 → 生产 quantScreening
 *    价值/质量/成长/动量百分位加权（:58-90）；factors 键 旧 value/quality/growth/technical
 *    → 生产 factorBreakdown 的 价值/质量/成长/动量（:85-90）。单股生产百分位全 0，但价值因子反向
 *    （1-0=100）→ totalScore=30、rank=1、percentile=100（旧自抄按绝对分数，无此口径）。
 *
 * 三、未迁移 / 生产缺口
 * - 未迁移 helper：无（6/6 符号均有生产导出）。
 * - 生产缺口 1：momentum 零基数无守卫（marketRegimeEngine.ts:328-331），(10-0)/0 → Infinity；
 *   旧实现返回 0。本文件如实固化生产行为。
 * - 生产缺口 2：famaFrench3Factor 空入参时 olsRegression 返回空系数（factorAttributionEngine.ts:134-136），
 *   随后 weight=undefined、alpha=undefined×252=NaN（:268,:277），生产未加空输入守卫；未纳入断言。
 */

import { describe, it, expect } from 'vitest';
import { famaFrench3Factor } from '../../../frontend/src/utils/factorAttributionEngine';
import {
  calculatePiotroskiScore,
  calculateQualityScore,
  type FinancialStatement,
} from '../../../frontend/src/utils/financialAnalysisEngine';
import { calculateAltmanZScore, type FinancialData } from '../../../frontend/src/utils/creditRiskEngine';
import { quantScreening, type FundamentalData } from '../../../frontend/src/utils/fundamentalQuantEngine';
import { MarketRegimeEngine } from '../../../frontend/src/utils/marketRegimeEngine';

// Quantitative Factor Models
describe('Quantitative Factor Models', () => {
  describe('Fama-French 3 Factor', () => {
    // 确定性 12 期因子序列（固定夹具，无随机数）
    const marketExcess = [0.01, -0.02, 0.03, -0.01, 0.02, -0.03, 0.015, -0.005, 0.025, -0.015, 0.005, -0.025];
    const smb = [0.005, -0.004, 0.002, 0.006, -0.003, 0.001, 0.004, -0.006, 0.003, -0.002, 0.007, -0.005];
    const hml = [-0.002, 0.004, -0.005, 0.003, 0.001, -0.004, 0.002, -0.001, 0.005, -0.003, 0.004, -0.006];
    // 精确线性关系 y = 0.01 + 1.2·MKT + 0.5·SMB − 0.3·HML，用于回收真实回归系数
    const stockReturns = marketExcess.map((m, i) => 0.01 + 1.2 * m + 0.5 * smb[i] - 0.3 * hml[i]);

    it('should estimate market factor loading', () => {
      const result = famaFrench3Factor(stockReturns, marketExcess, smb, hml);
      expect(result.factorReturns.map(f => f.factor)).toEqual(['Market', 'SMB', 'HML']);
      expect(result.factorReturns[0].weight).toBeCloseTo(1.2, 6);
    });

    it('should estimate size factor loading', () => {
      const result = famaFrench3Factor(stockReturns, marketExcess, smb, hml);
      expect(result.factorReturns[1].weight).toBeCloseTo(0.5, 6);
    });

    it('should estimate value factor loading', () => {
      const result = famaFrench3Factor(stockReturns, marketExcess, smb, hml);
      expect(result.factorReturns[2].weight).toBeCloseTo(-0.3, 6);
    });

    it('should annualize total return, alpha and report R²', () => {
      const result = famaFrench3Factor(stockReturns, marketExcess, smb, hml);
      const meanY = stockReturns.reduce((s, v) => s + v, 0) / stockReturns.length;
      expect(result.totalReturn).toBeCloseTo(meanY * 252, 10);
      expect(result.alpha).toBeCloseTo(0.01 * 252, 10);
      expect(result.rSquared).toBeCloseTo(1, 10);
      expect(result.trackingError).toBeLessThan(1e-10);
      expect(result.residualReturn).toBeCloseTo(0, 8);
    });
  });

  describe('Piotroski F-Score', () => {
    const stmt = (over: Partial<FinancialStatement> = {}): FinancialStatement => ({
      ticker: '600519',
      date: '2026-01-01',
      revenue: 1000,
      netIncome: 50,
      grossProfit: 160,
      operatingIncome: 80,
      totalAssets: 1000,
      totalEquity: 400,
      totalLiabilities: 600,
      currentAssets: 300,
      currentLiabilities: 300,
      cash: 100,
      inventory: 50,
      accountsReceivable: 60,
      operatingCashFlow: 40,
      investingCashFlow: -20,
      financingCashFlow: 0,
      capex: 10,
      interestExpense: 5,
      shares: 100,
      ...over,
    });

    // 9 条准则全过：ROA 改善、OCF>NI、负债率降、流动比率升、股本不变、毛利率升、周转率升
    const prevStrong = stmt({ revenue: 800, grossProfit: 160, netIncome: 50, operatingCashFlow: 40, totalLiabilities: 600, currentAssets: 300, currentLiabilities: 300, shares: 100 });
    const curStrong = stmt({ revenue: 900, grossProfit: 200, netIncome: 80, operatingCashFlow: 100, totalLiabilities: 500, currentAssets: 400, currentLiabilities: 300, shares: 100 });
    // 混合 5 条通过，用于「取值范围」用例
    const prevMixed = stmt({ revenue: 800, grossProfit: 160, netIncome: 50, operatingCashFlow: 40, totalLiabilities: 600, currentAssets: 300, currentLiabilities: 300, shares: 100 });
    const curMixed = stmt({ revenue: 900, grossProfit: 150, netIncome: 60, operatingCashFlow: 30, totalLiabilities: 700, currentAssets: 250, currentLiabilities: 300, shares: 110 });
    // 9 条全败
    const prevWeak = stmt({ revenue: 1000, grossProfit: 100, netIncome: -10, operatingCashFlow: -5, totalAssets: 1000, totalLiabilities: 200, currentAssets: 400, currentLiabilities: 300, shares: 100 });
    const curWeak = stmt({ revenue: 1000, grossProfit: 80, netIncome: -20, operatingCashFlow: -40, totalAssets: 1200, totalLiabilities: 400, currentAssets: 300, currentLiabilities: 300, shares: 120 });

    it('should score profitable stocks higher', () => {
      expect(calculatePiotroskiScore(curStrong, prevStrong).score)
        .toBeGreaterThan(calculatePiotroskiScore(curWeak, prevWeak).score);
    });

    it('should range from 0 to 9', () => {
      const { score, criteria } = calculatePiotroskiScore(curMixed, prevMixed);
      expect(Number.isInteger(score)).toBe(true);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(9);
      expect(criteria).toHaveLength(9);
    });

    it('should give max score for perfect stock', () => {
      const result = calculatePiotroskiScore(curStrong, prevStrong);
      expect(result.score).toBe(9);
      expect(result.criteria).toHaveLength(9);
      result.criteria.forEach(c => expect(c.passed).toBe(true));
    });

    it('should give 0 for worst stock', () => {
      const result = calculatePiotroskiScore(curWeak, prevWeak);
      expect(result.score).toBe(0);
      result.criteria.forEach(c => expect(c.passed).toBe(false));
    });
  });

  describe('Altman Z-Score', () => {
    const financialData = (over: Partial<FinancialData> = {}): FinancialData => ({
      totalAssets: 1e9,
      totalLiabilities: 3e8,
      currentAssets: 1e9,
      currentLiabilities: 3e8,
      retainedEarnings: 4e8,
      ebit: 1e8,
      marketCap: 5e9,
      revenue: 2e9,
      netIncome: 1e8,
      operatingCashFlow: 1.5e8,
      interestExpense: 2e7,
      totalDebt: 3e8,
      equity: 7e8,
      ...over,
    });

    it('should classify safe companies', () => {
      const result = calculateAltmanZScore(financialData());
      expect(result.zone).toBe('safe');
      // 1.2×0.7 + 1.4×0.4 + 3.3×0.1 + 0.6×16.6667 + 1×2 = 13.73（保留 2 位，creditRiskEngine.ts:114）
      expect(result.zScore).toBe(13.73);
      expect(result.components.workingCapitalRatio).toBe(0.7);
      expect(result.probabilities.bankruptcy2Year).toBe(0.01);
      expect(result.probabilities.bankruptcy4Year).toBe(0.015);
    });

    it('should classify distressed companies', () => {
      const result = calculateAltmanZScore(financialData({
        totalLiabilities: 9e8,
        currentLiabilities: 9e8,
        retainedEarnings: -1e8,
        ebit: 1e6,
        marketCap: 1e8,
        revenue: 5e8,
        netIncome: -5e7,
        operatingCashFlow: 1e7,
        interestExpense: 5e7,
        totalDebt: 9e8,
        equity: 1e8,
      }));
      expect(result.zone).toBe('distress');
      expect(result.zScore).toBe(0.55);
    });

    it('should handle zero assets', () => {
      // 生产零资产早退，忽略其余字段并给出破产概率 1（creditRiskEngine.ts:87-93）
      const result = calculateAltmanZScore(financialData({
        totalAssets: 0,
        totalLiabilities: 1e8,
        currentAssets: 1e7,
        currentLiabilities: 5e6,
        retainedEarnings: 1e7,
        ebit: 1e6,
        marketCap: 1e9,
        revenue: 1e8,
      }));
      expect(result.zone).toBe('distress');
      expect(result.zScore).toBe(0);
      expect(result.components).toEqual({
        workingCapitalRatio: 0,
        retainedEarningsRatio: 0,
        ebitRatio: 0,
        marketCapToLiabilities: 0,
        assetTurnover: 0,
      });
      expect(result.probabilities).toEqual({ bankruptcy2Year: 1, bankruptcy4Year: 1 });
    });

    it('should have score > 0 for healthy company', () => {
      const result = calculateAltmanZScore(financialData({
        totalLiabilities: 2e8,
        currentLiabilities: 2e8,
        retainedEarnings: 5e8,
        ebit: 2e8,
        marketCap: 8e9,
        revenue: 3e9,
        netIncome: 2e8,
        operatingCashFlow: 3e8,
        interestExpense: 1e7,
        totalDebt: 2e8,
        equity: 8e8,
      }));
      expect(result.zScore).toBeGreaterThan(0);
      expect(result.zScore).toBe(29.32);
      expect(result.zone).toBe('safe');
    });
  });

  describe('Momentum Score', () => {
    // 默认 lookbackShort=20（marketRegimeEngine.ts:64）
    const engine = new MarketRegimeEngine();

    it('should return positive for uptrend', () => {
      const prices = Array.from({ length: 30 }, (_, i) => 100 + i * 2);
      const result = engine.detectMomentumState(prices);
      expect(result.shortMomentum).toBeGreaterThan(0);
      expect(result.shortMomentum).toBeCloseTo(0.339, 4);
    });

    it('should return negative for downtrend', () => {
      const prices = Array.from({ length: 30 }, (_, i) => 200 - i * 2);
      expect(engine.detectMomentumState(prices).shortMomentum).toBeLessThan(0);
      expect(engine.detectMomentumState(prices).shortMomentum).toBeCloseTo(-0.2198, 4);
    });

    it('should return 0 for insufficient data', () => {
      // 生产要求 length >= period+1（marketRegimeEngine.ts:329），3 点不足 → 0
      expect(engine.detectMomentumState([1, 2, 3]).shortMomentum).toBe(0);
    });

    it('should return 0 for flat prices', () => {
      const prices = Array(25).fill(100);
      expect(engine.detectMomentumState(prices).shortMomentum).toBe(0);
    });

    it('should handle zero past price', () => {
      // 生产缺口：calcMomentum 无零基数守卫（marketRegimeEngine.ts:328-331），(10-0)/0 → Infinity；
      // 旧自抄实现守卫后返回 0。此处按生产口径固化。
      const result = engine.detectMomentumState([...Array(20).fill(0), 10]);
      expect(result.shortMomentum).toBe(Infinity);
      expect(Number.isFinite(result.shortMomentum)).toBe(false);
    });
  });

  describe('Quality Score', () => {
    const statement = (over: Partial<FinancialStatement> = {}): FinancialStatement => ({
      ticker: '600519',
      date: '2026-01-01',
      revenue: 1000,
      netIncome: 200,
      grossProfit: 600,
      operatingIncome: 250,
      totalAssets: 1000,
      totalEquity: 600,
      totalLiabilities: 200,
      currentAssets: 500,
      currentLiabilities: 250,
      cash: 200,
      inventory: 50,
      accountsReceivable: 80,
      operatingCashFlow: 250,
      investingCashFlow: -100,
      financingCashFlow: 0,
      capex: 50,
      interestExpense: 20,
      shares: 100,
      ...over,
    });

    const prevStatement = statement({ revenue: 700, netIncome: 100, grossProfit: 350, operatingCashFlow: 120 });
    const weakStatement = statement({
      netIncome: -50,
      grossProfit: 100,
      operatingIncome: -20,
      totalLiabilities: 1500,
      currentAssets: 250,
      currentLiabilities: 500,
      cash: 10,
      operatingCashFlow: -30,
      capex: 0,
      interestExpense: 200,
    });

    it('should score 0-100', () => {
      const result = calculateQualityScore(statement(), prevStatement);
      expect(result.totalScore).toBeGreaterThanOrEqual(0);
      expect(result.totalScore).toBeLessThanOrEqual(100);
    });

    it('should give higher score for better fundamentals', () => {
      const good = calculateQualityScore(statement(), prevStatement);
      const bad = calculateQualityScore(weakStatement);
      expect(good.totalScore).toBeGreaterThan(bad.totalScore);
      expect(good.grade).toBe('A');
      expect(bad.flags.length).toBeGreaterThan(0);
    });

    it('should cap at 100', () => {
      const result = calculateQualityScore(statement(), prevStatement);
      // 四维上限 25 + 27 + 25 + 25 = 102 → min(100, 102) = 100（financialAnalysisEngine.ts:224）
      const subtotal = result.profitabilityScore + result.growthScore + result.stabilityScore + result.cashFlowScore;
      expect(subtotal).toBe(102);
      expect(result.totalScore).toBe(100);
    });
  });

  describe('Multi-Factor Ranking', () => {
    const fundamental = (over: Partial<FundamentalData> & { symbol: string }): FundamentalData => ({
      pe: 20,
      pb: 2,
      ps: 2,
      pcf: 15,
      roe: 0.15,
      grossMargin: 0.3,
      netMargin: 0.1,
      revenueGrowth: 0.1,
      profitGrowth: 0.1,
      debtToEquity: 0.5,
      currentRatio: 2,
      operatingCashFlow: 5e8,
      netProfit: 2e8,
      dividendYield: 0.02,
      priceReturn6m: 0.05,
      priceReturn12m: 0.1,
      earningsSurprise: 0.02,
      ...over,
    });

    const best = fundamental({
      symbol: 'A', pe: 10, pb: 1, ps: 1, pcf: 8,
      roe: 0.3, grossMargin: 0.5, netMargin: 0.2,
      revenueGrowth: 0.3, profitGrowth: 0.4,
      operatingCashFlow: 1.5e9, netProfit: 5e8,
      priceReturn6m: 0.2, priceReturn12m: 0.4, earningsSurprise: 0.1,
    });
    const mid = fundamental({ symbol: 'B' });
    const worst = fundamental({
      symbol: 'C', pe: 50, pb: 5, ps: 5, pcf: 30,
      roe: 0.05, grossMargin: 0.1, netMargin: 0.02,
      revenueGrowth: -0.1, profitGrowth: -0.2,
      priceReturn6m: -0.1, priceReturn12m: -0.2, earningsSurprise: -0.05,
    });

    it('should rank stocks by total score', () => {
      const ranked = quantScreening([best, mid, worst]);
      expect(ranked.map(r => r.symbol)).toEqual(['A', 'B', 'C']);
      // B 的质量分为 43（非 50）：B 与 C 的 OCF/netProfit 均为 2.5，percentileRank 用
      // sorted.indexOf(value) 取并列首个下标 0（fundamentalQuantEngine.ts:47-52），
      // cfPercentile=0 → qualityScore=round((.5×.35 + .5×.25 + .5×.25 + 0×.15)×100)=43，
      // 故 totalScore=round(50×.3+43×.3+50×.25+50×.15)=48
      expect(ranked.map(r => r.totalScore)).toEqual([100, 48, 0]);
      expect(ranked.map(r => r.rank)).toEqual([1, 2, 3]);
      expect(ranked.map(r => r.percentile)).toEqual([100, 50, 0]);
    });

    it('should include all factor scores', () => {
      const [result] = quantScreening([best]);
      expect(result.factorBreakdown.map(f => f.factor)).toEqual(['价值', '质量', '成长', '动量']);
      expect(result.factorBreakdown.map(f => f.weight)).toEqual([0.3, 0.3, 0.25, 0.15]);
      result.factorBreakdown.forEach(f => expect(typeof f.score).toBe('number'));
    });

    it('should handle empty array', () => {
      expect(quantScreening([])).toHaveLength(0);
    });

    it('should handle single stock', () => {
      // 生产单股百分位：价值因子反向 1-0=100，其余 0 → totalScore=30、rank=1、percentile=100
      const ranked = quantScreening([mid]);
      expect(ranked).toHaveLength(1);
      expect(ranked[0].symbol).toBe('B');
      expect(ranked[0].totalScore).toBe(30);
      expect(ranked[0].rank).toBe(1);
      expect(ranked[0].percentile).toBe(100);
    });
  });
});
