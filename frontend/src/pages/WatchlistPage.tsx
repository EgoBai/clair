import React, { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Typography, Breadcrumb } from 'antd';
import { HomeOutlined, StarOutlined } from '@ant-design/icons';
import WatchlistPanel from '../components/Stock/WatchlistPanel';

const { Title } = Typography;

const WatchlistPage: React.FC = () => {
  const navigate = useNavigate();

  const handleStockClick = useCallback((symbol: string) => {
    navigate(`/stocks/${symbol}`);
  }, [navigate]);

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <Breadcrumb
        style={{ marginBottom: 16 }}
        items={[
          { href: '/', title: <><HomeOutlined /> 首页</> },
          { title: <><StarOutlined /> 自选股</> },
        ]}
      />
      <Title level={3} style={{ marginBottom: 24 }}>
        <StarOutlined style={{ color: '#f59e0b', marginRight: 8 }} />
        我的自选股
      </Title>
      <WatchlistPanel onStockClick={handleStockClick} />
    </div>
  );
};

export default WatchlistPage;
