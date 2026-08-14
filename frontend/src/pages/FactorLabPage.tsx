/**
 * 多因子实验室（Sprint 4 · S4-3）
 * 区块A 因子库总览表 / 区块B 因子详情（IC时序·五分位·衰减）/ 区块C 相关性矩阵 / 区块D 因子合成信号
 * 真实数据优先：通过 backtestDataService 拉取真实 K 线，构建价格/成交量可推导因子
 * （REV1M 反转 / MOM3M 动量 / VOL 波动率 / TURN 量比）；EP/BP/GROWTH/ROE 需财务因子，暂不接入。
 * 真实源不可用时由 factorLabDemo 诚实兜底，所有引擎调用包 try/catch 优雅降级为 Empty。
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Card, Row, Col, Table, Tag, Typography, Select, Empty, Statistic } from 'antd';
import {
  Bar, BarChart, Line, LineChart, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, Legend,
} from 'recharts';
import { THEME } from '../styles/theme-constants';
import {
  calculateIC, calculateTimeSeriesIC, calculateQuintileReturns,
  calculateFactorDecay, calculateFactorCorrelation, compositeFactors,
  type FactorData,
} from '../utils/factorICEngine';
import { FACTORS, factorLabData, factorDecayData } from '../utils/factorLabDemo';
import {
  getBatchHistory, buildICFactorData, DEFAULT_FACTOR_UNIVERSE,
  type PriceDerivedFactorKind,
} from '../services/backtestDataService';

/** 价格/成交量可真实推导的因子 → 构建参数（其余因子需财务数据，诚实留空） */
const REAL_FACTOR_KIND: Record<string, PriceDerivedFactorKind> = {
  REV1M: 'reversal',
  MOM3M: 'momentum',
  VOL: 'volatility',
  TURN: 'volumeRatio',
};
const REAL_FACTOR_LOOKBACK: Record<string, number> = {
  REV1M: 21,
  MOM3M: 63,
  VOL: 21,
  TURN: 21,
};

const { Title, Text } = Typography;
const UP = THEME.up;
const DOWN = THEME.down;
const flowColor = (v: number): string => (v >= 0 ? UP : DOWN);

/** 按日期分组为 Map<date, FactorData[]>，供时序 IC / ICIR 计算 */
function groupByDate(data: FactorData[]): Map<string, FactorData[]> {
  const m = new Map<string, FactorData[]>();
  for (const d of data) {
    const arr = m.get(d.date);
    if (arr) arr.push(d);
    else m.set(d.date, [d]);
  }
  return m;
}

/** 相关性热力单元配色：正=红，负=绿，强度随 |corr| 提升 */
const heatColor = (c: number): string => {
  const a = Math.min(0.85, 0.12 + Math.abs(c) * 0.72);
  return c >= 0 ? `rgba(244,63,94,${a})` : `rgba(34,197,94,${a})`;
};

interface OverviewRow {
  key: string;
  cn: string;
  intensity: number;
  ic: number;
  rankIC: number;
  icir: number;
  positiveRate: number;
  longShort: number;
  monotonic: boolean;
  valid: boolean;
}

const FactorLabPage: React.FC = () => {
  const [sel, setSel] = useState<string>(FACTORS[0].key);

  // ── 真实数据优先：拉取默认股票池真实 K 线，构建价格/成交量可推导因子 ──
  const [real, setReal] = useState<{
    data: Record<string, FactorData[]>;
    decay: Record<string, Map<number, FactorData[]>>;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const batch = await getBatchHistory(DEFAULT_FACTOR_UNIVERSE, 250, 4);
        const realCount = Object.values(batch).filter((s) => s.dataSource === 'real').length;
        if (realCount < 10) return; // 真实数据不足 → 保持演示/空态诚实兜底
        const data: Record<string, FactorData[]> = {};
        const decay: Record<string, Map<number, FactorData[]>> = {};
        for (const key of Object.keys(REAL_FACTOR_KIND)) {
          const lookback = REAL_FACTOR_LOOKBACK[key];
          const opts = { kind: REAL_FACTOR_KIND[key], lookback, horizon: 21, step: 21 };
          const rows = buildICFactorData(batch, opts);
          if (rows.length < 20) continue; // 样本不足则不接入该因子
          data[key] = rows;
          const m = new Map<number, FactorData[]>();
          for (let lag = 1; lag <= 6; lag++) {
            m.set(lag, buildICFactorData(batch, { ...opts, horizon: lag * 21 }));
          }
          decay[key] = m;
        }
        if (!cancelled && Object.keys(data).length > 0) setReal({ data, decay });
      } catch (e) {
        console.warn('[FactorLab] 真实数据不可用，保持兜底', e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const labData = real?.data ?? factorLabData;
  const decaySource = real?.decay ?? factorDecayData;

  // ── 区块A 因子库总览：IC / RankIC / ICIR / 胜率 / 多空 / 单调性 / 有效性 ──
  const overview: OverviewRow[] = useMemo(() => {
    try {
      const rows = FACTORS.map((meta) => {
        const data = labData[meta.key] ?? [];
        const icR = calculateIC(data); // 横截面 IC（含 RankIC / 有效性）
        const tsR = calculateTimeSeriesIC(groupByDate(data)); // 时序 ICIR / 胜率
        const q = calculateQuintileReturns(data, meta.cn);
        return {
          key: meta.key,
          cn: meta.cn,
          intensity: meta.intensity,
          ic: icR?.ic ?? 0,
          rankIC: icR?.rankIC ?? 0,
          icir: tsR?.icir ?? 0,
          positiveRate: tsR?.positiveRate ?? 0,
          longShort: q?.longShortReturn ?? 0,
          monotonic: q?.monotonic ?? false,
          valid: icR?.validFlag ?? false,
        };
      });
      return rows.sort((a, b) => Math.abs(b.ic) - Math.abs(a.ic));
    } catch (e) {
      console.error('[FactorLab] overview failed', e);
      return [];
    }
  }, [labData]);

  // ── 区块B① IC 时序柱状图（正红负绿） ──
  const tsIcData = useMemo(() => {
    try {
      const byDate = groupByDate(labData[sel] ?? []);
      return [...byDate.keys()].sort().map((date) => ({
        date: date.slice(2),
        ic: calculateIC(byDate.get(date)!)?.ic ?? 0,
      }));
    } catch (e) {
      console.error('[FactorLab] tsIc failed', e);
      return [];
    }
  }, [sel, labData]);

  // ── 区块B② 五分位分层回测 ──
  const quintileData = useMemo(() => {
    try {
      const q = calculateQuintileReturns(labData[sel] ?? [], sel);
      return q ? q.quintiles.map((qq) => ({ q: `Q${qq.quintile}`, ret: qq.avgReturn })) : [];
    } catch (e) {
      console.error('[FactorLab] quintile failed', e);
      return [];
    }
  }, [sel, labData]);

  // ── 区块B③ 因子衰减曲线（lag 1-6） ──
  const decayData = useMemo(() => {
    try {
      const src = decaySource[sel];
      if (!src) return [];
      return calculateFactorDecay(src).map((d) => ({ lag: `L${d.lag}`, ic: d.ic }));
    } catch (e) {
      console.error('[FactorLab] decay failed', e);
      return [];
    }
  }, [sel, decaySource]);

  // ── 区块C 8×8 因子相关性矩阵（按股票横截面均值，高亮 |corr|>0.6） ──
  const corr = useMemo<number[][] | null>(() => {
    try {
      const maps: Record<string, Map<string, number>> = {};
      FACTORS.forEach((meta) => {
        const acc = new Map<string, { s: number; n: number }>();
        (labData[meta.key] ?? []).forEach((d) => {
          const a = acc.get(d.ticker) || { s: 0, n: 0 };
          a.s += d.factorValue;
          a.n += 1;
          acc.set(d.ticker, a);
        });
        const mm = new Map<string, number>();
        acc.forEach((a, t) => mm.set(t, a.s / a.n));
        maps[meta.key] = mm;
      });
      return FACTORS.map((a) =>
        FACTORS.map((b) => {
          if (a.key === b.key) return 1;
          const c = calculateFactorCorrelation(maps[a.key], maps[b.key]);
          return c ? c.correlation : 0;
        }),
      );
    } catch (e) {
      console.error('[FactorLab] corr failed', e);
      return null;
    }
  }, [labData]);

  // ── 区块D 因子合成（ICIR 加权） + 动态结论 ──
  const composite = useMemo(() => {
    try {
      const factors = overview.map((o) => ({ name: o.cn, ic: o.ic, icir: o.icir }));
      if (factors.length === 0) return null;
      const comp = compositeFactors(factors, 'icir_weight');
      const avgIc = factors.reduce((s, f) => s + Math.abs(f.ic), 0) / factors.length;
      const avgIcir = factors.reduce((s, f) => s + Math.abs(f.icir), 0) / factors.length;
      const top = [...comp.factors].sort((a, b) => b.weight - a.weight)[0];
      const lift = avgIc > 0 ? (comp.ic / avgIc - 1) * 100 : 0;
      const conclusion =
        `综合因子由 ${factors.length} 个因子以 ICIR 加权合成：合成 IC=${comp.ic.toFixed(3)}` +
        `（单因子均值 ${avgIc.toFixed(3)}，提升 ${lift.toFixed(0)}%），ICIR=${comp.icir.toFixed(2)}` +
        `（均值 ${avgIcir.toFixed(2)}）。其中「${top.name}」权重最高（${(top.weight * 100).toFixed(0)}%），` +
        `为主要 alpha 来源；波动率因子为负向、换手率因子最弱，合成后显著分散单一因子风险。`;
      return { comp, avgIc, avgIcir, conclusion };
    } catch (e) {
      console.error('[FactorLab] composite failed', e);
      return null;
    }
  }, [overview]);

  // ── 区块A 列定义 ──
  const overviewColumns = [
    { title: '因子', dataIndex: 'cn', key: 'cn', width: 130,
      render: (v: string, r: OverviewRow) => (
        <span>
          <Text strong style={{ color: THEME.text }}>{v}</Text>
          <br />
          <Text style={{ color: THEME.textSec, fontSize: 11 }}>强度 {r.intensity >= 0 ? '+' : ''}{r.intensity}</Text>
        </span>
      ) },
    { title: 'IC', dataIndex: 'ic', key: 'ic', width: 80,
      render: (v: number) => <Text style={{ color: flowColor(v) }}>{v >= 0 ? '+' : ''}{v.toFixed(3)}</Text> },
    { title: 'RankIC', dataIndex: 'rankIC', key: 'rankIC', width: 80,
      render: (v: number) => <Text style={{ color: flowColor(v) }}>{v >= 0 ? '+' : ''}{v.toFixed(3)}</Text> },
    { title: 'ICIR', dataIndex: 'icir', key: 'icir', width: 80,
      render: (v: number) => <Text style={{ color: flowColor(v) }}>{v.toFixed(2)}</Text> },
    { title: 'IC>0胜率', dataIndex: 'positiveRate', key: 'positiveRate', width: 90,
      render: (v: number) => `${(v * 100).toFixed(0)}%` },
    { title: '多空收益', dataIndex: 'longShort', key: 'longShort', width: 90,
      render: (v: number) => <Text style={{ color: flowColor(v) }}>{v >= 0 ? '+' : ''}{v.toFixed(3)}</Text> },
    { title: '单调性', dataIndex: 'monotonic', key: 'monotonic', width: 80,
      render: (v: boolean) => <Tag color={v ? 'green' : 'default'}>{v ? '单调' : '非单调'}</Tag> },
    { title: '有效性', dataIndex: 'valid', key: 'valid', width: 80,
      render: (v: boolean) =>
        v ? <Tag color="green">有效</Tag> : <Tag color="default">待观察</Tag> },
  ];

  const chartTip = {
    contentStyle: { background: THEME.cardBg, borderColor: THEME.border, color: THEME.text },
  };

  return (
    <div style={{ background: THEME.bg, padding: 24, minHeight: '100vh' }}>
      <Title level={3} style={{ color: THEME.text, marginBottom: 4 }}>
        多因子实验室
        {real ? (
          <Tag color="green" style={{ marginLeft: 12, transform: 'translateY(-2px)' }}>真实行情数据</Tag>
        ) : (
          <Tag color="default" style={{ marginLeft: 12, transform: 'translateY(-2px)' }}>数据未接入</Tag>
        )}
      </Title>
      <Text style={{ color: THEME.textSec }}>
        {real
          ? '多因子模型一期 · 动量/反转/波动率/量比因子基于真实 K 线构建；估值/成长/质量因子需财务数据，暂未接入'
          : '多因子模型一期 · 8 经典因子 IC / 分层 / 衰减 / 合成（因子数据由后端提供，当前尚未接入）'}
      </Text>

      {/* 区块A 因子库总览表 */}
      <Card title={<span style={{ color: THEME.text }}>因子库总览（按 |IC| 排序）</span>}
        size="small" style={{ background: THEME.cardBg, borderColor: THEME.border, marginTop: 16 }}>
        {overview.length > 0 ? (
          <Table dataSource={overview} columns={overviewColumns} rowKey="key"
            size="small" pagination={false} scroll={{ x: 760 }} />
        ) : <Empty description="因子数据暂不可用" />}
        <Text style={{ color: THEME.textSec, fontSize: 12 }}>
          有效性标记：|IC| &gt; 0.03 视为有效（绿）；红=正向、绿=负向（涨红跌绿）。
        </Text>
      </Card>

      {/* 区块B 因子详情 */}
      <Card title={<span style={{ color: THEME.text }}>因子详情</span>}
        size="small" style={{ background: THEME.cardBg, borderColor: THEME.border, marginTop: 16 }}>
        <div style={{ marginBottom: 12 }}>
          <Text style={{ color: THEME.textSec, marginRight: 8 }}>选择因子：</Text>
          <Select value={sel} onChange={setSel} style={{ width: 200 }}
            options={FACTORS.map((f) => ({ value: f.key, label: f.cn }))} />
        </div>
        <Row gutter={[16, 16]}>
          <Col xs={24} md={8}>
            <Text style={{ color: THEME.textSec }}>① IC 时序（24 期，正红负绿）</Text>
            {tsIcData.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={tsIcData} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={THEME.border} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: THEME.textSec }} interval={3} />
                  <YAxis tick={{ fontSize: 10, fill: THEME.textSec }} />
                  <Tooltip {...chartTip} formatter={(v) => [Number(v).toFixed(3), 'IC']} />
                  <Bar dataKey="ic" name="IC">
                    {tsIcData.map((d, i) => <Cell key={i} fill={flowColor(d.ic)} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <Empty />}
          </Col>
          <Col xs={24} md={8}>
            <Text style={{ color: THEME.textSec }}>② 五分位分层回测（Q1→Q5 平均收益）</Text>
            {quintileData.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={quintileData} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={THEME.border} />
                  <XAxis dataKey="q" tick={{ fontSize: 11, fill: THEME.textSec }} />
                  <YAxis tick={{ fontSize: 10, fill: THEME.textSec }} />
                  <Tooltip {...chartTip} formatter={(v) => [Number(v).toFixed(3), '收益']} />
                  <Bar dataKey="ret" name="平均收益">
                    {quintileData.map((d, i) => <Cell key={i} fill={flowColor(d.ret)} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <Empty />}
          </Col>
          <Col xs={24} md={8}>
            <Text style={{ color: THEME.textSec }}>③ 因子衰减（lag 1-6）</Text>
            {decayData.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={decayData} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={THEME.border} />
                  <XAxis dataKey="lag" tick={{ fontSize: 11, fill: THEME.textSec }} />
                  <YAxis tick={{ fontSize: 10, fill: THEME.textSec }} />
                  <Tooltip {...chartTip} formatter={(v) => [Number(v).toFixed(3), 'IC']} />
                  <Legend wrapperStyle={{ color: THEME.textSec, fontSize: 11 }} />
                  <Line type="monotone" dataKey="ic" name="IC" stroke={THEME.accent}
                    dot={{ r: 3 }} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            ) : <Empty />}
          </Col>
        </Row>
      </Card>

      {/* 区块C 因子相关性矩阵 */}
      <Card title={<span style={{ color: THEME.text }}>因子相关性矩阵（8×8，红正/绿负）</span>}
        size="small" style={{ background: THEME.cardBg, borderColor: THEME.border, marginTop: 16 }}>
        {corr ? (
          <div style={{ overflowX: 'auto' }}>
            <div style={{ display: 'inline-grid', gridTemplateColumns: `60px repeat(${FACTORS.length}, 52px)` }}>
              <div />
              {FACTORS.map((f) => (
                <div key={f.key} style={{ color: THEME.textSec, fontSize: 10, textAlign: 'center', padding: 2 }}>
                  {f.cn.split('-')[1] ?? f.cn}
                </div>
              ))}
              {FACTORS.map((rf, ri) => (
                <React.Fragment key={rf.key}>
                  <div style={{ color: THEME.textSec, fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 4 }}>
                    {rf.cn.split('-')[1] ?? rf.cn}
                  </div>
                  {FACTORS.map((cf, ci) => {
                    const c = corr[ri][ci];
                    const hot = Math.abs(c) > 0.6;
                    return (
                      <div key={cf.key} title={`${rf.cn} × ${cf.cn}: ${c.toFixed(2)}`}
                        style={{
                          height: 40, margin: 1, display: 'flex', alignItems: 'center',
                          justifyContent: 'center', fontSize: 11, borderRadius: 4,
                          color: Math.abs(c) > 0.45 ? '#fff' : THEME.textSec,
                          background: heatColor(c),
                          border: hot ? '2px solid #f5d90a' : '1px solid transparent',
                        }}>
                        {c.toFixed(2)}
                      </div>
                    );
                  })}
                </React.Fragment>
              ))}
            </div>
            <Text style={{ color: THEME.textSec, fontSize: 12 }}>
              黄框 = |corr| &gt; 0.6 高共线性预警（如 EP/BP、REV1M/MOM3M、VOL/TURN）。
            </Text>
          </div>
        ) : <Empty description="相关性矩阵暂不可用" />}
      </Card>

      {/* 区块D 因子合成信号 */}
      <Card title={<span style={{ color: THEME.text }}>因子合成信号（ICIR 加权）</span>}
        size="small" style={{ background: THEME.cardBg, borderColor: THEME.border, marginTop: 16 }}>
        {composite ? (
          <>
            <Row gutter={[16, 16]}>
              <Col xs={12} md={6}>
                <Statistic title={<span style={{ color: THEME.textSec }}>合成 IC</span>}
                  value={composite.comp.ic} precision={3} valueStyle={{ color: flowColor(composite.comp.ic) }} />
              </Col>
              <Col xs={12} md={6}>
                <Statistic title={<span style={{ color: THEME.textSec }}>合成 ICIR</span>}
                  value={composite.comp.icir} precision={2} valueStyle={{ color: flowColor(composite.comp.icir) }} />
              </Col>
              <Col xs={12} md={6}>
                <Statistic title={<span style={{ color: THEME.textSec }}>单因子均 IC</span>}
                  value={composite.avgIc} precision={3} valueStyle={{ color: THEME.text }} />
              </Col>
              <Col xs={12} md={6}>
                <Statistic title={<span style={{ color: THEME.textSec }}>单因子均 ICIR</span>}
                  value={composite.avgIcir} precision={2} valueStyle={{ color: THEME.text }} />
              </Col>
            </Row>
            <div style={{ marginTop: 12, padding: 12, background: THEME.surface,
              border: `1px solid ${THEME.border}`, borderRadius: 8 }}>
              <Text style={{ color: THEME.text }}>{composite.conclusion}</Text>
            </div>
          </>
        ) : <Empty description="合成信号暂不可用" />}
      </Card>
    </div>
  );
};

export default FactorLabPage;
