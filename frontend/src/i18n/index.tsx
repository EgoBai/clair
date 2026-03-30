/**
 * i18n 国际化框架
 * 支持中文/英文切换
 * 数字、日期格式本地化
 */

import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import dayjs from 'dayjs';

// ==================== 翻译资源 ====================

export type Locale = 'zh-CN' | 'en-US';

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

const messages: Record<Locale, I18nMessages> = {
  'zh-CN': zhCN,
  'en-US': enUS,
};

// ==================== 数字/日期格式化 ====================

export const formatters = {
  number: (value: number, locale: Locale): string => {
    return value.toLocaleString(locale === 'zh-CN' ? 'zh-CN' : 'en-US');
  },

  currency: (value: number, locale: Locale): string => {
    if (locale === 'zh-CN') {
      if (value >= 1e12) return `${(value / 1e12).toFixed(2)}万亿`;
      if (value >= 1e8) return `${(value / 1e8).toFixed(2)}亿`;
      if (value >= 1e4) return `${(value / 1e4).toFixed(2)}万`;
      return value.toFixed(2);
    }
    if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
    if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
    if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
    return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
  },

  percent: (value: number, locale: Locale): string => {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}%`;
  },

  date: (value: string | Date, locale: Locale): string => {
    const d = typeof value === 'string' ? new Date(value) : value;
    if (locale === 'zh-CN') {
      return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
    }
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  },

  time: (value: string | Date, locale: Locale): string => {
    const d = typeof value === 'string' ? new Date(value) : value;
    if (locale === 'zh-CN') {
      return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    }
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  },

  volume: (value: number, locale: Locale): string => {
    if (locale === 'zh-CN') {
      if (value >= 1e8) return `${(value / 1e8).toFixed(2)}亿手`;
      if (value >= 1e4) return `${(value / 1e4).toFixed(2)}万手`;
      return `${value}手`;
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
