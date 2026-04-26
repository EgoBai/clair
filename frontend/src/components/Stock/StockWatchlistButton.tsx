import React from 'react';
import { useStockStore, useStockActions } from '../../store/useStockStore';

interface StockWatchlistButtonProps {
  symbol: string;
  size?: 'small' | 'medium' | 'large';
  showLabel?: boolean;
}

const StockWatchlistButton: React.FC<StockWatchlistButtonProps> = React.memo(({
  symbol,
  size = 'medium',
  showLabel = false,
}) => {
  const isInWatchlist = useStockStore((state) => state.watchlist.includes(symbol));
  const { toggleWatchlist } = useStockActions();
  
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleWatchlist(symbol);
  };
  
  // 尺寸样式
  const sizeStyles = {
    small: {
      button: '12px',
      icon: '14px',
      text: '12px',
    },
    medium: {
      button: '16px',
      icon: '18px',
      text: '14px',
    },
    large: {
      button: '20px',
      icon: '22px',
      text: '16px',
    },
  };
  
  const currentSize = sizeStyles[size];
  
  return (
    <button
      className={`watchlist-button ${isInWatchlist ? 'in-watchlist' : ''}`}
      onClick={handleClick}
      title={isInWatchlist ? '从自选股移除' : '添加到自选股'}
    >
      <span className="watchlist-icon">
        {isInWatchlist ? '⭐' : '☆'}
      </span>
      {showLabel && (
        <span className="watchlist-label">
          {isInWatchlist ? '已关注' : '关注'}
        </span>
      )}
      
      <style>{`
        .watchlist-button {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: ${currentSize.button};
          background: ${isInWatchlist ? 'rgba(255, 215, 0, 0.1)' : '#f5f5f5'};
          border: 1px solid ${isInWatchlist ? '#ffd700' : '#ddd'};
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s ease;
          color: ${isInWatchlist ? '#ff9800' : '#666'};
          font-size: ${currentSize.text};
        }
        
        .watchlist-button:hover {
          background: ${isInWatchlist ? 'rgba(255, 215, 0, 0.2)' : '#e0e0e0'};
          border-color: ${isInWatchlist ? '#ff9800' : '#999'};
          transform: translateY(-1px);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }
        
        .watchlist-button:active {
          transform: translateY(0);
        }
        
        .watchlist-icon {
          font-size: ${currentSize.icon};
          line-height: 1;
        }
        
        .watchlist-label {
          font-weight: 500;
        }
        
        .watchlist-button.in-watchlist .watchlist-icon {
          animation: star-pulse 0.5s ease;
        }
        
        @keyframes star-pulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.2); }
          100% { transform: scale(1); }
        }
      `}</style>
    </button>
  );
});

export default StockWatchlistButton;