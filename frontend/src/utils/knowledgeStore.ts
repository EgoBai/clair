/**
 * 个人知识库存储 (localStorage-based v1)
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

export const CATEGORIES: { key: KnowledgeCategory; label: string; icon: string; desc: string }[] = [
  { key: '产业知识', label: '产业知识', icon: '🏭', desc: '产业链、技术趋势、竞争格局' },
  { key: '投资方法', label: '投资方法', icon: '📚', desc: '估值方法、策略框架、交易技巧' },
  { key: '关注概念', label: '关注概念', icon: '💡', desc: '热点概念、政策主题、市场风格' },
  { key: '学习笔记', label: '学习笔记', icon: '📝', desc: '市场复盘、投资心得、经验教训' },
];
