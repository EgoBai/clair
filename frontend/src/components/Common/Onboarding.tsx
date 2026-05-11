/**
 * 首次访问引导教程
 * 交互式引导用户了解主要功能
 * 参考 Notion 的新用户引导
 */

import React, { useState, useEffect } from 'react';
import { Modal, Button, Typography, Steps, Space, Tag } from 'antd';
import {
  StockOutlined, BellOutlined, FilterOutlined, BarChartOutlined,
  SearchOutlined, StarOutlined, RightOutlined, LeftOutlined,
  CheckOutlined,
} from '@ant-design/icons';

const { Title, Text, Paragraph } = Typography;
const { Step } = Steps;

interface TourStep {
  title: string;
  icon: React.ReactNode;
  description: string;
  features: string[];
}

const TOUR_STEPS: TourStep[] = [
  {
    title: '实时行情',
    icon: <StockOutlined style={{ fontSize: 32, color: '#1890ff' }} />,
    description: '查看A股实时行情，支持分时图、K线图、技术指标分析',
    features: ['实时行情推送', '多周期K线图', 'MACD/KDJ/RSI/BOLL指标', '资金流向分析'],
  },
  {
    title: '股票搜索',
    icon: <SearchOutlined style={{ fontSize: 32, color: '#52c41a' }} />,
    description: '快速搜索股票，支持代码、名称、拼音首字母',
    features: ['8级智能匹配', '拼音首字母搜索', '搜索历史', '⌘K 快捷键'],
  },
  {
    title: '自选股',
    icon: <StarOutlined style={{ fontSize: 32, color: '#faad14' }} />,
    description: '收藏关注的股票，分组管理，实时跟踪',
    features: ['自定义分组', '拖拽排序', '实时行情显示', '一键跳转详情'],
  },
  {
    title: '行情预警',
    icon: <BellOutlined style={{ fontSize: 32, color: '#f5222d' }} />,
    description: '设置价格、涨跌幅、成交量预警，第一时间获取异动通知',
    features: ['价格突破/跌破预警', '涨跌幅预警', '成交量异动', '触发历史记录'],
  },
  {
    title: '选股器',
    icon: <FilterOutlined style={{ fontSize: 32, color: '#722ed1' }} />,
    description: '多条件组合筛选，预设策略模板，快速找到目标标的',
    features: ['多条件组合筛选', '预设模板（价值/成长/活跃）', '自定义模板保存', '结果排序分页'],
  },
  {
    title: '数据可视化',
    icon: <BarChartOutlined style={{ fontSize: 32, color: '#13c2c2' }} />,
    description: '行业热力图、市场情绪仪表盘、多股对比图',
    features: ['行业板块热力图', '市场情绪分数', '多股叠加对比', '暗色主题支持'],
  },
];

const STORAGE_KEY = 'a-stock-onboarding-completed';

export function shouldShowOnboarding(): boolean {
  try {
    return !localStorage.getItem(STORAGE_KEY);
  } catch {
    return false;
  }
}

const Onboarding: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    if (shouldShowOnboarding()) {
      // 延迟显示，等待页面加载
      const timer = setTimeout(() => setVisible(true), 1000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, []);

  const handleComplete = () => {
    try {
      localStorage.setItem(STORAGE_KEY, 'true');
      localStorage.setItem('a-stock-onboarding-skipped', String(Date.now()));
    } catch {
      console.warn('Onboarding: failed to save completion state');
    }
    setVisible(false);
  };

  const handleSkip = () => {
    handleComplete();
  };

  const step = TOUR_STEPS[currentStep];

  return (
    <Modal
      open={visible}
      onCancel={handleSkip}
      footer={null}
      width={480}
      closable={false}
      maskClosable={false}
      centered
      bodyStyle={{ padding: 0 }}
    >
      {/* 进度指示 */}
      <div style={{
        padding: '16px 24px 0',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {currentStep + 1} / {TOUR_STEPS.length}
        </Text>
        <Button type="text" size="small" onClick={handleSkip}>
          跳过
        </Button>
      </div>

      {/* 内容区 */}
      <div style={{ padding: '24px 32px 32px', textAlign: 'center' }}>
        {/* 图标 */}
        <div style={{ marginBottom: 16 }}>{step.icon}</div>

        {/* 标题 */}
        <Title level={4} style={{ marginBottom: 8 }}>
          {step.title}
        </Title>

        {/* 描述 */}
        <Paragraph type="secondary" style={{ marginBottom: 20 }}>
          {step.description}
        </Paragraph>

        {/* 功能列表 */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          justifyContent: 'center',
          marginBottom: 24,
        }}>
          {step.features.map((feature, i) => (
            <Tag key={i} color="blue">{feature}</Tag>
          ))}
        </div>

        {/* 步骤点 */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          gap: 8,
          marginBottom: 24,
        }}>
          {TOUR_STEPS.map((_, i) => (
            <div
              key={i}
              onClick={() => setCurrentStep(i)}
              style={{
                width: i === currentStep ? 24 : 8,
                height: 8,
                borderRadius: 4,
                background: i === currentStep ? '#1890ff' : '#e8e8e8',
                cursor: 'pointer',
                transition: 'all 0.3s',
              }}
            />
          ))}
        </div>

        {/* 操作按钮 */}
        <Space>
          {currentStep > 0 && (
            <Button
              icon={<LeftOutlined />}
              onClick={() => setCurrentStep(currentStep - 1)}
            >
              上一步
            </Button>
          )}
          {currentStep < TOUR_STEPS.length - 1 ? (
            <Button
              type="primary"
              onClick={() => setCurrentStep(currentStep + 1)}
            >
              下一步 <RightOutlined />
            </Button>
          ) : (
            <Button
              type="primary"
              icon={<CheckOutlined />}
              onClick={handleComplete}
            >
              开始使用
            </Button>
          )}
        </Space>
      </div>
    </Modal>
  );
};

export default React.memo(Onboarding);

// 重置引导（在设置中可调用）
export function resetOnboarding() {
  localStorage.removeItem(STORAGE_KEY);
}
