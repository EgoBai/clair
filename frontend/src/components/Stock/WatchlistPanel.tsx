/**
 * 增强自选股组件
 * 支持分组管理、拖拽排序、实时行情推送
 * 参考同花顺自选股体验
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  Table, Button, Input, Modal, message, Tag, Space, Dropdown,
  Typography, Tooltip, Badge, Popconfirm, Card, Tabs, Empty,
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, EditOutlined, DragOutlined,
  FolderOutlined, FolderAddOutlined, StarFilled, StarOutlined,
  ArrowUpOutlined, ArrowDownOutlined, SearchOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useAppStore, StockWithQuote } from '../../store/useAppStore';
import { apiService } from '../../services/api';
import axios from 'axios';

const { Text } = Typography;

// API 基础 URL
const API_BASE = import.meta.env.VITE_API_URL || '';

// ==================== 类型 ====================

export interface WatchlistGroup {
  id: string;
  name: string;
  stocks: WatchlistStock[];
  isDefault?: boolean;
}

export interface WatchlistStock {
  id: number;
  symbol: string;
  name: string;
  market: string;
  industry?: string;
  closePrice?: number;
  changePercent?: number;
  volume?: number;
  turnover?: number;
  sortIndex: number;
  groupId: string;
}

interface WatchlistPanelProps {
  onStockClick?: (symbol: string) => void;
}

const WatchlistPanel: React.FC<WatchlistPanelProps> = ({ onStockClick }) => {
  const [groups, setGroups] = useState<WatchlistGroup[]>([
    { id: 'default', name: '默认分组', stocks: [], isDefault: true },
  ]);
  const [activeGroup, setActiveGroup] = useState('default');
  const [loading, setLoading] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [searchText, setSearchText] = useState('');

  // 加载自选股
  const loadWatchlist = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiService.get('/api/watchlist');
      if (res.success) {
        const items = res.data?.watchlist || [];
        // 按分组组织
        const grouped: Record<string, WatchlistStock[]> = {};
        for (const item of items) {
          const gid = item.groupId || 'default';
          if (!grouped[gid]) grouped[gid] = [];
          grouped[gid].push({
            id: item.id,
            symbol: item.symbol,
            name: item.name,
            market: item.market,
            industry: item.industry,
            closePrice: item.closePrice,
            changePercent: item.changePercent,
            volume: item.volume,
            turnover: item.turnover,
            sortIndex: item.sortIndex ?? 0,
            groupId: gid,
          });
        }

        setGroups(prev => {
          const updated = prev.map(g => ({
            ...g,
            stocks: (grouped[g.id] || []).sort((a, b) => a.sortIndex - b.sortIndex),
          }));
          return updated;
        });
      }
    } catch (err) {
      console.error('加载自选股失败:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWatchlist();
  }, [loadWatchlist]);

  // 添加自选股
  const handleAddStock = async (symbol: string) => {
    try {
      const res = await apiService.post('/api/watchlist', { symbol });
      if (res.success) {
        message.success('已添加到自选股');
        loadWatchlist();
        setAddModalOpen(false);
      }
    } catch (err: any) {
      message.error(err.response?.data?.error || '添加失败');
    }
  };

  // 删除自选股
  const handleRemoveStock = async (symbol: string) => {
    try {
      await axios.delete(`${API_BASE}/api/watchlist/${symbol}`);
      message.success('已移除');
      loadWatchlist();
    } catch (err) {
      message.error('删除失败');
    }
  };

  // 新建分组
  const handleCreateGroup = () => {
    if (!newGroupName.trim()) return;
    const id = `group_${Date.now()}`;
    setGroups(prev => [...prev, { id, name: newGroupName.trim(), stocks: [] }]);
    setNewGroupName('');
    setGroupModalOpen(false);
    message.success('分组已创建');
  };

  // 删除分组
  const handleDeleteGroup = (groupId: string) => {
    setGroups(prev => {
      const group = prev.find(g => g.id === groupId);
      if (group?.isDefault) {
        message.warning('默认分组不能删除');
        return prev;
      }
      // 将该分组的股票移到默认分组
      const stocks = group?.stocks || [];
      return prev
        .filter(g => g.id !== groupId)
        .map(g => g.id === 'default'
          ? { ...g, stocks: [...g.stocks, ...stocks.map(s => ({ ...s, groupId: 'default' }))] }
          : g
        );
    });
    message.success('分组已删除');
  };

  // 拖拽排序（简化版：上下移动）
  const moveStock = (groupId: string, index: number, direction: 'up' | 'down') => {
    setGroups(prev => prev.map(g => {
      if (g.id !== groupId) return g;
      const stocks = [...g.stocks];
      const targetIdx = direction === 'up' ? index - 1 : index + 1;
      if (targetIdx < 0 || targetIdx >= stocks.length) return g;
      [stocks[index], stocks[targetIdx]] = [stocks[targetIdx], stocks[index]];
      stocks.forEach((s, i) => { s.sortIndex = i; });
      return { ...g, stocks };
    }));
  };

  // 表格列定义
  const columns: ColumnsType<WatchlistStock> = [
    {
      title: '',
      width: 50,
      render: (_, __, index) => (
        <Space size={0}>
          <Button
            type="text"
            size="small"
            icon={<ArrowUpOutlined />}
            onClick={() => moveStock(activeGroup, index, 'up')}
            disabled={index === 0}
          />
          <Button
            type="text"
            size="small"
            icon={<ArrowDownOutlined />}
            onClick={() => moveStock(activeGroup, index, 'down')}
          />
        </Space>
      ),
    },
    {
      title: '代码',
      dataIndex: 'symbol',
      width: 100,
      render: (symbol: string) => (
        <Text strong style={{ cursor: 'pointer', color: '#3b82f6' }}
          onClick={() => onStockClick?.(symbol)}>
          {symbol}
        </Text>
      ),
    },
    {
      title: '名称',
      dataIndex: 'name',
      width: 100,
      render: (name: string, record) => (
        <Text
          style={{ cursor: 'pointer' }}
          onClick={() => onStockClick?.(record.symbol)}
        >
          {name}
        </Text>
      ),
    },
    {
      title: '最新价',
      dataIndex: 'closePrice',
      width: 80,
      align: 'right',
      render: (val: number) => val?.toFixed(2) ?? '-',
    },
    {
      title: '涨跌幅',
      dataIndex: 'changePercent',
      width: 80,
      align: 'right',
      render: (val: number) => {
        if (val === undefined || val === null) return '-';
        const color = val > 0 ? '#ef4444' : val < 0 ? '#22c55e' : '#666';
        const prefix = val > 0 ? '+' : '';
        return <span style={{ color, fontWeight: 600 }}>{prefix}{val.toFixed(2)}%</span>;
      },
    },
    {
      title: '',
      width: 40,
      render: (_, record) => (
        <Popconfirm title="确定移除？" onConfirm={() => handleRemoveStock(record.symbol)}>
          <Button type="text" danger size="small" icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ];

  // 当前活跃分组
  const currentGroup = groups.find(g => g.id === activeGroup) || groups[0];
  const filteredStocks = searchText
    ? currentGroup.stocks.filter(s =>
        s.symbol.toLowerCase().includes(searchText.toLowerCase()) ||
        s.name.includes(searchText)
      )
    : currentGroup.stocks;

  return (
    <Card
      title={
        <Space>
          <StarFilled style={{ color: '#f59e0b' }} />
          <span>自选股</span>
          <Badge count={currentGroup.stocks.length} style={{ backgroundColor: '#3b82f6' }} />
        </Space>
      }
      extra={
        <Space>
          <Button size="small" icon={<FolderAddOutlined />} onClick={() => setGroupModalOpen(true)}>
            新建分组
          </Button>
          <Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => setAddModalOpen(true)}>
            添加
          </Button>
        </Space>
      }
    >
      {/* 分组 Tabs */}
      <Tabs
        activeKey={activeGroup}
        onChange={setActiveGroup}
        type="editable-card"
        size="small"
        onEdit={(key, action) => {
          if (action === 'remove' && typeof key === 'string') {
            handleDeleteGroup(key);
          }
        }}
        items={groups.map(g => ({
          key: g.id,
          label: (
            <span>
              {g.isDefault ? <FolderOutlined /> : <FolderOutlined />}
              {' '}{g.name}
              <Badge
                count={g.stocks.length}
                size="small"
                style={{ marginLeft: 6, backgroundColor: '#94a3b8' }}
              />
            </span>
          ),
          closable: !g.isDefault,
        }))}
      />

      {/* 搜索过滤 */}
      <Input
        prefix={<SearchOutlined />}
        placeholder="过滤股票..."
        value={searchText}
        onChange={e => setSearchText(e.target.value)}
        size="small"
        allowClear
        style={{ marginBottom: 8 }}
      />

      {/* 股票表格 */}
      <Table
        dataSource={filteredStocks}
        columns={columns}
        rowKey="symbol"
        size="small"
        pagination={false}
        loading={loading}
        locale={{ emptyText: <Empty description="暂无自选股" /> }}
        scroll={{ y: 300 }}
        onRow={(record) => ({
          style: { cursor: 'pointer' },
          onClick: () => onStockClick?.(record.symbol),
        })}
      />

      {/* 添加自选股弹窗 */}
      <Modal
        title="添加自选股"
        open={addModalOpen}
        onCancel={() => setAddModalOpen(false)}
        footer={null}
      >
        <AddStockForm onAdd={handleAddStock} />
      </Modal>

      {/* 新建分组弹窗 */}
      <Modal
        title="新建分组"
        open={groupModalOpen}
        onOk={handleCreateGroup}
        onCancel={() => setGroupModalOpen(false)}
      >
        <Input
          placeholder="输入分组名称"
          value={newGroupName}
          onChange={e => setNewGroupName(e.target.value)}
          maxLength={20}
        />
      </Modal>
    </Card>
  );
};

// ==================== 添加股票搜索表单 ====================

const AddStockForm: React.FC<{ onAdd: (symbol: string) => void }> = ({ onAdd }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  const doSearch = async (q: string) => {
    if (!q.trim()) { setResults([]); return; }
    setSearching(true);
    try {
      const res = await apiService.get('/api/search', { q, limit: 10 });
      if (res.success) {
        setResults(res.data?.results || []);
      }
    } catch { setResults([]); }
    finally { setSearching(false); }
  };

  return (
    <div>
      <Input.Search
        placeholder="输入股票代码或名称搜索"
        value={query}
        onChange={e => setQuery(e.target.value)}
        onSearch={doSearch}
        loading={searching}
        style={{ marginBottom: 12 }}
      />
      <div style={{ maxHeight: 300, overflow: 'auto' }}>
        {results.map((r: any) => (
          <div
            key={r.symbol}
            style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '8px 12px', borderBottom: '1px solid #f0f0f0',
              cursor: 'pointer', borderRadius: 4,
            }}
            onClick={() => onAdd(r.symbol)}
            onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.backgroundColor = '#f5f5f5'}
            onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent'}
          >
            <div>
              <Text strong>{r.symbol}</Text>
              <Text style={{ marginLeft: 8, color: '#666' }}>{r.name}</Text>
            </div>
            <Tag color="blue">{r.market}</Tag>
          </div>
        ))}
        {results.length === 0 && query && !searching && (
          <Empty description="未找到匹配的股票" />
        )}
      </div>
    </div>
  );
};

export default WatchlistPanel;
