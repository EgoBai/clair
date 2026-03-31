/**
 * Algorithmic Trading Engine
 *
 * Order management, execution algorithms, and trading simulation.
 */

export type OrderType = 'market' | 'limit' | 'stop' | 'stop_limit' | 'trailing_stop';
export type OrderSide = 'buy' | 'sell';
export type OrderStatus = 'pending' | 'partial' | 'filled' | 'cancelled' | 'rejected';
export type TimeInForce = 'GTC' | 'IOC' | 'FOK' | 'DAY';

export interface Order {
  id: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  quantity: number;
  price?: number;
  stopPrice?: number;
  trailingAmount?: number;
  status: OrderStatus;
  filledQuantity: number;
  avgFillPrice: number;
  timeInForce: TimeInForce;
  createdAt: string;
  updatedAt: string;
}

export interface ExecutionResult {
  orderId: string;
  executed: boolean;
  fillPrice: number;
  fillQuantity: number;
  slippage: number;
  commission: number;
  timestamp: string;
}

export interface TWAPConfig {
  totalQuantity: number;
  duration: number; // minutes
  numSlices: number;
  symbol: string;
  side: OrderSide;
}

export interface VWAPConfig {
  totalQuantity: number;
  symbol: string;
  side: OrderSide;
  volumeProfile: number[]; // expected volume per period
}

export interface IcebergConfig {
  totalQuantity: number;
  displayQuantity: number;
  symbol: string;
  side: OrderSide;
  price: number;
}

let orderIdCounter = 0;
function nextOrderId(): string {
  return `ORD_${++orderIdCounter}_${Date.now()}`;
}

/**
 * Create a new order
 */
export function createOrder(params: {
  symbol: string;
  side: OrderSide;
  type: OrderType;
  quantity: number;
  price?: number;
  stopPrice?: number;
  trailingAmount?: number;
  timeInForce?: TimeInForce;
}): Order {
  const now = new Date().toISOString();
  return {
    id: nextOrderId(),
    symbol: params.symbol,
    side: params.side,
    type: params.type,
    quantity: params.quantity,
    price: params.price,
    stopPrice: params.stopPrice,
    trailingAmount: params.trailingAmount,
    status: 'pending',
    filledQuantity: 0,
    avgFillPrice: 0,
    timeInForce: params.timeInForce || 'GTC',
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Simulate order execution against market price
 */
export function executeOrder(
  order: Order,
  currentPrice: number,
  bidPrice?: number,
  askPrice?: number
): ExecutionResult {
  const timestamp = new Date().toISOString();

  if (order.status === 'filled' || order.status === 'cancelled') {
    return { orderId: order.id, executed: false, fillPrice: 0, fillQuantity: 0, slippage: 0, commission: 0, timestamp };
  }

  let fillPrice = 0;
  let shouldFill = false;

  switch (order.type) {
    case 'market':
      fillPrice = order.side === 'buy' ? (askPrice || currentPrice * 1.0005) : (bidPrice || currentPrice * 0.9995);
      shouldFill = true;
      break;

    case 'limit':
      if (order.price) {
        if (order.side === 'buy' && currentPrice <= order.price) {
          fillPrice = Math.min(order.price, askPrice || currentPrice);
          shouldFill = true;
        } else if (order.side === 'sell' && currentPrice >= order.price) {
          fillPrice = Math.max(order.price, bidPrice || currentPrice);
          shouldFill = true;
        }
      }
      break;

    case 'stop':
      if (order.stopPrice) {
        if (order.side === 'buy' && currentPrice >= order.stopPrice) {
          fillPrice = askPrice || currentPrice * 1.0005;
          shouldFill = true;
        } else if (order.side === 'sell' && currentPrice <= order.stopPrice) {
          fillPrice = bidPrice || currentPrice * 0.9995;
          shouldFill = true;
        }
      }
      break;

    case 'stop_limit':
      if (order.stopPrice && order.price) {
        const triggered = order.side === 'buy' ? currentPrice >= order.stopPrice : currentPrice <= order.stopPrice;
        if (triggered) {
          const canFill = order.side === 'buy' ? currentPrice <= order.price : currentPrice >= order.price;
          if (canFill) {
            fillPrice = order.price;
            shouldFill = true;
          }
        }
      }
      break;

    case 'trailing_stop':
      // Simplified: trigger at currentPrice +/- trailingAmount
      if (order.trailingAmount) {
        // Assume trailing stop is at the edge
        fillPrice = currentPrice;
        shouldFill = false; // Would need tracking
      }
      break;
  }

  if (!shouldFill) {
    return { orderId: order.id, executed: false, fillPrice: 0, fillQuantity: 0, slippage: 0, commission: 0, timestamp };
  }

  const fillQuantity = order.quantity - order.filledQuantity;
  const slippage = Math.abs(fillPrice - currentPrice) / currentPrice;
  const commission = Math.max(5, fillPrice * fillQuantity * 0.0003);

  return {
    orderId: order.id,
    executed: true,
    fillPrice,
    fillQuantity,
    slippage,
    commission,
    timestamp,
  };
}

/**
 * Generate TWAP child orders
 */
export function generateTWAPOrders(config: TWAPConfig): Order[] {
  const sliceQty = Math.floor(config.totalQuantity / config.numSlices);
  const remainder = config.totalQuantity - sliceQty * config.numSlices;
  const orders: Order[] = [];

  for (let i = 0; i < config.numSlices; i++) {
    const qty = sliceQty + (i < remainder ? 1 : 0);
    orders.push(createOrder({
      symbol: config.symbol,
      side: config.side,
      type: 'limit',
      quantity: qty,
      timeInForce: 'IOC',
    }));
  }

  return orders;
}

/**
 * Generate VWAP child orders
 */
export function generateVAWAPOrders(config: VWAPConfig): Order[] {
  const totalVolume = config.volumeProfile.reduce((s, v) => s + v, 0);
  const orders: Order[] = [];

  for (let i = 0; i < config.volumeProfile.length; i++) {
    const share = config.volumeProfile[i] / totalVolume;
    const qty = Math.round(config.totalQuantity * share);
    if (qty > 0) {
      orders.push(createOrder({
        symbol: config.symbol,
        side: config.side,
        type: 'limit',
        quantity: qty,
        timeInForce: 'IOC',
      }));
    }
  }

  return orders;
}

/**
 * Generate iceberg order slices
 */
export function generateIcebergOrders(config: IcebergConfig): Order[] {
  const orders: Order[] = [];
  let remaining = config.totalQuantity;

  while (remaining > 0) {
    const qty = Math.min(config.displayQuantity, remaining);
    orders.push(createOrder({
      symbol: config.symbol,
      side: config.side,
      type: 'limit',
      quantity: qty,
      price: config.price,
      timeInForce: 'IOC',
    }));
    remaining -= qty;
  }

  return orders;
}

/**
 * Calculate execution quality metrics
 */
export function executionQuality(
  executions: ExecutionResult[],
  arrivalPrice: number
): {
  avgSlippage: number;
  totalCommission: number;
  implementationShortfall: number;
  fillRate: number;
} {
  const filled = executions.filter(e => e.executed);
  const avgSlippage = filled.length === 0 ? 0 : filled.reduce((s, e) => s + e.slippage, 0) / filled.length;
  const totalCommission = executions.reduce((s, e) => s + e.commission, 0);

  const totalQty = executions.reduce((s, e) => s + e.fillQuantity, 0);
  const avgFillPrice = totalQty === 0 ? 0
    : executions.reduce((s, e) => s + e.fillPrice * e.fillQuantity, 0) / totalQty;

  const side = executions.length > 0 ? 1 : 0; // assume buy
  const implementationShortfall = (avgFillPrice - arrivalPrice) / arrivalPrice * side;

  const fillRate = executions.length === 0 ? 0 : filled.length / executions.length;

  return { avgSlippage, totalCommission, implementationShortfall, fillRate };
}
