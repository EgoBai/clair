import { beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { useThesisStore, type ThesisInput } from '../store/useThesisStore';

const baseInput = (overrides: Partial<ThesisInput> = {}): ThesisInput => ({
  symbol: '600519',
  name: '贵州茅台',
  stance: 'bullish',
  thesis: '高端酒需求稳定，直营占比提升带动利润率。',
  catalysts: '春节动销超预期',
  risks: '批价持续下行',
  invalidation: '单季营收同比转负',
  valuation: { buy: 1200, fair: 1500, sell: 1800 },
  confidence: 'medium',
  evidence: [{ type: 'data', label: '本页行情与财务数据', url: '/stocks/600519' }],
  ...overrides,
});

describe('观点卡 store', () => {
  beforeEach(() => {
    localStorage.clear();
    useThesisStore.setState({ cards: [] });
  });

  it('创建观点卡：一只股票一张，生成创建复盘记录并写入本地存储', () => {
    let createdId = '';
    act(() => {
      const result = useThesisStore.getState().upsert(baseInput());
      createdId = result.card.id;
      expect(result.created).toBe(true);
    });
    const cards = useThesisStore.getState().cards;
    expect(cards).toHaveLength(1);
    expect(cards[0].id).toMatch(/^thesis_/);
    expect(cards[0].symbol).toBe('600519');
    expect(cards[0].revisions).toHaveLength(1);
    expect(cards[0].revisions[0].note).toBe('创建观点卡');
    expect(cards[0].createdAt).toBeTruthy();
    expect(useThesisStore.getState().findBySymbol('600519')?.id).toBe(createdId);
    expect(localStorage.getItem('clair-thesis-cards-v1')).toContain('贵州茅台');
  });

  it('更新同一只股票：覆盖原卡，追加本次变化而不是新建第二张', () => {
    act(() => {
      useThesisStore.getState().upsert(baseInput());
    });
    act(() => {
      const result = useThesisStore.getState().upsert(baseInput({
        stance: 'neutral',
        thesis: '估值已反映复苏预期。',
        confidence: 'high',
      }));
      expect(result.created).toBe(false);
    });
    const cards = useThesisStore.getState().cards;
    expect(cards).toHaveLength(1);
    expect(cards[0].stance).toBe('neutral');
    expect(cards[0].confidence).toBe('high');
    expect(cards[0].revisions).toHaveLength(2);
    expect(cards[0].revisions[1].note).toContain('结论');
    expect(cards[0].revisions[1].note).toContain('核心逻辑');
  });

  it('内容未变时不制造虚假复盘记录，也不改更新时间', () => {
    act(() => {
      useThesisStore.getState().upsert(baseInput());
    });
    const firstUpdatedAt = useThesisStore.getState().cards[0].updatedAt;
    act(() => {
      useThesisStore.getState().upsert(baseInput());
    });
    expect(useThesisStore.getState().cards[0].revisions).toHaveLength(1);
    expect(useThesisStore.getState().cards[0].updatedAt).toBe(firstUpdatedAt);
  });

  it('按代码查找与删除', () => {
    act(() => {
      useThesisStore.getState().upsert(baseInput());
      useThesisStore.getState().upsert(baseInput({
        symbol: '000002', name: '万科A', stance: 'watch',
        thesis: '等待销售数据企稳。',
      }));
    });
    expect(useThesisStore.getState().findBySymbol('000002')?.name).toBe('万科A');
    const target = useThesisStore.getState().findBySymbol('600519');
    act(() => {
      useThesisStore.getState().remove(target!.id);
    });
    expect(useThesisStore.getState().cards).toHaveLength(1);
    expect(useThesisStore.getState().findBySymbol('600519')).toBeUndefined();
  });
});
