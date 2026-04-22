import React from 'react';

interface StatCardProps {
  icon: string;
  value: string | number;
  label: string;
  className?: string;
}

// 使用React.memo包装统计卡片组件
const StatCard: React.FC<StatCardProps> = React.memo(({ 
  icon, 
  value, 
  label, 
  className = '' 
}) => {
  // removed: console.log
  
  return (
    <div className={`stat-card ${className}`}>
      <div className="stat-icon">{icon}</div>
      <div className="stat-content">
        <div className="stat-value">{value}</div>
        <div className="stat-label">{label}</div>
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  // 只有当值、标签或图标发生变化时才重新渲染
  return (
    prevProps.value === nextProps.value &&
    prevProps.label === nextProps.label &&
    prevProps.icon === nextProps.icon &&
    prevProps.className === nextProps.className
  );
});

export default StatCard;