/**
 * 谐波形态识别引擎
 * - Gartley形态
 * - Butterfly形态
 * - Bat形态
 * - Crab形态
 * - AB=CD形态
 * - 形态完成度评分
 */
export interface PricePoint {
  price: number;
  index: number;
}

export interface HarmonicPattern {
  type: 'gartley' | 'butterfly' | 'bat' | 'crab' | 'abcd' | 'cypher' | 'none';
  points: { X: PricePoint; A: PricePoint; B: PricePoint; C: PricePoint; D: PricePoint };
  ratios: {
    abxa: number; // AB/XA
    bcab: number; // BC/AB
    cdab: number; // CD/AB
    cdxa: number; // CD/XA
  };
  completionPct: number;
  direction: 'bullish' | 'bearish';
  expectedTarget: PricePoint;
  stopLoss: PricePoint;
  confidence: number;
}

export interface HarmonicAnalysis {
  patterns: HarmonicPattern[];
  activePattern: HarmonicPattern | null;
  nearestPattern: HarmonicPattern | null;
  keyLevels: number[];
  alerts: string[];
}

export function detectHarmonicPatterns(
  highs: PricePoint[],
  lows: PricePoint[],
  tolerance: number = 0.05
): HarmonicAnalysis {
  const patterns: HarmonicPattern[] = [];
  const allPivots = [...highs.map(h => ({ ...h, type: 'high' as const })), ...lows.map(l => ({ ...l, type: 'low' as const }))]
    .sort((a, b) => a.index - b.index);

  // 检测5点序列
  for (let i = 0; i < allPivots.length - 4; i++) {
    const [p1, p2, p3, p4, p5] = allPivots.slice(i, i + 5);

    // 判断方向
    const isBullish = p1.type === 'low' && p2.type === 'high' && p3.type === 'low' && p4.type === 'high' && p5.type === 'low';
    const isBearish = p1.type === 'high' && p2.type === 'low' && p3.type === 'high' && p4.type === 'low' && p5.type === 'high';

    if (!isBullish && !isBearish) continue;

    const X = p1, A = p2, B = p3, C = p4, D = p5;
    const xaRange = Math.abs(A.price - X.price);
    const abRange = Math.abs(B.price - A.price);
    const bcRange = Math.abs(C.price - B.price);
    const cdRange = Math.abs(D.price - C.price);

    if (xaRange === 0) continue;

    const abxa = abRange / xaRange;
    const bcab = abRange > 0 ? bcRange / abRange : 0;
    const cdab = abRange > 0 ? cdRange / abRange : 0;
    const cdxa = cdRange / xaRange;

    // 匹配形态
    const patternType = matchPattern(abxa, bcab, cdxa, tolerance);
    if (patternType === 'none') continue;

    // 完成度
    const idealRatios = getIdealRatios(patternType);
    const completionPct = 1 - (
      Math.abs(abxa - idealRatios.abxa) +
      Math.abs(bcab - idealRatios.bcab) +
      Math.abs(cdxa - idealRatios.cdxa)
    ) / 3;

    // 目标和止损
    const expectedTarget: PricePoint = {
      price: isBullish ? A.price : A.price,
      index: D.index + 10,
    };
    const stopLoss: PricePoint = {
      price: isBullish ? X.price * 0.99 : X.price * 1.01,
      index: D.index,
    };

    const confidence = Math.max(0, Math.min(1, completionPct * 0.8 + 0.2));

    patterns.push({
      type: patternType,
      points: { X, A, B, C, D },
      ratios: { abxa, bcab, cdab, cdxa },
      completionPct: Math.max(0, completionPct),
      direction: isBullish ? 'bullish' : 'bearish',
      expectedTarget,
      stopLoss,
      confidence,
    });
  }

  // 按完成度排序
  patterns.sort((a, b) => b.completionPct - a.completionPct);

  const activePattern = patterns.find(p => p.completionPct > 0.9) ?? null;
  const nearestPattern = patterns[0] ?? null;

  const keyLevels = patterns.flatMap(p => [
    p.points.X.price, p.points.A.price, p.points.B.price,
    p.points.C.price, p.points.D.price,
  ]).filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b);

  const alerts: string[] = [];
  if (activePattern) alerts.push(`检测到${activePattern.type}形态，方向: ${activePattern.direction}`);
  if (patterns.some(p => p.completionPct > 0.95)) alerts.push('形态接近完成');

  return { patterns, activePattern, nearestPattern, keyLevels, alerts };
}

function matchPattern(abxa: number, bcab: number, cdxa: number, tol: number): HarmonicPattern['type'] {
  const near = (val: number, target: number) => Math.abs(val - target) <= tol;

  if (near(abxa, 0.618) && near(cdxa, 0.786)) return 'gartley';
  if (near(abxa, 0.786) && near(cdxa, 1.272)) return 'butterfly';
  if (near(abxa, 0.382) && near(cdxa, 1.618)) return 'bat';
  if (near(abxa, 0.382) && near(cdxa, 3.618)) return 'crab';
  if (near(abxa, 0.618) && near(cdxa, 1.272)) return 'abcd';
  if (near(abxa, 0.382) && near(cdxa, 1.272)) return 'cypher';
  return 'none';
}

function getIdealRatios(type: HarmonicPattern['type']): { abxa: number; bcab: number; cdxa: number } {
  const ratios: Record<string, { abxa: number; bcab: number; cdxa: number }> = {
    gartley: { abxa: 0.618, bcab: 0.382, cdxa: 0.786 },
    butterfly: { abxa: 0.786, bcab: 0.382, cdxa: 1.272 },
    bat: { abxa: 0.382, bcab: 0.382, cdxa: 1.618 },
    crab: { abxa: 0.382, bcab: 0.618, cdxa: 3.618 },
    abcd: { abxa: 0.618, bcab: 0.382, cdxa: 1.272 },
    cypher: { abxa: 0.382, bcab: 0.382, cdxa: 1.272 },
    none: { abxa: 0, bcab: 0, cdxa: 0 },
  };
  return ratios[type];
}
