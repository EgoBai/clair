/**
 * 快捷键帮助面板 - Linear/Notion 风格
 * 按 ? 或 Cmd+/ 打开, 展示所有可用快捷键
 */
import React, { useCallback } from 'react';
import { CloseOutlined } from '@ant-design/icons';

interface ShortcutEntry {
  keys: string[];
  description: string;
  category: string;
}

interface ShortcutHelpOverlayProps {
  visible: boolean;
  onClose: () => void;
}

const SHORTCUT_GROUPS: ShortcutEntry[] = [
  // 搜索与命令
  { keys: ['⌘', 'K'], description: '打开命令面板', category: '搜索' },
  { keys: ['/'], description: '聚焦搜索框', category: '搜索' },

  // 导航
  { keys: ['Alt', '1'], description: '首页', category: '导航' },
  { keys: ['Alt', '2'], description: '股票列表', category: '导航' },
  { keys: ['Alt', '3'], description: '行情分析', category: '导航' },
  { keys: ['Alt', '4'], description: '自选股', category: '导航' },
  { keys: ['Alt', '5'], description: '策略回测', category: '导航' },
  { keys: ['Alt', '6'], description: 'AI 选股', category: '导航' },
  { keys: ['⌫'], description: '返回上一页', category: '导航' },

  // 序列键导航
  { keys: ['G', 'H'], description: '跳转首页', category: '序列键' },
  { keys: ['G', 'S'], description: '跳转股票列表', category: '序列键' },
  { keys: ['G', 'M'], description: '跳转行情', category: '序列键' },
  { keys: ['G', 'W'], description: '跳转自选股', category: '序列键' },

  // 数据操作
  { keys: ['R'], description: '刷新当前数据', category: '数据' },
  { keys: ['F'], description: '打开筛选器', category: '数据' },
  { keys: ['S', 'P'], description: '按价格排序', category: '数据' },
  { keys: ['S', 'C'], description: '按涨跌幅排序', category: '数据' },
  { keys: ['S', 'V'], description: '按成交量排序', category: '数据' },

  // 列表导航
  { keys: ['J', '↓'], description: '列表下移', category: '列表' },
  { keys: ['K', '↑'], description: '列表上移', category: '列表' },
  { keys: ['↵'], description: '选中当前项', category: '列表' },
  { keys: ['Home'], description: '跳到首项', category: '列表' },
  { keys: ['End'], description: '跳到末项', category: '列表' },

  // 界面
  { keys: ['Alt', 'T'], description: '切换主题', category: '界面' },
  { keys: ['Alt', 'S'], description: '切换侧边栏', category: '界面' },
  { keys: ['Esc'], description: '关闭弹窗/取消', category: '界面' },

  // 股票操作
  { keys: ['W'], description: '添加/移除自选', category: '股票' },
  { keys: ['B'], description: '买入', category: '股票' },
  { keys: ['S'], description: '卖出', category: '股票' },

  // 帮助
  { keys: ['?'], description: '快捷键帮助', category: '帮助' },
];

const ShortcutHelpOverlay: React.FC<ShortcutHelpOverlayProps> = ({ visible, onClose }) => {
  // ESC 关闭
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  }, [onClose]);

  // 按类别分组
  const groups = React.useMemo(() => {
    const result: Record<string, ShortcutEntry[]> = {};
    SHORTCUT_GROUPS.forEach(entry => {
      if (!result[entry.category]) result[entry.category] = [];
      result[entry.category].push(entry);
    });
    return result;
  }, []);

  const categoryOrder = ['搜索', '导航', '序列键', '数据', '列表', '界面', '股票', '帮助'];

  if (!visible) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        backdropFilter: 'blur(4px)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-label="快捷键帮助"
    >
      <div style={{
        width: '100%',
        maxWidth: 640,
        maxHeight: '80vh',
        backgroundColor: '#fff',
        borderRadius: 12,
        boxShadow: '0 16px 70px rgba(0, 0, 0, 0.2)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* 头部 */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 20px',
          borderBottom: '1px solid #e2e8f0',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18 }}>⌨️</span>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>快捷键</h2>
          </div>
          <button
            onClick={onClose}
            style={{
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              padding: 4,
              color: '#999',
            }}
            aria-label="关闭"
          >
            <CloseOutlined />
          </button>
        </div>

        {/* 快捷键列表 */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px 20px',
        }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 20,
          }}>
            {categoryOrder.map(category => {
              const items = groups[category];
              if (!items || items.length === 0) return null;

              return (
                <div key={category}>
                  <h3 style={{
                    margin: '0 0 8px 0',
                    fontSize: 12,
                    fontWeight: 600,
                    color: '#999',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}>
                    {category}
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {items.map((item, i) => (
                      <div
                        key={`${category}-${i}`}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '6px 0',
                        }}
                      >
                        <span style={{ fontSize: 13, color: '#555' }}>{item.description}</span>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {item.keys.map((key, ki) => (
                            <kbd
                              key={ki}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                minWidth: 24,
                                height: 24,
                                padding: '0 6px',
                                fontSize: 11,
                                fontWeight: 500,
                                color: '#666',
                                backgroundColor: '#f5f5f5',
                                borderRadius: 4,
                                border: '1px solid #ddd',
                                boxShadow: '0 1px 0 #ccc',
                              }}
                            >
                              {key}
                            </kbd>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 底部 */}
        <div style={{
          padding: '12px 20px',
          borderTop: '1px solid #e2e8f0',
          fontSize: 12,
          color: '#999',
          textAlign: 'center',
        }}>
          按 <kbd style={{
            padding: '2px 6px',
            fontSize: 11,
            backgroundColor: '#f5f5f5',
            borderRadius: 4,
            border: '1px solid #ddd',
          }}>?</kbd> 或 <kbd style={{
            padding: '2px 6px',
            fontSize: 11,
            backgroundColor: '#f5f5f5',
            borderRadius: 4,
            border: '1px solid #ddd',
          }}>⌘/</kbd> 随时查看快捷键
        </div>
      </div>
    </div>
  );
};

export default React.memo(ShortcutHelpOverlay);