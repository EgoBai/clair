import { describe, it, expect } from 'vitest';
import { portfolioReturn, concentrationRisk, diversificationRatio, marginalRiskContribution, Asset } from '../services/portfolioStressEngine';

const assets: Asset[] = [
  { code: 'A', weight: 0.6, returns: [0.01, 0.02, -0.01, 0.03] },
  { code: 'B', weight: 0.4, returns: [0.02, -0.01, 0.02, 0.01] },
];

describe('portfolioStressEngine', () => {
  it('portfolioReturn correct length', () => {
    expect(portfolioReturn(assets).length).toBe(4);
  });
  it('portfolioReturn weighted sum', () => {
    const pr = portfolioReturn(assets);
    expect(pr[0]).toBeCloseTo(0.01 * 0.6 + 0.02 * 0.4);
  });
  it('portfolioReturn empty', () => { expect(portfolioReturn([])).toEqual([]); });
  it('portfolioReturn single asset', () => {
    const pr = portfolioReturn([{ code: 'A', weight: 1.0, returns: [0.05, 0.03] }]);
    expect(pr).toEqual([0.05, 0.03]);
  });
  it('concentrationRisk equal weights', () => {
    expect(concentrationRisk([0.5, 0.5])).toBeCloseTo(0.5);
  });
  it('concentrationRisk concentrated', () => {
    expect(concentrationRisk([1.0, 0])).toBeCloseTo(1.0);
  });
  it('concentrationRisk empty', () => { expect(concentrationRisk([])).toBe(0); });
  it('concentrationRisk normalizes weights', () => {
    expect(concentrationRisk([2, 2])).toBeCloseTo(0.5);
  });
  it('diversificationRatio > 1 for diversified', () => {
    const a: Asset[] = [
      { code: 'A', weight: 0.5, returns: [0.01, -0.01, 0.01, -0.01] },
      { code: 'B', weight: 0.5, returns: [-0.01, 0.01, -0.01, 0.01] },
    ];
    expect(diversificationRatio(a)).toBeGreaterThan(1);
  });
  it('diversificationRatio empty', () => { expect(diversificationRatio([])).toBe(0); });
  it('diversificationRatio single asset', () => {
    const a: Asset[] = [{ code: 'A', weight: 1.0, returns: [0.01, 0.02, -0.01] }];
    const dr = diversificationRatio(a);
    expect(typeof dr).toBe('number');
  });
  it('marginalRiskContribution returns map', () => {
    const mrc = marginalRiskContribution(assets);
    expect(mrc.size).toBe(2);
    expect(mrc.has('A')).toBe(true);
  });
  it('marginalRiskContribution values positive', () => {
    const mrc = marginalRiskContribution(assets);
    mrc.forEach(v => { expect(v).toBeGreaterThanOrEqual(0); });
  });
  it('marginalRiskContribution zero vol', () => {
    const a: Asset[] = [{ code: 'A', weight: 1.0, returns: [0, 0, 0] }];
    const mrc = marginalRiskContribution(a);
    expect(mrc.get('A')).toBe(0);
  });
  it('concentrationRisk with three assets', () => {
    expect(concentrationRisk([1/3, 1/3, 1/3])).toBeCloseTo(1/3);
  });
  it('portfolioReturn different lengths', () => {
    const a: Asset[] = [
      { code: 'A', weight: 0.5, returns: [1, 2, 3] },
      { code: 'B', weight: 0.5, returns: [4, 5] },
    ];
    expect(portfolioReturn(a).length).toBe(2);
  });
  it('diversificationRatio perfectly correlated', () => {
    const a: Asset[] = [
      { code: 'A', weight: 0.5, returns: [0.01, 0.02, 0.03] },
      { code: 'B', weight: 0.5, returns: [0.01, 0.02, 0.03] },
    ];
    expect(diversificationRatio(a)).toBeCloseTo(1, 0);
  });
  it('marginalRiskContribution two equal assets', () => {
    const a: Asset[] = [
      { code: 'A', weight: 0.5, returns: [0.01, 0.02] },
      { code: 'B', weight: 0.5, returns: [0.01, 0.02] },
    ];
    const mrc = marginalRiskContribution(a);
    expect(mrc.get('A')).toBeCloseTo(mrc.get('B')!);
  });
  it('concentrationRisk all weight on one', () => {
    expect(concentrationRisk([100, 0, 0])).toBeCloseTo(1);
  });
  it('portfolioReturn negative weights', () => {
    const a: Asset[] = [
      { code: 'A', weight: 1.5, returns: [0.02] },
      { code: 'B', weight: -0.5, returns: [0.04] },
    ];
    expect(portfolioReturn(a)[0]).toBeCloseTo(0.01);
  });
});
