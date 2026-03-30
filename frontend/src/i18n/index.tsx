/**
 * i18n 国际化框架
 * 支持中文/英文切换
 * 数字、日期格式本地化
 */

import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import dayjs from 'dayjs';

// ==================== 翻译资源 ====================

export type Locale = 'zh-CN' | 'en-US' | 'ja-JP' | 'ko-KR';

export interface I18nMessages {
  [key: string]: string | I18nMessages;
}

const zhCN: I18nMessages = {
  common: {
    search: '搜索',
    loading: '加载中...',
    noData: '暂无数据',
    confirm: '确定',
    cancel: '取消',
    save: '保存',
    delete: '删除',
    edit: '编辑',
    refresh: '刷新',
    export: '导出',
    more: '更多',
    back: '返回',
    settings: '设置',
    error: '错误',
    success: '成功',
    warning: '警告',
  },
  nav: {
    home: '首页',
    stocks: '股票',
    market: '行情',
    watchlist: '自选股',
    screener: '选股器',
    advancedScreener: '高级选股',
    alerts: '预警',
    analysis: '分析',
    heatmap: '热力图',
    compare: '对比',
  },
  home: {
    title: 'A股行情分析',
    marketOverview: '市场概况',
    topGainers: '涨幅榜',
    topLosers: '跌幅榜',
    topTurnover: '成交额榜',
    risingStocks: '上涨',
    fallingStocks: '下跌',
    unchangedStocks: '平盘',
    totalMarketCap: '总市值',
    totalTurnover: '总成交额',
  },
  stock: {
    code: '代码',
    name: '名称',
    price: '最新价',
    change: '涨跌额',
    changePercent: '涨跌幅',
    volume: '成交量',
    turnover: '成交额',
    turnoverRate: '换手率',
    amplitude: '振幅',
    high: '最高',
    low: '最低',
    open: '开盘',
    close: '收盘',
    peRatio: '市盈率',
    pbRatio: '市净率',
    marketCap: '总市值',
    circulatingMarketCap: '流通市值',
    industry: '行业',
    market: '市场',
    detail: '详情',
    kline: 'K线',
    timeline: '分时',
    indicators: '指标',
    fundFlow: '资金流向',
  },
  screener: {
    title: '选股器',
    conditions: '筛选条件',
    addCondition: '添加条件',
    addGroup: '添加组',
    execute: '执行',
    results: '筛选结果',
    presets: '预设模板',
    customTemplates: '自定义模板',
    saveTemplate: '保存模板',
    templateName: '模板名称',
    logic: {
      and: '且',
      or: '或',
    },
    operators: {
      gt: '大于',
      gte: '大于等于',
      lt: '小于',
      lte: '小于等于',
      eq: '等于',
      between: '介于',
    },
  },
  watchlist: {
    title: '自选股',
    add: '添加股票',
    remove: '移除',
    createGroup: '新建分组',
    defaultGroup: '默认分组',
    empty: '自选股列表为空',
    addHint: '点击右上角添加股票到自选股',
  },
  alerts: {
    title: '预警管理',
    create: '创建预警',
    priceAbove: '价格高于',
    priceBelow: '价格低于',
    changeAbove: '涨幅超过',
    changeBelow: '跌幅超过',
    volumeSurge: '成交量异动',
    active: '活跃',
    triggered: '已触发',
    history: '预警历史',
  },
  theme: {
    light: '浅色',
    dark: '深色',
    system: '跟随系统',
  },
  shortcuts: {
    title: '快捷键',
    search: '聚焦搜索',
    navigate: '快速导航',
    theme: '切换主题',
    back: '返回上一页',
  },
  chart: {
    kline: 'K线图',
    timeline: '分时图',
    macd: 'MACD',
    kdj: 'KDJ',
    rsi: 'RSI',
    boll: '布林带',
    volume: '成交量',
    ma: '均线',
  },
};

const enUS: I18nMessages = {
  common: {
    search: 'Search',
    loading: 'Loading...',
    noData: 'No data',
    confirm: 'Confirm',
    cancel: 'Cancel',
    save: 'Save',
    delete: 'Delete',
    edit: 'Edit',
    refresh: 'Refresh',
    export: 'Export',
    more: 'More',
    back: 'Back',
    settings: 'Settings',
    error: 'Error',
    success: 'Success',
    warning: 'Warning',
  },
  nav: {
    home: 'Home',
    stocks: 'Stocks',
    market: 'Market',
    watchlist: 'Watchlist',
    screener: 'Screener',
    advancedScreener: 'Advanced',
    alerts: 'Alerts',
    analysis: 'Analysis',
    heatmap: 'Heatmap',
    compare: 'Compare',
  },
  home: {
    title: 'A-Share Market Analysis',
    marketOverview: 'Market Overview',
    topGainers: 'Top Gainers',
    topLosers: 'Top Losers',
    topTurnover: 'Top Turnover',
    risingStocks: 'Rising',
    fallingStocks: 'Falling',
    unchangedStocks: 'Unchanged',
    totalMarketCap: 'Total Market Cap',
    totalTurnover: 'Total Turnover',
  },
  stock: {
    code: 'Code',
    name: 'Name',
    price: 'Price',
    change: 'Change',
    changePercent: 'Change %',
    volume: 'Volume',
    turnover: 'Turnover',
    turnoverRate: 'Turnover Rate',
    amplitude: 'Amplitude',
    high: 'High',
    low: 'Low',
    open: 'Open',
    close: 'Close',
    peRatio: 'P/E Ratio',
    pbRatio: 'P/B Ratio',
    marketCap: 'Market Cap',
    circulatingMarketCap: 'Float Cap',
    industry: 'Industry',
    market: 'Market',
    detail: 'Detail',
    kline: 'K-Line',
    timeline: 'Timeline',
    indicators: 'Indicators',
    fundFlow: 'Fund Flow',
  },
  screener: {
    title: 'Stock Screener',
    conditions: 'Filter Conditions',
    addCondition: 'Add Condition',
    addGroup: 'Add Group',
    execute: 'Run',
    results: 'Results',
    presets: 'Presets',
    customTemplates: 'Custom',
    saveTemplate: 'Save Template',
    templateName: 'Template Name',
    logic: {
      and: 'AND',
      or: 'OR',
    },
    operators: {
      gt: 'Greater than',
      gte: 'Greater or equal',
      lt: 'Less than',
      lte: 'Less or equal',
      eq: 'Equal',
      between: 'Between',
    },
  },
  watchlist: {
    title: 'Watchlist',
    add: 'Add Stock',
    remove: 'Remove',
    createGroup: 'New Group',
    defaultGroup: 'Default',
    empty: 'Watchlist is empty',
    addHint: 'Click the button above to add stocks',
  },
  alerts: {
    title: 'Price Alerts',
    create: 'Create Alert',
    priceAbove: 'Price Above',
    priceBelow: 'Price Below',
    changeAbove: 'Change Above',
    changeBelow: 'Change Below',
    volumeSurge: 'Volume Surge',
    active: 'Active',
    triggered: 'Triggered',
    history: 'Alert History',
  },
  theme: {
    light: 'Light',
    dark: 'Dark',
    system: 'System',
  },
  shortcuts: {
    title: 'Keyboard Shortcuts',
    search: 'Focus Search',
    navigate: 'Quick Navigate',
    theme: 'Toggle Theme',
    back: 'Go Back',
  },
  chart: {
    kline: 'K-Line',
    timeline: 'Timeline',
    macd: 'MACD',
    kdj: 'KDJ',
    rsi: 'RSI',
    boll: 'Bollinger',
    volume: 'Volume',
    ma: 'Moving Average',
  },
};

const jaJP: I18nMessages = {
  common: {
    search: '検索',
    loading: '読み込み中...',
    noData: 'データなし',
    confirm: '確認',
    cancel: 'キャンセル',
    save: '保存',
    delete: '削除',
    edit: '編集',
    refresh: '更新',
    export: 'エクスポート',
    more: 'もっと見る',
    back: '戻る',
    settings: '設定',
    error: 'エラー',
    success: '成功',
    warning: '警告',
  },
  nav: {
    home: 'ホーム',
    stocks: '株式',
    market: '市場',
    watchlist: 'ウォッチリスト',
    screener: 'スクリーナー',
    advancedScreener: '高度なスクリーナー',
    alerts: 'アラート',
    analysis: '分析',
    heatmap: 'ヒートマップ',
    compare: '比較',
  },
  home: {
    title: 'A株市場分析',
    marketOverview: '市場概況',
    topGainers: '上昇ランキング',
    topLosers: '下落ランキング',
    topTurnover: '出来高ランキング',
    risingStocks: '上昇',
    fallingStocks: '下落',
    unchangedStocks: '変動なし',
    totalMarketCap: '時価総額',
    totalTurnover: '総出来高',
  },
  stock: {
    code: 'コード',
    name: '名称',
    price: '現在値',
    change: '変動',
    changePercent: '変動率',
    volume: '出来高',
    turnover: '取引高',
    turnoverRate: '回転率',
    amplitude: '振幅',
    high: '高値',
    low: '安値',
    open: '始値',
    close: '終値',
    peRatio: 'PER',
    pbRatio: 'PBR',
    marketCap: '時価総額',
    circulatingMarketCap: '流通時価総額',
    industry: '業種',
    market: '市場',
    detail: '詳細',
    kline: 'ローソク足',
    timeline: 'タイムライン',
    indicators: '指標',
    fundFlow: '資金フロー',
  },
  screener: {
    title: '株式スクリーナー',
    conditions: 'フィルター条件',
    addCondition: '条件を追加',
    addGroup: 'グループを追加',
    execute: '実行',
    results: '結果',
    presets: 'プリセット',
    customTemplates: 'カスタム',
    saveTemplate: 'テンプレート保存',
    templateName: 'テンプレート名',
    logic: {
      and: 'かつ',
      or: 'または',
    },
    operators: {
      gt: 'より大きい',
      gte: '以上',
      lt: 'より小さい',
      lte: '以下',
      eq: '等しい',
      between: '範囲内',
    },
  },
  watchlist: {
    title: 'ウォッチリスト',
    add: '銘柄を追加',
    remove: '削除',
    createGroup: '新規グループ',
    defaultGroup: 'デフォルト',
    empty: 'ウォッチリストは空です',
    addHint: '右上のボタンで銘柄を追加',
  },
  alerts: {
    title: 'アラート管理',
    create: 'アラート作成',
    priceAbove: '価格以上',
    priceBelow: '価格以下',
    changeAbove: '上昇率以上',
    changeBelow: '下落率以上',
    volumeSurge: '出来高急増',
    active: 'アクティブ',
    triggered: '発動済み',
    history: 'アラート履歴',
  },
  theme: {
    light: 'ライト',
    dark: 'ダーク',
    system: 'システム',
  },
  shortcuts: {
    title: 'キーボードショートカット',
    search: '検索にフォーカス',
    navigate: 'クイックナビゲーション',
    theme: 'テーマ切替',
    back: '前のページに戻る',
  },
  chart: {
    kline: 'ローソク足チャート',
    timeline: 'タイムチャート',
    macd: 'MACD',
    kdj: 'KDJ',
    rsi: 'RSI',
    boll: 'ボリンジャーバンド',
    volume: '出来高',
    ma: '移動平均線',
  },
};

const koKR: I18nMessages = {
  common: {
    search: '검색',
    loading: '로딩 중...',
    noData: '데이터 없음',
    confirm: '확인',
    cancel: '취소',
    save: '저장',
    delete: '삭제',
    edit: '편집',
    refresh: '새로고침',
    export: '내보내기',
    more: '더보기',
    back: '뒤로',
    settings: '설정',
    error: '오류',
    success: '성공',
    warning: '경고',
  },
  nav: {
    home: '홈',
    stocks: '주식',
    market: '시장',
    watchlist: '관심목록',
    screener: '스크리너',
    advancedScreener: '고급 스크리너',
    alerts: '알림',
    analysis: '분석',
    heatmap: '히트맵',
    compare: '비교',
  },
  home: {
    title: 'A주 시장 분석',
    marketOverview: '시장 개요',
    topGainers: '상승 랭킹',
    topLosers: '하락 랭킹',
    topTurnover: '거래대금 랭킹',
    risingStocks: '상승',
    fallingStocks: '하락',
    unchangedStocks: '보합',
    totalMarketCap: '시가총액',
    totalTurnover: '총 거래대금',
  },
  stock: {
    code: '코드',
    name: '종목명',
    price: '현재가',
    change: '변동',
    changePercent: '변동률',
    volume: '거래량',
    turnover: '거래대금',
    turnoverRate: '회전율',
    amplitude: '진폭',
    high: '고가',
    low: '저가',
    open: '시가',
    close: '종가',
    peRatio: 'PER',
    pbRatio: 'PBR',
    marketCap: '시가총액',
    circulatingMarketCap: '유통시가총액',
    industry: '업종',
    market: '시장',
    detail: '상세',
    kline: '캔들차트',
    timeline: '분봉',
    indicators: '지표',
    fundFlow: '자금흐름',
  },
  screener: {
    title: '주식 스크리너',
    conditions: '필터 조건',
    addCondition: '조건 추가',
    addGroup: '그룹 추가',
    execute: '실행',
    results: '결과',
    presets: '프리셋',
    customTemplates: '사용자 정의',
    saveTemplate: '템플릿 저장',
    templateName: '템플릿 이름',
    logic: {
      and: '그리고',
      or: '또는',
    },
    operators: {
      gt: '초과',
      gte: '이상',
      lt: '미만',
      lte: '이하',
      eq: '같음',
      between: '범위 내',
    },
  },
  watchlist: {
    title: '관심목록',
    add: '종목 추가',
    remove: '제거',
    createGroup: '새 그룹',
    defaultGroup: '기본',
    empty: '관심목록이 비어있습니다',
    addHint: '우상단 버튼으로 종목을 추가하세요',
  },
  alerts: {
    title: '알림 관리',
    create: '알림 생성',
    priceAbove: '가격 이상',
    priceBelow: '가격 이하',
    changeAbove: '상승률 이상',
    changeBelow: '하락률 이상',
    volumeSurge: '거래량 급증',
    active: '활성',
    triggered: '발동됨',
    history: '알림 이력',
  },
  theme: {
    light: '라이트',
    dark: '다크',
    system: '시스템',
  },
  shortcuts: {
    title: '키보드 단축키',
    search: '검색 포커스',
    navigate: '빠른 이동',
    theme: '테마 전환',
    back: '이전 페이지',
  },
  chart: {
    kline: '캔들차트',
    timeline: '분봉차트',
    macd: 'MACD',
    kdj: 'KDJ',
    rsi: 'RSI',
    boll: '볼린저밴드',
    volume: '거래량',
    ma: '이동평균선',
  },
};

const messages: Record<Locale, I18nMessages> = {
  'zh-CN': zhCN,
  'en-US': enUS,
  'ja-JP': jaJP,
  'ko-KR': koKR,
};

// ==================== 数字/日期格式化 ====================

export const formatters = {
  number: (value: number, locale: Locale): string => {
    const localeMap: Record<Locale, string> = {
      'zh-CN': 'zh-CN',
      'en-US': 'en-US',
      'ja-JP': 'ja-JP',
      'ko-KR': 'ko-KR',
    };
    return value.toLocaleString(localeMap[locale] || 'en-US');
  },

  currency: (value: number, locale: Locale): string => {
    if (locale === 'zh-CN') {
      if (value >= 1e12) return `${(value / 1e12).toFixed(2)}万亿`;
      if (value >= 1e8) return `${(value / 1e8).toFixed(2)}亿`;
      if (value >= 1e4) return `${(value / 1e4).toFixed(2)}万`;
      return value.toFixed(2);
    }
    if (locale === 'ja-JP') {
      if (value >= 1e12) return `${(value / 1e12).toFixed(2)}兆`;
      if (value >= 1e8) return `${(value / 1e8).toFixed(2)}億`;
      if (value >= 1e4) return `${(value / 1e4).toFixed(2)}万`;
      return `¥${value.toLocaleString('ja-JP', { minimumFractionDigits: 2 })}`;
    }
    if (locale === 'ko-KR') {
      if (value >= 1e12) return `${(value / 1e12).toFixed(2)}조`;
      if (value >= 1e8) return `${(value / 1e8).toFixed(2)}억`;
      return `₩${value.toLocaleString('ko-KR', { minimumFractionDigits: 2 })}`;
    }
    if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
    if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
    if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
    return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
  },

  percent: (value: number, _locale: Locale): string => {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}%`;
  },

  date: (value: string | Date, locale: Locale): string => {
    const d = typeof value === 'string' ? new Date(value) : value;
    if (locale === 'zh-CN') {
      return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
    }
    if (locale === 'ja-JP') {
      return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
    }
    if (locale === 'ko-KR') {
      return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
    }
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  },

  time: (value: string | Date, locale: Locale): string => {
    const d = typeof value === 'string' ? new Date(value) : value;
    const hh = d.getHours().toString().padStart(2, '0');
    const mm = d.getMinutes().toString().padStart(2, '0');
    if (locale === 'zh-CN' || locale === 'ja-JP' || locale === 'ko-KR') {
      return `${hh}:${mm}`;
    }
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  },

  volume: (value: number, locale: Locale): string => {
    if (locale === 'zh-CN') {
      if (value >= 1e8) return `${(value / 1e8).toFixed(2)}亿手`;
      if (value >= 1e4) return `${(value / 1e4).toFixed(2)}万手`;
      return `${value}手`;
    }
    if (locale === 'ja-JP') {
      if (value >= 1e8) return `${(value / 1e8).toFixed(2)}億株`;
      if (value >= 1e4) return `${(value / 1e4).toFixed(2)}万株`;
      return `${value}株`;
    }
    if (locale === 'ko-KR') {
      if (value >= 1e8) return `${(value / 1e8).toFixed(2)}억주`;
      if (value >= 1e4) return `${(value / 1e4).toFixed(2)}만주`;
      return `${value}주`;
    }
    if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
    if (value >= 1e3) return `${(value / 1e3).toFixed(2)}K`;
    return value.toLocaleString('en-US');
  },
};

// ==================== Context ====================

interface I18nContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, params?: Record<string, string>) => string;
  format: typeof formatters;
}

const I18nContext = createContext<I18nContextType | null>(null);

/**
 * 从嵌套对象中获取翻译
 */
function getNestedValue(obj: I18nMessages, path: string): string {
  const keys = path.split('.');
  let current: any = obj;
  for (const key of keys) {
    if (current && typeof current === 'object' && key in current) {
      current = current[key];
    } else {
      return path; // 返回原始 key 作为 fallback
    }
  }
  return typeof current === 'string' ? current : path;
}

interface I18nProviderProps {
  children: ReactNode;
  defaultLocale?: Locale;
}

export function I18nProvider({ children, defaultLocale = 'zh-CN' }: I18nProviderProps) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const saved = localStorage.getItem('locale') as Locale;
    return saved || defaultLocale;
  });

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    localStorage.setItem('locale', newLocale);
    document.documentElement.lang = newLocale;
  }, []);

  const t = useCallback((key: string, params?: Record<string, string>): string => {
    let result = getNestedValue(messages[locale], key);
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        result = result.replace(new RegExp(`{{${k}}}`, 'g'), v);
      });
    }
    return result;
  }, [locale]);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return (
    <I18nContext.Provider value={{ locale, setLocale, t, format: formatters }}>
      {children}
    </I18nContext.Provider>
  );
}

/**
 * 使用国际化
 */
export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within I18nProvider');
  }
  return context;
}

/**
 * 快捷翻译函数 (无 Context 版本)
 */
export function createTranslator(locale: Locale) {
  return (key: string, params?: Record<string, string>): string => {
    let result = getNestedValue(messages[locale], key);
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        result = result.replace(new RegExp(`{{${k}}}`, 'g'), v);
      });
    }
    return result;
  };
}

export default I18nProvider;
