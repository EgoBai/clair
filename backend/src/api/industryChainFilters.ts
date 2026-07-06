/**
 * 产业链 DB 数据引擎 — stockFilter 映射
 * 
 * 每个segment从数据库自动查询填充companies
 * 数据始终保持与数据库同步（最新行情、市值等）
 */

import { Router } from 'express';

export const router = Router();

export interface SegmentFilter {
  chainId: string;
  segmentId: string;
  segmentName: string;
  description?: string;
  industries: string[];
  nameKeywords?: string[];
  excludeKeywords?: string[];
  marketCapMin?: number;
  leaderCount?: number;
}

const segmentFilters: SegmentFilter[] = [
  // ==================== AI算力产业链 ====================
  { chainId: 'ai-computing', segmentId: 'optical-chip', segmentName: '光芯片', industries: ['电子', '通信'], nameKeywords: ['光', '光电', '激光', '光模块', '光器件'], excludeKeywords: ['光伏', '光电股份'], marketCapMin: 30, leaderCount: 3 },
  { chainId: 'ai-computing', segmentId: 'pcb', segmentName: 'PCB/载板', industries: ['电子', '计算机'], nameKeywords: ['电路', 'PCB', '载板', '覆铜', '印制板'], marketCapMin: 50, leaderCount: 3 },
  { chainId: 'ai-computing', segmentId: 'optical-module', segmentName: '光模块', industries: ['电子', '通信'], nameKeywords: ['光模块', '光通信', '光器件', '光收发'], marketCapMin: 50, leaderCount: 3 },
  { chainId: 'ai-computing', segmentId: 'switch', segmentName: '交换机', industries: ['通信', '计算机', '电子'], nameKeywords: ['交换机', '路由器', '通信设备', '网络'], marketCapMin: 50, leaderCount: 3 },
  { chainId: 'ai-computing', segmentId: 'server', segmentName: '服务器', industries: ['计算机', '电子'], nameKeywords: ['服务器', '算力', '浪潮', '超算'], marketCapMin: 50, leaderCount: 3 },
  { chainId: 'ai-computing', segmentId: 'data-center', segmentName: '数据中心', industries: ['计算机', '通信'], nameKeywords: ['数据', '云计算', 'IDC', '数据中心', '云服务'], marketCapMin: 30, leaderCount: 3 },
  { chainId: 'ai-computing', segmentId: 'ai-app', segmentName: 'AI应用', industries: ['计算机', '传媒'], nameKeywords: ['AI', '人工智能', '大模型', '算力', '智能'], excludeKeywords: ['光伏'], marketCapMin: 50, leaderCount: 3 },

  // ==================== 半导体产业链 ====================
  { chainId: 'semiconductor', segmentId: 'ic-design', segmentName: 'IC设计', industries: ['电子'], nameKeywords: ['芯片', '微', '半导体', '集成电路', 'IC', '韦尔', '兆易', '君正', '圣邦', '卓胜', '澜起', '瑞芯', '全志', '海光', '寒武', '景嘉'], marketCapMin: 50, leaderCount: 3 },
  { chainId: 'semiconductor', segmentId: 'eda-ip', segmentName: 'EDA/IP', industries: ['电子', '计算机'], nameKeywords: ['EDA', 'IP', '华大', '概伦', '国芯', '芯原', '设计自动化'], marketCapMin: 20, leaderCount: 2 },
  { chainId: 'semiconductor', segmentId: 'semiconductor-equipment', segmentName: '半导体设备', industries: ['电子'], nameKeywords: ['设备', '刻蚀', '薄膜', '清洗', '检测', '光刻', '北方华创', '中微', '盛美', '拓荆', '华峰', '芯源', '至纯'], marketCapMin: 50, leaderCount: 3 },
  { chainId: 'semiconductor', segmentId: 'semiconductor-material', segmentName: '半导体材料', industries: ['电子', '基础化工'], nameKeywords: ['硅', '光刻胶', '电子化学', '靶材', '抛光', '沪硅', '立昂', '雅克', '南大', '安集', '江丰'], excludeKeywords: ['太阳能', '光伏'], marketCapMin: 30, leaderCount: 3 },
  { chainId: 'semiconductor', segmentId: 'wafer-fabrication', segmentName: '晶圆制造', industries: ['电子'], nameKeywords: ['中芯', '华虹', '晶圆', '晶合', '制造'], marketCapMin: 50, leaderCount: 3 },
  { chainId: 'semiconductor', segmentId: 'packaging-testing', segmentName: '封装测试', industries: ['电子'], nameKeywords: ['封装', '封测', '测试', '长电', '通富', '华天', '晶方'], marketCapMin: 50, leaderCount: 3 },
  { chainId: 'semiconductor', segmentId: 'chip-application', segmentName: '芯片应用', industries: ['电子', '计算机', '通信'], nameKeywords: ['芯片', '集成电路', '半导体', 'IC'], marketCapMin: 50, leaderCount: 3 },

  // ==================== 新能源汽车产业链 ====================
  { chainId: 'new-energy-vehicle', segmentId: 'lithium-mining', segmentName: '锂矿/钴镍', industries: ['有色金属'], nameKeywords: ['锂', '钴', '镍', '矿', '盐湖'], marketCapMin: 30, leaderCount: 3 },
  { chainId: 'new-energy-vehicle', segmentId: 'cathode-material', segmentName: '正极材料', industries: ['电力设备', '基础化工'], nameKeywords: ['正极', '三元', '磷酸铁', '前驱体', '锂电材料'], marketCapMin: 50, leaderCount: 3 },
  { chainId: 'new-energy-vehicle', segmentId: 'anode-material', segmentName: '负极材料', industries: ['电力设备', '基础化工'], nameKeywords: ['负极', '石墨', '碳材料', '锂电'], marketCapMin: 30, leaderCount: 3 },
  { chainId: 'new-energy-vehicle', segmentId: 'electrolyte', segmentName: '电解液', industries: ['电力设备', '基础化工'], nameKeywords: ['电解液', '锂盐', '溶剂', '添加剂'], marketCapMin: 30, leaderCount: 2 },
  { chainId: 'new-energy-vehicle', segmentId: 'separator', segmentName: '隔膜', industries: ['电力设备', '基础化工'], nameKeywords: ['隔膜', '膜材料', '锂电'], marketCapMin: 30, leaderCount: 2 },
  { chainId: 'new-energy-vehicle', segmentId: 'battery-cell', segmentName: '动力电池', industries: ['电力设备', '汽车'], nameKeywords: ['电池', '锂电', '动力电池', '新能源'], excludeKeywords: ['材料', '矿'], marketCapMin: 100, leaderCount: 3 },
  { chainId: 'new-energy-vehicle', segmentId: 'motor-controller', segmentName: '电机电控', industries: ['电力设备', '汽车'], nameKeywords: ['电机', '电控', '驱动', '汇川', '新能源', '动力总成'], marketCapMin: 50, leaderCount: 3 },
  { chainId: 'new-energy-vehicle', segmentId: 'vehicle-oem', segmentName: '整车制造', industries: ['汽车'], nameKeywords: ['汽车', '新能源', '电动车', '整车'], excludeKeywords: ['配件', '零部件', '轮胎', '玻璃'], marketCapMin: 200, leaderCount: 3 },
  { chainId: 'new-energy-vehicle', segmentId: 'charging-pile', segmentName: '充电桩', industries: ['电力设备', '汽车'], nameKeywords: ['充电', '充电桩', '充换电'], marketCapMin: 30, leaderCount: 3 },

  // ==================== 光伏产业链 ====================
  // 光伏公司大多归类在"电力设备"行业，需要更宽泛的匹配
  { chainId: 'photovoltaic', segmentId: 'silicon-material', segmentName: '硅料', industries: ['电力设备', '有色金属', '基础化工'], nameKeywords: ['硅', '多晶', '单晶', '颗粒硅', '料'], excludeKeywords: ['汽车', '锂', '电池'], marketCapMin: 30, leaderCount: 3 },
  { chainId: 'photovoltaic', segmentId: 'silicon-wafer', segmentName: '硅片', industries: ['电力设备'], nameKeywords: ['硅片', '切片', '光伏', '太阳能', '单晶', '晶硅'], marketCapMin: 30, leaderCount: 3 },
  { chainId: 'photovoltaic', segmentId: 'solar-cell', segmentName: '电池片', industries: ['电力设备'], nameKeywords: ['光伏', '太阳能', '电池', '组件', 'TOPCon', '异质结', '钙钛矿'], excludeKeywords: ['动力', '锂', '汽车'], marketCapMin: 30, leaderCount: 3 },
  { chainId: 'photovoltaic', segmentId: 'pv-module', segmentName: '光伏组件', industries: ['电力设备'], nameKeywords: ['光伏', '太阳能', '组件', '晶科', '晶澳', '天合', '隆基', '东方日升', '阿特斯'], marketCapMin: 30, leaderCount: 3 },
  { chainId: 'photovoltaic', segmentId: 'inverter', segmentName: '逆变器', industries: ['电力设备'], nameKeywords: ['逆变', '变流', '储能', '阳光', '固德威', '锦浪', '上能', '禾迈'], marketCapMin: 30, leaderCount: 3 },
  { chainId: 'photovoltaic', segmentId: 'pv-station', segmentName: '光伏电站', industries: ['电力设备', '公用事业', '建筑装饰'], nameKeywords: ['光伏', '太阳能', '电站', '新能源', '发电', '运营', '节能'], excludeKeywords: ['组件', '电池', '逆变'], marketCapMin: 30, leaderCount: 3 },

  // ==================== AI机器人产业链 ====================
  { chainId: 'ai-robot', segmentId: 'reducer', segmentName: '减速器', industries: ['机械设备', '汽车'], nameKeywords: ['减速器', '谐波', 'RV', '精密传动'], marketCapMin: 30, leaderCount: 3 },
  { chainId: 'ai-robot', segmentId: 'servo-motor', segmentName: '伺服电机', industries: ['机械设备', '电力设备'], nameKeywords: ['伺服', '电机', '驱动', '控制'], excludeKeywords: ['汽车', '发动机'], marketCapMin: 30, leaderCount: 3 },
  { chainId: 'ai-robot', segmentId: 'controller', segmentName: '控制器', industries: ['机械设备', '计算机'], nameKeywords: ['控制器', '运动控制', '机器人'], excludeKeywords: ['太阳能'], marketCapMin: 30, leaderCount: 3 },
  { chainId: 'ai-robot', segmentId: 'sensor', segmentName: '传感器', industries: ['电子', '计算机', '机械设备'], nameKeywords: ['传感器', '传感', '检测', '激光雷达', '机器视觉', '力觉'], marketCapMin: 30, leaderCount: 3 },
  { chainId: 'ai-robot', segmentId: 'robot-body', segmentName: '机器人本体', industries: ['机械设备'], nameKeywords: ['机器人', '自动化', '智能制造'], excludeKeywords: ['减速器', '电机', '传感器'], marketCapMin: 50, leaderCount: 3 },

  // ==================== 医药生物产业链 ====================
  { chainId: 'medical-pharma', segmentId: 'cro-cdmo', segmentName: 'CRO/CDMO', industries: ['医药生物'], nameKeywords: ['药明', '康龙', '泰格', '昭衍', 'CRO', 'CDMO', '医药研发', '临床', '凯莱英', '博腾', '美迪西', '诺思格'], marketCapMin: 50, leaderCount: 3 },
  { chainId: 'medical-pharma', segmentId: 'innovative-drug', segmentName: '创新药', industries: ['医药生物'], nameKeywords: ['恒瑞', '百济', '信达', '君实', '创新药', '生物药', '单抗', 'PD-1', 'ADC', '双抗', '细胞治疗', '基因'], excludeKeywords: ['医疗', '器械', '服务', '连锁'], marketCapMin: 50, leaderCount: 3 },
  { chainId: 'medical-pharma', segmentId: 'medical-device', segmentName: '医疗器械', industries: ['医药生物'], nameKeywords: ['迈瑞', '联影', '医疗', '器械', '设备', '诊断', '影像', '耗材', '微创', '乐普', '威高'], excludeKeywords: ['服务', '医院', '药', '生物'], marketCapMin: 50, leaderCount: 3 },
  { chainId: 'medical-pharma', segmentId: 'medical-service', segmentName: '医疗服务', industries: ['医药生物'], nameKeywords: ['医疗', '服务', '医院', '体检', '爱尔', '通策', '眼科', '牙科', '国际医学', '美年', '金域', '迪安'], excludeKeywords: ['器械', '药', '设备'], marketCapMin: 30, leaderCount: 3 },

  // ==================== 消费电子产业链 ====================
  { chainId: 'consumer-electronics', segmentId: 'ce-chip-design', segmentName: '芯片设计', industries: ['电子'], nameKeywords: ['芯片', 'IC', '设计', '半导体', '处理器', '射频', '模拟', '数字', '指纹', '触控'], excludeKeywords: ['设备', '材料', '制造', '封装'], marketCapMin: 50, leaderCount: 3 },
  { chainId: 'consumer-electronics', segmentId: 'ce-components', segmentName: '零部件', industries: ['电子'], nameKeywords: ['零', '组件', '连接器', 'PCB', '天线', '声学', '光学', '结构件', '精密', '模切', '散热', '屏蔽'], excludeKeywords: ['整机', '组装', '品牌'], marketCapMin: 30, leaderCount: 3 },
  { chainId: 'consumer-electronics', segmentId: 'ce-assembly', segmentName: '整机组装', industries: ['电子'], nameKeywords: ['组装', '代工', '制造', '整机', 'ODM', 'OEM', '富士康', '立讯', '歌尔', '闻泰', '华勤'], excludeKeywords: ['零', '品牌', '终端'], marketCapMin: 50, leaderCount: 3 },
  { chainId: 'consumer-electronics', segmentId: 'ce-brand', segmentName: '品牌终端', industries: ['电子'], nameKeywords: ['手机', '消费电子', '品牌', '终端', '华为', '小米', 'OPPO', '传音', '可穿戴', '智能'], excludeKeywords: ['零', '组装', '代工'], marketCapMin: 50, leaderCount: 3 },

  // ==================== 国防军工产业链 ====================
  { chainId: 'defense-military', segmentId: 'defense-materials', segmentName: '原材料', industries: ['国防军工', '有色金属'], nameKeywords: ['材料', '钛', '高温合金', '碳纤维', '复合材料', '军工', '特钢', '高温', '合金'], excludeKeywords: ['设备', '系统', '总装'], marketCapMin: 30, leaderCount: 3 },
  { chainId: 'defense-military', segmentId: 'defense-components', segmentName: '零部件', industries: ['国防军工'], nameKeywords: ['零', '部件', '连接器', '传感器', '军工电子', '精密', '轴承', '锻件', '铸件'], excludeKeywords: ['系统', '总装', '主机'], marketCapMin: 30, leaderCount: 3 },
  { chainId: 'defense-military', segmentId: 'defense-subsystem', segmentName: '分系统', industries: ['国防军工'], nameKeywords: ['分系统', '子系统', '发动机', '雷达', '导航', '武器', '火控', '指控', '电', '光'], excludeKeywords: ['总装', '整机', '主机'], marketCapMin: 50, leaderCount: 3 },
  { chainId: 'defense-military', segmentId: 'defense-assembly', segmentName: '总装', industries: ['国防军工'], nameKeywords: ['总装', '整机', '航空', '航天', '船舶', '兵器', '主机厂', '沈飞', '西飞', '航发', '中航', '中国动力', '中国船舶'], excludeKeywords: ['零', '系统', '材料'], marketCapMin: 100, leaderCount: 3 },

  // ==================== 风电产业链 ====================
  { chainId: 'wind-power', segmentId: 'wind-materials', segmentName: '原材料', industries: ['电力设备', '基础化工'], nameKeywords: ['风电', '材料', '玻纤', '碳纤维', '树脂', '钢材', '结构', '叶片材料'], excludeKeywords: ['整机', '运营', '发电'], marketCapMin: 30, leaderCount: 3 },
  { chainId: 'wind-power', segmentId: 'wind-components', segmentName: '零部件(叶片/齿轮箱)', industries: ['电力设备'], nameKeywords: ['叶片', '齿轮箱', '发电机', '轴承', '风电', '铸件', '塔筒', '法兰', '主轴', '变流器'], excludeKeywords: ['整机', '运营', '电场'], marketCapMin: 30, leaderCount: 3 },
  { chainId: 'wind-power', segmentId: 'wind-turbine', segmentName: '整机', industries: ['电力设备'], nameKeywords: ['整机', '风机', '风电', '风电机组', '金风', '远景', '明阳', '运达', '三一', '电气风电'], excludeKeywords: ['零', '叶片', '齿', '材料', '运营'], marketCapMin: 50, leaderCount: 3 },
  { chainId: 'wind-power', segmentId: 'wind-operation', segmentName: '运营', industries: ['电力设备', '公用事业'], nameKeywords: ['运营', '运维', '风电场', '发电', '新能源', '节能', '风电'], excludeKeywords: ['整机', '叶片', '设备制造'], marketCapMin: 30, leaderCount: 3 },
];

export default segmentFilters;
