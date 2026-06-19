/**
 * 澄观 Clair — 后端 Zod Schemas
 * 用于验证和转换API响应数据
 */
import { z } from 'zod';

export const DailyQuoteSchema = z.object({
  close_price: z.coerce.number().nullable().default(0),
  open_price: z.coerce.number().nullable().default(0),
  high_price: z.coerce.number().nullable().default(0),
  low_price: z.coerce.number().nullable().default(0),
  change_amount: z.coerce.number().nullable().default(0),
  change_percent: z.coerce.number().nullable().default(0),
  volume: z.coerce.number().nullable().default(0),
  turnover: z.coerce.number().nullable().default(0),
  turnover_rate: z.coerce.number().nullable().default(0),
  amplitude: z.coerce.number().nullable().default(0),
  market_cap: z.coerce.number().nullable().default(0),
});

export const StockWithQuoteRaw = z.object({
  symbol: z.string(),
  name: z.string(),
  industry: z.string().nullable().optional(),
  market: z.string().optional(),
  is_active: z.boolean().optional(),
}).merge(DailyQuoteSchema);

export const validateResponse = <T extends z.ZodTypeAny>(schema: T, data: unknown) => {
  const result = schema.safeParse(data);
  if (!result.success) {
    console.warn('[Zod] 数据校验警告:', result.error.issues.slice(0, 3).map(i => `${i.path.join('.')}: ${i.message}`));
  }
  return data; // 不阻塞，只告警
};
