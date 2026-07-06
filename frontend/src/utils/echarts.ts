/**
 * ECharts 按需引入 — 只注册项目实际使用的组件
 * 减少 ~250KB gzip vs 完整echarts包
 */
import * as echarts from 'echarts/core';

// 渲染器
import { CanvasRenderer } from 'echarts/renderers';

// 图表类型
import {
  LineChart,
  BarChart,
  PieChart,
  CandlestickChart,
  RadarChart,
  SankeyChart,
  HeatmapChart,
} from 'echarts/charts';

// 组件
import {
  GridComponent,
  TooltipComponent,
  AxisPointerComponent,
  LegendComponent,
  TitleComponent,
  MarkLineComponent,
  MarkPointComponent,
  DataZoomComponent,
  DataZoomInsideComponent,
  DataZoomSliderComponent,
  VisualMapComponent,
  VisualMapPiecewiseComponent,
  DatasetComponent,
  TransformComponent,
  ToolboxComponent,
} from 'echarts/components';

// 功能
import { UniversalTransition, LabelLayout } from 'echarts/features';

echarts.use([
  CanvasRenderer,
  LineChart,
  BarChart,
  PieChart,
  CandlestickChart,
  RadarChart,
  SankeyChart,
  HeatmapChart,
  GridComponent,
  TooltipComponent,
  AxisPointerComponent,
  LegendComponent,
  TitleComponent,
  MarkLineComponent,
  MarkPointComponent,
  DataZoomComponent,
  DataZoomInsideComponent,
  DataZoomSliderComponent,
  VisualMapComponent,
  VisualMapPiecewiseComponent,
  DatasetComponent,
  TransformComponent,
  ToolboxComponent,
  UniversalTransition,
  LabelLayout,
]);

export default echarts;
