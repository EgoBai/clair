import React, { useState, useEffect, useMemo } from 'react';

/**
 * 模拟大型图表组件
 * 用于演示懒加载效果
 */
const HeavyChartDemo: React.FC = () => {
  const [data, setData] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);

  // 模拟数据加载
  useEffect(() => {
    const timer = setTimeout(() => {
      const newData = Array.from({ length: 1000 }, (_, i) => 
        Math.sin(i * 0.1) * 50 + Math.cos(i * 0.05) * 30 + Math.random() * 20
      );
      setData(newData);
      setLoading(false);
    }, 800); // 模拟加载延迟

    return () => clearTimeout(timer);
  }, []);

  // 计算图表数据
  const chartData = useMemo(() => {
    if (data.length === 0) return [];
    
    // 简化处理，实际项目中会使用ECharts等图表库
    return data.map((value, index) => ({
      x: index,
      y: value,
      color: value > 0 ? '#48bb78' : '#e53e3e'
    }));
  }, [data]);

  // 计算统计信息
  const stats = useMemo(() => {
    if (data.length === 0) return null;
    
    const max = Math.max(...data);
    const min = Math.min(...data);
    const avg = data.reduce((sum, val) => sum + val, 0) / data.length;
    const positiveCount = data.filter(val => val > 0).length;
    
    return { max, min, avg, positiveCount, total: data.length };
  }, [data]);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '40px' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>📈</div>
        <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>加载图表数据中...</div>
        <div style={{ color: '#718096' }}>模拟大型图表组件加载</div>
      </div>
    );
  }

  return (
    <div>
      {/* 图表标题 */}
      <div style={{ marginBottom: '24px' }}>
        <h3 style={{ margin: '0 0 8px 0', color: '#2d3748' }}>大型股票走势图表</h3>
        <p style={{ margin: 0, color: '#718096', fontSize: '14px' }}>
          模拟包含1000个数据点的大型图表组件
        </p>
      </div>

      {/* 统计信息 */}
      {stats && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: '12px',
          marginBottom: '24px'
        }}>
          <StatCard 
            title="最高值" 
            value={stats.max.toFixed(2)} 
            color="#48bb78"
            icon="📈"
          />
          <StatCard 
            title="最低值" 
            value={stats.min.toFixed(2)} 
            color="#e53e3e"
            icon="📉"
          />
          <StatCard 
            title="平均值" 
            value={stats.avg.toFixed(2)} 
            color="#4299e1"
            icon="📊"
          />
          <StatCard 
            title="正数比例" 
            value={`${((stats.positiveCount / stats.total) * 100).toFixed(1)}%`}
            color="#9f7aea"
            icon="✅"
          />
        </div>
      )}

      {/* 模拟图表 */}
      <div style={{
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        borderRadius: '12px',
        padding: '24px',
        marginBottom: '24px',
        position: 'relative',
        overflow: 'hidden'
      }}>
        <div style={{
          height: '200px',
          position: 'relative',
          marginBottom: '16px'
        }}>
          {/* 模拟图表线 */}
          <svg width="100%" height="100%" style={{ overflow: 'visible' }}>
            <defs>
              <linearGradient id="chartGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="rgba(255,255,255,0.3)" />
                <stop offset="100%" stopColor="rgba(255,255,255,0.1)" />
              </linearGradient>
            </defs>
            
            {/* 图表区域 */}
            <path
              d={chartData.map((point, i) => 
                `${i === 0 ? 'M' : 'L'} ${(i / chartData.length * 100)}% ${50 - point.y / 2}%`
              ).join(' ')}
              stroke="white"
              strokeWidth="2"
              fill="none"
            />
            
            {/* 填充区域 */}
            <path
              d={`
                ${chartData.map((point, i) => 
                  `L ${(i / chartData.length * 100)}% ${50 - point.y / 2}%`
                ).join(' ')}
                L 100% 100%
                L 0% 100%
                Z
              `}
              fill="url(#chartGradient)"
              stroke="none"
            />
            
            {/* 数据点 */}
            {chartData.filter((_, i) => i % 50 === 0).map((point, i) => (
              <circle
                key={i}
                cx={`${(i * 50 / chartData.length * 100)}%`}
                cy={`${50 - point.y / 2}%`}
                r="3"
                fill="white"
                stroke="#764ba2"
                strokeWidth="1"
              />
            ))}
          </svg>
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'white' }}>
          <div style={{ fontSize: '12px', opacity: 0.8 }}>时间</div>
          <div style={{ fontSize: '12px', opacity: 0.8 }}>数值</div>
        </div>
      </div>

      {/* 数据表格预览 */}
      <div style={{
        background: '#f7fafc',
        borderRadius: '8px',
        padding: '16px',
        marginBottom: '24px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <div style={{ fontWeight: 'bold', color: '#2d3748' }}>数据预览</div>
          <div style={{ fontSize: '12px', color: '#718096' }}>显示前10条数据</div>
        </div>
        
        <div style={{
          maxHeight: '200px',
          overflowY: 'auto',
          background: 'white',
          borderRadius: '4px',
          border: '1px solid #e2e8f0'
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ background: '#edf2f7' }}>
                <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>序号</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>数值</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>状态</th>
              </tr>
            </thead>
            <tbody>
              {chartData.slice(0, 10).map((point, index) => (
                <tr key={index} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '8px 12px' }}>{index + 1}</td>
                  <td style={{ padding: '8px 12px', fontFamily: 'monospace' }}>
                    {point.y.toFixed(2)}
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    <span style={{
                      display: 'inline-block',
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: point.color,
                      marginRight: '6px'
                    }} />
                    {point.y > 0 ? '上涨' : '下跌'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 组件信息 */}
      <div style={{
        background: '#fff5f5',
        borderRadius: '8px',
        padding: '16px',
        border: '1px solid #fed7d7'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
          <div style={{ fontSize: '20px', marginRight: '8px' }}>💡</div>
          <div style={{ fontWeight: 'bold', color: '#c53030' }}>组件信息</div>
        </div>
        <div style={{ fontSize: '14px', color: '#718096' }}>
          <p style={{ margin: '0 0 8px 0' }}>
            这是一个模拟的大型图表组件，用于演示懒加载功能。
          </p>
          <ul style={{ margin: 0, paddingLeft: '20px' }}>
            <li>包含1000个数据点的计算和渲染</li>
            <li>使用useMemo优化计算性能</li>
            <li>模拟了800ms的加载延迟</li>
            <li>通过React.lazy()实现按需加载</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

/**
 * 统计卡片组件
 */
const StatCard: React.FC<{
  title: string;
  value: string;
  color: string;
  icon: string;
}> = ({ title, value, color, icon }) => {
  return (
    <div style={{
      background: 'white',
      borderRadius: '8px',
      padding: '16px',
      border: `1px solid ${color}20`,
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
        <div style={{ fontSize: '20px', marginRight: '8px' }}>{icon}</div>
        <div style={{ fontSize: '12px', color: '#718096' }}>{title}</div>
      </div>
      <div style={{ fontSize: '24px', fontWeight: 'bold', color }}>{value}</div>
    </div>
  );
};

export default HeavyChartDemo;