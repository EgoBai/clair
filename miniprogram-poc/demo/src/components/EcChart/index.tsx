import { useEffect, useRef } from 'react'
import Taro from '@tarojs/taro'
import { Canvas } from '@tarojs/components'
import * as echarts from 'echarts/core'
import { CandlestickChart, BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { EChartsCoreOption, ECharts } from 'echarts/core'

/**
 * echarts 图表封装 —— 小程序「canvas 2d」直连方案（替代 Web 端 echarts-for-react / recharts）
 *
 * 体积优化（联调清单 D 项）：
 * - 使用 echarts/core「按需静态引入」并保持 tree-shaking（Taro weapp 目标会把动态 import 降级为同步
 *   require 并破坏 tree-shaking，故不可用动态 import；见 §J 实测）。
 * - 仅注册市场页 K 线真正用到的模块：CandlestickChart / BarChart / Grid / Tooltip / CanvasRenderer。
 *   （LineChart / DataZoom / Legend 在本页 option 中未使用，已剔除。）
 * - market 是 tabBar 页、必须留在主包，无法分包；candlestick 自身较重，244KiB 仅为软建议，
 *   硬上限 2MiB 主包仍满足。
 * - Web 端 echarts 的 option 是纯 JSON，可直接复用传入。
 * - 渲染依赖真实 canvas 节点，需在微信开发者工具 / 真机验证（本沙箱无法运行）。
 */

echarts.use([CandlestickChart, BarChart, GridComponent, TooltipComponent, CanvasRenderer])

interface Props {
  option: EChartsCoreOption
  /** 高度，单位 rpx */
  height?: number
}

export default function EcChart({ option, height = 420 }: Props) {
  const chartRef = useRef<ECharts | null>(null)
  const canvasId = 'ec-chart-canvas'
  const optionRef = useRef<EChartsCoreOption>(option)
  optionRef.current = option

  // 仅在挂载时初始化一次：查找 canvas 节点并初始化 chart
  useEffect(() => {
    let disposed = false
    const query = Taro.createSelectorQuery()
    query
      .select(`#${canvasId}`)
      .fields({ node: true, size: true })
      .exec((res) => {
        if (disposed || !res || !res[0] || !res[0].node) return
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
        chart.setOption(optionRef.current)
        chartRef.current = chart
      })

    return () => {
      disposed = true
      chartRef.current?.dispose()
      chartRef.current = null
    }
  }, [])

  // 数据更新时只重设 option，不重建 canvas/chart（避免轮询闪烁）
  useEffect(() => {
    chartRef.current?.setOption(option)
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
