# 投资组合管理设计

## 概述
模拟投资组合管理系统，支持持仓管理、收益计算、资产配置。

## 数据模型
```
Portfolio
├── id, name, description
├── cashBalance (现金余额)
├── positions[] (持仓列表)
│   ├── symbol, name, quantity
│   ├── costPrice, currentPrice
│   └── buyDate, notes
└── createdAt
```

## 核心功能

### 持仓管理
- 添加持仓: 支持新买入和加仓（自动计算均价）
- 编辑持仓: 修改数量/成本价/备注
- 删除持仓: 自动退回对应现金

### 收益计算
- 浮盈/浮亏 = (现价 - 成本价) × 数量
- 收益率 = 浮盈 / 成本总额
- 组合总收益 = Σ(单股收益)

### 资产配置
- 按持仓市值计算权重
- 包含现金占比
- 饼图可视化

## API 设计
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/portfolio | 组合列表(含收益摘要) |
| GET | /api/portfolio/:id | 组合详情(含行情) |
| POST | /api/portfolio | 创建组合 |
| POST | /api/portfolio/:id/positions | 添加持仓 |
| PUT | /api/portfolio/:id/positions/:symbol | 编辑持仓 |
| DELETE | /api/portfolio/:id/positions/:symbol | 删除持仓 |

## 前端组件
- PortfolioPage: 完整组合管理页面
- 组合概览: 6个统计卡片
- 持仓表格: 8列，含盈亏着色
- 资产配置: Recharts PieChart 饼图
- 表单弹窗: 添加/编辑持仓

## 设计要点
1. **行情实时关联**: 持仓通过股票代码查询最新行情
2. **加仓均价**: 同一股票多次买入自动计算加权均价
3. **默认示例**: 提供4只股票的示例组合，便于体验
4. **现金管理**: 买入扣现金、卖出/删除退回现金
