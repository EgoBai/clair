import React from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import KnowledgeBase from '../pages/KnowledgeBase';

const seed = () => {
  const longAnswer = '这是一段很长的研究记录，用于验证预览被截断。'.repeat(6) + '展开后的完整结论在这里。';
  localStorage.setItem('clair_knowledge_base', JSON.stringify([{
    id: 'note_deep_1',
    question: '渠道库存跟踪',
    answer: longAnswer,
    category: '学习笔记',
    tags: ['渠道'],
    page: '手动笔记',
    createdAt: '2026-11-05T02:00:00.000Z',
  }]));
};

describe('笔记深链', () => {
  beforeEach(() => {
    localStorage.clear();
    seed();
  });

  it('从观点卡研究档案进入 /knowledge?note= 时展开对应笔记', () => {
    render(
      <MemoryRouter initialEntries={['/knowledge?note=note_deep_1']}>
        <KnowledgeBase />
      </MemoryRouter>,
    );
    expect(screen.getByText('渠道库存跟踪')).toBeTruthy();
    expect(screen.getByText(/展开后的完整结论在这里/)).toBeTruthy();
  });
});
