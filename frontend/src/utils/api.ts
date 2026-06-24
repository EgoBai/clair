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
