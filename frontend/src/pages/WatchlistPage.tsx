/**
 * 自选股页面
 * 完整的自选股管理：分组、排序、实时行情
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Row, Col, Typography } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import WatchlistPanel from '../components/Stock/WatchlistPanel';

const { Title } = Typography;

const WatchlistPage: React.FC = () => {
  const navigate = useNavigate();

  const handleStockClick = (symbol: string) => {
    navigate(`/stock/${symbol}`);
  };

  return (
    <div className="watchlist-page" style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16, gap: 12 }}>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/')}>
          返回
        </Button>
        <Title level={4} style={{ margin: 0 }}>自选股</Title>
        <Typography.Text type="secondary">管理你的关注股票列表</Typography.Text>
      </div>
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={16}>
          <WatchlistPanel onStockClick={handleStockClick} />
        </Col>
        <Col xs={24} lg={8}>
          {/* 预留：自选股行情摘要/统计 */}
        </Col>
      </Row>
    </div>
  );
};

export default WatchlistPage;
