/**
 * 估值分析面板 (Ticket S2-1)
 *
 * 数据来源：后端估值 API 缺失（T6 技术债）。
 * 遵循「诚实数据红线」：后端估值接口就绪前，绝不编造 PE/PB/PEG/DCF/历史分位
 * 等任何估值数值（此前曾用 LCG 确定性 RNG 伪造整套估值，已于 2026-08-13 根除）。
 * 当前以诚实空态呈现；待后端估值 API 接入后，再以下方真实输入驱动
 * multiDimensionalValuation / dcfValuation / valuationPercentileAnalysis 引擎。
 */

import React from 'react';
import { Card, Typography, Tag, Empty } from 'antd';
import { FundOutlined } from '@ant-design/icons';
import { THEME } from '../../styles/theme-constants';

const { Text } = Typography;
const TEXT_PRIMARY = THEME.text;
const TEXT_SECONDARY = THEME.textSec;
const BORDER = THEME.border;
const ACCENT = '#2962FF';

const ValuationPanel: React.FC<{ symbol: string }> = ({ symbol }) => {
  // TODO(backend): 接入 /api/valuation（或复用 financials + quote 推导 PE/PB/EPS），
  // 再以真实输入驱动 valuationModelEngine / valuationModel / sectorValuationEngine，
  // 替换下方诚实空态。symbol 已透传，便于后端按标的拉取真实估值。
  return (
    <Card
      size="small"
      title={
        <span style={{ fontWeight: 700, color: TEXT_PRIMARY, fontSize: 14 }}>
          <FundOutlined style={{ color: ACCENT, marginRight: 6 }} />
          估值分析
          <Tag
            color="default"
            style={{ fontSize: 10, borderRadius: 4, borderColor: BORDER, color: TEXT_SECONDARY, marginLeft: 8 }}
          >
            数据未接入
          </Tag>
        </span>
      }
      style={{ marginBottom: 12, borderRadius: 8, border: `1px solid ${BORDER}` }}
    >
      <Empty
        description="估值数据由后端实时接口提供（PE/PB/PEG/DCF/历史分位），当前后端未接入，暂无可展示数据"
        style={{ padding: '24px 0' }}
      />
    </Card>
  );
};

export default ValuationPanel;
