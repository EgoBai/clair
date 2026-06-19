/**
 * FloatingChat — 浮动AI对话入口（上下文感知版）
 * 
 * 根据当前页面自动调整AI上下文：
 * - 发掘页：市场概览模式
 * - 筛选页：选股助手模式
 * - 个股页：个股诊断模式
 * - 自选页：组合追踪模式
 * - 复盘页：复盘分析模式
 */

import React, { useState, useMemo } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { MessageOutlined, CloseOutlined } from '@ant-design/icons';
import ChatPanel from './ChatPanel';

/** 页面上下文信息 */
interface PageContext {
  page: string;
  pageName: string;
  symbol?: string;
  stockName?: string;
  systemHint: string;
  symbols?: string[]; // 自选股列表
}

const PAGE_CONTEXT_MAP: Record<string, Omit<PageContext, 'symbol' | 'stockName'>> = {
  '/': {
    page: 'discover',
    pageName: '发掘',
    systemHint: '用户正在浏览市场概览页面。你可以提供：市场情绪分析、板块轮动解读、资金流向研判、今日热点解读。',
  },
  '/screener': {
    page: 'screener',
    pageName: '筛选',
    systemHint: '用户正在使用选股筛选器。你可以提供：筛选条件建议、策略解读、行业分析、估值判断。',
  },
  '/watchlist': {
    page: 'watchlist',
    pageName: '自选',
    systemHint: '用户正在查看自选股追踪列表。你可以提供：个股对比分析、组合风险评估、调仓建议、异动解读。',
  },
  '/review': {
    page: 'review',
    pageName: '复盘',
    systemHint: '用户正在复盘交易记录。你可以提供：交易行为分析、盈亏归因、策略改进建议、风控优化。',
  },
  '/industry-map': {
    page: 'industry-map',
    pageName: '产业地图',
    systemHint: '用户正在查看产业链图谱。你可以提供：产业链上下游分析、环节景气度判断、龙头公司对比、产业趋势解读。',
  },
};

const STOCK_DETAIL_PATTERN = /^\/stocks\/(\d{6})/;

const FloatingChat: React.FC = () => {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const params = useParams();

  // 计算当前页面上下文
  const pageContext: PageContext = useMemo(() => {
    const pathname = location.pathname;

    // 个股详情页
    const stockMatch = pathname.match(STOCK_DETAIL_PATTERN);
    if (stockMatch) {
      const symbol = stockMatch[1];
      return {
        page: 'stock-detail',
        pageName: '个股详情',
        symbol,
        systemHint: `用户正在查看股票 ${symbol} 的详情页面。你可以提供：该股票的技术面分析、基本面解读、估值判断、买卖信号、风险提示。如果用户问到具体股票，直接引用页面数据。`,
      };
    }

    // 其他页面
    const base = PAGE_CONTEXT_MAP[pathname];
    if (base) return base;

    // 默认
    return {
      page: 'other',
      pageName: '其他',
      systemHint: '用户正在浏览澄观。根据用户问题提供专业的A股投资研究分析。',
    };
  }, [location.pathname]);

  // 注入自选股上下文
  const enrichedContext = useMemo(() => {
    try {
      const raw = localStorage.getItem('astock_watchlist_v2');
      if (!raw) return pageContext;
      const groups = JSON.parse(raw);
      const allStocks = groups.flatMap((g: any) => g.stocks || []);
      if (allStocks.length === 0) return pageContext;
      const symbols = allStocks.map((s: any) => s.symbol);
      const names = allStocks.map((s: any) => s.name).join('、');
      return {
        ...pageContext,
        systemHint: pageContext.systemHint + `\n\n用户的关注的自选股: ${names}。回答时可主动关联自选股。`,
        symbols,
      };
    } catch { return pageContext; }
  }, [pageContext]);

  return (
    <>
      {/* 浮动按钮 */}
      {!open && (
        <div
          onClick={() => setOpen(true)}
          style={{
            position: 'fixed',
            bottom: 72,
            right: 24,
            zIndex: 1001,
            width: 48,
            height: 48,
            borderRadius: 24,
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: '0 4px 16px rgba(102, 126, 234, 0.4)',
            transition: 'all 0.3s ease',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'scale(1.1)';
            e.currentTarget.style.boxShadow = '0 6px 20px rgba(102, 126, 234, 0.5)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = '0 4px 16px rgba(102, 126, 234, 0.4)';
          }}
        >
          <MessageOutlined style={{ color: '#fff', fontSize: 22 }} />
        </div>
      )}

      {/* 对话面板 */}
      {open && (
        <div style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          zIndex: 1002,
          width: 400,
          height: 560,
          borderRadius: 16,
          overflow: 'hidden',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
          border: '1px solid #334155',
          display: 'flex',
          flexDirection: 'column',
        }}>
          {/* 关闭按钮 */}
          <div
            onClick={() => setOpen(false)}
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              zIndex: 10,
              width: 28,
              height: 28,
              borderRadius: 14,
              background: 'rgba(255,255,255,0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <CloseOutlined style={{ color: '#94a3b8', fontSize: 12 }} />
          </div>

          {/* ChatPanel 嵌入 — 传入页面上下文 */}
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <ChatPanel pageContext={enrichedContext} />
          </div>
        </div>
      )}

      {/* 移动端适配 */}
      <style>{`
        @media (max-width: 768px) {
          .floating-chat-panel {
            width: calc(100vw - 32px) !important;
            height: calc(100vh - 120px) !important;
            bottom: 16px !important;
            right: 16px !important;
          }
        }
      `}</style>
    </>
  );
};

export default React.memo(FloatingChat);
