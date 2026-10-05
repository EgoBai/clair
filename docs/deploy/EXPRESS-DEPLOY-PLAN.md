# 生产架构 A 部署方案（完整 Express → 托管平台）

> 决策来源：用户 2026-10-06 拍板「生产架构：A 部署 Express 到托管平台」，已登记 `DECISION_LOG.md`。
> 主理人执笔；本文件只做**方案与契约**，平台最终选型仍需用户拍板（见 §四）。

## 一、为什么要动（根因，非代码质量问题）

| 事实 | 证据 | 后果 |
|---|---|---|
| 生产域名 `clair-api.pages.dev` 实际是 **Cloudflare Worker** | `clair-worker/worker.js` 4390 行、硬编码约 24 路由 + 兜底 404；`/health` 返回 `service: clair-worker` | 前端所有非白名单端点生产 404 |
| 完整 Express 后端**从未上生产** | `routeAutoRegistry.ts` 实测 241 端点、`/health` 横幅 v1.7.0；`:3001` 本地实例可全通 | 用户体感「页面内容不完整 / 部分数据不可用」 |
| 前端生产默认 API base 指向该 Worker | `frontend/src/main.tsx:8-10`：`/api/*` → `VITE_API_BASE \|\| 'https://clair-api.pages.dev'` | 14/23 端点生产 404（T-2610-05 矩阵） |

**结论**：这不是后端代码缺陷，是**供给面缺位**。在把 Express 部署上去之前，修再多的端点也进不了生产。

## 二、本轮已打通的可部署产物（实测，未验证即不算数）

| 项 | 状态 | 实测证据 |
|---|---|---|
| `backend/Dockerfile` | 重写（原版从未被验证过：单阶段 `npx tsx src/index.ts` + devDeps 全入镜像） | 见下「踩过的三堵墙」 |
| `backend/package.json` → `build:prod` | 新增 | esbuild 0.21.5 bundle → `dist/server.cjs` 1.1MB |
| `backend/package.json` → `start` | 修 | 原 `"start": "node dist/index.js"` **指向不存在的文件**（`dist/index.js` 根本不存在，tsc 产物实际在 `dist/backend/src/index.js`）——生产跑 `npm start` 会立刻崩，此前被「一直在用 `npm run dev`（tsx）」掩盖 |
| 产物可启动 | ✅ | `PORT=3999 node dist/server.cjs` → `/health` 返回 `version:1.7.0` + `dbType:postgres` + `connected:true` |

**踩过的三堵墙（记录以防回退）**：
1. **路径错**：tsconfig 未设 `rootDir`，`../shared` 被纳入编译把公共根抬到仓库根 ⟹ 产物是 `dist/backend/src/index.js`，不是 `dist/index.js`。
2. **ESM 扩展名错**：产物为 ESM 而源码相对 import 不带扩展名 ⟹ Node 报 `ERR_MODULE_NOT_FOUND`。
3. **别名运行期不存在**：`@shared/*` 只是 tsc 类型别名 ⟹ `Cannot find module '@shared/industryClassification'`。

⟹ 因此生产产物走 **esbuild bundle（CJS 单文件）**，而非 tsc 产物；`--packages=external` 让依赖仍走 `node_modules`。**勿改回 tsc 产物直接运行。**

## 三、部署基本面：三件事，缺一不做

1. **容器**（已就绪）：`backend/Dockerfile` 多阶段构建 → 运行镜像内无源码、无 devDeps，非 root 用户，内置 HEALTHCHECK。
2. **数据库**（**尚未准备，最大缺口**）：当前生产数据只在**本机** `localhost:5432` 的 PostgreSQL（`daily_quotes` 支撑 coverage 5541 / observations 639108）。托管平台必须配到 **托管 PG**（平台内置 或 Neon/Supabase/RDS 等外部源），并用 `pg_dump` 迁移一次。
   - ⚠️ 若只搬容器不搬数据：进程不崩，但会退回内存库 → 全站诚实空态。**这比现在更差**（现在至少 24 端点有数据），因此数据迁移是部署的**硬前置**，不是可选项。
3. **前端指向**（一处改）：`frontend/src/main.tsx:8-10` 生产默认 base 改指托管域名（建议优先用 `VITE_API_BASE` 环境变量构建，不硬改默认值，便于回滚）。

## 四、平台选型对比（待用户拍板 · 评估维度：免费额度 / 国内可达 / PG 内置 / 冷启动）

| 平台 | 免费档 | 国内可达 | PG 内置 | 备注 |
|---|---|---|---|---|
| **Railway** | 有试用额度，后续按量 | 一般（需自建国内可达链路评估） | ✅ 内置 PostgreSQL | (1) 配置最省事，Dockerfile 直接可跑 |
| **Render** | 自由层（有休眠冷启动） | 一般 | ✅ 内置 PostgreSQL | (2) 国内访问性与 Railway 同档，需实测定 |
| **Fly.io** | 小额赠金 | 一般 | ✅ 内置 Postgres | (3) 冷启动最快，配置最重 |
| Cloudflare Workers + D1 | — | — | D1（非 PG） | 与 Express 不相容，排除 |

**主理人建议**：先选 **Railway**（配置最轻、PG 内置、Dockerfile 零改可直接跑），但在**国内可达性**上必须先实测——Clair 是面向国内用户的产品，托管平台若国内打不开，等于把 404 换成超时。建议先各跑一个最小 hello 实例测国内延迟与连通，再定。

## 五、环境变量契约（容器必需）

| 变量 | 必填 | 缺省后果 |
|---|---|---|
| `PORT` | 否 | 默认 3001（与代码 `index.ts:15` 一致） |
| `DATABASE_URL` | **建议必填** | 退回内存库 → 诚实空态（不崩、不伪造） |
| `JWT_SECRET` | **建议必填** | 当前日志明确告警：「未配置即生成一次性随机密钥，**重启后所有令牌失效**」 |

另需：WebSocket（后端 `ws://` 已启用，托管平台需确认 WebSocket 支持，Railway/Render 均支持）。

## 六、上线验收清单（四证，不做完不算上线）

1. **grep 证**：`backend/Dockerfile` 存在且 CMD 为 `node dist/server.cjs`；`package.json` 无 `dist/index.js` 残留指向。
2. **读文件证**：Dockerfile 三阶段deps/build/run 齐备；健康检查路径与 `PORT` 一致。
3. **构建证（本地预演）**：`cd backend && npm run build:prod` → `dist/server.cjs` 生成；`node dist/server.cjs` + `curl /health` 返回 healthy + `dbType:postgres`。
4. **e2e 渲染断言**：容器起后逐条实测此前 14 个 404 端点（ Industr y / etf / sectors / fund-flow / factors / screener …）**生产可达且返回真实或 `dataSource:'unavailable'` 的诚实标注**——不允许再出现裸 404，也不允许「200 但内容是空壳」。

## 七、回滚与 clair-worker 退役条件

- **回滚**：前端切回 `VITE_API_BASE=https://clair-api.pages.dev` 重新构建即可（一改一构即回旧态）；容器保留旧镜像再启一次亦可。
- **近期不删 `clair-worker`**：它继续作兜底。托管平台冷启动 / 账单事故 / 数据迁移窗口期都可能造成全站不可达，Worker 在还能 24 路由就留着当保险。
- **退役条件（同时满足才动）**：① 托管平台稳定 ≥ 14 天、每日可用率 ≥ 99%；② 此前 14 个 404 端点生产实测全部通过验收清单；③ 数据库每日自动备份且有近 7 天可恢复点。否则保持双轨。

## 八、已知风险（写进台账，不做乐观假设）

1. **国内可达性未验**（最高）：平台选型前无法确认，可能直接决定方案成败。
2. **数据迁移窗口**：`pg_dump` 大表导入时长未知，需在低峰执行并留回退脚本。
3. **WebSocket 与长连接**：托管平台可能有闲置杀连；需实测订阅是否掉线。
4. **定时任务**：`DataSyncService` 每 300s 拉腾讯 API（本机实测已 403），生产环境网络策略不同，可能更严；需在生产重测并配降级标记。
5. **前端构建产物切换**：`VITE_API_BASE` 变更需重新构建前端并验证 SPA 全路径（注意 `curl` 对 SPA 全路径恒 200，**不能**用 curl 判可用，必须渲染断言）。
