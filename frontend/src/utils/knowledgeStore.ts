/**
 * 投资笔记存储 (原"知识库", localStorage-based v1)
 * 
 * 结构: { id, question, answer, category, tags, page, symbol?, createdAt }
 * 分类: 产业知识 | 投资方法 | 关注概念 | 学习笔记
 */

export type KnowledgeCategory = '产业知识' | '投资方法' | '关注概念' | '学习笔记';

export interface KnowledgeEntry {
  id: string;
  question: string;
  answer: string;
  category: KnowledgeCategory;
  tags: string[];
  page: string;
  symbol?: string;
  createdAt: string; // ISO
}

export interface NoteStats {
  total: number;
  thisWeek: number;
  topCategory: { key: KnowledgeCategory; label: string; icon: string; count: number } | null;
}

const STORAGE_KEY = 'clair_knowledge_base';

function readAll(): KnowledgeEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function writeAll(entries: KnowledgeEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch { /* storage full */ }
}

export function saveEntry(entry: Omit<KnowledgeEntry, 'id' | 'createdAt'>): KnowledgeEntry {
  const entries = readAll();
  const newEntry: KnowledgeEntry = {
    ...entry,
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    createdAt: new Date().toISOString(),
  };
  entries.unshift(newEntry); // newest first
  writeAll(entries);
  return newEntry;
}

/**
 * 保存手动笔记 (title + content)
 */
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

export function deleteEntry(id: string): void {
  writeAll(readAll().filter(e => e.id !== id));
}

export function getEntries(category?: KnowledgeCategory): KnowledgeEntry[] {
  const all = readAll();
  return category ? all.filter(e => e.category === category) : all;
}

export function getEntryCount(): number {
  return readAll().length;
}

export function getCategoryCounts(): Record<KnowledgeCategory, number> {
  const counts: Record<string, number> = { '产业知识': 0, '投资方法': 0, '关注概念': 0, '学习笔记': 0 };
  for (const e of readAll()) {
    if (counts[e.category] !== undefined) counts[e.category]++;
  }
  return counts as Record<KnowledgeCategory, number>;
}

export function searchEntries(query: string): KnowledgeEntry[] {
  const q = query.toLowerCase();
  return readAll().filter(e =>
    e.question.toLowerCase().includes(q) ||
    e.answer.toLowerCase().includes(q) ||
    e.tags.some(t => t.toLowerCase().includes(q))
  );
}

/**
 * 获取笔记统计: 总数 / 本周新增 / 最常关注分类
 */
export function getNoteStats(): NoteStats {
  const all = readAll();
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  weekStart.setHours(0, 0, 0, 0);

  const thisWeek = all.filter(e => new Date(e.createdAt) >= weekStart).length;

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

export const CATEGORIES: { key: KnowledgeCategory; label: string; icon: string; desc: string }[] = [
  { key: '产业知识', label: '产业知识', icon: '🏭', desc: '产业链、技术趋势、竞争格局' },
  { key: '投资方法', label: '投资方法', icon: '📚', desc: '估值方法、策略框架、交易技巧' },
  { key: '关注概念', label: '关注概念', icon: '💡', desc: '热点概念、政策主题、市场风格' },
  { key: '学习笔记', label: '学习笔记', icon: '📝', desc: '市场复盘、投资心得、经验教训' },
];
