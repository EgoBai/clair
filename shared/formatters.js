/**
 * 金融数据格式化工具函数
 * 统一管理所有数字、金额、成交量的显示格式
 */
/**
 * 格式化数字（带千分位）
 */
export const formatNumber = (num, decimals = 2) => {
    return num.toLocaleString('zh-CN', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    });
};
/**
 * 格式化市值
 * 万亿 → 亿 → 万
 */
export const formatMarketCap = (cap) => {
    if (!cap && cap !== 0)
        return '-';
    if (cap >= 1e12)
        return `${(cap / 1e12).toFixed(2)}万亿`;
    if (cap >= 1e8)
        return `${(cap / 1e8).toFixed(2)}亿`;
    if (cap >= 1e4)
        return `${(cap / 1e4).toFixed(2)}万`;
    return cap.toString();
};
/**
 * 格式化成交量
 */
export const formatVolume = (vol) => {
    if (!vol && vol !== 0)
        return '-';
    if (vol >= 1e8)
        return `${(vol / 1e8).toFixed(2)}亿手`;
    if (vol >= 1e4)
        return `${(vol / 1e4).toFixed(2)}万手`;
    return `${vol}手`;
};
/**
 * 格式化成交额
 */
export const formatTurnover = (turnover) => {
    if (!turnover && turnover !== 0)
        return '-';
    if (turnover >= 1e8)
        return `${(turnover / 1e8).toFixed(2)}亿`;
    if (turnover >= 1e4)
        return `${(turnover / 1e4).toFixed(2)}万`;
    return turnover.toString();
};
/**
 * 格式化涨跌幅（带符号）
 */
export const formatChangePercent = (percent) => {
    if (percent === undefined || percent === null)
        return '-';
    const sign = percent >= 0 ? '+' : '';
    return `${sign}${percent.toFixed(2)}%`;
};
/**
 * 格式化涨跌额（带符号）
 */
export const formatChange = (change) => {
    if (change === undefined || change === null)
        return '-';
    const sign = change >= 0 ? '+' : '';
    return `${sign}${change.toFixed(2)}`;
};
/**
 * 格式化换手率
 */
export const formatTurnoverRate = (rate) => {
    if (rate === undefined || rate === null)
        return '-';
    return `${rate.toFixed(2)}%`;
};
/**
 * 格式化价格
 */
export const formatPrice = (price) => {
    if (price === undefined || price === null)
        return '-';
    return price.toFixed(2);
};
/**
 * 获取涨跌颜色类名
 */
export const getChangeColor = (value) => {
    if (value === undefined || value === null || value === 0)
        return 'neutral';
    return value > 0 ? 'positive' : 'negative';
};
/**
 * 获取涨跌颜色（hex）
 */
export const getChangeHexColor = (value) => {
    if (value === undefined || value === null || value === 0)
        return '#6B7280';
    return value > 0 ? '#EF4444' : '#22C55E';
};
/**
 * 格式化股票代码显示
 * 000001.SZ → 000001
 */
export const formatSymbol = (symbol) => {
    return symbol.replace(/\.(SZ|SH|BJ)$/, '');
};
/**
 * 判断市场
 */
export const getMarketLabel = (market) => {
    const map = {
        SH: '上海',
        SZ: '深圳',
        BJ: '北京',
    };
    return map[market] || market;
};
/**
 * 格式化日期
 */
export const formatDate = (date) => {
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime()))
        return '-';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};
/**
 * 格式化日期时间
 */
export const formatDateTime = (date) => {
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime()))
        return '-';
    return `${formatDate(date)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
/**
 * 格式化大数字（千分位）
 */
export const formatLargeNumber = (num) => {
    if (num === null || num === undefined || isNaN(num))
        return '-';
    return num.toLocaleString('en-US');
};
/**
 * 获取涨跌颜色（hex）
 * A股红涨绿跌
 */
export const getColorByChange = (value) => {
    if (value === undefined || value === null || value === 0)
        return '#6b7280';
    return value > 0 ? '#ef4444' : '#22c55e';
};
/**
 * 获取涨跌文字（带符号，2位小数）
 * @deprecated 使用 formatChange 替代
 */
export const getChangeText = formatChange;
/**
 * 判断市场颜色
 */
export const getMarketColor = (market) => {
    const map = {
        SH: 'blue',
        SZ: 'green',
        BJ: 'orange',
    };
    return map[market] || 'default';
};
/**
 * 格式化百分比（通用）
 */
export const formatPercent = (value, decimals = 2) => {
    if (value === undefined || value === null)
        return '-';
    return `${value.toFixed(decimals)}%`;
};
/**
 * 格式化PE/PB等估值指标
 */
export const formatRatio = (value) => {
    if (value === undefined || value === null)
        return '-';
    if (value < 0)
        return `亏损`;
    return value.toFixed(2);
};
/**
 * 计算相对时间
 * 5分钟内显示 "刚刚"，1小时内显示 "x分钟前"，否则显示日期
 */
export const formatRelativeTime = (date) => {
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime()))
        return '-';
    const now = Date.now();
    const diff = now - d.getTime();
    if (diff < 5 * 60 * 1000)
        return '刚刚';
    if (diff < 60 * 60 * 1000)
        return `${Math.floor(diff / 60000)}分钟前`;
    if (diff < 24 * 60 * 60 * 1000)
        return `${Math.floor(diff / 3600000)}小时前`;
    return formatDate(d);
};
/**
 * 判断涨跌方向
 * @returns 1 = 涨, -1 = 跌, 0 = 平
 */
export const getChangeDirection = (value) => {
    if (value === undefined || value === null || value === 0)
        return 0;
    return value > 0 ? 1 : -1;
};
