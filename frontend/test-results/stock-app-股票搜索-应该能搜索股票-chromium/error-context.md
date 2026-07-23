# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: stock-app.spec.ts >> 股票搜索 >> 应该能搜索股票
- Location: e2e/stock-app.spec.ts:41:7

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.fill: Test timeout of 30000ms exceeded.
Call log:
  - waiting for locator('[data-search-input] input, .ant-select input').first()

```

# Page snapshot

```yaml
- generic [ref=e4]:
  - navigation:
    - generic [ref=e5]:
      - generic [ref=e6]:
        - heading "澄观" [level=2] [ref=e7]
        - generic [ref=e8]: Clair · 水静则明
      - list [ref=e9]:
        - listitem [ref=e10]:
          - link "🔭 市场洞察 ▶" [ref=e11] [cursor=pointer]:
            - /url: /
            - generic [ref=e12]: 🔭
            - generic [ref=e13]: 市场洞察
            - generic [ref=e14]: ▶
        - listitem [ref=e15]:
          - link "🎯 策略选股" [ref=e16] [cursor=pointer]:
            - /url: /screener
            - generic [ref=e17]: 🎯
            - generic [ref=e18]: 策略选股
        - listitem [ref=e19]:
          - link "⭐ 自选组合" [ref=e20] [cursor=pointer]:
            - /url: /watchlist
            - generic [ref=e21]: ⭐
            - generic [ref=e22]: 自选组合
        - listitem [ref=e23]:
          - link "🗺️ 产业地图" [ref=e24] [cursor=pointer]:
            - /url: /industry-map
            - generic [ref=e25]: 🗺️
            - generic [ref=e26]: 产业地图
        - listitem [ref=e27]:
          - link "🏆 潜力雷达" [ref=e28] [cursor=pointer]:
            - /url: /radar
            - generic [ref=e29]: 🏆
            - generic [ref=e30]: 潜力雷达
        - listitem [ref=e31]:
          - link "📝 投资笔记" [ref=e32] [cursor=pointer]:
            - /url: /knowledge
            - generic [ref=e33]: 📝
            - generic [ref=e34]: 投资笔记
      - generic [ref=e35]:
        - generic [ref=e38]: 服务正常
        - generic [ref=e39]: v1.0.0
  - main [ref=e40]:
    - generic [ref=e44]:
      - generic [ref=e46]:
        - generic [ref=e47]:
          - img "compass" [ref=e48]:
            - img [ref=e49]
          - heading "发掘" [level=3] [ref=e51]
        - text: 板块景气度评分 → 点击板块查看个股详情
      - generic [ref=e52]:
        - generic [ref=e53]:
          - generic [ref=e54]:
            - generic [ref=e55]: 🔥
            - generic [ref=e56]:
              - generic [ref=e57]: 强势上攻
              - generic [ref=e58]:
                - generic [ref=e59]: AI 实时解读
                - generic [ref=e60]: 综合31板块 · 多维度分析
          - generic [ref=e61]:
            - generic [ref=e62]:
              - generic [ref=e63]: 个股涨跌
              - generic [ref=e64]:
                - generic [ref=e65]: "3994"
                - generic [ref=e68]: "1139"
              - generic [ref=e69]: 全市场 3994涨1139跌
            - generic [ref=e70]:
              - generic [ref=e71]: 指数均幅
              - generic [ref=e72]: 0.00%
            - generic [ref=e73]:
              - generic [ref=e74]: 涨停
              - generic [ref=e75]: "150"
            - generic [ref=e76]:
              - generic [ref=e77]: 跌停
              - generic [ref=e78]: "8"
        - generic [ref=e79]:
          - generic [ref=e80]:
            - generic [ref=e81]:
              - generic [ref=e82]:
                - generic [ref=e83]: 📊
                - generic [ref=e84]: 市场情绪
                - generic [ref=e85]: 核心
              - generic [ref=e86]:
                - generic [ref=e88]: 强势上攻 · 市场做多情绪高涨，3994只上涨、1139只下跌。
                - generic [ref=e90]: 领涨板块：电力设备(75分+4.0%)、有色金属(51分+3.1%)、基础化工(45分+2.6%)
                - generic [ref=e92]: 涨停145家，集中：电力设备31只涨停、有色金属9只涨停、基础化工11只涨停、机械设备14只涨停、环保2只涨停、综合18只涨停、电子11只涨停、计算机8只涨停、建筑装饰3只涨停、石油石化3只涨停、轻工制造4只涨停、纺织服饰3只涨停、公用事业5只涨停、汽车2只涨停、农林牧渔2只涨停、建筑材料2只涨停、房地产4只涨停、通信2只涨停、医药生物6只涨停
            - generic [ref=e93]:
              - generic [ref=e94]:
                - generic [ref=e95]: 💰
                - generic [ref=e96]: 资金流向
              - generic [ref=e97]:
                - generic [ref=e99]: 上涨3994只，下跌1139只，平盘408只
                - generic [ref=e101]: 成交额：2.18万亿
                - generic [ref=e103]: 涨停：145家
                - generic [ref=e105]: 资金聚焦方向：电力设备(75分+4.0%)、有色金属(51分+3.1%)
                - generic [ref=e107]: 操作建议：可适度参与强势板块，设好止损
            - generic [ref=e108]:
              - generic [ref=e109]:
                - generic [ref=e110]: 📰
                - generic [ref=e111]: 策略参考
              - generic [ref=e112]:
                - generic [ref=e113]:
                  - generic [ref=e114]: ›
                  - generic [ref=e115]: · 关注景气度>70的高景气板块
                - generic [ref=e116]:
                  - generic [ref=e117]: ›
                  - generic [ref=e118]: · 注意板块轮动节奏
                - generic [ref=e119]:
                  - generic [ref=e120]: ›
                  - generic [ref=e121]: · 强势板块回调可关注
                - generic [ref=e123]: ⚠️ 以上为规则引擎分析，不构成投资建议
          - generic [ref=e124]:
            - generic [ref=e125]:
              - generic [ref=e126]: 📊 关键信号
              - generic [ref=e127]:
                - generic [ref=e128]:
                  - generic [ref=e129]: 上涨家数
                  - generic [ref=e130]: "3994"
                - generic [ref=e131]:
                  - generic [ref=e132]: 下跌家数
                  - generic [ref=e133]: "1139"
                - generic [ref=e135]:
                  - generic [ref=e136]: 涨停家数
                  - generic [ref=e137]: 150 只
                - generic [ref=e138]:
                  - generic [ref=e139]: 跌停家数
                  - generic [ref=e140]: 8 只
                - generic [ref=e142]:
                  - generic [ref=e143]: 市场总成交
                  - generic [ref=e144]: 21846.9亿
                - generic [ref=e145]:
                  - generic [ref=e146]: 景气 > 70
                  - generic [ref=e147]: 1 个
            - generic [ref=e148]:
              - generic [ref=e149]: 🏆 领涨板块
              - generic [ref=e150]:
                - generic [ref=e151] [cursor=pointer]:
                  - generic [ref=e152]: 电力设备
                  - generic [ref=e153]: +4.0%
                - generic [ref=e154] [cursor=pointer]:
                  - generic [ref=e155]: 环保
                  - generic [ref=e156]: +3.2%
                - generic [ref=e157] [cursor=pointer]:
                  - generic [ref=e158]: 有色金属
                  - generic [ref=e159]: +3.1%
                - generic [ref=e160] [cursor=pointer]:
                  - generic [ref=e161]: 国防军工
                  - generic [ref=e162]: +2.8%
                - generic [ref=e163] [cursor=pointer]:
                  - generic [ref=e164]: 基础化工
                  - generic [ref=e165]: +2.6%
            - generic [ref=e166]:
              - generic [ref=e167]: 📉 弱势板块
              - generic [ref=e168]:
                - generic [ref=e169] [cursor=pointer]:
                  - generic [ref=e170]: 电子
                  - generic [ref=e171]: 0.3%
                - generic [ref=e172] [cursor=pointer]:
                  - generic [ref=e173]: 医药生物
                  - generic [ref=e174]: 0.7%
                - generic [ref=e175] [cursor=pointer]:
                  - generic [ref=e176]: 银行
                  - generic [ref=e177]: 0.7%
        - generic [ref=e178]:
          - button "filter 立即筛选" [ref=e179] [cursor=pointer]:
            - img "filter" [ref=e181]:
              - img [ref=e182]
            - generic [ref=e184]: 立即筛选
          - button "apartment 产业地图" [ref=e185] [cursor=pointer]:
            - img "apartment" [ref=e187]:
              - img [ref=e188]
            - generic [ref=e190]: 产业地图
          - generic [ref=e191]: 数据实时更新 · 点击板块查看详情
      - generic [ref=e192]:
        - generic [ref=e193]:
          - generic [ref=e194] [cursor=pointer]:
            - generic [ref=e195]: 上证指数
            - generic [ref=e196]: 3,876.78
            - generic [ref=e197]: +0.25%
          - generic [ref=e198] [cursor=pointer]:
            - generic [ref=e199]: 深证成指
            - generic [ref=e200]: 14,123.31
            - generic [ref=e201]: +0.44%
          - generic [ref=e202] [cursor=pointer]:
            - generic [ref=e203]: 创业板指
            - generic [ref=e204]: 3,575.52
            - generic [ref=e205]: +0.25%
          - generic [ref=e206] [cursor=pointer]:
            - generic [ref=e207]: 上证50
            - generic [ref=e208]: 2,978.77
            - generic [ref=e209]: "-0.41%"
          - generic [ref=e210] [cursor=pointer]:
            - generic [ref=e211]: 沪深300
            - generic [ref=e212]: 4,728
            - generic [ref=e213]: +0.23%
          - generic [ref=e214] [cursor=pointer]:
            - generic [ref=e215]: 中证500
            - generic [ref=e216]: 7,734.31
            - generic [ref=e217]: "-0.22%"
          - generic [ref=e218] [cursor=pointer]:
            - generic [ref=e219]: 中证1000
            - generic [ref=e220]: 7,195.5
            - generic [ref=e221]: +0.51%
          - generic [ref=e222] [cursor=pointer]:
            - generic [ref=e223]: 科创50
            - generic [ref=e224]: 1,789.69
            - generic [ref=e225]: "-3.78%"
          - generic [ref=e226] [cursor=pointer]:
            - generic [ref=e227]: 中小100
            - generic [ref=e228]: 8,714.92
            - generic [ref=e229]: +0.37%
        - generic [ref=e230]:
          - generic [ref=e231]: 板块宽度
          - generic [ref=e232]:
            - generic [ref=e233]: 31 涨
            - generic [ref=e234]: 0 跌
            - generic [ref=e235]: 100%
          - generic [ref=e238]:
            - generic [ref=e239]:
              - text: 🏆 电力设备 景气度
              - generic [ref=e240]: 75分
            - generic [ref=e241]:
              - text: 🏆 有色金属 景气度
              - generic [ref=e242]: 51分
      - generic [ref=e243]:
        - generic [ref=e244]:
          - strong [ref=e246]: 🏢 板块景气度评分
          - generic [ref=e247]: 综合评分 = 板块热度×50% + 成交活跃×30% + 赚钱效应×20%
        - generic [ref=e248]:
          - generic [ref=e249]:
            - generic [ref=e250] [cursor=pointer]: 行业板块
            - generic [ref=e251] [cursor=pointer]: 概念板块
          - generic [ref=e252]:
            - generic [ref=e253] [cursor=pointer]: 一级
            - generic [ref=e254] [cursor=pointer]: 二级
      - generic [ref=e255]:
        - generic [ref=e256] [cursor=pointer]:
          - generic [ref=e257]:
            - generic [ref=e258]: "75"
            - generic [ref=e259]: 高景气
          - generic [ref=e260]:
            - generic [ref=e261]:
              - strong [ref=e263]: 电力设备
              - generic [ref=e264]: 253只
              - generic [ref=e265]: 🔥31涨停
              - button "apartment 产业链" [ref=e266]:
                - img "apartment" [ref=e268]:
                  - img [ref=e269]
                - generic [ref=e271]: 产业链
            - generic [ref=e272]:
              - generic [ref=e273]: 🔥 50
              - generic [ref=e274]: 💰 5
              - generic [ref=e275]: 🎯 20
              - generic [ref=e276]: +3.95%
              - generic [ref=e277]: 额1071.3亿
              - generic [ref=e278]:
                - generic [ref=e279]: 拥挤18
                - generic [ref=e280]: 扩散0
                - generic [ref=e281]: 集中12
                - generic [ref=e282]: 小白0
                - generic [ref=e283]: 回补2
                - generic [ref=e284]: 恐慌20
                - generic [ref=e285]: 动摇10
                - generic [ref=e286]: 宝妈20
                - generic [ref=e287]: 搜索20
                - generic [ref=e288]: 传播20
                - generic [ref=e289]: "20"
                - generic [ref=e290]: "20"
                - generic [ref=e291]: "20"
                - generic [ref=e292]: "5"
                - generic [ref=e293]: 📈62
                - generic [ref=e294]: 🔥79
          - img "right" [ref=e295]:
            - img [ref=e296]
        - generic [ref=e298] [cursor=pointer]:
          - generic [ref=e299]:
            - generic [ref=e300]: "51"
            - generic [ref=e301]: 较活跃
          - generic [ref=e302]:
            - generic [ref=e303]:
              - strong [ref=e305]: 有色金属
              - generic [ref=e306]: 155只
              - generic [ref=e307]: 🔥9涨停
              - button "apartment 产业链" [ref=e308]:
                - img "apartment" [ref=e310]:
                  - img [ref=e311]
                - generic [ref=e313]: 产业链
            - generic [ref=e314]:
              - generic [ref=e315]: 🔥 39
              - generic [ref=e316]: 💰 6
              - generic [ref=e317]: 🎯 6
              - generic [ref=e318]: +3.10%
              - generic [ref=e319]: 额1417.4亿
              - generic [ref=e320]:
                - generic [ref=e321]: 拥挤19
                - generic [ref=e322]: 扩散0
                - generic [ref=e323]: 集中12
                - generic [ref=e324]: 小白0
                - generic [ref=e325]: 回补2
                - generic [ref=e326]: 恐慌20
                - generic [ref=e327]: 动摇10
                - generic [ref=e328]: 宝妈20
                - generic [ref=e329]: 搜索20
                - generic [ref=e330]: 传播15
                - generic [ref=e331]: "20"
                - generic [ref=e332]: "20"
                - generic [ref=e333]: "20"
                - generic [ref=e334]: "5"
                - generic [ref=e335]: 📈57
                - generic [ref=e336]: 🔥80
          - img "right" [ref=e337]:
            - img [ref=e338]
        - generic [ref=e340] [cursor=pointer]:
          - generic [ref=e341]:
            - generic [ref=e342]: "45"
            - generic [ref=e343]: 较活跃
          - generic [ref=e344]:
            - generic [ref=e345]:
              - strong [ref=e347]: 基础化工
              - generic [ref=e348]: 402只
              - generic [ref=e349]: 🔥11涨停
              - button "apartment 产业链" [ref=e350]:
                - img "apartment" [ref=e352]:
                  - img [ref=e353]
                - generic [ref=e355]: 产业链
            - generic [ref=e356]:
              - generic [ref=e357]: 🔥 33
              - generic [ref=e358]: 💰 5
              - generic [ref=e359]: 🎯 7
              - generic [ref=e360]: +2.60%
              - generic [ref=e361]: 额1240.6亿
              - generic [ref=e362]:
                - generic [ref=e363]: 拥挤19
                - generic [ref=e364]: 扩散0
                - generic [ref=e365]: 集中9
                - generic [ref=e366]: 小白0
                - generic [ref=e367]: 回补2
                - generic [ref=e368]: 恐慌20
                - generic [ref=e369]: 动摇10
                - generic [ref=e370]: 宝妈20
                - generic [ref=e371]: 搜索20
                - generic [ref=e372]: 传播10
                - generic [ref=e373]: "20"
                - generic [ref=e374]: "20"
                - generic [ref=e375]: "15"
                - generic [ref=e376]: "5"
                - generic [ref=e377]: 📈52
                - generic [ref=e378]: 🔥73
          - img "right" [ref=e379]:
            - img [ref=e380]
        - generic [ref=e382] [cursor=pointer]:
          - generic [ref=e383]:
            - generic [ref=e384]: "44"
            - generic [ref=e385]: 一般
          - generic [ref=e386]:
            - generic [ref=e387]:
              - strong [ref=e389]: 机械设备
              - generic [ref=e390]: 411只
              - generic [ref=e391]: 🔥14涨停
              - button "apartment 产业链" [ref=e392]:
                - img "apartment" [ref=e394]:
                  - img [ref=e395]
                - generic [ref=e397]: 产业链
            - generic [ref=e398]:
              - generic [ref=e399]: 🔥 29
              - generic [ref=e400]: 💰 6
              - generic [ref=e401]: 🎯 9
              - generic [ref=e402]: +2.27%
              - generic [ref=e403]: 额1434.2亿
              - generic [ref=e404]:
                - generic [ref=e405]: 拥挤19
                - generic [ref=e406]: 扩散0
                - generic [ref=e407]: 集中16
                - generic [ref=e408]: 小白0
                - generic [ref=e409]: 回补2
                - generic [ref=e410]: 恐慌20
                - generic [ref=e411]: 动摇10
                - generic [ref=e412]: 宝妈20
                - generic [ref=e413]: 搜索20
                - generic [ref=e414]: 传播10
                - generic [ref=e415]: "20"
                - generic [ref=e416]: "20"
                - generic [ref=e417]: "10"
                - generic [ref=e418]: "5"
                - generic [ref=e419]: 📈52
                - generic [ref=e420]: 🔥75
          - img "right" [ref=e421]:
            - img [ref=e422]
        - generic [ref=e424] [cursor=pointer]:
          - generic [ref=e425]:
            - generic [ref=e426]: "42"
            - generic [ref=e427]: 一般
          - generic [ref=e428]:
            - generic [ref=e429]:
              - strong [ref=e431]: 环保
              - generic [ref=e432]: 66只
              - generic [ref=e433]: 🔥2涨停
              - button "apartment 产业链" [ref=e434]:
                - img "apartment" [ref=e436]:
                  - img [ref=e437]
                - generic [ref=e439]: 产业链
            - generic [ref=e440]:
              - generic [ref=e441]: 🔥 41
              - generic [ref=e442]: 💰 1
              - generic [ref=e443]: 🎯 1
              - generic [ref=e444]: +3.20%
              - generic [ref=e445]: 额127.9亿
              - generic [ref=e446]:
                - generic [ref=e447]: 拥挤19
                - generic [ref=e448]: 扩散1
                - generic [ref=e449]: 集中20
                - generic [ref=e450]: 小白0
                - generic [ref=e451]: 回补2
                - generic [ref=e452]: 恐慌20
                - generic [ref=e453]: 动摇5
                - generic [ref=e454]: 宝妈20
                - generic [ref=e455]: 搜索20
                - generic [ref=e456]: 传播10
                - generic [ref=e457]: "20"
                - generic [ref=e458]: "20"
                - generic [ref=e459]: "20"
                - generic [ref=e460]: "5"
                - generic [ref=e461]: 📈53
                - generic [ref=e462]: 🔥87
          - img "right" [ref=e463]:
            - img [ref=e464]
        - generic [ref=e466] [cursor=pointer]:
          - generic [ref=e467]:
            - generic [ref=e468]: "41"
            - generic [ref=e469]: 一般
          - generic [ref=e470]:
            - generic [ref=e471]:
              - strong [ref=e473]: 综合
              - generic [ref=e474]: 528只
              - generic [ref=e475]: 🔥18涨停
              - button "apartment 产业链" [ref=e476]:
                - img "apartment" [ref=e478]:
                  - img [ref=e479]
                - generic [ref=e481]: 产业链
            - generic [ref=e482]:
              - generic [ref=e483]: 🔥 25
              - generic [ref=e484]: 💰 4
              - generic [ref=e485]: 🎯 12
              - generic [ref=e486]: +1.99%
              - generic [ref=e487]: 额980.0亿
              - generic [ref=e488]:
                - generic [ref=e489]: 拥挤19
                - generic [ref=e490]: 扩散0
                - generic [ref=e491]: 集中11
                - generic [ref=e492]: 小白0
                - generic [ref=e493]: 回补2
                - generic [ref=e494]: 恐慌20
                - generic [ref=e495]: 动摇10
                - generic [ref=e496]: 宝妈20
                - generic [ref=e497]: 搜索20
                - generic [ref=e498]: 传播10
                - generic [ref=e499]: "20"
                - generic [ref=e500]: "20"
                - generic [ref=e501]: "20"
                - generic [ref=e502]: "5"
                - generic [ref=e503]: 📈52
                - generic [ref=e504]: 🔥79
          - img "right" [ref=e505]:
            - img [ref=e506]
        - generic [ref=e508] [cursor=pointer]:
          - generic [ref=e509]:
            - generic [ref=e510]: "40"
            - generic [ref=e511]: 一般
          - generic [ref=e512]:
            - generic [ref=e513]:
              - strong [ref=e515]: 电子
              - generic [ref=e516]: 786只
              - generic [ref=e517]: 🔥11涨停
              - button "apartment 产业链" [ref=e518]:
                - img "apartment" [ref=e520]:
                  - img [ref=e521]
                - generic [ref=e523]: 产业链
            - generic [ref=e524]:
              - generic [ref=e525]: 🔥 3
              - generic [ref=e526]: 💰 30
              - generic [ref=e527]: 🎯 7
              - generic [ref=e528]: +0.25%
              - generic [ref=e529]: 额7040.4亿
              - generic [ref=e530]:
                - generic [ref=e531]: 拥挤8
                - generic [ref=e532]: 扩散0
                - generic [ref=e533]: 集中7
                - generic [ref=e534]: 小白0
                - generic [ref=e535]: 回补2
                - generic [ref=e536]: 恐慌15
                - generic [ref=e537]: 动摇10
                - generic [ref=e538]: 宝妈20
                - generic [ref=e539]: 搜索20
                - generic [ref=e540]: 传播5
                - generic [ref=e541]: "20"
                - generic [ref=e542]: "20"
                - generic [ref=e543]: "10"
                - generic [ref=e544]: "0"
                - generic [ref=e545]: 📈47
                - generic [ref=e546]: 🔥50
          - img "right" [ref=e547]:
            - img [ref=e548]
        - generic [ref=e550] [cursor=pointer]:
          - generic [ref=e551]:
            - generic [ref=e552]: "36"
            - generic [ref=e553]: 一般
          - generic [ref=e554]:
            - generic [ref=e555]:
              - strong [ref=e557]: 国防军工
              - generic [ref=e558]: 39只
              - generic [ref=e559]: 🔥1涨停
              - button "apartment 产业链" [ref=e560]:
                - img "apartment" [ref=e562]:
                  - img [ref=e563]
                - generic [ref=e565]: 产业链
            - generic [ref=e566]:
              - generic [ref=e567]: 🔥 35
              - generic [ref=e568]: 💰 1
              - generic [ref=e569]: 🎯 1
              - generic [ref=e570]: +2.77%
              - generic [ref=e571]: 额159.4亿
              - generic [ref=e572]:
                - generic [ref=e573]: 拥挤18
                - generic [ref=e574]: 扩散2
                - generic [ref=e575]: 集中19
                - generic [ref=e576]: 小白0
                - generic [ref=e577]: 回补12
                - generic [ref=e578]: 恐慌20
                - generic [ref=e579]: 动摇10
                - generic [ref=e580]: 宝妈20
                - generic [ref=e581]: 搜索20
                - generic [ref=e582]: 传播10
                - generic [ref=e583]: "20"
                - generic [ref=e584]: "20"
                - generic [ref=e585]: "15"
                - generic [ref=e586]: "5"
                - generic [ref=e587]: 📈64
                - generic [ref=e588]: 🔥81
          - img "right" [ref=e589]:
            - img [ref=e590]
        - generic [ref=e592] [cursor=pointer]:
          - generic [ref=e593]:
            - generic [ref=e594]: "36"
            - generic [ref=e595]: 一般
          - generic [ref=e596]:
            - generic [ref=e597]:
              - strong [ref=e599]: 计算机
              - generic [ref=e600]: 762只
              - generic [ref=e601]: 🔥8涨停
              - button "apartment 产业链" [ref=e602]:
                - img "apartment" [ref=e604]:
                  - img [ref=e605]
                - generic [ref=e607]: 产业链
            - generic [ref=e608]:
              - generic [ref=e609]: 🔥 19
              - generic [ref=e610]: 💰 12
              - generic [ref=e611]: 🎯 5
              - generic [ref=e612]: +1.48%
              - generic [ref=e613]: 额2782.0亿
              - generic [ref=e614]:
                - generic [ref=e615]: 拥挤14
                - generic [ref=e616]: 扩散0
                - generic [ref=e617]: 集中12
                - generic [ref=e618]: 小白0
                - generic [ref=e619]: 回补2
                - generic [ref=e620]: 恐慌20
                - generic [ref=e621]: 动摇10
                - generic [ref=e622]: 宝妈20
                - generic [ref=e623]: 搜索20
                - generic [ref=e624]: 传播5
                - generic [ref=e625]: "20"
                - generic [ref=e626]: "20"
                - generic [ref=e627]: "15"
                - generic [ref=e628]: "0"
                - generic [ref=e629]: 📈47
                - generic [ref=e630]: 🔥68
          - img "right" [ref=e631]:
            - img [ref=e632]
        - generic [ref=e634] [cursor=pointer]:
          - generic [ref=e635]:
            - generic [ref=e636]: "35"
            - generic [ref=e637]: 一般
          - generic [ref=e638]:
            - generic [ref=e639]:
              - strong [ref=e641]: 建筑装饰
              - generic [ref=e642]: 103只
              - generic [ref=e643]: 🔥3涨停
              - button "apartment 产业链" [ref=e644]:
                - img "apartment" [ref=e646]:
                  - img [ref=e647]
                - generic [ref=e649]: 产业链
            - generic [ref=e650]:
              - generic [ref=e651]: 🔥 33
              - generic [ref=e652]: 💰 1
              - generic [ref=e653]: 🎯 2
              - generic [ref=e654]: +2.58%
              - generic [ref=e655]: 额150.7亿
              - generic [ref=e656]:
                - generic [ref=e657]: 拥挤19
                - generic [ref=e658]: 扩散4
                - generic [ref=e659]: 集中20
                - generic [ref=e660]: 小白0
                - generic [ref=e661]: 回补12
                - generic [ref=e662]: 恐慌20
                - generic [ref=e663]: 动摇10
                - generic [ref=e664]: 宝妈20
                - generic [ref=e665]: 搜索20
                - generic [ref=e666]: 传播10
                - generic [ref=e667]: "20"
                - generic [ref=e668]: "20"
                - generic [ref=e669]: "15"
                - generic [ref=e670]: "5"
                - generic [ref=e671]: 📈66
                - generic [ref=e672]: 🔥83
          - img "right" [ref=e673]:
            - img [ref=e674]
        - generic [ref=e676] [cursor=pointer]:
          - generic [ref=e677]:
            - generic [ref=e678]: "34"
            - generic [ref=e679]: 一般
          - generic [ref=e680]:
            - generic [ref=e681]:
              - strong [ref=e683]: 石油石化
              - generic [ref=e684]: 33只
              - generic [ref=e685]: 🔥3涨停
              - button "apartment 产业链" [ref=e686]:
                - img "apartment" [ref=e688]:
                  - img [ref=e689]
                - generic [ref=e691]: 产业链
            - generic [ref=e692]:
              - generic [ref=e693]: 🔥 32
              - generic [ref=e694]: 💰 1
              - generic [ref=e695]: 🎯 2
              - generic [ref=e696]: +2.51%
              - generic [ref=e697]: 额119.3亿
              - generic [ref=e698]:
                - generic [ref=e699]: 拥挤19
                - generic [ref=e700]: 扩散10
                - generic [ref=e701]: 集中19
                - generic [ref=e702]: 小白0
                - generic [ref=e703]: 回补16
                - generic [ref=e704]: 恐慌20
                - generic [ref=e705]: 动摇5
                - generic [ref=e706]: 宝妈20
                - generic [ref=e707]: 搜索20
                - generic [ref=e708]: 传播15
                - generic [ref=e709]: "0"
                - generic [ref=e710]: "15"
                - generic [ref=e711]: "5"
                - generic [ref=e712]: "10"
                - generic [ref=e713]: 📈61
                - generic [ref=e714]: 🔥73
          - img "right" [ref=e715]:
            - img [ref=e716]
        - generic [ref=e718] [cursor=pointer]:
          - generic [ref=e719]:
            - generic [ref=e720]: "33"
            - generic [ref=e721]: 一般
          - generic [ref=e722]:
            - generic [ref=e723]:
              - strong [ref=e725]: 轻工制造
              - generic [ref=e726]: 97只
              - generic [ref=e727]: 🔥4涨停
              - button "apartment 产业链" [ref=e728]:
                - img "apartment" [ref=e730]:
                  - img [ref=e731]
                - generic [ref=e733]: 产业链
            - generic [ref=e734]:
              - generic [ref=e735]: 🔥 30
              - generic [ref=e736]: 💰 1
              - generic [ref=e737]: 🎯 3
              - generic [ref=e738]: +2.38%
              - generic [ref=e739]: 额154.6亿
              - generic [ref=e740]:
                - generic [ref=e741]: 拥挤19
                - generic [ref=e742]: 扩散0
                - generic [ref=e743]: 集中20
                - generic [ref=e744]: 小白0
                - generic [ref=e745]: 回补2
                - generic [ref=e746]: 恐慌20
                - generic [ref=e747]: 动摇10
                - generic [ref=e748]: 宝妈20
                - generic [ref=e749]: 搜索20
                - generic [ref=e750]: 传播10
                - generic [ref=e751]: "20"
                - generic [ref=e752]: "20"
                - generic [ref=e753]: "15"
                - generic [ref=e754]: "5"
                - generic [ref=e755]: 📈52
                - generic [ref=e756]: 🔥83
          - img "right" [ref=e757]:
            - img [ref=e758]
        - generic [ref=e760] [cursor=pointer]:
          - generic [ref=e761]:
            - generic [ref=e762]: "32"
            - generic [ref=e763]: 一般
          - generic [ref=e764]:
            - generic [ref=e765]:
              - strong [ref=e767]: 纺织服饰
              - generic [ref=e768]: 91只
              - generic [ref=e769]: 🔥3涨停
              - button "apartment 产业链" [ref=e770]:
                - img "apartment" [ref=e772]:
                  - img [ref=e773]
                - generic [ref=e775]: 产业链
            - generic [ref=e776]:
              - generic [ref=e777]: 🔥 29
              - generic [ref=e778]: 💰 1
              - generic [ref=e779]: 🎯 2
              - generic [ref=e780]: +2.33%
              - generic [ref=e781]: 额118.0亿
              - generic [ref=e782]:
                - generic [ref=e783]: 拥挤19
                - generic [ref=e784]: 扩散0
                - generic [ref=e785]: 集中20
                - generic [ref=e786]: 小白0
                - generic [ref=e787]: 回补12
                - generic [ref=e788]: 恐慌20
                - generic [ref=e789]: 动摇10
                - generic [ref=e790]: 宝妈20
                - generic [ref=e791]: 搜索20
                - generic [ref=e792]: 传播10
                - generic [ref=e793]: "20"
                - generic [ref=e794]: "20"
                - generic [ref=e795]: "20"
                - generic [ref=e796]: "5"
                - generic [ref=e797]: 📈62
                - generic [ref=e798]: 🔥87
          - img "right" [ref=e799]:
            - img [ref=e800]
        - generic [ref=e802] [cursor=pointer]:
          - generic [ref=e803]:
            - generic [ref=e804]: "32"
            - generic [ref=e805]: 一般
          - generic [ref=e806]:
            - generic [ref=e807]:
              - strong [ref=e809]: 公用事业
              - generic [ref=e810]: 142只
              - generic [ref=e811]: 🔥5涨停
              - button "apartment 产业链" [ref=e812]:
                - img "apartment" [ref=e814]:
                  - img [ref=e815]
                - generic [ref=e817]: 产业链
            - generic [ref=e818]:
              - generic [ref=e819]: 🔥 25
              - generic [ref=e820]: 💰 3
              - generic [ref=e821]: 🎯 3
              - generic [ref=e822]: +1.97%
              - generic [ref=e823]: 额803.2亿
              - generic [ref=e824]:
                - generic [ref=e825]: 拥挤19
                - generic [ref=e826]: 扩散19
                - generic [ref=e827]: 集中14
                - generic [ref=e828]: 小白0
                - generic [ref=e829]: 回补16
                - generic [ref=e830]: 恐慌20
                - generic [ref=e831]: 动摇5
                - generic [ref=e832]: 宝妈20
                - generic [ref=e833]: 搜索20
                - generic [ref=e834]: 传播10
                - generic [ref=e835]: "0"
                - generic [ref=e836]: "20"
                - generic [ref=e837]: "5"
                - generic [ref=e838]: "15"
                - generic [ref=e839]: 📈65
                - generic [ref=e840]: 🔥78
          - img "right" [ref=e841]:
            - img [ref=e842]
        - generic [ref=e844] [cursor=pointer]:
          - generic [ref=e845]:
            - generic [ref=e846]: "31"
            - generic [ref=e847]: 一般
          - generic [ref=e848]:
            - generic [ref=e849]:
              - strong [ref=e851]: 钢铁
              - generic [ref=e852]: 71只
              - button "apartment 产业链" [ref=e853]:
                - img "apartment" [ref=e855]:
                  - img [ref=e856]
                - generic [ref=e858]: 产业链
            - generic [ref=e859]:
              - generic [ref=e860]: 🔥 30
              - generic [ref=e861]: 💰 1
              - generic [ref=e862]: 🎯 0
              - generic [ref=e863]: +2.37%
              - generic [ref=e864]: 额128.5亿
              - generic [ref=e865]:
                - generic [ref=e866]: 拥挤19
                - generic [ref=e867]: 扩散10
                - generic [ref=e868]: 集中19
                - generic [ref=e869]: 小白0
                - generic [ref=e870]: 回补12
                - generic [ref=e871]: 恐慌20
                - generic [ref=e872]: 动摇10
                - generic [ref=e873]: 宝妈20
                - generic [ref=e874]: 搜索20
                - generic [ref=e875]: 传播0
                - generic [ref=e876]: "20"
                - generic [ref=e877]: "20"
                - generic [ref=e878]: "20"
                - generic [ref=e879]: "5"
                - generic [ref=e880]: 📈62
                - generic [ref=e881]: 🔥86
          - img "right" [ref=e882]:
            - img [ref=e883]
      - generic [ref=e886]:
        - generic [ref=e887]:
          - strong [ref=e889]: 🌡️ 多维景气热力 v3
          - generic [ref=e890]: Top10板块 × 11维度(5景气+6拥挤) · 红(0-5)→黄(6-12)→绿(13-20)
        - generic [ref=e891]:
          - button "📈 景气度排序" [ref=e892] [cursor=pointer]:
            - generic [ref=e893]: 📈 景气度排序
          - button "🔥 拥挤度排序" [ref=e894] [cursor=pointer]:
            - generic [ref=e895]: 🔥 拥挤度排序
  - generic "AI助手 — 随时提问" [ref=e900] [cursor=pointer]:
    - img "message" [ref=e901]:
      - img [ref=e902]
  - button "切换到浅色模式" [ref=e904] [cursor=pointer]: ☀️
  - img "setting" [ref=e906] [cursor=pointer]:
    - img [ref=e907]
```

# Test source

```ts
  1   | /**
  2   |  * E2E 测试 (Playwright)
  3   |  * 
  4   |  * 测试关键用户流程:
  5   |  * - 首页加载与数据展示
  6   |  * - 股票搜索
  7   |  * - 股票详情页
  8   |  * - 自选股管理
  9   |  * - 选股器筛选
  10  |  */
  11  | 
  12  | import { test, expect } from '@playwright/test';
  13  | 
  14  | test.describe('首页', () => {
  15  |   test('应该加载市场概况', async ({ page }) => {
  16  |     await page.goto('/');
  17  |     await expect(page.locator('.ant-layout-content')).toBeVisible();
  18  |     await expect(page.getByText('市场概况')).toBeVisible();
  19  |   });
  20  | 
  21  |   test('应该展示涨跌分布', async ({ page }) => {
  22  |     await page.goto('/');
  23  |     // 等待数据加载
  24  |     await page.waitForSelector('.ant-card', { timeout: 10000 });
  25  |     const cards = page.locator('.ant-card');
  26  |     await expect(cards).toHaveCount(expect.any(Number));
  27  |   });
  28  | 
  29  |   test('应该能刷新数据', async ({ page }) => {
  30  |     await page.goto('/');
  31  |     const refreshBtn = page.getByRole('button', { name: /刷新/i });
  32  |     if (await refreshBtn.isVisible()) {
  33  |       await refreshBtn.click();
  34  |       // 验证 loading 状态出现后消失
  35  |       await page.waitForTimeout(500);
  36  |     }
  37  |   });
  38  | });
  39  | 
  40  | test.describe('股票搜索', () => {
  41  |   test('应该能搜索股票', async ({ page }) => {
  42  |     await page.goto('/');
  43  |     const searchInput = page.locator('[data-search-input] input, .ant-select input').first();
> 44  |     await searchInput.fill('平安');
      |                       ^ Error: locator.fill: Test timeout of 30000ms exceeded.
  45  |     await page.waitForTimeout(500);
  46  |     // 应该出现搜索结果
  47  |     const dropdown = page.locator('.ant-select-dropdown');
  48  |     await expect(dropdown).toBeVisible({ timeout: 5000 });
  49  |   });
  50  | 
  51  |   test('应该支持键盘快捷键聚焦搜索', async ({ page }) => {
  52  |     await page.goto('/');
  53  |     await page.keyboard.press('Control+k');
  54  |     const searchInput = page.locator('[data-search-input] input').first();
  55  |     await expect(searchInput).toBeFocused();
  56  |   });
  57  | });
  58  | 
  59  | test.describe('股票详情页', () => {
  60  |   test('应该展示股票信息', async ({ page }) => {
  61  |     // 修复路由：/stock/ → /stocks/
  62  |     await page.goto('/stocks/000001.SZ');
  63  |     // 等待页面加载
  64  |     await page.waitForSelector('.ant-tabs, .ant-empty, .ant-spin', { timeout: 10000 });
  65  |     // 如果有数据，应该展示 Tab
  66  |     const tabs = page.locator('.ant-tabs-tab');
  67  |     const tabCount = await tabs.count();
  68  |     if (tabCount > 0) {
  69  |       await expect(tabs.first()).toBeVisible();
  70  |     }
  71  |   });
  72  | });
  73  | 
  74  | test.describe('自选股', () => {
  75  |   test('应该能访问自选股页面', async ({ page }) => {
  76  |     await page.goto('/watchlist');
  77  |     await page.waitForSelector('.ant-layout-content', { timeout: 5000 });
  78  |     await expect(page.locator('.ant-layout-content')).toBeVisible();
  79  |   });
  80  | });
  81  | 
  82  | test.describe('选股器', () => {
  83  |   test('应该能打开选股器', async ({ page }) => {
  84  |     await page.goto('/screener');
  85  |     await page.waitForSelector('.ant-card', { timeout: 10000 });
  86  |     await expect(page.getByText('筛选条件')).toBeVisible();
  87  |   });
  88  | 
  89  |   test('应该能执行筛选', async ({ page }) => {
  90  |     await page.goto('/screener');
  91  |     await page.waitForSelector('.ant-card', { timeout: 10000 });
  92  |     const executeBtn = page.getByRole('button', { name: /执行/i });
  93  |     if (await executeBtn.isVisible()) {
  94  |       await executeBtn.click();
  95  |       // 等待结果或空状态
  96  |       await page.waitForTimeout(2000);
  97  |     }
  98  |   });
  99  | 
  100 |   test('应该能添加筛选条件', async ({ page }) => {
  101 |     await page.goto('/screener');
  102 |     await page.waitForSelector('.ant-card', { timeout: 10000 });
  103 |     const addBtn = page.getByRole('button', { name: /添加/i }).first();
  104 |     if (await addBtn.isVisible()) {
  105 |       await addBtn.click();
  106 |       await page.waitForTimeout(500);
  107 |     }
  108 |   });
  109 | });
  110 | 
  111 | test.describe('暗色主题', () => {
  112 |   test('应该能切换主题', async ({ page }) => {
  113 |     await page.goto('/');
  114 |     const themeBtn = page.locator('[class*="theme"], button:has(svg)').filter({ hasText: /主题|theme/i }).first();
  115 |     if (await themeBtn.isVisible()) {
  116 |       await themeBtn.click();
  117 |       const darkOption = page.getByText(/深色|Dark/i);
  118 |       if (await darkOption.isVisible()) {
  119 |         await darkOption.click();
  120 |         await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  121 |       }
  122 |     }
  123 |   });
  124 | });
  125 | 
  126 | test.describe('响应式', () => {
  127 |   test('移动端应该适配布局', async ({ page }) => {
  128 |     await page.setViewportSize({ width: 375, height: 812 });
  129 |     await page.goto('/');
  130 |     await page.waitForSelector('.ant-layout-content', { timeout: 5000 });
  131 |     // 验证侧边栏在移动端隐藏
  132 |     const sidebar = page.locator('.ant-layout-sider');
  133 |     const sidebarVisible = await sidebar.isVisible();
  134 |     // 移动端侧边栏应该被隐藏或折叠
  135 |     // 具体行为取决于实现
  136 |   });
  137 | });
  138 | 
  139 | // ==================== 新增：核心链路覆盖 ====================
  140 | 
  141 | test.describe('路由重定向', () => {
  142 |   test('/market 应重定向到首页', async ({ page }) => {
  143 |     await page.goto('/market');
  144 |     await page.waitForURL('**/');
```