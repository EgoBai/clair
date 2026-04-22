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
    
    if (accumulated - getH(mid) <= scrollTop) {
      startIndex = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return startIndex;
}

// 测试场景：每个item高度40，scrollTop=400
// 前10个item高度=400
// 所以scrollTop=400应该在item 10开始
const result = calculateVisibleRangeTest(400, 400, 40, 1000, 2);
console.log("Result startIndex (before overscan):", result);
console.log("Expected: 10 (因为前10个item高度=400)");
