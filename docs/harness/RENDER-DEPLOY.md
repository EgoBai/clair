# Render 部署手册（澄观 Clair 完整 Express 后端）

> 目标：把本地跑通的**完整 Express 后端（241 端点）**连同**历史行情数据**搬到 Render，
> 替掉生产上那个只挂了约 24 条路由的 Cloudflare Worker（`clair-api.pages.dev`）。
>
> 本文所有数字均来自本机真实执行或官方页面实读，**未经实测的部分已显式标注「估算」**。
> 配套物料：`render.yaml`（Blueprint）、`scripts/deploy/render-migrate-data.sh`（数据迁移）。

- 编写日期：2026-10-26
- 相关 commit：`e4d9da928`（后端容器化就绪 + `/health` 诚实降级契约）
- 官方数据来源：`render.com/docs/compute-plans`、`render.com/pricing`、`render.com/docs/regions`、
  `render.com/docs/blueprint-spec`、`render.com/docs/postgresql-creating-connecting`、
  `render.com/docs/postgresql-extensions`（均于 2026-10-26 实读）

---

## 0. 一句话结论与三条硬约束

**结论**：Render 可以跑完整后端，方案可行。三条硬约束决定了整套配置：

1. **必须配 `DATABASE_URL`**。不配后端不崩，但会**静默降级到内存库**，
   `/health` 返回 `dbType='memory'` / `degraded=true` / `dataSource='unavailable'`，
   生产模式下行情类端点直接 503 —— 用户侧看到的就是「功能不可用」。
   PG 不是可选项。
2. **必须迁数据**。Render 刚建出来是**空库**。连上空库的后端 `dbType` 是 `postgresql`
   看着正常，但查不出任何行情，与内存库在用户侧等价。历史数据必须搬过去。
3. **`JWT_SECRET` 必填**。`NODE_ENV=production` 下缺失或长度 < 32 → 进程**启动即失败**
   （`resolveJwtSecret` 刻意 fail-fast）。`render.yaml` 用 `generateValue: true` 生成
   256-bit base64（44 字符），天然满足。

---

## 1. 本地数据现状盘点（真实执行，非推断）

执行环境：本机 PostgreSQL 15.17（Homebrew），socket `/tmp`，
启动命令 `pg_ctl -D /opt/homebrew/var/postgresql@15 -l /tmp/pg-startup.log start`。
psql 不在 PATH，需 `export PATH=/opt/homebrew/opt/postgresql@15/bin:$PATH`。

### 1.1 候选库清单（`psql -c "\l"`）

```
        Name         |   Owner    | Encoding |   Collate   |    Ctype    
---------------------+------------+----------+-------------+-------------
 a_stock             | ego_bai    | UTF8     | en_US.UTF-8 | en_US.UTF-8
 astock              | ego_bai    | UTF8     | en_US.UTF-8 | en_US.UTF-8
 clair               | ego_bai    | UTF8     | en_US.UTF-8 | en_US.UTF-8
 clair_stalepx_clone | ego_bai    | UTF8     | en_US.UTF-8 | en_US.UTF-8
 clair_stalepx_pre   | ego_bai    | UTF8     | en_US.UTF-8 | en_US.UTF-8
 mediaforge_db       | mediaforge | UTF8     | ...         | ...
 postgres            | ego_bai    | ...      | ...         | ...
(9 rows)
```

库体积（`SELECT pg_size_pretty(pg_database_size(...))`）：

| 数据库 | 体积 | 判定 |
|---|---|---|
| `clair` | **146 MB** | ✅ **真源** |
| `a_stock` | 8343 kB | ❌ 只有 `stocks` 49 行，测试/残留 |
| `astock` | 8247 kB | ❌ 全表 0 行，空壳 |

### 1.2 行数量化（`SELECT count(*)` 逐表实测）

`clair` 库（21 张表，含历史清洗过程留下的归档表）：

| 表名 | 行数 | 说明 |
|---|---:|---|
| daily_quotes | **503,534** | 历史日行情，主表 |
| daily_quotes_turnover_unit_bak_20261016 | 60,266 | 归档，不迁 |
| archive_carrier_days_b2_20261020 | 15,557 | 归档，不迁 |
| daily_quotes_turnover_sci_bak_20261016 | 7,922 | 归档，不迁 |
| daily_quotes_intraday_bak_20261020 | 5,798 | 归档，不迁 |
| **stocks** | **5,546** | ✅ 要迁 |
| daily_quotes_turnover0_bak_20261021 | 1,256 | 归档，不迁 |
| **concepts** | **808** | ✅ 要迁 |
| archive_carrier_days_216 | 216 | 归档，不迁 |
| daily_quotes_idx18_bak_20261021 | 18 | 归档，不迁 |
| tmp_idxbleed_plan | 8 | 临时，不迁 |
| daily_quotes_xmport_905_bak_20261021 | 4 | 归档，不迁 |
| daily_quotes_turnover_orphan_bak_20261020 | 3 | 归档，不迁 |
| daily_quotes_idxbleed_905_bak_20261021 | 1 | 归档，不迁 |
| alerts / watchlist / money_flow / industries / market_snapshots / minute_quotes / collection_logs | 0 | ✅ 结构要迁，无数据 |

`a_stock` 库：仅 `stocks` 49 行，其余全 0。
`astock` 库：10 张表全 0 行。

**交叉验证**：`backend/.env` 的 `DATABASE_URL` 实际指向 `postgresql://…/clair`，
与上面的行数结论一致 → **`clair` 是唯一的真实数据源**。

### 1.3 `daily_quotes` 覆盖度（实测）

```
 total_rows | distinct_days |  earliest  |   latest   | distinct_stocks
------------+---------------+------------+------------+-----------------
     503534 |          1663 | 2001-01-18 | 2026-10-23 |            5212
```

### 1.4 还原后体量（实测，决定 Render 存储与内存选型）

在本地纯空库还原整套核心表后实测：

| 指标 | 实测值 |
|---|---|
| 还原后整库 | **112 MB** |
| `daily_quotes` 总计 | 102 MB（堆 66 MB + 索引 36 MB） |
| `stocks` | 2000 kB |
| `concepts` | 232 kB |

> 这条实测**推翻了「存储是选 basic-1gb 的理由」**的说法：112MB 连 1GB 都远远用不满。
> 选 `basic-1gb` 而不是 `basic-256mb` 的真实理由是**算力与内存**——
> `basic-256mb` 只有 256MB RAM，比 `daily_quotes` 自己的索引量（36MB）+ 热数据还紧张，
> 50 万行的排序/聚合频繁落盘，且 `pg_restore` 重建 4 个索引时极易顶到内存上限。

---

## 2. `render.yaml`（Blueprint）说明

已通过两个独立解析器验证语法规格正确（见 §8 证据 1）。关键取值理由：

| 字段 | 值 | 理由 |
|---|---|---|
| `services[].type` | `web` | 需要常驻 HTTP 服务 |
| `services[].runtime` | `docker` | 本项目构建依赖 esbuild bundle（`backend/package.json` 的 `build:prod`），已固化在 Dockerfile 里，不用平台原生 Node runtime |
| `services[].dockerfilePath` | `./backend/Dockerfile` | 容器化就绪产物（`e4d9da928`） |
| `services[].dockerContext` | `.` | **必须是仓库根**：Dockerfile 要 `COPY shared/` 与 `clair-worker/all_stocks_compact.json`，这两个在根下 |
| `services[].healthCheckPath` | `/health` | `backend/src/app.ts:358` 挂在**根路径** `GET /health`（不是 `/api/health`） |
| `services[].plan` | `starter` | 0.5 CPU / 512MB，$7/mo。⚠️ 见下方风险 |
| `databases[].plan` | `basic-1gb` | 0.5 CPU / 1GB RAM / 100 连接，$19/mo。理由见 §1.4 |
| `databases[].postgresMajorVersion` | `'15'` | 与本地源库 15.17 同主版本；Render 支持 13~18 |
| `databases[].region` | `singapore` | 见 §7 区域讨论 |
| `databases[].diskSizeGB` | `5` | 实测用量 112MB；**存储只能增不能减**，先给 5GB 留 45 倍余量 |
| `DATABASE_URL` | `fromDatabase.connectionString` | 同区域走私有网络，密钥不进 git |
| `PORT` | **不设置** | Render 自行注入 `PORT`，写死会覆盖平台动态值 |

⚠️ **512MB web service 的风险（如实说明）**：这是 Render 最便宜档，Node + Express + knex
的实际驻留内存在这个量级附近浮动。若上线后出现 OOM 重启或响应变慢，
把 `plan` 改成 `1c-2g`（$25/mo，2GB RAM）即可，是一次 Dashboard 点击 + 自动重新部署，
不需要重做数据迁移。

### `envVars` 清单与「留空会怎样」

| 变量 | 取值方式 | 留空的后果 |
|---|---|---|
| `NODE_ENV` | 固定 `production` | 走 development 分支 → 错误详情泄漏、CORS 白名单失效、生产拒供伪造数据开关不生效 |
| `HOST` | 固定 `0.0.0.0` | 默认值同为 `0.0.0.0`，但显式写死可让「监听哪个网卡」成为镜像自带的可审计事实 |
| `DATABASE_URL` | `fromDatabase` | **静默降级内存库**，`/health` 报 `degraded=true` |
| `JWT_SECRET` | `generateValue` | **进程启动即失败**（fail-fast），部署卡在 health check |
| `CORS_ORIGINS` | `sync: false`（Dashboard 手填） | Cloudflare Pages 的 `*.pages.dev` 域名不在内置静态白名单里 → 浏览器端请求被 CORS 拒。**必填** |
| `DB_POOL_MAX` | 固定 `10` | 默认 20；Render 无内置连接池器、上限 100 连接，压到 10 留出扩容余量 |
| `APP_VERSION` / `LOG_LEVEL` | 固定值 | 不影响可用性 |
| `AI_PROVIDER` / `DEEPSEEK_BASE_URL` / `DEEPSEEK_MODEL` | 固定值 | 不影响可用性 |
| `DEEPSEEK_API_KEY` | `sync: false` | AI 相关功能诚实降级为不可用，**不会**伪造回答 |
| `TUSHARE_TOKEN` | `sync: false` | 资金流主源不可用，降级到其它源或诚实报 unavailable |

`sync: false` 的含义：不在 git 里存值，Blueprint 首次创建时 Render 在 Dashboard **提示你输入**。

**已知诚实空值（不伪造，特此声明）**：后端读取 commit 的 5 个候选变量是
`GIT_COMMIT_SHA` / `BUILD_COMMIT` / `SOURCE_COMMIT` / `CF_PAGES_COMMIT_SHA` / `VERCEL_GIT_COMMIT_SHA`，
Render 注入的自有变量名（`RENDER_GIT_COMMIT_SHA`）不在其中，
故本方案上线后 **`/health` 的 `build.commit` 与 `buildTime` 预期为 `null`**。
要填实需要改 `backend` 源码的候选列表 —— 属源码域，不在本工单文件域内，记为后续工单。

---

## 3. 部署操作手册（Render 侧）

### 3.1 建 Blueprint

1. 登录 <https://dashboard.render.com> → **New +** → **Blueprint**。
2. 连接 GitHub 仓库；**Region 选 Singapore**（此处选的区域会作为 Blueprint 的默认，
   `render.yaml` 里每个资源也各自写死了 `region: singapore`，两边保持一致即可）。
3. 选中仓库后 Render 自动发现根目录的 `render.yaml`，列出待创建资源：
   - Postgres：`clair-db`
   - Web Service：`clair-api`
4. 点击 **Apply**。Render 会：
   - 先建 Postgres（约 1–2 分钟）
   - 再拉仓库、**用 `./backend/Dockerfile` 在仓库根上下文构建镜像**
   - 首次构建预计 3–8 分钟（三阶段：deps → build → run，含两次 `npm ci` 和 esbuild bundle）
5. ⚠️ 创建时若 `sync: false` 的变量未填，此时会在 Dashboard 弹框要求输入
   —— `DEEPSEEK_API_KEY` / `TUSHARE_TOKEN` 可以直接留空，但 **`CORS_ORIGINS` 建议此时就填**
   （填前端的 origin，例如 `https://clair.market,https://xxx.pages.dev`）。
6. 部署完成后，在 Web Service 的 **Settings → Health & Alerts** 确认 Health Check Path 是 `/health`。

### 3.2 拿到 External Database URL

Postgres `clair-db` → **Info / Connect** 页 → 复制 **External Database URL**（形态
`postgresql://user:pass@<host>.singapore-postgres.render.com:5432/<db>`）。

> 必须是 **External**：数据迁移是从**本机**发起的，本机不在 Render 私有网络内，
> 用 Internal URL 连不通。而服务运行时用 `render.yaml` 里的 `connectionString`（内网）更优，
> 两者并存、各司其职。
>
> 若 Render 侧配了 `ipAllowList`，需先把本机公网 IP 加进去，否则 psql 连不上。

---

## 4. 部署后冒烟验证

> ⚠️ 若在本机起后端做回环验证，`curl` 会被 `HTTPS_PROXY` 拦截返回 502，
> 必须加 `--noproxy '*'`。验证 Render 线上域名时一般不需要，但踩过就写在这里。

### 4.1 第一步：健康端点（判定是否降级）

```bash
DOMAIN=https://clair-api.onrender.com   # 换成 Render 实际给的域名
curl -sS --noproxy '*' "$DOMAIN/health" | jq
```

**必须同时满足三个条件**（任一不满足就是没配好，不要往下走）：

| 字段 | 期望值 | 不满足说明 |
|---|---|---|
| `dbType` | `"postgresql"` | `memory` → DATABASE_URL 没生效 |
| `degraded` | `false` | `true` → 已降级，先修 DB 再看业务 |
| `dataSource` | `"real"` | `unavailable` → 无真实数据源 |

### 4.2 第二步：真实业务端点（验证「有数据」而不只是「通」）

以下端点都是从 `backend/src` 里挑出来的、确实读库的路径：

```bash
# 1) 股票搜索 —— 读 stocks 表（期望 results 非空）
curl -sS --noproxy '*' "$DOMAIN/api/search?q=%E8%B4%B5%E5%B7%9E%E8%8C%85%E5%8F%B0" | jq '.data.results[0:2]'

# 2) 最新行情 —— 读 daily_quotes（期望有价格、非 null）
curl -sS --noproxy '*' "$DOMAIN/api/stocks/600519/latest" | jq '.data'

# 3) 涨幅榜 —— 读 daily_quotes 做聚合（期望返回数组）
curl -sS --noproxy '*' "$DOMAIN/api/market/top-gainers?limit=5" | jq '.data'
```

判定标准：返回 200 **且** `dataSource` 为 `real` **且** 数据非空。
若返回空/不可用，优先回到 `/health` 看 `degraded` 字段。

### 4.3 第三步：确认版本自洽（可选）

```bash
curl -sS --noproxy '*' "$DOMAIN/api/version" | jq
```

注意：`build.commit` 预期为 `null`（见 §2 的诚实空值声明），这**不是**故障。

---

## 5. 数据迁移

### 5.1 执行

```bash
export PATH=/opt/homebrew/opt/postgresql@15/bin:$PATH

# 1) 先跑 dry-run，确认计划（不落盘、不连任何数据库）
scripts/deploy/render-migrate-data.sh \
  --source-db clair \
  --target-url 'postgresql://user:pass@<render-host>:5432/<db>' \
  --out /tmp/clair-migrate.dump \
  --dry-run

# 2) 正式跑（导出 + 还原 + 自动行数校验）
scripts/deploy/render-migrate-data.sh \
  --source-db clair \
  --target-url 'postgresql://user:pass@<render-host>:5432/<db>' \
  --out /tmp/clair-migrate.dump
```

> **已备好的现成 dump**：`/tmp/clair-render-ready.dump`（20MB，2026-10-26 由本脚本
> `--dump-only` 生成，内容即上面 row count 那一份）。可直接跳到还原步骤使用；
> 但如果此后本机 `clair` 库又被写过数据（补 K 线、清洗等），请重新生成，不要用它 —— 会过期。
> `/tmp` 重启会清空，别把它当长期备份。

若只想先拿到 dump 文件（比如要人工检查），加 `--dump-only`。
若确实要连归档表一起搬，加 `--mode full`（不推荐，理由见 5.4）。

**实测基准（本机，2026-10-26）**：

| 环节 | 实测值 |
|---|---|
| `pg_dump -Fc` 核心表（10 表 + 4 视图） | **20 MB（20,923,433 bytes），2.37 s** |
| `pg_dump -Fc` 整库（21 表） | 22 MB（22,956,158 bytes），2.73 s |
| `pg_restore --clean --if-exists` 到本地 | **2.0 s** |
| 脚本全流程（导出→校验→还原→行数校验） | 2 s + 2 s，共约 4 s |
| 还原后整库落盘 | 112 MB |

**跨公网还原到 Render 的耗时：估算 1–5 分钟**（无 Render 账号，未实测）。
瓶颈不在数据量（20MB dump）而在 Render 侧 `basic-1gb` 的 0.5 CPU 建 4 个索引，
以及跨洋往返延迟。首次执行建议前台跑并盯着输出。

### 5.2 导入后校验 SQL

脚本会自动打印，也可手工再跑一遍：

```sql
SELECT count(*) FROM stocks;              -- 期望 5546
SELECT count(*) FROM daily_quotes;        -- 期望 503534
SELECT count(*) FROM concepts;            -- 期望 808
SELECT max(trade_date) FROM daily_quotes; -- 期望 2026-10-23
SELECT count(DISTINCT stock_id) FROM daily_quotes; -- 期望 5212
```

行数完全一致即可进入下一步（切前端）。

### 5.3 一个必须知道的前提（实测发现）

本机实测：直接 Restore 会报

```
pg_restore: error: could not execute query: ERROR:  function public.update_updated_at() does not exist
Command was: CREATE TRIGGER trigger_stocks_updated_at BEFORE UPDATE ON public.stocks
             FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
```

原因：`pg_dump -t <table>` 会带出**触发器**，但**不会**带出它依赖的函数。
不加处理的话 TRIGGER 建不出来（数据照样落库，但触发器缺失）。

迁移脚本已在还原前用幂等的 `CREATE OR REPLACE FUNCTION` 预置了
`update_updated_at()` 与 `update_updated_at_column()`。实测补上后 **零报错**，
触发器正常落地。**请不要绕过脚本手工执行 `pg_restore`。**

### 5.4 为什么默认 `--mode core` 而不是整库

整库 dump 的 TOC 里含 `CREATE EXTENSION dblink`（本机确有该扩展）。
Render 虽然在 PG 13+ 的支持扩展清单里**有** dblink，但还原时要由部署脚本/人工触发，
多一层失败面；更重要的是整库会把 11 张归档表（91,049 行）搬到线上占空间。
默认 `core`（10 张业务表 + 4 个视图）是更干净的选择。

---

## 6. 前端切换

**单一真源是 `VITE_API_BASE`**。有两道守卫防漏配：`frontend/vite.config.ts:82`
的构建期守卫（生产构建缺 `VITE_API_BASE` 直接失败），以及 `frontend/src/main.tsx:53`
的运行期守卫（万一漏过构建，页面直接报错而不是静默指错后端）。这是刻意设计。

### 6.1 需要改的地方（共 3 处，第 3 处容易被漏）

| # | 位置 | 当前值 | 改成 |
|---|---|---|---|
| 1 | GitHub 仓库 → Settings → Secrets and variables → Actions → **Variables** 页的 `VITE_API_BASE` | 旧值 | `https://clair-api.onrender.com` |
| 2 | 本地 `frontend/.env` 的 `VITE_API_BASE` | 无此行（dev 走 Vite proxy，无需配） | 仅当本地要直连线上时才写 `VITE_API_BASE=https://clair-api.onrender.com`（`.env.example` 里已有该行占位） |
| 3 | `.github/workflows/ci.yml:44` 里硬编码的 `VITE_API_BASE: https://clair-api.pages.dev` | `clair-api.pages.dev` | Render 域名 |

> ⚠️ 第 3 处不在本工单文件域内（`.github/workflows/` 严禁触碰），**需要另行修改**。
> 它只影响 CI 的构建冒烟、不影响 Pages 上线产物，但留着会让 CI 构建出的前端仍指向 Worker，
> 属于「改漏一处 → 前端一半连新后端一半连 Worker，且不报错」的隐患，**务必一并改掉**。

### 6.2 改完后必须重新构建 + 重新部署

`VITE_API_BASE` 是**构建时内嵌**到产物里的（Vite 静态替换 `import.meta.env`），
**只改变量不重新构建 = 完全不生效**。

```bash
cd frontend && npm run build      # 用新的 VITE_API_BASE 重新构建
# 然后推送一次触发 deploy.yml，或手动重跑该 workflow
```

构建成功后可用静态产物里搜不到旧域名来确认：

```bash
rg -c "clair-api\.pages\.dev" frontend/dist/assets/*.js || echo "✓ 产物中已无旧后端域名"
```

### 6.3 回滚（Worker 仍在线，随时可切回）

Cloudflare Worker（`clair-api.pages.dev`）在迁移期间**保持在线、不要下线**，
它就是天然的降级回退目标。回滚步骤：

1. 把上面 3 处的 `VITE_API_BASE` 改回 `https://clair-api.pages.dev`；
2. 重新构建前端并重新部署 Pages；
3. 回滚生效的判定：浏览器请求域名变回 `clair-api.pages.dev`，页面不再 404/白屏。

回滚代价：仅前端一次重新构建 + 重新部署，**数据无任何损失**
（Render 侧数据库独立存在，改回 Worker 只是让 Worker 走它自己的数据源）。

> 已知限制：Worker 只挂了约 24 条路由，回滚后回到「部分页面数据不可用」的旧状态。
> 所以回滚是**应急手段**而不是稳态方案。

---

## 7. 区域与延迟（如实说明）

### 7.1 更正一条前置信息

工单传达的「Render 只有 Oregon 与 Frankfurt 两个区域，无亚洲节点」**已经过时**。
实读 `render.com/docs/regions`（2026-10-26），官方区域列表为 **5 个**：

- Oregon, USA（默认）
- Ohio, USA
- Virginia, USA
- Frankfurt, Germany
- **Singapore**

**存在亚洲节点（新加坡）**。因此本方案 `render.yaml` 里写死了 `region: singapore`，
而不是 Oregon/Frankfurt。

### 7.2 延迟量级与影响

| 部署区域 | 到中国大陆单向延迟（量级） | 影响 |
|---|---|---|
| **Singapore** | 约 40–90 ms（视运营商出口与路由，高峰期可能显著上浮） | 每个 HTTP 请求一次往返；页面同时发多个 API 时不会线性叠加（并发），体感可接受 |
| Oregon / Virginia | 约 150–250 ms | 明显变慢，K 线/列表首屏退化明显 |
| Frankfurt | 约 200–350 ms | 最差 |

**叠加因素**：

- Render 免费档实例闲置会休眠、冷启动数秒；本方案用 `$7/mo` 的 `starter` 付费档，常驻、**无休眠冷启动**。
- 中间链路不可控：跨境出口的稳定性比纯物理延迟更影响体感，晚高峰偶有丢包/抖动。
- Render **没有内置连接池器**，多实例横向扩容时连接数会线性吃掉 100 的上限。

### 7.3 备选方案与切换成本

若实测下来新加坡区域达不到可接受体验：

| 备选 | 优势 | 切换成本 |
|---|---|---|
| 腾讯云轻量/阿里云轻量香港或广州，自建 Docker + PG | 到国内 10–30 ms；BGP 线路稳定 | **低**：Dockerfile 已就绪、`render.yaml` 只是 Render 专属语法，用 `docker compose` 起即可；数据用同一份 dump 再还原一次。主要成本是运维（备份、监控、证书）落到自己头上 |
| Railway / Fly.io | Fly.io 有东京/新加坡 | 中：需改写各自平台的部署描述文件；数据库同样要再迁一次 |

本方案的所有物料（Dockerfile + dump + 迁移脚本）**不被 Render 绑定**，切走不需要重做;
真正被 Render 绑定的只有 `render.yaml` 这一个声明文件。

---

## 8. 证据清单（实测原文）

### 证据 1：`render.yaml` YAML 语法验证

本机 `python3` 无 `yaml` 模块，改用仓库内两个 Node 解析器交叉验证：

```
$ node -e "const yaml=require('./node_modules/yaml'); ... yaml.parse(...)"
=== YAML 解析成功 ===
{ databases: [ { name: 'clair-db', plan: 'basic-1gb', postgresMajorVersion: '15',
                 region: 'singapore', diskSizeGB: 5 } ],
  services: [ { type: 'web', name: 'clair-api', runtime: 'docker', plan: 'starter',
                region: 'singapore', branch: 'main',
                dockerfilePath: './backend/Dockerfile', dockerContext: '.',
                healthCheckPath: '/health', envVars: [ ...13 项... ] } ] }

$ node -e "const yaml=require('./frontend/node_modules/js-yaml'); ..."
=== js-yaml 二次解析 OK ===
services: clair-api/web/docker/plan=starter
databases: clair-db/basic-1gb/singapore/disk=5
envVar keys: NODE_ENV, HOST, DATABASE_URL, JWT_SECRET, CORS_ORIGINS, DB_POOL_MAX,
             APP_VERSION, LOG_LEVEL, AI_PROVIDER, DEEPSEEK_BASE_URL, DEEPSEEK_MODEL,
             DEEPSEEK_API_KEY, TUSHARE_TOKEN
```

另：`bash -n scripts/deploy/render-migrate-data.sh` 通过。

### 证据 2：迁移脚本 dry-run 输出

```
==================== DRY RUN（不落盘、不连接任何数据库）====================
  源端      : postgresql://ego_bai@/tmp:5432/clair
  源端模式  : core（core=10 表 + 4 视图；full=整库）
  目标端    : postgresql://u:***@oregon-postgres.render.com:5432/clair
  目标 host : oregon-postgres.render.com
  dump 路径 : /tmp/dryrun-test.dump

将依次执行：
  1) 导出（自定义格式 -Fc，压缩）
     pg_dump --no-owner --no-privileges -Fc -t stocks -t daily_quotes ... -f '/tmp/dryrun-test.dump' '<源端连接串>'
  2) 结构校验
     pg_restore --list '/tmp/dryrun-test.dump'
  3) 目标库预置触发器依赖函数（pg_dump -t 不带出函数，缺它会导致 CREATE TRIGGER 失败；此步为 CREATE OR REPLACE，幂等）
  4) 还原（会 DROP 并重建目标库同名表）
     pg_restore --clean --if-exists --no-owner --dbname '<目标连接串>' '<dump 文件>'
  5) 行数校验（见下方 SQL）

还原后校验 SQL（期望值与本机实测一致）：
  SELECT count(*) FROM stocks;         -- 期望 5546
  SELECT count(*) FROM daily_quotes;   -- 期望 503534
  SELECT count(*) FROM concepts;       -- 期望 808
  SELECT max(trade_date) FROM daily_quotes;  -- 期望 2026-10-23
========================================================================
Dry run 结束，未执行任何真实操作。
```

额外确认：dry-run 后 `ls /tmp/dryrun-test.dump` → `No such file or directory`（确实未落盘）。

参数校验用例全部符合预期：

```
缺少 --source-db  → ✗ 必须显式指定源库 ... exit=2
缺少 --target-url → ✗ 缺少 --target-url（目标 Render PostgreSQL 连接串） exit=2
非法 URL mysql:// → ✗ --target-url 不是 postgresql:// 形式: mysql:://*** exit=2
URL 无 host       → ✗ --target-url 解析不出 host，请检查连接串是否完整 exit=2
```

### 证据 3：脚本真实全流程（目标为本地模拟库，验证导出→还原→校验）

```
[02:37:42] 1/4 导出源库 postgresql://ego_bai@/tmp:5432/clair → /tmp/clair-migrate-script-test.dump
+ pg_dump --no-owner --no-privileges -Fc -t stocks -t daily_quotes -t concepts -t industries -t alerts
          -t watchlist -t money_flow -t minute_quotes -t market_snapshots -t collection_logs
          -t v_market_summary -t v_top_gainers -t v_top_losers -t v_top_turnover
          -f /tmp/clair-migrate-script-test.dump postgresql://ego_bai@%2Ftmp:5432/clair
✓ 导出完成： 20M（20923433 bytes），耗时 2s

[02:37:44] 2/4 校验 dump 可读性（pg_restore --list）
; Archive created at 2026-10-26 02:37:42 CST
;     dbname: clair
;     TOC Entries: 99
;     Compression: -1
;     Dump Version: 1.14-0
;     Format: CUSTOM
;     Integer: 4 bytes
;     Offset: 8 bytes
;     Dumped from database version: 15.17 (Homebrew)
;     Dumped by pg_dump version: 15.17 (Homebrew)
✓ dump 可读，TABLE DATA 条目数：10

[02:37:44] 3/4 目标库预置触发器依赖函数（幂等；缺它会让 CREATE TRIGGER 失败）
[02:37:44] 4/4 还原到目标 Render PostgreSQL（--clean --if-exists：先 DROP 同名表再重建）
+ pg_restore --clean --if-exists --no-owner --dbname postgresql://ego_bai@localhost:5432/clair_target_sim /tmp/clair-migrate-script-test.dump
✓ 还原完成，耗时 2s

[02:37:46] 还原后行数校验
stocks | 5546
daily_quotes | 503534
concepts | 808
max(trade_date) | 2026-10-23
```

### 证据 4：未打补丁时的还原失败（说明 §5.3 的必要性，非推测）

```
=== 尝试 1：直接 restore 核心表 dump ===
pg_restore: error: could not execute query: ERROR:  function public.update_updated_at() does not exist
Command was: CREATE TRIGGER trigger_stocks_updated_at BEFORE UPDATE ON public.stocks
             FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
pg_restore: warning: errors ignored on restore: 1
EXIT= ELAPSED_MS=2182
```

补上两个函数后重跑 → `EXIT=0`，零报错，触发器落地，行数一致（`daily_quotes = 503534`）。

### 证据 5：`pg_restore --list` 结构可读（整库 dump）

```
; Archive created at 2026-10-26 02:16:34 CST
;     dbname: clair
;     TOC Entries: 126
;     Dump Version: 1.14-0
;     Format: CUSTOM
;     Dumped from database version: 15.17 (Homebrew)
2; 3079 26667 EXTENSION - dblink
4116; 0 0 COMMENT - EXTENSION dblink
256; 1255 17015 FUNCTION public create_daily_quotes_partition(integer, integer) ego_bai
257; 1255 17183 FUNCTION public update_updated_at() ego_bai
255; 1255 17014 FUNCTION public update_updated_at_column() ego_bai
234; 1259 17140 TABLE public alerts ego_bai
222; 1259 17040 TABLE public daily_quotes ego_bai
...
```
`TABLE DATA` 条目数：**21**（整库） / **10**（核心模式）。

---

## 9. 成本估算

单价来源：`render.com/pricing` 与 `render.com/docs/compute-plans`（2026-10-26 实读）。

### 9.1 本方案月账单

| 项 | 规格 | 单价 | 月合计 |
|---|---|---|---|
| Web Service `clair-api` | plan `starter` / `0.5c-512mb`：0.5 CPU、512 MB RAM | $7/mo | **$7.00** |
| PostgreSQL `clair-db` | plan `basic-1gb` / `0.5c-1g`：0.5 CPU、1 GB RAM、100 连接 | $19/mo | **$19.00** |
| 数据库存储扩容 | `diskSizeGB: 5`，官方标注 1GB 随实例附带 → 按 4GB 增量计 | $0.30/GB/月 | **$1.20** |
| **合计** | | | **$27.20 / 月** |

口径不确定的地方（如实说明）：官方 Blueprint 文档说 `diskSizeGB` 的默认值随档位
「Free 1GB / **Basic 15GB** / Pro 100GB」，而定价页说「1 GB SSD storage included,
Expandable storage $0.30/GB」。两种口径下这笔费用是 **$0 或 $1.20/月**，
**以 Dashboard 账单页实际为准**。这也是本方案把 `diskSizeGB` 定在 `5` 而不是 `15` 的原因
——存储**只能增不能减**，宁可起小一点，真不够再一键扩容。

Workspace 层面：**Hobby $0/mo**（含 5GB 出站带宽/月，超出 $0.15/GB）。
前端在 Cloudflare Pages，出站只有 JSON 响应，5GB 大概率够用。

### 9.2 可选升级/降级

| 调整 | 变化 | 适用情形 |
|---|---|---|
| Web Service 升到 `1c-2g` | +$18/mo（$7 → $25） | 512MB 顶不住、频繁 OOM 或响应慢 |
| PG 降到 `0.1c-256mb` | −$13/mo | **不推荐**：256MB RAM 撑不住 50 万行日行情的查询与索引重建 |
| PG 升到 `1c-2g` | +$21/mo（$19 → $40） | 聚合查询明显慢 |
| 存储扩容 | +$0.30/GB/月（单向） | 历史数据继续回填到千万行量级时 |

### 9.3 与备选的成本对照

腾讯云轻量（香港，2C4G + 自建 PG）月费约 ¥100–200 量级，
低价档通常要年付才有明显折扣；代价是备份、监控、证书、安全补丁全部自理。
Render 的 $27.20/mo ≈ ¥195/月，买到的是**托管**（每日快照、PITR 3 天、自动 TLS、免运维）。

---

## 10. 未完成项与已知风险

| # | 项 | 状态 | 说明与建议 |
|---|---|---|---|
| 1 | **连接 Render 实际建服务 / 实际迁数据** | ❌ 未做 | 无 Render 账号凭据。物料已备齐，且脚本全流程已在本地模拟目标库上零报错跑通。**这部分需要用户执行** |
| 2 | **跨公网还原的真实耗时** | ⚠️ 估算 | 只有本机 2.0s 的实测；Render 侧估算 1–5 分钟。请首次执行时记录真实数字回填本文 |
| 3 | **Singapore 区域的真实延迟** | ⚠️ 未实测 | 需部署后从国内网络 `curl -w '%{time_total}'` 实测回填 |
| 4 | `ci.yml:44` 的 `VITE_API_BASE` 硬编码 | ❌ 不在本工单文件域 | 需另开工单改；否则 CI 构建的前端仍指向 Worker |
| 5 | `/health` 的 `build.commit` 在 Render 上为 `null` | ⚠️ 已知 | 后端读取的 5 个候选变量不含 Render 的 `RENDER_GIT_COMMIT_SHA`。属源码改动，记为后续工单 |
| 6 | `CORS_ORIGINS` 未预置值 | ⚠️ 需手填 | 取决于前端实际部署域名，无法在仓库里给死值 |
| 7 | Web Service 512MB 内存 | ⚠️ 风险 | 上线后观察 OOM；可一键升 `1c-2g` |
