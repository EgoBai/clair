import 'dotenv/config';
import { initDatabase, getDb } from './src/db/dbFactory';
async function main() {
  await initDatabase();
  const db: any = getDb();
  const knex = db.connection || db.knexInstance;
  const stocksCols: any = await knex.raw("SELECT column_name FROM information_schema.columns WHERE table_name='stocks' ORDER BY ordinal_position");
  console.log('STOCKS cols:', (stocksCols.rows||stocksCols).map((c:any)=>c.column_name).join(', '));
  const dqCols: any = await knex.raw("SELECT column_name FROM information_schema.columns WHERE table_name='daily_quotes' ORDER BY ordinal_position");
  console.log('DQ cols:', (dqCols.rows||dqCols).map((c:any)=>c.column_name).join(', '));
  const cnt: any = await knex.raw("SELECT count(*)::int n FROM stocks");
  console.log('stocks total:', (cnt.rows||cnt)[0].n);
  const active: any = await knex.raw("SELECT count(*)::int n FROM stocks WHERE is_active = true");
  console.log('is_active=true:', (active.rows||active)[0].n);
  const dist: any = await knex.raw("SELECT count(dq.id)::int c FROM daily_quotes dq JOIN stocks s ON dq.stock_id=s.id WHERE s.is_active=true GROUP BY s.symbol");
  const rows = dist.rows||dist;
  console.log('stocks-with-quotes:', rows.length, 'max:', Math.max(...rows.map((r:any)=>r.c)), '>=190:', rows.filter((r:any)=>r.c>=190).length, '>=126:', rows.filter((r:any)=>r.c>=126).length, '>=63:', rows.filter((r:any)=>r.c>=63).length);
  const sample: any = await knex.raw("SELECT s.symbol, count(dq.id)::int c FROM daily_quotes dq JOIN stocks s ON dq.stock_id=s.id WHERE s.is_active=true GROUP BY s.symbol ORDER BY c DESC LIMIT 3");
  console.log('top:', (sample.rows||sample).map((r:any)=>`${r.symbol}:${r.c}`).join(', '));
}
main().catch(e=>{console.error(e);process.exit(1);});
