// @vitest-environment jsdom
/**
 * 发掘页数据源角标的「绝不整页崩」契约。
 *
 * 2026-11-04 线上事故：DiscoverPage 把后端 meta.source 直接塞进 DataSourceState.kind，
 * 后端返回 'real' / 'partial' 时 KIND_STYLE 查不到键，DataSourceBadge 读 undefined.color
 * 抛 TypeError，ErrorBoundary 把整个「发掘」页替换成「渲染出错」。
 *
 * 本测试钉死三条：
 *   1. 'real' 归一为 'live'（真实数据不显示角标）
 *   2. 'partial' 有明确文案「部分数据」，不算 live
 *   3. 任何未知 kind 只能降级成「数据不可用」角标，绝不允许抛异常
 */

import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import {
  DataSourceBadge,
  normalizeSourceKind,
  isUntrusted,
  type DataSourceState,
  type SourceKind,
} from '../components/discover/DataSourceIndicator';

describe('normalizeSourceKind：后端来源口径归一', () => {
  it('real 与 live 都视为真实数据', () => {
    expect(normalizeSourceKind('real')).toBe('live');
    expect(normalizeSourceKind('live')).toBe('live');
  });

  it('partial 保留为独立态（真实但字段不全）', () => {
    expect(normalizeSourceKind('partial')).toBe('partial');
    expect(isUntrusted({ kind: 'partial', updatedAt: null })).toBe(true);
  });

  it('既有四态原样保留', () => {
    const passthrough: SourceKind[] = ['stale', 'unavailable', 'demo', 'loading'];
    passthrough.forEach(k => expect(normalizeSourceKind(k)).toBe(k));
  });

  it('未知字符串返回 null（无信任级别信号），绝不冒充不可用', () => {
    expect(normalizeSourceKind('v3-lite')).toBe(null);
    expect(normalizeSourceKind('mystery')).toBe(null);
    expect(normalizeSourceKind(undefined)).toBe(null);
    expect(normalizeSourceKind(null)).toBe(null);
    expect(normalizeSourceKind('')).toBe(null);
  });
});

describe('DataSourceBadge：未知 kind 不崩', () => {
  it('live 不渲染任何角标', () => {
    const { container } = render(<DataSourceBadge state={{ kind: 'live', updatedAt: null }} />);
    expect(container.textContent).toBe('');
  });

  it('partial 显示「部分数据」', () => {
    render(<DataSourceBadge state={{ kind: 'partial', updatedAt: null }} />);
    expect(screen.getByText('部分数据')).toBeTruthy();
  });

  it('未经归一的 real 不抛错（降级为数据不可用角标）', () => {
    const raw = { kind: 'real', updatedAt: null } as unknown as DataSourceState;
    expect(() => render(<DataSourceBadge state={raw} />)).not.toThrow();
    expect(screen.getByText('数据不可用')).toBeTruthy();
  });

  it('任意未知字符串都不抛错', () => {
    const raw = { kind: 'brand_new_kind', updatedAt: null } as unknown as DataSourceState;
    expect(() => render(<DataSourceBadge state={raw} />)).not.toThrow();
  });
});