/**
 * 自选股切换按钮
 * 一键添加/移除自选，带动画
 */

import React, { useState, useCallback } from 'react';
import { Button, message, Tooltip } from 'antd';
import { StarFilled, StarOutlined } from '@ant-design/icons';
import { useWatchlistStore } from '../../hooks/useWatchlistStore';

interface WatchlistToggleProps {
  symbol: string;
  name: string;
  market?: string;
  industry?: string;
  size?: 'small' | 'middle' | 'large';
  showText?: boolean;
}

export default function WatchlistToggle({
  symbol,
  name,
  market,
  industry,
  size = 'small',
  showText = false,
}: WatchlistToggleProps) {
  const { has, toggle } = useWatchlistStore();
  const isActive = has(symbol);
  const [animating, setAnimating] = useState(false);

  const handleToggle = useCallback(() => {
    const added = toggle({ symbol, name, market, industry });
    setAnimating(true);
    setTimeout(() => setAnimating(false), 300);

    if (added) {
      message.success(`已添加 ${name} 到自选股`);
    } else {
      message.info(`已从自选股移除 ${name}`);
    }
  }, [symbol, name, market, industry, toggle]);

  return (
    <Tooltip title={isActive ? '移除自选' : '添加自选'}>
      <Button
        type={isActive ? 'primary' : 'default'}
        size={size}
        icon={isActive ? <StarFilled /> : <StarOutlined />}
        onClick={handleToggle}
        style={{
          transition: 'transform 0.3s',
          transform: animating ? 'scale(1.2)' : 'scale(1)',
        }}
      >
        {showText && (isActive ? '已自选' : '加自选')}
      </Button>
    </Tooltip>
  );
}
