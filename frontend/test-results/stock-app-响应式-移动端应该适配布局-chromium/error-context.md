# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: stock-app.spec.ts >> 响应式 >> 移动端应该适配布局
- Location: e2e/stock-app.spec.ts:127:7

# Error details

```
TimeoutError: page.waitForSelector: Timeout 5000ms exceeded.
Call log:
  - waiting for locator('.ant-layout-content') to be visible

```

# Page snapshot

```yaml
- generic [ref=e4]:
  - main [ref=e5]:
    - generic [ref=e9]:
      - generic [ref=e11]:
        - generic [ref=e12]:
          - img "compass" [ref=e13]:
            - img [ref=e14]
          - heading "发掘" [level=3] [ref=e16]
        - text: 板块景气度评分 → 点击板块查看个股详情
      - generic [ref=e17]:
        - generic [ref=e18]:
          - generic [ref=e19]:
            - generic [ref=e20]: 🔥
            - generic [ref=e21]:
              - generic [ref=e22]: 强势上攻
              - generic [ref=e23]:
                - generic [ref=e24]: AI 实时解读
                - generic [ref=e25]: 综合31板块 · 多维度分析
          - generic [ref=e26]:
            - generic [ref=e27]:
              - generic [ref=e28]: 个股涨跌
              - generic [ref=e29]:
                - generic [ref=e30]: "3994"
                - generic [ref=e33]: "1139"
              - generic [ref=e34]: 全市场 3994涨1139跌
            - generic [ref=e35]:
              - generic [ref=e36]: 指数均幅
              - generic [ref=e37]: 0.00%
            - generic [ref=e38]:
              - generic [ref=e39]: 涨停
              - generic [ref=e40]: "150"
            - generic [ref=e41]:
              - generic [ref=e42]: 跌停
              - generic [ref=e43]: "8"
        - generic [ref=e44]:
          - generic [ref=e45]:
            - generic [ref=e46]:
              - generic [ref=e47]:
                - generic [ref=e48]: 📊
                - generic [ref=e49]: 市场情绪
                - generic [ref=e50]: 核心
              - generic [ref=e51]:
                - generic [ref=e53]: 强势上攻 · 市场做多情绪高涨，3994只上涨、1139只下跌。
                - generic [ref=e55]: 领涨板块：电力设备(75分+4.0%)、有色金属(51分+3.1%)、基础化工(45分+2.6%)
                - generic [ref=e57]: 涨停145家，集中：电力设备31只涨停、有色金属9只涨停、基础化工11只涨停、机械设备14只涨停、环保2只涨停、综合18只涨停、电子11只涨停、计算机8只涨停、建筑装饰3只涨停、石油石化3只涨停、轻工制造4只涨停、纺织服饰3只涨停、公用事业5只涨停、汽车2只涨停、农林牧渔2只涨停、建筑材料2只涨停、房地产4只涨停、通信2只涨停、医药生物6只涨停
            - generic [ref=e58]:
              - generic [ref=e59]:
                - generic [ref=e60]: 💰
                - generic [ref=e61]: 资金流向
              - generic [ref=e62]:
                - generic [ref=e64]: 上涨3994只，下跌1139只，平盘408只
                - generic [ref=e66]: 成交额：2.18万亿
                - generic [ref=e68]: 涨停：145家
                - generic [ref=e70]: 资金聚焦方向：电力设备(75分+4.0%)、有色金属(51分+3.1%)
                - generic [ref=e72]: 操作建议：可适度参与强势板块，设好止损
            - generic [ref=e73]:
              - generic [ref=e74]:
                - generic [ref=e75]: 📰
                - generic [ref=e76]: 策略参考
              - generic [ref=e77]:
                - generic [ref=e78]:
                  - generic [ref=e79]: ›
                  - generic [ref=e80]: · 关注景气度>70的高景气板块
                - generic [ref=e81]:
                  - generic [ref=e82]: ›
                  - generic [ref=e83]: · 注意板块轮动节奏
                - generic [ref=e84]:
                  - generic [ref=e85]: ›
                  - generic [ref=e86]: · 强势板块回调可关注
                - generic [ref=e88]: ⚠️ 以上为规则引擎分析，不构成投资建议
          - generic [ref=e89]:
            - generic [ref=e90]:
              - generic [ref=e91]: 📊 关键信号
              - generic [ref=e92]:
                - generic [ref=e93]:
                  - generic [ref=e94]: 上涨家数
                  - generic [ref=e95]: "3994"
                - generic [ref=e96]:
                  - generic [ref=e97]: 下跌家数
                  - generic [ref=e98]: "1139"
                - generic [ref=e100]:
                  - generic [ref=e101]: 涨停家数
                  - generic [ref=e102]: 150 只
                - generic [ref=e103]:
                  - generic [ref=e104]: 跌停家数
                  - generic [ref=e105]: 8 只
                - generic [ref=e107]:
                  - generic [ref=e108]: 市场总成交
                  - generic [ref=e109]: 21846.9亿
                - generic [ref=e110]:
                  - generic [ref=e111]: 景气 > 70
                  - generic [ref=e112]: 1 个
            - generic [ref=e113]:
              - generic [ref=e114]: 🏆 领涨板块
              - generic [ref=e115]:
                - generic [ref=e116] [cursor=pointer]:
                  - generic [ref=e117]: 电力设备
                  - generic [ref=e118]: +4.0%
                - generic [ref=e119] [cursor=pointer]:
                  - generic [ref=e120]: 环保
                  - generic [ref=e121]: +3.2%
                - generic [ref=e122] [cursor=pointer]:
                  - generic [ref=e123]: 有色金属
                  - generic [ref=e124]: +3.1%
                - generic [ref=e125] [cursor=pointer]:
                  - generic [ref=e126]: 国防军工
                  - generic [ref=e127]: +2.8%
                - generic [ref=e128] [cursor=pointer]:
                  - generic [ref=e129]: 基础化工
                  - generic [ref=e130]: +2.6%
            - generic [ref=e131]:
              - generic [ref=e132]: 📉 弱势板块
              - generic [ref=e133]:
                - generic [ref=e134] [cursor=pointer]:
                  - generic [ref=e135]: 电子
                  - generic [ref=e136]: 0.3%
                - generic [ref=e137] [cursor=pointer]:
                  - generic [ref=e138]: 医药生物
                  - generic [ref=e139]: 0.7%
                - generic [ref=e140] [cursor=pointer]:
                  - generic [ref=e141]: 银行
                  - generic [ref=e142]: 0.7%
        - generic [ref=e143]:
          - button "filter 立即筛选" [ref=e144] [cursor=pointer]:
            - img "filter" [ref=e146]:
              - img [ref=e147]
            - generic [ref=e149]: 立即筛选
          - button "apartment 产业地图" [ref=e150] [cursor=pointer]:
            - img "apartment" [ref=e152]:
              - img [ref=e153]
            - generic [ref=e155]: 产业地图
          - generic [ref=e156]: 数据实时更新 · 点击板块查看详情
      - generic [ref=e157]:
        - generic [ref=e158]:
          - generic [ref=e159] [cursor=pointer]:
            - generic [ref=e160]: 上证指数
            - generic [ref=e161]: 3,876.78
            - generic [ref=e162]: +0.25%
          - generic [ref=e163] [cursor=pointer]:
            - generic [ref=e164]: 深证成指
            - generic [ref=e165]: 14,123.31
            - generic [ref=e166]: +0.44%
          - generic [ref=e167] [cursor=pointer]:
            - generic [ref=e168]: 创业板指
            - generic [ref=e169]: 3,575.52
            - generic [ref=e170]: +0.25%
          - generic [ref=e171] [cursor=pointer]:
            - generic [ref=e172]: 上证50
            - generic [ref=e173]: 2,978.77
            - generic [ref=e174]: "-0.41%"
          - generic [ref=e175] [cursor=pointer]:
            - generic [ref=e176]: 沪深300
            - generic [ref=e177]: 4,728
            - generic [ref=e178]: +0.23%
          - generic [ref=e179] [cursor=pointer]:
            - generic [ref=e180]: 中证500
            - generic [ref=e181]: 7,734.31
            - generic [ref=e182]: "-0.22%"
          - generic [ref=e183] [cursor=pointer]:
            - generic [ref=e184]: 中证1000
            - generic [ref=e185]: 7,195.5
            - generic [ref=e186]: +0.51%
          - generic [ref=e187] [cursor=pointer]:
            - generic [ref=e188]: 科创50
            - generic [ref=e189]: 1,789.69
            - generic [ref=e190]: "-3.78%"
          - generic [ref=e191] [cursor=pointer]:
            - generic [ref=e192]: 中小100
            - generic [ref=e193]: 8,714.92
            - generic [ref=e194]: +0.37%
        - generic [ref=e195]:
          - generic [ref=e196]: 板块宽度
          - generic [ref=e197]:
            - generic [ref=e198]: 31 涨
            - generic [ref=e199]: 0 跌
            - generic [ref=e200]: 100%
          - generic [ref=e203]:
            - generic [ref=e204]:
              - text: 🏆 电力设备 景气度
              - generic [ref=e205]: 75分
            - generic [ref=e206]:
              - text: 🏆 有色金属 景气度
              - generic [ref=e207]: 51分
      - generic [ref=e208]:
        - generic [ref=e209]:
          - strong [ref=e211]: 🏢 板块景气度评分
          - generic [ref=e212]: 综合评分 = 板块热度×50% + 成交活跃×30% + 赚钱效应×20%
        - generic [ref=e213]:
          - generic [ref=e214]:
            - generic [ref=e215] [cursor=pointer]: 行业板块
            - generic [ref=e216] [cursor=pointer]: 概念板块
          - generic [ref=e217]:
            - generic [ref=e218] [cursor=pointer]: 一级
            - generic [ref=e219] [cursor=pointer]: 二级
      - generic [ref=e220]:
        - generic [ref=e221] [cursor=pointer]:
          - generic [ref=e222]:
            - generic [ref=e223]: "75"
            - generic [ref=e224]: 高景气
          - generic [ref=e225]:
            - generic [ref=e226]:
              - strong [ref=e228]: 电力设备
              - generic [ref=e229]: 253只
              - generic [ref=e230]: 🔥31涨停
              - button "apartment 产业链" [ref=e231]:
                - img "apartment" [ref=e233]:
                  - img [ref=e234]
                - generic [ref=e236]: 产业链
            - generic [ref=e237]:
              - generic [ref=e238]: 🔥 50
              - generic [ref=e239]: 💰 5
              - generic [ref=e240]: 🎯 20
              - generic [ref=e241]: +3.95%
              - generic [ref=e242]: 额1071.3亿
          - img "right" [ref=e243]:
            - img [ref=e244]
        - generic [ref=e246] [cursor=pointer]:
          - generic [ref=e247]:
            - generic [ref=e248]: "51"
            - generic [ref=e249]: 较活跃
          - generic [ref=e250]:
            - generic [ref=e251]:
              - strong [ref=e253]: 有色金属
              - generic [ref=e254]: 155只
              - generic [ref=e255]: 🔥9涨停
              - button "apartment 产业链" [ref=e256]:
                - img "apartment" [ref=e258]:
                  - img [ref=e259]
                - generic [ref=e261]: 产业链
            - generic [ref=e262]:
              - generic [ref=e263]: 🔥 39
              - generic [ref=e264]: 💰 6
              - generic [ref=e265]: 🎯 6
              - generic [ref=e266]: +3.10%
              - generic [ref=e267]: 额1417.4亿
          - img "right" [ref=e268]:
            - img [ref=e269]
        - generic [ref=e271] [cursor=pointer]:
          - generic [ref=e272]:
            - generic [ref=e273]: "45"
            - generic [ref=e274]: 较活跃
          - generic [ref=e275]:
            - generic [ref=e276]:
              - strong [ref=e278]: 基础化工
              - generic [ref=e279]: 402只
              - generic [ref=e280]: 🔥11涨停
              - button "apartment 产业链" [ref=e281]:
                - img "apartment" [ref=e283]:
                  - img [ref=e284]
                - generic [ref=e286]: 产业链
            - generic [ref=e287]:
              - generic [ref=e288]: 🔥 33
              - generic [ref=e289]: 💰 5
              - generic [ref=e290]: 🎯 7
              - generic [ref=e291]: +2.60%
              - generic [ref=e292]: 额1240.6亿
          - img "right" [ref=e293]:
            - img [ref=e294]
        - generic [ref=e296] [cursor=pointer]:
          - generic [ref=e297]:
            - generic [ref=e298]: "44"
            - generic [ref=e299]: 一般
          - generic [ref=e300]:
            - generic [ref=e301]:
              - strong [ref=e303]: 机械设备
              - generic [ref=e304]: 411只
              - generic [ref=e305]: 🔥14涨停
              - button "apartment 产业链" [ref=e306]:
                - img "apartment" [ref=e308]:
                  - img [ref=e309]
                - generic [ref=e311]: 产业链
            - generic [ref=e312]:
              - generic [ref=e313]: 🔥 29
              - generic [ref=e314]: 💰 6
              - generic [ref=e315]: 🎯 9
              - generic [ref=e316]: +2.27%
              - generic [ref=e317]: 额1434.2亿
          - img "right" [ref=e318]:
            - img [ref=e319]
        - generic [ref=e321] [cursor=pointer]:
          - generic [ref=e322]:
            - generic [ref=e323]: "42"
            - generic [ref=e324]: 一般
          - generic [ref=e325]:
            - generic [ref=e326]:
              - strong [ref=e328]: 环保
              - generic [ref=e329]: 66只
              - generic [ref=e330]: 🔥2涨停
              - button "apartment 产业链" [ref=e331]:
                - img "apartment" [ref=e333]:
                  - img [ref=e334]
                - generic [ref=e336]: 产业链
            - generic [ref=e337]:
              - generic [ref=e338]: 🔥 41
              - generic [ref=e339]: 💰 1
              - generic [ref=e340]: 🎯 1
              - generic [ref=e341]: +3.20%
              - generic [ref=e342]: 额127.9亿
          - img "right" [ref=e343]:
            - img [ref=e344]
        - generic [ref=e346] [cursor=pointer]:
          - generic [ref=e347]:
            - generic [ref=e348]: "41"
            - generic [ref=e349]: 一般
          - generic [ref=e350]:
            - generic [ref=e351]:
              - strong [ref=e353]: 综合
              - generic [ref=e354]: 528只
              - generic [ref=e355]: 🔥18涨停
              - button "apartment 产业链" [ref=e356]:
                - img "apartment" [ref=e358]:
                  - img [ref=e359]
                - generic [ref=e361]: 产业链
            - generic [ref=e362]:
              - generic [ref=e363]: 🔥 25
              - generic [ref=e364]: 💰 4
              - generic [ref=e365]: 🎯 12
              - generic [ref=e366]: +1.99%
              - generic [ref=e367]: 额980.0亿
          - img "right" [ref=e368]:
            - img [ref=e369]
        - generic [ref=e371] [cursor=pointer]:
          - generic [ref=e372]:
            - generic [ref=e373]: "40"
            - generic [ref=e374]: 一般
          - generic [ref=e375]:
            - generic [ref=e376]:
              - strong [ref=e378]: 电子
              - generic [ref=e379]: 786只
              - generic [ref=e380]: 🔥11涨停
              - button "apartment 产业链" [ref=e381]:
                - img "apartment" [ref=e383]:
                  - img [ref=e384]
                - generic [ref=e386]: 产业链
            - generic [ref=e387]:
              - generic [ref=e388]: 🔥 3
              - generic [ref=e389]: 💰 30
              - generic [ref=e390]: 🎯 7
              - generic [ref=e391]: +0.25%
              - generic [ref=e392]: 额7040.4亿
          - img "right" [ref=e393]:
            - img [ref=e394]
        - generic [ref=e396] [cursor=pointer]:
          - generic [ref=e397]:
            - generic [ref=e398]: "36"
            - generic [ref=e399]: 一般
          - generic [ref=e400]:
            - generic [ref=e401]:
              - strong [ref=e403]: 国防军工
              - generic [ref=e404]: 39只
              - generic [ref=e405]: 🔥1涨停
              - button "apartment 产业链" [ref=e406]:
                - img "apartment" [ref=e408]:
                  - img [ref=e409]
                - generic [ref=e411]: 产业链
            - generic [ref=e412]:
              - generic [ref=e413]: 🔥 35
              - generic [ref=e414]: 💰 1
              - generic [ref=e415]: 🎯 1
              - generic [ref=e416]: +2.77%
              - generic [ref=e417]: 额159.4亿
          - img "right" [ref=e418]:
            - img [ref=e419]
        - generic [ref=e421] [cursor=pointer]:
          - generic [ref=e422]:
            - generic [ref=e423]: "36"
            - generic [ref=e424]: 一般
          - generic [ref=e425]:
            - generic [ref=e426]:
              - strong [ref=e428]: 计算机
              - generic [ref=e429]: 762只
              - generic [ref=e430]: 🔥8涨停
              - button "apartment 产业链" [ref=e431]:
                - img "apartment" [ref=e433]:
                  - img [ref=e434]
                - generic [ref=e436]: 产业链
            - generic [ref=e437]:
              - generic [ref=e438]: 🔥 19
              - generic [ref=e439]: 💰 12
              - generic [ref=e440]: 🎯 5
              - generic [ref=e441]: +1.48%
              - generic [ref=e442]: 额2782.0亿
          - img "right" [ref=e443]:
            - img [ref=e444]
        - generic [ref=e446] [cursor=pointer]:
          - generic [ref=e447]:
            - generic [ref=e448]: "35"
            - generic [ref=e449]: 一般
          - generic [ref=e450]:
            - generic [ref=e451]:
              - strong [ref=e453]: 建筑装饰
              - generic [ref=e454]: 103只
              - generic [ref=e455]: 🔥3涨停
              - button "apartment 产业链" [ref=e456]:
                - img "apartment" [ref=e458]:
                  - img [ref=e459]
                - generic [ref=e461]: 产业链
            - generic [ref=e462]:
              - generic [ref=e463]: 🔥 33
              - generic [ref=e464]: 💰 1
              - generic [ref=e465]: 🎯 2
              - generic [ref=e466]: +2.58%
              - generic [ref=e467]: 额150.7亿
          - img "right" [ref=e468]:
            - img [ref=e469]
        - generic [ref=e471] [cursor=pointer]:
          - generic [ref=e472]:
            - generic [ref=e473]: "34"
            - generic [ref=e474]: 一般
          - generic [ref=e475]:
            - generic [ref=e476]:
              - strong [ref=e478]: 石油石化
              - generic [ref=e479]: 33只
              - generic [ref=e480]: 🔥3涨停
              - button "apartment 产业链" [ref=e481]:
                - img "apartment" [ref=e483]:
                  - img [ref=e484]
                - generic [ref=e486]: 产业链
            - generic [ref=e487]:
              - generic [ref=e488]: 🔥 32
              - generic [ref=e489]: 💰 1
              - generic [ref=e490]: 🎯 2
              - generic [ref=e491]: +2.51%
              - generic [ref=e492]: 额119.3亿
          - img "right" [ref=e493]:
            - img [ref=e494]
        - generic [ref=e496] [cursor=pointer]:
          - generic [ref=e497]:
            - generic [ref=e498]: "33"
            - generic [ref=e499]: 一般
          - generic [ref=e500]:
            - generic [ref=e501]:
              - strong [ref=e503]: 轻工制造
              - generic [ref=e504]: 97只
              - generic [ref=e505]: 🔥4涨停
              - button "apartment 产业链" [ref=e506]:
                - img "apartment" [ref=e508]:
                  - img [ref=e509]
                - generic [ref=e511]: 产业链
            - generic [ref=e512]:
              - generic [ref=e513]: 🔥 30
              - generic [ref=e514]: 💰 1
              - generic [ref=e515]: 🎯 3
              - generic [ref=e516]: +2.38%
              - generic [ref=e517]: 额154.6亿
          - img "right" [ref=e518]:
            - img [ref=e519]
        - generic [ref=e521] [cursor=pointer]:
          - generic [ref=e522]:
            - generic [ref=e523]: "32"
            - generic [ref=e524]: 一般
          - generic [ref=e525]:
            - generic [ref=e526]:
              - strong [ref=e528]: 纺织服饰
              - generic [ref=e529]: 91只
              - generic [ref=e530]: 🔥3涨停
              - button "apartment 产业链" [ref=e531]:
                - img "apartment" [ref=e533]:
                  - img [ref=e534]
                - generic [ref=e536]: 产业链
            - generic [ref=e537]:
              - generic [ref=e538]: 🔥 29
              - generic [ref=e539]: 💰 1
              - generic [ref=e540]: 🎯 2
              - generic [ref=e541]: +2.33%
              - generic [ref=e542]: 额118.0亿
          - img "right" [ref=e543]:
            - img [ref=e544]
        - generic [ref=e546] [cursor=pointer]:
          - generic [ref=e547]:
            - generic [ref=e548]: "32"
            - generic [ref=e549]: 一般
          - generic [ref=e550]:
            - generic [ref=e551]:
              - strong [ref=e553]: 公用事业
              - generic [ref=e554]: 142只
              - generic [ref=e555]: 🔥5涨停
              - button "apartment 产业链" [ref=e556]:
                - img "apartment" [ref=e558]:
                  - img [ref=e559]
                - generic [ref=e561]: 产业链
            - generic [ref=e562]:
              - generic [ref=e563]: 🔥 25
              - generic [ref=e564]: 💰 3
              - generic [ref=e565]: 🎯 3
              - generic [ref=e566]: +1.97%
              - generic [ref=e567]: 额803.2亿
          - img "right" [ref=e568]:
            - img [ref=e569]
        - generic [ref=e571] [cursor=pointer]:
          - generic [ref=e572]:
            - generic [ref=e573]: "31"
            - generic [ref=e574]: 一般
          - generic [ref=e575]:
            - generic [ref=e576]:
              - strong [ref=e578]: 钢铁
              - generic [ref=e579]: 71只
              - button "apartment 产业链" [ref=e580]:
                - img "apartment" [ref=e582]:
                  - img [ref=e583]
                - generic [ref=e585]: 产业链
            - generic [ref=e586]:
              - generic [ref=e587]: 🔥 30
              - generic [ref=e588]: 💰 1
              - generic [ref=e589]: 🎯 0
              - generic [ref=e590]: +2.37%
              - generic [ref=e591]: 额128.5亿
          - img "right" [ref=e592]:
            - img [ref=e593]
  - generic "AI助手 — 随时提问" [ref=e595] [cursor=pointer]:
    - img "message" [ref=e596]:
      - img [ref=e597]
  - tablist "主导航" [ref=e599]:
    - tab "洞察" [selected] [ref=e600] [cursor=pointer]:
      - generic [ref=e601]: 🔭
      - generic [ref=e602]: 洞察
    - tab "选股" [ref=e603] [cursor=pointer]:
      - generic [ref=e604]: 🎯
      - generic [ref=e605]: 选股
    - tab "自选" [ref=e606] [cursor=pointer]:
      - generic [ref=e607]: ⭐
      - generic [ref=e608]: 自选
    - tab "产业" [ref=e609] [cursor=pointer]:
      - generic [ref=e610]: 🗺️
      - generic [ref=e611]: 产业
  - button "切换到浅色模式" [ref=e612] [cursor=pointer]: ☀️
  - img "setting" [ref=e614] [cursor=pointer]:
    - img [ref=e615]
```

# Test source

```ts
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
  44  |     await searchInput.fill('平安');
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
> 130 |     await page.waitForSelector('.ant-layout-content', { timeout: 5000 });
      |                ^ TimeoutError: page.waitForSelector: Timeout 5000ms exceeded.
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
  145 |     expect(page.url()).toMatch(/\/$/);
  146 |   });
  147 | 
  148 |   test('/review 应重定向到 /watchlist?tab=review', async ({ page }) => {
  149 |     await page.goto('/review');
  150 |     await page.waitForURL(/\/watchlist\?tab=review/);
  151 |     expect(page.url()).toContain('tab=review');
  152 |   });
  153 | 
  154 |   test('/home 应重定向到首页', async ({ page }) => {
  155 |     await page.goto('/home');
  156 |     await page.waitForURL('**/');
  157 |     expect(page.url()).toMatch(/\/$/);
  158 |   });
  159 | });
  160 | 
  161 | test.describe('产业地图页', () => {
  162 |   test('应该能访问产业地图', async ({ page }) => {
  163 |     await page.goto('/industry-map');
  164 |     await page.waitForSelector('.ant-layout-content, .ant-spin, .ant-empty', { timeout: 10000 });
  165 |     await expect(page.locator('.ant-layout-content')).toBeVisible();
  166 |   });
  167 | });
  168 | 
  169 | test.describe('潜力雷达页', () => {
  170 |   test('应该能访问潜力雷达', async ({ page }) => {
  171 |     await page.goto('/radar');
  172 |     await page.waitForSelector('.ant-layout-content, .ant-spin, .ant-empty', { timeout: 10000 });
  173 |     await expect(page.locator('.ant-layout-content')).toBeVisible();
  174 |   });
  175 | });
  176 | 
  177 | test.describe('投资笔记页', () => {
  178 |   test('应该能访问投资笔记', async ({ page }) => {
  179 |     await page.goto('/knowledge');
  180 |     await page.waitForSelector('.ant-layout-content, .ant-spin, .ant-empty', { timeout: 10000 });
  181 |     await expect(page.locator('.ant-layout-content')).toBeVisible();
  182 |   });
  183 | });
  184 | 
  185 | test.describe('404 页面', () => {
  186 |   test('未知路由应显示 404', async ({ page }) => {
  187 |     await page.goto('/this-route-does-not-exist-12345');
  188 |     await page.waitForSelector('.ant-layout-content, .ant-result', { timeout: 10000 });
  189 |     // 404 页面应该可见（可能是 ant-result 或自定义内容）
  190 |     const content = page.locator('.ant-layout-content');
  191 |     await expect(content).toBeVisible();
  192 |   });
  193 | });
  194 | 
  195 | test.describe('自选组合 Hub', () => {
  196 |   test('应该能在追踪和复盘 Tab 间切换', async ({ page }) => {
  197 |     await page.goto('/watchlist');
  198 |     await page.waitForSelector('.ant-tabs', { timeout: 10000 });
  199 |     // 点击 AI复盘 Tab
  200 |     const reviewTab = page.getByText('AI复盘').first();
  201 |     if (await reviewTab.isVisible()) {
  202 |       await reviewTab.click();
  203 |       await page.waitForTimeout(500);
  204 |     }
  205 |     // 切换回自选追踪
  206 |     const trackingTab = page.getByText('自选追踪').first();
  207 |     if (await trackingTab.isVisible()) {
  208 |       await trackingTab.click();
  209 |       await page.waitForTimeout(500);
  210 |     }
  211 |   });
  212 | });
  213 | 
```