/**
 * 投资笔记存储 (localStorage-based)
 * 
 * 结构: { id, question, answer, category, tags, page, symbol?, createdAt }
 * 分类: 产业知识 | 投资方法 | 关注概念 | 学习笔记
 * 
 * 事件: 保存笔记时派发 'knowledge-note-saved' custom event，供 FloatingChat 等组件监听
 */

// ============================================================
// 类型定义
// ============================================================

export type KnowledgeCategory = '产业知识' | '投资方法' | '关注概念' | '学习笔记';

export interface KnowledgeEntry {
  id: string;
  question: string;
  answer: string;
  category: KnowledgeCategory;
  tags: string[];
  page: string;
  symbol?: string;
  createdAt: string; // ISO 8601
  polished?: boolean; // 是否经 AI 润色
}

export interface NoteStats {
  total: number;
  thisWeek: number;
  topCategory: { key: KnowledgeCategory; label: string; icon: string; count: number } | null;
}

export interface CategoryInfo {
  key: KnowledgeCategory;
  label: string;
  icon: string;
  desc: string;
}

// ============================================================
// 常量
// ============================================================

const STORAGE_KEY = 'clair_knowledge_base';

export const CATEGORIES: CategoryInfo[] = [
  { key: '产业知识',   label: '产业知识',   icon: '🏭', desc: '产业链、技术趋势、竞争格局' },
  { key: '投资方法',   label: '投资方法',   icon: '📚', desc: '估值方法、策略框架、交易技巧' },
  { key: '关注概念',   label: '关注概念',   icon: '💡', desc: '热点概念、政策主题、市场风格' },
  { key: '学习笔记',   label: '学习笔记',   icon: '📝', desc: '市场复盘、投资心得、经验教训' },
];

// ============================================================
// 内部读写
// ============================================================

function readAll(): KnowledgeEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeAll(entries: KnowledgeEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    /* storage full — silently drop; UI should show warning */
  }
}

// ============================================================
// 公共 API — 增删改查
// ============================================================

/** 保存原始条目 (从 AI 对话中保存) */
export function saveEntry(entry: Omit<KnowledgeEntry, 'id' | 'createdAt'>): KnowledgeEntry {
  const entries = readAll();
  const newEntry: KnowledgeEntry = {
    ...entry,
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    createdAt: new Date().toISOString(),
  };
  entries.unshift(newEntry);
  writeAll(entries);
  dispatchNoteSaved(newEntry);
  return newEntry;
}

/** 保存手动笔记 (title + content) */
export function saveManualNote(data: {
  title: string;
  content: string;
  category: KnowledgeCategory;
  tags?: string[];
  symbol?: string;
}): KnowledgeEntry {
  return saveEntry({
    question: data.title,
    answer: data.content,
    category: data.category,
    tags: data.tags || [],
    page: '手动笔记',
    symbol: data.symbol,
  });
}

/** 删除笔记 */
export function deleteEntry(id: string): void {
  writeAll(readAll().filter(e => e.id !== id));
}

/** 更新笔记 (最小 update action: 局部 patch 已存条目) */
export function updateEntry(
  id: string,
  patch: Partial<Omit<KnowledgeEntry, 'id' | 'createdAt'>>,
): void {
  const entries = readAll();
  const idx = entries.findIndex(e => e.id === id);
  if (idx === -1) return;
  entries[idx] = { ...entries[idx], ...patch };
  writeAll(entries);
}

/** 获取笔记列表 (可按分类筛选) */
export function getEntries(category?: KnowledgeCategory): KnowledgeEntry[] {
  const all = readAll();
  return category ? all.filter(e => e.category === category) : all;
}

/** 获取笔记总数 */
export function getEntryCount(): number {
  return readAll().length;
}

/** 获取各分类笔记数 */
export function getCategoryCounts(): Record<KnowledgeCategory, number> {
  const counts: Record<string, number> = { '产业知识': 0, '投资方法': 0, '关注概念': 0, '学习笔记': 0 };
  for (const e of readAll()) {
    if (counts[e.category] !== undefined) counts[e.category]++;
  }
  return counts as Record<KnowledgeCategory, number>;
}

/** 搜索笔记 (标题 + 内容 + 标签) */
export function searchEntries(query: string): KnowledgeEntry[] {
  const q = query.toLowerCase();
  return readAll().filter(e =>
    e.question.toLowerCase().includes(q) ||
    e.answer.toLowerCase().includes(q) ||
    e.tags.some(t => t.toLowerCase().includes(q))
  );
}

/** 获取笔记统计: 总数 / 本周新增 / 最常关注分类 */
export function getNoteStats(): NoteStats {
  const all = readAll();
  const now = new Date();

  // 本周起始: 本周一 00:00
  const weekStart = new Date(now);
  const dayOfWeek = now.getDay();
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  weekStart.setDate(now.getDate() - daysSinceMonday);
  weekStart.setHours(0, 0, 0, 0);

  const thisWeek = all.filter(e => new Date(e.createdAt) >= weekStart).length;

  // 最常关注分类
  const counts = getCategoryCounts();
  let topCategory: NoteStats['topCategory'] = null;
  let max = 0;
  for (const c of CATEGORIES) {
    if (counts[c.key] > max) {
      max = counts[c.key];
      topCategory = { key: c.key, label: c.label, icon: c.icon, count: counts[c.key] };
    }
  }

  return { total: all.length, thisWeek, topCategory };
}

// ============================================================
// 事件系统 — 跨组件通信
// ============================================================

/**
 * 笔记保存事件名 — FloatingChat/ChatPanel 可监听此事件来显示保存成功 toast
 */
export const NOTE_SAVED_EVENT = 'knowledge-note-saved';

export interface NoteSavedEventDetail {
  entry: KnowledgeEntry;
  source: 'manual' | 'ai-chat';
}

function dispatchNoteSaved(entry: KnowledgeEntry, source: 'manual' | 'ai-chat' = 'manual') {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent<NoteSavedEventDetail>(NOTE_SAVED_EVENT, {
        detail: { entry, source },
      })
    );
  }
}
