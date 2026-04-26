/**
 * 导出按钮组件
 * 一键导出表格数据为 CSV/PDF/图片
 */

import React, { useState } from 'react';
import { Button, Dropdown, message } from 'antd';
import { DownloadOutlined, FileExcelOutlined, FilePdfOutlined, FileImageOutlined } from '@ant-design/icons';
import { exportToCSV, exportToJSON, exportToPrint, STOCK_EXPORT_COLUMNS } from '../../utils/dataExport';

interface ExportButtonProps {
  data: Record<string, any>[];
  filename?: string;
  columns?: { key: string; label: string; format?: (v: any) => string }[];
  showImage?: boolean;
  onImageExport?: () => void;
}

const ExportButton: React.FC<ExportButtonProps> = ({
  data,
  filename = 'export',
  columns = STOCK_EXPORT_COLUMNS,
  showImage = false,
  onImageExport,
}) => {
  const [exporting, setExporting] = useState(false);

  const handleExport = async (type: string) => {
    if (!data.length) {
      message.warning('暂无数据可导出');
      return;
    }

    setExporting(true);
    try {
      switch (type) {
        case 'csv':
          exportToCSV(data, { filename, columns });
          message.success('CSV 导出成功');
          break;
        case 'json':
          exportToJSON(data, { filename });
          message.success('JSON 导出成功');
          break;
        case 'print':
          exportToPrint(data, { filename, columns });
          break;
        case 'image':
          onImageExport?.();
          break;
      }
    } catch (err) {
      message.error('导出失败');
    } finally {
      setExporting(false);
    }
  };

  const items = [
    {
      key: 'csv',
      icon: <FileExcelOutlined />,
      label: '导出 CSV',
      onClick: () => handleExport('csv'),
    },
    {
      key: 'print',
      icon: <FilePdfOutlined />,
      label: '打印 / PDF',
      onClick: () => handleExport('print'),
    },
  ];

  if (showImage) {
    items.push({
      key: 'image',
      icon: <FileImageOutlined />,
      label: '导出图片',
      onClick: () => handleExport('image'),
    });
  }

  return (
    <Dropdown menu={{ items }} placement="bottomRight">
      <Button
        icon={<DownloadOutlined />}
        loading={exporting}
        size="small"
      >
        导出
      </Button>
    </Dropdown>
  );
};

export default React.memo(ExportButton);
