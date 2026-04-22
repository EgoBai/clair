// 测试calculateVisibleRange的二分查找逻辑
function calculateVisibleRangeTest(scrollTop, containerHeight, itemHeight, totalCount, overscan = 5) {
  const getH = typeof itemHeight === 'function' ? itemHeight : () => itemHeight;

  let startIndex = 0;
  let low = 0;
  let high = totalCount - 1;
  
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    let accumulated = 0;
    for (let i = 0; i <= mid; i++) {
      accumulated += getH(i);
    }
    
    console.log(`mid=${mid}, accumulated=${accumulated}, accumulated-getH(mid)=${accumulated - getH(mid)}, scrollTop=${scrollTop}`);
    
    if (accumulated - getH(mid) <= scrollTop) {
      startIndex = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return Math.max(0, startIndex - overscan);
}

// 测试场景：每个item高度40，scrollTop=100
// 前2个item高度=80，前3个item高度=120
// 所以scrollTop=100应该在item 2和item 3之间
const result = calculateVisibleRangeTest(100, 400, 40, 1000, 2);
console.log("Result startIndex (before overscan):", result);
