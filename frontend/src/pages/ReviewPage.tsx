import React, { useState, useEffect, useCallback } from 'react';
import {
  Table,
  Card,
  Tag,
  Button,
  Statistic,
  Row,
  Col,
  Typography,
  Space,
  Spin,
  Empty,
  message,
} from 'antd';
import {
  ArrowDownOutlined,
  TrophyOutlined,
  RiseOutlined,
  FallOutlined,
  RobotOutlined,
  LineChartOutlined,
  CalendarOutlined,
  ThunderboltOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { renderMarkdown } from '../utils/markdown';

const { Title, Text, Paragraph } = Typography;

/* ------------------------------------------------------------------ */
/*  Theme tokens — 使用共享 CSS 变量                                    */
/* ------------------------------------------------------------------ */
import { THEME as SharedTheme } from '../styles/theme-constants';
const THEME = {
  bg: SharedTheme.bg,
  cardBg: SharedTheme.cardBg,
  cardBorder: SharedTheme.border,
  text: SharedTheme.text,
  textSecondary: SharedTheme.textSec,
  up: SharedTheme.up,
  down: SharedTheme.down,
  accent: SharedTheme.accent,
  accentHover: SharedTheme.accent,
};

/* ------------------------------------------------------------------ */
/*  TypeScript interfaces                                              */
/* ------------------------------------------------------------------ */
interface StockRecord {
  key: string;
  symbol: string;
  name: string;
  price: number;
  changePct: number;
  changeAmt: number;
  volume: number;
  industry: string;
  // 区间涨跌幅（来自 /api/tech/batch 的 changeRange，按所选 dateRange 的交易日数计算）。
  // null = 历史样本不足或接口未返回，此时回退到实时 changePct。
  rangeChangePct: number | null;
}

interface WatchlistGroup {
  name: string;
  stocks: { symbol: string; name?: string }[];
}

interface _WatchlistData {
  groups: WatchlistGroup[];
}

interface StatsResult {
  totalStocks: number;
  avgChangePct: number;
  bestPerformer: { symbol: string; name: string; changePct: number } | null;
  worstPerformer: { symbol: string; name: string; changePct: number } | null;
  upCount: number;
  downCount: number;
  flatCount: number;
}

/* ------------------------------------------------------------------ */
/*  Helper: read watchlist from localStorage                           */
/* ------------------------------------------------------------------ */
const readWatchlistSymbols = (): { symbol: string }[] => {
  try {
    const raw = localStorage.getItem('astock_watchlist_v2');
    if (!raw) return [];
    const data = JSON.parse(raw);
    
    // 兼容两种格式：直接数组 或 {groups: [...]}
    const groups = Array.isArray(data) ? data : (data.groups || []);
    
    const symbols: { symbol: string }[] = [];
    for (const group of groups) {
      if (Array.isArray(group.stocks)) {
        for (const stock of group.stocks) {
          if (stock.symbol) symbols.push({ symbol: stock.symbol });
        }
      }
    }
    return symbols;
  } catch {
    return [];
  }
};

/* ------------------------------------------------------------------ */
/*  Date-range helpers — 把按钮选项映射成交易日数 + 显示标签            */
/* ------------------------------------------------------------------ */
// 区间按钮 → tech/batch days 参数。custom 暂映射为 30 天。
const dateRangeToDays = (range: string): number => {
  switch (range) {
    case '7days':
      return 7;
    case '90days':
      return 90;
    case 'custom':
      return 30; // 自定义暂按 30 天处理
    case '30days':
    default:
      return 30;
  }
};

// 区间按钮 → 标题用的中文标签
const dateRangeLabel = (range: string): string => {
  switch (range) {
    case '7days':
      return '近7天';
    case '90days':
      return '近90天';
    case 'custom':
      return '近30天(自定义)';
    case '30days':
    default:
      return '近30天';
  }
};

// 有效涨跌：优先用区间涨跌(rangeChangePct)，历史样本不足时回退到实时 changePct
const effChange = (s: StockRecord): number =>
  s.rangeChangePct != null ? s.rangeChangePct : s.changePct;

/* ------------------------------------------------------------------ */
/*  Derived stats                                                      */
/* ------------------------------------------------------------------ */
const computeStats = (stocks: StockRecord[]): StatsResult => {
  if (stocks.length === 0) {
    return {
      totalStocks: 0,
      avgChangePct: 0,
      bestPerformer: null,
      worstPerformer: null,
      upCount: 0,
      downCount: 0,
      flatCount: 0,
    };
  }

  const totalChangePct = stocks.reduce((acc, s) => acc + effChange(s), 0);
  const avgChangePct = totalChangePct / stocks.length;

  const sorted = [...stocks].sort((a, b) => effChange(b) - effChange(a));
  const bestPerformer = {
    symbol: sorted[0].symbol,
    name: sorted[0].name,
    changePct: effChange(sorted[0]),
  };
  const worstPerformer = {
    symbol: sorted[sorted.length - 1].symbol,
    name: sorted[sorted.length - 1].name,
    changePct: effChange(sorted[sorted.length - 1]),
  };

  const upCount = stocks.filter((s) => effChange(s) > 0).length;
  const downCount = stocks.filter((s) => effChange(s) < 0).length;
  const flatCount = stocks.filter((s) => effChange(s) === 0).length;

  return {
    totalStocks: stocks.length,
    avgChangePct,
    bestPerformer,
    worstPerformer,
    upCount,
    downCount,
    flatCount,
  };
};

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

const SectionTitle: React.FC<{ children: React.ReactNode; icon?: React.ReactNode }> = ({
  children,
  icon,
}) => (
  <div style={{ marginBottom: 16 }}>
    <Space align="center" size={8}>
      {icon}
      <Text style={{ color: THEME.text, fontSize: 18, fontWeight: 600 }}>{children}</Text>
    </Space>
  </div>
);

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

const ReviewPage: React.FC = () => {
  const navigate = useNavigate();
  const [dateRange, setDateRange] = useState<string>('30days');
  const [aiAnalysis, setAiAnalysis] = useState<string>('');
  const [aiAnalysisLoading, setAiAnalysisLoading] = useState(false);

  // Real data state
  const [stocks, setStocks] = useState<StockRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasWatchlist, setHasWatchlist] = useState<boolean | null>(null); // null = not checked yet

  const stats = computeStats(stocks);
  const rangeLabel = dateRangeLabel(dateRange);

  /* --- Load watchlist and fetch real quotes ------------------------- */
  const loadStockData = useCallback(async () => {
    setLoading(true);
    try {
      const watchlistSymbols = readWatchlistSymbols();

      if (watchlistSymbols.length === 0) {
        setHasWatchlist(false);
        setStocks([]);
        setLoading(false);
        return;
      }

      setHasWatchlist(true);
      const symbolList = watchlistSymbols.map((s) => s.symbol);
      const days = dateRangeToDays(dateRange);
      console.warn("[ReviewPage] watchlist symbols:", JSON.stringify(symbolList.slice(0, 5)), symbolList.length > 5 ? "...(" + symbolList.length + " total)" : "");

      // 并行拉取：实时快照(价/名/行业) + 区间技术指标(区间涨跌幅)
      const [quotesResp, techResp] = await Promise.allSettled([
        fetch('/api/stocks/batch/quotes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbols: symbolList }),
        }),
        fetch('/api/tech/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbols: symbolList, days }),
        }),
      ]);

      if (quotesResp.status !== 'fulfilled' || !quotesResp.value.ok) {
        const st =
          quotesResp.status === 'fulfilled' ? quotesResp.value.status : 'network';
        throw new Error(`HTTP ${st}`);
      }

      const data = await quotesResp.value.json();

      // 解析 tech/batch 区间涨跌幅，按 symbol 建索引（接口失败时为空 map → 回退实时）
      const rangeMap: Record<string, number> = {};
      if (techResp.status === 'fulfilled' && techResp.value.ok) {
        try {
          const techData = await techResp.value.json();
          const techRecords = (techData.data || techData || {}) as Record<
            string,
            { changeRange?: number | null }
          >;
          for (const [sym, rec] of Object.entries(techRecords)) {
            if (rec && rec.changeRange != null && Number.isFinite(rec.changeRange)) {
              rangeMap[sym] = Number(rec.changeRange);
            }
          }
        } catch {
          // tech 解析失败：忽略，回退到实时 changePct
        }
      }

      // 区间涨跌幅查找：兼容带/不带交易所后缀的 symbol
      const lookupRange = (symbol: string): number | null => {
        if (symbol in rangeMap) return rangeMap[symbol];
        const pure = symbol.replace(/\.(SH|SZ|BJ)$/i, '');
        for (const [k, v] of Object.entries(rangeMap)) {
          if (k.replace(/\.(SH|SZ|BJ)$/i, '') === pure) return v;
        }
        return null;
      };

      // Normalize the response into StockRecord[]
      const stocksData = data.data?.stocks || data.stocks || data.quotes || data || [];
      const records: StockRecord[] = stocksData
        .filter((q: Record<string, unknown>) => q && (q.symbol || q.code))
        .map((q: Record<string, unknown>, idx: number) => {
          const latestQuote = q.latestQuote as Record<string, unknown> | undefined;
          const symbol = (q.symbol || q.code || '') as string;
          const name = (q.name || q.stockName || symbol) as string;
          const price = Number(latestQuote?.close_price || latestQuote?.closePrice || q.price || q.currentPrice || 0);
          const changePct = Number(latestQuote?.change_percent || latestQuote?.changePercent || q.changePct || q.changePercent || 0);
          const changeAmt = Number(latestQuote?.change_amount || latestQuote?.changeAmount || q.changeAmt || q.change || 0);
          const volume = Number(latestQuote?.volume || q.volume || 0);
          const industry = (q.industry || q.sector || '-') as string;

          return {
            key: String(idx),
            symbol,
            name,
            price,
            changePct,
            changeAmt,
            volume,
            industry,
            rangeChangePct: lookupRange(symbol),
          };
        });

      setStocks(records);
    } catch (err) {
      console.error('Failed to load review stock data:', err);
      const msg = err instanceof Error ? err.message : String(err);
      message.warning(msg.includes('404') || msg.includes('Network')
        ? '自选股数据接口暂不可用，请检查后端服务'
        : '加载自选股数据失败，请稍后重试');
      setStocks([]);
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    loadStockData();
  }, [loadStockData]);

  /* --- AI Analysis ------------------------------------------------- */
  const handleAiAnalysis = async () => {
    setAiAnalysisLoading(true);
    try {
      // 构建自选股复盘摘要数据 (对齐 watchlist-summary 端点)
      const symbols = stocks.map(s => s.symbol);
      const quotes = stocks.map(s => ({
        symbol: s.symbol,
        name: s.name,
        price: s.price,
        changePercent: s.rangeChangePct ?? s.changePct ?? 0,
        turnoverRate: 0, // ReviewPage不展示换手率
      }));
      const resp = await fetch('/api/ai/watchlist-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols, quotes }),
      });
      const data = await resp.json();
      if (data.summary) setAiAnalysis(data.summary);
    } catch {
      // silent fail
    } finally {
      setAiAnalysisLoading(false);
    }
  };

  /* --- Table columns ---------------------------------------------- */
  const columns = [
    {
      title: '代码',
      dataIndex: 'symbol',
      key: 'symbol',
      width: 120,
      render: (v: string) => (
        <Text style={{ color: THEME.accent, fontSize: 13, fontFamily: 'monospace' }}>{v}</Text>
      ),
    },
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      width: 100,
      render: (v: string) => (
        <Text style={{ color: THEME.text, fontSize: 13 }}>{v}</Text>
      ),
    },
    {
      title: '最新价',
      dataIndex: 'price',
      key: 'price',
      width: 100,
      render: (v: number) => (
        <Text style={{ color: THEME.text, fontSize: 13, fontWeight: 600 }}>
          ¥{v.toFixed(2)}
        </Text>
      ),
    },
    {
      title: `${rangeLabel}涨跌幅`,
      dataIndex: 'changePct',
      key: 'changePct',
      width: 110,
      render: (_v: number, record: StockRecord) => {
        const v = effChange(record);
        const color = v > 0 ? THEME.up : v < 0 ? THEME.down : THEME.text;
        return (
          <Text style={{ color, fontSize: 13, fontWeight: 600 }}>
            {v > 0 ? '+' : ''}{v.toFixed(2)}%
          </Text>
        );
      },
    },
    {
      title: '涨跌额',
      dataIndex: 'changeAmt',
      key: 'changeAmt',
      width: 100,
      render: (v: number) => {
        const color = v > 0 ? THEME.up : v < 0 ? THEME.down : THEME.textSecondary;
        return (
          <Text style={{ color, fontSize: 13 }}>
            {v > 0 ? '+' : ''}{v.toFixed(2)}
          </Text>
        );
      },
    },
    {
      title: '成交量',
      dataIndex: 'volume',
      key: 'volume',
      width: 120,
      render: (v: number) => (
        <Text style={{ color: THEME.textSecondary, fontSize: 13 }}>
          {v >= 10000 ? `${(v / 10000).toFixed(1)}万` : v.toLocaleString()}
        </Text>
      ),
    },
    {
      title: '行业',
      dataIndex: 'industry',
      key: 'industry',
      width: 120,
      render: (v: string) => (
        <Space size={4}>
          <Tag
            style={{
              background: 'rgba(59,130,246,0.15)',
              color: THEME.accent,
              border: '1px solid rgba(59,130,246,0.3)',
              borderRadius: 4,
              fontSize: 12,
              cursor: 'pointer',
            }}
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/industry-map?industry=${encodeURIComponent(v)}`);
            }}
          >
            {v}
          </Tag>
          <Button
            type="link"
            size="small"
            style={{ fontSize: 10, padding: 0 }}
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/industry-map?industry=${encodeURIComponent(v)}`);
            }}
          >
            产业链
          </Button>
        </Space>
      ),
    },
  ];

  const handleRowClick = (record: StockRecord) => {
    navigate(`/stocks/${record.symbol}`);
  };

  const cardStyle: React.CSSProperties = {
    background: THEME.cardBg,
    border: `1px solid ${THEME.cardBorder}`,
    borderRadius: 12,
  };

  /* --- Empty state ------------------------------------------------- */
  if (!loading && hasWatchlist === false) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: THEME.bg,
          padding: '24px 32px',
          color: THEME.text,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Empty
          description={
            <span style={{ color: THEME.textSecondary, fontSize: 16 }}>
              暂无自选股 — 请先在自选页添加股票
            </span>
          }
          style={{ margin: '48px 0' }}
        >
          <Button
            type="primary"
            onClick={() => navigate('/watchlist')}
            style={{
              background: THEME.accent,
              borderColor: THEME.accent,
              borderRadius: 8,
              height: 42,
              fontWeight: 600,
            }}
          >
            前往自选股
          </Button>
        </Empty>
      </div>
    );
  }

  return (
    <div
      className="review-page"
      style={{
        minHeight: '100vh',
        background: THEME.bg,
        padding: '24px 32px',
        color: THEME.text,
      }}
    >
      {/* ============================================================ */}
      {/*  Header                                                       */}
      {/* ============================================================ */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 28,
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <div>
          <Title level={2} style={{ color: THEME.text, margin: 0 }}>
            📋 复盘中心
          </Title>
          <Text style={{ color: THEME.textSecondary, fontSize: 14, marginTop: 4, display: 'block' }}>
            自选股 {rangeLabel} 区间表现复盘与分析
          </Text>
        </div>
        <Space size={8} wrap>
          {(['7days', '30days', '90days', 'custom'] as const).map((range) => {
            const labels = { '7days': '近7天', '30days': '近30天', '90days': '近90天', custom: '自定义' };
            const isActive = dateRange === range;
            return (
              <Button
                key={range}
                size="small"
                icon={range === 'custom' ? <CalendarOutlined /> : undefined}
                onClick={() => setDateRange(range)}
                style={{
                  background: isActive ? THEME.accent : 'transparent',
                  color: isActive ? '#fff' : THEME.textSecondary,
                  border: isActive ? 'none' : `1px solid ${THEME.cardBorder}`,
                  borderRadius: 6,
                  fontSize: 13,
                }}
              >
                {labels[range]}
              </Button>
            );
          })}
          <Button
            size="small"
            icon={<ReloadOutlined />}
            onClick={loadStockData}
            loading={loading}
            style={{
              background: 'transparent',
              color: THEME.textSecondary,
              border: `1px solid ${THEME.cardBorder}`,
              borderRadius: 6,
              fontSize: 13,
            }}
          >
            刷新
          </Button>
        </Space>
      </div>

      {/* ============================================================ */}
      {/*  Summary Stats Row                                            */}
      {/* ============================================================ */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {/* Total Stocks */}
        <Col xs={24} sm={12} lg={6}>
          <Card style={cardStyle} bodyStyle={{ padding: 20 }}>
            <Statistic
              title={<span style={{ color: THEME.textSecondary, fontSize: 13 }}>自选股票数</span>}
              value={stats.totalStocks}
              prefix={<ThunderboltOutlined style={{ color: THEME.accent }} />}
              valueStyle={{ color: THEME.text, fontSize: 28, fontWeight: 700 }}
            />
          </Card>
        </Col>
        {/* Average Change */}
        <Col xs={24} sm={12} lg={6}>
          <Card style={cardStyle} bodyStyle={{ padding: 20 }}>
            <Statistic
              title={<span style={{ color: THEME.textSecondary, fontSize: 13 }}>平均{rangeLabel}涨跌</span>}
              value={stats.avgChangePct}
              precision={2}
              suffix="%"
              prefix={
                stats.avgChangePct >= 0 ? (
                  <RiseOutlined style={{ color: THEME.up }} />
                ) : (
                  <FallOutlined style={{ color: THEME.down }} />
                )
              }
              valueStyle={{
                color: stats.avgChangePct >= 0 ? THEME.up : THEME.down,
                fontSize: 28,
                fontWeight: 700,
              }}
            />
          </Card>
        </Col>
        {/* Best Performer */}
        <Col xs={24} sm={12} lg={6}>
          <Card style={cardStyle} bodyStyle={{ padding: 20 }}>
            <Statistic
              title={<span style={{ color: THEME.textSecondary, fontSize: 13 }}>最佳表现</span>}
              value={stats.bestPerformer?.changePct ?? 0}
              precision={2}
              suffix="%"
              prefix={<TrophyOutlined style={{ color: THEME.up }} />}
              valueStyle={{ color: THEME.up, fontSize: 28, fontWeight: 700 }}
            />
            {stats.bestPerformer && (
              <Text style={{ color: THEME.textSecondary, fontSize: 12, marginTop: 4, display: 'block' }}>
                {stats.bestPerformer.name} ({stats.bestPerformer.symbol})
              </Text>
            )}
          </Card>
        </Col>
        {/* Worst Performer */}
        <Col xs={24} sm={12} lg={6}>
          <Card style={cardStyle} bodyStyle={{ padding: 20 }}>
            <Statistic
              title={<span style={{ color: THEME.textSecondary, fontSize: 13 }}>最差表现</span>}
              value={stats.worstPerformer?.changePct ?? 0}
              precision={2}
              suffix="%"
              prefix={<ArrowDownOutlined style={{ color: THEME.down }} />}
              valueStyle={{ color: THEME.down, fontSize: 28, fontWeight: 700 }}
            />
            {stats.worstPerformer && (
              <Text style={{ color: THEME.textSecondary, fontSize: 12, marginTop: 4, display: 'block' }}>
                {stats.worstPerformer.name} ({stats.worstPerformer.symbol})
              </Text>
            )}
          </Card>
        </Col>
      </Row>

      {/* ============================================================ */}
      {/*  Stock Data Table                                             */}
      {/* ============================================================ */}
      <Card
        style={{ ...cardStyle, marginBottom: 24 }}
        bodyStyle={{ padding: 0 }}
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <LineChartOutlined style={{ color: THEME.accent }} />
            <Text style={{ color: THEME.text, fontSize: 16, fontWeight: 600 }}>
              自选股{rangeLabel}表现
            </Text>
            <Tag
              style={{
                marginLeft: 8,
                background: 'rgba(59,130,246,0.15)',
                color: THEME.accent,
                border: 'none',
                borderRadius: 4,
              }}
            >
              共 {stocks.length} 只
            </Tag>
          </div>
        }
      >
        {loading ? (
          <div style={{ textAlign: 'center', padding: '48px 0' }}>
            <Spin tip="加载行情数据中..." />
          </div>
        ) : (
          <Table<StockRecord>
            columns={columns}
            dataSource={stocks}
            pagination={false}
            onRow={(record) => ({
              onClick: () => handleRowClick(record),
              style: { cursor: 'pointer' },
              onMouseEnter: (e) => {
                (e.currentTarget as HTMLElement).style.background = 'rgba(59,130,246,0.06)';
              },
              onMouseLeave: (e) => {
                (e.currentTarget as HTMLElement).style.background = 'transparent';
              },
            })}
            size="middle"
            scroll={{ x: 'max-content' }}
            style={{ background: 'transparent' }}
          />
        )}
      </Card>

      {/* ============================================================ */}
      {/*  Market Overview + AI Analysis  (two-col on desktop)          */}
      {/* ============================================================ */}
      <Row gutter={[16, 16]}>
        {/* Market Overview / Strategy Panel */}
        <Col xs={24} lg={14}>
          <Card style={{ ...cardStyle, height: '100%' }} bodyStyle={{ padding: 24 }}>
            <SectionTitle icon={<LineChartOutlined style={{ color: THEME.accent }} />}>
              自选股{rangeLabel}涨跌分布
            </SectionTitle>

            {/* Visual bar for up/down/flat distribution */}
            <div style={{ marginBottom: 24 }}>
              {stocks
                .slice()
                .sort((a, b) => effChange(b) - effChange(a))
                .map((s) => {
                  const cv = effChange(s);
                  const maxAbs = Math.max(
                    ...stocks.map((st) => Math.abs(effChange(st))),
                    1
                  );
                  const barWidth = (Math.abs(cv) / maxAbs) * 280;
                  const color =
                    cv > 0 ? THEME.up : cv < 0 ? THEME.down : THEME.textSecondary;
                  return (
                    <div
                      key={s.symbol}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}
                    >
                      <div
                        style={{
                          width: 90,
                          textAlign: 'right',
                          color: THEME.textSecondary,
                          fontSize: 12,
                          fontFamily: 'monospace',
                          flexShrink: 0,
                        }}
                      >
                        {s.name}
                      </div>
                      <div
                        style={{
                          height: 18,
                          width: barWidth || 2,
                          borderRadius: 4,
                          background: color,
                          transition: 'width 0.3s ease',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'flex-end',
                          paddingRight: 6,
                          minWidth: 2,
                        }}
                      >
                        {barWidth > 40 && (
                          <span style={{ color: '#fff', fontSize: 10, fontWeight: 600 }}>
                            {cv > 0 ? '+' : ''}{cv.toFixed(2)}%
                          </span>
                        )}
                      </div>
                      {barWidth <= 40 && (
                        <span style={{ color, fontSize: 10, fontWeight: 600 }}>
                          {cv > 0 ? '+' : ''}{cv.toFixed(2)}%
                        </span>
                      )}
                    </div>
                  );
                })}
            </div>

            {/* Legend */}
            <div style={{ display: 'flex', gap: 24, marginBottom: 20 }}>
              <Space size={6}>
                <div
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: THEME.up,
                  }}
                />
                <Text style={{ color: THEME.textSecondary, fontSize: 12 }}>上涨 ({stats.upCount})</Text>
              </Space>
              <Space size={6}>
                <div
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: THEME.down,
                  }}
                />
                <Text style={{ color: THEME.textSecondary, fontSize: 12 }}>下跌 ({stats.downCount})</Text>
              </Space>
              <Space size={6}>
                <div
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: THEME.textSecondary,
                  }}
                />
                <Text style={{ color: THEME.textSecondary, fontSize: 12 }}>平盘 ({stats.flatCount})</Text>
              </Space>
            </div>

            {/* Key Metrics */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 12,
              }}
            >
              {[
                {
                  label: '上涨占比',
                  value: stats.totalStocks > 0
                    ? `${((stats.upCount / stats.totalStocks) * 100).toFixed(1)}%`
                    : '-',
                  desc: `${rangeLabel}上涨比`,
                },
                {
                  label: '平均涨幅',
                  value: `${stats.avgChangePct >= 0 ? '+' : ''}${stats.avgChangePct.toFixed(2)}%`,
                  desc: `${rangeLabel}均值`,
                },
                {
                  label: '涨跌家数',
                  value: `${stats.upCount}:${stats.downCount}`,
                  desc: '多空对比',
                },
              ].map((m) => (
                <div
                  key={m.label}
                  style={{
                    background: 'rgba(59,130,246,0.08)',
                    borderRadius: 8,
                    padding: '12px 14px',
                    textAlign: 'center',
                  }}
                >
                  <Text style={{ color: THEME.textSecondary, fontSize: 11, display: 'block' }}>
                    {m.label}
                  </Text>
                  <Text style={{ color: THEME.accent, fontSize: 20, fontWeight: 700, display: 'block' }}>
                    {m.value}
                  </Text>
                  <Text style={{ color: THEME.textSecondary, fontSize: 10, display: 'block' }}>
                    {m.desc}
                  </Text>
                </div>
              ))}
            </div>
          </Card>
        </Col>

        {/* AI Analysis + Quick Backtest */}
        <Col xs={24} lg={10}>
          {/* AI Behavior Analysis */}
          <Card
            style={{ ...cardStyle, marginBottom: 16 }}
            bodyStyle={{ padding: 24 }}
          >
            <SectionTitle icon={<RobotOutlined style={{ color: THEME.accent }} />}>
              AI 自选股分析
            </SectionTitle>
            <div
              style={{
                background: 'rgba(59,130,246,0.06)',
                borderRadius: 8,
                padding: 20,
                marginBottom: 16,
                border: '1px solid rgba(59,130,246,0.15)',
              }}
            >
              <Paragraph style={{ color: THEME.textSecondary, fontSize: 13, margin: 0, lineHeight: 1.8 }}>
                基于您的自选股实时行情数据，AI 将分析您的持仓结构和市场表现。包括：
              </Paragraph>
              <ul
                style={{
                  color: THEME.textSecondary,
                  fontSize: 13,
                  margin: '12px 0 0 16px',
                  lineHeight: 2,
                }}
              >
                <li>自选股整体涨跌分布</li>
                <li>行业集中度分析</li>
                <li>最佳/最差表现个股解读</li>
                <li>持仓风险暴露评估</li>
                <li>调仓建议</li>
              </ul>
            </div>
            <Button
              type="primary"
              icon={<RobotOutlined />}
              block
              style={{
                background: THEME.accent,
                borderColor: THEME.accent,
                borderRadius: 8,
                height: 42,
                fontWeight: 600,
              }}
              onClick={handleAiAnalysis}
              loading={aiAnalysisLoading}
              disabled={stocks.length === 0}
            >
              {aiAnalysisLoading ? '分析中...' : '开始分析'}
            </Button>
            {aiAnalysis && (
              <div
                style={{
                  marginTop: 16,
                  padding: 16,
                  background: 'rgba(15,23,42,0.5)',
                  borderRadius: 8,
                  border: `1px solid ${THEME.cardBorder}`,
                  color: THEME.text,
                  fontSize: 13,
                  lineHeight: 1.8,
                }}
                dangerouslySetInnerHTML={{ __html: renderMarkdown(aiAnalysis) }}
              />
            )}
          </Card>

          {/* Quick Backtest Entry */}
          <Card
            style={cardStyle}
            bodyStyle={{ padding: 24 }}
          >
            <SectionTitle icon={<ThunderboltOutlined style={{ color: THEME.accent }} />}>
              快速回测
            </SectionTitle>
            <Paragraph style={{ color: THEME.textSecondary, fontSize: 13, marginBottom: 16 }}>
              选择个股，回测不同策略的历史表现，找到最适合的交易模式。
            </Paragraph>
            <Button
              type="primary"
              icon={<LineChartOutlined />}
              block
              size="large"
              style={{
                background: `linear-gradient(135deg, ${THEME.accent}, #6366f1)`,
                border: 'none',
                borderRadius: 8,
                height: 48,
                fontWeight: 600,
                fontSize: 15,
              }}
              onClick={() => navigate('/backtest')}
            >
              进入回测中心
            </Button>
            <div
              style={{
                marginTop: 12,
                display: 'flex',
                justifyContent: 'center',
                gap: 16,
              }}
            >
              {['策略回测', '参数优化', '组合回测'].map((label) => (
                <Text
                  key={label}
                  style={{
                    color: THEME.textSecondary,
                    fontSize: 12,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <span style={{ color: THEME.accent, fontSize: 10 }}>●</span>
                  {label}
                </Text>
              ))}
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default ReviewPage;
