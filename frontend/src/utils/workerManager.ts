/**
 * Web Worker 管理器
 * 卸载主线程的重计算任务到 Worker 线程
 * 支持：K线计算 / 排序 / 筛选 / 回测
 */

export interface WorkerTask<T = any, R = any> {
  id: string;
  type: string;
  payload: T;
  resolve: (result: R) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

export interface WorkerPoolOptions {
  maxWorkers?: number;
  taskTimeout?: number;
}

type WorkerMessageType = 'compute-kline' | 'sort' | 'filter' | 'backtest-sim' | 'indicator-batch' | 'correlation-matrix';

// Worker 内联代码（避免外部文件依赖）
const WORKER_CODE = `
self.onmessage = function(e) {
  const { id, type, payload } = e.data;
  try {
    let result;
    switch (type) {
      case 'sort':
        result = handleSort(payload);
        break;
      case 'filter':
        result = handleFilter(payload);
        break;
      case 'compute-kline':
        result = computeKLine(payload);
        break;
      case 'indicator-batch':
        result = computeBatchIndicators(payload);
        break;
      case 'backtest-sim':
        result = runBacktestSim(payload);
        break;
      case 'correlation-matrix':
        result = computeCorrelationMatrix(payload);
        break;
      default:
        throw new Error('Unknown task type: ' + type);
    }
    self.postMessage({ id, result });
  } catch (err) {
    self.postMessage({ id, error: err.message });
  }
};

function handleSort({ data, key, order }) {
  const arr = [...data];
  arr.sort((a, b) => {
    const va = typeof key === 'function' ? key(a) : a[key];
    const vb = typeof key === 'function' ? key(b) : b[key];
    if (va === null && vb === null) return 0;
    if (va === null) return 1;
    if (vb === null) return -1;
    const cmp = typeof va === 'string' ? va.localeCompare(vb) : va - vb;
    return order === 'desc' ? -cmp : cmp;
  });
  return arr;
}

function handleFilter({ data, predicate }) {
  // 简单谓词过滤
  if (typeof predicate === 'object') {
    return data.filter(item => {
      for (const [key, condition] of Object.entries(predicate)) {
        const val = item[key];
        if (condition && typeof condition === 'object') {
          if ('gte' in condition && val < condition.gte) return false;
          if ('lte' in condition && val > condition.lte) return false;
          if ('eq' in condition && val !== condition.eq) return false;
          if ('contains' in condition && !String(val).includes(condition.contains)) return false;
        }
      }
      return true;
    });
  }
  return data;
}

function computeKLine({ ohlcv }) {
  return ohlcv.map((d, i) => ({
    ...d,
    bodyTop: Math.max(d.open, d.close),
    bodyBottom: Math.min(d.open, d.close),
    isUp: d.close >= d.open,
    bodyHeight: Math.abs(d.close - d.open),
    upperShadow: d.high - Math.max(d.open, d.close),
    lowerShadow: Math.min(d.open, d.close) - d.low,
    range: d.high - d.low,
    midPrice: (d.high + d.low) / 2,
  }));
}

function computeBatchIndicators({ prices, period = 14 }) {
  const result = { sma: [], ema: [], rsi: [], macd: [] };
  const n = prices.length;

  // SMA
  for (let i = period - 1; i < n; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += prices[j];
    result.sma.push({ index: i, value: sum / period });
  }

  // EMA
  const k = 2 / (period + 1);
  let ema = prices[0];
  for (let i = 0; i < n; i++) {
    ema = i === 0 ? prices[0] : prices[i] * k + ema * (1 - k);
    result.ema.push({ index: i, value: ema });
  }

  // RSI
  if (n > period) {
    let gainSum = 0, lossSum = 0;
    for (let i = 1; i <= period; i++) {
      const diff = prices[i] - prices[i - 1];
      if (diff > 0) gainSum += diff; else lossSum -= diff;
    }
    let avgGain = gainSum / period;
    let avgLoss = lossSum / period;
    for (let i = period; i < n; i++) {
      if (i > period) {
        const diff = prices[i] - prices[i - 1];
        avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
        avgLoss = (avgLoss * (period - 1) + (diff < 0 ? -diff : 0)) / period;
      }
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      result.rsi.push({ index: i, value: avgLoss === 0 ? 100 : 100 - 100 / (1 + rs) });
    }
  }

  // MACD (12, 26, 9)
  const ema12Arr = [], ema26Arr = [];
  let e12 = prices[0], e26 = prices[0];
  const k12 = 2 / 13, k26 = 2 / 27, k9 = 2 / 10;
  for (let i = 0; i < n; i++) {
    e12 = i === 0 ? prices[0] : prices[i] * k12 + e12 * (1 - k12);
    e26 = i === 0 ? prices[0] : prices[i] * k26 + e26 * (1 - k26);
    ema12Arr.push(e12);
    ema26Arr.push(e26);
  }
  let signal = 0;
  for (let i = 0; i < n; i++) {
    const macdLine = ema12Arr[i] - ema26Arr[i];
    signal = i === 0 ? macdLine : macdLine * k9 + signal * (1 - k9);
    result.macd.push({ index: i, macd: macdLine, signal, histogram: macdLine - signal });
  }

  return result;
}

function runBacktestSim({ prices, strategy, initialCapital = 100000 }) {
  let capital = initialCapital;
  let shares = 0;
  let trades = [];
  let peak = initialCapital;
  let maxDrawdown = 0;

  for (let i = 0; i < prices.length; i++) {
    const price = prices[i];
    const signal = strategy(price, i, prices);

    if (signal === 'buy' && capital > price) {
      const qty = Math.floor(capital / price);
      capital -= qty * price;
      shares += qty;
      trades.push({ type: 'buy', index: i, price, qty });
    } else if (signal === 'sell' && shares > 0) {
      capital += shares * price;
      trades.push({ type: 'sell', index: i, price, qty: shares });
      shares = 0;
    }

    const totalValue = capital + shares * price;
    if (totalValue > peak) peak = totalValue;
    const drawdown = (peak - totalValue) / peak;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }

  const finalValue = capital + shares * prices[prices.length - 1];
  return {
    initialCapital,
    finalValue,
    totalReturn: ((finalValue - initialCapital) / initialCapital) * 100,
    maxDrawdown: maxDrawdown * 100,
    tradeCount: trades.length,
    trades,
  };
}

function computeCorrelationMatrix({ stockReturns }) {
  const n = stockReturns.length;
  const matrix = Array.from({ length: n }, () => Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    matrix[i][i] = 1;
    for (let j = i + 1; j < n; j++) {
      const corr = pearsonCorrelation(stockReturns[i], stockReturns[j]);
      matrix[i][j] = corr;
      matrix[j][i] = corr;
    }
  }
  return matrix;
}

function pearsonCorrelation(x, y) {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;
  let sx = 0, sy = 0, sxy = 0, sx2 = 0, sy2 = 0;
  for (let i = 0; i < n; i++) {
    sx += x[i]; sy += y[i];
    sxy += x[i] * y[i];
    sx2 += x[i] * x[i]; sy2 += y[i] * y[i];
  }
  const num = n * sxy - sx * sy;
  const den = Math.sqrt((n * sx2 - sx * sx) * (n * sy2 - sy * sy));
  return den === 0 ? 0 : num / den;
}
`;

// ==================== Worker Pool ====================

class WorkerPool {
  private workers: Worker[] = [];
  private idleWorkers: Worker[] = [];
  private tasks: Map<string, WorkerTask> = new Map();
  private queue: Array<{ type: WorkerMessageType; payload: unknown; resolve: Function; reject: Function }> = [];
  private maxWorkers: number;
  private taskTimeout: number;
  private workerUrl: string | null = null;

  constructor(options: WorkerPoolOptions = {}) {
    this.maxWorkers = options.maxWorkers ?? Math.min(navigator.hardwareConcurrency || 4, 8);
    this.taskTimeout = options.taskTimeout ?? 30000;
  }

  private createWorker(): Worker {
    const blob = new Blob([WORKER_CODE], { type: 'application/javascript' });
    this.workerUrl = this.workerUrl || URL.createObjectURL(blob);
    const worker = new Worker(this.workerUrl);

    worker.onmessage = (e) => {
      const { id, result, error } = e.data;
      const task = this.tasks.get(id);
      if (!task) return;

      clearTimeout(task.timeout);
      this.tasks.delete(id);

      if (error) {
        task.reject(new Error(error));
      } else {
        task.resolve(result);
      }

      this.idleWorkers.push(worker);
      this.processQueue();
    };

    worker.onerror = (_err) => {
      // Worker 异常，重建
      const idx = this.workers.indexOf(worker);
      if (idx >= 0) this.workers.splice(idx, 1);
      const idleIdx = this.idleWorkers.indexOf(worker);
      if (idleIdx >= 0) this.idleWorkers.splice(idleIdx, 1);
      worker.terminate();
    };

    this.workers.push(worker);
    return worker;
  }

  private getWorker(): Worker | null {
    if (this.idleWorkers.length > 0) {
      return this.idleWorkers.pop()!;
    }
    if (this.workers.length < this.maxWorkers) {
      return this.createWorker();
    }
    return null;
  }

  private processQueue(): void {
    while (this.queue.length > 0) {
      const worker = this.getWorker();
      if (!worker) break;

      const task = this.queue.shift()!;
      this.executeOn(worker, task.type, task.payload)
        .then((result: unknown) => task.resolve(result))
        .catch((error: Error) => task.reject(error));
    }
  }

  private executeOn<T, R>(worker: Worker, type: WorkerMessageType, payload: T): Promise<R> {
    return new Promise<R>((resolve, reject) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

      const timeout = setTimeout(() => {
        this.tasks.delete(id);
        reject(new Error(`Worker task "${type}" timed out after ${this.taskTimeout}ms`));
      }, this.taskTimeout);

      this.tasks.set(id, { id, type, payload, resolve, reject, timeout });
      worker.postMessage({ id, type, payload });
    });
  }

  /** 提交任务到 Worker Pool */
  async submit<T, R>(type: WorkerMessageType, payload: T): Promise<R> {
    const worker = this.getWorker();
    if (worker) {
      return this.executeOn<T, R>(worker, type, payload);
    }
    // 队列等待
    return new Promise<R>((resolve, reject) => {
      this.queue.push({ type, payload, resolve, reject });
    });
  }

  /** 终止所有 Worker */
  terminate(): void {
    this.workers.forEach(w => w.terminate());
    this.workers = [];
    this.idleWorkers = [];
    this.tasks.clear();
    if (this.workerUrl) {
      URL.revokeObjectURL(this.workerUrl);
      this.workerUrl = null;
    }
  }

  /** 获取池状态 */
  getStatus() {
    return {
      total: this.workers.length,
      idle: this.idleWorkers.length,
      busy: this.workers.length - this.idleWorkers.length,
      queued: this.queue.length,
      activeTasks: this.tasks.size,
    };
  }
}

// ==================== 单例导出 ====================

let _pool: WorkerPool | null = null;

export function getWorkerPool(options?: WorkerPoolOptions): WorkerPool {
  if (!_pool) {
    _pool = new WorkerPool(options);
  }
  return _pool;
}

export function terminateWorkerPool(): void {
  if (_pool) {
    _pool.terminate();
    _pool = null;
  }
}

// ==================== 便捷方法 ====================

/** 在 Worker 中排序大数据集 */
export async function workerSort<T>(
  data: T[],
  key: string | ((item: T) => any),
  order: 'asc' | 'desc' = 'asc'
): Promise<T[]> {
  return getWorkerPool().submit('sort', { data, key, order });
}

/** 在 Worker 中过滤大数据集 */
export async function workerFilter<T>(data: T[], predicate: Record<string, any>): Promise<T[]> {
  return getWorkerPool().submit('filter', { data, predicate });
}

/** 在 Worker 中批量计算技术指标 */
export async function workerComputeIndicators(
  prices: number[],
  period?: number
): Promise<{ sma: any[]; ema: any[]; rsi: any[]; macd: any[] }> {
  return getWorkerPool().submit('indicator-batch', { prices, period });
}

/** 在 Worker 中计算相关性矩阵 */
export async function workerCorrelationMatrix(
  stockReturns: number[][]
): Promise<number[][]> {
  return getWorkerPool().submit('correlation-matrix', { stockReturns });
}

/** 在 Worker 中运行回测 */
export async function workerBacktest(
  prices: number[],
  strategy: string,
  initialCapital?: number
): Promise<any> {
  return getWorkerPool().submit('backtest-sim', { prices, strategy, initialCapital });
}
