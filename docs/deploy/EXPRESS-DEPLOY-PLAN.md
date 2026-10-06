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
6. **配置双源残留（P0-CONFIG 现状）**：代码侧的 pages.dev 默认值已删除，但 `.github/workflows/deploy.yml:33` 仍写着 `vars.VITE_API_BASE || 'https://clair-api.pages.dev'`。即**GitHub variable 缺失时不会构建失败，而是回落到 Worker 地址**。这是本清单第 5 步必须收口的原因（见 §九.3）。

---

## 九、后端切换上线清单（Checklist）

> 目标：把 Express 后端真正切到线上，并让「本地 = 线上」可核验。
> **顺序不可颠倒。** 每步都给了可验证判据；判据不通过就停在当前步，不要往下走。
> 前置阅读：§三（部署基本面）、§六（四证）、§七（回滚条件）。

### 步骤 0：切换前的硬性禁止项（任一命中即**不允许**开始切换）

| # | 禁止条件 | 为什么 |
|---|---|---|
| 1 | 生产烟测未通过（存在 NOT_FOUND / ERROR / MALFORMED / UNREACHABLE / VERSION_MISMATCH 任一） | 切过去等于把已知坏状态推给用户 |
| 2 | 数据未迁移、`DATABASE_URL` 未指向托管 PG | 进程不崩但**退回内存库 → 全站诚实空态**，比现在更差（现在 Worker 尚有 24 路由数据） |
| 3 | `JWT_SECRET` 未配置 | 重启即全体令牌失效；生产缺失时后端直接 FATAL 拒绝启动 |
| 4 | 前端 `VITE_API_BASE` 未指向新后端 | **这一步不做，前面全白做**（详见步骤 5 的警告） |
| 5 | 托管平台国内可达性未实测 | Clair 面向国内用户，打不开等于把 404 换成超时 |

### 步骤 1：托管平台 + 托管 PostgreSQL 就绪

- 平台侧创建服务，绑定 PG 实例；确认平台支持 WebSocket（后端 `ws://` 已启用）。
- 配置平台环境变量：`DATABASE_URL`、`JWT_SECRET`、`NODE_ENV=production`（完整清单见根目录 `.env.example`）。
- **判据**：
  - `GET /health` 返回 `dbType: "postgres"` 且 `connected: true`（若为内存库，说明 `DATABASE_URL` 没生效）。
  - `GET /health` 返回 `service: "clair-backend"`（若返回 `clair-worker`，说明请求还打在 Worker 上，尚未切换）。
- 数据迁移（**必须在切换前完成**）：`pg_dump` 本机 `localhost:5432` → 导入托管 PG，保留回退脚本。
  - 本机现有数据规模参考：`daily_quotes` coverage 5541 / observations 639108。
  - 迁移后**在托管 PG 上直接核对**行数与最新日期，不要只看导入命令的退出码。

### 步骤 2：部署后端容器

- 已实测可用的产物路径：`npm run build:prod`（esbuild bundle → `dist/server.cjs`）+ `backend/Dockerfile`。
- 镜像构建走 `deploy-backend.yml`（`workflow_dispatch`，产物推 GHCR，tag 携带 commit）。
- 镜像构建参数已包含 `GIT_COMMIT_SHA`（`deploy-backend.yml` 的 `build-args`）。
- **判据**：容器 `/health` healthy；平台日志无启动即崩。
  - ⚠️ 勿改回 tsc 产物直接运行（§二「踩过的三堵墙」记录了路径/扩展名/别名三个坑）。

### 步骤 3：版本一致性核对（自报 commit == 镜像 tag 的 sha）

```bash
curl -s https://<新后端>/api/version
```

- **判据**：
  - `commit` 非 null，且等于镜像 tag 里的短 sha（`deploy-backend.yml` 用 `${image_ref##*-}` 作为默认期望值）。
  - `commitKnown: true`、`commitShort` 与 tag 一致。
  - `service: "clair-backend"`。
- 若 `commit` 为 `null`：说明 `GIT_COMMIT_SHA` 没注入。后端**绝不伪造** commit（这是有意的），此时版本一致性无从核对，必须先修注入再继续。

### 步骤 4：跑生产烟测（切换前端**之前**）

```bash
node scripts/smoke/production-smoke.mjs --base https://<新后端> --expect-commit <短sha> --strict
```

- **判据**：退出码 0；报告中 NOT_FOUND / ERROR / MALFORMED / UNREACHABLE / VERSION_MISMATCH 均为 0。
- `--strict` 下任一类命中即失败，不允许「先切了再慢慢看」。
- 建议先把 `BACKEND_SMOKE_BASE_URL` 配成 GitHub 仓库级 Actions variable，让这条烟测在每次部署后自动跑（未配置时该 job 呈 **skipped**，不会伪装成绿色）。

### 步骤 5：切换前端 `VITE_API_BASE` 并重新构建部署（**最容易被跳过、后果最严重的一步**）

> ⚠️ **警告：后端部署好了 ≠ 线上生效了。**
> 前端把 `/api/*` 重定向到后端靠的是构建期注入的 `VITE_API_BASE`。
> 如果前端仍指向 `https://clair-api.pages.dev`（Worker），
> 那么用户在页面上看到的仍是 Worker 的 24 路由 + 其余全 404，
> **而后端部署等于完全白做**，且没有任何报错提示你。

- 做法（任选其一，建议 ①）：
  1. 在 GitHub 仓库 Actions variable 里把 `VITE_API_BASE` 改为新后端域名，push 触发 `deploy.yml` 自动构建部署；
  2. 本地 `VITE_API_BASE=https://<新后端> npx vite build --mode github` 后部署 `dist/`。
- **顺带收口 §八.6 的残留双源**：把 `deploy.yml:33` 的
  `vars.VITE_API_BASE || 'https://clair-api.pages.dev'`
  改成**不回落的写法**（直接用 `${{ vars.VITE_API_BASE }}`）。
  理由：`main.tsx` 侧的默认值已删除、生产构建已强制显式配置，
  工作流里再留一个 pages.dev 兜底，等于把「漏配静默回落」的后门重新装上。
  （此文件属`.github/workflows/**`，需由该域负责人改动。）
- **判据**：构建**成功**。漏配时构建会**直接失败**并打印：
  `[plugin clair-require-api-base] [config] 生产构建缺少 VITE_API_BASE，已中止。`
  ——这正是预期的快速失败，不要用加兜底的方式"修好"它。
  校验发生在 `frontend/vite.config.ts` 的 plugin（`buildStart` 阶段），
  **dev（`vite dev`）不校验**，本地开发照常走 proxy。
  ⚠️ 注意注入方式有三种都能生效：GitHub Actions variable、
  shell 环境变量、或 `frontend/.env`（实现用了 `loadEnv`，三者都认）。

### 步骤 6：切换后二次核验

- **判据（全部满足才算上线完成）**：
  1. 对**新后端**再跑一次步骤 4 的烟测，仍全部通过；
  2. 浏览器打开线上站点，页面版本指示器显示的 commit == 镜像 tag 的 sha；
  3. 此前 14 个 404 端点在页面上可正常取数（或显示诚实的 `dataSource:'unavailable'` 标注）；
  4. Network 面板里 `/api/*` 请求的 `Host` 是**新后端**，不是 `clair-api.pages.dev`；
  5. WebSocket 连的是 `wss://<新后端>/ws`（`VITE_WS_URL` 未配时会回落 `127.0.0.1:3001`，实时功能静默失效）。
- ⚠️ 页面版本指示器依赖 `VITE_GIT_COMMIT_SHA`；`deploy.yml` 目前**没有**注入它，
  只能靠运行期回退读 `/api/version`。步骤 5 完成前这条路读不通，
  故建议同时在 `deploy.yml` 注入 `VITE_GIT_COMMIT_SHA` 与 `VITE_BUILD_TIME`。

### 步骤 7：回滚方案

- **回滚触发条件**：切换后出现① 烟测大面积失败；② 关键页面空白/报500；③ 数据异常（迁移不完整）；④ 国内访问超时。
- **回滚动作（按代价从低到高）**：
  1. 前端把 `VITE_API_BASE` 切回 `https://clair-api.pages.dev` 并重新构建部署 —— 一改一构即回旧态，**秒级级恢复可用**；
  2. 容器保留旧镜像，需要时再启一次；
  3. 数据侧若迁移有问题，用 `pg_dump` 回退脚本还原。
- **保留 Worker 兜底的判断条件**：托管平台冷启动、账单事故、数据迁移窗口期内，一律**保持 Worker 在线**。
  仅当§七「退役条件」三条同时满足才下线 Worker。

### §九.3 单一真源现状（配置收敛小结）

| 环境变量 | 真源位置 | 漏配后果 |
|---|---|---|
| `VITE_API_BASE` | 构建时注入（GitHub Actions variable /本地 shell） | ✅ **生产构建直接失败**（`main.tsx` 已强制，无代码侧默认值） |
| `VITE_API_BASE_URL` | 同上（可选，回落 `/api`） | axios 走相对路径，由 fetch wrapper 兜住 |
| `VITE_WS_URL` | 同上（可选） | ⚠️ 回落到 `127.0.0.1:3001`，线上静默失效 |
| `DATABASE_URL` / `JWT_SECRET` | 平台环境变量 / Secrets | 见根目录 `.env.example`逐条说明 |
| `BACKEND_SMOKE_BASE_URL` | GitHub Actions variable | smoke job 呈 skipped（灰色），非绿色 |
| `pages.dev` 默认地址 | ⚠️ 仅剩 `deploy.yml:33` 一处兜底 | 建议按步骤 5 收口为不回落的写法 |

完整变量契约（用途 / 必填性 / 缺失后果 / 示例）见仓库根目录 **`.env.example`**。
