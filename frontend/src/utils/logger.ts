/**
 * 统一日志工具
 * 生产环境自动静默 debug/log，仅保留 warn/error
 *
 * 本文件是全项目唯一被允许直接调用 console 的位置（统一日志出口），
 * 因此在此处禁用 no-console 规则。其他文件请改用此 logger。
 */
/* eslint-disable no-console */

const isDev = import.meta.env.DEV;

export const logger = {
  debug: (...args: unknown[]) => {
    if (isDev) console.debug(...args);
  },
  log: (...args: unknown[]) => {
    if (isDev) console.log(...args);
  },
  warn: (...args: unknown[]) => {
    console.warn(...args);
  },
  error: (...args: unknown[]) => {
    console.error(...args);
  },
  perf: (label: string, ms: number, threshold = 16) => {
    if (isDev && ms > threshold) {
      console.warn(`[Perf] ${label}: ${ms.toFixed(1)}ms (>${threshold}ms)`);
    }
  },
};

export default logger;
