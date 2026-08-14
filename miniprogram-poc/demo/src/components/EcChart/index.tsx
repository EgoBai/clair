import { useEffect, useRef } from 'react'
import Taro from '@tarojs/taro'
import { Canvas } from '@tarojs/components'
import * as echarts from 'echarts/core'
import { LineChart, CandlestickChart, BarChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  DataZoomComponent,
  LegendComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

/**
 * echarts 图表封装 —— 小程序「canvas 2d」直连方案（替代 Web 端 echarts-for-react / recharts）
 *
 * 说明：
 * - 使用 echarts/core 按需引入（仅 line/candlestick/bar + 必要组件），控制主包体积（联调清单 D 项）。
 * - Web 端 echarts 的 option 是纯 JSON，可直接复用传入。
 * - 渲染依赖真实 canvas 节点，需在微信开发者工具 / 真机验证（本沙箱无法运行）。
 */

echarts.use([
  LineChart,
  CandlestickChart,
  BarChart,
  GridComponent,
  TooltipComponent,
  DataZoomComponent,
  LegendComponent,
  CanvasRenderer,
])

interface Props {
  option: echarts.EChartsCoreOption
  /** 高度，单位 rpx */
  height?: number
}

export default function EcChart({ option, height = 420 }: Props) {
  const chartRef = useRef<echarts.ECharts | null>(null)
  const canvasId = 'ec-chart-canvas'

  useEffect(() => {
    const query = Taro.createSelectorQuery()
    query
      .select(`#${canvasId}`)
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res || !res[0] || !res[0].node) return
        const canvas = res[0].node
        const width = res[0].width
        const canvasHeight = res[0].height
        const dpr = Taro.getSystemInfoSync().pixelRatio || 2

        canvas.width = width * dpr
        canvas.height = canvasHeight * dpr

        const chart = echarts.init(canvas, null, {
          width,
          height: canvasHeight,
          devicePixelRatio: dpr,
        })
        chart.setOption(option)
        chartRef.current = chart
      })

    return () => {
      chartRef.current?.dispose()
      chartRef.current = null
    }
  }, [option])

  return (
    <Canvas
      type='2d'
      id={canvasId}
      canvasId={canvasId}
      style={{ width: '100%', height: `${height}rpx` }}
    />
  )
}
