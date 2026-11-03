import { describe, it, expect } from 'vitest';
import { bsmPrice, impliedVol } from '../services/impliedVolEngine';
import { delta, gamma, theta, vega, rho } from '../services/optionsGreeksEngine';
import { analyzeBasis, analyzeTermStructure } from '../../../frontend/src/utils/futuresBasisEngine';
import type { FuturesData } from '../../../frontend/src/utils/futuresBasisEngine';

// 期权与衍生品测试（影子测试治理批次 8）
// 生产真源（唯一）：
//   backend/src/services/impliedVolEngine.ts     → bsmPrice / impliedVol
//   backend/src/services/optionsGreeksEngine.ts  → delta / gamma / theta / vega / rho
//   frontend/src/utils/futuresBasisEngine.ts     → analyzeBasis / analyzeTermStructure（基差、期限结构）
// 已删除自抄实现：normalCDF / bsCall / bsPut / delta / gamma / vega / theta。
// 接口口径：greeks 使用 isCall:boolean（旧自抄只实现了 call 侧）；bsmPrice 在 T<=0 时直接返回内在价值；
//   vega 为「每 1.00 波动率单位」（旧自抄 /100 即每 1%），本文件只断言符号，不受影响；theta 已按 /365 日化。
// 按生产口径修正的断言：
//   - delta ATM（旧 L132-135 断言 0.5±0.1）：S=K=100、r=0.05、T=1 时 d1=(r+σ²/2)T/(σ√T)>0，
//     生产 delta=0.6368；生产正确，旧断言误把「现货 ATM 的 delta≈0.5」套到含无风险利率的场景。
//   - warrant 杠杆（旧 L211-217 写死 delta=0.6）：改用生产 delta(50,45,1,0.05,0.2,true)=0.8097，
//     杠杆=(50/5)*0.8097≈8.097（旧断言 6 为常量硬编码，不是期权 delta）。
//   - warrant 理论价值 / 到期 OTM 改用 bsmPrice(..., T=0) 的内在价值口径。
// 未迁移（生产无对应实现，保留本地算术，不在生产侧虚构）：
//   1) 期货持有成本定价 spot*e^{rT}：futuresBasisEngine 只做基差/期限结构分析，无期货定价函数；
//   2) 期货保证金（初始/维持/追保/利用率/PnL）：frontend marginTradingEngine 是融资融券余额分析，口径不同，不硬套；
//   3) 权证溢价率 / 盈亏平衡点：纯算术，无生产实现。
describe('Options & Derivatives', () => {
  // Black-Scholes 定价：直接调用生产 bsmPrice（isCall:boolean）
  describe('Black-Scholes Calculations', () => {
    it('should calculate call option price', () => {
      const call = bsmPrice(100, 100, 1, 0.05, 0.2, true);
      expect(call).toBeGreaterThan(0);
      expect(call).toBeCloseTo(10.4506, 3);
    });

    it('should calculate put option price', () => {
      const put = bsmPrice(100, 100, 1, 0.05, 0.2, false);
      expect(put).toBeGreaterThan(0);
      expect(put).toBeCloseTo(5.5735, 3);
    });

    it('should satisfy put-call parity', () => {
      const S = 100, K = 100, T = 1, r = 0.05, sigma = 0.2;
      const call = bsmPrice(S, K, T, r, sigma, true);
      const put = bsmPrice(S, K, T, r, sigma, false);
      const lhs = call - put;
      const rhs = S - K * Math.exp(-r * T);
      expect(lhs).toBeCloseTo(rhs, 3);
    });

    it('should have call > put for ATM options', () => {
      const call = bsmPrice(100, 100, 1, 0.05, 0.2, true);
      const put = bsmPrice(100, 100, 1, 0.05, 0.2, false);
      expect(call).toBeGreaterThan(put);
    });

    it('should have ITM call > OTM call', () => {
      const itm = bsmPrice(110, 100, 1, 0.05, 0.2, true);
      const otm = bsmPrice(90, 100, 1, 0.05, 0.2, true);
      expect(itm).toBeGreaterThan(otm);
    });

    it('should have ITM put > OTM put', () => {
      const itm = bsmPrice(90, 100, 1, 0.05, 0.2, false);
      const otm = bsmPrice(110, 100, 1, 0.05, 0.2, false);
      expect(itm).toBeGreaterThan(otm);
    });

    it('should approach intrinsic value as T→0', () => {
      const intrinsic = Math.max(110 - 100, 0);
      const call = bsmPrice(110, 100, 0.001, 0.05, 0.2, true);
      expect(call).toBeGreaterThanOrEqual(intrinsic);
      expect(call).toBeCloseTo(intrinsic, 1);
    });

    it('should increase with higher volatility', () => {
      const lowVol = bsmPrice(100, 100, 1, 0.05, 0.1, true);
      const highVol = bsmPrice(100, 100, 1, 0.05, 0.4, true);
      expect(highVol).toBeGreaterThan(lowVol);
    });

    it('should increase with longer time to expiry', () => {
      const short = bsmPrice(100, 100, 0.5, 0.05, 0.2, true);
      const long = bsmPrice(100, 100, 2, 0.05, 0.2, true);
      expect(long).toBeGreaterThan(short);
    });
  });

  // Greeks：直接调用生产实现（均为 call/put 双口径）
  describe('Greeks', () => {
    it('should have delta between 0 and 1 for calls', () => {
      const d = delta(100, 100, 1, 0.05, 0.2, true);
      expect(d).toBeGreaterThan(0);
      expect(d).toBeLessThan(1);
    });

    it('should have delta near 0.6368 for spot-ATM call with r>0', () => {
      const d = delta(100, 100, 1, 0.05, 0.2, true);
      expect(d).toBeCloseTo(0.6368, 3);
    });

    it('should have delta approach 1 for deep ITM', () => {
      const d = delta(200, 100, 1, 0.05, 0.2, true);
      expect(d).toBeGreaterThan(0.9);
    });

    it('should have delta approach 0 for deep OTM', () => {
      const d = delta(50, 100, 1, 0.05, 0.2, true);
      expect(d).toBeLessThan(0.1);
    });

    it('should have gamma positive for all options', () => {
      const g = gamma(100, 100, 1, 0.05, 0.2);
      expect(g).toBeGreaterThan(0);
    });

    it('should have gamma peak at ATM', () => {
      const atmGamma = gamma(100, 100, 1, 0.05, 0.2);
      const otmGamma = gamma(80, 100, 1, 0.05, 0.2);
      expect(atmGamma).toBeGreaterThan(otmGamma);
    });

    it('should have vega positive for all options', () => {
      const v = vega(100, 100, 1, 0.05, 0.2);
      expect(v).toBeGreaterThan(0);
    });

    it('should have theta negative for long options', () => {
      const t = theta(100, 100, 1, 0.05, 0.2, true);
      expect(t).toBeLessThan(0);
    });

    it('should have theta magnitude increase near expiry', () => {
      const farTheta = Math.abs(theta(100, 100, 1, 0.05, 0.2, true));
      const nearTheta = Math.abs(theta(100, 100, 0.1, 0.05, 0.2, true));
      expect(nearTheta).toBeGreaterThan(farTheta);
    });

    it('should have positive rho for calls and negative rho for puts', () => {
      const callRho = rho(100, 100, 1, 0.05, 0.2, true);
      const putRho = rho(100, 100, 1, 0.05, 0.2, false);
      expect(callRho).toBeCloseTo(0.5323, 3);
      expect(putRho).toBeCloseTo(-0.4189, 3);
      expect(callRho).toBeGreaterThan(0);
      expect(putRho).toBeLessThan(0);
    });
  });

  // 隐含波动率：用生产 bsmPrice 造价格、再用生产 impliedVol 反解
  describe('Implied Volatility', () => {
    it('should estimate IV from market price', () => {
      const S = 100, K = 100, T = 1, r = 0.05;
      const marketPrice = bsmPrice(S, K, T, r, 0.2, true);
      const iv = impliedVol(marketPrice, S, K, T, r, true);
      expect(iv).toBeCloseTo(0.2, 4);
    });

    it('should recover higher IV from a higher market price', () => {
      const S = 100, K = 100, T = 1, r = 0.05;
      const lowIV = impliedVol(bsmPrice(S, K, T, r, 0.2, true), S, K, T, r, true);
      const highIV = impliedVol(bsmPrice(S, K, T, r, 0.35, true), S, K, T, r, true);
      expect(lowIV).toBeCloseTo(0.2, 4);
      expect(highIV).toBeCloseTo(0.35, 4);
      expect(highIV).toBeGreaterThan(lowIV);
    });
  });

  // 权证定价：内在价值走生产 bsmPrice(T=0)，杠杆走生产 delta
  describe('Warrant Pricing', () => {
    it('should calculate warrant theoretical value', () => {
      const theoreticalValue = bsmPrice(50, 45, 0, 0.05, 0.2, true);
      expect(theoreticalValue).toBe(5);
    });

    it('should calculate premium percentage', () => {
      const marketPrice = 8;
      const intrinsicValue = bsmPrice(50, 45, 0, 0.05, 0.2, true);
      const premium = ((marketPrice - intrinsicValue) / intrinsicValue) * 100;
      expect(premium).toBe(60);
    });

    it('should calculate leverage ratio', () => {
      const underlyingPrice = 50;
      const warrantPrice = 5;
      const d = delta(underlyingPrice, 45, 1, 0.05, 0.2, true);
      const leverage = (underlyingPrice / warrantPrice) * d;
      expect(leverage).toBeCloseTo(8.097, 3);
    });

    it('should calculate break-even price', () => {
      const exercisePrice = 45;
      const warrantPrice = 8;
      const breakEven = exercisePrice + warrantPrice;
      expect(breakEven).toBe(53);
    });

    it('should have zero value for OTM warrants at expiry', () => {
      expect(bsmPrice(40, 45, 0, 0.05, 0.2, true)).toBe(0);
    });
  });

  // 期货：基差/期限结构走生产 futuresBasisEngine
  describe('Futures Pricing', () => {
    function makeFutures(spot: number, futuresPrice: number, daysToExpiry = 30): FuturesData {
      const basis = futuresPrice - spot;
      return {
        ticker: 'IF2412',
        name: '沪深300股指期货',
        type: 'IF',
        spot,
        futures: futuresPrice,
        basis,
        basisRatio: spot > 0 ? basis / spot : 0,
        daysToExpiry,
        expiryDate: '2026-12-19',
        volume: 0,
        openInterest: 0,
      };
    }

    // 未迁移：持有成本定价 spot*e^{rT}，futuresBasisEngine 无定价函数
    it('should calculate futures price (cost of carry)', () => {
      const spot = 100;
      const r = 0.05;
      const T = 0.5;
      const futures = spot * Math.exp(r * T);
      expect(futures).toBeCloseTo(102.53, 1);
    });

    it('should classify rising basis as contango', () => {
      const term = analyzeTermStructure([makeFutures(100, 101, 30), makeFutures(100, 102.5, 60)]);
      expect(term?.structure).toBe('contango');
    });

    it('should classify falling basis as backwardation', () => {
      const term = analyzeTermStructure([makeFutures(100, 99, 30), makeFutures(100, 98, 60)]);
      expect(term?.structure).toBe('backwardation');
    });

    it('should calculate basis', () => {
      // 生产 analyzeBasis 只返回基差状态；原始基差从 analyzeTermStructure 的 contracts 读取
      const term = analyzeTermStructure([makeFutures(100, 102.5, 30), makeFutures(100, 104, 60)]);
      expect(term?.contracts[0].basis).toBe(2.5);
      expect(analyzeBasis(makeFutures(100, 102.5)).basisState).toBe('premium');
    });

    it('should annualize basis by days to expiry', () => {
      const term = analyzeTermStructure([makeFutures(100, 102.5, 30), makeFutures(100, 104, 60)]);
      // 年化基差 = (basis / spot) * (365 / daysToExpiry)
      expect(term?.contracts[0].annualized).toBeCloseTo((2.5 / 100) * (365 / 30), 10);
    });
  });

  // 未迁移：期货保证金（初始/维持/追保/利用率/PnL），backend 无对应生产实现
  describe('Margin Requirements', () => {
    it('should calculate initial margin', () => {
      const contractValue = 100000;
      const marginRate = 0.12;
      const initialMargin = contractValue * marginRate;
      expect(initialMargin).toBe(12000);
    });

    it('should calculate maintenance margin', () => {
      const initialMargin = 12000;
      const maintenanceRate = 0.75;
      const maintenanceMargin = initialMargin * maintenanceRate;
      expect(maintenanceMargin).toBe(9000);
    });

    it('should detect margin call', () => {
      const equity = 8000;
      const maintenanceMargin = 9000;
      expect(equity).toBeLessThan(maintenanceMargin);
    });

    it('should calculate margin utilization', () => {
      const used = 8000;
      const available = 12000;
      const utilization = (used / available) * 100;
      expect(utilization).toBeCloseTo(66.67, 1);
    });

    it('should calculate PnL impact on margin', () => {
      const initialEquity = 12000;
      const pnl = -2000;
      const currentEquity = initialEquity + pnl;
      expect(currentEquity).toBe(10000);
    });
  });
});
