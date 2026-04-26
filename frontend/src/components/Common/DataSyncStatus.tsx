import React from 'react';

interface DataSyncStatusProps {
  compact?: boolean;
  className?: string;
}

export const DataSyncStatus: React.FC<DataSyncStatusProps> = React.memo(({ compact, className }) => {
  return (
    <div className={className} data-testid="sync-status">
      {compact ? '🔄' : '数据已同步'}
    </div>
  );
});

export default DataSyncStatus;
