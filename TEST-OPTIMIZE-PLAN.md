# 澄观测试、差错和优化计划

> 2026-06-18 | 基于当前状态制定

## 当前状态总结

```
前端测试: 17725 passed, 8 failed (852 test files)
后端测试: 待运行
Lint: 多个警告和错误
TypeScript: 无typecheck脚本
```

---

## 一、差错修复（P0 - 今天完成）

### 1.1 修复失败的前端测试

| # | 测试文件 | 失败原因 | 修复方案 |
|---|----------|----------|----------|
| 1 | NavigationMenu.test.tsx | 导航项文本不匹配（"发掘" vs "市场洞察"） | 更新测试用例，匹配实际导航文本 |
| 2 | 其他7个失败测试 | 待分析 | 运行详细测试报告 |

**执行步骤**：
```bash
# 1. 获取详细测试报告
cd frontend && npm test -- --verbose 2>&1 | grep -A 10 "FAIL"

# 2. 修复NavigationMenu测试
# 更新测试中的文本期望值

# 3. 重新运行测试验证
npm test
```

### 1.2 修复Lint错误

| # | 文件 | 错误类型 | 修复方案 |
|---|------|----------|----------|
| 1 | ModelExplanationViz.tsx | Unused eslint-disable directive | 移除不必要的eslint-disable注释 |
| 2 | 其他警告 | unused variables | 清理未使用的导入和变量 |

**执行步骤**：
```bash
# 1. 修复eslint-disable错误
# 2. 清理未使用的导入
# 3. 重新运行lint验证
npm run lint
```

### 1.3 后端测试验证

```bash
# 运行后端测试
npm run test:backend

# 检查测试覆盖率
cd backend && npm test -- --coverage
```

---

## 二、功能测试（P1 - 本周完成）

### 2.1 AI功能端到端测试

| # | 功能 | 测试方法 | 验收标准 |
|---|------|----------|----------|
| 1 | LLM市场解读 | curl测试 + 浏览器验证 | 返回结构化数据，包含4个部分 |
| 2 | 自选股AI总结 | curl测试 | 返回200字以内的分析 |
| 3 | 交易行为分析 | curl测试 | 返回6个维度的分析 |
| 4 | AI对话功能 | 流式响应测试 | 打字机效果正常 |

**测试脚本**：
```bash
# 1. 测试LLM市场解读
curl -s http://localhost:3001/api/ai/market-insight-llm | jq '.data.mood'

# 2. 测试自选股AI总结
curl -s -X POST http://localhost:3001/api/ai/watchlist-summary \
  -H "Content-Type: application/json" \
  -d '{"symbols":["600519","000858"],"quotes":[{"price":1500,"changePercent":2.5},{"price":120,"changePercent":-1.2}]}' | jq '.summary'

# 3. 测试交易行为分析
curl -s -X POST http://localhost:3001/api/ai/trade-analysis \
  -H "Content-Type: application/json" \
  -d '{"stocks":[{"symbol":"600519"}],"stats":{"totalStocks":1}}' | jq '.analysis'

# 4. 测试AI健康检查
curl -s http://localhost:3001/api/ai/health | jq '.status'
```

### 2.2 核心循环功能测试

| # | 页面 | 测试内容 | 验收标准 |
|---|------|----------|----------|
| 1 | 发掘页 | 板块数据 + AI解读 | 数据加载 < 2秒，AI解读异步显示 |
| 2 | 筛选页 | 对话式筛选 | 输入条件后返回匹配股票 |
| 3 | 自选股 | 添加/删除/行情 | 操作响应 < 500ms |
| 4 | 详情页 | K线 + 策略 + AI诊断 | 数据完整，无崩溃 |
| 5 | 复盘页 | AI分析 | 点击按钮后返回分析结果 |

### 2.3 API端点完整性测试

```bash
# 测试所有核心API端点
endpoints=(
  "/api/market/indices"
  "/api/sectors/momentum"
  "/api/stocks?limit=5"
  "/api/ai/market-insight"
  "/api/ai/market-insight-llm"
  "/api/ai/health"
)

for endpoint in "${endpoints[@]}"; do
  status=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3001${endpoint}")
  echo "${endpoint}: ${status}"
done
```

---

## 三、性能优化（P2 - 下周启动）

### 3.1 前端性能优化

| # | 优化项 | 目标 | 实现方案 |
|---|--------|------|----------|
| 1 | 代码分割 | 首屏加载 < 3秒 | React.lazy + Suspense |
| 2 | 图片优化 | 减少50%体积 | WebP格式 + 懒加载 |
| 3 | 缓存策略 | 重复访问 < 1秒 | Service Worker + HTTP缓存 |
| 4 | 虚拟列表 | 大数据量流畅 | react-window |

### 3.2 后端性能优化

| # | 优化项 | 目标 | 实现方案 |
| 1 | 数据库查询 | P95 < 100ms | 添加索引 + 查询优化 |
| 2 | API缓存 | 减少重复计算 | Redis + 内存缓存 |
| 3 | 并发处理 | 支持100+并发 | 连接池 + 异步处理 |
| 4 | LLM调用 | 响应 < 5秒 | 流式响应 + 缓存 |

### 3.3 LLM优化

| # | 优化项 | 目标 | 实现方案 |
|---|--------|------|----------|
| 1 | Prompt优化 | 提高输出质量 | 结构化提示 + Few-shot |
| 2 | 缓存策略 | 减少API调用 | 相同数据缓存1小时 |
| 3 | 错误处理 | 降级到规则引擎 | LLM失败时使用模板 |
| 4 | 成本控制 | 降低50%费用 | 本地模型 + 按需调用 |

---

## 四、代码质量提升（P3 - 持续进行）

### 4.1 清理未使用代码

| # | 清理项 | 影响文件 | 预估工作量 |
|---|--------|----------|------------|
| 1 | 未使用的导入 | 20+ 文件 | 1小时 |
| 2 | 未使用的变量 | 10+ 文件 | 30分钟 |
| 3 | 未使用的组件 | 5+ 文件 | 30分钟 |
| 4 | 废弃的API端点 | 3+ 文件 | 30分钟 |

### 4.2 TypeScript严格模式

```bash
# 在tsconfig.json中启用严格模式
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true
  }
}
```

### 4.3 测试覆盖率提升

| # | 模块 | 当前覆盖率 | 目标覆盖率 |
|---|------|------------|------------|
| 1 | 前端组件 | ~70% | 90% |
| 2 | 后端API | ~60% | 85% |
| 3 | 工具函数 | ~80% | 95% |
| 4 | AI服务 | ~50% | 80% |

---

## 五、执行计划

### 今天（6/18）

```
上午：
├── 修复NavigationMenu测试失败
├── 修复ModelExplanationViz.tsx lint错误
└── 运行完整测试套件

下午：
├── AI功能端到端测试
├── 核心循环功能测试
└── API端点完整性测试

晚上：
├── 记录测试结果
└── 更新NEXT-PLAN.md
```

### 本周（6/19-6/24）

```
周四：
├── 清理未使用的导入和变量
├── 后端测试覆盖率检查
└── 性能基准测试

周五：
├── 前端代码分割优化
├── API缓存策略实现
└── LLM缓存优化

周末：
├── 文档更新
└── 下周计划制定
```

### 下周（6/25-7/1）

```
├── 数据库索引优化
├── Service Worker实现
├── 虚拟列表集成
└── 测试覆盖率提升到85%
```

---

## 六、验收标准

### 差错修复验收
- [ ] 所有前端测试通过（0 failed）
- [ ] Lint无错误（0 errors）
- [ ] 后端测试通过
- [ ] API端点全部返回200

### 功能测试验收
- [ ] AI功能端到端可体验
- [ ] 核心循环4页面无崩溃
- [ ] 数据加载时间 < 2秒
- [ ] AI响应时间 < 5秒

### 性能优化验收
- [ ] 首屏加载 < 3秒
- [ ] API P95 < 100ms
- [ ] LLM响应 < 5秒
- [ ] 内存使用稳定

### 代码质量验收
- [ ] 测试覆盖率 > 85%
- [ ] TypeScript严格模式通过
- [ ] 无未使用的导入/变量
- [ ] 代码审查通过

---

## 七、相关文件

- 测试配置：`frontend/vitest.config.ts`, `backend/vitest.config.ts`
- Lint配置：`eslint.config.js`
- TypeScript配置：`tsconfig.json`
- 性能监控：`frontend/src/components/Common/PerformanceMonitor.tsx`
