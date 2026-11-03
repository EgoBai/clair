/**
 * API 基础配置 — 统一数据层
 * 所有请求一律走相对路径(/api/...)，由 main.tsx 的全局 fetch wrapper 统一路由：
 *   开发: 相对路径 → Vite proxy → localhost:3001
 *   生产: 相对路径 → main.tsx wrapper 加上 VITE_API_BASE(默认 clair-api.pages.dev)
 * 此处不再拼接任何 base，未来切换后端只改 main.tsx 一处。
 */
export function apiUrl(path: string): string {
  if (path.startsWith('http')) return path;
  return path;
}

/**
 * 读取 JSON 响应体，把「空响应 / 非法 JSON」变成可解释的错误。
 *
 * 背景：后端不可达时（vite proxy 502、网关截断），`response.json()` 抛
 * `Failed to execute 'json' on 'Response': Unexpected end of JSON input`。
 * 若该 Promise 未被 catch（如 useEffect 里直接 await），浏览器记为未捕获异常：
 * 页面既不提示「取不到数据」也不报错——e2e 的 pageerror 守卫正是抓到这一点。
 */
export class ApiResponseError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiResponseError';
    this.status = status;
  }
}

export async function readJson<T = unknown>(response: Response): Promise<T> {
  const text = await response.text().catch(() => '');
  const label = `HTTP ${response.status}`;
  if (!text.trim()) {
    throw new ApiResponseError(`响应为空（${label}），未拿到任何数据`, response.status);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiResponseError(`响应不是合法 JSON（${label}）`, response.status);
  }
}

export async function apiFetch(path: string, options?: RequestInit): Promise<Response> {
  const response = await fetch(apiUrl(path), options);
  
  // 统一处理HTTP错误
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorMessage = errorData.message || errorData.error || `请求失败: ${response.status}`;
    throw new Error(errorMessage);
  }
  
  return response;
}
