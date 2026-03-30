/**
 * 自定义仪表盘页面
 * 拖拽布局、多窗口联动、数据导出
 */

import React, { useState, useCallback } from 'react';
import { Card, Button, Dropdown, message, Space, Modal } from 'antd';
import {
  DownloadOutlined, FullscreenOutlined, SettingOutlined,
  FileExcelOutlined, FileTextOutlined, CodeOutlined,
} from '@ant-design/icons';
import CustomDashboard from '../components/Dashboard/CustomDashboard';
import {
  exportToCSV, exportToJSON, exportToText,
  STOCK_EXPORT_COLUMNS, KLINE_EXPORT_COLUMNS,
} from '../utils/dataExport';

const DashboardPage: React.FC = () => {
  const [showExportModal, setShowExportModal] = useState(false);

  // 数据导出
  const handleExport = useCallback((format: 'csv' | 'json' | 'text') => {
    // 模拟导出数据
    const mockData = [
      { symbol: '600519.SH', name: '贵州茅台', price: 1920.00, changePercent: 1.89, volume: 2500000, industry: '白酒' },
      { symbol: '000858.SZ', name: '五粮液', price: 158.50, changePercent: -0.32, volume: 1800000, industry: '白酒' },
      { symbol: '300750.SZ', name: '宁德时代', price: 215.30, changePercent: 2.45, volume: 3200000, industry: '新能源' },
      { symbol: '002594.SZ', name: '比亚迪', price: 285.60, changePercent: 1.12, volume: 2100000, industry: '汽车' },
      { symbol: '601318.SH', name: '中国平安', price: 52.30, changePercent: -0.58, volume: 4500000, industry: '保险' },
    ];

    switch (format) {
      case 'csv':
        exportToCSV(mockData, { columns: STOCK_EXPORT_COLUMNS, filename: 'dashboard_stocks' });
        break;
      case 'json':
        exportToJSON(mockData, { filename: 'dashboard_stocks' });
        break;
      case 'text':
        exportToText(mockData, { columns: STOCK_EXPORT_COLUMNS, filename: 'dashboard_stocks' });
        break;
    }

    message.success(`已导出 ${format.toUpperCase()} 格式`);
    setShowExportModal(false);
  }, []);

  const exportMenuItems = [
    {
      key: 'csv',
      icon: <FileExcelOutlined />,
      label: '导出 CSV（Excel兼容）',
      onClick: () => handleExport('csv'),
    },
    {
      key: 'json',
      icon: <CodeOutlined />,
      label: '导出 JSON',
      onClick: () => handleExport('json'),
    },
    {
      key: 'text',
      icon: <FileTextOutlined />,
      label: '导出文本表格',
      onClick: () => handleExport('text'),
    },
  ];

  return (
    <div style={{ padding: '0 4px' }}>
      {/* 工具栏 */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 16,
      }}>
        <h2 style={{ margin: 0, fontSize: 18, color: '#e5e7eb' }}>
          📐 自定义仪表盘
        </h2>
        <Space>
          <Dropdown menu={{ items: exportMenuItems }} placement="bottomRight">
            <Button icon={<DownloadOutlined />}>
              导出数据
            </Button>
          </Dropdown>
        </Space>
      </div>

      {/* 仪表盘组件 */}
      <CustomDashboard />

      {/* 使用说明 */}
      <Card
        size="small"
        style={{
          marginTop: 16,
          background: 'rgba(59,130,246,0.05)',
          border: '1px solid rgba(59,130,246,0.15)',
        }}
      >
        <div style={{ fontSize: 12, color: '#9ca3af', lineHeight: 1.8 }}>
          <strong style={{ color: '#3b82f6' }}>💡 使用提示</strong>
          <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
            <li>点击「编辑布局」进入编辑模式，可拖拽、调整大小、移除组件</li>
            <li>拖拽组件标题栏可交换位置</li>
            <li>点击 ➕/➖ 按钮调整组件大小</li>
            <li>布局自动保存到本地存储</li>
            <li>点击「重置」恢复默认布局</li>
            <li>使用「导出数据」按钮将当前数据导出为 CSV/JSON/文本格式</li>
          </ul>
        </div>
      </Card>
    </div>
  );
};

export default DashboardPage;
