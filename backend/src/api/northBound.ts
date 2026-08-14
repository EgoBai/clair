/**
 * 北向资金 API（诚实降级版）
 *
 * 数据源探索情况（2026-08-14）：
 *   - 东方财富 datacenter-web RPT_MUTUAL_STOCK_NORTHSTA：返回"服务器繁忙"，
 *     疑似限速或需登录态，重试无效
 *   - 东方财富 push2 push2.eastmoney.com：沙箱网络下未返回数据
 *   - 腾讯 qt.gtimg.cn 北向代码：未匹配到可用代码
 *   - RPT_MUTUAL_STOCK_HOLDRANKS：仅返回港股通数据（002/004），无北向 A 股
 *
 * 当前策略：
 *   - /api/north-bound/overview 端点结构已搭好
 *   - 数据诚实返回空数组 + dataSource:'unavailable' + 详细 notes
 *   - 前端按契约渲染空态，标注数据源接入进度
 *   - 待数据源恢复后，仅需恢复 buildHoldings() 调用即可生效
 *
 * 后续数据源候选：
 *   - 东方财富 RPT_MUTUAL_STOCK_NORTHSTA（首选，等待服务恢复）
 *   - 第三方源：新浪财经、北向资金聚合 API
 */

import { Router, Request, Response } from 'express';
import { asyncHandler } from '../utils/apiResponse';

const router = Router();

/**
 * GET /api/north-bound/overview
 * 返回 { flows, holdings, sectors } 三块
 */
router.get(
  '/overview',
  asyncHandler(async (_req: Request, res: Response) => {
    // 当前数据源不可达：诚实返回空
    res.json({
      success: true,
      data: { flows: [], holdings: [], sectors: [] },
      dataSource: 'unavailable',
      notes: {
        source: '东方财富数据中心 RPT_MUTUAL_STOCK_NORTHSTA 当前不可用（返回"服务器繁忙"）',
        flows: '沪/深股通日度净买额数据源不可达',
        holdings: '北向重仓股数据源不可达',
        sectors: '板块净流入数据源不可达',
        workaround: '页面将展示诚实空态 + 数据源接入进度；待上游恢复后自动重新接入',
      },
      timestamp: new Date().toISOString(),
    });
  }),
);

export default router;