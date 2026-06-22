#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Build accurate SW level-1 industry mapping for full A-share universe.
PRIMARY real source: Sina getHQNodeData per sina-industry node (verified reachable).
NO EastMoney. Each node <=2 attempts then skip (fail-fast).
Falls back to name-keyword classifier for stocks Sina doesn't cover.
Output: clair-worker/all_stocks_v3_compact.json  [[code,name,market,sw],...]
"""
import urllib.request, ssl, json, re, time, os, sys
from collections import Counter

ctx = ssl.create_default_context(); ctx.check_hostname=False; ctx.verify_mode=ssl.CERT_NONE
ROOT = os.path.expanduser('~/.openclaw/workspace/a-stock-website')
SINA_REF = 'http://finance.sina.com.cn'

SW31 = ['电子','计算机','医药生物','机械设备','电力设备','基础化工','有色金属','汽车','食品饮料',
        '交通运输','传媒','轻工制造','环保','商贸零售','社会服务','纺织服饰','非银金融','银行',
        '国防军工','通信','公用事业','房地产','建筑装饰','建筑材料','农林牧渔','钢铁','石油石化',
        '煤炭','家用电器','美容护理','综合']

def get(url, gbk=False, ref=SINA_REF, timeout=10):
    req = urllib.request.Request(url, headers={'User-Agent':'Mozilla/5.0','Referer':ref})
    raw = urllib.request.urlopen(req, timeout=timeout, context=ctx).read()
    return raw.decode('gbk', errors='replace') if gbk else raw.decode('utf-8', errors='replace')

def fetch(url, gbk=False, ref=SINA_REF):
    for i in range(2):  # fail-fast: 2 attempts then skip
        try:
            return get(url, gbk=gbk, ref=ref)
        except Exception as e:
            sys.stderr.write(f"  retry{i+1} {type(e).__name__} {url[:70]}\n")
            time.sleep(0.4)
    return None

# ---------- intra-node keyword refiners (for coarse/ambiguous Sina nodes) ----------
def refine_dzxx(name):  # 电子信息 -> 通信/计算机/电子
    if re.search(r'通信|电信|通讯|光纤|网络设备|信通|移动|联通|中兴|烽火', name): return '通信'
    if re.search(r'软件|科技|信息|数据|网络|云|数字|智能|安全|系统|互联|金证|恒生|用友|东软', name): return '计算机'
    return '电子'
def refine_jzjc(name):  # 建筑建材 -> 建筑材料/建筑装饰
    if re.search(r'水泥|玻璃|建材|陶瓷|混凝土|管|涂料|防水|石膏|装饰材料', name): return '建筑材料'
    return '建筑装饰'
def refine_jrhy(name):  # 金融行业 -> 银行/非银金融
    if re.search(r'银行', name): return '银行'
    return '非银金融'
def refine_generic(name):  # 其它行业 / 综合行业 / 次新股 / 物资外贸 / 开发区 -> use full keyword classifier
    return None  # signal: defer to keyword_classify

SINA_MAP = {
 'new_dzxx': refine_dzxx, 'new_jxhy':'机械设备', 'new_qtxy':refine_generic, 'new_swzz':'医药生物',
 'new_dzqj':'电子', 'new_hghy':'基础化工', 'new_stock':refine_generic, 'new_fdc':'房地产',
 'new_qczz':'汽车', 'new_sybh':'商贸零售', 'new_jzjc':refine_jzjc, 'new_jtys':'交通运输',
 'new_ysjs':'有色金属', 'new_fdsb':'电力设备', 'new_nlmy':'农林牧渔', 'new_dlhy':'公用事业',
 'new_gthy':'钢铁', 'new_dqhy':'电力设备', 'new_sphy':'食品饮料', 'new_jrhy':refine_jrhy,
 'new_fzxl':'纺织服饰', 'new_yqyb':'机械设备', 'new_nyhf':'基础化工', 'new_fzhy':'纺织服饰',
 'new_mthy':'煤炭', 'new_cmyl':'传媒', 'new_jdhy':'家用电器', 'new_jdly':'社会服务',
 'new_ljhy':'食品饮料', 'new_slzp':'基础化工', 'new_zhhy':refine_generic, 'new_ylqx':'医药生物',
 'new_hbhy':'环保', 'new_hqhy':'基础化工', 'new_snhy':'建筑材料', 'new_gsgq':'公用事业',
 'new_syhy':'石油石化', 'new_zzhy':'轻工制造', 'new_wzwm':'商贸零售', 'new_glql':'交通运输',
 'new_ysbz':'轻工制造', 'new_blhy':'建筑材料', 'new_jjhy':'轻工制造', 'new_fjzz':'国防军工',
 'new_kfq':refine_generic, 'new_cbzz':'国防军工', 'new_fzjx':'机械设备', 'new_tchy':'建筑材料',
 'new_mtc':'汽车',
}

# ---------- name-keyword classifier (ordered specific->general) for the gap ----------
KW = [
 ('银行', r'银行'),
 ('非银金融', r'证券|保险|信托|期货|租赁|创投|金控|资本控股|国元|东方财富|同花顺|财富管理'),
 ('医药生物', r'药|医药|生物|制药|医疗|健康|疫苗|基因|血制品|诊断|医学|生命|康|健帆|安科|迈瑞|医美(?=医)'),
 ('白酒占位', r'白酒|啤酒|葡萄酒|黄酒|酒业|酒厂|酒鬼|老窖|郎酒|汾酒|茅台|五粮'),  # ->食品饮料
 ('食品饮料', r'食品|饮料|乳业|乳品|肉|糖业|食糖|调味|食|饮|烘焙|休闲食|粮油|味|奶'),
 ('家用电器', r'电器|家电|空调|冰箱|厨电|小家电|美的|格力|海尔|苏泊尔|九阳'),
 ('白电占位', r''),
 ('汽车', r'汽车|车业|轮胎|客车|轿车|摩托|汽配|车灯|座椅|车桥|底盘|整车'),
 ('国防军工', r'军工|航天|兵器|船舶|导弹|雷达|飞机|国防|航空工业|沈飞|航发|军|船'),
 ('通信', r'通信|电信|通讯|光纤|光通信|联通|中兴|烽火|网络设备|射频|天线'),
 ('计算机', r'软件|网络|信息技术|数据|云计算|数字|网安|系统|信息安全|信创|金融科技|国芯软|用友|恒生电子'),
 ('电子', r'电子|半导体|芯片|光电|显示|面板|集成电路|元器件|LED|封装|PCB|晶|激光|传感|光学|存储'),
 ('传媒', r'传媒|影视|文化|出版|广电|游戏|网游|广告|报业|动漫|院线|视频|阅文'),
 ('电力设备', r'电气|光伏|锂电|储能|风电|变压器|电池|电机|逆变|新能源|输配电|电力设备|开关|线缆|充电'),
 ('有色金属', r'有色|黄金|铜业|铝业|锌|稀土|钴|镍业|钼|锂业|金属|贵金属|矿业|冶炼'),
 ('钢铁', r'钢铁|钢|特钢|不锈钢|铁'),
 ('煤炭', r'煤|焦化|焦炭|煤业|动力煤'),
 ('石油石化', r'石油|石化|油气|炼化|油服|燃油|原油|沥青'),
 ('基础化工', r'化工|化学|塑料|橡胶|化纤|涂料|树脂|钛白|氟化|纯碱|染料|农药|化肥|新材料|尼龙|聚'),
 ('建筑材料', r'水泥|玻璃|建材|陶瓷|混凝土|管材|石膏|防水|耐火'),
 ('建筑装饰', r'建设|建工|建筑|工程|基建|装饰|园林|设计院|路桥|市政|钢构|安装'),
 ('农林牧渔', r'农业|牧业|渔业|种业|养殖|饲料|园艺|林业|水产|生态农|农牧|畜|种子|海大'),
 ('交通运输', r'交通|运输|航运|港口|物流|高速|公路|铁路|航空|机场|海运|快递|货运|港务'),
 ('环保', r'环保|环境|水处理|固废|节能|净化|生态环|污水|垃圾'),
 ('公用事业', r'电力|水务|供水|燃气|热力|公用|能源(?!.*煤)|发电|新奥|华能|大唐|国电'),
 ('商贸零售', r'商业|百货|零售|商贸|超市|购物|连锁|商城|批发|供应链|永辉|物美'),
 ('社会服务', r'旅游|酒店|餐饮|教育|景区|服务|人力资源|会展|文旅|演艺|职业'),
 ('纺织服饰', r'纺织|服装|服饰|鞋业|家纺|印染|棉|针织|羽绒|皮革|时尚'),
 ('轻工制造', r'轻工|造纸|包装|印刷|家居|家具|文具|玩具|木业|纸业|晨光|珠宝|钟表'),
 ('机械设备', r'机械|机床|重工|装备|机电|泵|阀门|轴承|液压|齿轮|工程机械|仪器|仪表|自动化|机器人'),
 ('美容护理', r'化妆|美容|护理|日化|个护|珀莱雅|上海家化|洗护'),
 ('房地产', r'地产|置业|城建|房产|园区开发|控股集团(?=.*地)|房'),
]
KW_MAP = {'白酒占位':'食品饮料','白电占位':'家用电器'}
def kw_to_sw(label):
    return KW_MAP.get(label, label)

def keyword_classify(name):
    n = name.replace('ST','').replace('*','').strip()
    for label, pat in KW:
        if pat and re.search(pat, n):
            sw = kw_to_sw(label)
            if sw in SW31: return sw
    return None

# ================= STEP 1: load full universe =================
universe = json.load(open(os.path.join(ROOT,'clair-worker','all_stocks_compact.json')))
print(f"universe: {len(universe)} stocks", flush=True)
name_by_code = {row[0]: row[1] for row in universe}

# ================= STEP 2: Sina industry list =================
print("fetching Sina industry list...", flush=True)
r = fetch("http://vip.stock.finance.sina.com.cn/q/view/newSinaHy.php", gbk=True)
sina_nodes = []
if r:
    m = re.search(r'\{.*\}', r, re.S)
    d = json.loads(m.group(0))
    for k, v in d.items():
        sina_nodes.append((k, v.split(',')[1]))
print(f"sina industries: {len(sina_nodes)}", flush=True)

# ================= STEP 3: pull constituents per node =================
sina_assign = {}   # code -> sw
node_stats = {}
for node, sname in sina_nodes:
    mapper = SINA_MAP.get(node)
    page = 1; got = 0
    while True:
        url = (f"http://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/"
               f"Market_Center.getHQNodeData?page={page}&num=100&sort=symbol&asc=1&node={node}")
        body = fetch(url, gbk=True)
        if body is None:
            break
        body = body.strip()
        if not body or body == '[]' or body == 'null':
            break
        try:
            arr = json.loads(body)
        except Exception:
            break
        if not arr:
            break
        for it in arr:
            code = it.get('code')
            nm = it.get('name','')
            if not code:
                continue
            if callable(mapper):
                sw = mapper(nm)
                if sw is None:  # refine_generic -> defer to keyword classifier
                    sw = keyword_classify(nm)
            else:
                sw = mapper
            if sw and sw in SW31 and sw != '综合':
                # don't overwrite a specific assignment with a generic one
                sina_assign.setdefault(code, sw)
                got += 1
        if len(arr) < 100:
            break
        page += 1
        if page > 60:
            break
    node_stats[node] = (sname, got)
    print(f"  {node} {sname}: assigned {got}", flush=True)

print(f"\nSina real-data assignments (unique codes): {len(sina_assign)}", flush=True)

# ================= STEP 4: build final mapping over universe =================
final = []
src = Counter()
for code, name, market, old_ind in universe:
    sw = sina_assign.get(code)
    if sw:
        src['sina'] += 1
    else:
        sw = keyword_classify(name)
        if sw:
            src['keyword'] += 1
        else:
            # last resort: keep a trustworthy old non-generic assignment? old data is polluted
            # for 计算机/电子 (over-stuffed) we DON'T trust; for narrow categories we do
            trustworthy_old = {'银行','非银金融','钢铁','煤炭','石油石化','有色金属','房地产',
                               '交通运输','建筑材料','农林牧渔','公用事业','纺织服饰','家用电器',
                               '美容护理','环保','食品饮料','医药生物','汽车','国防军工','通信',
                               '建筑装饰','商贸零售','社会服务','轻工制造','基础化工','机械设备',
                               '电力设备','传媒'}
            if old_ind in trustworthy_old:
                sw = old_ind; src['old'] += 1
            else:
                sw = '综合'; src['综合'] += 1
    final.append([code, name, market, sw])

# ================= STEP 5: write output + report =================
outpath = os.path.join(ROOT,'clair-worker','all_stocks_v3_compact.json')
with open(outpath,'w') as f:
    json.dump(final, f, ensure_ascii=False, separators=(',',':'))

dist = Counter(x[3] for x in final)
total = len(final)
zh = dist.get('综合',0)
print("\n================ REPORT ================")
print(f"output: {outpath}")
print(f"total stocks: {total}")
print(f"source split: {dict(src)}")
print(f"综合: {zh}  ({zh*100/total:.2f}%)")
print("\nSW31 distribution:")
for k in SW31:
    v = dist.get(k,0)
    print(f"  {k}\t{v}\t{v*100/total:.1f}%")
extra = [k for k in dist if k not in SW31]
if extra:
    print("NON-SW31 labels present (bug):", {k:dist[k] for k in extra})
