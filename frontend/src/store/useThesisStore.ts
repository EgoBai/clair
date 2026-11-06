import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * 观点卡：一只股票一张，随结论变化追加复盘记录。
 *
 * 为什么不放后端：设计稿明确「先本地存储，验证使用频率后再上后端」。
 * 数据只存在当前浏览器 localStorage，不冒充云端同步，也不上报。
 */

export type ThesisStance = 'bullish' | 'neutral' | 'bearish' | 'watch';
export type ThesisConfidence = 'low' | 'medium' | 'high';
export type ThesisEvidenceType = 'data' | 'report' | 'note' | 'link';

export interface ThesisEvidence {
  type: ThesisEvidenceType;
  label: string;
  url?: string;
}

export interface ThesisRevision {
  at: string;
  note: string;
}

export interface ThesisValuation {
  buy: number | null;
  fair: number | null;
  sell: number | null;
}

export interface ThesisCard {
  id: string;
  symbol: string;
  name: string;
  stance: ThesisStance;
  thesis: string;
  catalysts: string;
  risks: string;
  invalidation: string;
  valuation: ThesisValuation;
  confidence: ThesisConfidence;
  evidence: ThesisEvidence[];
  revisions: ThesisRevision[];
  createdAt: string;
  updatedAt: string;
}

export interface ThesisInput {
  symbol: string;
  name: string;
  stance: ThesisStance;
  thesis: string;
  catalysts: string;
  risks: string;
  invalidation: string;
  valuation: ThesisValuation;
  confidence: ThesisConfidence;
  evidence: ThesisEvidence[];
}

const STORAGE_KEY = 'clair-thesis-cards-v1';
let seq = 0;

function nextId(): string {
  seq += 1;
  return `thesis_${Date.now().toString(36)}_${seq.toString(36)}`;
}

function clean(value: string): string {
  return value.trim();
}

function changedFields(prev: ThesisCard, next: ThesisInput): string[] {
  const labels: string[] = [];
  if (prev.stance !== next.stance) labels.push('结论');
  if (prev.thesis !== clean(next.thesis)) labels.push('核心逻辑');
  if (prev.catalysts !== clean(next.catalysts)) labels.push('催化');
  if (prev.risks !== clean(next.risks)) labels.push('风险');
  if (prev.invalidation !== clean(next.invalidation)) labels.push('证伪条件');
  if (prev.confidence !== next.confidence) labels.push('置信度');
  const pv = prev.valuation;
  const nv = next.valuation;
  if (pv.buy !== nv.buy || pv.fair !== nv.fair || pv.sell !== nv.sell) labels.push('估值区间');
  return labels;
}

interface ThesisState {
  cards: ThesisCard[];
  upsert: (input: ThesisInput) => { card: ThesisCard; created: boolean };
  remove: (id: string) => void;
  findBySymbol: (symbol: string) => ThesisCard | undefined;
}

export const useThesisStore = create<ThesisState>()(
  persist(
    (set, get) => ({
      cards: [],
      findBySymbol: (symbol) => get().cards.find((card) => card.symbol === symbol),
      upsert: (input) => {
        const now = new Date().toISOString();
        const existing = get().cards.find((card) => card.symbol === input.symbol);
        const base = {
          symbol: input.symbol,
          name: clean(input.name) || input.symbol,
          stance: input.stance,
          thesis: clean(input.thesis),
          catalysts: clean(input.catalysts),
          risks: clean(input.risks),
          invalidation: clean(input.invalidation),
          valuation: input.valuation,
          confidence: input.confidence,
          evidence: input.evidence,
          updatedAt: now,
        };

        if (!existing) {
          const card: ThesisCard = {
            ...base,
            id: nextId(),
            createdAt: now,
            revisions: [{ at: now, note: '创建观点卡' }],
          };
          set((state) => ({ cards: [card, ...state.cards] }));
          return { card, created: true };
        }

        const changed = changedFields(existing, input);
        const card: ThesisCard = {
          ...existing,
          ...base,
          // 内容没变时保留原更新时间，避免「更新时间变了但没有复盘记录」
          updatedAt: changed.length ? now : existing.updatedAt,
          revisions: changed.length
            ? [...existing.revisions, { at: now, note: `更新：${changed.join('、')}` }]
            : existing.revisions,
        };
        set((state) => ({ cards: state.cards.map((item) => (item.id === existing.id ? card : item)) }));
        return { card, created: false };
      },
      remove: (id) => set((state) => ({ cards: state.cards.filter((card) => card.id !== id) })),
    }),
    {
      name: STORAGE_KEY,
      version: 1,
      partialize: (state) => ({ cards: state.cards }),
    },
  ),
);

export const THESIS_STANCE_LABEL: Record<ThesisStance, string> = {
  bullish: '看多',
  neutral: '中性',
  bearish: '看空',
  watch: '观察',
};

export const THESIS_STANCE_COLOR: Record<ThesisStance, string> = {
  bullish: 'var(--color-up)',
  neutral: 'var(--text-secondary)',
  bearish: 'var(--color-down)',
  watch: 'var(--color-warning)',
};

export const THESIS_CONFIDENCE_LABEL: Record<ThesisConfidence, string> = {
  low: '低',
  medium: '中',
  high: '高',
};
