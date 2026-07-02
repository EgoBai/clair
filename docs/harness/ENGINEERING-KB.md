# 工程知识库 — Clair (澄观)

> 持续更新。每次 CAPTURE 阶段追加条目。

## 技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| 前端 | React 18 + TypeScript + Ant Design 5 + ECharts | Vite构建 |
| 后端 | Express.js + TypeScript + Knex.js | tsx运行 |
| 数据库 | PostgreSQL + 内存缓存 | 5544只A股 |
| AI | DeepSeek v4-pro (SSE流式) | 9个端点 |
| 数据源 | 腾讯行情API + 东方财富 | GBK编码 |
| 部署 | GitHub Pages + Cloudflare Workers | Actions CI/CD |

## 架构决策记录 (ADR)

### ADR-001: Vite Proxy 而非绝对URL
- **决策**: 前端API调用走Vite proxy，不用绝对URL
- **原因**: 开发环境localhost:5173→localhost:3001，生产环境走worker.js
- **结果**: 解决了大部分"功能不可用"问题
- **教训**: `VITE_API_BASE_URL`必须为空，Vite自动代理

### ADR-002: @shared路径别名
- **决策**: 后端import shared/用tsconfig path alias `@shared/*`
- **原因**: `createRequire(import.meta.url)`在vitest ESM transform下不解析
- **结果**: 测试和运行时都能正确解析
- **教训**: 不要用createRequire+相对路径

### ADR-003: LLM端点路径选择
- **决策**: `/api/ai/market-insight-llm` 而非 `/api/ai/market-insight`
- **原因**: Cloudflare Workers的worker.js拦截了 `/api/ai/market-insight`
- **结果**: 前端fallback机制：先LLM→失败则规则引擎
- **教训**: 生产Worker和本地后端路由要同步

### ADR-004: 单一入口路由
- **决策**: 所有路由在 `main.tsx` 定义，`App.tsx`是死代码
- **原因**: BrowserRouter在main.tsx中，App.tsx不参与路由
- **结果**: 新页面必须改main.tsx
- **教训**: 别碰App.tsx

## 编码规范

### TypeScript
- 0 TS错误是硬性要求（`npx tsc --noEmit`）
- 不用 `any`，用具体类型或 `unknown`
- 接口定义在使用前，不在函数内部

### React
- 组件用 `React.memo` 优化渲染
- `useCallback`/`useMemo` 用于频繁调用的函数
- 状态提升到最小必要层级

### 样式
- 暗色主题：BG=#0f172a CARD=#1e293b
- 红涨绿跌：UP=#cf2a2a DOWN=#1db468
- 文字：主=#f8fafc 副=#94a3b8 弱=#64748b
- 禁止白色背景、浅色元素泄漏
- 响应式：Mobile-First + CSS breakpoint

### 测试
- 前端：vitest + @testing-library/react
- 后端：vitest + supertest
- 每个功能必须有测试
- 测试通过是提交的硬性条件

## 性能预算

| 指标 | 目标 | 当前 |
|------|------|------|
| 首屏加载 | < 3s | ~2.5s |
| API P95 | < 100ms | ~80ms |
| LLM响应 | < 5s | ~3s |
| 测试运行 | < 3min | ~2min |
| 构建时间 | < 1min | ~40s |

## 关键陷阱

| 陷阱 | 症状 | 解决 |
|------|------|------|
| Vite缓存 | 改TSX后页面不更新 | `rm -rf node_modules/.vite` |
| numeric字符串 | 算术结果不对 | `parseFloat(String(v))` |
| GBK编码 | 中文乱码 | `new TextDecoder('gbk')` |
| auto-sync | git status干净但有未保存改动 | `git log` 确认 |
| Ant Design inline | 样式被覆盖 | CSS class + `!important` |
| PostgreSQL null | 字段为null时崩溃 | null检查 |
