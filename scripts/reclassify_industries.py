#!/usr/bin/env python3
"""
Re-classify the 2151 '综合' stocks in FULL_STOCK_LIST using keyword matching.
Also fixes obvious misclassifications in other categories.

Strategy:
1. Name-based keyword rules (most reliable)
2. Well-known company → industry hardcoding
3. Stock code range hints (e.g., 600xxx patterns)
"""
import json, re
from collections import Counter

# Load data
with open('/Users/ego_bai/.openclaw/workspace/a-stock-website/clair-worker/worker.js', 'r') as f:
    content = f.read()

match = re.search(r'const FULL_STOCK_LIST = (\[\[.*?\]\]);', content, re.DOTALL)
if not match:
    print("Could not find FULL_STOCK_LIST")
    exit(1)

data = json.loads(match.group(1))
print(f"Total stocks: {len(data)}")

# ===== NAME-BASED KEYWORD RULES =====
# Format: (keyword_pattern, industry)
# Applied in priority order (first match wins)
NAME_RULES = [
    # --- 钢铁 ---
    (r'钢(铁|管|材|结构)', '钢铁'),
    (r'(马钢|鞍钢|本钢|杭钢|凌钢|柳钢)', '钢铁'),
    
    # --- 交通运输 ---
    (r'(高速|公路|铁路|机场|航空$|港口|港务|港集团|航运|海运|船务|物流$|快递|供应链)', '交通运输'),
    (r'(交运|地铁|轨道交通)', '交通运输'),
    
    # --- 传媒 ---
    (r'(传媒|出版|影视|电影|广电|网络|有线$|报业|广告|文化$)', '传媒'),
    (r'(歌华|华数|电广)', '传媒'),
    
    # --- 房地产 ---
    (r'(地产|房产|置业|城投|园区|开发$|高新园|保税)', '房地产'),
    (r'(万科|保利|招商|金地|绿地|华夏幸福)', '房地产'),
    
    # --- 建筑装饰 ---
    (r'(建设|工程|基建|路桥|隧道|装饰|幕墙|园林|设计院)', '建筑装饰'),
    (r'(中(国)?铁|中(国)?交|中建|葛洲坝|中国电建|中国中冶)', '建筑装饰'),
    
    # --- 食品饮料 ---
    (r'(食品|饮料|酒(业|厂)?|乳(业|品)|奶|糖(果|业)?|醋|酱|酵母|肉制品|火腿|榨菜)', '食品饮料'),
    (r'(茅台|五粮液|泸州|汾酒|洋河|古井|水井坊|舍得|老白干|燕京|青岛啤|珠江啤|重庆啤)', '食品饮料'),
    (r'(伊利|蒙牛|光明乳|三元|天润|海天|千禾|安琪|涪陵|恰恰|三只|良品|绝味|双汇)', '食品饮料'),
    
    # --- 医药生物 ---
    (r'(医药|药业|制药|生物|药房|医疗|器械|诊断|基因|疫苗|血制品)', '医药生物'),
    (r'(药明|康龙|泰格|凯莱英|片仔癀|恒瑞|迈瑞|长春高新|智飞)', '医药生物'),
    
    # --- 国防军工 ---
    (r'(军工|防务|航天|航空$|兵(器|装)|导航|雷达|卫星)', '国防军工'),
    (r'(中航|中直|中兵|航发|航宇|航天|北方导航)', '国防军工'),
    
    # --- 农林牧渔 ---
    (r'(农(业|牧|林|产品)?|种(业|植)|养殖|牧业|饲料|渔业|水产|海洋$)', '农林牧渔'),
    (r'(温氏|牧原|新希望|通威|海大|大北农|隆平)', '农林牧渔'),
    
    # --- 商贸零售 ---
    (r'(百货|超市|零售|连锁|贸易|进出口|商业|购物)', '商贸零售'),
    (r'(王府井|永辉|步步高|苏宁|国美|小商品)', '商贸零售'),
    
    # --- 汽车 ---
    (r'(汽车|客车|卡车|轿车|摩托|轮胎|零部件|车灯|轴承)', '汽车'),
    (r'(宇通|金龙|中通|安凯|江淮|江铃)', '汽车'),
    
    # --- 公用事业 ---
    (r'(电力|供电|热电|水电|火电|风电$|燃气|天然气|供热|水务|自来水)', '公用事业'),
    (r'(华能|华电|国电|大唐|长江电力|三峡)', '公用事业'),
    
    # --- 基础化工 ---
    (r'(化工|化学|化肥|农药|助剂|催化剂|涂料|颜料|染料|炭黑)', '基础化工'),
    (r'(万华|恒力|荣盛|恒逸|桐昆|华鲁|鲁西|卫星石)', '基础化工'),
    
    # --- 环保 ---
    (r'(环保|环境|环卫|垃圾|污水|废物|再生|循环|节能|减排|碳(中和|交易))', '环保'),
    
    # --- 通信 ---
    (r'(通信|电信|光纤|光缆|天线|基站|5G)', '通信'),
    
    # --- 纺织服饰 ---
    (r'(纺织|服装|服饰|面料|印染|家纺|皮革|鞋(业|类)?|丝绸)', '纺织服饰'),
    
    # --- 轻工制造 ---
    (r'(造纸|纸业|家具|家居$|包装|文具|首饰|珠宝|玩具)', '轻工制造'),
    
    # --- 家用电器 ---
    (r'(电器|家电|制冷|空调|冰柜|洗衣机|热水器)', '家用电器'),
    
    # --- 建筑材料 ---
    (r'(水泥|玻璃|玻纤|陶瓷|防水|涂料$)', '建筑材料'),
    
    # --- 社会服务 ---
    (r'(旅游|酒店|景区|餐饮|会展|教育|培训)', '社会服务'),
    
    # --- 美容护理 ---
    (r'(化妆|护肤|美容|日化|牙膏|洗发)', '美容护理'),
    
    # --- 非银金融 ---
    (r'(证券|保险|期货|信托|金融$|投(资|行))', '非银金融'),
    
    # --- 石油石化 ---
    (r'(石油|石化|油田|炼化|加油站)', '石油石化'),
    
    # --- 煤炭 ---
    (r'(煤炭|煤业|矿业$|焦化)', '煤炭'),
    
    # --- 机械设备 still uncategorized ---
    (r'(机械|机电|重工|锅炉|泵|阀|齿轮|电机|模具|冲压|锻压)', '机械设备'),
    
    # --- 电力设备 ---
    (r'(光伏|太阳能|风电$|储能|电池|电源|充电|逆变|电缆|变压器)', '电力设备'),
    
    # --- 计算机 lastly ---
    (r'(软件|数据|信息|科技$|系统$|网络$|智能$|电子$)', '计算机'),
]

# ===== WELL-KNOWN STOCK → INDUSTRY HARDCODING =====
# For stocks that keyword rules can't classify correctly
KNOWN_STOCKS: dict[str, str] = {
    '600000': '银行', '600015': '银行', '600016': '银行', '601398': '银行',
    '601939': '银行', '601288': '银行', '601988': '银行', '601328': '银行',
    '600036': '银行', '601166': '银行', '600016': '银行', '000001': '银行',
    '002142': '银行', '601818': '银行', '601229': '银行', '601169': '银行',
    '603986': '电子',  # 兆易创新
    '002415': '电子',  # 海康威视
    '002475': '电子',  # 立讯精密
    '603501': '电子',  # 韦尔股份
    '600745': '电子',  # 闻泰科技
    '300750': '电力设备',  # 宁德时代
    '601012': '电力设备',  # 隆基绿能
    '002129': '电力设备',  # TCL中环
    '300274': '电力设备',  # 阳光电源
    '600519': '食品饮料',  # 贵州茅台
    '000858': '食品饮料',  # 五粮液
    '000568': '食品饮料',  # 泸州老窖
    '002304': '食品饮料',  # 洋河股份
    '603288': '食品饮料',  # 海天味业
    '600887': '食品饮料',  # 伊利股份
    '603259': '医药生物',  # 药明康德
    '300760': '医药生物',  # 迈瑞医疗
    '600276': '医药生物',  # 恒瑞医药
    '300015': '医药生物',  # 爱尔眼科
    '002714': '农林牧渔',  # 牧原股份
    '300498': '农林牧渔',  # 温氏股份
    '000876': '农林牧渔',  # 新希望
    '601138': '电子',  # 工业富联
    '002230': '计算机',  # 科大讯飞
    '688981': '电子',  # 中芯国际
    '601899': '有色金属',  # 紫金矿业
    '600809': '食品饮料',  # 山西汾酒
}

def classify_stock(code: str, name: str, old_industry: str) -> str:
    """Classify a stock to its correct 申万一级 industry."""
    # 1. Hardcoded override
    if code in KNOWN_STOCKS:
        return KNOWN_STOCKS[code]
    
    # 2. If already has a non-"综合" industry, keep it
    if old_industry and old_industry != '综合':
        return old_industry
    
    # 3. Name-based keyword rules
    for pattern, industry in NAME_RULES:
        if re.search(pattern, name):
            return industry
    
    # 4. Code-based hints
    if code.startswith('601') or code.startswith('6000'):
        # Shanghai main board blue chips — try to infer from name
        if re.search(r'(银行|金融)', name):
            return '银行'
    
    # 5. Default: keep as 综合 if we can't figure it out
    return '综合'

# Apply re-classification
changes = 0
old_dist = Counter(item[3] for item in data)
new_data = []
for item in data:
    code, name, market, old_ind = item[0], item[1], item[2], item[3]
    new_ind = classify_stock(code, name, old_ind)
    if new_ind != old_ind:
        changes += 1
    new_data.append([code, name, market, new_ind])

new_dist = Counter(item[3] for item in new_data)

print(f"Reclassified {changes} stocks out of {len(data)}")
print(f"\nIndustry distribution after re-classification:")
for ind, cnt in new_dist.most_common():
    old_cnt = old_dist.get(ind, 0)
    delta = cnt - old_cnt
    delta_str = f" (+{delta})" if delta > 0 else (f" ({delta})" if delta < 0 else "")
    print(f"  {ind}: {cnt}{delta_str}")

# Save the updated list
output_path = '/Users/ego_bai/.openclaw/workspace/a-stock-website/clair-worker/all_stocks_v2.json'
with open(output_path, 'w', encoding='utf-8') as f:
    json.dump(new_data, f, ensure_ascii=False, separators=(',', ':'))

# Generate the JS string for worker.js
js_lines = []
for item in new_data:
    js_lines.append(json.dumps(item, ensure_ascii=False))

js_output = 'const FULL_STOCK_LIST_V2 = [' + ','.join(js_lines) + '];'
js_path = '/Users/ego_bai/.openclaw/workspace/a-stock-website/clair-worker/all_stocks_v2.js'
with open(js_path, 'w', encoding='utf-8') as f:
    f.write(js_output)

print(f"\nSaved re-classified data to {output_path}")
print(f"JS version saved to {js_path} ({len(js_output)} chars)")
print(f"'综合' stocks reduced from {old_dist['综合']} to {new_dist.get('综合', 0)}")
