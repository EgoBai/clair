#!/usr/bin/env python3
"""
从公开数据源获取A股行业分类，更新数据库
数据源：申万行业分类标准
"""

import json
import urllib.request
import urllib.parse
import sys

# 申万一级行业分类映射
SHENWAN_INDUSTRIES = {
    '农林牧渔': ['养殖', '种植', '饲料', '林业', '农业', '牧业', '渔业', '种子', '农药', '化肥'],
    '基础化工': ['化工', '化学', '新材料', '橡胶', '塑料', '氟化工', '钛白粉', '涂料', '日化'],
    '钢铁': ['钢铁', '特钢', '钢管', '钢丝', '铁矿', '钒'],
    '有色金属': ['有色', '铜', '铝', '锌', '镍', '钴', '锂', '稀土', '黄金', '白银', '矿业', '矿产', '钼', '钨', '锡', '锑'],
    '电子': ['电子', '半导体', '芯片', '集成电路', 'LED', '面板', '显示', '传感器', '被动元件', 'PCB', 'FPC', '连接器', '电容', '电阻', '电感'],
    '汽车': ['汽车', '整车', '零部件', '轮胎', '电池', '新能源车', '充电桩', '电机', '电控'],
    '家用电器': ['家电', '空调', '冰箱', '洗衣机', '电视', '小家电', '厨电', '清洁电器'],
    '食品饮料': ['食品', '饮料', '白酒', '啤酒', '乳制品', '调味品', '休闲食品', '烘焙', '预制菜'],
    '纺织服饰': ['纺织', '服装', '鞋', '皮革', '面料', '丝绸', '印染'],
    '轻工制造': ['轻工', '造纸', '包装', '印刷', '家居', '家具', '文具'],
    '医药生物': ['医药', '生物', '制药', '疫苗', '诊断', '医疗器械', '中药', '化药', '创新药', 'CRO', 'CDMO', '原料药'],
    '公用事业': ['公用', '水务', '燃气', '电力', '供暖', '环保', '垃圾处理', '污水处理'],
    '交通运输': ['交通', '运输', '航空', '航运', '港口', '铁路', '公路', '物流', '快递', '机场'],
    '房地产': ['房地产', '地产', '物业', '建筑', '装饰', '园林'],
    '商贸零售': ['零售', '商贸', '百货', '超市', '电商', '免税', '便利店'],
    '社会服务': ['服务', '旅游', '酒店', '餐饮', '教育', '体育', '养老', '医疗美容'],
    '传媒': ['传媒', '游戏', '影视', '广告', '出版', '动漫', '网络文学', '直播', '短视频'],
    '计算机': ['计算机', '软件', '信息技术', '互联网', '云计算', '大数据', '人工智能', '网络安全', '物联网', '区块链', 'SaaS', 'ERP', 'OA'],
    '通信': ['通信', '5G', '光纤', '光通信', '物联网', '卫星', '北斗', '通信设备'],
    '银行': ['银行', '城商行', '农商行', '股份制银行'],
    '非银金融': ['证券', '保险', '信托', '期货', '金融', '租赁', '担保'],
    '综合': [],  # 不再使用
    '建筑材料': ['建材', '水泥', '玻璃', '陶瓷', '防水', '涂料'],
    '建筑装饰': ['建筑', '装饰', '装修', '幕墙', '钢结构', '工程'],
    '电力设备': ['电力设备', '光伏', '风电', '储能', '输配电', '变压器', '开关', '电缆'],
    '国防军工': ['军工', '国防', '航空', '航天', '导弹', '雷达', '电子战', '卫星', '北斗'],
    '煤炭': ['煤炭', '焦炭', '焦煤', '动力煤'],
    '石油石化': ['石油', '石化', '炼化', '油服', '天然气'],
    '美容护理': ['美容', '护理', '化妆品', '医美'],
    '环保': ['环保', '环境', '固废', '水处理', '大气治理', '土壤修复'],
    '机械设备': ['机械', '设备', '自动化', '机器人', '数控机床', '工程机械', '农业机械', '矿山机械'],
}


def classify_by_name(name: str, existing_industry: str) -> str:
    """根据股票名称推断行业"""
    # 如果已有合理分类，保留
    if existing_industry and existing_industry != '综合' and existing_industry.strip():
        return existing_industry
    
    # 根据名称关键词匹配
    for industry, keywords in SHENWAN_INDUSTRIES.items():
        if industry == '综合':
            continue
        for kw in keywords:
            if kw in name:
                return industry
    
    # 特殊规则
    if '银行' in name:
        return '银行'
    if '证券' in name or '期货' in name:
        return '非银金融'
    if '保险' in name:
        return '非银金融'
    if '医药' in name or '药业' in name or '制药' in name:
        return '医药生物'
    if '科技' in name:
        return '电子'
    if '信息' in name or '软件' in name or '数据' in name:
        return '计算机'
    if '能源' in name or '电力' in name:
        return '电力设备'
    if '建设' in name or '建筑' in name:
        return '建筑装饰'
    if '投资' in name or '控股' in name:
        return '综合'
    
    return '综合'


if __name__ == '__main__':
    # 读取从数据库导出的股票数据
    # 用法: python3 fetch_industries.py < stocks.json > updates.json
    stocks = json.load(sys.stdin)
    
    updates = []
    for stock in stocks:
        new_industry = classify_by_name(stock['name'], stock.get('industry', ''))
        if new_industry != stock.get('industry', ''):
            updates.append({
                'id': stock['id'],
                'symbol': stock['symbol'],
                'name': stock['name'],
                'old_industry': stock.get('industry', ''),
                'new_industry': new_industry,
            })
    
    json.dump(updates, sys.stdout, ensure_ascii=False, indent=2)
