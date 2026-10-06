/**
 * 市场宽度 API 路由
 */

import { Router, Request, Response } from 'express';
import { marketBreadthService, BreadthUnavailableError } from '../services/marketBreadth';
import { asyncHandler, sendSuccess } from '../utils/apiResponse';

const router = Router();

/**
 * GET /api/breadth/current
 * 获取当前市场宽度数据。
 * 真实源：腾讯 qt.gtimg.cn 全市场逐标的行情（清单来自 PostgreSQL stocks 表），
 * 由 marketBreadthService 本地聚合涨跌家数/涨跌停家数/成交额。
 * - dataSource 直接透传 service 的真实源标识（当前 'tencent'），**不硬编码 'real'**
 *   —— 顶层与行级必须一致，避免「顶层 real / 行级 unavailable」两级漂移。
 * - 源不可用时返回诚实空 dataSource:'unavailable'，绝不返回模拟数据。
 */
router.get('/current', asyncHandler(async (_req: Request, res: Response) => {
  try {
    const data = await marketBreadthService.calculateBreadth();
    // 顶层 dataSource 与 data.dataSource 同源，避免两级漂移
    sendSuccess(res, { ...data, dataSource: data.dataSource });
  } catch (e) {
    if (e instanceof BreadthUnavailableError) {
      sendSuccess(res, {
        dataSource: 'unavailable',
        message: e.message,
        data: null,
      });
      return;
    }
    throw e;
  }
}));

/**
 * GET /api/breadth/sectors
 * 获取板块宽度分析
 *
 * 诚实空态：板块宽度需要行业板块实时涨跌家数真实源，尚未接入 → dataSource:'unavailable'。
 * 响应保持**裸数组**形状（前端 breadthService.getSectors 直接消费 r.data），不改成对象。
 */
router.get('/sectors', asyncHandler(async (_req: Request, res: Response) => {
  const data = await marketBreadthService.getSectorBreadth();
  if (data.length === 0) {
    // 数组形状无法承载 dataSource 键，按契约置空数组并用 ASCII header 标注不可用原因
    // （HTTP header 只允许 ASCII，中文会触发 Invalid character in header content）
    res.setHeader('X-Data-Source', 'unavailable');
    res.setHeader('X-Data-Source-Reason', 'sector-breadth-source-not-integrated');
    sendSuccess(res, data);
    return;
  }
  sendSuccess(res, data);
}));

/**
 * GET /api/breadth/history?period=5d
 * 获取历史宽度数据
 *
 * 诚实空态：历史宽度需持久化盘中快照，后端未落库 → dataSource:'unavailable'，
 * 绝不生成随机历史曲线。
 */
router.get('/history', asyncHandler(async (req: Request, res: Response) => {
  const period = (req.query.period as '1d' | '5d' | '1m' | '3m') || '5d';
  const data = await marketBreadthService.getBreadthHistory(period);
  const isEmpty = data.data.length === 0;
  sendSuccess(res, {
    ...data,
    dataSource: isEmpty ? 'unavailable' : 'tencent',
    ...(isEmpty
      ? { message: '历史宽度时序真实源未接入（需持久化盘中快照，后端未落库），返回空序列而非伪造曲线' }
      : {}),
  });
}));

/**
 * GET /api/breadth/mcclellan
 * 获取McClellan振荡器
 *
 * 诚实空态：该指标派生自历史宽度时序；时序源未接入时值为 0（EMA 空输入），
 * 这**不是**「oscillator 处于 0 的市场结论」，故显式标注 unavailable。
 */
router.get('/mcclellan', asyncHandler(async (_req: Request, res: Response) => {
  const data = await marketBreadthService.getMcClellanOscillator();
  sendSuccess(res, {
    ...data,
    dataSource: 'unavailable',
    message: 'McClellan 振荡器派生自历史宽度时序，该时序真实源未接入；value=0 为空输入计算结果，非市场结论',
  });
}));

/**
 * GET /api/breadth/cache-stats
 * 获取缓存统计
 */
router.get('/cache-stats', asyncHandler(async (_req: Request, res: Response) => {
  const stats = marketBreadthService.getCacheStats();
  sendSuccess(res, stats);
}));

export default router;
