/**
 * 页面数据可用性广播 —— 单一真源
 *
 * 页面（如个股详情）拿到接口自报的 dataSource 后写入这里；
 * AI 浮窗读取它，把可用性边界注入 system prompt。
 * 只保存“当前这一页”的状态，离开页面必须清空，避免把上一页的可用性带到下一页。
 */

type Listener = () => void;

let current: string | null = null;
const listeners = new Set<Listener>();

export function setPageDataSource(value: string | null): void {
  if (current === value) return;
  current = value;
  listeners.forEach((fn) => fn());
}

export function getPageDataSource(): string | null {
  return current;
}

export function subscribePageDataSource(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
