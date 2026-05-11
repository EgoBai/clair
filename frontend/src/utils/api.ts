/**
 * API 基础配置 — 自动适配开发/生产环境
 * 开发: 相对路径 → Vite proxy → localhost:3001
 * 生产: 绝对路径 → VITE_API_BASE → 后端服务器
 */
const API_BASE = import.meta.env.VITE_API_BASE || '';

export function apiUrl(path: string): string {
  if (path.startsWith('http')) return path;
  return `${API_BASE}${path}`;
}

export async function apiFetch(path: string, options?: RequestInit): Promise<Response> {
  return fetch(apiUrl(path), options);
}
