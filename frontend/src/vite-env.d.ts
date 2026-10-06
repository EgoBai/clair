/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * 后端 API 地址（**唯一真源**）。
   * 生产构建若未注入，`frontend/src/main.tsx` 的构建期守卫会让构建非 0 退出；
   * 开发模式不重定向，走 vite proxy（见 vite.config.ts 的 server.proxy）。
   */
  readonly VITE_API_BASE?: string;
  /**
   * @deprecated 历史别名，仅为兼容保留，请统一用 VITE_API_BASE。
   * 存在期间两套数据层（fetch / axios）可能指向不同后端，属已知风险，
   * 正在由工单收敛中。
   */
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_WS_URL?: string;

  // ---- 构建期注入（用于版本可观测，见 frontend/src/config/buildInfo.ts）----
  /** 40 位小写 hex，由 CI 注入 */
  readonly VITE_GIT_COMMIT_SHA?: string;
  /** commit 的备用变量名 */
  readonly VITE_BUILD_COMMIT?: string;
  readonly VITE_APP_VERSION?: string;
  readonly VITE_BUILD_TIME?: string;

  readonly DEV: boolean;
  readonly MODE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}