import { describe, it, expect } from 'vitest';
import { updateBetaPrior, shrinkageEstimate, BetaPrior } from '../services/bayesianEstimator';

describe('BayesianEstimator', () => {
  describe('updateBetaPrior', () => {
    it('updates posterior correctly', () => {
      const prior: BetaPrior = { alpha: 2, beta: 2 };
      const post = updateBetaPrior(prior, 7, 3);
      expect(post.alpha).toBe(9);
      expect(post.beta).toBe(5);
    });

    it('posterior mean is between prior and observed', () => {
      const prior: BetaPrior = { alpha: 1, beta: 1 };
      const post = updateBetaPrior(prior, 8, 2);
      const priorMean = prior.alpha / (prior.alpha + prior.beta);
      const obsRate = 8 / 10;
      expect(post.mean).toBeGreaterThan(priorMean);
      expect(post.mean).toBeLessThanOrEqual(obsRate + 0.01);
    });

    it('variance is positive', () => {
      const post = updateBetaPrior({ alpha: 1, beta: 1 }, 5, 5);
      expect(post.variance).toBeGreaterThan(0);
    });

    it('credible interval is valid', () => {
      const post = updateBetaPrior({ alpha: 2, beta: 3 }, 10, 5);
      expect(post.credible95[0]).toBeGreaterThanOrEqual(0);
      expect(post.credible95[1]).toBeLessThanOrEqual(1);
      expect(post.credible95[0]).toBeLessThan(post.credible95[1]);
    });

    it('mode equals (a-1)/(a+b-2) when a,b > 1', () => {
      const post = updateBetaPrior({ alpha: 3, beta: 3 }, 5, 5);
      expect(post.mode).toBeCloseTo((post.alpha - 1) / (post.alpha + post.beta - 2), 3);
    });

    it('mode falls back to mean when a<=1', () => {
      const post = updateBetaPrior({ alpha: 0.5, beta: 0.5 }, 0, 0);
      expect(post.mode).toBe(post.mean);
    });

    it('strong prior shrinks estimate', () => {
      const strong = updateBetaPrior({ alpha: 100, beta: 100 }, 8, 2);
      const weak = updateBetaPrior({ alpha: 1, beta: 1 }, 8, 2);
      expect(strong.mean).toBeLessThan(weak.mean);
    });

    it('no data keeps prior', () => {
      const prior: BetaPrior = { alpha: 5, beta: 3 };
      const post = updateBetaPrior(prior, 0, 0);
      expect(post.alpha).toBe(5);
      expect(post.beta).toBe(3);
    });

    it('all successes', () => {
      const post = updateBetaPrior({ alpha: 1, beta: 1 }, 20, 0);
      expect(post.mean).toBeGreaterThan(0.9);
    });

    it('all failures', () => {
      const post = updateBetaPrior({ alpha: 1, beta: 1 }, 0, 20);
      expect(post.mean).toBeLessThan(0.1);
    });
  });

  describe('shrinkageEstimate', () => {
    it('shrinks toward prior', () => {
      const est = shrinkageEstimate(0.8, 0.5, 5);
      expect(est).toBeGreaterThan(0.5);
      expect(est).toBeLessThan(0.8);
    });

    it('large sample approaches observed', () => {
      const est = shrinkageEstimate(0.8, 0.5, 1000);
      expect(est).toBeCloseTo(0.8, 1);
    });

    it('zero sample equals prior', () => {
      const est = shrinkageEstimate(0.8, 0.5, 0);
      expect(est).toBe(0.5);
    });

    it('custom shrinkage factor', () => {
      const est1 = shrinkageEstimate(0.8, 0.5, 10, 5);
      const est2 = shrinkageEstimate(0.8, 0.5, 10, 100);
      expect(est1).toBeGreaterThan(est2);
    });

    it('returns number', () => {
      expect(typeof shrinkageEstimate(0.5, 0.5, 10)).toBe('number');
    });
  });
});
