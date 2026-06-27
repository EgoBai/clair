#!/usr/bin/env python3
"""Fetch industry from EastMoney API and classify all stocks."""
import json
import urllib.request
import time
import psycopg2

# EastMoney → 申万一级 mapping (from pull_concepts.py)
EM_TO_SW = {
    '半导体':'电子','光学光电子':'电子','消费电子':'电子','元件':'电子','电子化学品':'电子','其他电子':'电子','面板':'电子','集成电路':'电子','LED':'电子',
    '软件开发':'计算机','IT服务':'计算机','计算机设备':'计算机','互联网服务':'计算机','云服务':'计算机',
    '化学制药':'医药生物','中药':'医药生物','生物制品':'医药生物','医疗器械':'医药生物','医药商业':'医药生物','医疗服务':'医药生物','医药制造':'医药生物',
    '通用设备':'机械设备','专用设备':'机械设备','自动化设备':'机械设备','工程机械':'机械设备','机床制造':'机械设备','仪器仪表':'机械设备','机器人':'机械设备','机械行业':'机械设备',
    '电网设备':'电力设备','光伏设备':'电力设备','风电设备':'电力设备','电池':'电力设备','电机':'电力设备','电源设备':'电力设备','充电桩':'电力设备','储能':'电力设备','输配电气':'电力设备','新能源':'电力设备',
    '化学制品':'基础化工','化学原料':'基础化工','农化制品':'基础化工','塑料制品':'基础化工','橡胶制品':'基础化工','氟化工':'基础化工','磷化工':'基础化工','涂料':'基础化工','化纤行业':'基础化工','化工行业':'基础化工',
    '工业金属':'有色金属','能源金属':'有色金属','贵金属':'有色金属','小金属':'有色金属','金属新材料':'有色金属','有色金属':'有色金属','稀土':'有色金属','铝':'有色金属','铜':'有色金属',
    '汽车整车':'汽车','汽车零部件':'汽车','摩托车':'汽车','汽车服务':'汽车',
    '白酒':'食品饮料','调味品':'食品饮料','乳制品':'食品饮料','休闲食品':'食品饮料','食品':'食品饮料','饮料':'食品饮料','啤酒':'食品饮料',
    '航空机场':'交通运输','航运':'交通运输','港口':'交通运输','铁路公路':'交通运输','物流':'交通运输','快递':'交通运输',
    '游戏':'传媒','影视院线':'传媒','数字媒体':'传媒','广告营销':'传媒','出版':'传媒','广电':'传媒',
    '造纸印刷':'轻工制造','家居用品':'轻工制造','珠宝首饰':'轻工制造','文娱用品':'轻工制造',
    '环保行业':'环保','环保设备':'环保',
    '百货商店':'商贸零售','超市':'商贸零售','贸易':'商贸零售','跨境电商':'商贸零售','商业百货':'商贸零售',
    '酒店餐饮':'社会服务','旅游':'社会服务','教育':'社会服务','体育':'社会服务',
    '服装':'纺织服饰','纺织':'纺织服饰','家纺':'纺织服饰',
    '证券':'非银金融','保险':'非银金融','多元金融':'非银金融','期货':'非银金融',
    '银行':'银行','航天航空':'国防军工','军工':'国防军工','船舶制造':'国防军工','地面兵装':'国防军工',
    '通信设备':'通信','通信服务':'通信',
    '电力':'公用事业','燃气':'公用事业','水务':'公用事业','供热':'公用事业','公用事业':'公用事业',
    '房地产':'房地产','房地产开发':'房地产','房产服务':'房地产','物业管理':'房地产',
    '建筑装饰':'建筑装饰','装修装饰':'建筑装饰','工程建设':'建筑装饰','装修建材':'建筑装饰',
    '水泥建材':'建筑材料','玻璃玻纤':'建筑材料','玻璃':'建筑材料','水泥':'建筑材料',
    '农牧饲渔':'农林牧渔','渔业':'农林牧渔','农业':'农林牧渔','农药兽药':'农林牧渔','饲料':'农林牧渔',
    '钢铁':'钢铁','石油':'石油石化','石油开采':'石油石化','石油化工':'石油石化','采掘':'石油石化',
    '煤炭':'煤炭','家电':'家用电器','家用电器':'家用电器',
    '美容':'美容护理','化妆品':'美容护理','医美':'美容护理',
}

def fetch_page(page=1, page_size=500):
    url = f"https://push2.eastmoney.com/api/qt/clist/get?pn={page}&pz={page_size}&po=1&np=1&fltt=2&invt=2&fid=f3&fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23&fields=f12,f14,f100"
    req = urllib.request.Request(url, headers={
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'https://quote.eastmoney.com/'
    })
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read())

print("Fetching stock list from EastMoney...")
all_stocks = {}
page = 1
while True:
    data = fetch_page(page)
    diffs = data.get('data', {}).get('diff', [])
    if not diffs:
        break
    for item in diffs:
        code = item.get('f12', '')
        name = item.get('f14', '')
        em_ind = item.get('f100', '') or ''
        if code:
            all_stocks[code] = (name, em_ind)
    print(f"  Page {page}: {len(diffs)} stocks, total: {len(all_stocks)}")
    page += 1
    time.sleep(0.3)
    if page > 20:  # Max 10000 stocks
        break

print(f"\nTotal stocks from EastMoney: {len(all_stocks)}")

# Connect to DB and update
conn = psycopg2.connect(host='localhost', port=5432, database='clair', user='postgres')
cur = conn.cursor()

# Get all stocks from DB
cur.execute("SELECT symbol, name, industry FROM stocks WHERE is_active = true")
db_stocks = {r[0]: (r[1], r[2]) for r in cur.fetchall()}

updated = 0
for symbol, (name, db_ind) in db_stocks.items():
    code = symbol.replace('.SH','').replace('.SZ','').replace('.BJ','')
    if code in all_stocks:
        em_name, em_ind = all_stocks[code]
        if em_ind and em_ind in EM_TO_SW:
            sw_ind = EM_TO_SW[em_ind]
            if sw_ind != db_ind and (db_ind == '综合' or sw_ind != db_ind):
                cur.execute(
                    "UPDATE stocks SET industry = %s WHERE symbol = %s",
                    (sw_ind, symbol)
                )
                updated += 1

conn.commit()
print(f"Updated {updated} stocks from EastMoney data")

# Check remaining
cur.execute("""
    SELECT COUNT(*) FROM stocks 
    WHERE is_active = true AND industry = '综合'
    AND name NOT LIKE '%退%' AND name NOT LIKE '%ST%' AND name NOT LIKE '%PT%'
""")
real_remaining = cur.fetchone()[0]

cur.execute("SELECT COUNT(*) FROM stocks WHERE is_active = true AND industry = '综合'")
total_remaining = cur.fetchone()[0]

# Show final distribution
cur.execute("""
    SELECT industry, COUNT(*) as cnt
    FROM stocks WHERE is_active = true
    GROUP BY industry ORDER BY cnt DESC
""")
print(f"\nFinal L1 distribution:")
for row in cur.fetchall():
    print(f"  {row[0]:12s}: {row[1]:5d}")

print(f"\nRemaining '综合' (real): {real_remaining}")
print(f"Total remaining '综合': {total_remaining} ({total_remaining/55.44:.1f}%)")

cur.close()
conn.close()
