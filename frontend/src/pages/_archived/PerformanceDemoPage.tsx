import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { PerformanceProfiler, withPerformanceProfiler } from '../components/Performance/PerformanceProfiler';
import { LazyImage } from '../components/Image/LazyImage';
import { ResponsiveImage } from '../components/Image/ResponsiveImage';
import { LazyComponentWrapper, createLazyComponent } from '../components/Performance/LazyComponentWrapper';
import { PerformanceDashboard, PerformanceToggle } from '../components/Performance/PerformanceDashboard';

// 创建懒加载组件示例
const LazyHeavyChart = createLazyComponent(
  () => import('../components/Performance/HeavyChartDemo'),
  {
    fallback: <div style={{ padding: '20px', textAlign: 'center' }}>📈 加载图表中...</div>,
    errorFallback: <div style={{ padding: '20px', textAlign: 'center', color: '#e53e3e' }}>图表加载失败</div>
  }
);

const LazyComplexTable = createLazyComponent(
  () => import('../components/Performance/ComplexTableDemo'),
  {
    fallback: <div style={{ padding: '20px', textAlign: 'center' }}>📊 加载表格中...</div>
  }
);

// 使用HOC包装的组件
const OptimizedStockCard = withPerformanceProfiler(
  ({ stock }: { stock: { symbol: string; name: string; price: number; change: number } }) => (
    <div style={{
      padding: '16px',
      border: '1px solid #e2e8f0',
      borderRadius: '8px',
      background: 'white',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontWeight: 'bold', fontSize: '16px' }}>{stock.symbol}</div>
          <div style={{ color: '#718096', fontSize: '14px' }}>{stock.name}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontWeight: 'bold', fontSize: '18px' }}>¥{stock.price.toFixed(2)}</div>
          <div style={{
            color: stock.change >= 0 ? '#48bb78' : '#e53e3e',
            fontSize: '14px'
          }}>
            {stock.change >= 0 ? '+' : ''}{stock.change.toFixed(2)}%
          </div>
        </div>
      </div>
    </div>
  ),
  'StockCard'
);

/**
 * 性能演示页面
 * 展示第19轮迭代的所有优化功能
 */
const PerformanceDemoPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'images' | 'components' | 'monitoring'>('images');
  const [imageCount, setImageCount] = useState(10);
  const [showHeavyChart, setShowHeavyChart] = useState(false);
  const [showComplexTable, setShowComplexTable] = useState(false);

  // 模拟股票数据
  const stockData = useMemo(() => {
    const stocks = [];
    for (let i = 0; i < 20; i++) {
      stocks.push({
        symbol: `STOCK${i + 1000}`,
        name: `示例股票 ${i + 1}`,
        price: 10 + Math.random() * 90,
        change: (Math.random() - 0.5) * 10
      });
    }
    return stocks;
  }, []);

  // 模拟图片数据
  const imageData = useMemo(() => {
    const images = [];
    const baseUrl = 'https://picsum.photos';
    
    for (let i = 0; i < imageCount; i++) {
      const width = 400 + Math.floor(Math.random() * 400);
      const height = 300 + Math.floor(Math.random() * 300);
      
      images.push({
        id: i,
        src: `${baseUrl}/${width}/${height}?random=${i}`,
        alt: `示例图片 ${i + 1}`,
        width,
        height
      });
    }
    
    return images;
  }, [imageCount]);

  // 处理标签页切换
  const handleTabChange = useCallback((tab: 'images' | 'components' | 'monitoring') => {
    setActiveTab(tab);
  }, []);

  // 加载更多图片
  const handleLoadMoreImages = useCallback(() => {
    setImageCount(prev => prev + 10);
  }, []);

  return (
    <PerformanceProfiler id="PerformanceDemoPage">
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
        {/* 页面标题 */}
        <header style={{ marginBottom: '32px' }}>
          <h1 style={{ fontSize: '32px', color: '#2d3748', marginBottom: '8px' }}>
            🚀 第19轮迭代 - 性能优化演示
          </h1>
          <p style={{ color: '#718096', fontSize: '16px' }}>
            展示代码分割、性能监控、图片优化等性能优化功能
          </p>
        </header>

        {/* 导航标签 */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #e2e8f0' }}>
            <button
              onClick={() => handleTabChange('images')}
              style={{
                padding: '12px 24px',
                background: activeTab === 'images' ? '#4299e1' : 'transparent',
                color: activeTab === 'images' ? 'white' : '#4a5568',
                border: 'none',
                borderBottom: activeTab === 'images' ? '2px solid #4299e1' : 'none',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 'bold'
              }}
            >
              🖼️ 图片优化
            </button>
            <button
              onClick={() => handleTabChange('components')}
              style={{
                padding: '12px 24px',
                background: activeTab === 'components' ? '#4299e1' : 'transparent',
                color: activeTab === 'components' ? 'white' : '#4a5568',
                border: 'none',
                borderBottom: activeTab === 'components' ? '2px solid #4299e1' : 'none',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 'bold'
              }}
            >
              ⚛️ 组件优化
            </button>
            <button
              onClick={() => handleTabChange('monitoring')}
              style={{
                padding: '12px 24px',
                background: activeTab === 'monitoring' ? '#4299e1' : 'transparent',
                color: activeTab === 'monitoring' ? 'white' : '#4a5568',
                border: 'none',
                borderBottom: activeTab === 'monitoring' ? '2px solid #4299e1' : 'none',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 'bold'
              }}
            >
              📊 性能监控
            </button>
          </div>
        </div>

        {/* 内容区域 */}
        <div style={{ minHeight: '500px' }}>
          {/* 图片优化演示 */}
          {activeTab === 'images' && (
            <PerformanceProfiler id="ImagesDemo">
              <div>
                <div style={{ marginBottom: '24px' }}>
                  <h2 style={{ fontSize: '24px', color: '#2d3748', marginBottom: '16px' }}>
                    🖼️ 图片懒加载 & 响应式图片
                  </h2>
                  <p style={{ color: '#718096', marginBottom: '16px' }}>
                    演示图片懒加载和响应式图片功能。滚动页面查看图片按需加载效果。
                  </p>
                  
                  <div style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
                    <button
                      onClick={handleLoadMoreImages}
                      style={{
                        padding: '8px 16px',
                        background: '#4299e1',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer'
                      }}
                    >
                      加载更多图片 (+10)
                    </button>
                    <div style={{ padding: '8px 16px', background: '#f7fafc', borderRadius: '4px' }}>
                      当前图片数量: {imageCount}
                    </div>
                  </div>
                </div>

                {/* 图片网格 */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                  gap: '24px'
                }}>
                  {imageData.map((image) => (
                    <div key={image.id} style={{
                      background: 'white',
                      borderRadius: '8px',
                      overflow: 'hidden',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                    }}>
                      {/* 使用LazyImage组件 */}
                      <LazyImage
                        src={image.src}
                        alt={image.alt}
                        style={{
                          width: '100%',
                          height: '200px',
                          objectFit: 'cover'
                        }}
                        threshold={0.1}
                        rootMargin="100px"
                      />
                      <div style={{ padding: '16px' }}>
                        <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>
                          {image.alt}
                        </div>
                        <div style={{ color: '#718096', fontSize: '14px' }}>
                          尺寸: {image.width} × {image.height}px
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* 响应式图片示例 */}
                <div style={{ marginTop: '48px' }}>
                  <h3 style={{ fontSize: '20px', color: '#2d3748', marginBottom: '16px' }}>
                    📱 响应式图片示例
                  </h3>
                  <div style={{
                    maxWidth: '800px',
                    margin: '0 auto',
                    background: 'white',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                  }}>
                    <ResponsiveImage
                      src="https://picsum.photos/800/400"
                      alt="响应式图片示例"
                      breakpoints={{
                        sm: "https://picsum.photos/640/320",
                        md: "https://picsum.photos/768/384",
                        lg: "https://picsum.photos/1024/512",
                        xl: "https://picsum.photos/1280/640"
                      }}
                      sizes="(max-width: 640px) 100vw, (max-width: 768px) 80vw, 60vw"
                      aspectRatio="16/9"
                      style={{ width: '100%' }}
                    />
                    <div style={{ padding: '16px', textAlign: 'center' }}>
                      <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>
                        响应式图片演示
                      </div>
                      <div style={{ color: '#718096', fontSize: '14px' }}>
                        根据屏幕尺寸自动加载合适大小的图片
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </PerformanceProfiler>
          )}

          {/* 组件优化演示 */}
          {activeTab === 'components' && (
            <PerformanceProfiler id="ComponentsDemo">
              <div>
                <h2 style={{ fontSize: '24px', color: '#2d3748', marginBottom: '16px' }}>
                  ⚛️ 组件级优化
                </h2>
                <p style={{ color: '#718096', marginBottom: '24px' }}>
                  演示组件级代码分割、性能监控包装、React.memo等优化技术。
                </p>

                {/* 股票卡片网格 */}
                <div style={{ marginBottom: '32px' }}>
                  <h3 style={{ fontSize: '20px', color: '#2d3748', marginBottom: '16px' }}>
                    📈 优化后的股票卡片（使用React.memo + useMemo）
                  </h3>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
                    gap: '16px'
                  }}>
                    {stockData.map((stock, index) => (
                      <OptimizedStockCard key={index} stock={stock} />
                    ))}
                  </div>
                </div>

                {/* 懒加载组件演示 */}
                <div style={{ marginBottom: '32px' }}>
                  <h3 style={{ fontSize: '20px', color: '#2d3748', marginBottom: '16px' }}>
                    🚀 懒加载组件演示
                  </h3>
                  <p style={{ color: '#718096', marginBottom: '16px' }}>
                    点击按钮加载大型组件，体验按需加载效果。
                  </p>
                  
                  <div style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
                    <button
                      onClick={() => setShowHeavyChart(!showHeavyChart)}
                      style={{
                        padding: '12px 24px',
                        background: showHeavyChart ? '#48bb78' : '#4299e1',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontWeight: 'bold'
                      }}
                    >
                      {showHeavyChart ? '隐藏图表' : '加载大型图表组件'}
                    </button>
                    
                    <button
                      onClick={() => setShowComplexTable(!showComplexTable)}
                      style={{
                        padding: '12px 24px',
                        background: showComplexTable ? '#48bb78' : '#4299e1',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontWeight: 'bold'
                      }}
                    >
                      {showComplexTable ? '隐藏表格' : '加载复杂表格组件'}
                    </button>
                  </div>

                  {/* 懒加载组件容器 */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
                    gap: '24px'
                  }}>
                    {showHeavyChart && (
                      <div style={{
                        background: 'white',
                        borderRadius: '8px',
                        padding: '24px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                      }}>
                        <h4 style={{ margin: '0 0 16px 0', color: '#2d3748' }}>
                          大型图表组件（懒加载）
                        </h4>
                        <LazyComponentWrapper
                          fallback={<div style={{ padding: '40px', textAlign: 'center' }}>📈 加载图表中...</div>}
                        >
                          <LazyHeavyChart />
                        </LazyComponentWrapper>
                      </div>
                    )}
                    
                    {showComplexTable && (
                      <div style={{
                        background: 'white',
                        borderRadius: '8px',
                        padding: '24px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                      }}>
                        <h4 style={{ margin: '0 0 16px 0', color: '#2d3748' }}>
                          复杂表格组件（懒加载）
                        </h4>
                        <LazyComponentWrapper
                          fallback={<div style={{ padding: '40px', textAlign: 'center' }}>📊 加载表格中...</div>}
                        >
                          <LazyComplexTable />
                        </LazyComponentWrapper>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </PerformanceProfiler>
          )}

          {/* 性能监控演示 */}
          {activeTab === 'monitoring' && (
            <PerformanceProfiler id="MonitoringDemo">
              <div>
                <h2 style={{ fontSize: '24px', color: '#2d3748', marginBottom: '16px' }}>
                  📊 实时性能监控
                </h2>
                <p style={{ color: '#718096', marginBottom: '24px' }}>
                  演示React Profiler性能监控功能。查看组件渲染时间和性能数据。
                </p>

                {/* 性能监控面板 */}
                <div style={{
                  background: 'white',
                  borderRadius: '8px',
                  padding: '24px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                  marginBottom: '32px'
                }}>
                  <h3 style={{ margin: '0 0 16px 0', color: '#2d3748' }}>
                    性能监控面板
                  </h3>
                  <p style={{ color: '#718096', marginBottom: '16px' }}>
                    实时监控组件渲染性能，识别慢渲染组件。
                  </p>
                  
                  {/* 这里可以放置性能监控面板 */}
                  <div style={{ 
                    border: '1px dashed #e2e8f0', 
                    borderRadius: '8px',
                    padding: '20px',
                    textAlign: 'center',
                    color: '#718096'
                  }}>
                    <div style={{ fontSize: '48px', marginBottom: '16px' }}>📊</div>
                    <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>
                      性能监控面板
                    </div>
                    <div>
                      在页面右下角可以打开完整的性能监控面板
                    </div>
                  </div>
                </div>

                {/* 性能测试组件 */}
                <div style={{
                  background: 'white',
                  borderRadius: '8px',
                  padding: '24px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                }}>
                  <h3 style={{ margin: '0 0 16px 0', color: '#2d3748' }}>
                    ⚡ 性能测试
                  </h3>
                  <p style={{ color: '#718096', marginBottom: '16px' }}>
                    测试不同复杂度组件的渲染性能。
                  </p>
                  
                  <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                    <PerformanceTestComponent complexity="low" />
                    <PerformanceTestComponent complexity="medium" />
                    <PerformanceTestComponent complexity="high" />
                  </div>
                </div>
              </div>
            </PerformanceProfiler>
          )}
        </div>

        {/* 页面底部 */}
        <footer style={{ marginTop: '48px', paddingTop: '24px', borderTop: '1px solid #e2e8f0' }}>
          <div style={{ textAlign: 'center', color: '#718096' }}>
            <p style={{ marginBottom: '8px' }}>
              🚀 第19轮迭代 - 性能优化演示页面
            </p>
            <p style={{ fontSize: '14px' }}>
              展示了代码分割、性能监控、图片优化等核心优化功能
            </p>
          </div>
        </footer>
      </div>

      {/* 全局性能监控组件 */}
      {process.env.NODE_ENV === 'development' && (
        <>
          <PerformanceDashboard />
          <PerformanceToggle />
        </>
      )}
    </PerformanceProfiler>
  );
};

/**
 * 性能测试组件
 */
const PerformanceTestComponent: React.FC<{ complexity: 'low' | 'medium' | 'high' }> = ({ complexity }) => {
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<number[]>([]);

  // 根据复杂度生成不同数量的项目
  const itemCount = {
    low: 10,
    medium: 50,
    high: 200
  }[complexity];

  const color = {
    low: '#48bb78',
    medium: '#ed8936',
    high: '#e53e3e'
  }[complexity];

  const title = {
    low: '低复杂度',
    medium: '中复杂度',
    high: '高复杂度'
  }[complexity];

  // 初始化项目
  useEffect(() => {
    const newItems = Array.from({ length: itemCount }, (_, i) => i);
    setItems(newItems);
  }, [itemCount]);

  // 处理点击
  const handleClick = useCallback(() => {
    setCount(prev => prev + 1);
  }, []);

  // 模拟计算
  const computedValue = useMemo(() => {
    // 模拟一些计算
    let sum = 0;
    for (let i = 0; i < items.length * 100; i++) {
      sum += Math.sin(i) * Math.cos(i);
    }
    return sum;
  }, [items, count]);

  return (
    <div style={{
      flex: 1,
      minWidth: '200px',
      background: 'white',
      border: `2px solid ${color}`,
      borderRadius: '8px',
      padding: '16px'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div style={{ fontWeight: 'bold', color }}>{title}</div>
        <div style={{
          background: color,
          color: 'white',
          padding: '2px 8px',
          borderRadius: '12px',
          fontSize: '12px'
        }}>
          {itemCount}项
        </div>
      </div>
      
      <div style={{ marginBottom: '12px' }}>
        <div style={{ fontSize: '12px', color: '#718096', marginBottom: '4px' }}>点击次数</div>
        <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{count}</div>
      </div>
      
      <div style={{ marginBottom: '16px' }}>
        <div style={{ fontSize: '12px', color: '#718096', marginBottom: '4px' }}>计算值</div>
        <div style={{ fontSize: '14px', fontFamily: 'monospace' }}>
          {computedValue.toFixed(4)}
        </div>
      </div>
      
      <button
        onClick={handleClick}
        style={{
          width: '100%',
          padding: '8px 16px',
          background: color,
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '14px'
        }}
      >
        触发渲染
      </button>
      
      <div style={{ marginTop: '12px', fontSize: '11px', color: '#a0aec0' }}>
        组件ID: Test-{complexity}
      </div>
    </div>
  );
};

export default PerformanceDemoPage;