import { useState, useEffect, useMemo } from 'react'
import { View, Text } from '@tarojs/components'
import { useDidShow, useDidHide } from '@tarojs/taro'
import EcChart from '../../components/EcChart'
import { fetchMarketRealtime, fetchMarketKline } from '../../services/api'
import type { RealtimeData, KlineData } from '../../services/api'
import { useMarketStore } from '../../store/useMarketStore'
import { getPriceColor, formatPercent } from '../../theme/tokens'
import './index.scss'

const POLL_INTERVAL = 10 * 1000 // 10s 轮询（后端行情 30s 缓存，10s 足够捕捉变化）

/** 用 /api/market/kline 的真实数组构建 echarts K 线 + 成交量 option（纯 JSON，复用 Web option 思路） */
function buildKlineOption(kline: KlineData) {
  const { dates, opens, highs, lows, prices, volumes } = kline
  // candlestick 数据格式：[open, close, low, high]
  const candles = prices.map((close, i) => [opens[i], close, lows[i], highs[i]])
  const volBars = volumes.map((v, i) => ({
    value: v,
    itemStyle: { color: prices[i] >= opens[i] ? '#ef4444' : '#22c55e' },
  }))

  return {
    backgroundColor: 'transparent',
    animation: false,
    legend: { show: false },
    tooltip: { trigger: 'axis' },
    grid: [
      { left: 8, right: 8, top: 8, height: '62%' },
      { left: 8, right: 8, top: '76%', height: '16%' },
    ],
    xAxis: [
      { type: 'category', data: dates, axisLine: { lineStyle: { color: '#2d3748' } }, axisLabel: { color: '#64748b' } },
      { type: 'category', gridIndex: 1, data: dates, axisLabel: { show: false } },
    ],
    yAxis: [
      { scale: true, axisLine: { lineStyle: { color: '#2d3748' } }, axisLabel: { color: '#64748b' }, splitLine: { lineStyle: { color: '#1a2332' } } },
      { gridIndex: 1, scale: true, axisLabel: { show: false }, splitLine: { show: false } },
    ],
    series: [
      {
        type: 'candlestick',
        data: candles,
        itemStyle: { color: '#ef4444', color0: '#22c55e', borderColor: '#ef4444', borderColor0: '#22c55e' },
      },
      { type: 'bar', xAxisIndex: 1, yAxisIndex: 1, data: volBars },
    ],
  }
}

export default function MarketPage() {
  const [realtime, setRealtime] = useState<RealtimeData | null>(null)
  const [kline, setKline] = useState<KlineData | null>(null)
  const [loading, setLoading] = useState(true)
  const setRealtimeCache = useMarketStore((s) => s.setRealtime)

  const load = async () => {
    try {
      const [rt, kl] = await Promise.all([
        fetchMarketRealtime(),
        fetchMarketKline('000001.SH', 120),
      ])
      // 诚实降级：dataSource==='unavailable' 也如实放入 state，由 UI 展示空态（不回填假数据）
      setRealtime(rt)
      setKline(kl)
      if (rt.dataSource === 'real') setRealtimeCache(rt)
    } catch {
      // 网络不可达 → 空态
      setRealtime(null)
      setKline(null)
    } finally {
      setLoading(false)
    }
  }

  useDidShow(() => {
    load()
    const timer = setInterval(load, POLL_INTERVAL)
    // 保存定时器引用，onHide 清理
    ;(globalThis as any).__marketTimer = timer
  })

  useDidHide(() => {
    const timer = (globalThis as any).__marketTimer
    if (timer) clearInterval(timer)
  })

  useEffect(() => {
    return () => {
      const timer = (globalThis as any).__marketTimer
      if (timer) clearInterval(timer)
    }
  }, [])

  const klineOption = useMemo(() => (kline && kline.dataSource === 'real' && kline.prices.length ? buildKlineOption(kline) : null), [kline])

  const realtimeAvailable = realtime?.dataSource === 'real'
  const breadth = realtimeAvailable ? realtime?.breadth : null
  const upTotal = breadth ? breadth.up : 0
  const downTotal = breadth ? breadth.down : 0
  const breadthTotal = upTotal + downTotal
  const upRatio = breadthTotal > 0 ? Math.round((upTotal / breadthTotal) * 100) : 50

  return (
    <View className='market-page'>
      {/* 大盘指数卡 */}
      <View className='card index-cards'>
        {loading ? (
          <View className='empty-state'>加载中…</View>
        ) : realtimeAvailable && realtime ? (
          <View className='index-row'>
            {[realtime.shanghai, realtime.shenzhen, realtime.chinext].map((idx) =>
              idx ? (
                <View key={idx.name} className='index-item'>
                  <Text className='index-name'>{idx.name}</Text>
                  <Text className='num index-price'>{Number(idx.price).toFixed(2)}</Text>
                  <Text className='num' style={{ color: getPriceColor(idx.changePct) }}>
                    {formatPercent(idx.changePct)}
                  </Text>
                </View>
              ) : null,
            )}
          </View>
        ) : (
          <View className='empty-state'>行情数据源暂不可达</View>
        )}
      </View>

      {/* 涨跌分布条 */}
      {breadth && (
        <View className='card breadth-card'>
          <View className='breadth-stats'>
            <Text className='num up'>上涨 {upTotal}</Text>
            <Text className='num down'>下跌 {downTotal}</Text>
            {breadth.limitUp > 0 && <Text className='num up'>涨停 {breadth.limitUp}</Text>}
            {breadth.limitDown > 0 && <Text className='num down'>跌停 {breadth.limitDown}</Text>}
          </View>
          <View className='breadth-bar'>
            <View className='breadth-up' style={{ width: `${upRatio}%` }} />
            <View className='breadth-down' style={{ width: `${100 - upRatio}%` }} />
          </View>
          {typeof breadth.turnoverYi === 'number' && (
            <Text className='breadth-turnover'>成交额 {Number(breadth.turnoverYi).toFixed(1)} 亿</Text>
          )}
        </View>
      )}

      {/* K 线图 */}
      <View className='card chart-card'>
        {klineOption ? (
          <EcChart option={klineOption} height={420} />
        ) : (
          <View className='empty-state'>K 线数据暂不可达</View>
        )}
      </View>

      {/* 合规条 */}
      <View className='compliance-footer'>行情数据仅供参考，不构成投资建议</View>
    </View>
  )
}
