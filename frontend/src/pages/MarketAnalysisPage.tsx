import React from 'react';
import { Typography, Breadcrumb, Row, Col, Card, Tabs } from 'antd';
import { HomeOutlined, LineChartOutlined } from '@ant-design/icons';
import MarketOverview from '../components/Market/MarketOverview';
import MarketSentiment from '../components/Market/MarketSentiment';
import MarketBreadthPanel from '../components/Market/MarketBreadthPanel';
import SectorHeatmap from '../components/Market/SectorHeatmap';
import CapitalFlowPanel from '../components/Market/CapitalFlowPanel';

const { Title } = Typography;

const MarketAnalysisPage: React.FC = () => {
  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      <Breadcrumb
        style={{ marginBottom: 16 }}
        items={[
          { href: '/', title: <><HomeOutlined /> 首页</> },
          { title: <><LineChartOutlined /> 市场分析</> },
        ]}
      />
      <Title level={3} style={{ marginBottom: 24 }}>
        <LineChartOutlined style={{ marginRight: 8 }} />
        市场分析
      </Title>

      <Row gutter={[16, 16]}>
        {/* 市场概览 */}
        <Col span={24}>
          <MarketOverview />
        </Col>

        {/* 市场情绪 + 市场宽度 */}
        <Col xs={24} lg={12}>
          <MarketSentiment
            riseCount={0}
            fallCount={0}
            flatCount={0}
            limitUp={0}
            limitDown={0}
            totalTurnover={0}
            avgChangePercent={0}
          />
        </Col>
        <Col xs={24} lg={12}>
          <MarketBreadthPanel />
        </Col>

        {/* 行业热力图 + 资金流向 */}
        <Col xs={24} lg={12}>
          <SectorHeatmap />
        </Col>
        <Col xs={24} lg={12}>
          <CapitalFlowPanel />
        </Col>
      </Row>
    </div>
  );
};

export default MarketAnalysisPage;
