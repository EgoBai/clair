/**
 * WalkForwardOptimizationEngine - 滚动窗口优化引擎
 * 训练集/测试集滑动窗口，避免过拟合
 */

export interface WindowConfig { trainSize: number; testSize: number; stepSize: number; }

export function generateWindows(totalLen: number, config: WindowConfig): Array<{trainStart: number; trainEnd: number; testStart: number; testEnd: number}> {
  const windows = [];
  let start = 0;
  while (start + config.trainSize + config.testSize <= totalLen) {
    windows.push({
      trainStart: start,
      trainEnd: start + config.trainSize,
      testStart: start + config.trainSize,
      testEnd: start + config.trainSize + config.testSize,
    });
    start += config.stepSize;
  }
  return windows;
}

export function walkForwardScore(performance: number[], config: WindowConfig): number {
  const windows = generateWindows(performance.length, config);
  if (windows.length === 0) return 0;
  const testReturns = windows.map(w => {
    const slice = performance.slice(w.testStart, w.testEnd);
    return slice.reduce((a, b) => a + b, 0) / (slice.length || 1);
  });
  return testReturns.reduce((a, b) => a + b, 0) / testReturns.length;
}

export function efficiencyRatio(trainPerf: number[], testPerf: number[]): number {
  const trainAvg = trainPerf.reduce((a, b) => a + b, 0) / (trainPerf.length || 1);
  const testAvg = testPerf.reduce((a, b) => a + b, 0) / (testPerf.length || 1);
  if (trainAvg === 0) return testAvg === 0 ? 1 : 0;
  return testAvg / trainAvg;
}
