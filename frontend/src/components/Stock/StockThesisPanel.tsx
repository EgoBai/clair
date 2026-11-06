import React, { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Button, Card, Form, Input, InputNumber, Modal, Radio, Space, Tag, Typography, message,
} from 'antd';
import { BulbOutlined, EditOutlined, HistoryOutlined } from '@ant-design/icons';
import {
  useThesisStore,
  THESIS_STANCE_LABEL,
  THESIS_STANCE_COLOR,
  THESIS_CONFIDENCE_LABEL,
  type ThesisConfidence,
  type ThesisInput,
  type ThesisStance,
} from '../../store/useThesisStore';

const { Text, Paragraph } = Typography;
const { TextArea } = Input;

interface StockThesisPanelProps {
  symbol: string;
  name: string;
}

interface ThesisFormValues {
  stance: ThesisStance;
  confidence: ThesisConfidence;
  thesis?: string;
  catalysts?: string;
  risks?: string;
  invalidation?: string;
  buy?: number | null;
  fair?: number | null;
  sell?: number | null;
}

const stanceTagStyle = (stance: ThesisStance): React.CSSProperties => ({
  color: THESIS_STANCE_COLOR[stance],
  background: 'transparent',
  borderColor: 'currentColor',
  margin: 0,
});

const formatTime = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('zh-CN', { hour12: false });
};

const ThesisField: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div style={{ minWidth: 0 }}>
    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>{label}</div>
    <div style={{ fontSize: 13, color: value ? 'var(--text-primary)' : 'var(--text-tertiary)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
      {value || '未填写'}
    </div>
  </div>
);

/**
 * 个股页的「我的观点」卡。
 * 本地保存，一只股票一张；冲突时保留用户自己的结论，不替用户判断。
 */
const StockThesisPanel: React.FC<StockThesisPanelProps> = ({ symbol, name }) => {
  const card = useThesisStore((state) => state.cards.find((item) => item.symbol === symbol));
  const upsert = useThesisStore((state) => state.upsert);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm<ThesisFormValues>();

  const openEditor = useCallback(() => {
    form.setFieldsValue({
      stance: card?.stance ?? 'watch',
      confidence: card?.confidence ?? 'medium',
      thesis: card?.thesis ?? '',
      catalysts: card?.catalysts ?? '',
      risks: card?.risks ?? '',
      invalidation: card?.invalidation ?? '',
      buy: card?.valuation.buy ?? null,
      fair: card?.valuation.fair ?? null,
      sell: card?.valuation.sell ?? null,
    });
    setOpen(true);
  }, [card, form]);

  const handleSave = useCallback(async () => {
    const values = await form.validateFields();
    const input: ThesisInput = {
      symbol,
      name,
      stance: values.stance,
      confidence: values.confidence,
      thesis: values.thesis ?? '',
      catalysts: values.catalysts ?? '',
      risks: values.risks ?? '',
      invalidation: values.invalidation ?? '',
      valuation: {
        buy: typeof values.buy === 'number' ? values.buy : null,
        fair: typeof values.fair === 'number' ? values.fair : null,
        sell: typeof values.sell === 'number' ? values.sell : null,
      },
      evidence: [
        { type: 'data', label: '本页行情与财务数据', url: `/stocks/${symbol}` },
        { type: 'report', label: '该股研报列表', url: `/report-center?symbol=${symbol}` },
      ],
    };
    const result = upsert(input);
    setOpen(false);
    message.success(result.created ? '观点卡已创建' : '观点卡已更新，并记录了本次变化');
  }, [form, name, symbol, upsert]);

  const valuation = card?.valuation;
  const hasValuation = !!valuation && [valuation.buy, valuation.fair, valuation.sell].some((v) => typeof v === 'number');

  return (
    <Card
      size="small"
      id="stock-thesis"
      title={(
        <Space size={8}>
          <BulbOutlined style={{ color: 'var(--color-warning)' }} />
          <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 14 }}>我的观点</span>
          {card ? <Tag style={stanceTagStyle(card.stance)}>{THESIS_STANCE_LABEL[card.stance]}</Tag> : <Tag>未建立</Tag>}
        </Space>
      )}
      extra={(
        <Button size="small" type={card ? 'default' : 'primary'} icon={card ? <EditOutlined /> : undefined} onClick={openEditor}>
          {card ? '更新观点' : '写观点卡'}
        </Button>
      )}
      style={{ marginBottom: 12, borderRadius: 8, border: '1px solid var(--border-subtle)' }}
    >
      {!card ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <Text type="secondary" style={{ fontSize: 13 }}>
            还没有观点卡。先写下你的结论、催化、风险与证伪条件；可以只填结论，之后再补。
          </Text>
          <Link to="/knowledge?tab=theses" style={{ fontSize: 13 }}>查看全部观点卡</Link>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <Text type="secondary" style={{ fontSize: 12 }}>置信度 {THESIS_CONFIDENCE_LABEL[card.confidence]}</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>更新于 {formatTime(card.updatedAt)}</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              <HistoryOutlined style={{ marginRight: 4 }} />
              复盘 {card.revisions.length} 次
            </Text>
          </div>

          <Paragraph style={{ margin: 0, color: card.thesis ? 'var(--text-primary)' : 'var(--text-tertiary)', whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
            {card.thesis || '尚未写下核心逻辑'}
          </Paragraph>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <ThesisField label="催化" value={card.catalysts} />
            <ThesisField label="风险" value={card.risks} />
            <ThesisField label="证伪条件" value={card.invalidation} />
          </div>

          <div style={{ fontSize: 13 }}>
            <span style={{ color: 'var(--text-secondary)', marginRight: 8 }}>估值区间</span>
            {hasValuation ? (
              <Space size={12} wrap>
                <span>买入 {valuation?.buy ?? '—'}</span>
                <span>合理 {valuation?.fair ?? '—'}</span>
                <span>卖出 {valuation?.sell ?? '—'}</span>
              </Space>
            ) : (
              <Text type="secondary">未填写</Text>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <Space size={12} wrap>
              <Text type="secondary" style={{ fontSize: 12 }}>证据</Text>
              {card.evidence.map((item) => (
                item.url ? <Link key={item.label} to={item.url} style={{ fontSize: 12 }}>{item.label}</Link> : <Text key={item.label} type="secondary" style={{ fontSize: 12 }}>{item.label}</Text>
              ))}
            </Space>
            <Link to="/knowledge?tab=theses" style={{ fontSize: 12 }}>查看全部</Link>
          </div>
        </div>
      )}

      <Modal
        title={card ? `更新观点 · ${name}` : `写观点卡 · ${name}`}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={handleSave}
        okText="保存观点"
        cancelText="取消"
        width={680}
        destroyOnClose
        styles={{ body: { maxHeight: '68vh', overflowY: 'auto', paddingRight: 8 } }}
      >
        <Form form={form} layout="vertical" initialValues={{ stance: 'watch', confidence: 'medium' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="stance" label="结论">
              <Radio.Group optionType="button" buttonStyle="solid">
                {(Object.keys(THESIS_STANCE_LABEL) as ThesisStance[]).map((key) => (
                  <Radio.Button key={key} value={key}>{THESIS_STANCE_LABEL[key]}</Radio.Button>
                ))}
              </Radio.Group>
            </Form.Item>
            <Form.Item name="confidence" label="置信度">
              <Radio.Group optionType="button" buttonStyle="solid">
                {(Object.keys(THESIS_CONFIDENCE_LABEL) as ThesisConfidence[]).map((key) => (
                  <Radio.Button key={key} value={key}>{THESIS_CONFIDENCE_LABEL[key]}</Radio.Button>
                ))}
              </Radio.Group>
            </Form.Item>
          </div>
          <Form.Item name="thesis" label="核心逻辑（三句话以内）">
            <TextArea rows={3} maxLength={240} showCount placeholder="例如：高端酒需求稳定，直营占比提升带动利润率；当前估值低于三年中位。" />
          </Form.Item>
          <Form.Item name="catalysts" label="催化（未来 3–12 个月）">
            <TextArea rows={2} maxLength={400} placeholder="可观测的事件，不要写愿望。" />
          </Form.Item>
          <Form.Item name="risks" label="风险（什么会让逻辑失效）">
            <TextArea rows={2} maxLength={400} placeholder="写最可能推翻结论的那一条。" />
          </Form.Item>
          <Form.Item name="invalidation" label="证伪条件（可观测的指标或事件）">
            <TextArea rows={2} maxLength={400} placeholder="例如：单季营收同比转负，或批价连续两个季度下行。" />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
            <Form.Item name="buy" label="买入区间">
              <InputNumber min={0} precision={2} style={{ width: '100%' }} placeholder="可空" />
            </Form.Item>
            <Form.Item name="fair" label="合理区间">
              <InputNumber min={0} precision={2} style={{ width: '100%' }} placeholder="可空" />
            </Form.Item>
            <Form.Item name="sell" label="卖出区间">
              <InputNumber min={0} precision={2} style={{ width: '100%' }} placeholder="可空" />
            </Form.Item>
          </div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            保存后会自动关联本页数据与研报列表作为证据；数据只保存在本机浏览器。
          </Text>
        </Form>
      </Modal>
    </Card>
  );
};

export default StockThesisPanel;
