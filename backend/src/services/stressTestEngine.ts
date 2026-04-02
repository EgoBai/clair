/**
 * StressTestEngine - 压力测试引擎
 * 模拟极端市场情景下的组合表现
 */

export interface Scenario { name: string; shocks: Map<string, number>; }

export function applyScenario(portfolio: Map<string, number>, scenario: Scenario): number {
  let pnl = 0;
  portfolio.forEach((weight, code) => {
    const shock = scenario.shocks.get(code) || 0;
    pnl += weight * shock;
  });
  return pnl;
}

export function multiScenarioTest(portfolio: Map<string, number>, scenarios: Scenario[]): Map<string, number> {
  const results = new Map<string, number>();
  scenarios.forEach(s => results.set(s.name, applyScenario(portfolio, s)));
  return results;
}

export function worstCase(portfolio: Map<string, number>, scenarios: Scenario[]): { name: string; pnl: number } {
  let worst = { name: '', pnl: Infinity };
  scenarios.forEach(s => {
    const pnl = applyScenario(portfolio, s);
    if (pnl < worst.pnl) worst = { name: s.name, pnl };
  });
  return worst;
}

export function stressVaR(returns: number[], confidence: number): number {
  if (returns.length === 0) return 0;
  const sorted = [...returns].sort((a, b) => a - b);
  const idx = Math.floor((1 - confidence) * sorted.length);
  return -sorted[Math.min(idx, sorted.length - 1)];
}

export function historicalScenario(returns: Map<string, number[]>, eventStart: number, eventEnd: number): Map<string, number> {
  const result = new Map<string, number>();
  returns.forEach((series, code) => {
    const slice = series.slice(eventStart, eventEnd + 1);
    result.set(code, slice.reduce((a, b) => a + b, 0));
  });
  return result;
}
