#!/usr/bin/env python3
"""
Fetch accurate industry classification for all A-stocks from EastMoney API
and generate updated FULL_STOCK_LIST for the Clair Worker.

Strategy:
1. Fetch all 5534 A-stocks with industry (f100), concepts (f103), region (f102)
2. Map EastMoney sub-industries -> Shenwan 2021 Level-1 31 industries
3. Generate compact JSON for Worker embedding
"""

from __future__ import annotations
import json
import time
import urllib.request
import urllib.error
from collections import Counter
from typing import Optional

# EastMoney f100 → 申万一级 (31 industries)
# Based on Shenwan 2021 standard
EM_TO_SW: dict[str, str] = {
    # 电子 (SW: 电子)
    '半导体': '电子', '光学光电子': '电子', '消费电子': '电子',
    '元件': '电子', '电子化学品': '电子', '其他电子': '电子',
    '面板': '电子', '集成电路': '电子', 'LED': '电子',
    
    # 计算机
    '软件开发': '计算机', 'IT服务': '计算机', '计算机设备': '计算机',
    '互联网服务': '计算机', '云服务': '计算机',
    
    # 医药生物
    '化学制药': '医药生物', '中药': '医药生物', '生物制品': '医药生物',
    '医疗器械': '医药生物', '医药商业': '医药生物', '医疗服务': '医药生物',
    '医药制造': '医药生物',
    
    # 机械设备
    '通用设备': '机械设备', '专用设备': '机械设备', '自动化设备': '机械设备',
    '工程机械': '机械设备', '机床制造': '机械设备', '仪器仪表': '机械设备',
    '机器人': '机械设备', '机械行业': '机械设备',
    
    # 电力设备 (新能源)
    '电网设备': '电力设备', '光伏设备': '电力设备', '风电设备': '电力设备',
    '电池': '电力设备', '电机': '电力设备', '电源设备': '电力设备',
    '充电桩': '电力设备', '储能': '电力设备', '输配电气': '电力设备',
    '新能源': '电力设备',
    
    # 基础化工
    '化学制品': '基础化工', '化学原料': '基础化工', '农化制品': '基础化工',
    '塑料制品': '基础化工', '橡胶制品': '基础化工', '氟化工': '基础化工',
    '磷化工': '基础化工', '涂料': '基础化工', '化纤行业': '基础化工',
    '化工行业': '基础化工',
    
    # 有色金属
    '工业金属': '有色金属', '能源金属': '有色金属', '贵金属': '有色金属',
    '小金属': '有色金属', '金属新材料': '有色金属', '有色金属': '有色金属',
    '稀土': '有色金属', '铝': '有色金属', '铜': '有色金属',
    
    # 汽车
    '汽车整车': '汽车', '汽车零部件': '汽车', '摩托车': '汽车',
    '汽车服务': '汽车',
    
    # 食品饮料
    '白酒': '食品饮料', '调味品': '食品饮料', '乳制品': '食品饮料',
    '休闲食品': '食品饮料', '食品': '食品饮料', '饮料': '食品饮料',
    '啤酒': '食品饮料',
    
    # 交通运输
    '航空机场': '交通运输', '航运': '交通运输', '港口': '交通运输',
    '铁路公路': '交通运输', '物流': '交通运输', '快递': '交通运输',
    
    # 传媒
    '游戏': '传媒', '影视院线': '传媒', '数字媒体': '传媒',
    '广告营销': '传媒', '出版': '传媒', '广电': '传媒',
    
    # 轻工制造
    '造纸印刷': '轻工制造', '家居用品': '轻工制造', '珠宝首饰': '轻工制造',
    '文娱用品': '轻工制造',
    
    # 环保
    '环保行业': '环保', '环保设备': '环保',
    
    # 商贸零售
    '百货商店': '商贸零售', '超市': '商贸零售', '贸易': '商贸零售',
    '跨境电商': '商贸零售', '商业百货': '商贸零售',
    
    # 社会服务
    '酒店餐饮': '社会服务', '旅游': '社会服务', '教育': '社会服务',
    '体育': '社会服务',
    
    # 纺织服饰
    '服装': '纺织服饰', '纺织': '纺织服饰', '家纺': '纺织服饰',
    
    # 非银金融
    '证券': '非银金融', '保险': '非银金融', '多元金融': '非银金融',
    '期货': '非银金融',
    
    # 银行
    '银行': '银行',
    
    # 国防军工
    '军工': '国防军工', '航天航空': '国防军工', '船舶制造': '国防军工',
    '地面兵装': '国防军工',
    
    # 通信
    '通信设备': '通信', '通信服务': '通信',
    
    # 公用事业
    '电力': '公用事业', '燃气': '公用事业', '水务': '公用事业',
    '供热': '公用事业', '公用事业': '公用事业',
    
    # 房地产
    '房地产': '房地产', '房地产开发': '房地产', '房产服务': '房地产',
    '物业管理': '房地产',
    
    # 建筑装饰
    '建筑装饰': '建筑装饰', '装修装饰': '建筑装饰', '工程建设': '建筑装饰',
    '装修建材': '建筑装饰',
    
    # 建筑材料
    '水泥建材': '建筑材料', '玻璃玻纤': '建筑材料', '玻璃': '建筑材料',
    '水泥': '建筑材料',
    
    # 农林牧渔
    '农牧饲渔': '农林牧渔', '渔业': '农林牧渔', '农业': '农林牧渔',
    '农药兽药': '农林牧渔', '饲料': '农林牧渔',
    
    # 钢铁
    '钢铁': '钢铁',
    
    # 石油石化
    '石油': '石油石化', '石油开采': '石油石化', '石油化工': '石油石化',
    '采掘': '石油石化',
    
    # 煤炭
    '煤炭': '煤炭',
    
    # 家用电器
    '家电': '家用电器', '家用电器': '家用电器',
    
    # 美容护理
    '美容': '美容护理', '化妆品': '美容护理', '医美': '美容护理',
}

def fetch_page(page: int, page_size: int = 500) -> dict | None:
    """Fetch one page from EastMoney API"""
    markets = 'm:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23'  # 沪A+深A+创业板+科创板
    fields = 'f12,f14,f100,f102,f103,f129,f130,f131'
    url = (
        f'https://push2.eastmoney.com/api/qt/clist/get?'
        f'pn={page}&pz={page_size}&po=1&np=1&fltt=2&invt=2'
        f'&fid=f3&fs={markets}&fields={fields}'
    )
    req = urllib.request.Request(url, headers={
        'Referer': 'https://quote.eastmoney.com',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    })
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            return data
    except urllib.error.HTTPError as e:
        print(f"  HTTP {e.code} on page {page}")
        return None
    except Exception as e:
        print(f"  Error on page {page}: {e}")
        return None

def detect_market(code: str) -> str:
    if code.startswith('6'):
        return 'SH'
    elif code.startswith(('0', '3')):
        return 'SZ'
    elif code.startswith(('8', '4')):
        return 'BJ'
    return 'SZ'

def classify_sw(eastmoney_industry: str) -> str:
    """Map EastMoney f100 → 申万一级"""
    if not eastmoney_industry:
        return '综合'
    
    # Direct lookup
    if eastmoney_industry in EM_TO_SW:
        return EM_TO_SW[eastmoney_industry]
    
    # Prefix match (e.g., "房地产开发" should match "房地产")
    for em, sw in EM_TO_SW.items():
        if eastmoney_industry.startswith(em) or em.startswith(eastmoney_industry):
            return sw
    
    return '综合'

def main():
    print("=== A-Stock Industry Classification Builder ===")
    print("Fetching accurate industry data from EastMoney API...\n")
    
    all_stocks = []
    page = 1
    page_size = 500
    
    while True:
        print(f"  Fetching page {page}...", end=" ", flush=True)
        data = fetch_page(page, page_size)
        if not data or 'data' not in data:
            print("done!")
            break
        
        diffs = data['data'].get('diff', [])
        if not diffs:
            print("no more data")
            break
        
        for item in diffs:
            code = item.get('f12', '')
            name = item.get('f14', '')
            em_industry = item.get('f100', '') or ''
            concepts = item.get('f103', '') or ''
            region = item.get('f102', '') or ''
            
            if not code or not name:
                continue
            
            market = detect_market(code)
            sw_industry = classify_sw(em_industry)
            
            all_stocks.append([
                code,
                name,
                market,
                sw_industry,       # 申万一级     (for sector scoring)
                em_industry,       # EastMoney行业 (for sub-industry drill-down)
                concepts,          # 概念标签     (for concept sector)
            ])
        
        print(f"{len(diffs)} stocks")
        total = data['data'].get('total', 0)
        if page * page_size >= total:
            print(f"  All {total} stocks fetched!")
            break
        
        page += 1
        time.sleep(0.5)  # Rate limiting
    
    print(f"\nTotal stocks fetched: {len(all_stocks)}")
    
    # Statistics
    sw_counter = Counter(s[3] for s in all_stocks)
    em_counter = Counter(s[4] for s in all_stocks)
    
    print(f"\n申万一级分布 ({len(sw_counter)} industries):")
    for ind, cnt in sw_counter.most_common():
        pct = cnt / len(all_stocks) * 100
        print(f"  {ind}: {cnt} ({pct:.1f}%)")
    
    print(f"\nEastMoney行业级数: {len(em_counter)}")
    
    # Generate compact format for Worker (code, name, market, sw_industry, em_industry, concepts)
    output_path = '/Users/ego_bai/.openclaw/workspace/a-stock-website/clair-worker/all_stocks_v2.json'
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(all_stocks, f, ensure_ascii=False, separators=(',', ':'))
    
    print(f"\nSaved to: {output_path}")
    print(f"File size: {len(json.dumps(all_stocks, ensure_ascii=False, separators=(',',':')))} chars")
    
    # Also generate the JS format for FULL_STOCK_LIST
    print("\nGenerating JS format...")
    
    return all_stocks, sw_counter, em_counter

if __name__ == '__main__':
    main()
