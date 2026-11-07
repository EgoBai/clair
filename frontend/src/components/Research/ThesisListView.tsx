import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Button, Card, Empty, Input, Modal, Segmented, Space, Tag, Typography,
} from 'antd';
import {
  BulbOutlined, DeleteOutlined, EditOutlined, HistoryOutlined, SearchOutlined,
} from '@ant-design/icons';
import { EmptyState } from '../Common/StateComponents';
import { ThesisResearchLinks } from './ThesisResearchSection';
import { evaluateThesis, THESIS_CHECK_COLOR } from '../../utils/thesisCheck';
import { useThesisPrices } from '../../hooks/useThesisPrices';
import {
  useThesisStore,
  THESIS_STANCE_LABEL,
  THESIS_STANCE_COLOR,
  THESIS_CONFIDENCE_LABEL,
  type ThesisCard,
  type ThesisStance,
} from '../../store/useThesisStore';

const { Text, Paragraph } = Typography;

type StanceFilter = 'all' | ThesisStance;

const formatTime = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('zh-CN', { hour12: false });
};

const filled = (value: string): string => value || '未填写';

/**
 * 观点卡列表：把分散在各只股票下的观点集中到一处。
 * 只读本地存储；不提供跨设备同步，也不伪装成投顾建议。
 */
const ThesisListView: React.FC = () => {
  const navigate = useNavigate();
  const cards = useThesisStore((state) => state.cards);
  const remove = useThesisStore((state) => state.remove);
  const [stance, setStance] = useState<StanceFilter>('all');
  const [query, setQuery] = useState('');
  const symbols = useMemo(() => cards.map((card) => card.symbol), [cards]);
  const prices = useThesisPrices(symbols);

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return cards.filter((card) => {
      if (stance !== 'all' && card.stance !== stance) return false;
      if (!keyword) return true;
      const archive = (card.research ?? []).flatMap((item) => [item.title, item.meta]);
      return [card.symbol, card.name, card.thesis, card.catalysts, card.risks, card.invalidation, ...archive]
        .some((field) => field.toLowerCase().includes(keyword));
    });
  }, [cards, query, stance]);

  const confirmDelete = (card: ThesisCard) => {
    Modal.confirm({
      title: '删除观点卡',
      content: `删除「${card.name}」的观点卡与全部复盘记录？此操作不可恢复。`,
      okText: '删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => remove(card.id),
    });
  };

  if (cards.length === 0) {
    return (
      <EmptyState
        icon={<BulbOutlined style={{ fontSize: 48, color: 'var(--text-tertiary)' }} />}
        title="还没有观点卡"
        description="到个股详情页写下结论、催化、风险与证伪条件，观点会集中在这里，方便回看与复盘。"
        action={{ text: '去个股写观点', onClick: () => navigate('/stocks'), type: 'primary' }}
      />
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        {/* 375px 下五个筛选项总宽超过视口：只让筛选条内部横滚，不撑破页面 */}
        <div style={{ flex: '1 1 320px', minWidth: 0, maxWidth: '100%', overflowX: 'auto' }}>
          <Segmented
            value={stance}
            onChange={(value) => setStance(value as StanceFilter)}
            options={[
              { label: `全部 ${cards.length}`, value: 'all' },
              ...(Object.keys(THESIS_STANCE_LABEL) as ThesisStance[]).map((key) => ({
                label: `${THESIS_STANCE_LABEL[key]} ${cards.filter((card) => card.stance === key).length}`,
                value: key,
              })),
            ]}
            style={{ whiteSpace: 'nowrap' }}
          />
        </div>
        <Input
          prefix={<SearchOutlined />}
          placeholder="搜索标的、逻辑、风险或证伪条件"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          allowClear
          style={{ flex: '1 1 220px', minWidth: 0, maxWidth: 360 }}
        />
      </div>

      {filtered.length === 0 ? (
        <Empty description="没有匹配的观点卡" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.map((card) => {
            const latestRevision = card.revisions[card.revisions.length - 1];
            const research = card.research ?? [];
            const check = evaluateThesis(card, prices[card.symbol]);
            return (
              <Card
                key={card.id}
                size="small"
                title={(
                  <Space size={8} wrap>
                    <Link to={`/stocks/${card.symbol}`} style={{ fontWeight: 700 }}>
                      {card.name} <Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>{card.symbol}</Text>
                    </Link>
                    <Tag style={{
                      color: THESIS_STANCE_COLOR[card.stance],
                      background: 'transparent',
                      borderColor: 'currentColor',
                      margin: 0,
                    }}>
                      {THESIS_STANCE_LABEL[card.stance]}
                    </Tag>
                    <Tag>置信度 {THESIS_CONFIDENCE_LABEL[card.confidence]}</Tag>
                  </Space>
                )}
                extra={(
                  <Space size={4}>
                    <Link to={`/stocks/${card.symbol}`}><Button size="small" type="text" icon={<EditOutlined />}>更新</Button></Link>
                    <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => confirmDelete(card)}>删除</Button>
                  </Space>
                )}
                style={{ border: '1px solid var(--border-subtle)' }}
              >
                <Paragraph style={{ marginBottom: 10, whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
                  {card.thesis || '尚未写下核心逻辑'}
                </Paragraph>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 10 }}>
                  <div>
                    <Text type="secondary" style={{ fontSize: 12 }}>催化</Text>
                    <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{filled(card.catalysts)}</div>
                  </div>
                  <div>
                    <Text type="secondary" style={{ fontSize: 12 }}>风险</Text>
                    <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{filled(card.risks)}</div>
                  </div>
                  <div>
                    <Text type="secondary" style={{ fontSize: 12 }}>证伪条件</Text>
                    <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{filled(card.invalidation)}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    估值 {[card.valuation.buy, card.valuation.fair, card.valuation.sell].every((v) => v == null)
                      ? '未填写'
                      : `买入 ${card.valuation.buy ?? '—'} / 合理 ${card.valuation.fair ?? '—'} / 卖出 ${card.valuation.sell ?? '—'}`}
                  </Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    <HistoryOutlined style={{ marginRight: 4 }} />
                    复盘 {card.revisions.length} 次 · {formatTime(card.updatedAt)}
                  </Text>
                  {latestRevision && (
                    <Text type="secondary" style={{ fontSize: 12 }}>最近：{latestRevision.note}</Text>
                  )}
                </div>
                <div
                  style={{
                    marginTop: 10,
                    padding: '8px 10px',
                    borderRadius: 6,
                    background: 'var(--bg-secondary, rgba(0,0,0,0.02))',
                    borderLeft: '3px solid ' + THESIS_CHECK_COLOR[check.verdict],
                  }}
                >
                  <Space size={8} wrap>
                    <Text strong style={{ fontSize: 12, color: THESIS_CHECK_COLOR[check.verdict] }}>
                      观点检查 · {check.label}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {check.reasons.join('；')}
                    </Text>
                  </Space>
                </div>
                <div style={{ marginTop: 8, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {card.evidence.map((item) => (
                    item.url
                      ? <Link key={item.label} to={item.url} style={{ fontSize: 12 }}>{item.label}</Link>
                      : <Text key={item.label} type="secondary" style={{ fontSize: 12 }}>{item.label}</Text>
                  ))}
                </div>
                {research.length > 0 && (
                  <div style={{ marginTop: 10, borderTop: '1px solid var(--border-subtle)', paddingTop: 10 }}>
                    <div style={{ marginBottom: 6 }}>
                      <Text strong style={{ fontSize: 12 }}>研究档案</Text>
                      <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>{research.length} 条</Text>
                    </div>
                    <ThesisResearchLinks links={research} />
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ThesisListView;
