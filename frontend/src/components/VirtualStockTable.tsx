import React, { useMemo } from 'react';
import { List as RawList } from 'react-window';
const List = RawList as any;
import StockRow from './StockRow';

interface Stock {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: string;
  marketCap: string;
}

interface VirtualStockTableProps {
  stocks: Stock[];
  height?: number;
  rowHeight?: number;
  width?: number | string;
}

// 虚拟滚动表格组件
const VirtualStockTable: React.FC<VirtualStockTableProps> = React.memo(({
  stocks,
  height = 600,
  rowHeight = 50,
  width = '100%'
}) => {
  // removed: console.log

  if (stocks.length === 0) {
    return (
      <div className="empty-table" style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p>暂无股票数据</p>
      </div>
    );
  }

  return (
    <div className="virtual-stock-table">
      <List
        height={height}
        itemCount={stocks.length}
        itemSize={rowHeight}
        width={width}
        className="virtual-list"
        itemContent={(index: number, style: React.CSSProperties) => {
          const stock = stocks[index];
          if (!stock) return null;
          return (
            <div style={style}>
              <table className="virtual-stock-row" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  <tr>
                    <StockRow stock={stock} />
                  </tr>
                </tbody>
              </table>
            </div>
          );
        }}
      />
      
      {/* 性能统计 */}
      <div className="virtual-table-stats">
        <small>
          显示 {stocks.length} 只股票 | 虚拟滚动已启用 | 每行高度: {rowHeight}px
        </small>
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.stocks === nextProps.stocks &&
    prevProps.height === nextProps.height &&
    prevProps.rowHeight === nextProps.rowHeight &&
    prevProps.width === nextProps.width
  );
});

export default VirtualStockTable;
