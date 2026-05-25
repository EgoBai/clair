/**
 * 股票详情页 v2 — 芝士财富/富途风格
 * 纯白卡片 + 红涨绿跌(A股惯例) + 清晰K线 + 高对比度
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Typography, Breadcrumb, Card, Row, Col, Space, Tag,
  Spin, Button, Segmented, Empty, message, Divider, Tooltip,
} from 'antd';
import {
  HomeOutlined, StockOutlined, CompassOutlined,
  ReloadOutlined, StarOutlined, StarFilled, LineChartOutlined,
  RiseOutlined, FallOutlined,
  FundProjectionScreenOutlined,
} from '@ant-design/icons';
import KLineChart, { KLineData } from '../components/Charts/KLineChart';
import { useStockActions, useWatchlist } from '../store/useStockStore';
import { analyze, StrategyResult } from '../utils/strategy';

const { Title, Text } = Typography;

// 芝士财富配色方案: 白底 + 红涨绿跌
const COLOR_UP = '#cf2a2a';      // 大红
const COLOR_DOWN = '#1db468';    // 深绿
const COLOR_FLAT = '#666666';
const BG_CARD = '#ffffff';
const BG_PAGE = '#f5f6f8';
const TEXT_PRIMARY = '#1a1a1a';
const TEXT_SECONDARY = '#8c8c8c';
const BORDER = '#e8e8e8';

interface StockInfo {
  symbol: string;
  name: string;
  fullName?: string;
  market: string;
  industry?: string;
}

interface QuoteData {
  closePrice: number;
  openPrice: number;
  highPrice: number;
  lowPrice: number;
  change: number;
  changePercent: number;
  volume: number;
  turnover: number;
  turnoverRate: number;
  peRatio: number;
  pbRatio: number;
  marketCap: number;
  circulatingMarketCap: number;
  amplitude: number;
}

const StockDetailPage: React.FC = () => {
  const { symbol } = useParams<{ symbol: string }>();
  const navigate = useNavigate();
  const watchlist = useWatchlist();
  const { toggleWatchlist } = useStockActions();

  const [stockInfo, setStockInfo] = useState<StockInfo | null>(null);
  const [latestQuote, setLatestQuote] = useState<QuoteData | null>(null);
  const [klineData, setKlineData] = useState<KLineData[]>([]);
  const [loading, setLoading] = useState(true);
  const [klineLoading, setKlineLoading] = useState(true);
  const [klinePeriod, setKlinePeriod] = useState<string>('daily');
  const [subIndicator, setSubIndicator] = useState<'volume'|'macd'|'rsi'>('volume');
  const [aiStrategy, setAiStrategy] = useState<any>(null);

  const changeColor = useMemo(() => {
    if (!latestQuote) return COLOR_FLAT;
    return latestQuote.changePercent >= 0 ? COLOR_UP : COLOR_DOWN;
  }, [latestQuote]);

  const isInWatchlist = symbol ? watchlist.includes(symbol) : false;

  const formatLargeNumber = (num?: number) => {
    if (!num && num !== 0) return '-';
    if (Math.abs(num) >= 1e12) return `${(num / 1e12).toFixed(2)}万亿`;
    if (Math.abs(num) >= 1e8) return `${(num / 1e8).toFixed(2)}亿`;
    if (Math.abs(num) >= 1e4) return `${(num / 1e4).toFixed(2)}万`;
    return num.toFixed(2);
  };

  const formatVolume = (vol?: number) => {
    if (!vol && vol !== 0) return '-';
    if (vol >= 1e8) return `${(vol / 1e8).toFixed(2)}亿`;
    if (vol >= 1e4) return `${(vol / 1e4).toFixed(2)}万`;
    return `${vol}`;
  };

  const formatTurnover = (val?: number) => {
    if (!val && val !== 0) return '-';
    if (val >= 1e8) return `${(val / 1e8).toFixed(2)}亿`;
    if (val >= 1e4) return `${(val / 1e4).toFixed(2)}万`;
    return val.toFixed(2);
  };

  const fetchStockData = useCallback(async () => {
    if (!symbol) return;
    setLoading(true);
    try {
      // 去后缀，纯代码查询
      const pureSymbol = symbol.replace(/\.(SH|SZ)$/, '');
      const resp = await fetch(`/api/stocks/${pureSymbol}`);
      const data = await resp.json();
      
      if (data.success && data.data) {
        const d = data.data;
        setStockInfo({
          symbol: d.symbol || symbol,
          name: d.name || symbol,
          fullName: d.fullName,
          market: d.market || '',
          industry: d.industry || '',
        });
        if (d.quote && d.quote.closePrice > 0) {
          setLatestQuote(d.quote);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  const fetchKlineData = useCallback(async () => {
    if (!symbol) return;
    setKlineLoading(true);
    try {
      const pureSymbol = symbol.replace(/\.(SH|SZ)$/, '');
      const [kResp, sResp] = await Promise.all([
        fetch(`/api/stocks/${pureSymbol}/kline`).then(r => r.json()),
        fetch(`/api/stocks/${pureSymbol}/strategy`).then(r => r.json()).catch(() => null),
      ]);
      // K-line data
      if (kResp.success && kResp.data?.quotes?.length > 0) {
        const kData: KLineData[] = kResp.data.quotes
          .map((q: any) => ({
            tradeDate: q.tradeDate,
            open: q.openPrice || 0,
            close: q.closePrice || 0,
            high: q.highPrice || 0,
            low: q.lowPrice || 0,
            volume: q.volume || 0,
            turnover: q.turnover || 0,
          }));
        setKlineData(kData);
      }
      // Strategy data from Worker
      if (sResp?.success && sResp.data) setAiStrategy(sResp.data);
    } catch (e) {
      console.error('获取K线数据失败:', e);
    } finally {
      setKlineLoading(false);
    }
  }, [symbol, klinePeriod]);

  useEffect(() => { fetchStockData(); }, [fetchStockData]);
  useEffect(() => { fetchKlineData(); }, [fetchKlineData]);

  const displaySymbol = symbol?.replace(/\.(SH|SZ)$/, '') || symbol || '';
  const marketLabel = stockInfo?.market === 'SH' ? '沪' : stockInfo?.market === 'SZ' ? '深' : stockInfo?.market === 'INDEX' ? '指' : '';

  if (!symbol) {
    return <div style={{ padding: 24, textAlign: 'center' }}><Empty description="未指定股票代码" /></div>;
  }

  const StatItem = ({ label, value, color }: { label: string; value: string; color?: string }) => (
    <div style={{ textAlign: 'center', padding: '8px 4px' }}>
      <div style={{ fontSize: 12, color: TEXT_SECONDARY, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: color || TEXT_PRIMARY, fontFamily: '\'DIN Alternate\', monospace' }}>
        {value}
      </div>
    </div>
  );

  return (
    <div style={{ padding: '16px 24px', maxWidth: 1400, margin: '0 auto', background: BG_PAGE, minHeight: '100vh' }}>
      <Breadcrumb
        style={{ marginBottom: 12 }}
        items={[
          { href: '/discover', title: <><CompassOutlined /> 发掘</> },
          { href: '/stocks', title: <><StockOutlined /> 股票</> },
          { title: stockInfo?.name || displaySymbol },
        ]}
      />

      <Spin spinning={loading}>
        {/* ===== 顶部: 股票名称 + 实时价格 ===== */}
        <Card
          style={{ marginBottom: 12, borderRadius: 8, border: `1px solid ${BORDER}` }}
          styles={{ body: { padding: '16px 24px' } }}
        >
          <Row align="middle" gutter={24}>
            <Col xs={24} md={7}>
              <Space direction="vertical" size={2}>
                <Space align="center" size={8}>
                  <Title level={4} style={{ margin: 0, color: TEXT_PRIMARY }}>
                    {stockInfo?.name || displaySymbol}
                  </Title>
                  <Tag style={{ fontSize: 12, borderRadius: 4 }}>{displaySymbol}</Tag>
                  {marketLabel && (
                    <Tag color={marketLabel === '沪' ? 'red' : marketLabel === '深' ? 'green' : 'blue'} style={{ borderRadius: 4 }}>
                      {marketLabel === '沪' ? '沪市' : marketLabel === '深' ? '深市' : '指数'}
                    </Tag>
                  )}
                  <Tooltip title={isInWatchlist ? '取消自选' : '加入自选'}>
                    <Button type="text" size="small"
                      icon={isInWatchlist ? <StarFilled style={{ color: '#f59e0b' }} /> : <StarOutlined />}
                      onClick={() => symbol && toggleWatchlist(symbol)} />
                  </Tooltip>
                </Space>
                {stockInfo?.industry && (
                  <Text style={{ fontSize: 12, color: TEXT_SECONDARY }}>{stockInfo.industry}</Text>
                )}
              </Space>
            </Col>

            <Col xs={24} md={11}>
              {latestQuote ? (
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 38, fontWeight: 800, color: changeColor, lineHeight: 1, fontFamily: '\'DIN Alternate\', monospace' }}>
                    {latestQuote.closePrice.toFixed(2)}
                  </span>
                  <Space size={8}>
                    <span style={{ fontSize: 18, fontWeight: 700, color: changeColor, fontFamily: '\'DIN Alternate\', monospace' }}>
                      {latestQuote.change >= 0 ? '+' : ''}{latestQuote.change.toFixed(2)}
                    </span>
                    <Tag color={latestQuote.changePercent >= 0 ? 'red' : 'green'}
                      style={{ fontSize: 15, padding: '2px 10px', fontWeight: 700, borderRadius: 4 }}>
                      {latestQuote.changePercent >= 0 ? '+' : ''}{latestQuote.changePercent.toFixed(2)}%
                    </Tag>
                  </Space>
                </div>
              ) : (
                <Text style={{ color: TEXT_SECONDARY }}>暂无行情数据</Text>
              )}
            </Col>

            <Col xs={24} md={6} style={{ textAlign: 'right' }}>
              <Space>
                <Button icon={<ReloadOutlined />} onClick={() => { fetchStockData(); fetchKlineData(); }}>刷新</Button>
                <Button icon={<FundProjectionScreenOutlined />} onClick={() => navigate(`/backtest?symbol=${displaySymbol}`)}>回测</Button>
                <Button icon={<LineChartOutlined />} onClick={() => navigate('/stocks')}>返回列表</Button>
              </Space>
            </Col>
          </Row>
        </Card>

        {/* ===== 关键指标 ===== */}
        {latestQuote && (
          <Card
            size="small"
            title={<span style={{ fontWeight: 700, color: TEXT_PRIMARY, fontSize: 14 }}>关键指标</span>}
            style={{ marginBottom: 12, borderRadius: 8, border: `1px solid ${BORDER}` }}
          >
            <Row gutter={[0, 8]}>
              <Col xs={12} sm={8} md={4}><StatItem label="现价" value={latestQuote.closePrice.toFixed(2)} color={changeColor} /></Col>
              <Col xs={12} sm={8} md={4}><StatItem label="今开" value={latestQuote.openPrice.toFixed(2)} /></Col>
              <Col xs={12} sm={8} md={4}><StatItem label="最高" value={latestQuote.highPrice.toFixed(2)} color={COLOR_UP} /></Col>
              <Col xs={12} sm={8} md={4}><StatItem label="最低" value={latestQuote.lowPrice.toFixed(2)} color={COLOR_DOWN} /></Col>
              <Col xs={12} sm={8} md={4}><StatItem label="成交量" value={formatVolume(latestQuote.volume)} /></Col>
              <Col xs={12} sm={8} md={4}><StatItem label="成交额" value={formatTurnover(latestQuote.turnover)} /></Col>
            </Row>
            <Divider style={{ margin: '8px 0', borderColor: BORDER }} />
            <Row gutter={[0, 8]}>
              <Col xs={12} sm={8} md={4}><StatItem label="涨跌幅" value={`${latestQuote.changePercent >= 0 ? '+' : ''}${latestQuote.changePercent.toFixed(2)}%`} color={changeColor} /></Col>
              <Col xs={12} sm={8} md={4}><StatItem label="振幅" value={`${(latestQuote.amplitude || 0).toFixed(2)}%`} /></Col>
              <Col xs={12} sm={8} md={4}><StatItem label="PE(动)" value={latestQuote.peRatio?.toFixed(2) || '-'} /></Col>
              <Col xs={12} sm={8} md={4}><StatItem label="PB" value={latestQuote.pbRatio?.toFixed(2) || '-'} /></Col>
              <Col xs={12} sm={8} md={4}><StatItem label="换手率" value={`${(latestQuote.turnoverRate || 0).toFixed(2)}%`} /></Col>
              <Col xs={12} sm={8} md={4}><StatItem label="总市值" value={formatLargeNumber(latestQuote.marketCap)} /></Col>
            </Row>
          </Card>
        )}

        {/* ===== K线图 ===== */}
        <Card
          size="small"
          title={
            <Space>
              <span style={{ fontWeight: 700, color: TEXT_PRIMARY, fontSize: 14 }}>K线图</span>
              <Segmented
                options={[
                  { label: '日K', value: 'daily' },
                  { label: '周K', value: 'weekly' },
                  { label: '月K', value: 'monthly' },
                ]}
                value={klinePeriod}
                onChange={(val) => setKlinePeriod(val as string)}
                size="small"
              />
            </Space>
          }
          style={{ marginBottom: 12, borderRadius: 8, border: `1px solid ${BORDER}` }}
        >
          {klineData.length > 0 ? (
            <>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8, justifyContent: 'flex-end' }}>
                {(['volume','macd','rsi'] as const).map(ind => (
                  <Button key={ind} size="small" type={subIndicator === ind ? 'primary' : 'default'}
                    onClick={() => setSubIndicator(ind)}
                    style={{ fontSize: 11, padding: '0 8px' }}>
                    {ind === 'volume' ? '成交量' : ind.toUpperCase()}
                  </Button>
                ))}
              </div>
              <KLineChart
                data={klineData}
                title={`${stockInfo?.name || symbol} - ${klinePeriod === 'daily' ? '日K' : klinePeriod === 'weekly' ? '周K' : '月K'}`}
                height={520}
                loading={klineLoading}
                showMA={true}
                maLines={[5, 10, 20, 60]}
                subIndicator={subIndicator}
              />
            </>
          ) : (
            <div style={{ height: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {klineLoading ? <Spin tip="加载K线数据..." /> : <Empty description="暂无K线数据" />}
            </div>
          )}
        </Card>

        {/* ===== AI策略建议 (Worker端) ===== */}
        {aiStrategy && aiStrategy.score !== undefined && (
          <Card
            size="small"
            title={<span style={{ fontWeight: 700, color: TEXT_PRIMARY, fontSize: 14 }}>🤖 AI策略建议</span>}
            style={{ marginBottom: 12, borderRadius: 8, border: `1px solid ${BORDER}` }}
          >
            <Row gutter={[16, 12]}>
              <Col xs={12} sm={6}>
                <div style={{ textAlign: 'center', padding: 8 }}>
                  <div style={{ fontSize: 11, color: TEXT_SECONDARY, marginBottom: 4 }}>综合评分</div>
                  <div style={{ fontSize: 28, fontWeight: 800,
                    color: aiStrategy.score >= 70 ? COLOR_UP : aiStrategy.score >= 40 ? '#f59e0b' : COLOR_DOWN }}>
                    {aiStrategy.score}
                  </div>
                  <div style={{ fontSize: 11, color: TEXT_SECONDARY }}>分</div>
                </div>
              </Col>
              <Col xs={12} sm={6}>
                <div style={{ textAlign: 'center', padding: 8 }}>
                  <div style={{ fontSize: 11, color: TEXT_SECONDARY, marginBottom: 4 }}>仓位建议</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: aiStrategy.positionPct > 50 ? COLOR_UP : aiStrategy.positionPct > 20 ? '#f59e0b' : COLOR_DOWN }}>
                    {aiStrategy.position || '-'}
                  </div>
                  <div style={{ fontSize: 11, color: TEXT_SECONDARY }}>{aiStrategy.positionPct || 0}%</div>
                </div>
              </Col>
              <Col xs={12} sm={6}>
                <div style={{ textAlign: 'center', padding: 8 }}>
                  <div style={{ fontSize: 11, color: TEXT_SECONDARY, marginBottom: 4 }}>止损/止盈</div>
                  <div style={{ fontSize: 13, fontFamily: 'monospace' }}>
                    <span style={{ color: COLOR_DOWN }}>↓{aiStrategy.stopLoss?.toFixed(2) || '-'}</span>
                    <span style={{ margin: '0 6px', color: BORDER }}>|</span>
                    <span style={{ color: COLOR_UP }}>↑{aiStrategy.takeProfit?.toFixed(2) || '-'}</span>
                  </div>
                </div>
              </Col>
              <Col xs={12} sm={6}>
                <div style={{ textAlign: 'center', padding: 8 }}>
                  <div style={{ fontSize: 11, color: TEXT_SECONDARY, marginBottom: 4 }}>RSI(14)</div>
                  <div style={{ fontSize: 20, fontWeight: 700,
                    color: (aiStrategy.rsi || 50) > 70 ? COLOR_DOWN : (aiStrategy.rsi || 50) < 30 ? COLOR_UP : TEXT_PRIMARY }}>
                    {aiStrategy.rsi?.toFixed(1) || '-'}
                  </div>
                </div>
              </Col>
            </Row>
            {aiStrategy.summary && (
              <>
                <Divider style={{ margin: '8px 0' }} />
                <div style={{ fontSize: 13, color: TEXT_PRIMARY, lineHeight: 1.8, background: '#f8fafc', padding: '10px 14px', borderRadius: 6 }}>
                  {aiStrategy.summary}
                </div>
              </>
            )}
            {(aiStrategy.maAlignment || aiStrategy.crossover) && (
              <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {aiStrategy.maAlignment && <Tag color="blue">{aiStrategy.maAlignment}</Tag>}
                {aiStrategy.crossover === 'golden_cross' && <Tag color="red">金叉</Tag>}
                {aiStrategy.crossover === 'death_cross' && <Tag color="green">死叉</Tag>}
                {aiStrategy.macdSignal === 'bullish' && <Tag color="red">MACD金叉</Tag>}
                {aiStrategy.macdSignal === 'bearish' && <Tag color="green">MACD死叉</Tag>}
              </div>
            )}
            {/* AI 四段叙事 */}
            {aiStrategy.aiNarrative && (
              <div style={{ marginTop: 8 }}>
                <Divider style={{ margin: '6px 0' }} />
                <div style={{ background: '#f0f7ff', borderRadius: 8, padding: '10px 14px', border: '1px solid #d6e4ff' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#1890ff', marginBottom: 8 }}>📋 AI 详细分析</div>
                  
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 11, color: '#8c8c8c', marginBottom: 2 }}>📊 综合评估</div>
                    <div style={{ fontSize: 12, color: TEXT_PRIMARY, lineHeight: 1.7 }}>{aiStrategy.aiNarrative.overall}</div>
                  </div>
                  
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 11, color: '#8c8c8c', marginBottom: 2 }}>📈 趋势分析</div>
                    <div style={{ fontSize: 12, color: TEXT_PRIMARY, lineHeight: 1.7 }}>{aiStrategy.aiNarrative.trend}</div>
                  </div>
                  
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 11, color: '#8c8c8c', marginBottom: 2 }}>⚡ 信号解读</div>
                    <div style={{ fontSize: 12, color: TEXT_PRIMARY, lineHeight: 1.7 }}>{aiStrategy.aiNarrative.signals}</div>
                  </div>
                  
                  <div>
                    <div style={{ fontSize: 11, color: '#8c8c8c', marginBottom: 2 }}>⚠️ 风险控制</div>
                    <div style={{ fontSize: 12, color: TEXT_PRIMARY, lineHeight: 1.7 }}>{aiStrategy.aiNarrative.risk}</div>
                  </div>
                </div>
              </div>
            )}
          </Card>
        )}

        {/* ===== 策略分析 (客户端) ===== */}
        {klineData.length >= 20 && (() => {
          const strategy = analyze(klineData);
          const trendColors = { up: COLOR_UP, down: COLOR_DOWN, sideways: '#f59e0b' };
          const trendLabels = { up: '上升趋势', down: '下降趋势', sideways: '横盘整理' };
          return (
            <Card
              size="small"
              title={<span style={{ fontWeight: 700, color: TEXT_PRIMARY, fontSize: 14 }}>📊 策略分析</span>}
              style={{ marginBottom: 12, borderRadius: 8, border: `1px solid ${BORDER}` }}
            >
              <Row gutter={[16, 12]}>
                <Col xs={24} sm={8}>
                  <div style={{ textAlign: 'center', padding: 8 }}>
                    <div style={{ fontSize: 12, color: TEXT_SECONDARY, marginBottom: 4 }}>趋势判断</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: trendColors[strategy.trend] }}>
                      {trendLabels[strategy.trend]}
                    </div>
                    <div style={{ fontSize: 12, color: TEXT_SECONDARY, marginTop: 2 }}>
                      强度 {strategy.trendStrength.toFixed(0)}%
                    </div>
                  </div>
                </Col>
                <Col xs={24} sm={8}>
                  <div style={{ padding: 8 }}>
                    <div style={{ fontSize: 12, color: TEXT_SECONDARY, marginBottom: 6 }}>支撑位</div>
                    {strategy.sr.support.map((s, i) => (
                      <div key={i} style={{ fontSize: 13, fontWeight: 600, color: COLOR_DOWN, marginBottom: 2 }}>
                        ¥{s.price.toFixed(2)}
                        <span style={{ fontSize: 11, color: TEXT_SECONDARY, marginLeft: 6 }}>
                          {s.strength > 1 ? `${s.strength}重支撑` : ''}
                        </span>
                      </div>
                    ))}
                    {strategy.sr.support.length === 0 && <Text type="secondary" style={{ fontSize: 12 }}>暂无</Text>}
                  </div>
                </Col>
                <Col xs={24} sm={8}>
                  <div style={{ padding: 8 }}>
                    <div style={{ fontSize: 12, color: TEXT_SECONDARY, marginBottom: 6 }}>压力位</div>
                    {strategy.sr.resistance.map((r, i) => (
                      <div key={i} style={{ fontSize: 13, fontWeight: 600, color: COLOR_UP, marginBottom: 2 }}>
                        ¥{r.price.toFixed(2)}
                        <span style={{ fontSize: 11, color: TEXT_SECONDARY, marginLeft: 6 }}>
                          {r.strength > 1 ? `${r.strength}重压力` : ''}
                        </span>
                      </div>
                    ))}
                    {strategy.sr.resistance.length === 0 && <Text type="secondary" style={{ fontSize: 12 }}>暂无</Text>}
                  </div>
                </Col>
              </Row>
              {strategy.signals.length > 0 && (
                <>
                  <Divider style={{ margin: '8px 0' }} />
                  <div style={{ fontSize: 12, color: TEXT_SECONDARY, marginBottom: 4 }}>近期信号</div>
                  <Space wrap size={[4, 4]}>
                    {strategy.signals.slice(-3).reverse().map((s, i) => (
                      <Tag key={i} color={s.direction === 'buy' ? 'red' : s.direction === 'sell' ? 'green' : 'orange'}
                        style={{ fontSize: 11, borderRadius: 4 }}>
                        {s.date?.slice(0, 10)} {s.description}
                      </Tag>
                    ))}
                  </Space>
                </>
              )}
            </Card>
          );
        })()}

        {/* ===== 基本信息 ===== */}
        {stockInfo && (
          <Card
            size="small"
            title={<span style={{ fontWeight: 700, color: TEXT_PRIMARY, fontSize: 14 }}>基本信息</span>}
            style={{ borderRadius: 8, border: `1px solid ${BORDER}` }}
          >
            <Row gutter={[16, 8]}>
              <Col xs={12} sm={8} md={4}><StatItem label="股票代码" value={stockInfo.symbol} /></Col>
              <Col xs={12} sm={8} md={4}><StatItem label="股票名称" value={stockInfo.name} /></Col>
              <Col xs={12} sm={8} md={4}>
                <div style={{ textAlign: 'center', padding: '8px 4px' }}>
                  <div style={{ fontSize: 12, color: TEXT_SECONDARY, marginBottom: 6 }}>交易所</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: TEXT_PRIMARY }}>
                    {stockInfo.market === 'SH' ? '上交所' : stockInfo.market === 'SZ' ? '深交所' : stockInfo.market}
                  </div>
                </div>
              </Col>
              <Col xs={12} sm={8} md={4}><StatItem label="行业" value={stockInfo.industry || '-'} /></Col>
            </Row>
          </Card>
        )}
      </Spin>
    </div>
  );
};

export default StockDetailPage;
