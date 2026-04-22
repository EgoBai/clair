import React from 'react';
import { Typography, Breadcrumb } from 'antd';
import { HomeOutlined, DashboardOutlined } from '@ant-design/icons';
import PerformanceDashboard from '../components/PerformanceDashboard';

const { Title } = Typography;

const PerformanceDashboardPage: React.FC = () => {
  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      <Breadcrumb
        style={{ marginBottom: 16 }}
        items={[
          { href: '/', title: <><HomeOutlined /> 首页</> },
          { title: <><DashboardOutlined /> 性能监控</> },
        ]}
      />
      <Title level={3} style={{ marginBottom: 24 }}>
        <DashboardOutlined style={{ marginRight: 8 }} />
        性能监控仪表板
      </Title>
      <PerformanceDashboard autoRefresh refreshInterval={5000} />
    </div>
  );
};

export default PerformanceDashboardPage;
