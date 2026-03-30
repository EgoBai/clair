# Round 90-95: OpenAPI 规范完善 / 文档端点

## 完成内容

### Round 90: API 文档端点模块
- 创建 `backend/src/api/api-docs.ts`
- 提供 6 个文档端点：
  - `GET /api-docs` — Swagger UI（CDN 加载，无额外依赖）
  - `GET /api-docs/redoc` — ReDoc 文档页面
  - `GET /api-docs/openapi.json` — OpenAPI 3.0.3 JSON 规范
  - `GET /api-docs/openapi.yaml` — YAML 格式规范
  - `GET /api-docs/info` — 文档摘要（路径数、schema数、标签）
  - `GET /api-docs/endpoints` — 端点清单（程序化消费）

### Round 91: 路由自动注册
- 创建 `backend/src/docs/routeAutoRegistry.ts`
- 维护 `pathMetadata` 映射表，覆盖 100+ 端点的 tag/summary/description/auth
- `initApiDocs()` 自动注册所有标签和路由到 OpenAPI 文档
- 集成到 api-docs.ts，启动时自动初始化

### Round 92: 增强 OpenAPI schemas
- 新增 User、ETF、BlockTrade、AIRecommendation、PerformanceOverview、HealthStatus 等 schema
- 所有 schema 均在 openApiGenerator.ts 的 components.schemas 中定义

### Round 93: 测试覆盖
- 创建 `backend/src/__tests__/apiDocsEndpoint.test.ts`
- 25 个测试覆盖：
  - OpenAPI 规范生成完整性
  - 路由注册中心（注册/去重/标签筛选/clear）
  - 自动注册（标签数、端点数、核心路径、认证标记）
  - 规范完整性（所有操作有 summary/tags/responses）

### Round 94: 版本更新
- 后端版本升级至 v1.7.0
- 根路径响应新增 docs 对象，列出所有文档端点
- 启动 banner 更新，显示 Swagger UI / ReDoc / OpenAPI JSON 地址

## 关键设计决策

1. **CDN 加载 Swagger UI / ReDoc** — 不安装 swagger-ui-express 等包，通过 CDN 引入，减少依赖
2. **路由自动注册** — 通过 pathMetadata 映射表集中管理，避免逐文件修改
3. **双格式输出** — 同时提供 JSON 和 YAML，满足不同工具链需求
4. **测试驱动** — 25 个测试保证文档系统稳定性

## 测试结果
- 648 个测试文件通过 (1 skipped)
- 17799 个测试通过 (14 skipped)
- 新增 25 个文档端点测试

## API 文档端点清单
| 端点 | 格式 | 用途 |
|------|------|------|
| /api-docs | HTML | Swagger UI 交互式文档 |
| /api-docs/redoc | HTML | ReDoc 静态文档 |
| /api-docs/openapi.json | JSON | OpenAPI 3.0.3 规范 |
| /api-docs/openapi.yaml | YAML | OpenAPI 规范(YAML) |
| /api-docs/info | JSON | 文档摘要统计 |
| /api-docs/endpoints | JSON | 端点列表(可编程) |
