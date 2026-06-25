# 未来价值发现功能设计文档

> 更新于 2026-06-25 | 状态：设计完成，待实施

## [S1] 问题定义

### 背景
A Stock项目需要一个新的功能模块，帮助用户发现具有投资潜力的标的。现有功能包括：
- 市场洞察（DiscoverPage）- 大盘趋势和板块轮动
- 策略选股（ScreenerPage）- 基于指标的筛选
- 自选追踪（WatchlistPage）- 已关注股票的跟踪
- 复盘研究（ReviewPage）- 历史分析和回测

### 核心需求
用户需要一个能够主动发现潜在投资标的的功能，而不是被动等待用户筛选。这个功能应该：
1. 基于多维度评分模型，综合评估股票潜力
2. 提供AI驱动的分析和推荐理由
3. 支持个性化配置和筛选条件
4. 与现有功能无缝集成

### 目标用户
- 价值投资者：寻找被低估的优质标的
- 成长投资者：发现高增长潜力的公司
- 量化投资者：基于模型和数据的决策支持

## [S2] 解决方案概述

### 功能名称
**未来价值发现**（Future Value Discovery）

### 核心理念
通过多维度评分模型和AI分析，主动发现具有投资潜力的标的，帮助用户做出更明智的投资决策。

### 三路并行委派架构
根据MULTI-AGENT.md的指导，本功能适合三路并行委派：

1. **评分模型路** - 后端算法和数据处理
2. **后端API路** - API端点和数据服务
3. **前端页面路** - 用户界面和交互

## [S3] 评分模型设计

### 评分维度
1. **基本面评分**（40%权重）
   - 市盈率（PE）相对行业水平
   - 市净率（PB）相对历史分位
   - 营收增长率
   - 净利润增长率
   - ROE（净资产收益率）

2. **技术面评分**（30%权重）
   - 价格趋势（MA金叉/死叉）
   - 成交量变化
   - RSI超买超卖
   - MACD信号

3. **资金面评分**（20%权重）
   - 主力资金流入
   - 北向资金持仓变化
   - 融资融券余额变化

4. **AI分析评分**（10%权重）
   - 行业前景分析
   - 公司竞争力评估
   - 风险因素识别

### 评分算法
```
综合评分 = 基本面评分 × 0.4 + 技术面评分 × 0.3 + 资金面评分 × 0.2 + AI分析评分 × 0.1
```

### 数据源
- 腾讯行情API：实时价格和基础数据
- PostgreSQL数据库：历史数据和基本面数据
- DeepSeek API：AI分析和评估

## [S4] 后端API设计

### 新增端点

#### 1. 评分计算端点
```
POST /api/future-value/score
Body: {
  symbols: string[],  // 股票代码列表
  dimensions?: string[]  // 可选：指定评分维度
}
Response: {
  scores: Array<{
    symbol: string;
    name: string;
    totalScore: number;
    dimensions: {
      fundamental: number;
      technical: number;
      capital: number;
      ai: number;
    };
    rank: number;
    change24h: number;
  }>;
  calculatedAt: string;
}
```

#### 2. 发现列表端点
```
GET /api/future-value/discover
Query: {
  limit?: number;  // 默认20
  minScore?: number;  // 最低评分，默认60
  industry?: string;  // 行业筛选
  sort?: 'score' | 'change' | 'volume';  // 排序方式
}
Response: {
  items: Array<{
    symbol: string;
    name: string;
    price: number;
    change: number;
    score: number;
    reasons: string[];  // 推荐理由
    riskFactors: string[];  // 风险因素
  }>;
  total: number;
  page: number;
}
```

#### 3. 评分详情端点
```
GET /api/future-value/detail/:symbol
Response: {
  symbol: string;
  name: string;
  totalScore: number;
  dimensions: {
    fundamental: { score: number; details: any; };
    technical: { score: number; details: any; };
    capital: { score: number; details: any; };
    ai: { score: number; analysis: string; };
  };
  history: Array<{ date: string; score: number; }>;
  recommendation: string;
  riskLevel: 'low' | 'medium' | 'high';
}
```

#### 4. 个性化配置端点
```
POST /api/future-value/config
Body: {
  dimensions: {
    fundamental: number;  // 权重 0-1
    technical: number;
    capital: number;
    ai: number;
  };
  filters: {
    industries: string[];
    minMarketCap: number;
    maxMarketCap: number;
    minScore: number;
  };
  notifications: {
    enabled: boolean;
    threshold: number;  // 评分变化阈值
  };
}
Response: { success: boolean; config: any; }
```

## [S5] 前端页面设计

### 页面布局
```
+---------------------------+---------------------------+
|           未来价值发现           |        个性化配置        |
+---------------------------+---------------------------+
|  [评分概览]  [发现列表]  [评分详情]  |  [维度权重]  [筛选条件]  |
+---------------------------+---------------------------+
|                           |                           |
|      评分分布图表          |      推荐理由卡片         |
|                           |                           |
+---------------------------+---------------------------+
|                           |                           |
|      发现列表表格          |      风险提示区域         |
|                           |                           |
+---------------------------+---------------------------+
```

### 核心组件

#### 1. ScoreOverview（评分概览）
- 显示今日发现数量
- 平均评分变化
- 评分分布饼图
- 热门行业统计

#### 2. DiscoveryList（发现列表）
- 股票代码和名称
- 当前价格和涨跌幅
- 综合评分和排名
- 推荐理由摘要
- 风险等级标识

#### 3. ScoreDetail（评分详情）
- 四维度评分雷达图
- 各维度详细数据
- AI分析报告
- 历史评分趋势

#### 4. PersonalizationPanel（个性化配置）
- 维度权重滑块
- 行业筛选多选
- 市值范围筛选
- 评分阈值设置
- 通知开关

### 交互设计
1. **实时更新**：WebSocket推送评分变化
2. **一键关注**：点击添加到自选列表
3. **深度分析**：跳转到个股详情页
4. **分享功能**：生成分析报告分享卡片

## [S6] 多Agent三路并行委派方案

### 任务分解

#### 路1：评分模型（Builder Worker 1）
**任务范围**：
- 实现评分算法引擎
- 数据聚合和计算
- 历史评分存储

**具体任务**：
1. 创建 `futureValueEngine.ts` 评分引擎
2. 实现四个维度的评分算法
3. 创建 `future_value_scores` 数据库表
4. 实现评分缓存和更新机制

**退出标准**：
- 评分引擎可以计算任意股票的综合评分
- 评分结果存储到数据库
- 评分计算时间 < 100ms

#### 路2：后端API（Builder Worker 2）
**任务范围**：
- 实现四个API端点
- 请求验证和响应格式
- 错误处理和日志

**具体任务**：
1. 创建 `futureValue.ts` 路由文件
2. 实现四个API端点
3. 添加请求验证中间件
4. 编写API测试用例

**退出标准**：
- 所有API端点返回正确JSON
- 请求验证通过
- 测试覆盖率 > 80%

#### 路3：前端页面（Builder Worker 3）
**任务范围**：
- 创建新页面组件
- 实现UI交互逻辑
- 与后端API集成

**具体任务**：
1. 创建 `FutureValuePage.tsx` 页面
2. 实现四个核心组件
3. 添加路由和导航
4. 编写组件测试

**退出标准**：
- 页面渲染正常
- 所有交互功能可用
- 响应式设计适配移动端

### 并行执行计划

```
时间线：
T+0h   ──── 三路并行启动 ────
T+0h   │  路1：评分模型开始
T+0h   │  路2：后端API开始
T+0h   │  路3：前端页面开始
T+2h   │  路1：评分引擎完成
T+2h   │  路2：API框架完成
T+2h   │  路3：页面骨架完成
T+4h   │  路1：数据表创建完成
T+4h   │  路2：API端点完成
T+4h   │  路3：组件开发完成
T+6h   │  路1：评分算法完成
T+6h   │  路2：测试用例完成
T+6h   │  路3：集成测试完成
T+8h   ──── 三路合并 ────
T+8h   │  集成测试和调试
T+10h  │  QA验证和修复
T+12h  │  最终交付
```

### 文件归属分区

#### 路1：评分模型
- `backend/src/services/futureValueEngine.ts` (新建)
- `backend/src/services/futureValueCalculator.ts` (新建)
- `backend/src/utils/futureValueUtils.ts` (新建)
- `backend/src/database/migrations/xxx_create_future_value_scores.sql` (新建)

#### 路2：后端API
- `backend/src/routes/futureValue.ts` (新建)
- `backend/src/middleware/futureValueValidation.ts` (新建)
- `backend/src/__tests__/futureValue.test.ts` (新建)

#### 路3：前端页面
- `frontend/src/pages/FutureValuePage.tsx` (新建)
- `frontend/src/components/FutureValue/ScoreOverview.tsx` (新建)
- `frontend/src/components/FutureValue/DiscoveryList.tsx` (新建)
- `frontend/src/components/FutureValue/ScoreDetail.tsx` (新建)
- `frontend/src/components/FutureValue/PersonalizationPanel.tsx` (新建)

### 共享简报更新
需要更新 `MULTI-AGENT.md` 文件，添加：
1. 未来价值发现功能说明
2. 评分模型算法细节
3. API端点文档
4. 前端组件规范

## [S7] 验证标准

### 功能验证
1. 评分模型可以正确计算综合评分
2. API端点返回正确数据
3. 前端页面渲染正常
4. 所有交互功能可用

### 性能验证
1. 评分计算时间 < 100ms
2. API响应时间 < 200ms
3. 页面加载时间 < 2s
4. 内存使用 < 500MB

### 安全验证
1. 输入验证通过
2. SQL注入防护
3. XSS防护
4. 权限控制正确

### 代码质量验证
1. TypeScript编译通过
2. ESLint检查通过
3. 测试覆盖率 > 80%
4. 代码审查通过

## [S8] 风险评估

### 技术风险
1. **评分算法复杂度** - 可能需要多次迭代优化
2. **数据源稳定性** - 依赖外部API可能不稳定
3. **性能瓶颈** - 大量股票评分计算可能影响性能

### 缓解措施
1. 分阶段实现，先简单后复杂
2. 添加缓存机制，减少API调用
3. 使用异步处理和批量计算

### 进度风险
1. **并行冲突** - 三路开发可能产生文件冲突
2. **集成问题** - 各模块接口可能不匹配
3. **测试时间不足** - 功能复杂，测试时间可能不够

### 缓解措施
1. 严格文件归属分区，避免冲突
2. 提前定义接口规范，定期同步
3. 优先核心功能，扩展功能后续迭代

## [S9] 实施计划

### 第一阶段：基础架构（T+0h - T+4h）
- 三路并行启动
- 各自搭建基础框架
- 定义接口规范

### 第二阶段：核心功能（T+4h - T+8h）
- 评分模型实现
- API端点实现
- 前端组件实现

### 第三阶段：集成测试（T+8h - T+10h）
- 三路合并
- 集成测试
- 问题修复

### 第四阶段：优化交付（T+10h - T+12h）
- 性能优化
- QA验证
- 最终交付

## [S10] 成功标准

### 功能完整性
- [x] 评分模型可以计算综合评分
- [ ] API端点返回正确数据
- [ ] 前端页面渲染正常
- [ ] 所有交互功能可用

### 代码质量
- [ ] TypeScript编译通过
- [ ] ESLint检查通过
- [ ] 测试覆盖率 > 80%
- [ ] 代码审查通过

### 用户体验
- [ ] 页面加载时间 < 2s
- [ ] 交互响应时间 < 200ms
- [ ] 移动端适配正常
- [ ] 无重大bug

### 业务价值
- [ ] 提升用户选股效率
- [ ] 增加用户停留时间
- [ ] 提高用户满意度
- [ ] 支持产品差异化竞争

---

**设计完成时间**：2026-06-25
**设计者**：MiMoCode Orchestrator
**审核状态**：待用户审核
