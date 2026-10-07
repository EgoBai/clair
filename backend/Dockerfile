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
# 运行契约：PORT（默认 3001）、DATABASE_URL、JWT_SECRET。
# DATABASE_URL 缺失不会崩，但会退回内存库（诚实空态，绝不伪造行情）。

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
COPY backend/ ./backend/
COPY shared/ ./shared/
RUN cd backend && npm run build:prod

FROM node:22-alpine AS run
WORKDIR /app/backend
ENV NODE_ENV=production
ENV PORT=3001

COPY package.json package-lock.json ./
# npm ci 强制要求 package-lock.json 存在（只 COPY package.json 会报
# "can only install with an existing package-lock.json"）。
# 这里装的是 backend 的生产依赖（express/knex/pg 等）；
# esbuild 用 --packages=external bundle，故运行时不需要 devDeps。
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /app/backend/dist/server.cjs ./dist/server.cjs

RUN addgroup -S appg && adduser -S appu -G appg && \
    chown -R appu:appg /app/backend && chmod -R 750 /app/backend
USER appu

EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD wget -q -O - "http://127.0.0.1:${PORT:-3001}/health" >/dev/null 2>&1 || exit 1

CMD ["node", "dist/server.cjs"]
