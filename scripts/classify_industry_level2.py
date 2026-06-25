#!/usr/bin/env python3
"""Classify A-stocks into SW2021 L2 industry. Write to stocks.industry_level2."""
import json
import psycopg2

# Load L1->L2 map
with open('data/sw2021_l1_l2_map.json') as f:
    L1_L2_MAP = json.load(f)

# Name keyword -> L2 patterns (ordered, first match wins)
NAME_PATTERNS = [
    ("证券", "证券"), ("保险", "保险"),
    ("半导体", "半导体"), ("芯片", "半导体"),
    ("白酒", "白酒"), ("啤酒", "啤酒"),
    ("乳业", "乳制品"), ("乳品", "乳制品"), ("牛奶", "乳制品"),
    ("水泥", "水泥"), ("玻璃", "玻璃"),
    ("光伏", "光伏设备"), ("风电", "风电设备"),
    ("电池", "电池"), ("锂电", "电池"), ("锂电池", "电池"),
    ("中药", "中药"),
    ("生物科技", "生物制品"), ("生物制品", "生物制品"),
    ("制药", "化学制药"), ("药业", "化学制药"),
    ("软件", "软件开发"), ("科技", "IT服务"),
    ("传媒", "广告营销"), ("影视", "影视"), ("游戏", "游戏"),
    ("出版", "出版"), ("报业", "出版"),
    ("房地产", "房地产开发"), ("地产", "房地产开发"),
    ("快递", "物流"), ("物流", "物流"),
    ("港口", "港口航运"), ("航运", "港口航运"),
    ("机场", "航空机场"),
    ("铁路", "铁路公路"), ("高速", "铁路公路"),
    ("煤炭", "动力煤"), ("煤业", "动力煤"),
    ("石油", "油气开采"), ("石化", "炼化与贸易"),
    ("钢铁", "普钢"), ("钢", "普钢"),
    ("铜业", "工业金属"), ("铝业", "工业金属"),
    ("铜", "工业金属"), ("铝", "工业金属"),
    ("稀土", "稀有金属"), ("锂业", "能源金属"),
    ("造纸", "造纸"), ("印刷", "印刷"),
    ("化工", "化学制品"), ("化学", "化学制品"),
    ("电力", "电力"), ("发电", "电力"),
    ("水务", "水务"), ("燃气", "燃气"),
    ("环保", "环境治理"),
    ("机械", "通用设备"), ("装备", "通用设备"),
    ("电器", "白色家电"), ("家电", "白色家电"),
    ("汽车", "汽车零部件"), ("车", "汽车零部件"),
    ("食品", "食品加工"), ("调味", "调味品"),
    ("种业", "种植业"), ("种子", "种植业"),
    ("旅游", "旅游景区"), ("酒店", "酒店餐饮"),
    ("教育", "教育"), ("培训", "教育"),
    ("物业", "房地产服务"),
    ("纺织", "纺织制造"), ("服饰", "服装家纺"), ("服装", "服装家纺"),
    ("珠宝", "珠宝首饰"), ("黄金", "贵金属"),
    ("通信", "通信设备"),
    ("百货", "百货"), ("超市", "超市"),
    ("养殖", "养殖业"), ("饲料", "饲料"),
    ("渔业", "渔业"), ("水产", "渔业"),
    ("眼科", "医疗服务"), ("口腔", "医疗服务"),
    ("医疗", "医疗器械"), ("器械", "医疗器械"),
    ("健康", "医疗服务"), ("体检", "医疗服务"),
    ("贸易", "贸易"), ("进出口", "贸易"),
    ("数据中心", "云计算与大数据"),
    ("光电", "光学光电子"), ("激光", "光学光电子"),
    ("仪器", "仪器仪表"), ("仪表", "仪器仪表"),
    ("涂料", "涂料油墨"),
    ("包装", "包装"),
    ("机器人", "自动化设备"),
    ("工程", "基础设施"), ("建设", "基础设施"),
    ("装饰", "装修装饰"),
    ("航空", "航空装备"), ("航天", "航天装备"),
    ("电信", "电信运营商"),
    ("新材料", "化学制品"),
    ("家居", "家居用品"),
    ("化妆品", "化妆品"), ("美妆", "化妆品"),
    ("园林", "环境治理"),
    ("生物", "生物制品"),
    ("电子", "消费电子"),
]

# Special: tell big state banks apart from joint-stock
BIG_BANKS = {"工商银行","建设银行","农业银行","中国银行","交通银行","邮储银行"}

def classify(symbol, name, l1):
    """Return (l2_category, method)"""
    name_clean = name.replace(' ', '').replace('Ａ', 'A').replace('*', '')
    
    # 1) Delisted/ST -> 综合
    if any(k in name_clean for k in ('退', 'ST', 'PT')):
        return ('综合', 'delisted')
    if l1 in ('综合', '指数', None):
        return ('综合', 'l1_unknown')
    
    # 2) Bank special handling
    if l1 == '银行':
        if '银行' not in name_clean:
            return ('股份制银行', 'l1_fallback')
        if name_clean in BIG_BANKS:
            return ('国有大型银行', 'bank_list')
        # distinguish city/rural vs joint-stock by name pattern
        if any(city in name_clean for city in ['北京','上海','南京','杭州','宁波','江苏','郑州','青岛','长沙','西安','成都','重庆','贵阳','厦门','齐鲁']):
            return ('城商行', 'bank_name')
        if '农商' in name_clean:
            return ('农商行', 'bank_name')
        return ('股份制银行', 'bank_fallback')
    
    # 3) Name keyword match
    for kw, l2 in NAME_PATTERNS:
        if kw in name_clean:
            return (l2, 'keyword:' + kw)
    
    # 4) L1 fallback: default first L2 in that category
    candidates = L1_L2_MAP.get(l1, [])
    if candidates:
        return (candidates[0], 'l1_fallback')
    
    return ('综合', 'fallback')


def main():
    conn = psycopg2.connect('postgresql://postgres:@localhost:5432/clair')
    cur = conn.cursor()
    
    # Create column if not exists
    cur.execute("""
        ALTER TABLE stocks ADD COLUMN IF NOT EXISTS industry_level2 VARCHAR(64)
    """)
    conn.commit()
    
    # Fetch all active stocks
    cur.execute("""
        SELECT symbol, name, industry FROM stocks WHERE is_active=true ORDER BY symbol
    """)
    rows = cur.fetchall()
    total = len(rows)
    print(f"Total active stocks: {total}")
    
    stats = {}
    method_stats = {}
    classified = 0
    
    for sym, name, l1 in rows:
        l2, method = classify(sym, name, l1 or '综合')
        stats[l2] = stats.get(l2, 0) + 1
        method_stats[method] = method_stats.get(method, 0) + 1
        if l2 != '综合':
            classified += 1
        
        cur.execute("UPDATE stocks SET industry_level2=%s WHERE symbol=%s", (l2, sym))
    
    conn.commit()
    
    # Report
    rate = classified / total * 100
    print(f"\n{'='*60}")
    print(f"RESULT: {classified}/{total} = {rate:.1f}% classified to L2")
    print(f"L2 categories used: {len(stats)}")
    print(f"\nMethod breakdown:")
    for m, c in sorted(method_stats.items(), key=lambda x:-x[1]):
        print(f"  {m:30s} {c:5d} ({c/total*100:.1f}%)")
    
    print(f"\nTop 25 L2 categories:")
    for l2, cnt in sorted(stats.items(), key=lambda x:-x[1])[:25]:
        bar = '█' * (cnt // 50)
        print(f"  {l2:20s} {cnt:5d}  {bar}")
    
    print(f"\n=== Spot-check samples ===")
    cur.execute("""
        SELECT symbol, name, industry, industry_level2 FROM stocks
        WHERE is_active=true AND industry_level2 IS NOT NULL
        ORDER BY RANDOM() LIMIT 12
    """)
    for s, n, l1, l2 in cur.fetchall():
        print(f"  {s:14s} {n:12s}  {l1 or '?':12s} -> {l2}")
    
    conn.close()
    print("\nDONE.")

if __name__ == '__main__':
    main()
