/**
 * 策略模板管理页面
 * 支持浏览、创建、编辑、删除自定义策略模板
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../utils/api';
import {
  Card, Button, Tag, Modal, Form, Input, Select, Space, Typography,
  message, Spin, Empty, Tooltip, Popconfirm, Divider, InputNumber
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, CopyOutlined,
  PlayCircleOutlined, FilterOutlined, StarOutlined,
  RocketOutlined, FundOutlined, LineChartOutlined, ThunderboltOutlined, RiseOutlined, RobotOutlined, BulbOutlined
} from '@ant-design/icons';

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;
const { TextArea } = Input;

import { THEME } from '../styles/theme-constants';
const BG = THEME.bg;
const CARD_BG = THEME.cardBg;
const BORDER = THEME.border;
const TEXT = THEME.text;
const TEXT_SEC = THEME.textSec;
const ACCENT = THEME.accent;

// 策略模板接口
interface StrategyTemplate {
  id: number;
  name: string;
  name_en: string;
  description: string;
  icon: string;
  category: string;
  conditions: Array<{
    field: string;
    operator: string;
    value: number | string | [number, number] | string[];
  }>;
  logic: 'and' | 'or';
  sort_by: string;
  sort_order: 'asc' | 'desc';
  secondary_sort?: { field: string; order: string };
  is_system: boolean;
  usage_count: number;
  last_used_at?: string;
  created_at: string;
}

// 分类配置
const CATEGORIES = [
  { id: 'all', name: '全部', icon: <FilterOutlined /> },
  { id: 'value', name: '价值投资', icon: <FundOutlined />, color: '#22c55e' },
  { id: 'growth', name: '成长股', icon: <RocketOutlined />, color: '#3b82f6' },
  { id: 'momentum', name: '动量策略', icon: <LineChartOutlined />, color: '#f59e0b' },
  { id: 'technical', name: '技术形态', icon: <ThunderboltOutlined />, color: '#8b5cf6' },
  { id: 'income', name: '高股息', icon: <RiseOutlined />, color: '#ef4444' },
  { id: 'custom', name: '自定义', icon: <StarOutlined />, color: '#6366f1' },
];

// 可筛选字段
const FILTER_FIELDS = [
  { value: 'price', label: '最新价' },
  { value: 'change_percent', label: '涨跌幅' },
  { value: 'volume', label: '成交量' },
  { value: 'turnover', label: '成交额' },
  { value: 'turnover_rate', label: '换手率' },
  { value: 'amplitude', label: '振幅' },
  { value: 'pe_ratio', label: '市盈率' },
  { value: 'pb_ratio', label: '市净率' },
  { value: 'ps_ratio', label: '市销率' },
  { value: 'roe', label: 'ROE' },
  { value: 'roa', label: 'ROA' },
  { value: 'market_cap', label: '总市值' },
  { value: 'circulating_market_cap', label: '流通市值' },
  { value: 'dividend_yield', label: '股息率' },
  { value: 'eps', label: '每股收益' },
  { value: 'debt_to_equity', label: '负债率' },
  { value: 'revenue_growth', label: '营收增长' },
  { value: 'profit_growth', label: '利润增长' },
];

// 运算符
const OPERATORS = [
  { value: 'gt', label: '大于', symbol: '>' },
  { value: 'gte', label: '大于等于', symbol: '≥' },
  { value: 'lt', label: '小于', symbol: '<' },
  { value: 'lte', label: '小于等于', symbol: '≤' },
  { value: 'eq', label: '等于', symbol: '=' },
  { value: 'neq', label: '不等于', symbol: '≠' },
  { value: 'between', label: '介于', symbol: '~' },
];

const StrategyTemplatesPage: React.FC = () => {
  const navigate = useNavigate();
  
  // 状态
  const [templates, setTemplates] = useState<StrategyTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState('all');
  const [modalVisible, setModalVisible] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<StrategyTemplate | null>(null);
  const [form] = Form.useForm();
  
  // AI推荐状态
  const [aiModalVisible, setAiModalVisible] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiRecommendations, setAiRecommendations] = useState<any[]>([]);
  const [aiPreferences, setAiPreferences] = useState({
    risk_level: 'moderate',
    investment_horizon: 'medium',
    focus: 'balanced',
    capital_size: 'medium'
  });

  // 获取模板列表
  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await apiFetch('/api/strategy-templates');
      const data = await resp.json();
      if (data.success) {
        setTemplates(data.data.templates || []);
      }
    } catch (e) {
      console.error('获取策略模板失败:', e);
      message.error('获取策略模板失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  // 获取AI策略推荐
  const fetchAiRecommendations = async () => {
    setAiLoading(true);
    setAiRecommendations([]);
    try {
      const resp = await apiFetch('/api/ai/strategy-recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(aiPreferences)
      });
      
      // 处理流式响应
      const reader = resp.body?.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';
      
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value);
          const lines = chunk.split('\n').filter(line => line.startsWith('data: '));
          
          for (const line of lines) {
            try {
              const data = JSON.parse(line.slice(6));
              fullContent += data.content;
            } catch (e) {
              // ignore parse error
            }
          }
        }
        
        // 解析JSON响应
        try {
          const jsonMatch = fullContent.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed.strategies) {
              setAiRecommendations(parsed.strategies);
            }
          }
        } catch (e) {
          console.warn('解析AI响应失败:', e);
          // 如果解析失败，显示原始文本
          setAiRecommendations([{
            name: 'AI分析结果',
            description: fullContent.slice(0, 500),
            logic: '详见描述',
            conditions: [],
            risk_warning: '请仔细评估'
          }]);
        }
      }
    } catch (e) {
      console.error('获取AI推荐失败:', e);
      message.error('AI推荐暂时不可用');
    } finally {
      setAiLoading(false);
    }
  };

  // 按分类过滤
  const filteredTemplates = activeCategory === 'all' 
    ? templates 
    : templates.filter(t => t.category === activeCategory);

  // 打开创建/编辑弹窗
  const openModal = (template?: StrategyTemplate) => {
    if (template) {
      setEditingTemplate(template);
      form.setFieldsValue({
        name: template.name,
        name_en: template.name_en,
        description: template.description,
        icon: template.icon,
        category: template.category,
        conditions: template.conditions,
        logic: template.logic,
        sort_by: template.sort_by,
        sort_order: template.sort_order,
      });
    } else {
      setEditingTemplate(null);
      form.resetFields();
      form.setFieldsValue({
        category: 'custom',
        logic: 'and',
        sort_by: 'change_percent',
        sort_order: 'desc',
        conditions: [{ field: 'change_percent', operator: 'gt', value: 0 }],
      });
    }
    setModalVisible(true);
  };

  // 保存模板
  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      
      // 验证条件
      if (!values.conditions || values.conditions.length === 0) {
        message.error('请至少添加一个筛选条件');
        return;
      }

      const payload = {
        ...values,
        conditions: values.conditions.map((c: any) => ({
          field: c.field,
          operator: c.operator,
          value: c.operator === 'between' ? [c.value_min, c.value_max] : c.value
        }))
      };

      const url = editingTemplate 
        ? `/api/strategy-templates/${editingTemplate.id}`
        : '/api/strategy-templates';
      
      const resp = await apiFetch(url, {
        method: editingTemplate ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await resp.json();
      if (data.success) {
        message.success(editingTemplate ? '策略更新成功' : '策略创建成功');
        setModalVisible(false);
        fetchTemplates();
      } else {
        message.error(data.error || '保存失败');
      }
    } catch (e) {
      console.error('保存策略失败:', e);
    }
  };

  // 删除模板
  const handleDelete = async (id: number) => {
    try {
      const resp = await apiFetch(`/api/strategy-templates/${id}`, {
        method: 'DELETE'
      });
      const data = await resp.json();
      if (data.success) {
        message.success('策略删除成功');
        fetchTemplates();
      } else {
        message.error(data.error || '删除失败');
      }
    } catch (e) {
      console.error('删除策略失败:', e);
    }
  };

  // 复制模板
  const handleClone = async (id: number) => {
    try {
      const resp = await apiFetch(`/api/strategy-templates/${id}/clone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const data = await resp.json();
      if (data.success) {
        message.success('策略复制成功');
        fetchTemplates();
      }
    } catch (e) {
      console.error('复制策略失败:', e);
    }
  };

  // 使用策略（跳转到筛选页）
  const handleUseTemplate = async (template: StrategyTemplate) => {
    // 记录使用次数
    await apiFetch(`/api/strategy-templates/${template.id}/use`, { method: 'POST' });
    
    // 跳转到筛选页
    navigate(`/screener?template=${template.id}`);
  };

  // 获取分类图标
  const _getCategoryIcon = (category: string) => {
    const cat = CATEGORIES.find(c => c.id === category);
    return cat?.icon || <StarOutlined />;
  };

  // 获取分类颜色
  const getCategoryColor = (category: string) => {
    const cat = CATEGORIES.find(c => c.id === category);
    return cat?.color || '#6366f1';
  };

  return (
    <div style={{ background: BG, minHeight: '100vh', padding: '24px' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        
        {/* 页面标题 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <Title level={3} style={{ color: TEXT, marginBottom: 8 }}>
              <RocketOutlined style={{ marginRight: 8 }} />
              策略模板
            </Title>
            <Text style={{ color: TEXT_SEC }}>
              浏览系统预设策略、AI智能推荐或创建自定义筛选策略
            </Text>
          </div>
          <Space>
            <Button 
              icon={<RobotOutlined />}
              onClick={() => setAiModalVisible(true)}
              style={{ borderColor: '#8b5cf6', color: '#8b5cf6' }}
            >
              AI推荐
            </Button>
            <Button 
              type="primary" 
              icon={<PlusOutlined />}
              onClick={() => openModal()}
            >
              创建策略
            </Button>
          </Space>
        </div>

        {/* 分类标签 */}
        <div style={{ marginBottom: 24, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {CATEGORIES.map(cat => (
            <Tag
              key={cat.id}
              icon={cat.icon}
              color={activeCategory === cat.id ? (cat.color || ACCENT) : undefined}
              style={{ 
                cursor: 'pointer', 
                padding: '6px 12px',
                border: activeCategory === cat.id ? undefined : `1px solid ${BORDER}`,
                background: activeCategory === cat.id ? undefined : CARD_BG
              }}
              onClick={() => setActiveCategory(cat.id)}
            >
              {cat.name}
            </Tag>
          ))}
        </div>

        {/* 模板列表 */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <Spin size="large" />
          </div>
        ) : filteredTemplates.length === 0 ? (
          <Card style={{ background: CARD_BG, border: `1px solid ${BORDER}` }}>
            <Empty description="暂无策略模板" />
          </Card>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: 16 }}>
            {filteredTemplates.map(template => (
              <Card
                key={template.id}
                style={{ 
                  background: CARD_BG, 
                  border: `1px solid ${BORDER}`,
                  borderRadius: 12
                }}
                bodyStyle={{ padding: 20 }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 28 }}>{template.icon}</span>
                    <div>
                      <div style={{ color: TEXT, fontWeight: 600, fontSize: 16 }}>{template.name}</div>
                      {template.name_en && (
                        <div style={{ color: TEXT_SEC, fontSize: 12 }}>{template.name_en}</div>
                      )}
                    </div>
                  </div>
                  <Tag 
                    color={getCategoryColor(template.category)}
                    style={{ margin: 0 }}
                  >
                    {CATEGORIES.find(c => c.id === template.category)?.name || template.category}
                  </Tag>
                </div>

                <Paragraph 
                  style={{ color: TEXT_SEC, fontSize: 13, marginBottom: 16 }}
                  ellipsis={{ rows: 2 }}
                >
                  {template.description || '暂无描述'}
                </Paragraph>

                {/* 条件预览 */}
                <div style={{ marginBottom: 16 }}>
                  <Text style={{ color: TEXT_SEC, fontSize: 12 }}>筛选条件：</Text>
                  <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {template.conditions.slice(0, 3).map((cond, idx) => (
                      <Tag key={idx} style={{ fontSize: 11 }}>
                        {FILTER_FIELDS.find(f => f.value === cond.field)?.label || cond.field}
                        {OPERATORS.find(o => o.value === cond.operator)?.symbol || cond.operator}
                        {Array.isArray(cond.value) ? cond.value.join('~') : cond.value}
                      </Tag>
                    ))}
                    {template.conditions.length > 3 && (
                      <Tag style={{ fontSize: 11 }}>+{template.conditions.length - 3}</Tag>
                    )}
                  </div>
                </div>

                {/* 统计和操作 */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Space>
                    <Text style={{ color: TEXT_SEC, fontSize: 12 }}>
                      使用 {template.usage_count} 次
                    </Text>
                    {template.is_system && (
                      <Tag color="gold" style={{ fontSize: 11 }}>系统</Tag>
                    )}
                  </Space>
                  
                  <Space>
                    <Tooltip title="使用此策略">
                      <Button 
                        type="primary" 
                        size="small" 
                        icon={<PlayCircleOutlined />}
                        onClick={() => handleUseTemplate(template)}
                      />
                    </Tooltip>
                    
                    {!template.is_system && (
                      <>
                        <Tooltip title="编辑">
                          <Button 
                            size="small" 
                            icon={<EditOutlined />}
                            onClick={() => openModal(template)}
                          />
                        </Tooltip>
                        <Popconfirm
                          title="确定删除此策略？"
                          onConfirm={() => handleDelete(template.id)}
                        >
                          <Tooltip title="删除">
                            <Button 
                              size="small" 
                              danger 
                              icon={<DeleteOutlined />}
                            />
                          </Tooltip>
                        </Popconfirm>
                      </>
                    )}
                    
                    <Tooltip title="复制为自定义策略">
                      <Button 
                        size="small" 
                        icon={<CopyOutlined />}
                        onClick={() => handleClone(template.id)}
                      />
                    </Tooltip>
                  </Space>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* 创建/编辑弹窗 */}
        <Modal
          title={editingTemplate ? '编辑策略' : '创建策略'}
          open={modalVisible}
          onOk={handleSave}
          onCancel={() => setModalVisible(false)}
          width={600}
          okText="保存"
          cancelText="取消"
        >
          <Form form={form} layout="vertical">
            <Form.Item name="name" label="策略名称" rules={[{ required: true, message: '请输入策略名称' }]}>
              <Input placeholder="例如：低估值成长股" />
            </Form.Item>
            
            <Form.Item name="name_en" label="英文名称">
              <Input placeholder="例如：Value Growth Stocks" />
            </Form.Item>
            
            <Form.Item name="description" label="策略描述">
              <TextArea rows={2} placeholder="描述策略的核心逻辑..." />
            </Form.Item>
            
            <Space style={{ width: '100%' }}>
              <Form.Item name="icon" label="图标" style={{ width: 100 }}>
                <Input placeholder="📊" />
              </Form.Item>
              
              <Form.Item name="category" label="分类" style={{ width: 200 }}>
                <Select>
                  {CATEGORIES.filter(c => c.id !== 'all').map(cat => (
                    <Option key={cat.id} value={cat.id}>{cat.name}</Option>
                  ))}
                </Select>
              </Form.Item>
              
              <Form.Item name="logic" label="条件逻辑" style={{ width: 150 }}>
                <Select>
                  <Option value="and">全部满足 (AND)</Option>
                  <Option value="or">任一满足 (OR)</Option>
                </Select>
              </Form.Item>
            </Space>

            <Divider>筛选条件</Divider>
            
            <Form.List name="conditions">
              {(fields, { add, remove }) => (
                <>
                  {fields.map(({ key, name, ...restField }) => (
                    <Space key={key} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                      <Form.Item
                        {...restField}
                        name={[name, 'field']}
                        rules={[{ required: true, message: '选择字段' }]}
                      >
                        <Select style={{ width: 130 }} placeholder="字段">
                          {FILTER_FIELDS.map(f => (
                            <Option key={f.value} value={f.value}>{f.label}</Option>
                          ))}
                        </Select>
                      </Form.Item>
                      
                      <Form.Item
                        {...restField}
                        name={[name, 'operator']}
                        rules={[{ required: true, message: '选择运算符' }]}
                      >
                        <Select style={{ width: 120 }} placeholder="运算符">
                          {OPERATORS.map(op => (
                            <Option key={op.value} value={op.value}>{op.label} ({op.symbol})</Option>
                          ))}
                        </Select>
                      </Form.Item>
                      
                      <Form.Item
                        {...restField}
                        name={[name, 'value']}
                        rules={[{ required: true, message: '输入值' }]}
                      >
                        <InputNumber style={{ width: 120 }} placeholder="值" />
                      </Form.Item>
                      
                      <Button type="link" danger onClick={() => remove(name)}>
                        删除
                      </Button>
                    </Space>
                  ))}
                  
                  <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                    添加条件
                  </Button>
                </>
              )}
            </Form.List>

            <Divider>排序设置</Divider>
            
            <Space>
              <Form.Item name="sort_by" label="排序字段">
                <Select style={{ width: 130 }}>
                  {FILTER_FIELDS.map(f => (
                    <Option key={f.value} value={f.value}>{f.label}</Option>
                  ))}
                </Select>
              </Form.Item>
              
              <Form.Item name="sort_order" label="排序方式">
                <Select style={{ width: 100 }}>
                  <Option value="desc">降序</Option>
                  <Option value="asc">升序</Option>
                </Select>
              </Form.Item>
            </Space>
          </Form>
        </Modal>

        {/* AI策略推荐弹窗 */}
        <Modal
          title={
            <span>
              <RobotOutlined style={{ marginRight: 8, color: '#8b5cf6' }} />
              AI策略推荐
            </span>
          }
          open={aiModalVisible}
          onCancel={() => setAiModalVisible(false)}
          width={700}
          footer={[
            <Button key="cancel" onClick={() => setAiModalVisible(false)}>
              关闭
            </Button>,
            <Button 
              key="recommend" 
              type="primary" 
              icon={<BulbOutlined />}
              loading={aiLoading}
              onClick={fetchAiRecommendations}
              style={{ background: '#8b5cf6' }}
            >
              获取推荐
            </Button>
          ]}
        >
          <div style={{ marginBottom: 16 }}>
            <Text style={{ color: TEXT_SEC }}>
              根据您的投资偏好，AI将为您推荐合适的策略
            </Text>
          </div>

          {/* 偏好设置 */}
          <Card size="small" style={{ background: BG, marginBottom: 16 }}>
            <Space direction="vertical" style={{ width: '100%' }}>
              <div style={{ display: 'flex', gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <Text style={{ color: TEXT_SEC, fontSize: 12 }}>风险偏好</Text>
                  <Select 
                    value={aiPreferences.risk_level}
                    onChange={(v) => setAiPreferences(p => ({...p, risk_level: v}))}
                    style={{ width: '100%', marginTop: 4 }}
                  >
                    <Option value="conservative">保守型</Option>
                    <Option value="moderate">稳健型</Option>
                    <Option value="aggressive">激进型</Option>
                  </Select>
                </div>
                <div style={{ flex: 1 }}>
                  <Text style={{ color: TEXT_SEC, fontSize: 12 }}>投资周期</Text>
                  <Select 
                    value={aiPreferences.investment_horizon}
                    onChange={(v) => setAiPreferences(p => ({...p, investment_horizon: v}))}
                    style={{ width: '100%', marginTop: 4 }}
                  >
                    <Option value="short">短期(1-4周)</Option>
                    <Option value="medium">中期(1-3月)</Option>
                    <Option value="long">长期(3月+)</Option>
                  </Select>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <Text style={{ color: TEXT_SEC, fontSize: 12 }}>投资风格</Text>
                  <Select 
                    value={aiPreferences.focus}
                    onChange={(v) => setAiPreferences(p => ({...p, focus: v}))}
                    style={{ width: '100%', marginTop: 4 }}
                  >
                    <Option value="value">价值投资</Option>
                    <Option value="growth">成长投资</Option>
                    <Option value="momentum">动量策略</Option>
                    <Option value="dividend">高股息</Option>
                    <Option value="balanced">均衡配置</Option>
                  </Select>
                </div>
                <div style={{ flex: 1 }}>
                  <Text style={{ color: TEXT_SEC, fontSize: 12 }}>资金规模</Text>
                  <Select 
                    value={aiPreferences.capital_size}
                    onChange={(v) => setAiPreferences(p => ({...p, capital_size: v}))}
                    style={{ width: '100%', marginTop: 4 }}
                  >
                    <Option value="small">小型(&lt;10万)</Option>
                    <Option value="medium">中型(10-100万)</Option>
                    <Option value="large">大型(&gt;100万)</Option>
                  </Select>
                </div>
              </div>
            </Space>
          </Card>

          {/* AI推荐结果 */}
          {aiLoading ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <Spin size="large" />
              <div style={{ color: TEXT_SEC, marginTop: 16 }}>AI正在分析市场数据...</div>
            </div>
          ) : aiRecommendations.length > 0 ? (
            <div>
              {aiRecommendations.map((rec, idx) => (
                <Card 
                  key={idx}
                  size="small" 
                  style={{ background: BG, marginBottom: 12, border: '1px solid #8b5cf6' }}
                >
                  <div style={{ fontWeight: 600, color: TEXT, marginBottom: 8 }}>
                    {rec.name || `策略 ${idx + 1}`}
                  </div>
                  <div style={{ color: TEXT_SEC, fontSize: 13, marginBottom: 8 }}>
                    {rec.description}
                  </div>
                  {rec.logic && (
                    <div style={{ marginBottom: 8 }}>
                      <Text style={{ color: '#8b5cf6', fontSize: 12 }}>核心逻辑：</Text>
                      <div style={{ color: TEXT_SEC, fontSize: 12 }}>{rec.logic}</div>
                    </div>
                  )}
                  {rec.conditions && rec.conditions.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <Text style={{ color: '#8b5cf6', fontSize: 12 }}>筛选条件：</Text>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                        {rec.conditions.map((c: any, i: number) => (
                          <Tag key={i} style={{ fontSize: 11 }}>
                            {FILTER_FIELDS.find(f => f.value === c.field)?.label || c.field}
                            {OPERATORS.find(o => o.value === c.operator)?.symbol || c.operator}
                            {Array.isArray(c.value) ? c.value.join('~') : c.value}
                          </Tag>
                        ))}
                      </div>
                    </div>
                  )}
                  {rec.risk_warning && (
                    <div style={{ 
                      background: '#451a03', 
                      padding: '6px 10px', 
                      borderRadius: 4,
                      fontSize: 12,
                      color: '#fbbf24'
                    }}>
                      ⚠️ {rec.risk_warning}
                    </div>
                  )}
                </Card>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: 40, color: TEXT_SEC }}>
              <BulbOutlined style={{ fontSize: 40, marginBottom: 16 }} />
              <div>点击"获取推荐"按钮，AI将为您分析并推荐策略</div>
            </div>
          )}
        </Modal>
      </div>
    </div>
  );
};

export default StrategyTemplatesPage;
