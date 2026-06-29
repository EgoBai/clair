# 潜力股雷达页 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现潜力股雷达页，展示全市场Top50评分股票，六因子雷达图可视化+上榜理由标签

**Architecture:** 单页面组件，调用已有 `POST /api/ai/gems` API，ECharts雷达图+Ant Design表格+Tag组件

**Tech Stack:** React, TypeScript, Ant Design 5, ECharts (echarts-for-react), 已有 responsive.css 体系

**API 契约（已就绪，无需后端改动）：**
```
POST /api/ai/gems
Request: { "topN": 50, "minScore": 40 }
Response: { success: true, data: {
  gems: [{ symbol, name, price, changePercent, turnoverRate, marketCap, peRatio,
    industry, score, momentumScore, volumeScore, valuationScore, sizeScore,
    industryScore, qualityScore, reasons[] }],
  total, model, aiSummary, factors, scoring
}}
```

---

### Task 1: 创建 RadarPage 基础组件 + API调用

**Covers:** 雷达页基础架构
**Files:**
- Create: `frontend/src/pages/RadarPage.tsx`

- [ ] **Step 1: 创建 RadarPage 组件骨架**

```tsx
// frontend/src/pages/RadarPage.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { Card, Table, Tag, Spin, Empty, Button, Row, Col, Statistic, Tooltip } from 'antd';
import { ReloadOutlined, TrophyOutlined, RiseOutlined } from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import { apiFetch } from '../services/api';
import { useNavigate } from 'react-router-dom';

interface GemStock {
  symbol: string;
  name: string;
  price: number;
  changePercent: number;
  turnoverRate: number;
  marketCap: number;
  peRatio: number | null;
  industry: string;
  score: number;
  momentumScore: number;
  volumeScore: number;
  valuationScore: number;
  sizeScore: number;
  industryScore: number;
  qualityScore: number;
  reasons: string[];
}

interface GemsResponse {
  success: boolean;
  data: {
    gems: GemStock[];
    total: number;
    model: string;
    aiSummary: string;
    factors: Record<string, string>;
    scoring: string;
  };
}

const RadarPage: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [gems, setGems] = useState<GemStock[]>([]);
  const [selectedStock, setSelectedStock] = useState<GemStock | null>(null);
  const [summary, setSummary] = useState('');
  const [total, setTotal] = useState(0);

  const fetchGems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/ai/gems', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topN: 50, minScore: 40 }),
      }) as GemsResponse;
      if (res.success) {
        setGems(res.data.gems);
        setSummary(res.data.aiSummary);
        setTotal(res.data.total);
        if (res.data.gems.length > 0) {
          setSelectedStock(res.data.gems[0]);
        }
      }
    } catch (err) {
      console.error('Failed to fetch gems:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGems();
  }, [fetchGems]);

  // ... (radar chart + table + layout in next tasks)
};

export default RadarPage;
```

- [ ] **Step 2: 验证组件可渲染**

Run: `cd frontend && npx tsc --noEmit src/pages/RadarPage.tsx`
Expected: 0 errors

---

### Task 2: 六因子雷达图 ECharts 组件

**Covers:** 六因子雷达图可视化
**Files:**
- Modify: `frontend/src/pages/RadarPage.tsx` (添加雷达图)

- [ ] **Step 1: 添加雷达图配置函数**

在 RadarPage.tsx 中添加 getRadarOption 函数：

```tsx
const getRadarOption = (stock: GemStock) => ({
  radar: {
    indicator: [
      { name: '动量', max: 25 },
      { name: '成交', max: 25 },
      { name: '估值', max: 20 },
      { name: '规模', max: 20 },
      { name: '行业', max: 15 },
      { name: '质量', max: 15 },
    ],
    shape: 'polygon',
    splitNumber: 5,
    axisName: { color: '#94a3b8', fontSize: 12 },
    splitLine: { lineStyle: { color: 'rgba(148,163,184,0.2)' } },
    splitArea: { areaStyle: { color: ['rgba(148,163,184,0.05)', 'rgba(148,163,184,0.1)'] } },
    axisLine: { lineStyle: { color: 'rgba(148,163,184,0.3)' } },
  },
  series: [{
    type: 'radar',
    data: [{
      value: [
        stock.momentumScore,
        stock.volumeScore,
        stock.valuationScore,
        stock.sizeScore,
        stock.industryScore,
        stock.qualityScore,
      ],
      name: stock.name,
      areaStyle: { color: 'rgba(59,130,246,0.2)' },
      lineStyle: { color: '#3b82f6', width: 2 },
      itemStyle: { color: '#3b82f6' },
    }],
  }],
  tooltip: {
    trigger: 'item',
    formatter: (params: any) => {
      const v = params.value;
      return `<b>${params.name}</b><br/>
        动量: ${v[0]}<br/>成交: ${v[1]}<br/>估值: ${v[2]}<br/>
        规模: ${v[3]}<br/>行业: ${v[4]}<br/>质量: ${v[5]}`;
    },
  },
});
```

- [ ] **Step 2: 在 JSX 中添加雷达图卡片**

```tsx
<Col xs={24} lg={12}>
  <Card title="六因子雷达图" size="small" style={{ height: '100%' }}>
    {selectedStock ? (
      <>
        <div style={{ textAlign: 'center', marginBottom: 8 }}>
          <span style={{ color: '#f8fafc', fontSize: 16, fontWeight: 600 }}>
            {selectedStock.name}
          </span>
          <Tag color="blue" style={{ marginLeft: 8 }}>{selectedStock.score}分</Tag>
        </div>
        <ReactECharts option={getRadarOption(selectedStock)} style={{ height: 300 }} />
      </>
    ) : (
      <Empty description="点击股票查看详情" />
    )}
  </Card>
</Col>
```

- [ ] **Step 3: 验证**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors

---

### Task 3: Top50 评分排行榜表格

**Covers:** 评分榜+点击交互
**Files:**
- Modify: `frontend/src/pages/RadarPage.tsx` (添加表格)

- [ ] **Step 1: 添加表格列定义和表格组件**

```tsx
const columns = [
  {
    title: '#',
    key: 'rank',
    width: 50,
    render: (_: any, __: any, index: number) => (
      <span style={{ color: index < 3 ? '#f59e0b' : '#94a3b8', fontWeight: index < 3 ? 700 : 400 }}>
        {index + 1}
      </span>
    ),
  },
  {
    title: '股票',
    key: 'stock',
    render: (_: any, record: GemStock) => (
      <div>
        <div style={{ color: '#f8fafc', fontWeight: 500 }}>{record.name}</div>
        <div style={{ color: '#64748b', fontSize: 12 }}>{record.symbol}</div>
      </div>
    ),
  },
  {
    title: '综合分',
    dataIndex: 'score',
    key: 'score',
    sorter: (a: GemStock, b: GemStock) => a.score - b.score,
    defaultSortOrder: 'descend' as const,
    render: (score: number) => (
      <span style={{ color: score >= 80 ? '#ef4444' : score >= 60 ? '#f59e0b' : '#3b82f6', fontWeight: 700, fontSize: 16 }}>
        {score}
      </span>
    ),
  },
  {
    title: '涨跌%',
    dataIndex: 'changePercent',
    key: 'changePercent',
    render: (v: number) => (
      <span style={{ color: v > 0 ? '#ef4444' : v < 0 ? '#22c55e' : '#94a3b8' }}>
        {v > 0 ? '+' : ''}{v?.toFixed(2)}%
      </span>
    ),
  },
  {
    title: '行业',
    dataIndex: 'industry',
    key: 'industry',
    render: (v: string) => <Tag>{v}</Tag>,
  },
  {
    title: '上榜理由',
    dataIndex: 'reasons',
    key: 'reasons',
    render: (reasons: string[]) => (
      <div>
        {reasons?.map((r, i) => (
          <Tag key={i} color="blue" style={{ marginBottom: 2 }}>{r}</Tag>
        ))}
      </div>
    ),
  },
  {
    title: '市值(亿)',
    dataIndex: 'marketCap',
    key: 'marketCap',
    render: (v: number) => v ? `${v.toFixed(0)}` : '-',
  },
];

// 在 JSX 中添加表格
<Col xs={24} lg={12}>
  <Card title={`Top ${gems.length} 潜力股`} size="small" extra={<Tag color="blue">全市场 ${total} 只</Tag>}>
    <Table
      dataSource={gems}
      columns={columns}
      rowKey="symbol"
      size="small"
      pagination={false}
      scroll={{ y: 400 }}
      onRow={(record) => ({
        onClick: () => setSelectedStock(record),
        style: { cursor: 'pointer', background: selectedStock?.symbol === record.symbol ? 'rgba(59,130,246,0.1)' : undefined },
      })}
    />
  </Card>
</Col>
```

- [ ] **Step 2: 验证**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors

---

### Task 4: 整体布局 + AI解读区 + 响应式

**Covers:** 页面布局+AI Summary+移动端适配
**Files:**
- Modify: `frontend/src/pages/RadarPage.tsx` (完整布局)

- [ ] **Step 1: 完善页面整体布局**

```tsx
return (
  <div className="radar-page" style={{ padding: '16px', maxWidth: 1400, margin: '0 auto' }}>
    {/* 页面标题 */}
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
      <div>
        <h1 style={{ color: '#f8fafc', margin: 0, fontSize: 24 }}>
          <TrophyOutlined style={{ color: '#f59e0b', marginRight: 8 }} />
          潜力股雷达
        </h1>
        <p style={{ color: '#64748b', margin: '4px 0 0', fontSize: 14 }}>
          六因子综合评分 · 全市场扫描 · AI解读
        </p>
      </div>
      <Button icon={<ReloadOutlined />} onClick={fetchGems} loading={loading}>
        刷新
      </Button>
    </div>

    {/* 统计卡片 */}
    <Row gutter={16} style={{ marginBottom: 16 }}>
      <Col xs={12} sm={6}>
        <Card size="small">
          <Statistic title="入选股票" value={gems.length} suffix={`/ ${total}`} valueStyle={{ color: '#3b82f6' }} />
        </Card>
      </Col>
      <Col xs={12} sm={6}>
        <Card size="small">
          <Statistic title="平均分" value={gems.length ? (gems.reduce((s, g) => s + g.score, 0) / gems.length).toFixed(1) : 0} valueStyle={{ color: '#f59e0b' }} />
        </Card>
      </Col>
      <Col xs={12} sm={6}>
        <Card size="small">
          <Statistic title="平均涨幅" value={gems.length ? (gems.reduce((s, g) => s + (g.changePercent || 0), 0) / gems.length).toFixed(2) : 0} suffix="%" valueStyle={{ color: '#22c55e' }} />
        </Card>
      </Col>
      <Col xs={12} sm={6}>
        <Card size="small">
          <Statistic title="评分模型" value={gems.length ? 'v2.0' : '-'} valueStyle={{ color: '#94a3b8', fontSize: 14 }} />
        </Card>
      </Col>
    </Row>

    {/* 主内容: 雷达图 + 表格 */}
    <Row gutter={16}>
      {/* 雷达图 */}
      <Col xs={24} lg={12}> ... </Col>
      {/* 表格 */}
      <Col xs={24} lg={12}> ... </Col>
    </Row>

    {/* AI整体解读 */}
    {summary && (
      <Card size="small" style={{ marginTop: 16 }} title="AI整体解读">
        <p style={{ color: '#cbd5e1', lineHeight: 1.8 }}>{summary}</p>
      </Card>
    )}
  </div>
);
```

- [ ] **Step 2: 添加页面CSS**

```css
/* 在 RadarPage.tsx 顶部 style 标签或 responsive.css 中 */
.radar-page .ant-card {
  background: #1e293b;
  border: 1px solid rgba(148,163,184,0.1);
}
.radar-page .ant-table {
  background: transparent;
}
.radar-page .ant-table-thead > tr > th {
  background: rgba(148,163,184,0.05);
  color: #94a3b8;
}
.radar-page .ant-table-tbody > tr:hover > td {
  background: rgba(59,130,246,0.05) !important;
}
```

- [ ] **Step 3: 验证完整组件**

Run: `cd frontend && npx tsc --noEmit && npx eslint src/pages/RadarPage.tsx`
Expected: 0 errors

---

### Task 5: 路由注册 + 导航入口

**Covers:** 路由+导航
**Files:**
- Modify: `frontend/src/main.tsx` (添加路由)
- Modify: `frontend/src/components/Layout/NavigationMenu.tsx` (添加导航项)

- [ ] **Step 1: 在 main.tsx 添加路由**

在 Routes 中添加（在 industry-map 路由之后）：

```tsx
import RadarPage from './pages/RadarPage';

// 在 Routes 中:
<Route path="radar" element={<LazyPage component={RadarPage} name="潜力雷达" />} />
```

- [ ] **Step 2: 在 NavigationMenu 添加导航项**

在 navItems 数组中添加（在 industry-map 之后）：

```tsx
{
  id: 'radar',
  label: '潜力雷达',
  icon: '🏆',
  path: '/radar',
},
```

- [ ] **Step 3: 在 TabBar 添加移动端入口（如有）**

检查 TabBar.tsx 是否需要添加第5个tab，或保持4个核心tab不变（radar作为穿透页）。

- [ ] **Step 4: 验证路由可访问**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors
手动验证: 启动前端，访问 /radar 页面应渲染雷达页

---

### Task 6: 测试 + 端到端验证

**Covers:** 测试覆盖+端到端验证
**Files:**
- Create: `frontend/src/__tests__/pages/RadarPage.test.tsx`

- [ ] **Step 1: 编写 RadarPage 测试**

```tsx
// frontend/src/__tests__/pages/RadarPage.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import RadarPage from '../../pages/RadarPage';

vi.mock('../../services/api', () => ({
  apiFetch: vi.fn().mockResolvedValue({
    success: true,
    data: {
      gems: [
        { symbol: '603014.SH', name: '威高血净', price: 12.3, changePercent: 4.5,
          turnoverRate: 6.2, marketCap: 120, peRatio: 35, industry: '医药生物',
          score: 88, momentumScore: 20, volumeScore: 20, valuationScore: 10,
          sizeScore: 15, industryScore: 11, qualityScore: 10,
          reasons: ['涨势适中不追高', '成交活跃换手健康', '中盘成长空间'] },
      ],
      total: 4448, model: 'v2.0', aiSummary: '市场整体震荡',
      factors: {}, scoring: '总分=动量+成交+估值+规模+行业+质量',
    },
  }),
}));

describe('RadarPage', () => {
  it('renders page title', async () => {
    render(<BrowserRouter><RadarPage /></BrowserRouter>);
    expect(screen.getByText('潜力股雷达')).toBeDefined();
  });

  it('loads and displays gems', async () => {
    render(<BrowserRouter><RadarPage /></BrowserRouter>);
    await waitFor(() => {
      expect(screen.getByText('威高血净')).toBeDefined();
    });
  });

  it('displays reasons tags', async () => {
    render(<BrowserRouter><RadarPage /></BrowserRouter>);
    await waitFor(() => {
      expect(screen.getByText('涨势适中不追高')).toBeDefined();
    });
  });
});
```

- [ ] **Step 2: 运行测试**

Run: `cd frontend && npx vitest run src/__tests__/pages/RadarPage.test.tsx`
Expected: All tests pass

- [ ] **Step 3: 运行完整前端测试套件**

Run: `cd frontend && npx vitest run`
Expected: 0 failures (852+ files)

- [ ] **Step 4: 端到端 curl 验证**

```bash
# 验证 API
curl -s -X POST http://localhost:3001/api/ai/gems \
  -H "Content-Type: application/json" \
  -d '{"topN":50,"minScore":40}' | python3 -c "import sys,json; d=json.load(sys.stdin); print('gems:', len(d['data']['gems']))"

# 验证前端编译
cd frontend && npx vite build 2>&1 | tail -5
```

- [ ] **Step 5: 提交**

```bash
git add frontend/src/pages/RadarPage.tsx frontend/src/main.tsx \
  frontend/src/components/Layout/NavigationMenu.tsx \
  frontend/src/__tests__/pages/RadarPage.test.tsx
git commit -m "feat: 潜力股雷达页 — 六因子雷达图+Top50评分榜+上榜理由标签"
```
