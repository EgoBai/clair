# 澄观 Clair 后端 · 生产架构 A（完整 Express 241 端点 → 托管平台）
#
# 为什么必须重画（2026-10-06 实测坐实）：
# 1. 生产域名 clair-api.pages.dev 实际跑的是 Cloudflare Worker（clair-worker/worker.js，
#    硬编码约 24 路由 + 兜底 404），完整 Express 后端从未上生产 ⟹ 14/23 端点生产 404，
#    这是「页面内容不完整 / 部分数据不可用」的总根源（T-2610-05 审计 + 主理人独立复核）。
# 2. 旧 Dockerfile 从未被验证过（写文件 ≠ 跑得起来）：单阶段 COPY . . + `npx tsx src/index.ts`
#    生产环境冷启动慢，且把 devDeps 全打进镜像。
#
# 生产产物为什么是 esbuild bundle 而不是 tsc 产物（重要，勿改回）：
#   源码使用 `@shared/*` 路径别名 + **不带扩展名**的相对 import，
#   tsc 产物交給 Node 原生运行时会两处解析失败（实测）：
#     ERR_MODULE_NOT_FOUND（./app 无 .js 扩展名）
#     Cannot find module '@shared/industryClassification'（tsc paths 只是类型别名，运行期不存在）
#   `npm run build:prod` = esbuild bundle（--packages=外部依赖仍走 node_modules）→ 单文件 CJS，
#   实测 `node dist/server.cjs` 可起且 /health 返回 1.7.0 + postgres 真实连接。
#
# 运行契约（容器化托管必需，缺一即起不来或起不来对）：
#   PORT      —— 监听端口，默认 3001（平台通常注入自己的值）
#   HOST      —— 监听地址，默认 0.0.0.0（**必须监听所有网卡**，否则平台探针连不上；
#                由 backend/src/index.ts 显式传给 httpServer.listen）
#   DATABASE_URL —— PostgreSQL 连接串。缺失不会崩，但会静默降级到内存库：
#                /health 会返回 dbType='memory' / degraded=true / dataSource='unavailable'。
#   JWT_SECRET   —— 生产环境必填；缺失或长度 < 32 时进程**启动即失败**（fail-fast，
#                刻意如此：宁可起不来，也不要用一个可猜的密钥签发用户令牌）。

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package*.json ./backend/
COPY shared/ ./shared/
# 根依赖（前端构建工具等）
RUN npm ci --ignore-scripts
# backend 依赖（express/knex/pg 等）。
# 为什么必须单独装（2026-10-08 实测复现的 Railway 构建失败根因）：
# 根 package.json **没有 workspaces 字段**，所以 /app 里的 npm ci **不会**进入
# backend/ 安装它的依赖；而 build 阶段 `cd backend && npm run build:prod`
# 用的 esbuild 只存在于 backend 的依赖树里 —— 缺这一步会得到
#   sh: esbuild: command not found
# 本地能跑通是因为 backend/node_modules 早就被手工装好了，**不代表 Dockerfile 能构建**。
RUN cd backend && npm ci --ignore-scripts

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/backend/node_modules ./backend/node_modules
COPY package.json package-lock.json ./
# ⚠️ 这里**只**拷构建必需的源码，不要 `COPY backend/ ./backend/`：
#   1) backend/ 内含 node_modules（183MB 且带 darwin 平台二进制），
#      覆盖上面刚从 deps 阶段装好的 linux node_modules → 构建期 esbuild 平台不匹配；
#   2) backend/.env 内含**真实密钥**（DEEPSEEK_API_KEY / TUSHARE_TOKEN / 数据库口令），
#      整目录拷贝会把密钥烘进镜像层（即使最终 run 阶段不取，属密钥泄露）。
COPY backend/src ./backend/src
COPY backend/tsconfig.json ./backend/tsconfig.json
COPY shared/ ./shared/
# 清掉 backend/src/ 里的历史残留（不进镜像）：
#   - node_modules/：183MB 的**宿主机**依赖副本（且含 darwin 平台二进制），
#     留着既撑大镜像层，又可能与 deps 阶段装的 linux 版冲突；
#   - package.json / package-lock.json：backend/src/ 下的**另一份**陈旧清单
#     （与 backend/package.json 无关），留着只会让人误以为是有效配置；
#   - __tests__/：测试代码不进生产镜像。
RUN rm -rf backend/src/node_modules backend/src/package.json backend/src/package-lock.json \
    backend/src/__tests__ && \
    cd backend && npm run build:prod

FROM node:22-alpine AS run
WORKDIR /app/backend
ENV NODE_ENV=production
ENV PORT=3001
# 显式声明监听所有网卡（backend/src/index.ts 读 HOST；不设时其默认值同为 0.0.0.0，
# 但写进镜像层可让「容器里到底监听哪个地址」成为**镜像自带的可审计事实**，
# 而不是依赖运行期环境的隐式默认）。
ENV HOST=0.0.0.0

# ⚠️ 必须拷 backend/ 自己的 package.json + package-lock.json：
#    上一版这里拷的是**仓库根**的 package.json（根 package.json 只有 devDependencies，
#    且 npm ci 会因 lock 不匹配而失败），导致 run 阶段装出来的 node_modules
#    **不含 express/knex/pg** → 容器启动即 MODULE_NOT_FOUND。
#    正确做法：拷 backend/package*.json，让 npm ci --omit=dev 装出后端**运行时**依赖。
COPY backend/package.json backend/package-lock.json ./
# npm ci 强制要求 package-lock.json 存在（只 COPY package.json 会报
# "can only install with an existing package-lock.json"）。
# 这里装的是 backend 的生产依赖（express/knex/pg 等）；
# esbuild 用 --packages=external bundle，故运行时不需要 devDeps。
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /app/backend/dist/server.cjs ./dist/server.cjs
# 内存库降级态要用的真实股票清单（5541 只）。
# 路径由 backend/src/db/InMemoryDatabase.ts 的
#   path.resolve(__dirname, '../../../clair-worker/all_stocks_compact.json')
# 决定 —— dist/server.cjs 的 __dirname 是 /app/backend/dist，故上溯三层正好落到 /clair-worker。
# 不拷它的话，容器降级时会退回 20 只的内置股票清单（覆盖面骤降）。
COPY clair-worker/all_stocks_compact.json /clair-worker/all_stocks_compact.json

RUN addgroup -S appg && adduser -S appu -G appg && \
    chown -R appu:appg /app/backend && chmod -R 750 /app/backend
USER appu

EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD wget -q -O - "http://127.0.0.1:${PORT:-3001}/health" >/dev/null 2>&1 || exit 1

CMD ["node", "dist/server.cjs"]
