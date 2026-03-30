/**
 * 自定义仪表盘
 * 支持拖拽布局、组件大小调整
 * 参考 TradingView 多图表布局
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';

interface DashboardWidget {
  id: string;
  type: 'kline' | 'quote' | 'heatmap' | 'news' | 'fundflow' | 'alert';
  title: string;
  symbol?: string;
  x: number;       // grid column start (1-based)
  y: number;       // grid row start (1-based)
  w: number;       // width in grid units
  h: number;       // height in grid units
}

interface CustomDashboardProps {
  widgets?: DashboardWidget[];
  onLayoutChange?: (widgets: DashboardWidget[]) => void;
  maxColumns?: number;
}

const DEFAULT_WIDGETS: DashboardWidget[] = [
  { id: 'w1', type: 'kline', title: 'K线图', symbol: '600519.SH', x: 1, y: 1, w: 2, h: 2 },
  { id: 'w2', type: 'quote', title: '行情报价', symbol: '600519.SH', x: 3, y: 1, w: 1, h: 1 },
  { id: 'w3', type: 'heatmap', title: '行业热力图', x: 3, y: 2, w: 1, h: 1 },
  { id: 'w4', type: 'news', title: '最新资讯', x: 1, y: 3, w: 1, h: 1 },
  { id: 'w5', type: 'fundflow', title: '资金流向', symbol: '600519.SH', x: 2, y: 3, w: 1, h: 1 },
  { id: 'w6', type: 'alert', title: '智能预警', x: 3, y: 3, w: 1, h: 1 },
];

const WIDGET_ICONS: Record<string, string> = {
  kline: '📈',
  quote: '💰',
  heatmap: '🗺️',
  news: '📰',
  fundflow: '💵',
  alert: '🔔',
};

const CustomDashboard: React.FC<CustomDashboardProps> = ({
  widgets: initialWidgets,
  onLayoutChange,
  maxColumns = 3,
}) => {
  const [widgets, setWidgets] = useState<DashboardWidget[]>(
    initialWidgets || DEFAULT_WIDGETS
  );
  const [dragging, setDragging] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // 保存到 localStorage
  useEffect(() => {
    const saved = localStorage.getItem('dashboard_layout');
    if (saved && !initialWidgets) {
      try {
        setWidgets(JSON.parse(saved));
      } catch {}
    }
  }, [initialWidgets]);

  const saveLayout = useCallback((newWidgets: DashboardWidget[]) => {
    setWidgets(newWidgets);
    localStorage.setItem('dashboard_layout', JSON.stringify(newWidgets));
    onLayoutChange?.(newWidgets);
  }, [onLayoutChange]);

  const handleDragStart = useCallback((id: string) => {
    if (!isEditMode) return;
    setDragging(id);
  }, [isEditMode]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleDrop = useCallback((targetId: string) => {
    if (!dragging || dragging === targetId) {
      setDragging(null);
      return;
    }

    const newWidgets = [...widgets];
    const dragIdx = newWidgets.findIndex(w => w.id === dragging);
    const targetIdx = newWidgets.findIndex(w => w.id === targetId);

    if (dragIdx >= 0 && targetIdx >= 0) {
      // 交换位置
      const temp = { x: newWidgets[dragIdx].x, y: newWidgets[dragIdx].y };
      newWidgets[dragIdx].x = newWidgets[targetIdx].x;
      newWidgets[dragIdx].y = newWidgets[targetIdx].y;
      newWidgets[targetIdx].x = temp.x;
      newWidgets[targetIdx].y = temp.y;
      saveLayout(newWidgets);
    }

    setDragging(null);
  }, [dragging, widgets, saveLayout]);

  const handleResize = useCallback((id: string, direction: 'bigger' | 'smaller') => {
    const newWidgets = widgets.map(w => {
      if (w.id !== id) return w;
      if (direction === 'bigger') {
        return { ...w, w: Math.min(w.w + 1, maxColumns), h: Math.min(w.h + 1, 3) };
      }
      return { ...w, w: Math.max(w.w - 1, 1), h: Math.max(w.h - 1, 1) };
    });
    saveLayout(newWidgets);
  }, [widgets, maxColumns, saveLayout]);

  const handleRemove = useCallback((id: string) => {
    saveLayout(widgets.filter(w => w.id !== id));
  }, [widgets, saveLayout]);

  const handleReset = useCallback(() => {
    saveLayout(DEFAULT_WIDGETS);
  }, [saveLayout]);

  const renderWidgetContent = (widget: DashboardWidget) => {
    switch (widget.type) {
      case 'kline':
        return (
          <div style={{ padding: 16, color: '#9ca3af', fontSize: 13 }}>
            <div style={{ marginBottom: 8, color: '#e5e7eb', fontWeight: 600 }}>
              {widget.symbol || '未选择股票'}
            </div>
            <div style={{
              height: 'calc(100% - 30px)',
              background: 'linear-gradient(135deg, rgba(59,130,246,0.1), rgba(139,92,246,0.1))',
              borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              📈 K线图组件
            </div>
          </div>
        );
      case 'quote':
        return (
          <div style={{ padding: 16 }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#ef4444' }}>1,920.00</div>
            <div style={{ fontSize: 13, color: '#ef4444', marginTop: 4 }}>+35.60 (+1.89%)</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12, fontSize: 12, color: '#9ca3af' }}>
              <div>今开: <span style={{ color: '#e5e7eb' }}>1,890.00</span></div>
              <div>最高: <span style={{ color: '#e5e7eb' }}>1,935.00</span></div>
              <div>昨收: <span style={{ color: '#e5e7eb' }}>1,884.40</span></div>
              <div>最低: <span style={{ color: '#e5e7eb' }}>1,880.00</span></div>
            </div>
          </div>
        );
      case 'heatmap':
        return (
          <div style={{
            padding: 16, height: '100%',
            display: 'flex', flexDirection: 'column', gap: 4,
          }}>
            {['白酒', '新能源', '半导体', '银行', '医药'].map((ind, i) => (
              <div key={ind} style={{
                flex: 1,
                background: `rgba(${i < 2 ? '239,68,68' : '34,197,94'},${0.2 + Math.random() * 0.3})`,
                borderRadius: 4, padding: '4px 8px',
                fontSize: 12, color: '#e5e7eb',
                display: 'flex', justifyContent: 'space-between',
              }}>
                <span>{ind}</span>
                <span>{(Math.random() * 6 - 3).toFixed(2)}%</span>
              </div>
            ))}
          </div>
        );
      case 'news':
        return (
          <div style={{ padding: 12, fontSize: 12 }}>
            {['央行: 继续实施稳健的货币政策', '新能源汽车销量再创新高', '半导体板块午后拉升', '医药集采影响逐步消化'].map((t, i) => (
              <div key={i} style={{
                padding: '6px 0',
                borderBottom: i < 3 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                color: '#d1d5db',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {t}
              </div>
            ))}
          </div>
        );
      case 'fundflow':
        return (
          <div style={{ padding: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 8 }}>主力净流入</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#ef4444' }}>+2.35亿</div>
            <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: 12, fontSize: 11, color: '#9ca3af' }}>
              <div><div style={{ color: '#ef4444' }}>+1.2亿</div><div>超大单</div></div>
              <div><div style={{ color: '#ef4444' }}>+0.8亿</div><div>大单</div></div>
              <div><div style={{ color: '#22c55e' }}>-0.3亿</div><div>中单</div></div>
              <div><div style={{ color: '#22c55e' }}>-0.5亿</div><div>小单</div></div>
            </div>
          </div>
        );
      case 'alert':
        return (
          <div style={{ padding: 12, fontSize: 12 }}>
            {[
              { text: '贵州茅台 涨幅超3%', severity: 'high' },
              { text: '宁德时代 RSI超买', severity: 'medium' },
              { text: '比亚迪 放量突破', severity: 'medium' },
            ].map((a, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 0',
                borderBottom: i < 2 ? '1px solid rgba(255,255,255,0.06)' : 'none',
              }}>
                <span style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: a.severity === 'high' ? '#ef4444' : '#f59e0b',
                  flexShrink: 0,
                }} />
                <span style={{ color: '#d1d5db' }}>{a.text}</span>
              </div>
            ))}
          </div>
        );
      default:
        return <div style={{ padding: 16, color: '#9ca3af' }}>未知组件</div>;
    }
  };

  return (
    <div>
      {/* 工具栏 */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 16, padding: '8px 0',
      }}>
        <h3 style={{ margin: 0, fontSize: 16, color: '#e5e7eb' }}>
          📐 自定义仪表盘
        </h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setIsEditMode(!isEditMode)}
            style={{
              padding: '6px 12px', borderRadius: 6,
              background: isEditMode ? '#3b82f6' : 'rgba(255,255,255,0.08)',
              color: isEditMode ? '#fff' : '#9ca3af',
              border: 'none', cursor: 'pointer', fontSize: 12,
            }}
          >
            {isEditMode ? '✅ 完成编辑' : '✏️ 编辑布局'}
          </button>
          {isEditMode && (
            <button
              onClick={handleReset}
              style={{
                padding: '6px 12px', borderRadius: 6,
                background: 'rgba(239,68,68,0.15)',
                color: '#ef4444', border: 'none', cursor: 'pointer', fontSize: 12,
              }}
            >
              🔄 重置
            </button>
          )}
        </div>
      </div>

      {/* 网格布局 */}
      <div
        ref={containerRef}
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${maxColumns}, 1fr)`,
          gap: 12,
          minHeight: 400,
        }}
      >
        {widgets.map((widget) => (
          <div
            key={widget.id}
            draggable={isEditMode}
            onDragStart={() => handleDragStart(widget.id)}
            onDragOver={handleDragOver}
            onDrop={() => handleDrop(widget.id)}
            style={{
              gridColumn: `span ${Math.min(widget.w, maxColumns)}`,
              gridRow: `span ${widget.h}`,
              background: 'rgba(255,255,255,0.03)',
              borderRadius: 12,
              border: dragging === widget.id
                ? '2px solid #3b82f6'
                : '1px solid rgba(255,255,255,0.06)',
              overflow: 'hidden',
              position: 'relative',
              minHeight: widget.h * 150,
              cursor: isEditMode ? 'grab' : 'default',
              transition: 'border-color 0.2s',
            }}
          >
            {/* 标题栏 */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '8px 12px',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              background: 'rgba(255,255,255,0.02)',
            }}>
              <span style={{ fontSize: 13, color: '#9ca3af' }}>
                {WIDGET_ICONS[widget.type]} {widget.title}
              </span>
              {isEditMode && (
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    onClick={() => handleResize(widget.id, 'bigger')}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      fontSize: 14, color: '#6b7280', padding: '0 4px',
                    }}
                    title="放大"
                  >➕</button>
                  <button
                    onClick={() => handleResize(widget.id, 'smaller')}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      fontSize: 14, color: '#6b7280', padding: '0 4px',
                    }}
                    title="缩小"
                  >➖</button>
                  <button
                    onClick={() => handleRemove(widget.id)}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      fontSize: 14, color: '#ef4444', padding: '0 4px',
                    }}
                    title="移除"
                  >✕</button>
                </div>
              )}
            </div>

            {/* 内容区 */}
            <div style={{ height: 'calc(100% - 40px)' }}>
              {renderWidgetContent(widget)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CustomDashboard;
