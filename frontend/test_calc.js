// 手动实现calculateVisibleRange逻辑
function calculateVisibleRange(scrollTop, containerHeight, itemHeight, totalCount, overscan = 5) {
  const getH = typeof itemHeight === 'function' ? itemHeight : () => itemHeight;
  
  // 使用二分查找优化起始索引查找
  let startIndex = 0;
  let low = 0;
  let high = totalCount - 1;
  
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    let accumulated = 0;
    for (let i = 0; i <= mid; i++) {
      accumulated += getH(i);
    }
    
    if (accumulated - getH(mid) <= scrollTop) {
      startIndex = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  startIndex = Math.max(0, startIndex - overscan);

  // 计算结束索引
  let endIndex = startIndex;
  let visibleHeight = 0;
  for (let i = startIndex; i < totalCount; i++) {
    visibleHeight += getH(i);
    endIndex = i;
    if (visibleHeight >= containerHeight + overscan * getH(i)) break;
  }

  endIndex = Math.min(totalCount - 1, endIndex + overscan);

  return { startIndex, endIndex };
}

// 测试参数
const scrollTop = 400;
const containerHeight = 400;
const itemHeight = 40;
const totalCount = 1000;
const overscan = 2;

const result = calculateVisibleRange(scrollTop, containerHeight, itemHeight, totalCount, overscan);
console.log('Result:', result);
console.log('Expected startIndex: 8');
console.log('Expected endIndex: 23 (测试期望值)');
console.log('Actual endIndex:', result.endIndex);
console.log('Difference:', 23 - result.endIndex);
