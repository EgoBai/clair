/**
 * Bloomberg Terminal-Style Export Panel
 * 支持多格式导出、模板选择、数据预览、定时导出
 */

import { useState, useCallback, useMemo } from 'react';
import logger from '../../utils/logger';
import {
  Button,
  Dropdown,
  Modal,
  Select,
  Input,
  Switch,
  Space,
  Table,
  Tabs,
  message,
  Divider,
  Typography,
  Tag,
  DatePicker,
  Radio, type MenuProps,
} from 'antd';
import {
  DownloadOutlined,
  FileExcelOutlined,
  FilePdfOutlined,
  FileTextOutlined,
  SettingOutlined,
  ClockCircleOutlined,
  EyeOutlined,
  CopyOutlined,
  FilterOutlined,
  SortAscendingOutlined,
  GroupOutlined,
  CalculatorOutlined,
} from '@ant-design/icons';
import {
  exportData,
  downloadExport,
  ExportFormat,
  ExportColumn,
  ExportOptions,
  ExportResult,
  ReportTemplate,
  generateReport,
  STOCK_LIST_COLUMNS,
  addToHistory,
} from '../../utils/bloombergExportEngine';

const { Text, _Title } = Typography;
const { _RangePicker } = DatePicker;

// ==================== 类型定义 ====================

interface ExportPanelProps {
  data: Record<string, unknown>[];
  columns?: ExportColumn[];
  filename?: string;
  title?: string;
  subtitle?: string;
  templates?: ReportTemplate[];
  onExport?: (result: ExportResult) => void;
  showAdvanced?: boolean;
  showScheduler?: boolean;
}

interface ExportSettings {
  format: ExportFormat;
  includeHeader: boolean;
  includeTimestamp: boolean;
  includeSummary: boolean;
  encoding: 'utf-8' | 'gbk';
  precision: 0 | 1 | 2 | 3 | 4 | 6 | 8;
  sheetName?: string;
}

interface SchedulerSettings {
  enabled: boolean;
  frequency: 'daily' | 'weekly' | 'monthly';
  time: string;
  recipients: string[];
}

// ==================== 组件 ====================

export default function ExportPanel({
  data,
  columns = STOCK_LIST_COLUMNS,
  filename = 'export',
  title,
  subtitle,
  templates = [],
  onExport,
  showAdvanced = true,
  showScheduler = false,
}: ExportPanelProps) {
  // 状态
  const [modalVisible, setModalVisible] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [activeTab, setActiveTab] = useState('format');
  
  // 导出设置
  const [settings, setSettings] = useState<ExportSettings>({
    format: 'csv',
    includeHeader: true,
    includeTimestamp: true,
    includeSummary: false,
    encoding: 'utf-8',
    precision: 2,
  });
  
  // 模板设置
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [customFilename, setCustomFilename] = useState(filename);
  const [customTitle, setCustomTitle] = useState(title || '');
  
  // 调度设置
  const [scheduler, setScheduler] = useState<SchedulerSettings>({
    enabled: false,
    frequency: 'daily',
    time: '09:00',
    recipients: [],
  });

  // 预览数据（前10行）
  const previewData = useMemo(() => data.slice(0, 10), [data]);

  // 当前使用的列定义
  const currentColumns = useMemo(() => {
    if (selectedTemplate) {
      const template = templates.find(t => t.id === selectedTemplate);
      return template?.columns || columns;
    }
    return columns;
  }, [selectedTemplate, templates, columns]);

  // 快速导出
  const handleQuickExport = useCallback(async (format: ExportFormat) => {
    if (!data.length) {
      message.warning('暂无数据可导出');
      return;
    }

    setExporting(true);
    try {
      const options: Partial<ExportOptions> = {
        format,
        columns: currentColumns,
        filename: customFilename,
        title: customTitle || undefined,
        includeHeader: settings.includeHeader,
        includeTimestamp: settings.includeTimestamp,
        includeSummary: settings.includeSummary,
        encoding: settings.encoding,
        precision: settings.precision,
      };

      const result = exportData(data, options);
      downloadExport(result);
      
      // 添加到历史
      addToHistory({
        id: Date.now().toString(),
        filename: result.filename,
        format: result.format,
        rowCount: result.rowCount,
        timestamp: new Date(),
      });

      message.success(`${format.toUpperCase()} 导出成功`);
      onExport?.(result);
    } catch (err) {
      logger.error('Export error:', err);
      message.error('导出失败');
    } finally {
      setExporting(false);
    }
  }, [data, currentColumns, customFilename, customTitle, settings, onExport]);

  // 高级导出
  const handleAdvancedExport = useCallback(async () => {
    if (!data.length) {
      message.warning('暂无数据可导出');
      return;
    }

    setExporting(true);
    try {
      const exportColumns = currentColumns;
      const exportData_ = data;

      // 如果选择了模板，使用模板生成报告
      if (selectedTemplate) {
        const template = templates.find(t => t.id === selectedTemplate);
        if (template) {
          const report = generateReport(data, template, settings.format);
          downloadExport(report.export);
          
          addToHistory({
            id: Date.now().toString(),
            filename: report.export.filename,
            format: report.export.format,
            rowCount: report.export.rowCount,
            timestamp: new Date(),
            templateId: template.id,
          });

          message.success('报告导出成功');
          onExport?.(report.export);
          setModalVisible(false);
          return;
        }
      }

      const options: Partial<ExportOptions> = {
        format: settings.format,
        columns: exportColumns,
        filename: customFilename,
        title: customTitle || undefined,
        subtitle,
        includeHeader: settings.includeHeader,
        includeTimestamp: settings.includeTimestamp,
        includeSummary: settings.includeSummary,
        encoding: settings.encoding,
        precision: settings.precision,
        sheetName: settings.sheetName,
      };

      const result = exportData(exportData_, options);
      downloadExport(result);

      addToHistory({
        id: Date.now().toString(),
        filename: result.filename,
        format: result.format,
        rowCount: result.rowCount,
        timestamp: new Date(),
      });

      message.success('导出成功');
      onExport?.(result);
      setModalVisible(false);
    } catch (err) {
      logger.error('Export error:', err);
      message.error('导出失败');
    } finally {
      setExporting(false);
    }
  }, [data, currentColumns, customFilename, customTitle, subtitle, settings, selectedTemplate, templates, onExport]);

  // 复制到剪贴板
  const handleCopyToClipboard = useCallback(async () => {
    if (!data.length) {
      message.warning('暂无数据可复制');
      return;
    }

    try {
      const result = exportData(data, {
        format: 'csv',
        columns: currentColumns,
        includeHeader: true,
        includeTimestamp: false,
      });
      
      await navigator.clipboard.writeText(result.content as string);
      message.success('已复制到剪贴板');
    } catch (err) {
      message.error('复制失败');
    }
  }, [data, currentColumns]);

  // 快速导出菜单
  const quickExportItems: MenuProps['items'] = [
    {
      key: 'csv',
      icon: <FileTextOutlined />,
      label: '导出 CSV',
      onClick: () => handleQuickExport('csv'),
    },
    {
      key: 'xlsx',
      icon: <FileExcelOutlined />,
      label: '导出 Excel',
      onClick: () => handleQuickExport('xlsx'),
    },
    {
      key: 'json',
      icon: <FileTextOutlined />,
      label: '导出 JSON',
      onClick: () => handleQuickExport('json'),
    },
    {
      key: 'pdf',
      icon: <FilePdfOutlined />,
      label: '导出 PDF/HTML',
      onClick: () => handleQuickExport('pdf'),
    },
    { type: 'divider' },
    {
      key: 'copy',
      icon: <CopyOutlined />,
      label: '复制到剪贴板',
      onClick: handleCopyToClipboard,
    },
    { type: 'divider' },
    {
      key: 'advanced',
      icon: <SettingOutlined />,
      label: '高级导出...',
      onClick: () => setModalVisible(true),
    },
  ];

  // 格式选项
  const formatOptions = [
    { value: 'csv', label: 'CSV', icon: <FileTextOutlined />, desc: '通用格式，Excel兼容' },
    { value: 'xlsx', label: 'Excel', icon: <FileExcelOutlined />, desc: '支持多Sheet、格式化' },
    { value: 'json', label: 'JSON', icon: <FileTextOutlined />, desc: 'API接口、数据交换' },
    { value: 'pdf', label: 'PDF/HTML', icon: <FilePdfOutlined />, desc: '打印、分享、归档' },
  ];

  // 渲染预览表格
  const renderPreviewTable = () => (
    <Table
      dataSource={previewData.map((row, idx) => ({ ...row, key: idx }))}
      columns={currentColumns.map(col => ({
        title: col.label,
        dataIndex: col.key,
        key: col.key,
        width: col.width,
        align: col.align,
        render: col.format ? (val: unknown) => col.format!(val) : undefined,
      }))}
      size="small"
      scroll={{ x: 'max-content' }}
      pagination={false}
      bordered
    />
  );

  return (
    <>
      {/* 快速导出按钮 */}
      <Dropdown menu={{ items: quickExportItems }} placement="bottomRight">
        <Button
          icon={<DownloadOutlined />}
          loading={exporting}
          size="small"
        >
          导出
        </Button>
      </Dropdown>

      {/* 高级导出模态框 */}
      <Modal
        title={
          <Space>
            <DownloadOutlined />
            <span>Bloomberg Terminal 风格数据导出</span>
          </Space>
        }
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        width={800}
        footer={[
          <Button key="preview" icon={<EyeOutlined />} onClick={() => setPreviewVisible(true)}>
            预览数据
          </Button>,
          <Button key="cancel" onClick={() => setModalVisible(false)}>
            取消
          </Button>,
          <Button
            key="export"
            type="primary"
            icon={<DownloadOutlined />}
            loading={exporting}
            onClick={handleAdvancedExport}
          >
            导出
          </Button>,
        ]}
      >
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            {
              key: 'format',
              label: (
                <span>
                  <FileExcelOutlined />
                  格式设置
                </span>
              ),
              children: (
                <div style={{ padding: '16px 0' }}>
                  {/* 导出格式选择 */}
                  <div style={{ marginBottom: 24 }}>
                    <Text strong>导出格式</Text>
                    <Radio.Group
                      value={settings.format}
                      onChange={e => setSettings({ ...settings, format: e.target.value })}
                      style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 8 }}
                    >
                      {formatOptions.map(opt => (
                        <Radio.Button
                          key={opt.value}
                          value={opt.value}
                          style={{
                            height: 'auto',
                            padding: '12px 16px',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            minWidth: 120,
                          }}
                        >
                          <div style={{ fontSize: 24, marginBottom: 4 }}>{opt.icon}</div>
                          <div>{opt.label}</div>
                          <div style={{ fontSize: 11, color: '#999' }}>{opt.desc}</div>
                        </Radio.Button>
                      ))}
                    </Radio.Group>
                  </div>

                  <Divider />

                  {/* 基本设置 */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div>
                      <Text strong>文件名</Text>
                      <Input
                        value={customFilename}
                        onChange={e => setCustomFilename(e.target.value)}
                        placeholder="输入文件名"
                        style={{ marginTop: 8 }}
                      />
                    </div>
                    <div>
                      <Text strong>标题（可选）</Text>
                      <Input
                        value={customTitle}
                        onChange={e => setCustomTitle(e.target.value)}
                        placeholder="导出文件标题"
                        style={{ marginTop: 8 }}
                      />
                    </div>
                  </div>

                  <Divider />

                  {/* 选项开关 */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div>
                      <Space>
                        <Switch
                          checked={settings.includeHeader}
                          onChange={checked => setSettings({ ...settings, includeHeader: checked })}
                        />
                        <Text>包含表头</Text>
                      </Space>
                    </div>
                    <div>
                      <Space>
                        <Switch
                          checked={settings.includeTimestamp}
                          onChange={checked => setSettings({ ...settings, includeTimestamp: checked })}
                        />
                        <Text>包含时间戳</Text>
                      </Space>
                    </div>
                    <div>
                      <Space>
                        <Switch
                          checked={settings.includeSummary}
                          onChange={checked => setSettings({ ...settings, includeSummary: checked })}
                        />
                        <Text>包含数据汇总</Text>
                      </Space>
                    </div>
                    <div>
                      <Text>编码: </Text>
                      <Select
                        value={settings.encoding}
                        onChange={value => setSettings({ ...settings, encoding: value })}
                        options={[
                          { value: 'utf-8', label: 'UTF-8 (推荐)' },
                          { value: 'gbk', label: 'GBK (Excel兼容)' },
                        ]}
                        style={{ width: 140 }}
                      />
                    </div>
                  </div>
                </div>
              ),
            },
            {
              key: 'template',
              label: (
                <span>
                  <FileTextOutlined />
                  报表模板
                </span>
              ),
              children: (
                <div style={{ padding: '16px 0' }}>
                  <Text strong>选择报表模板</Text>
                  <div style={{ marginTop: 8 }}>
                    <Radio.Group
                      value={selectedTemplate}
                      onChange={e => setSelectedTemplate(e.target.value)}
                      style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
                    >
                      <Radio value="">
                        <Space>
                          <Tag>自定义</Tag>
                          <Text>使用当前列定义</Text>
                        </Space>
                      </Radio>
                      {templates.map(t => (
                        <Radio key={t.id} value={t.id}>
                          <Space direction="vertical" size={0}>
                            <Space>
                              <Tag color="blue">{t.name}</Tag>
                              {t.filters && t.filters.length > 0 && (
                                <Tag icon={<FilterOutlined />} color="orange">
                                  {t.filters.length} 个过滤条件
                                </Tag>
                              )}
                              {t.sortBy && (
                                <Tag icon={<SortAscendingOutlined />}>排序</Tag>
                              )}
                              {t.groupBy && (
                                <Tag icon={<GroupOutlined />}>分组</Tag>
                              )}
                              {t.aggregations && t.aggregations.length > 0 && (
                                <Tag icon={<CalculatorOutlined />}>聚合</Tag>
                              )}
                            </Space>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              {t.description}
                            </Text>
                          </Space>
                        </Radio>
                      ))}
                    </Radio.Group>
                  </div>

                  {templates.length === 0 && (
                    <div style={{ marginTop: 16, padding: 16, background: '#fafafa', borderRadius: 4 }}>
                      <Text type="secondary">
                        暂无预定义模板。使用高级导出功能可以创建自定义报表。
                      </Text>
                    </div>
                  )}
                </div>
              ),
            },
            ...(showAdvanced
              ? [
                  {
                    key: 'advanced',
                    label: (
                      <span>
                        <SettingOutlined />
                        高级设置
                      </span>
                    ),
                    children: (
                      <div style={{ padding: '16px 0' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                          <div>
                            <Text strong>数值精度</Text>
                            <Select
                              value={settings.precision}
                              onChange={value => setSettings({ ...settings, precision: value })}
                              options={[
                                { value: 0, label: '整数' },
                                { value: 1, label: '1位小数' },
                                { value: 2, label: '2位小数 (推荐)' },
                                { value: 3, label: '3位小数' },
                                { value: 4, label: '4位小数' },
                              ]}
                              style={{ width: '100%', marginTop: 8 }}
                            />
                          </div>
                          {settings.format === 'xlsx' && (
                            <div>
                              <Text strong>Sheet名称</Text>
                              <Input
                                value={settings.sheetName}
                                onChange={e => setSettings({ ...settings, sheetName: e.target.value })}
                                placeholder="Sheet1"
                                style={{ marginTop: 8 }}
                              />
                            </div>
                          )}
                        </div>

                        <Divider />

                        {/* 列定义预览 */}
                        <div>
                          <Text strong>导出列定义 ({currentColumns.length} 列)</Text>
                          <div style={{ marginTop: 8, maxHeight: 200, overflow: 'auto' }}>
                            {currentColumns.map((col, idx) => (
                              <div
                                key={col.key}
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  padding: '4px 8px',
                                  background: idx % 2 === 0 ? '#fafafa' : '#fff',
                                  borderRadius: 2,
                                }}
                              >
                                <Text>{col.label}</Text>
                                <Text type="secondary">{col.key}</Text>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ),
                  },
                ]
              : []),
            ...(showScheduler
              ? [
                  {
                    key: 'scheduler',
                    label: (
                      <span>
                        <ClockCircleOutlined />
                        定时导出
                      </span>
                    ),
                    children: (
                      <div style={{ padding: '16px 0' }}>
                        <Space direction="vertical" style={{ width: '100%' }}>
                          <Space>
                            <Switch
                              checked={scheduler.enabled}
                              onChange={checked => setScheduler({ ...scheduler, enabled: checked })}
                            />
                            <Text strong>启用定时导出</Text>
                          </Space>

                          {scheduler.enabled && (
                            <>
                              <div style={{ marginTop: 16 }}>
                                <Text>导出频率</Text>
                                <Select
                                  value={scheduler.frequency}
                                  onChange={value => setScheduler({ ...scheduler, frequency: value })}
                                  options={[
                                    { value: 'daily', label: '每天' },
                                    { value: 'weekly', label: '每周' },
                                    { value: 'monthly', label: '每月' },
                                  ]}
                                  style={{ width: '100%', marginTop: 8 }}
                                />
                              </div>

                              <div>
                                <Text>导出时间</Text>
                                <Input
                                  type="time"
                                  value={scheduler.time}
                                  onChange={e => setScheduler({ ...scheduler, time: e.target.value })}
                                  style={{ marginTop: 8 }}
                                />
                              </div>

                              <div>
                                <Text>接收邮箱（可选）</Text>
                                <Input.TextArea
                                  placeholder="多个邮箱用逗号分隔"
                                  rows={2}
                                  style={{ marginTop: 8 }}
                                />
                              </div>
                            </>
                          )}
                        </Space>
                      </div>
                    ),
                  },
                ]
              : []),
          ]}
        />
      </Modal>

      {/* 数据预览模态框 */}
      <Modal
        title="数据预览 (前10行)"
        open={previewVisible}
        onCancel={() => setPreviewVisible(false)}
        width={1000}
        footer={[
          <Button key="close" onClick={() => setPreviewVisible(false)}>
            关闭
          </Button>,
        ]}
      >
        <div style={{ marginBottom: 16 }}>
          <Space>
            <Text type="secondary">
              共 {data.length} 条记录，{currentColumns.length} 列
            </Text>
            <Tag color="blue">{settings.format.toUpperCase()}</Tag>
          </Space>
        </div>
        {renderPreviewTable()}
      </Modal>
    </>
  );
}
