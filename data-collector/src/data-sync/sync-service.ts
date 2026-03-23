/**
 * 数据同步服务
 * 从腾讯/新浪 API 采集 A 股数据，存入数据库
 * 
 * 使用方法:
 *   npx tsx src/data-sync/sync-service.ts
 *   或 npm run data:sync
 */

import axios from 'axios';
import { TencentCollector } from '../../data-collector/src/collectors/tencent';
import { SinaCollector } from '../../data-collector/src/collectors/sina';
import type { RawQuoteData } from '../../data-collector/src/collectors/base';

// ==================== 配置 ====================
const CONFIG = {
  // 默认采集的股票列表（沪深主要标的）
  defaultSymbols: [
    // 大盘指数
    'sh000001', // 上证指数
    'sh000300', // 沪深300
    'sh000905', // 中证500
    'sz399001', // 深证成指
    'sz399006', // 创业板指
    // 热门个股
    'sh600519', // 贵州茅台
    'sz000858', // 五粮液
    'sh601318', // 中国平安
    'sz000002', // 万科A
    'sz000333', // 美的集团
    'sh600036', // 招商银行
    'sz000651', // 格力电器
    'sh601012', // 隆基绿能
    'sz300750', // 宁德时代
    'sh688981', // 中芯国际
    'sz002594', // 比亚迪
    'sh600900', // 长江电力
    'sh601166', // 兴业银行
    'sz002475', // 立讯精密
    'sh600276', // 恒瑞医药
    'sz300059', // 东方财富
    'sh601888', // 中国中免
    'sz002714', // 牧原股份
    'sh600309', // 万华化学
    'sz002352', // 顺丰控股
    'sh601398', // 工商银行
    'sh600030', // 中信证券
    'sz000001', // 平安银行
    'sh600887', // 伊利股份
    'sz002230', // 科大讯飞
    'sh688256', // 寒武纪
    'sz300760', // 迈瑞医疗
    'sh603259', // 药明康德
    'sz002415', // 海康威视
    'sh601288', // 农业银行
    'sh601988', // 中国银行
    'sz000338', // 潍柴动力
    'sh600104', // 上汽集团
    'sz002241', // 歌尔股份
    'sh603986', // 兆易创新
    'sz002049', // 紫光国微
    'sh688036', // 传音控股
    'sz300274', // 阳光电源
    'sh688599', // 天合光能
    'sz002129', // 中环股份
    'sh600438', // 通威股份
    'sz000725', // 京东方A
    'sh600585', // 海螺水泥
    'sz000876', // 新希望
    'sh600809', // 山西汾酒
    'sz000568', // 泸州老窖
  ],
  // 数据源优先级
  dataSources: ['tencent', 'sina'] as const,
  // 重试次数
  maxRetries: 3,
  // 请求间隔（ms）
  requestInterval: 500,
};

// ==================== 数据格式化 ====================

/**
 * 将采集到的原始数据格式化为数据库需要的格式
 */
function formatForDatabase(raw: RawQuoteData): Record<string, any> {
  const [code, market] = raw.symbol.split('.');
  
  return {
    symbol: raw.symbol,
    code,
    market,
    name: raw.name,
    current_price: raw.currentPrice,
    open_price: raw.openPrice,
    high_price: raw.highPrice,
    low_price: raw.lowPrice,
    prev_close: raw.prevClose,
    volume: raw.volume,
    turnover: raw.turnover,
    change_amount: raw.change,
    change_percent: raw.changePercent,
    amplitude: raw.amplitude,
    turnover_rate: raw.turnoverRate,
    pe_ratio: raw.peRatio,
    pb_ratio: raw.pbRatio,
    market_cap: raw.marketCap,
    circulating_market_cap: raw.circulatingMarketCap,
    bid_price_1: raw.bidPrice1,
    ask_price_1: raw.askPrice1,
    bid_volume_1: raw.bidVolume1,
    ask_volume_1: raw.askVolume1,
    data_source: raw.source,
    updated_at: new Date().toISOString(),
  };
}

// ==================== SQL 生成 ====================

/**
 * 生成 UPSERT SQL（PostgreSQL）
 */
function generateUpsertSQL(data: Record<string, any>[]): string {
  if (data.length === 0) return '';
  
  const columns = Object.keys(data[0]);
  const values = data.map(row => {
    const vals = columns.map(col => {
      const v = row[col];
      if (v === null || v === undefined) return 'NULL';
      if (typeof v === 'string') return `'${v.replace(/'/g, "''")}'`;
      if (typeof v === 'number') return v.toString();
      return `'${v}'`;
    });
    return `(${vals.join(', ')})`;
  });
  
  const updateSet = columns
    .filter(c => c !== 'symbol' && c !== 'code')
    .map(c => `${c} = EXCLUDED.${c}`)
    .join(', ');
  
  return `
    INSERT INTO stocks (${columns.join(', ')})
    VALUES ${values.join(',\n')}
    ON CONFLICT (symbol) DO UPDATE SET ${updateSet};
  `;
}

// ==================== 主流程 ====================

async function syncData() {
  console.log('========================================');
  console.log('  A股数据同步服务');
  console.log(`  ${new Date().toLocaleString('zh-CN')}`);
  console.log('========================================\n');
  
  // 初始化采集器
  const tencentCollector = new TencentCollector();
  const sinaCollector = new SinaCollector?.() || null;
  
  let allQuotes: RawQuoteData[] = [];
  let errors: string[] = [];
  
  // 从腾讯获取数据
  console.log('📡 正在从腾讯财经获取数据...');
  try {
    const result = await tencentCollector.fetchRealtimeQuotes(CONFIG.defaultSymbols);
    if (result.success) {
      allQuotes.push(...result.data);
      console.log(`  ✅ 腾讯: 获取 ${result.data.length} 条数据`);
    } else {
      errors.push(...result.errors);
      console.log(`  ⚠️ 腾讯: ${result.errors.join(', ')}`);
    }
  } catch (e) {
    errors.push(`腾讯采集失败: ${(e as Error).message}`);
    console.log(`  ❌ 腾讯采集失败: ${(e as Error).message}`);
  }
  
  // 如果腾讯失败，尝试新浪
  if (allQuotes.length === 0 && sinaCollector) {
    console.log('\n📡 正在从新浪财经获取数据...');
    try {
      const result = await sinaCollector.fetchRealtimeQuotes(CONFIG.defaultSymbols);
      if (result.success) {
        allQuotes.push(...result.data);
        console.log(`  ✅ 新浪: 获取 ${result.data.length} 条数据`);
      }
    } catch (e) {
      errors.push(`新浪采集失败: ${(e as Error).message}`);
      console.log(`  ❌ 新浪采集失败: ${(e as Error).message}`);
    }
  }
  
  // 去重（同一股票可能被两个源采集）
  const seen = new Set<string>();
  const uniqueQuotes = allQuotes.filter(q => {
    if (seen.has(q.symbol)) return false;
    seen.add(q.symbol);
    return true;
  });
  
  console.log(`\n📊 数据汇总:`);
  console.log(`  总采集: ${allQuotes.length} 条`);
  console.log(`  去重后: ${uniqueQuotes.length} 条`);
  console.log(`  错误数: ${errors.length}`);
  
  if (uniqueQuotes.length === 0) {
    console.log('\n❌ 没有获取到任何数据，请检查网络连接');
    return;
  }
  
  // 格式化数据
  const formattedData = uniqueQuotes.map(formatForDatabase);
  
  // 输出 SQL 文件（可直接导入数据库）
  const sql = generateUpsertSQL(formattedData);
  const outputPath = './data-sync-output.sql';
  
  const fs = await import('fs');
  fs.writeFileSync(outputPath, sql, 'utf-8');
  console.log(`\n💾 SQL 已保存到: ${outputPath}`);
  
  // 同时输出 JSON 文件（方便调试）
  const jsonPath = './data-sync-output.json';
  fs.writeFileSync(jsonPath, JSON.stringify(formattedData, null, 2), 'utf-8');
  console.log(`💾 JSON 已保存到: ${jsonPath}`);
  
  // 打印前 5 条数据预览
  console.log('\n📋 数据预览 (前5条):');
  console.log('─'.repeat(80));
  formattedData.slice(0, 5).forEach(d => {
    const change = d.change_percent >= 0 ? `+${d.change_percent.toFixed(2)}%` : `${d.change_percent.toFixed(2)}%`;
    console.log(`  ${d.symbol.padEnd(12)} ${d.name.padEnd(8)} ¥${d.current_price.toFixed(2).padStart(8)}  ${change}`);
  });
  console.log('─'.repeat(80));
  
  console.log('\n✅ 数据同步完成!');
  console.log('\n下一步:');
  console.log('  1. 确保 PostgreSQL 正在运行');
  console.log('  2. 执行: psql -d a_stock -f data-sync-output.sql');
  console.log('  3. 启动后端: npm run dev');
  console.log('  4. 启动前端: cd ../frontend && npm start');
}

// 运行
syncData().catch(console.error);
