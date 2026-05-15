#!/usr/bin/env python3
"""Fetch all A-share stocks with Shenwan industry classification."""

import json
import os
import akshare as ak

# ── Shenwan 2021 一级行业 code-to-name mapping ──
SW_INDUSTRY_MAP = {
    '11': '农林牧渔',
    '21': '煤炭',
    '22': '基础化工',
    '23': '钢铁',
    '24': '有色金属',
    '25': '综合',
    '26': '综合',
    '27': '电子',
    '28': '汽车',
    '31': '家用电器',
    '32': '食品饮料',
    '33': '家用电器',
    '34': '食品饮料',
    '35': '纺织服饰',
    '36': '轻工制造',
    '37': '医药生物',
    '41': '公用事业',
    '42': '商贸零售',
    '43': '房地产',
    '44': '社会服务',
    '45': '综合',
    '46': '建筑材料',
    '47': '建筑装饰',
    '48': '银行',
    '49': '非银金融',
    '51': '国防军工',
    '61': '建筑材料',
    '62': '环保',
    '63': '电力设备',
    '64': '机械设备',
    '65': '国防军工',
    '71': '计算机',
    '72': '传媒',
    '73': '通信',
    '74': '煤炭',
    '75': '石油石化',
    '76': '钢铁',
    '77': '美容护理',
}


def get_market(code: str) -> str:
    code = str(code)
    if code.startswith(('60', '68')):
        return 'SH'
    elif code.startswith(('00', '30', '002', '003')):
        return 'SZ'
    elif code.startswith(('8', '4', '92')):
        return 'BJ'
    return 'UNKNOWN'


def main():
    print("=" * 60)
    print("Fetching ALL A-share stocks with SW industry classification")
    print("=" * 60)

    print("\n[1/4] Fetching stock list...")
    all_stocks = ak.stock_info_a_code_name()
    print(f"  Got {len(all_stocks)} stocks")

    print("\n[2/4] Fetching SW industry classification...")
    sw_df = ak.stock_industry_clf_hist_sw()
    sw_latest = sw_df.sort_values('start_date').groupby('symbol').last().reset_index()
    sw_lookup = dict(zip(sw_latest['symbol'], sw_latest['industry_code'].astype(str)))
    print(f"  {len(sw_lookup)} stocks with SW codes")

    print("\n[3/4] Fetching area data (BJ)...")
    area_lookup = {}
    try:
        bj_df = ak.stock_info_bj_name_code()
        area_lookup = dict(zip(bj_df['证券代码'], bj_df['地区']))
        print(f"  Got area for {len(area_lookup)} BJ stocks")
    except Exception as e:
        print(f"  Failed: {e}")

    print("\n[4/4] Building final dataset...")
    result = []
    stats = {'with_industry': 0, 'with_area': 0, 'ind_counts': {}}

    for _, row in all_stocks.iterrows():
        code = str(row['code']).strip()
        name = str(row['name']).strip()
        market = get_market(code)

        industry = ''
        if code in sw_lookup:
            l1 = str(sw_lookup[code])[:2]
            industry = SW_INDUSTRY_MAP.get(l1, f'OTHER_{l1}')
            stats['with_industry'] += 1
            stats['ind_counts'][industry] = stats['ind_counts'].get(industry, 0) + 1

        area = area_lookup.get(code, '')
        if area:
            stats['with_area'] += 1

        result.append({
            'symbol': code,
            'name': name,
            'market': market,
            'industry': industry,
            'concept_tags': [],
            'area': area,
        })

    total = len(result)
    print(f"\n  Total: {total}")
    print(f"  With industry: {stats['with_industry']} ({100*stats['with_industry']/total:.1f}%)")
    print(f"  With area: {stats['with_area']}")
    print(f"  Industries ({len(stats['ind_counts'])}):")
    for ind, cnt in sorted(stats['ind_counts'].items(), key=lambda x: -x[1]):
        print(f"    {ind}: {cnt}")

    output_path = os.path.expanduser(
        '~/.openclaw/workspace/a-stock-website/clair-worker/all_stocks.json'
    )
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(f"\nSaved {total} stocks to {output_path}")
    print(f"Size: {os.path.getsize(output_path):,} bytes")
    print("=" * 60)
    print("Done!")


if __name__ == '__main__':
    main()
