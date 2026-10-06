/**
 * 构建信息（前端侧）—— 版本一致性校验的读取侧
 * ============================================================================
 * 为什么需要这个文件（P0-VER）：
 *   仓库的两条部署工作流触发条件不对称——`deploy.yml` 每次 push main 都上线前端，
 *   `deploy-worker.yml` 只在 clair-worker/** 变更时才上线。于是「线上前端 = 最新代码」
 *   但「线上后端 = 未知老版本」，用户在线上看不到任何后端修复，且**无法自行判断**
 *   自己看到的是不是最新版本。本模块让页面能自报家门。
 *
 * 诚实红线：
 *   1. 取不到 commit 一律显示「版本未知」，**绝不显示空白、绝不显示看似真实的假 sha**。
 *      假 sha 会让「页面版本 vs 后端版本」的比对永远显示一致，等于把这道门禁焊死。
 *   2. 本地 dev（import.meta.env.DEV）下 VITE_* 不会有值，属预期降级路径，不是错误。
 *   3. appVersion 不在此处另造常量：构建期未注入时留 null，由运行期 /api/version 补齐，
 *      避免前端再引入一个与后端 APP_VERSION 无关的字面量版本号。
 * ============================================================================
 */

export interface BuildInfo {
  /** git commit 短 sha；不可得时为 null（绝不伪造） */
  commit: string | null;
  /** 完整 sha（若可得） */
  fullCommit: string | null;
  /** 应用版本号；不可得时为 null，由运行期接口补齐 */
  appVersion: string | null;
  /** 构建时间 ISO 字符串；不可得时为 null */
  buildTime: string | null;
  /** 展示用文案：不可得时明确显示「未知」，不显示空白 */
  commitLabel: string;
  /** 信息来源：构建期注入 / 运行期接口 / 均不可得 */
  source: 'build' | 'runtime' | 'unknown';
}

const UNKNOWN_LABEL = '未知';

/**
 * 合法 commit 形状：7–40 位十六进制。
 * 与后端 resolveBuildCommit() 的校验保持一致——脏值一律视为"未注入"。
 */
function normalizeCommit(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const sha = raw.trim().toLowerCase();
  return /^[0-9a-f]{7,40}$/.test(sha) ? sha : null;
}

/**
 * 构建期注入信息。Vite 只把 `VITE_` 前缀的变量注入到 import.meta.env，
 * 本地 dev 与未配置 CI 时全为 undefined——这是正常降级路径。
 */
export function getBuildTimeInfo(): BuildInfo {
  // 显式标注类型：`|| {}` 会让 env 变成 `ImportMetaEnv | {}` 联合类型，
  // 访问任何属性都变成 TS2339。断言成 ImportMetaEnv 即可安全访问。
  const env: ImportMetaEnv =
    (typeof import.meta !== 'undefined' && import.meta.env) || ({} as ImportMetaEnv);
  const full = normalizeCommit(env.VITE_GIT_COMMIT_SHA ?? env.VITE_BUILD_COMMIT);
  const appVersion = typeof env.VITE_APP_VERSION === 'string' && env.VITE_APP_VERSION.trim()
    ? env.VITE_APP_VERSION.trim()
    : null;
  const buildTime = typeof env.VITE_BUILD_TIME === 'string' && env.VITE_BUILD_TIME.trim()
    ? env.VITE_BUILD_TIME.trim()
    : null;

  return {
    commit: full ? full.slice(0, 7) : null,
    fullCommit: full,
    appVersion,
    buildTime,
    commitLabel: full ? full.slice(0, 7) : UNKNOWN_LABEL,
    source: full || appVersion ? 'build' : 'unknown',
  };
}

/** 运行期读取的后端构建信息（后端 /api/version 的形状） */
interface RuntimeVersionPayload {
  commit?: unknown;
  appVersion?: unknown;
  buildTime?: unknown;
}

/**
 * 从后端拉取构建信息。任一环节失败（网络不通 / 非 JSON / 结构不符）都返回 null，
 * 由调用方决定降级展示，绝不因为拉取失败就渲染空白。
 */
export async function fetchBackendBuildInfo(
  baseUrl?: string,
  timeoutMs = 3000,
): Promise<BuildInfo | null> {
  const base = (baseUrl ?? '').replace(/\/+$/, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}/api/version`, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    if (!res.ok) return null;
    const payload = (await res.json()) as RuntimeVersionPayload;
    const full = normalizeCommit(payload?.commit);
    const appVersion = typeof payload?.appVersion === 'string' && payload.appVersion.trim()
      ? payload.appVersion.trim()
      : null;
    const buildTime = typeof payload?.buildTime === 'string' && payload.buildTime.trim()
      ? payload.buildTime.trim()
      : null;
    // commit 与 appVersion 全都拿不到 → 这份"运行期信息"没有任何展示价值，返回 null
    if (!full && !appVersion) return null;
    return {
      commit: full ? full.slice(0, 7) : null,
      fullCommit: full,
      appVersion,
      buildTime,
      commitLabel: full ? full.slice(0, 7) : UNKNOWN_LABEL,
      source: 'runtime',
    };
  } catch {
    // 后端未部署 / 网络不通 / 超时 —— 全部走同一条降级路径，不抛给调用方
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 合并构建期与运行期信息，取值优先级：构建期 commit 优先（它属于**前端自身**的版本，
 * 是用户实际加载的那份代码），appVersion 则优先用运行期的（后端自报，是权威）。
 */
export async function resolveBuildInfo(apiBaseUrl?: string): Promise<BuildInfo> {
  const buildTime = getBuildTimeInfo();
  const runtime = await fetchBackendBuildInfo(apiBaseUrl);
  if (!runtime) return buildTime;
  return {
    commit: buildTime.fullCommit ?? runtime.fullCommit,
    fullCommit: buildTime.fullCommit ?? runtime.fullCommit,
    appVersion: runtime.appVersion ?? buildTime.appVersion,
    buildTime: buildTime.buildTime ?? runtime.buildTime,
    commitLabel: buildTime.fullCommit
      ? buildTime.fullCommit.slice(0, 7)
      : runtime.commitLabel,
    source: buildTime.fullCommit ? 'build' : 'runtime',
  };
}

/** 展示文案：任何不可得字段都显式渲染为「未知」，不渲染空白 */
export function formatBuildInfoLabel(info: BuildInfo | null): string {
  if (!info) return `版本${UNKNOWN_LABEL}`;
  const version = info.appVersion ? `v${info.appVersion}` : `版本${UNKNOWN_LABEL}`;
  return `${version} · ${info.commitLabel}`;
}