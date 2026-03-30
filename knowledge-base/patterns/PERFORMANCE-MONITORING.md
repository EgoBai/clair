# 性能监控设计

## 监控维度

### 1. API 性能监控
- **请求量**: 每分钟请求数趋势
- **响应时间**: 平均/P50/P95/P99
- **错误率**: HTTP 4xx/5xx 比例
- **慢请求**: 超过阈值的请求追踪

### 2. 健康评分系统
```
初始分: 100

错误率扣分:
  >5%  → -30
  >1%  → -15
  >0.1% → -5

平均响应扣分:
  >5000ms → -25
  >2000ms → -15
  >1000ms → -8
  >500ms  → -3

P99扣分:
  >10000ms → -15
  >5000ms  → -8
  >3000ms  → -3

慢请求比例扣分:
  >10% → -15
  >5%  → -8
  >1%  → -3

等级: A(90+) / B(80+) / C(60+) / D(40+) / F(<40)
```

### 3. 端点统计
- 请求数排序
- 平均响应时间排序
- 错误率排序
- 百分位分布

### 4. 前端性能上报
- Web Vitals 指标
- 资源加载时间
- 自定义业务指标

## API 接口
```
GET /api/performance/overview?range=3600000  # 概览
GET /api/performance/endpoints               # 端点排行
GET /api/performance/slow?limit=20           # 慢请求
GET /api/performance/errors?limit=20         # 错误请求
GET /api/performance/health                  # 健康评分
GET /api/performance/data-sources            # 数据源状态
POST /api/performance/frontend               # 前端指标上报
```

## 参考标准
- Sentry 性能监控方案
- Google Core Web Vitals
- Prometheus 指标模型
