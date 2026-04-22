# React组件性能优化建议

## 1. 股票列表组件优化 (StockListPage.tsx)

### 当前问题：
1. **缺少虚拟滚动**：一次性渲染所有股票数据，DOM节点过多
2. **缺少React.memo**：列表项组件没有记忆化
3. **排序/过滤计算频繁**：每次渲染都重新计算
4. **缺少useMemo**：过滤和排序结果没有缓存

### 优化建议：

#### 1.1 添加虚拟滚动
```tsx
import { FixedSizeList as List } from 'react-window';

const Row = ({ index, style }: { index: number; style: React.CSSProperties }) => {
  const stock = filteredStocks[index];
  return (
    <div style={style}>
      {/* 渲染单个股票行 */}
    </div>
  );
};

// 在渲染中使用
<List
  height={600}
  itemCount={filteredStocks.length}
  itemSize={50}
  width="100%"
>
  {Row}
</List>
```

#### 1.2 使用React.memo包装列表项
```tsx
const StockRow = React.memo(({ stock }: { stock: Stock }) => {
  // 渲染逻辑
}, (prevProps, nextProps) => {
  // 自定义比较函数
  return prevProps.stock.symbol === nextProps.stock.symbol &&
         prevProps.stock.price === nextProps.stock.price;
});
```

#### 1.3 使用useMemo缓存计算结果
```tsx
const sortedAndFilteredStocks = useMemo(() => {
  let result = [...stocks];
  
  // 过滤
  if (searchTerm.trim()) {
    result = result.filter(stock =>
      stock.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
      stock.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }
  
  // 排序
  result.sort((a, b) => {
    const aVal = a[sortBy];
    const bVal = b[sortBy];
    const multiplier = sortOrder === 'asc' ? 1 : -1;
    return (aVal > bVal ? 1 : -1) * multiplier;
  });
  
  return result;
}, [stocks, searchTerm, sortBy, sortOrder]);
```

## 2. 图表组件优化

### 潜在问题：
1. **ECharts实例创建开销大**
2. **频繁的数据更新导致重渲染**
3. **缺少防抖/节流**

### 优化建议：

#### 2.1 使用useMemo缓存ECharts配置
```tsx
const chartOptions = useMemo(() => ({
  // ECharts配置
}), [data, theme]);

const chartInstance = useRef<echarts.ECharts | null>(null);

useEffect(() => {
  if (chartInstance.current) {
    chartInstance.current.setOption(chartOptions);
  }
}, [chartOptions]);
```

#### 2.2 使用防抖处理数据更新
```tsx
const updateChartData = useCallback(
  debounce((newData: ChartData[]) => {
    setChartData(newData);
  }, 300),
  []
);
```

## 3. 通用性能优化模式

### 3.1 使用React.memo包装纯展示组件
```tsx
const PureComponent = React.memo(({ data }: Props) => {
  return <div>{/* 渲染逻辑 */}</div>;
});
```

### 3.2 使用useCallback避免函数重新创建
```tsx
const handleClick = useCallback(() => {
  // 处理点击
}, [dependency1, dependency2]);
```

### 3.3 使用useMemo缓存昂贵计算
```tsx
const expensiveResult = useMemo(() => {
  return computeExpensiveValue(a, b);
}, [a, b]);
```

### 3.4 使用useTransition处理非紧急更新
```tsx
const [isPending, startTransition] = useTransition();
const [filter, setFilter] = useState('');

const handleFilterChange = (value: string) => {
  startTransition(() => {
    setFilter(value);
  });
};
```

## 4. 性能监控集成

### 4.1 添加React Profiler
```tsx
import { Profiler } from 'react';

const onRender = (
  id: string,
  phase: 'mount' | 'update',
  actualDuration: number,
  baseDuration: number,
  startTime: number,
  commitTime: number
) => {
  // 记录性能数据
  console.log(`${id} ${phase} took ${actualDuration}ms`);
};

<Profiler id="StockList" onRender={onRender}>
  <StockListPage />
</Profiler>
```

### 4.2 添加性能边界
```tsx
const PerformanceBoundary: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [slow, setSlow] = useState(false);
  
  useEffect(() => {
    const timer = setTimeout(() => {
      setSlow(true);
    }, 1000); // 如果渲染超过1秒，标记为慢
    
    return () => clearTimeout(timer);
  }, []);
  
  if (slow) {
    console.warn('组件渲染过慢');
  }
  
  return <>{children}</>;
};
```

## 5. 代码分割优化

### 5.1 组件级代码分割
```tsx
const HeavyChart = React.lazy(() => import('./HeavyChart'));

<Suspense fallback={<LoadingSpinner />}>
  <HeavyChart data={data} />
</Suspense>
```

### 5.2 预加载策略
```tsx
// 鼠标悬停时预加载
const handleMouseEnter = () => {
  import('./HeavyChart');
};

<div onMouseEnter={handleMouseEnter}>
  {/* 导航项 */}
</div>
```

## 6. 内存优化

### 6.1 清理副作用
```tsx
useEffect(() => {
  const subscription = dataStream.subscribe();
  
  return () => {
    subscription.unsubscribe(); // 清理订阅
  };
}, []);
```

### 6.2 避免内存泄漏
```tsx
const [data, setData] = useState<Data[]>([]);

useEffect(() => {
  let mounted = true;
  
  fetchData().then(result => {
    if (mounted) {
      setData(result);
    }
  });
  
  return () => {
    mounted = false; // 组件卸载时取消更新
  };
}, []);
```

## 实施计划

### 第一阶段（立即）：
1. 为StockListPage添加useMemo缓存
2. 添加React.memo包装列表项
3. 修复所有useCallback依赖项

### 第二阶段（短期）：
1. 实现虚拟滚动
2. 添加React Profiler监控
3. 优化图表组件

### 第三阶段（长期）：
1. 全面代码分割
2. 建立性能预算
3. 自动化性能测试