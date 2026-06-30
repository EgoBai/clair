/**
 * Safe localStorage wrappers
 * All functions wrapped in try/catch to prevent runtime errors
 * from private browsing mode, storage quota exceeded, etc.
 */

export function safeGetItem(key: string, fallback: string | null = null): string | null {
  try {
    const value = localStorage.getItem(key);
    return value !== null ? value : fallback;
  } catch (e) {
    console.warn(`[safeStorage] getItem("${key}") failed:`, e);
    return fallback;
  }
}

export function safeSetItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    console.warn(`[safeStorage] setItem("${key}") failed:`, e);
  }
}

export function safeRemoveItem(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch (e) {
    console.warn(`[safeStorage] removeItem("${key}") failed:`, e);
  }
}

/**
 * Safe localStorage key() - returns key at index, or null
 */
export function safeKey(index: number): string | null {
  try {
    return localStorage.key(index);
  } catch (e) {
    console.warn(`[safeStorage] key(${index}) failed:`, e);
    return null;
  }
}

/**
 * Safe localStorage length
 */
export function safeLength(): number {
  try {
    return localStorage.length;
  } catch (e) {
    console.warn('[safeStorage] length failed:', e);
    return 0;
  }
}
