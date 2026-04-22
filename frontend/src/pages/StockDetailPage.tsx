import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Typography, Breadcrumb } from 'antd';
import { HomeOutlined, StockOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import StockDetail from '../components/Stock/StockDetail';

const { Title } = Typography;

const StockDetailPage: React.FC = () => {
  const { symbol } = useParams<{ symbol: string }>();
  const navigate = useNavigate();

  if (!symbol) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <Title level={4}>未指定股票代码</Title>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      <Breadcrumb
        style={{ marginBottom: 16 }}
        items={[
          { href: '/', title: <><HomeOutlined /> 首页</> },
          { href: '/stocks', title: <><StockOutlined /> 股票列表</> },
          { title: symbol },
        ]}
      />
      <StockDetail symbol={symbol} />
    </div>
  );
};

export default StockDetailPage;
