import React from 'react';
import { Link } from 'react-router-dom';
import { ROUTE_PATHS } from '../routes';

interface Stock {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: string;
  marketCap: string;
}

interface StockRowProps {
  stock: Stock;
}

// 使用React.memo包装组件，避免不必要的重新渲染
const StockRow: React.FC<StockRowProps> = React.memo(({ stock }) => {
  // removed: console.log
  
  return (
    <tr>
      <td className="stock-symbol">
        <Link to={`${ROUTE_PATHS.STOCKS}/${stock.symbol}`}>
          {stock.symbol}
        </Link>
      </td>
      <td className="stock-name">{stock.name}</td>
      <td className="stock-price">¥{stock.price.toFixed(2)}</td>
      <td className={`stock-change ${stock.changePercent >= 0 ? 'positive' : 'negative'}`}>
        {stock.changePercent >= 0 ? '+' : ''}{stock.changePercent.toFixed(2)}%
      </td>
      <td className="stock-volume">{stock.volume}</td>
      <td className="stock-market-cap">{stock.marketCap}</td>
      <td className="stock-actions">
        <Link 
          to={`${ROUTE_PATHS.STOCKS}/${stock.symbol}`}
          className="view-btn"
        >
          查看详情
        </Link>
        <button className="watch-btn">⭐</button>
      </td>
    </tr>
  );
}, (prevProps, nextProps) => {
  // 自定义比较函数，只有当股票数据发生变化时才重新渲染
  return (
    prevProps.stock.symbol === nextProps.stock.symbol &&
    prevProps.stock.price === nextProps.stock.price &&
    prevProps.stock.changePercent === nextProps.stock.changePercent &&
    prevProps.stock.volume === nextProps.stock.volume &&
    prevProps.stock.marketCap === nextProps.stock.marketCap
  );
});

export default StockRow;