/**
 * 产业链 DB 数据引擎 — stockFilter 映射
 * 
 * 每个segment从数据库自动查询填充companies
 * 数据始终保持与数据库同步（最新行情、市值等）
 */

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
  { chainId: 'photovoltaic', segmentId: 'silicon-material', segmentName: '硅料', industries: ['电力设备', '有色金属'], nameKeywords: ['硅料', '多晶硅', '颗粒硅'], marketCapMin: 50, leaderCount: 3 },
  { chainId: 'photovoltaic', segmentId: 'silicon-wafer', segmentName: '硅片', industries: ['电力设备'], nameKeywords: ['硅片', '切片', '单晶硅'], marketCapMin: 50, leaderCount: 3 },
  { chainId: 'photovoltaic', segmentId: 'solar-cell', segmentName: '电池片', industries: ['电力设备'], nameKeywords: ['电池', '光伏', '太阳能', '异质结', 'TOPCon'], excludeKeywords: ['玻璃', '组件', '电站', '动力'], marketCapMin: 50, leaderCount: 3 },
  { chainId: 'photovoltaic', segmentId: 'pv-module', segmentName: '光伏组件', industries: ['电力设备'], nameKeywords: ['组件', '光伏', '太阳能'], excludeKeywords: ['电池', '玻璃', '电站'], marketCapMin: 50, leaderCount: 3 },
  { chainId: 'photovoltaic', segmentId: 'inverter', segmentName: '逆变器', industries: ['电力设备'], nameKeywords: ['逆变器', '变流器', '储能'], marketCapMin: 50, leaderCount: 3 },
  { chainId: 'photovoltaic', segmentId: 'pv-station', segmentName: '光伏电站', industries: ['电力设备', '公用事业'], nameKeywords: ['光伏电站', '太阳能', '新能源发电', '运营'], marketCapMin: 30, leaderCount: 3 },

  // ==================== AI机器人产业链 ====================
  { chainId: 'ai-robot', segmentId: 'reducer', segmentName: '减速器', industries: ['机械设备', '汽车'], nameKeywords: ['减速器', '谐波', 'RV', '精密传动'], marketCapMin: 30, leaderCount: 3 },
  { chainId: 'ai-robot', segmentId: 'servo-motor', segmentName: '伺服电机', industries: ['机械设备', '电力设备'], nameKeywords: ['伺服', '电机', '驱动', '控制'], excludeKeywords: ['汽车', '发动机'], marketCapMin: 30, leaderCount: 3 },
  { chainId: 'ai-robot', segmentId: 'controller', segmentName: '控制器', industries: ['机械设备', '计算机'], nameKeywords: ['控制器', '运动控制', '机器人'], excludeKeywords: ['太阳能'], marketCapMin: 30, leaderCount: 3 },
  { chainId: 'ai-robot', segmentId: 'sensor', segmentName: '传感器', industries: ['电子', '计算机', '机械设备'], nameKeywords: ['传感器', '传感', '检测', '激光雷达', '机器视觉', '力觉'], marketCapMin: 30, leaderCount: 3 },
  { chainId: 'ai-robot', segmentId: 'robot-body', segmentName: '机器人本体', industries: ['机械设备'], nameKeywords: ['机器人', '自动化', '智能制造'], excludeKeywords: ['减速器', '电机', '传感器'], marketCapMin: 50, leaderCount: 3 },
];

export default segmentFilters;
