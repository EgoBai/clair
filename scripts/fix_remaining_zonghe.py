#!/usr/bin/env python3
"""Fix remaining '综合' stocks using keyword-based NAME_RULES from reclassify_industries.py."""
import re, psycopg2

# Same NAME_RULES from reclassify_industries.py
NAME_RULES = [
    (r'钢(铁|管|材|结构)', '钢铁'),
    (r'(马钢|鞍钢|本钢|杭钢|凌钢|柳钢)', '钢铁'),
    (r'(高速|公路|铁路|机场|航空$|港口|港务|港集团|航运|海运|船务|物流$|快递|供应链)', '交通运输'),
    (r'(交运|地铁|轨道交通)', '交通运输'),
    (r'(传媒|出版|影视|电影|广电|网络$|有线$|报业|广告|文化$)', '传媒'),
    (r'(歌华|华数|电广)', '传媒'),
    (r'(地产|房产|置业|城投|园区|开发$|高新园|保税)', '房地产'),
    (r'(万科|保利|招商|金地|绿地)', '房地产'),
    (r'(建设|工程|基建|路桥|隧道|装饰|幕墙|园林|设计院)', '建筑装饰'),
    (r'(中(国)?铁|中(国)?交|中建|葛洲坝|中国电建|中国中冶)', '建筑装饰'),
    (r'(食品|饮料|酒(业|厂)?|乳(业|品)|奶|糖(果|业)?|醋|酱|酵母|肉制品|火腿|榨菜)', '食品饮料'),
    (r'(茅台|五粮液|泸州|汾酒|洋河|古井|水井坊|舍得|老白干|燕京|青岛啤|珠江啤|重庆啤)', '食品饮料'),
    (r'(伊利|蒙牛|光明乳|三元|天润|海天|千禾|安琪|涪陵|恰恰|三只|良品|绝味|双汇)', '食品饮料'),
    (r'(医药|药业|制药|生物|药房|医疗|器械|诊断|基因|疫苗|血制品)', '医药生物'),
    (r'(药明|康龙|泰格|凯莱英|片仔癀|恒瑞|迈瑞|长春高新|智飞)', '医药生物'),
    (r'(军工|防务|航天|航空$|兵(器|装)|导航|雷达|卫星)', '国防军工'),
    (r'(中航|中直|中兵|航发|航宇|航天(?!信息)|北方导航)', '国防军工'),
    (r'(农(业|牧|林|产品)?|种(业|植)|养殖|牧业|饲料|渔业|水产|海洋$)', '农林牧渔'),
    (r'(温氏|牧原|新希望|通威|海大|大北农|隆平)', '农林牧渔'),
    (r'(百货|超市|零售|连锁|贸易|进出口|商业|购物)', '商贸零售'),
    (r'(王府井|永辉|步步高|苏宁|国美|小商品)', '商贸零售'),
    (r'(汽车|客车|卡车|轿车|摩托|轮胎|零部件|车灯|轴承)', '汽车'),
    (r'(宇通|金龙|中通|安凯|江淮|江铃)', '汽车'),
    (r'(电力|供电|热电|水电|火电|风电$|燃气|天然气|供热|水务|自来水)', '公用事业'),
    (r'(华能|华电|国电|大唐|长江电力|三峡)', '公用事业'),
    (r'(化工|化学|化肥|农药|助剂|催化剂|涂料|颜料|染料|炭黑)', '基础化工'),
    (r'(万华|恒力|荣盛|恒逸|桐昆|华鲁|鲁西|卫星石)', '基础化工'),
    (r'(环保|环境|环卫|垃圾|污水|废物|再生|循环|节能|减排|碳(中和|交易))', '环保'),
    (r'(通信|电信|光纤|光缆|天线|基站|5G)', '通信'),
    (r'(纺织|服装|服饰|面料|印染|家纺|皮革|鞋(业|类)?|丝绸)', '纺织服饰'),
    (r'(造纸|纸业|家具|家居$|包装|文具|首饰|珠宝|玩具)', '轻工制造'),
    (r'(电器|家电|制冷|空调|冰柜|洗衣机|热水器)', '家用电器'),
    (r'(水泥|玻璃$|玻纤|陶瓷|防水|涂料$)', '建筑材料'),
    (r'(旅游|酒店|景区|餐饮|会展|教育|培训)', '社会服务'),
    (r'(化妆|护肤|美容|日化|牙膏|洗发)', '美容护理'),
    (r'(证券|保险|期货|信托|金融$|投(资|行))', '非银金融'),
    (r'(石油|石化|油田|炼化|加油站)', '石油石化'),
    (r'(煤炭|煤业|矿业$|焦化)', '煤炭'),
    (r'(机械|机电|重工|锅炉|泵|阀|齿轮|电机|模具|冲压|锻压)', '机械设备'),
    (r'(光伏|太阳能|风电$|储能|电池|电源|充电|逆变|电缆|变压器)', '电力设备'),
    (r'(软件|数据|信息|科技$|系统$|智能$)', '计算机'),
]

# Well-known stock hardcoding
KNOWN_STOCKS = {
    '600000': '银行', '600015': '银行', '600016': '银行',
    '601398': '银行', '601939': '银行', '601288': '银行',
    '601988': '银行', '601328': '银行', '600036': '银行',
    '601166': '银行', '000001': '银行', '002142': '银行',
    '601818': '银行', '601229': '银行', '601169': '银行',
    '603986': '电子', '002415': '电子', '002475': '电子',
    '603501': '电子', '600745': '电子',
    '300750': '电力设备', '601012': '电力设备',
    '002129': '电力设备', '300274': '电力设备',
    '600519': '食品饮料', '000858': '食品饮料',
    '000568': '食品饮料', '002304': '食品饮料',
    '603288': '食品饮料', '600887': '食品饮料',
    '603259': '医药生物', '300760': '医药生物',
    '600276': '医药生物', '300015': '医药生物',
    '002714': '农林牧渔', '300498': '农林牧渔',
    '000876': '农林牧渔',
    '601138': '电子', '002230': '计算机',
    '688981': '电子', '601899': '有色金属',
    '600809': '食品饮料',
}

def classify_stock(code, name):
    code_pure = code.replace('.SH','').replace('.SZ','').replace('.BJ','')
    if code_pure in KNOWN_STOCKS:
        return KNOWN_STOCKS[code_pure]
    for pattern, industry in NAME_RULES:
        if re.search(pattern, name):
            return industry
    return '综合'

# Connect
conn = psycopg2.connect(host='localhost', port=5432, database='clair', user='postgres')
cur = conn.cursor()

cur.execute("""
    SELECT id, symbol, name FROM stocks
    WHERE is_active = true AND industry = '综合'
""")
stocks = cur.fetchall()
print(f"Stocks to classify: {len(stocks)}")

results = []
for stock_id, symbol, name in stocks:
    new_ind = classify_stock(symbol, name)
    if new_ind != '综合':
        results.append((stock_id, symbol, name, new_ind))

print(f"Classifiable: {len(results)}, still '综合': {len(stocks) - len(results)}")

# Show samples
print("\nSample classifications:")
for r in results[:20]:
    print(f"  {r[1]:14s} {r[2][:10]:10s} -> {r[3]}")

# Check distribution
from collections import Counter
dist = Counter(r[3] for r in results)
print(f"\nClassification distribution:")
for ind, cnt in dist.most_common():
    print(f"  {ind}: {cnt}")

# Execute updates
print(f"\nExecuting {len(results)} updates...")
for stock_id, symbol, name, new_ind in results:
    cur.execute(
        "UPDATE stocks SET industry = %s WHERE id = %s",
        (new_ind, stock_id)
    )
conn.commit()

# Final check
cur.execute("SELECT COUNT(*) FROM stocks WHERE is_active = true AND industry = '综合'")
remaining = cur.fetchone()[0]
print(f"Remaining '综合': {remaining} ({remaining/55.44:.1f}%)")

cur.close()
conn.close()
print("Done!")
