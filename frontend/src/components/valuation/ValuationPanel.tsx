/**
 * 估值分析面板 (Ticket S2-1)
 * 复用引擎：valuationModelEngine.multiDimensionalValuation / valuationModel.dcfValuation
 *          / sectorValuationEngine.valuationPercentileAnalysis
 * 数据来源：后端估值 API 缺失（T6 技术债），沿用项目 LCG 确定性演示数据兜底，
 *          seed = 20240724 + symbol哈希，保证同一股票每次渲染结果一致。
 */

import React, { useMemo } from 'react';
import { Card, Row, Col, Tag, Typography, Tooltip, Space } from 'antd';
import {
  FundOutlined, ArrowDownOutlined, ArrowUpOutlined, StarFilled,
} from '@ant-design/icons';
import { THEME } from '../../styles/theme-constants';
import { multiDimensionalValuation } from '../../utils/valuationModelEngine';
import { dcfValuation } from '../../utils/valuationModel';
import { valuationPercentileAnalysis } from '../../utils/sectorValuationEngine';

const { Text } = Typography;

const COLOR_UP = THEME.up;     // 涨 = 红
const COLOR_DOWN = THEME.down; // 跌 = 绿
const COLOR_FLAT = THEME.flat;
const BORDER = THEME.border;
const TEXT_PRIMARY = THEME.text;
const TEXT_SECONDARY = THEME.textSec;
const ACCENT = '#2962FF'; // 金融蓝主色

/** 固定种子线性同余伪随机，保证确定性 */
function makeRng(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** symbol 字符串哈希 */
function hashSymbol(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** 生成以 center 为分位 pct(0-100) 的确定性历史序列（升序） */
function buildHistory(center: number, pct: number, n: number, rng: () => number): number[] {
  const below = Math.max(0, Math.min(n - 1, Math.floor((pct / 100) * n)));
  const above = n - below;
  const arr: number[] = [];
  for (let i = 0; i < below; i++) arr.push(center * (0.55 + rng() * 0.4));
  arr.push(center);
  for (let i = 0; i < above; i++) arr.push(center * (1.05 + rng() * 0.6));
  return arr.sort((a, b) => a - b);
}

interface MetricCardData {
  label: string;
  value: string;
  industryText: string;
  industryGood: boolean; // true=该指标优于行业（绿）
}

interface ValuationVM {
  metrics: MetricCardData[];
  pePercentile: number;
  pbPercentile: number;
  compositePercentile: number;
  valuationLevel: string;
  levelLabel: string;
  dcfLow: number;
  dcfMid: number;
  dcfHigh: number;
  currentPrice: number;
  premiumPct: number; // 现价 vs DCF中性价：正=溢价 红，负=折价 绿
  score: number;
  stars: number;
  conclusion: string;
}

const VERDICT_MAP: Record<string, { label: string; cheap: boolean }> = {
  deep_undervalue: { label: '显著低估', cheap: true },
  undervalue: { label: '低估', cheap: true },
  fair: { label: '估值合理', cheap: false },
  overvalue: { label: '偏高估', cheap: false },
  deep_overvalue: { label: '显著高估', cheap: false },
};

const LEVEL_MAP: Record<string, { label: string; cheap: boolean }> = {
  extreme_low: { label: '极度低估', cheap: true },
  low: { label: '偏低', cheap: true },
  fair: { label: '合理', cheap: false },
  high: { label: '偏高', cheap: false },
  extreme_high: { label: '极度高估', cheap: false },
};

function fmtCap(num: number): string {
  if (Math.abs(num) >= 1e12) return `${(num / 1e12).toFixed(2)}万亿`;
  if (Math.abs(num) >= 1e8) return `${(num / 1e8).toFixed(2)}亿`;
  if (Math.abs(num) >= 1e4) return `${(num / 1e4).toFixed(2)}万`;
  return num.toFixed(2);
}

const ValuationPanel: React.FC<{ symbol: string }> = ({ symbol }) => {
  const vm = useMemo<ValuationVM>(() => {
    const rng = makeRng(20240724 + hashSymbol(symbol || 'UNKNOWN'));

    // ===== 基础确定性数据 =====
    const currentPrice = +(5 + rng() * 295).toFixed(2);            // 5 ~ 300
    const peTTM = +(8 + rng() * 40).toFixed(2);                    // 8 ~ 48
    const pb = +(0.6 + rng() * 8).toFixed(2);                      // 0.6 ~ 8.6
    const dividendYield = +(0.3 + rng() * 4.0).toFixed(2);         // 0.3% ~ 4.3%
    const marketCap = +((50 + rng() * 8950) * 1e8).toFixed(0);     // 50亿 ~ 9000亿
    const growthRate = +(0.03 + rng() * 0.05).toFixed(4);          // 3% ~ 8%
    const eps = +(currentPrice / peTTM).toFixed(4);
    const bookValue = +(currentPrice / pb).toFixed(4);
    const sharesOutstanding = +(marketCap / currentPrice).toFixed(0);
    const netIncome = +(eps * sharesOutstanding).toFixed(0);
    const revenue = +(netIncome / (0.05 + rng() * 0.25)).toFixed(0);
    const industryPE = +(peTTM * (0.7 + rng() * 0.6)).toFixed(2);
    const industryPB = +(pb * (0.7 + rng() * 0.6)).toFixed(2);
    const peg = +(peTTM / (growthRate * 100)).toFixed(2);

    // ===== 历史分位序列（近5年，约60个月） =====
    const pePct = +(10 + rng() * 80).toFixed(1);  // 该股票处于自身历史 PE 的百分位
    const pbPct = +(10 + rng() * 80).toFixed(1);
    const historicalPE = buildHistory(peTTM, pePct, 60, rng);
    const historicalPB = buildHistory(pb, pbPct, 60, rng);

    // ===== 复用引擎1：多维相对估值 =====
    const mm = multiDimensionalValuation({
      symbol: symbol || '',
      name: symbol || '',
      currentPrice,
      eps,
      bookValue,
      revenue,
      sharesOutstanding,
      netIncome,
      growthRate,
      industryPE,
      industryPB,
      historicalPE,
      historicalPB,
    });
    const verdictInfo = VERDICT_MAP[mm.verdict] || { label: '估值合理', cheap: false };

    // ===== 复用引擎2：DCF 估值（确定性强相关参数） =====
    const freeCashFlow = +(netIncome * (0.6 + rng() * 0.5)).toFixed(0);
    const discountRate = +(0.085 + rng() * 0.035).toFixed(4);
    const terminalGrowthRate = +(0.02 + rng() * 0.01).toFixed(4);
    const netDebt = +(marketCap * (rng() * 0.4 - 0.15)).toFixed(0);
    const dcf = dcfValuation({
      freeCashFlow,
      growthRate,
      terminalGrowthRate,
      discountRate,
      projectionYears: 10,
      shares: sharesOutstanding,
      netDebt,
    });
    const dcfMid = dcf.intrinsicValue > 0 ? dcf.intrinsicValue : currentPrice;
    const dcfLow = dcf.fairValueRange.low > 0 ? dcf.fairValueRange.low : dcfMid * 0.7;
    const dcfHigh = dcf.fairValueRange.high > 0 ? dcf.fairValueRange.high : dcfMid * 1.3;
    const premiumPct = +(((currentPrice - dcfMid) / dcfMid) * 100).toFixed(1);

    // ===== 复用引擎3：板块/历史分位分析 =====
    const sector = valuationPercentileAnalysis({
      name: symbol || '',
      currentPE: peTTM,
      currentPB: pb,
      currentDividendYield: dividendYield,
      historicalPE,
      historicalPB,
    });
    const levelInfo = LEVEL_MAP[sector.valuationLevel] || { label: '合理', cheap: false };

    // ===== 行业分位（派生，保证与估值故事一致） =====
    const peRankPct = Math.round(clamp(100 - pePct + (rng() - 0.5) * 20, 2, 98));
    const pbRankPct = Math.round(clamp(100 - pbPct + (rng() - 0.5) * 20, 2, 98));
    const pegRankPct = Math.round(clamp(peRankPct * 0.7 + (rng() - 0.5) * 15, 2, 98));
    const divRankPct = Math.round(clamp(30 + rng() * 65, 2, 98)); // 股息率越高越好
    const capRankPct = Math.round(clamp(20 + rng() * 75, 2, 98)); // 市值规模越大排名越高

    const metrics: MetricCardData[] = [
      { label: 'PE(TTM)', value: peTTM.toFixed(2), industryText: `低于行业 ${peRankPct}% 个股`, industryGood: true },
      { label: 'PB', value: pb.toFixed(2), industryText: `低于行业 ${pbRankPct}% 个股`, industryGood: true },
      { label: 'PEG', value: peg.toFixed(2), industryText: `低于行业 ${pegRankPct}% 个股`, industryGood: true },
      { label: '股息率', value: `${dividendYield.toFixed(2)}%`, industryText: `高于行业 ${divRankPct}% 个股`, industryGood: true },
      { label: '市值', value: fmtCap(marketCap), industryText: `高于行业 ${capRankPct}% 个股`, industryGood: true },
    ];

    // ===== 综合评分（0-100）与星级 =====
    const percentileScore = clamp(100 - sector.compositePercentile, 0, 100); // 越便宜越高
    const dcfScore = clamp(50 + (dcfMid - currentPrice) / currentPrice * 100, 0, 100);
    const mmScore = clamp(50 + mm.marginOfSafety * 100, 0, 100);
    const score = Math.round(percentileScore * 0.4 + dcfScore * 0.35 + mmScore * 0.25);
    const stars = clamp(Math.round(score / 20), 1, 5);

    const direction = premiumPct >= 0 ? '溢价' : '折价';
    const conclusion =
      `当前 PE/PB 处近5年 ${sector.pePercentile.toFixed(0)}%/${sector.pbPercentile.toFixed(0)}% 分位，` +
      `DCF 中性合理价 ¥${dcfMid.toFixed(2)}，现价较之${direction} ${Math.abs(premiumPct).toFixed(1)}%，` +
      `综合判定【${verdictInfo.label}】。`;

    return {
      metrics,
      pePercentile: sector.pePercentile,
      pbPercentile: sector.pbPercentile,
      compositePercentile: sector.compositePercentile,
      valuationLevel: sector.valuationLevel,
      levelLabel: levelInfo.label,
      dcfLow, dcfMid, dcfHigh,
      currentPrice,
      premiumPct,
      score, stars, conclusion,
    };
  }, [symbol]);

  // 估值档位配色：低估=绿(价低于合理)，高估=红(价高于合理)，合理=琥珀。遵循涨红跌绿(相对合理价)
  const bandColor = (cheap: boolean | null) =>
    cheap === null ? '#f59e0b' : cheap ? COLOR_DOWN : COLOR_UP;

  const renderStars = () =>
    Array.from({ length: 5 }, (_, i) => (
      <StarFilled key={i} style={{ color: i < vm.stars ? ACCENT : 'rgba(148,163,184,0.35)', fontSize: 14 }} />
    ));

  const PercentileBar = ({ percentile, color }: { percentile: number; color: string }) => (
    <div style={{ position: 'relative', height: 10, background: 'rgba(148,163,184,0.2)', borderRadius: 5, marginTop: 6, marginBottom: 20 }}>
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${percentile}%`, background: 'linear-gradient(90deg, #22c55e, #f59e0b 60%, #ef4444)', borderRadius: 5 }} />
      <div style={{ position: 'absolute', top: -3, bottom: -3, left: `${percentile}%`, width: 2, background: '#fff', transform: 'translateX(-1px)' }} />
      <div style={{ position: 'absolute', top: 14, left: `${percentile}%`, transform: 'translateX(-50%)', fontSize: 10, color, whiteSpace: 'nowrap' }}>
        {percentile.toFixed(0)}%
      </div>
    </div>
  );

  const bandOf = (p: number) => (p < 30 ? '低估' : p <= 70 ? '合理' : '高估');

  return (
    <Card
      size="small"
      title={
        <Space>
          <FundOutlined style={{ color: ACCENT }} />
          <span style={{ fontWeight: 700, color: TEXT_PRIMARY, fontSize: 14 }}>估值分析</span>
          <Tag color="default" style={{ fontSize: 10, borderRadius: 4, borderColor: BORDER, color: TEXT_SECONDARY }}>演示数据</Tag>
        </Space>
      }
      style={{ marginBottom: 12, borderRadius: 8, border: `1px solid ${BORDER}` }}
    >
      {/* ===== 估值指标卡片 ===== */}
      <Row gutter={[8, 8]}>
        {vm.metrics.map((m) => (
          <Col xs={12} sm={8} md={4} key={m.label}>
            <div style={{ background: 'rgba(15,23,42,0.5)', borderRadius: 8, padding: '10px 12px', height: '100%' }}>
              <div style={{ fontSize: 11, color: TEXT_SECONDARY, marginBottom: 4 }}>{m.label}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: TEXT_PRIMARY, fontFamily: '\'DIN Alternate\', monospace' }}>
                {m.value}
              </div>
              <Tooltip title="相对行业个股的估值分位（演示）">
                <div style={{ fontSize: 10, color: COLOR_DOWN, marginTop: 2 }}>{m.industryText}</div>
              </Tooltip>
            </div>
          </Col>
        ))}
      </Row>

      <div style={{ height: 1, background: BORDER, margin: '12px 0' }} />

      {/* ===== PE/PB 历史分位条 + 判定 ===== */}
      <Row gutter={[16, 4]}>
        <Col xs={24} md={12}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Text style={{ fontSize: 12, color: TEXT_SECONDARY }}>PE(TTM) 近5年分位</Text>
            <Tag style={{ fontSize: 11, borderRadius: 4, color: bandColor(bandOf(vm.pePercentile) === '低估' ? true : bandOf(vm.pePercentile) === '高估' ? false : null), borderColor: 'transparent', background: 'rgba(255,255,255,0.04)' }}>
              {bandOf(vm.pePercentile)}
            </Tag>
          </div>
          <PercentileBar percentile={vm.pePercentile} color={bandColor(bandOf(vm.pePercentile) === '低估' ? true : bandOf(vm.pePercentile) === '高估' ? false : null)} />
        </Col>
        <Col xs={24} md={12}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Text style={{ fontSize: 12, color: TEXT_SECONDARY }}>PB 近5年分位</Text>
            <Tag style={{ fontSize: 11, borderRadius: 4, color: bandColor(bandOf(vm.pbPercentile) === '低估' ? true : bandOf(vm.pbPercentile) === '高估' ? false : null), borderColor: 'transparent', background: 'rgba(255,255,255,0.04)' }}>
              {bandOf(vm.pbPercentile)}
            </Tag>
          </div>
          <PercentileBar percentile={vm.pbPercentile} color={bandColor(bandOf(vm.pbPercentile) === '低估' ? true : bandOf(vm.pbPercentile) === '高估' ? false : null)} />
        </Col>
      </Row>

      <div style={{ height: 1, background: BORDER, margin: '4px 0 12px' }} />

      {/* ===== DCF 估值区 ===== */}
      <div style={{ fontSize: 12, fontWeight: 600, color: TEXT_PRIMARY, marginBottom: 8 }}>DCF 估值区间</div>
      <Row gutter={[8, 8]} align="middle">
        {([
          { k: '悲观', v: vm.dcfLow, c: COLOR_DOWN },
          { k: '中性', v: vm.dcfMid, c: ACCENT },
          { k: '乐观', v: vm.dcfHigh, c: COLOR_UP },
        ] as const).map((t) => (
          <Col xs={8} key={t.k}>
            <div style={{ background: 'rgba(15,23,42,0.5)', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: TEXT_SECONDARY }}>{t.k}</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: t.c, fontFamily: '\'DIN Alternate\', monospace' }}>¥{t.v.toFixed(2)}</div>
            </div>
          </Col>
        ))}
        <Col xs={24}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
            <Text style={{ fontSize: 12, color: TEXT_SECONDARY }}>现价 ¥{vm.currentPrice.toFixed(2)}</Text>
            <Tag
              icon={vm.premiumPct >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
              style={{ fontSize: 12, borderRadius: 4, color: vm.premiumPct >= 0 ? COLOR_UP : COLOR_DOWN, borderColor: 'transparent', background: 'rgba(255,255,255,0.04)', fontWeight: 700 }}
            >
              较合理价{vm.premiumPct >= 0 ? '溢价' : '折价'} {Math.abs(vm.premiumPct).toFixed(1)}%
            </Tag>
          </div>
        </Col>
      </Row>

      <div style={{ height: 1, background: BORDER, margin: '12px 0' }} />

      {/* ===== 综合估值结论 ===== */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, color: TEXT_SECONDARY }}>综合评分</span>
          <span style={{ fontSize: 24, fontWeight: 800, color: bandColor(vm.valuationLevel === 'extreme_low' || vm.valuationLevel === 'low' || vm.valuationLevel === 'fair' ? (vm.valuationLevel === 'fair' ? null : true) : false), fontFamily: '\'DIN Alternate\', monospace' }}>
            {vm.score}
          </span>
          <span style={{ fontSize: 11, color: TEXT_SECONDARY }}>分</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, color: TEXT_SECONDARY }}>估值星级</span>
          <Space size={1}>{renderStars()}</Space>
        </div>
        <Tag style={{ fontSize: 12, borderRadius: 4, color: bandColor(vm.valuationLevel === 'extreme_low' || vm.valuationLevel === 'low' ? true : vm.valuationLevel === 'high' || vm.valuationLevel === 'extreme_high' ? false : null), borderColor: 'transparent', background: 'rgba(255,255,255,0.04)', fontWeight: 700 }}>
          {vm.levelLabel}
        </Tag>
      </div>
      <div style={{ marginTop: 8, fontSize: 13, color: TEXT_PRIMARY, lineHeight: 1.8, background: 'rgba(41,98,255,0.08)', padding: '10px 14px', borderRadius: 6, border: '1px solid rgba(41,98,255,0.25)' }}>
        {vm.conclusion}
      </div>
    </Card>
  );
};

export default ValuationPanel;
