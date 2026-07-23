/**
 * FloatingChat — 浮动AI对话入口（上下文感知版 v2）
 * 
 * v2新增:
 * - 猜你想问: 基于当前页面+市场数据生成推荐问题
 * - 实时数据注入: market summary数据注入system提示词
 * - 投资笔记入口: "保存到投资笔记"按钮
 */

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { MessageOutlined, CloseOutlined, BulbOutlined } from '@ant-design/icons';
import ChatPanel from './ChatPanel';
import { message } from 'antd';
import { NOTE_SAVED_EVENT, type NoteSavedEventDetail } from '../../utils/knowledgeStore';

interface PageContext {
  page: string;
  pageName: string;
  symbol?: string;
  stockName?: string;
  systemHint: string;
  symbols?: string[];
}

interface MarketData {
  risingStocks: number;
  fallingStocks: number;
  totalTurnover: number;
  limitUpCount: number;
  limitDownCount: number;
}


interface MultidimDimension {
  score: number;
  label: string;
}

interface MultidimData {
  totalScore: number;
  dimensions: Record<string, MultidimDimension>;
}

type SuggestedQuestion = { icon: string; text: string; prompt: string };

// ===== 页面上下文映射 =====
const PAGE_CONTEXT_MAP: Record<string, Omit<PageContext, 'symbol' | 'stockName'>> = {
  '/': {
    page: 'discover', pageName: '市场洞察',
    systemHint: '用户正在浏览市场概览页面。你可以提供：市场情绪分析、板块轮动解读、资金流向研判、今日热点解读。',
  },
  '/screener': {
    page: 'screener', pageName: '策略选股',
    systemHint: '用户正在使用选股筛选器。你可以提供：筛选条件建议、策略解读、行业分析、估值判断。',
  },
  '/watchlist': {
    page: 'watchlist', pageName: '自选追踪',
    systemHint: '用户正在查看自选股列表。你可以提供：个股对比分析、组合风险评估、异动解读。',
  },
  '/review': {
    page: 'review', pageName: '复盘研究',
    systemHint: '用户正在进行投资复盘。你可以提供：持仓分析、盈亏归因、策略改进建议。',
  },
  '/industry-map': {
    page: 'industry-map', pageName: '产业地图',
    systemHint: '用户正在查看产业链图谱。你可以提供：产业链上下游分析、环节景气度判断、龙头公司对比、产业趋势解读。',
  },
  '/radar': {
    page: 'radar', pageName: '潜力雷达',
    systemHint: '用户正在查看潜力股雷达。你可以提供：评分逻辑解读、个股深度分析、策略建议。',
  },
};

// ===== 猜你想问 — 页面感知 =====
const getSuggestedQuestions = (page: string, stockName?: string): SuggestedQuestion[] => {
  const stock = stockName || '这只股票';
  const questions: Record<string, SuggestedQuestion[]> = {
    discover: [
      { icon: '📈', text: '今天市场为什么涨/跌？', prompt: '请分析今天A股市场涨跌的核心原因，从资金面、政策面、基本面多维度解读。' },
      { icon: '🏭', text: '哪些板块在领涨？', prompt: '今天哪些板块表现最好？领涨的原因是什么？' },
      { icon: '⚠️', text: '当前市场风险在哪？', prompt: '当前A股市场面临的主要风险有哪些？投资者应该注意什么？' },
      { icon: '💰', text: '资金流向哪些方向？', prompt: '最近主力资金和北向资金流向哪些板块和个股？' },
    ],
    screener: [
      { icon: '🔍', text: '帮我筛选低估值高增长股票', prompt: '请帮我筛选市盈率低于15且营收增长率超过20%的优质标的，并解释筛选逻辑。' },
      { icon: '🏭', text: '最近哪些行业景气度高？', prompt: '当前A股市场哪些行业景气度最高？请分析背后的驱动因素。' },
      { icon: '⚖️', text: '当前适合价值还是成长？', prompt: '当前市场环境更适合价值投资还是成长投资？请结合估值和宏观环境分析。' },
    ],
    'stock-detail': [
      { icon: '📊', text: `${stock}的估值合理吗？`, prompt: `请从PE、PB、ROE等维度分析${stock}的估值是否合理，与同行业对比如何。` },
      { icon: '📰', text: `${stock}最近有什么消息？`, prompt: `${stock}最近有哪些利好或利空消息？对股价可能产生什么影响？` },
      { icon: '📉', text: `${stock}技术面如何？`, prompt: `请从K线形态、均线、MACD、RSI等技术指标分析${stock}的走势。` },
    ],
    'industry-map': [
      { icon: '🎯', text: '这条产业链的核心标的？', prompt: '请列出当前产业链中最值得关注的核心标的，并说明投资逻辑。' },
      { icon: '📈', text: '产业链哪个环节弹性最大？', prompt: '在这条产业链中，哪个环节的业绩弹性最大？为什么？' },
      { icon: '🇨🇳', text: '国产替代进展如何？', prompt: '当前国产替代在哪些环节进展最快？哪些公司最受益？' },
    ],
    watchlist: [
      { icon: '🛡️', text: '我的自选股风险评估', prompt: '请帮我评估自选股组合的整体风险，包括行业集中度、估值水平和波动率。' },
      { icon: '🔔', text: '自选股有哪些异动？', prompt: '我的自选股中最近有哪些值得关注的异动？请分析可能的原因。' },
    ],
    review: [
      { icon: '📝', text: '如何改进投资策略？', prompt: '基于我的持仓情况，有哪些可以改进的地方？请给出具体的策略建议。' },
      { icon: '📚', text: '推荐一些投资学习方法', prompt: '对于A股投资，有哪些值得学习的方法论和经典书籍推荐？' },
    ],
    radar: [
      { icon: '⭐', text: '潜力股评分的逻辑？', prompt: '潜力股雷达的六因子评分模型是如何计算的？各因子的权重和含义是什么？' },
      { icon: '🔍', text: '评分最高的股票值得买吗？', prompt: '潜力雷达中评分最高的几只股票是否值得关注？请分析其优缺点。' },
    ],
  };
  return questions[page] || [
    { icon: '💡', text: '今天市场怎么样？', prompt: '请简要分析今天A股市场的整体表现。' },
    { icon: '📚', text: '有什么投资建议？', prompt: '基于当前市场环境，有什么投资建议？' },
  ];
};

const STOCK_DETAIL_PATTERN = /^\/stocks\/(\d{6})/;

// 多维景气摘要格式化 (单板块 -> 单行文本)
function buildMultidimSummary(industry: string, data: MultidimData): string {
  const dimMap: Record<string, string> = {
    crowding: '拥挤', diffusion: '扩散', concentration: '集中', retail: '小白', recovery: '回补',
  };
  const parts = Object.entries(data.dimensions).map(([key, dim]) =>
    `${dimMap[key] || key}${dim.score}(${dim.label})`
  );
  return `  ${industry}: ${parts.join(' / ')} [综合${data.totalScore}]`;
}

const FloatingChat: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [marketData, setMarketData] = useState<MarketData | null>(null);
  const [suggestedQuestions, setSuggestedQuestions] = useState<SuggestedQuestion[]>([]);
  const location = useLocation();

  // 获取实时市场数据
  const fetchMarketData = useCallback(async () => {
    try {
      const resp = await fetch('/api/market/summary');
      const data = await resp.json();
      if (data?.data) {
        setMarketData({
          risingStocks: data.data.risingStocks || 0,
          fallingStocks: data.data.fallingStocks || 0,
          totalTurnover: data.data.totalTurnover || 0,
          limitUpCount: data.data.limitUpCount || 0,
          limitDownCount: data.data.limitDownCount || 0,
        });
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => { fetchMarketData(); }, [fetchMarketData]);

  // 多维景气数据摘要
  const [multidimSummary, setMultidimSummary] = useState<string>('');

  // 获取多维景气上下文
  const fetchMultidimContext = useCallback(async (page: string, symbol?: string) => {
    setMultidimSummary('');
    try {
      if (page === 'stock-detail' && symbol) {
        // 个股页: 获取所属板块，再获取板块多维数据
        const stockResp = await fetch(`/api/stocks/${symbol}`);
        const stockData = await stockResp.json();
        const industry = stockData?.data?.industry;
        if (industry) {
          const mdResp = await fetch(`/api/sectors/${encodeURIComponent(industry)}/multidim`);
          const mdData = await mdResp.json();
          if (mdData?.data) {
            const summary = buildMultidimSummary(industry, mdData.data);
            setMultidimSummary(`板块景气多维: ${summary}`);
          }
        }
      } else if (page === 'discover') {
        // 发现页: 获取Top3板块的多维摘要
        const sectorResp = await fetch('/api/sectors/momentum');
        const sectorData = await sectorResp.json();
        const topSectors = (sectorData?.data?.sectors || []).slice(0, 3);
        if (topSectors.length > 0) {
          const mdResults = await Promise.allSettled(
            topSectors.map((s: any) =>
              fetch(`/api/sectors/${encodeURIComponent(s.industry)}/multidim`).then(r => r.json())
            )
          );
          const parts: string[] = [];
          topSectors.forEach((s: any, i: number) => {
            if (mdResults[i].status === 'fulfilled' && mdResults[i].value?.data) {
              parts.push(buildMultidimSummary(s.industry, mdResults[i].value.data));
            }
          });
          if (parts.length > 0) {
            setMultidimSummary('Top3板块多维景气:\n' + parts.join('\n'));
          }
        }
      }
    } catch { /* silent */ }
  }, []);

  // 页面变化时获取多维数据
  useEffect(() => {
    const pathname = location.pathname;
    const stockMatch = pathname.match(STOCK_DETAIL_PATTERN);
    if (stockMatch) {
      fetchMultidimContext('stock-detail', stockMatch[1]);
    } else if (pathname === '/') {
      fetchMultidimContext('discover');
    } else {
      setMultidimSummary('');
    }
  }, [location.pathname, fetchMultidimContext]);

  // 监听投资笔记保存事件 — 与其他组件联动
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<NoteSavedEventDetail>).detail;
      if (detail?.entry) {
        const catInfo = ['产业知识', '投资方法', '关注概念', '学习笔记'];
        message.success({
          content: `📝 笔记已保存到「${detail.entry.category}」— 点击右下角 AI 助手继续深入探讨`,
          duration: 3,
          style: { marginTop: 48 },
        });
      }
    };
    window.addEventListener(NOTE_SAVED_EVENT, handler);
    return () => window.removeEventListener(NOTE_SAVED_EVENT, handler);
  }, []);

  // 计算当前页面上下文
  const pageContext: PageContext = useMemo(() => {
    const pathname = location.pathname;
    const stockMatch = pathname.match(STOCK_DETAIL_PATTERN);
    
    if (stockMatch) {
      const symbol = stockMatch[1];
      return {
        page: 'stock-detail', pageName: '个股详情', symbol,
        systemHint: `用户正在查看股票 ${symbol} 的详情页。你可以提供：技术面分析、基本面解读、估值判断、风险提示。引用页面数据回答。`,
      };
    }
    return PAGE_CONTEXT_MAP[pathname] || {
      page: 'other', pageName: '其他',
      systemHint: '用户正在浏览澄观。根据用户问题提供专业的A股投资研究分析。',
    };
  }, [location.pathname]);

  // 注入市场数据到systemHint
  const enrichedContext = useMemo(() => {
    let hint = pageContext.systemHint;
    
    if (marketData) {
      const turnoverStr = marketData.totalTurnover > 1e12
        ? `${(marketData.totalTurnover / 1e12).toFixed(1)}万亿`
        : `${(marketData.totalTurnover / 1e8).toFixed(0)}亿`;
      hint += `\n\n实时市场数据: ${marketData.risingStocks}只上涨, ${marketData.fallingStocks}只下跌, ${marketData.limitUpCount}只涨停, ${marketData.limitDownCount}只跌停, 成交${turnoverStr}。`;
    }

    // 注入自选股
    try {
      const raw = localStorage.getItem('astock_watchlist_v2');
      if (raw) {
        const groups = JSON.parse(raw);
        const allStocks = groups.flatMap((g: any) => g.stocks || []);
        if (allStocks.length > 0) {
          const names = allStocks.map((s: any) => s.name).join('、');
          hint += `\n用户自选股: ${names}。回答时可关联。`;
        }
      }
    } catch { /* ignore */ }

    // 注入多维景气数据
    if (multidimSummary) {
      hint += '\n\n' + multidimSummary;
    }

    // 更新推荐问题
    setSuggestedQuestions(getSuggestedQuestions(pageContext.page, pageContext.stockName));

    return { ...pageContext, systemHint: hint };
  }, [pageContext, marketData, multidimSummary]);

  return (
    <>
      {/* 浮动按钮 */}
      {!open && (
        <div
          onClick={() => setOpen(true)}
          title="AI助手 — 随时提问"
          style={{
            position: 'fixed', bottom: 72, right: 24, zIndex: 1001,
            width: 52, height: 52, borderRadius: 26,
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', boxShadow: '0 4px 20px rgba(102,126,234,0.5)',
            transition: 'all 0.3s',
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.08)'; }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
        >
          <MessageOutlined style={{ color: '#fff', fontSize: 24 }} />
        </div>
      )}

      {/* 对话面板 */}
      {open && (
        <div style={{
          position: 'fixed', bottom: 20, right: 20, zIndex: 1002,
          width: 420, height: 600, maxHeight: 'calc(100vh - 100px)',
          borderRadius: 16, overflow: 'hidden',
          background: 'var(--bg-elevated, #1a2332)',
          boxShadow: '0 12px 48px rgba(0,0,0,0.4)',
          border: '1px solid var(--border, #334155)',
          display: 'flex', flexDirection: 'column',
        }}>
          {/* Header */}
          <div style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--border, #334155)',
            background: 'var(--bg-surface, #0f172a)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 28, height: 28, borderRadius: 14,
                background: 'linear-gradient(135deg, #667eea, #764ba2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <BulbOutlined style={{ color: '#fff', fontSize: 14 }} />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>澄观 AI</div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                  {enrichedContext.pageName} · 随时提问
                </div>
              </div>
            </div>
            <div onClick={() => setOpen(false)} style={{
              width: 28, height: 28, borderRadius: 14, cursor: 'pointer',
              background: 'rgba(255,255,255,0.06)', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <CloseOutlined style={{ color: '#94a3b8', fontSize: 12 }} />
            </div>
          </div>

          {/* ChatPanel */}
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <ChatPanel
              pageContext={enrichedContext}
              suggestedQuestions={suggestedQuestions}
            />
          </div>
        </div>
      )}

      {/* 移动端全屏 */}
      <style>{`
        @media (max-width: 768px) {
          .floating-chat-panel {
            width: 100vw !important; height: 100vh !important;
            bottom: 0 !important; right: 0 !important;
            border-radius: 0 !important; max-height: 100vh !important;
          }
        }
      `}</style>
    </>
  );
};

export default React.memo(FloatingChat);
