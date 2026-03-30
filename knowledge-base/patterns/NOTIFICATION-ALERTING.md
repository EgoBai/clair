# 通知与告警系统设计

## 设计目标
构建多通道、可分级、可限频的通知告警系统，支持股票价格、成交量、技术信号等多种告警场景。

## 核心组件

### 1. 通知构建器
- 5种通知类型：price/volume/news/system/trade
- 4级优先级：low/medium/high/critical
- 附带业务数据（股票代码、价格、触发条件等）

### 2. 条件评估器
支持7种操作符：
- `gt/lt/gte/lte` - 数值比较
- `eq` - 精确匹配（含浮点容差）
- `crosses_above/crosses_below` - 穿越检测（需前值）

### 3. 通知分组
- 按类型+标的分组
- 避免同类通知刷屏
- 聚合展示

### 4. 限频策略
- 同一告警键的最小间隔时间
- 按优先级分级限频
- 关键告警豁免限频

### 5. 通道路由
| 优先级 | 通道 |
|--------|------|
| critical | push + sms + in-app |
| high | push + in-app |
| medium | in-app |
| low | in-app |

## 数据结构
```typescript
interface Notification {
  id: string;
  type: 'price' | 'volume' | 'news' | 'system' | 'trade';
  title: string;
  body: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  read: boolean;
  createdAt: number;
  data?: Record<string, unknown>;
}
```

## 扩展方向
- WebSocket 实时推送
- 邮件/企业微信通道
- 告警模板引擎
- 告警历史分析
