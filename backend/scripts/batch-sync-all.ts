/**
 * 批量同步所有A股历史K线数据
 * 从腾讯API获取完整股票列表，然后批量同步
 */

import 'dotenv/config';
import { initDatabase, getDb } from '../src/db/dbFactory';
import { dataSyncService } from '../src/data-sync/DataSyncService';
import axios from 'axios';
import * as iconv from 'iconv-lite';

// 从腾讯API获取A股列表
async function fetchAllAStockSymbols(): Promise<string[]> {
  const symbols: string[] = [];
  
  // 上海主板: 60xxxx
  // 深圳主板: 00xxxx
  // 创业板: 30xxxx
  // 科创板: 68xxxx
  // 北交所: 4xxxxx, 8xxxxx
  
  const markets = [
    { prefix: 'sh', range: [600000, 605999] },  // 上海主板
    { prefix: 'sz', range: [0, 3999] },          // 深圳主板
    { prefix: 'sz', range: [300000, 301999] },   // 创业板
    { prefix: 'sh', range: [688000, 689999] },   // 科创板
  ];
  
  for (const market of markets) {
    for (let i = market.range[0]; i <= market.range[1]; i++) {
      const code = i.toString().padStart(6, '0');
      symbols.push(`${market.prefix}${code}`);
    }
  }
  
  return symbols;
}

// 验证股票是否存在
async function validateSymbol(symbol: string): Promise<boolean> {
  try {
    const url = `https://qt.gtimg.cn/q=${symbol}`;
    const response = await axios.get(url, {
      timeout: 3000,
      responseType: 'arraybuffer',
    });
    
    const text = iconv.decode(response.data, 'gbk');
    // 腾讯API返回空字符串或特定错误表示不存在
    if (!text || text.includes('pv_none') || text.length < 50) {
      return false;
    }
    
    // 解析数据验证有效性
    const parts = text.split('~');
    if (parts.length < 5) return false;
    
    const name = parts[1];
    const price = parseFloat(parts[3]);
    
    return name && name.length > 0 && !isNaN(price) && price > 0;
  } catch {
    return false;
  }
}

// 批量验证并筛选有效股票
async function filterValidSymbols(symbols: string[], batchSize: number = 50): Promise<string[]> {
  const validSymbols: string[] = [];
  let processed = 0;
  
  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(async (symbol) => ({
        symbol,
        valid: await validateSymbol(symbol),
      }))
    );
    
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.valid) {
        validSymbols.push(result.value.symbol);
      }
    }
    
    processed += batch.length;
    if (processed % 500 === 0) {
      console.log(`已验证 ${processed}/${symbols.length}，有效: ${validSymbols.length}`);
    }
    
    // 避免请求过快
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  return validSymbols;
}

// 批量同步K线数据
async function batchSyncKLine(validSymbols: string[], days: number = 120): Promise<void> {
  console.log(`\n开始批量同步 ${validSymbols.length} 只股票的K线数据...`);
  
  const result = await dataSyncService.syncMultipleKLineData(validSymbols, days);
  
  console.log(`\n同步完成:`);
  console.log(`  成功: ${result.quotesSaved} 条`);
  console.log(`  新增股票: ${result.stocksCreated} 只`);
  console.log(`  错误: ${result.errors.length} 个`);
  
  if (result.errors.length > 0) {
    console.log(`\n前10个错误:`);
    result.errors.slice(0, 10).forEach(err => console.log(`  - ${err}`));
  }
}

// 主函数
async function main() {
  console.log('=== A股全量数据同步工具 ===\n');
  
  // 1. 初始化数据库
  console.log('1. 初始化数据库...');
  await initDatabase();
  const db = getDb();
  
  // 2. 检查当前数据状态
  const currentStocks = await db.getStocks({ pageSize: 10000 });
  console.log(`\n2. 当前数据库: ${currentStocks.length} 只股票`);
  
  // 3. 获取所有A股代码
  console.log('\n3. 获取A股代码列表...');
  const allSymbols = await fetchAllAStockSymbols();
  console.log(`   生成 ${allSymbols.length} 个候选代码`);
  
  // 4. 验证有效股票
  console.log('\n4. 验证股票有效性...');
  const validSymbols = await filterValidSymbols(allSymbols, 100);
  console.log(`   有效股票: ${validSymbols.length} 只`);
  
  // 5. 过滤已存在的股票
  const existingSymbols = new Set(currentStocks.map(s => s.symbol));
  const newSymbols = validSymbols.filter(s => !existingSymbols.has(s));
  console.log(`\n5. 需要同步: ${newSymbols.length} 只新股票`);
  
  if (newSymbols.length === 0) {
    console.log('\n所有股票已同步，无需更新。');
    process.exit(0);
  }
  
  // 6. 批量同步K线数据
  console.log('\n6. 开始批量同步...');
  await batchSyncKLine(newSymbols, 120);
  
  // 7. 验证结果
  const finalStocks = await db.getStocks({ pageSize: 10000 });
  console.log(`\n7. 同步后数据库: ${finalStocks.length} 只股票`);
  
  console.log('\n=== 同步完成 ===');
  process.exit(0);
}

main().catch(err => {
  console.error('同步失败:', err);
  process.exit(1);
});
