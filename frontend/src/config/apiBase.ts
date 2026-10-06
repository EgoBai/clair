/**
 * 后端地址解析 —— 单一真源（frontend侧）
 *
 * ## 为什么有这个文件
 *
 * 历史上「后端地址」有**两个同义异名的环境变量**，且各自解析、互不知情：
 *   - `VITE_API_BASE`     → main.tsx 的 window.fetch 重写（commit 5157486a6 收敛到此）
 *   - `VITE_API_BASE_URL` → services/api.ts 的 axios baseURL
 *
 * 危险不在于「有两个变量」，而在于**它们指同一件事却要手工同步**：
 * 切换后端时只改`VITE_API_BASE`，axios 数据层仍指向旧地址 ——
 * fetch 走新后端、axios 走老后端，**页面一半新一半旧，且不报任何错**。
 * 加之本仓`frontend/.env` 实际只设了后者，前者根本没配。
 *
 * 现在只有一个变量名：`VITE_API_BASE`。本模块负责把它解析成两种传输层各自需要的形态。
 *
 * ## 为什么 axios 必须自己拿绝对地址（不能靠 main.tsx 兜）
 *
 * `main.tsx` 只劫持了 `window.fetch`（把 `/api/*` 前缀换成后端地址）。
 * 但 axios 在浏览器里用的是 **XMLHttpRequest**，**不经过 window.fetch**，
 * 所以那层重写对 axios 完全无效。若axios 也用相对路径 `/api`，
 * 生产环境（前后端不同域）会直接打到前端站点自己的 `/api` → 404。
 * 故 axios 必须自己拿到 `https://后端域名` 这一级绝对地址。
 *
 * ## dev 模式行为（保持不变）
 *
 * `import.meta.env.DEV` 下返回相对路径 `/api`，由 Vite proxy 转发到
 * 127.0.0.1:3001（见 frontend/vite.config.ts 的 server.proxy）。
 * **dev 下绝不硬指向远端**，本地开发不需要任何环境变量。
 *
 * ## 诚实红线
 *
 * 生产构建拿不到 `VITE_API_BASE` 时，本模块**不回落任何硬编码远端地址**，
 * 而是让 `resolveApiBase()` 抛错——`main.tsx` 已有构建期 + 运行期双重防线
 * （缺配置直接构建失败 / 页面显示错误横幅），本模块与之保持同一原则，
 * 绝不「猜一个地址」把请求发到未知后端。
 */

/** 构建期注入的后端地址。刻意没有默认值——这正是单一真源的意义。 */
const RAW_API_BASE: string = import.meta.env.VITE_API_BASE || '';

/** 是否为 vite dev / 本地开发模式。 */
export const IS_DEV: boolean = import.meta.env.DEV;

/** 归一化：去掉尾部斜杠，避免拼接 `/api/...` 时出现 `//api/`。 */
function normalize(raw: string): string {
  return raw.trim().replace(/\/+$/, '');
}

/**
 * 解析 axios 使用的 baseURL。
 *
 * - dev：返回相对路径 `/api`，交给 Vite proxy（行为与本次改动前完全一致）。
 * - 生产且已配置：返回 `https://后端域名/api`（含 `/api` 前缀，与 axios 调用方
 *   传入的 `/market/xxx`、`/api/xxx` 等路径拼接语义保持兼容）。
 * - 生产且未配置：**抛错**，不猜地址。由 main.tsx 的防线负责给出可读提示。
 */
export function resolveApiBase(): string {
  if (IS_DEV) return '/api';

  const base = normalize(RAW_API_BASE);
  if (!base) {
    throw new Error(
      '[config] 生产构建缺少 VITE_API_BASE，axios 无法确定后端地址。' +
        '线上前端必须显式指定后端地址，不要依赖代码里的默认兜底。' +
        '注入方式：构建时设置环境变量 VITE_API_BASE=https://<你的后端域名>'
    );
  }
  return `${base}/api`;
}

/**
 * 导出供 axios 直接使用的 baseURL。
 *
 * 注意这里**没有** try/catch 兜底：若生产缺配置导致抛错，那属于「构建期就该失败」
 * 的配置错误，静默吞掉只会把「漏配」重新变成「运行时连错后端」。
 */
export const API_BASE_URL: string = resolveApiBase();