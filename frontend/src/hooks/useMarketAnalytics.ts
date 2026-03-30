import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  analyzeMarket,
  calculateCompositeScore,
  generateMarketSignal,
  generateSectorRecommendations,
  calculateRiskLevel,
  determineMarketTrend,
  detectSectorRotation,
  calculateMarketConcentration,
  calculateMomentumAcceleration,
  detectMarketAnomalies,
  type MarketAnalyticsConfig,
  type MarketOverview,
  type MarketSignal,
  type SectorRecommendation,
  type BreadthData,
  type CapitalFlowData,
  type NorthboundData,
  type SectorMomentumData,
  type SentimentData,
  type ValuationData,
} from '../utils/marketAnalytics';

// ==================== Hook类型 ====================

export interface UseMarketAnalyticsOptions {
  autoRefresh?: boolean;
  refreshInterval?: number; // ms
  config?: Partial<MarketAnalyticsConfig>;
  onSignalChange?: (signal: MarketSignal) => void;
  onAnomaly?: (anomaly: { type: string; severity: string; message: string }) => void;
}

export interface UseMarketAnalyticsReturn {
  // 状态
  overview: MarketOverview | null;
  signal: MarketSignal | null;
  loading: boolean;
  error: string | null;
  lastUpdated: number | null;

  // 数据更新
  updateBreadth: (data: BreadthData) => void;
  updateCapitalFlow: (data: CapitalFlowData) => void;
  updateNorthbound: (data: NorthboundData) => void;
  updateSectors: (data: SectorMomentumData[]) => void;
  updateSentiment: (data: SentimentData) => void;
  updateValuations: (data: ValuationData[]) => void;
  updateAll: (params: {
    breadth: BreadthData;
    capitalFlow: CapitalFlowData;
    northbound: NorthboundData;
    sectors: SectorMomentumData[];
    sentiment: SentimentData;
    valuations: ValuationData[];
    volatility?: number;
  }) => void;

  // 分析结果
  compositeScore: number | null;
  riskLevel: 'low' | 'medium' | 'high' | null;
  trend: 'up' | 'down' | 'sideways' | null;
  sectorRecommendations: SectorRecommendation[];
  rotationSignals: ReturnType<typeof detectSectorRotation>;
  marketConcentration: ReturnType<typeof calculateMarketConcentration> | null;
  momentumAcceleration: ReturnType<typeof calculateMomentumAcceleration>;
  anomalies: ReturnType<typeof detectMarketAnomalies>;

  // 操作
  refresh: () => void;
  reset: () => void;
}

const DEFAULT_REFRESH_INTERVAL = 30000; // 30秒

// ==================== Hook实现 ====================

export function useMarketAnalytics(
  options: UseMarketAnalyticsOptions = {},
): UseMarketAnalyticsReturn {
  const {
    autoRefresh = false,
    refreshInterval = DEFAULT_REFRESH_INTERVAL,
    config,
    onSignalChange,
    onAnomaly,
  } = options;

  // 状态
  const [breadth, setBreadth] = useState<BreadthData | null>(null);
  const [capitalFlow, setCapitalFlow] = useState<CapitalFlowData | null>(null);
  const [northbound, setNorthbound] = useState<NorthboundData | null>(null);
  const [sectors, setSectors] = useState<SectorMomentumData[]>([]);
  const [sentiment, setSentiment] = useState<SentimentData | null>(null);
  const [valuations, setValuations] = useState<ValuationData[]>([]);
  const [volatility, setVolatility] = useState<number>(20);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  // 引用
  const prevSignalRef = useRef<MarketSignal | null>(null);
  const prevSectorsRef = useRef<SectorMomentumData[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 计算配置
  const analyticsConfig = useMemo<MarketAnalyticsConfig>(() => ({
    weights: {
      breadth: 0.20,
      capitalFlow: 0.20,
      northbound: 0.15,
      sectorMomentum: 0.20,
      sentiment: 0.15,
      valuation: 0.10,
      ...config?.weights,
    },
    thresholds: {
      bullish: 65,
      bearish: 35,
      volatility: 30,
      ...config?.thresholds,
    },
    lookbackDays: config?.lookbackDays ?? 20,
  }), [config]);

  // 完整数据检查
  const hasAllData = useMemo(() => {
    return breadth !== null
      && capitalFlow !== null
      && northbound !== null
      && sectors.length > 0
      && sentiment !== null;
  }, [breadth, capitalFlow, northbound, sectors, sentiment]);

  // 综合分析结果
  const analysisResult = useMemo(() => {
    if (!hasAllData || !breadth || !capitalFlow || !northbound || !sentiment) {
      return null;
    }
    try {
      return analyzeMarket(
        breadth, capitalFlow, northbound, sectors, sentiment, valuations, volatility, analyticsConfig,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : '分析计算失败');
      return null;
    }
  }, [hasAllData, breadth, capitalFlow, northbound, sectors, sentiment, valuations, volatility, analyticsConfig]);

  // 综合评分
  const compositeScore = useMemo(() => {
    if (!hasAllData || !breadth || !capitalFlow || !northbound || !sentiment) return null;
    return calculateCompositeScore(
      breadth, capitalFlow, northbound, sectors, sentiment, valuations, analyticsConfig,
    );
  }, [hasAllData, breadth, capitalFlow, northbound, sectors, sentiment, valuations, analyticsConfig]);

  // 市场信号
  const signal = useMemo(() => {
    if (compositeScore === null) return null;
    return generateMarketSignal(compositeScore, analyticsConfig);
  }, [compositeScore, analyticsConfig]);

  // 风险等级
  const riskLevel = useMemo(() => {
    if (!breadth || !sentiment) return null;
    return calculateRiskLevel(breadth, sentiment, volatility, analyticsConfig);
  }, [breadth, sentiment, volatility, analyticsConfig]);

  // 市场趋势
  const trend = useMemo(() => {
    if (!breadth || sectors.length === 0) return null;
    return determineMarketTrend(breadth, sectors);
  }, [breadth, sectors]);

  // 板块推荐
  const sectorRecommendations = useMemo(() => {
    if (sectors.length === 0 || !capitalFlow || !northbound) return [];
    return generateSectorRecommendations(
      sectors, capitalFlow.sectorFlows, northbound.sectorExposure, valuations,
    );
  }, [sectors, capitalFlow, northbound, valuations]);

  // 板块轮动信号
  const rotationSignals = useMemo(() => {
    if (sectors.length === 0 || prevSectorsRef.current.length === 0) return [];
    return detectSectorRotation(sectors, prevSectorsRef.current);
  }, [sectors]);

  // 市场集中度
  const marketConcentration = useMemo(() => {
    if (sectors.length === 0 || !capitalFlow) return null;
    return calculateMarketConcentration(sectors, capitalFlow.sectorFlows);
  }, [sectors, capitalFlow]);

  // 动量加速度
  const momentumAcceleration = useMemo(() => {
    if (sectors.length === 0) return [];
    return calculateMomentumAcceleration(sectors);
  }, [sectors]);

  // 异常检测
  const anomalies = useMemo(() => {
    if (!breadth || !sentiment || !capitalFlow) return [];
    return detectMarketAnomalies(breadth, sentiment, capitalFlow);
  }, [breadth, sentiment, capitalFlow]);

  // 信号变化回调
  useEffect(() => {
    if (signal && prevSignalRef.current && signal.type !== prevSignalRef.current.type) {
      onSignalChange?.(signal);
    }
    prevSignalRef.current = signal;
  }, [signal, onSignalChange]);

  // 异常回调
  useEffect(() => {
    anomalies.filter(a => a.severity === 'critical').forEach(a => onAnomaly?.(a));
  }, [anomalies, onAnomaly]);

  // 更新前一次板块数据
  useEffect(() => {
    if (sectors.length > 0) {
      prevSectorsRef.current = sectors;
    }
  }, [sectors]);

  // 自动刷新
  useEffect(() => {
    if (autoRefresh && refreshInterval > 0) {
      intervalRef.current = setInterval(() => {
        setLastUpdated(Date.now());
      }, refreshInterval);
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [autoRefresh, refreshInterval]);

  // 更新方法
  const updateBreadth = useCallback((data: BreadthData) => {
    setBreadth(data);
    setLastUpdated(Date.now());
    setError(null);
  }, []);

  const updateCapitalFlow = useCallback((data: CapitalFlowData) => {
    setCapitalFlow(data);
    setLastUpdated(Date.now());
    setError(null);
  }, []);

  const updateNorthbound = useCallback((data: NorthboundData) => {
    setNorthbound(data);
    setLastUpdated(Date.now());
    setError(null);
  }, []);

  const updateSectors = useCallback((data: SectorMomentumData[]) => {
    setSectors(data);
    setLastUpdated(Date.now());
    setError(null);
  }, []);

  const updateSentiment = useCallback((data: SentimentData) => {
    setSentiment(data);
    setLastUpdated(Date.now());
    setError(null);
  }, []);

  const updateValuations = useCallback((data: ValuationData[]) => {
    setValuations(data);
    setLastUpdated(Date.now());
    setError(null);
  }, []);

  const updateAll = useCallback((params: {
    breadth: BreadthData;
    capitalFlow: CapitalFlowData;
    northbound: NorthboundData;
    sectors: SectorMomentumData[];
    sentiment: SentimentData;
    valuations: ValuationData[];
    volatility?: number;
  }) => {
    setBreadth(params.breadth);
    setCapitalFlow(params.capitalFlow);
    setNorthbound(params.northbound);
    setSectors(params.sectors);
    setSentiment(params.sentiment);
    setValuations(params.valuations);
    if (params.volatility !== undefined) setVolatility(params.volatility);
    setLastUpdated(Date.now());
    setError(null);
  }, []);

  const refresh = useCallback(() => {
    setLoading(true);
    setLastUpdated(Date.now());
    setTimeout(() => setLoading(false), 100);
  }, []);

  const reset = useCallback(() => {
    setBreadth(null);
    setCapitalFlow(null);
    setNorthbound(null);
    setSectors([]);
    setSentiment(null);
    setValuations([]);
    setVolatility(20);
    setLoading(false);
    setError(null);
    setLastUpdated(null);
    prevSignalRef.current = null;
    prevSectorsRef.current = [];
  }, []);

  return {
    overview: analysisResult,
    signal,
    loading,
    error,
    lastUpdated,
    updateBreadth,
    updateCapitalFlow,
    updateNorthbound,
    updateSectors,
    updateSentiment,
    updateValuations,
    updateAll,
    compositeScore,
    riskLevel,
    trend,
    sectorRecommendations,
    rotationSignals,
    marketConcentration,
    momentumAcceleration,
    anomalies,
    refresh,
    reset,
  };
}

// ==================== 轻量级Hook ====================

/**
 * 仅计算综合评分的轻量Hook
 */
export function useMarketScore(
  breadth: BreadthData | null,
  sectors: SectorMomentumData[],
  sentiment: SentimentData | null,
): number | null {
  return useMemo(() => {
    if (!breadth || sectors.length === 0 || !sentiment) return null;

    const mockCapitalFlow: CapitalFlowData = {
      mainNetInflow: 0, retailNetInflow: 0, largeOrderNetInflow: 0,
      sectorFlows: {}, trend: 'neutral',
    };
    const mockNorthbound: NorthboundData = {
      totalNetBuy: 0, dailyNetBuy: 0, topHolds: [],
      sectorExposure: {}, trend: 'stable',
    };

    return calculateCompositeScore(
      breadth, mockCapitalFlow, mockNorthbound, sectors, sentiment, [],
    );
  }, [breadth, sectors, sentiment]);
}

/**
 * 市场风险监控Hook
 */
export function useMarketRisk(
  breadth: BreadthData | null,
  sentiment: SentimentData | null,
  volatility: number = 20,
): { riskLevel: 'low' | 'medium' | 'high' | null; alerts: string[] } {
  return useMemo(() => {
    if (!breadth || !sentiment) return { riskLevel: null, alerts: [] };

    const riskLevel = calculateRiskLevel(breadth, sentiment, volatility);
    const alerts: string[] = [];

    if (sentiment.fearGreedIndex < 20) {
      alerts.push('恐惧指数极低，注意风险');
    }
    if (volatility > 30) {
      alerts.push('波动率偏高');
    }
    const total = breadth.advanceCount + breadth.declineCount;
    if (total > 0 && breadth.declineCount / total > 0.7) {
      alerts.push('市场普跌');
    }
    if (breadth.newLows > breadth.newHighs * 2) {
      alerts.push('创新低家数远超创新高');
    }

    return { riskLevel, alerts };
  }, [breadth, sentiment, volatility]);
}

export default useMarketAnalytics;
