/**
 * 相对价值引擎
 * - 同行业内公司对比
 * - EV/EBITDA相对估值
 * - PEG相对比较
 * - 估值价差分析
 * - 均值回归信号
 */
export interface ComparableCompany {
  code: string;
  name: string;
  industry: string;
  marketCap: number;
  ev: number; // 企业价值
  ebitda: number;
  netIncome: number;
  growth: number; // 预期增长率
  pe: number;
  pb: number;
  roe: number;
}

export interface RelativeValueResult {
  code: string;
  peRelative: number; // 相对行业PE
  pbRelative: number;
  evEbitdaRelative: number;
  pegRelative: number;
  compositeDiscount: number; // 综合折价/溢价
  signal: 'undervalued' | 'fairly_valued' | 'overvalued';
  confidence: number;
  rankInIndustry: number;
}

export interface RelativeValueAnalysis {
  results: RelativeValueResult[];
  topPicks: RelativeValueResult[];
  industryStats: Array<{
    industry: string;
    avgPE: number;
    avgPB: number;
    avgEVEBITDA: number;
    avgPEG: number;
    count: number;
  }>;
  arbitrageOpportunities: Array<{
    long: string;
    short: string;
    spread: number;
    expectedReturn: number;
  }>;
}

export function analyzeRelativeValue(companies: ComparableCompany[]): RelativeValueAnalysis {
  if (companies.length === 0) throw new Error('公司数据不能为空');

  // 按行业分组
  const industryMap = new Map<string, ComparableCompany[]>();
  for (const c of companies) {
    const arr = industryMap.get(c.industry) ?? [];
    arr.push(c);
    industryMap.set(c.industry, arr);
  }

  // 行业统计
  const industryStats = [...industryMap.entries()].map(([industry, comps]) => {
    const validPE = comps.filter(c => c.pe > 0 && c.pe < 200);
    const validPB = comps.filter(c => c.pb > 0);
    const validEVEBITDA = comps.filter(c => c.ebitda > 0);
    const validPEG = comps.filter(c => c.growth > 0 && c.pe > 0 && c.pe / (c.growth * 100) < 10);
    
    return {
      industry,
      avgPE: validPE.length > 0 ? validPE.reduce((s, c) => s + c.pe, 0) / validPE.length : 0,
      avgPB: validPB.length > 0 ? validPB.reduce((s, c) => s + c.pb, 0) / validPB.length : 0,
      avgEVEBITDA: validEVEBITDA.length > 0 ? validEVEBITDA.reduce((s, c) => s + c.ev / c.ebitda, 0) / validEVEBITDA.length : 0,
      avgPEG: validPEG.length > 0 ? validPEG.reduce((s, c) => s + c.pe / (c.growth * 100), 0) / validPEG.length : 0,
      count: comps.length,
    };
  });

  // 每家公司分析
  const results: RelativeValueResult[] = companies.map(c => {
    const indStats = industryStats.find(s => s.industry === c.industry);
    if (!indStats) {
      return { code: c.code, peRelative: 1, pbRelative: 1, evEbitdaRelative: 1, pegRelative: 1, compositeDiscount: 0, signal: 'fairly_valued' as const, confidence: 0.5, rankInIndustry: 1 };
    }

    const evEbitda = c.ebitda > 0 ? c.ev / c.ebitda : 0;
    const peg = c.growth > 0 ? c.pe / (c.growth * 100) : 0;

    const peRelative = indStats.avgPE > 0 ? c.pe / indStats.avgPE : 1;
    const pbRelative = indStats.avgPB > 0 ? c.pb / indStats.avgPB : 1;
    const evEbitdaRelative = indStats.avgEVEBITDA > 0 && evEbitda > 0 ? evEbitda / indStats.avgEVEBITDA : 1;
    const pegRelative = indStats.avgPEG > 0 && peg > 0 ? peg / indStats.avgPEG : 1;

    // 综合折价 (正值=折价, 负值=溢价)
    const compositeDiscount = (1 - peRelative) * 0.3 + (1 - pbRelative) * 0.2 + (1 - evEbitdaRelative) * 0.3 + (1 - pegRelative) * 0.2;

    let signal: 'undervalued' | 'fairly_valued' | 'overvalued';
    if (compositeDiscount > 0.1) signal = 'undervalued';
    else if (compositeDiscount < -0.1) signal = 'overvalued';
    else signal = 'fairly_valued';

    const confidence = Math.min(1, 0.5 + Math.abs(compositeDiscount) * 2);

    // 行业排名
    const indComps = industryMap.get(c.industry) ?? [];
    const sorted = [...indComps].sort((a, b) => {
      const aScore = (a.pe > 0 ? 1/a.pe : 0) + (a.growth > 0 ? a.growth : 0);
      const bScore = (b.pe > 0 ? 1/b.pe : 0) + (b.growth > 0 ? b.growth : 0);
      return bScore - aScore;
    });
    const rankInIndustry = sorted.findIndex(comp => comp.code === c.code) + 1;

    return { code: c.code, peRelative, pbRelative, evEbitdaRelative, pegRelative, compositeDiscount, signal, confidence, rankInIndustry };
  });

  const topPicks = results.filter(r => r.signal === 'undervalued').sort((a, b) => b.compositeDiscount - a.compositeDiscount).slice(0, 10);

  // 套利机会 (同行业内做多低估/做空高估)
  const arbitrageOpportunities: Array<{ long: string; short: string; spread: number; expectedReturn: number }> = [];
  for (const [_industry, comps] of industryMap) {
    if (comps.length < 2) continue;
    const indResults = results.filter(r => comps.some(c => c.code === r.code));
    const sorted = [...indResults].sort((a, b) => b.compositeDiscount - a.compositeDiscount);
    if (sorted.length >= 2 && sorted[0].compositeDiscount - sorted[sorted.length - 1].compositeDiscount > 0.2) {
      arbitrageOpportunities.push({
        long: sorted[0].code,
        short: sorted[sorted.length - 1].code,
        spread: sorted[0].compositeDiscount - sorted[sorted.length - 1].compositeDiscount,
        expectedReturn: (sorted[0].compositeDiscount - sorted[sorted.length - 1].compositeDiscount) * 0.5,
      });
    }
  }

  return { results, topPicks, industryStats, arbitrageOpportunities };
}
