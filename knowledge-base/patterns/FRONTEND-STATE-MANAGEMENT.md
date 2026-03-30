# 前端状态管理模式

## Zustand 最佳实践

### 持久化
```typescript
import { persist, createJSONStorage } from 'zustand/middleware';

const useStore = create(
  persist(
    (set) => ({
      // 持久化字段
      preferences: { theme: 'light' },
      setTheme: (theme) => set(s => ({
        preferences: { ...s.preferences, theme }
      })),
    }),
    {
      name: 'app-store',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        preferences: state.preferences, // 只持久化偏好
      }),
    }
  )
);
```

### URL 状态同步
- `syncFromURL(params)` - 页面加载时从 URL 恢复状态
- `toURLParams()` - 状态变更时更新 URL
- 适用场景：筛选条件、分页、排序
- 使用 `useEffect` + `useSearchParams` 双向绑定

### 订阅选择器
```typescript
// ✅ 精确选择，避免不必要的重渲染
const theme = useStore(s => s.preferences.theme);

// ❌ 选取整个对象，每次都会重渲染
const preferences = useStore(s => s.preferences);
```

### 系统偏好检测
```typescript
export function useResolvedTheme(): 'light' | 'dark' {
  const { theme } = useStore(s => s.preferences);
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark' : 'light';
  }
  return theme;
}
```

## 参考
- 富途的状态管理架构
- Zustand 官方文档
- Redux Toolkit 模式
