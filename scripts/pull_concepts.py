#!/usr/bin/env python3
"""
拉取 EastMoney 全A股 真实行业+概念+估值数据，生成 all_stocks_v4.json。
你本机在中国大陆，EastMoney 直连可达（Hermes沙箱环境被封锁，本机不受影响）。
一键运行: cd ~/.openclaw/workspace/a-stock-website && python3 scripts/pull_concepts.py
"""
from __future__ import annotations
import urllib.request, ssl, json, time, os
from collections import Counter

ROOT = os.path.expanduser('~/.openclaw/workspace/a-stock-website')
OUTPUT = os.path.join(ROOT, 'clair-worker', 'all_stocks_v4.json')

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

def fetch_page(page: int, page_size: int = 500) -> dict | None:
    """拉取一页 EastMoney 全A股"""
    markets = 'm:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23'
    fields = 'f12,f14,f100,f103,f129,f130,f131'
    url = (
        f'https://push2.eastmoney.com/api/qt/clist/get?'
        f'pn={page}&pz={page_size}&po=1&np=1&fltt=2&invt=2'
        f'&fid=f3&fs={markets}&fields={fields}'
    )
    req = urllib.request.Request(url, headers={
        'Referer': 'https://quote.eastmoney.com/center/',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
    })
    try:
        with urllib.request.urlopen(req, timeout=30, context=ctx) as resp:
            return json.loads(resp.read().decode('utf-8'))
    except Exception as e:
        print(f"  ❌ 第{page}页失败: {e}")
        return None

def detect_market(code: str) -> str:
    if code.startswith('6'): return 'SH'
    if code.startswith(('0','3')): return 'SZ'
    if code.startswith(('8','4')): return 'BJ'
    return 'SZ'

# 申万一级映射(东财行业→申万)
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

def main():
    print("═══ EastMoney 全A股真实概念数据拉取 ═══\n")
    print("拉取字段: f12(代码) f14(名称) f100(东财行业) f103(概念标签) f129(PE) f130(PB) f131(市值)\n")
    
    all_stocks = []
    page = 1
    page_size = 500
    
    while True:
        print(f"  第{page}页...", end=" ", flush=True)
        data = fetch_page(page, page_size)
        if not data or 'data' not in data:
            print("结束!")
            break
        
        diffs = data['data'].get('diff', [])
        if not diffs:
            print("无数据")
            break
        
        for item in diffs:
            code = item.get('f12', '')
            name = item.get('f14', '')
            em_ind = item.get('f100', '') or ''
            concepts = item.get('f103', '') or ''
            pe = item.get('f129')
            pb = item.get('f130')
            mcap = item.get('f131')
            
            if not code or not name:
                continue
            
            market = detect_market(code)
            sw_ind = EM_TO_SW.get(em_ind, em_ind or '综合')
            
            # 去重概念(comma分隔) -> 取前8个最相关的
            concept_list = [c.strip() for c in concepts.split(',') if c.strip()][:8]
            
            all_stocks.append([code, name, market, sw_ind, concept_list, pe, pb, mcap])
        
        total = data['data'].get('total', 0)
        print(f"{len(diffs)}只 (累计{len(all_stocks)}/{total})")
        
        if page * page_size >= total:
            print(f"  全部拉完! {total}只")
            break
        page += 1
        time.sleep(0.6)
    
    # 保存
    with open(OUTPUT, 'w', encoding='utf-8') as f:
        json.dump(all_stocks, f, ensure_ascii=False, separators=(',',':'))
    
    # 统计
    dist = Counter(x[3] for x in all_stocks)
    concept_total = sum(len(x[4]) for x in all_stocks)
    zonghe = dist.get('综合', 0)
    
    print(f"\n══════ 完成! ══════")
    print(f"股票总数: {len(all_stocks)}")
    print(f"综合占比: {zonghe}/{len(all_stocks)} = {zonghe/len(all_stocks)*100:.1f}%")
    print(f"概念标签总数: {concept_total} (平均 {concept_total/max(1,len(all_stocks)):.1f} 概念/股)")
    print(f"行业类别: {len(dist)} 个")
    print(f"输出文件: {OUTPUT}")
    print(f"文件大小: {os.path.getsize(OUTPUT):,} bytes")
    
    # 样本
    print(f"\n样本(前5只):")
    for s in all_stocks[:5]:
        print(f"  {s[0]} {s[1]} [{s[3]}] 概念({len(s[4])}): {','.join(s[4][:4])}")

if __name__ == '__main__':
    main()
