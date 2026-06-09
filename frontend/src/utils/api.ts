/**
 * API 基础配置
 * 开发: /api → Vite proxy → localhost:3001  
 * 生产: 直接指向 Railway 后端
 */
const API_BASE = import.meta.env.DEV 
  ? '' 
  : 'https://clair-production-1189.up.railway.app';

export function apiUrl(path: string): string {
  if (path.startsWith('http')) return path;
  return `${API_BASE}${path}`;
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
