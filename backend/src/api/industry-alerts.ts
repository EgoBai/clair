/**
 * 产业链异动监控 API
 * 
 * 实时分析产业链各环节的异常变化：
 * - 涨幅异动: segment平均涨幅超过阈值
 * - 资金异动: 总成交额异常放大
 * - 龙头异动: 龙头股大幅波动
 * - 涨停异动: segment内涨停家数异常
 */

import { Router, Request, Response } from 'express';
import { asyncHandler } from '../utils/apiResponse';
import { getDb } from '../db/dbFactory';
import conceptMappings from './industryChainConcepts';

const router = Router();

interface Alert {
  type: 'surge' | 'plunge' | 'volume_spike' | 'limit_up' | 'leader_move';
  severity: 'high' | 'medium' | 'low';
  chainId: string;
  chainName: string;
  segmentId: string;
  segmentName: string;
  message: string;
  details: {
    avgChange: number;
    totalVolume: number;
    limitUpCount: number;
    leaderChanges: string[];
  };
}

/**
 * GET /api/industry-alerts
 * 返回所有产业链的实时异动告警
 */
router.get('/industry-alerts', asyncHandler(async (_req: Request, res: Response) => {
  const db = getDb();
  const alerts: Alert[] = [];

  // 遍历所有产业链和segment
  for (const concept of conceptMappings) {
    const symbols = concept.symbols.flatMap(s => [`${s}.SH`, `${s}.SZ`, `${s}.BJ`]);
    
    const rows = await (db.connection as any)('stocks as s')
      .leftJoin('daily_quotes as dq', function(this: any) {
        this.on('s.id', '=', 'dq.stock_id')
          .andOn('dq.trade_date', '=', db.connection.raw(
            '(SELECT MAX(trade_date) FROM daily_quotes WHERE stock_id = s.id)'
          ));
      })
      .whereIn('s.symbol', symbols)
      .where('s.is_active', true)
      .select(
        's.name', 's.symbol',
        'dq.change_percent',
        'dq.turnover',
        'dq.turnover_rate'
      );

    if (rows.length === 0) continue;

    const changes = rows.map((r: any) => Number(r.change_percent) || 0);
    const turnovers = rows.map((r: any) => Number(r.turnover) || 0);
    const avgChange = changes.reduce((a: number, b: number) => a + b, 0) / changes.length;
    const totalTurnover = turnovers.reduce((a: number, b: number) => a + b, 0);
    
    // 涨停数
    const limitUpCount = changes.filter((c: number) => c >= 9.8).length;
    
    // 龙头变化
    const leaders = concept.leaders || [];
    const leaderChanges: string[] = [];
    for (const row of rows) {
      const code = String(row.symbol).replace(/\.(SH|SZ|BJ)$/, '');
      if (leaders.includes(code)) {
        const change = Number(row.change_percent) || 0;
        if (Math.abs(change) >= 5) {
          leaderChanges.push(`${row.name} ${change > 0 ? '+' : ''}${change.toFixed(1)}%`);
        }
      }
    }

    const chainNames: Record<string, string> = {
      'ai-computing': 'AI算力', 'semiconductor': '半导体',
      'new-energy-vehicle': '新能源汽车', 'photovoltaic': '光伏', 'ai-robot': 'AI机器人'
    };

    // 告警判定
    if (avgChange >= 3) {
      alerts.push({
        type: 'surge', severity: avgChange >= 5 ? 'high' : 'medium',
        chainId: concept.conceptId.includes('optical') ? 'ai-computing' : 
                 concept.conceptId.includes('ic-design') ? 'semiconductor' :
                 concept.conceptId.includes('lithium') ? 'new-energy-vehicle' :
                 concept.conceptId.includes('silicon') ? 'photovoltaic' : 'ai-robot',
        chainName: chainNames[concept.conceptId] || '',
        segmentId: concept.conceptId, segmentName: concept.conceptName,
        message: `${concept.conceptName}板块平均涨幅${avgChange.toFixed(1)}%，${rows.length}只成分股表现活跃`,
        details: { avgChange, totalVolume: Math.round(totalTurnover / 1e4), limitUpCount, leaderChanges }
      });
    }

    if (avgChange <= -5) {
      alerts.push({
        type: 'plunge', severity: 'high',
        chainId: concept.conceptId, chainName: concept.conceptName,
        segmentId: concept.conceptId, segmentName: concept.conceptName,
        message: `${concept.conceptName}板块平均跌幅${avgChange.toFixed(1)}%，注意风险`,
        details: { avgChange, totalVolume: Math.round(totalTurnover / 1e4), limitUpCount, leaderChanges }
      });
    }

    if (limitUpCount >= 3) {
      alerts.push({
        type: 'limit_up', severity: 'high',
        chainId: concept.conceptId, chainName: concept.conceptName,
        segmentId: concept.conceptId, segmentName: concept.conceptName,
        message: `${concept.conceptName}板块${limitUpCount}只涨停，资金集中涌入`,
        details: { avgChange, totalVolume: Math.round(totalTurnover / 1e4), limitUpCount, leaderChanges }
      });
    }

    if (leaderChanges.length > 0) {
      alerts.push({
        type: 'leader_move', severity: 'medium',
        chainId: concept.conceptId, chainName: concept.conceptName,
        segmentId: concept.conceptId, segmentName: concept.conceptName,
        message: `龙头异动: ${leaderChanges.join('、')}`,
        details: { avgChange, totalVolume: Math.round(totalTurnover / 1e4), limitUpCount, leaderChanges }
      });
    }
  }

  // 按严重程度排序
  alerts.sort((a, b) => {
    const sev = { high: 3, medium: 2, low: 1 };
    return (sev[b.severity] || 0) - (sev[a.severity] || 0);
  });

  res.json({
    success: true,
    data: {
      alerts: alerts.slice(0, 20),
      total: alerts.length,
      timestamp: new Date().toISOString(),
    },
  });
}));

export default router;
