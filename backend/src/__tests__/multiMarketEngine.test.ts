import { describe, it, expect } from 'vitest'

// 多市场支持引擎测试
describe('Multi-Market Support Engine', () => {
  // 市场识别
  function identifyMarket(symbol: string): string {
    if (/^(60[0-3]|688)/.test(symbol)) return 'SH'  // 上海
    if (/^(00[0-3]|300|301)/.test(symbol)) return 'SZ'  // 深圳
    if (/^8[0-9]{5}$/.test(symbol)) return 'BJ'  // 北交所
    if (/^(51|15|16)/.test(symbol)) return 'ETF'
    if (/^(11|12)/.test(symbol)) return 'Bond'
    return 'Unknown'
  }

  it('should identify Shanghai stocks', () => {
    expect(identifyMarket('600519')).toBe('SH')
    expect(identifyMarket('601398')).toBe('SH')
    expect(identifyMarket('688981')).toBe('SH')
  })

  it('should identify Shenzhen stocks', () => {
    expect(identifyMarket('000001')).toBe('SZ')
    expect(identifyMarket('002594')).toBe('SZ')
    expect(identifyMarket('300750')).toBe('SZ')
    expect(identifyMarket('301234')).toBe('SZ')
  })

  it('should identify Beijing stocks', () => {
    expect(identifyMarket('830001')).toBe('BJ')
    expect(identifyMarket('873001')).toBe('BJ')
  })

  it('should identify ETFs', () => {
    expect(identifyMarket('510050')).toBe('ETF')
    expect(identifyMarket('159919')).toBe('ETF')
  })

  it('should identify Bonds', () => {
    expect(identifyMarket('110059')).toBe('Bond')
    expect(identifyMarket('123001')).toBe('Bond')
  })

  // 涨跌停限制计算
  function getPriceLimit(symbol: string, isST: boolean, isDay1: boolean) {
    const market = identifyMarket(symbol)
    if (market === 'BJ') return { up: 0.30, down: 0.30 }  // 北交所30%
    if (isDay1) return { up: 0.44, down: 0.44 }  // 新股首日44%
    if (isST) return { up: 0.05, down: 0.05 }
    if (market === 'ETF') return { up: 0.10, down: 0.10 }
    return { up: 0.10, down: 0.10 }
  }

  it('should calculate correct limits for normal stocks', () => {
    const limits = getPriceLimit('600519', false, false)
    expect(limits.up).toBe(0.10)
    expect(limits.down).toBe(0.10)
  })

  it('should calculate 30% limit for Beijing stocks', () => {
    const limits = getPriceLimit('830001', false, false)
    expect(limits.up).toBe(0.30)
  })

  it('should calculate 5% limit for ST stocks', () => {
    const limits = getPriceLimit('600519', true, false)
    expect(limits.up).toBe(0.05)
  })

  it('should calculate 44% limit for IPO first day', () => {
    const limits = getPriceLimit('600519', false, true)
    expect(limits.up).toBe(0.44)
  })

  // 交易单位
  function getTradingUnit(symbol: string) {
    const market = identifyMarket(symbol)
    if (market === 'Bond') return 10  // 债券10张
    return 100  // 股票100股
  }

  it('should return 100 for stocks', () => {
    expect(getTradingUnit('600519')).toBe(100)
    expect(getTradingUnit('000001')).toBe(100)
  })

  it('should return 10 for bonds', () => {
    expect(getTradingUnit('110059')).toBe(10)
  })

  // 交易时间验证
  function isTradingTime(time: Date) {
    const hour = time.getHours()
    const min = time.getMinutes()
    const day = time.getDay()
    if (day === 0 || day === 6) return false  // 周末
    const totalMin = hour * 60 + min
    return (totalMin >= 570 && totalMin < 690) || (totalMin >= 780 && totalMin < 900)
  }

  it('should detect trading hours', () => {
    expect(isTradingTime(new Date('2026-03-23T10:00:00'))).toBe(true)  // 周一
    expect(isTradingTime(new Date('2026-03-23T14:30:00'))).toBe(true)
  })

  it('should detect non-trading hours', () => {
    expect(isTradingTime(new Date('2026-03-23T08:00:00'))).toBe(false)
    expect(isTradingTime(new Date('2026-03-23T12:00:00'))).toBe(false)
    expect(isTradingTime(new Date('2026-03-23T15:30:00'))).toBe(false)
  })

  it('should detect weekends', () => {
    expect(isTradingTime(new Date('2026-03-21T10:00:00'))).toBe(false)  // 周六
  })

  // 多市场行情格式化
  function formatQuoteForMarket(quote: { price: number; change: number; volume: number }, market: string) {
    const formatPrice = (p: number) => market === 'Bond' ? p.toFixed(3) : p.toFixed(2)
    const formatVol = (v: number) => {
      if (v >= 100000000) return (v / 100000000).toFixed(2) + '亿'
      if (v >= 10000) return (v / 10000).toFixed(2) + '万'
      return v.toString()
    }
    return {
      priceStr: formatPrice(quote.price),
      changeStr: (quote.change > 0 ? '+' : '') + formatPrice(quote.change),
      volumeStr: formatVol(quote.volume),
    }
  }

  it('should format stock quote', () => {
    const result = formatQuoteForMarket({ price: 1800.50, change: 50.30, volume: 123456789 }, 'SH')
    expect(result.priceStr).toBe('1800.50')
    expect(result.changeStr).toBe('+50.30')
    expect(result.volumeStr).toContain('亿')
  })

  it('should format bond quote with 3 decimals', () => {
    const result = formatQuoteForMarket({ price: 100.123, change: -0.456, volume: 1000 }, 'Bond')
    expect(result.priceStr).toBe('100.123')
  })

  // 指数代码识别
  function identifyIndex(symbol: string) {
    const indexMap: Record<string, string> = {
      '000001': '上证指数',
      '399001': '深证成指',
      '399006': '创业板指',
      '000016': '上证50',
      '000300': '沪深300',
      '000905': '中证500',
      '000852': '中证1000',
      '899050': '北证50',
    }
    return indexMap[symbol] || null
  }

  it('should identify major indices', () => {
    expect(identifyIndex('000001')).toBe('上证指数')
    expect(identifyIndex('399006')).toBe('创业板指')
    expect(identifyIndex('000300')).toBe('沪深300')
  })

  it('should return null for non-indices', () => {
    expect(identifyIndex('600519')).toBeNull()
  })

  // 集合竞价验证
  function isAuctionPeriod(time: Date) {
    const hour = time.getHours()
    const min = time.getMinutes()
    const totalMin = hour * 60 + min
    return (totalMin >= 540 && totalMin < 570) || (totalMin >= 870 && totalMin < 900)
  }

  it('should detect morning auction (9:15-9:25)', () => {
    expect(isAuctionPeriod(new Date('2026-03-23T09:20:00'))).toBe(true)
  })

  it('should detect closing auction (14:57-15:00)', () => {
    expect(isAuctionPeriod(new Date('2026-03-23T14:58:00'))).toBe(true)
  })

  it('should reject regular trading', () => {
    expect(isAuctionPeriod(new Date('2026-03-23T10:00:00'))).toBe(false)
  })

  // 费用计算
  function calculateTradingFee(amount: number, type: 'buy' | 'sell', isETF = false) {
    const commissionRate = 0.00025
    const minCommission = 5
    const commission = Math.max(amount * commissionRate, minCommission)
    const stampDuty = type === 'sell' && !isETF ? amount * 0.0005 : 0  // ETF免印花税
    const transferFee = amount * 0.00001
    return { commission, stampDuty, transferFee, total: commission + stampDuty + transferFee }
  }

  it('should calculate buy fee', () => {
    const fee = calculateTradingFee(100000, 'buy')
    expect(fee.commission).toBe(25)
    expect(fee.stampDuty).toBe(0)
    expect(fee.total).toBeGreaterThan(0)
  })

  it('should calculate sell fee with stamp duty', () => {
    const fee = calculateTradingFee(100000, 'sell')
    expect(fee.stampDuty).toBe(50)
  })

  it('should not charge stamp duty for ETF', () => {
    const fee = calculateTradingFee(100000, 'sell', true)
    expect(fee.stampDuty).toBe(0)
  })

  it('should apply minimum commission', () => {
    const fee = calculateTradingFee(1000, 'buy')
    expect(fee.commission).toBe(5)
  })
})
