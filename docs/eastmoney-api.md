# EastMoney 基金/股票 API 接口文档

> 来源：[x2rr/funds](https://github.com/x2rr/funds) 项目逆向整理
>
> 所有接口均可通过 Chrome Extension Service Worker (`fetch`) 跨域访问，无需 Referer 头。

---

## 目录

- [一、fundmobapi.eastmoney.com（基金数据）](#一fundmobapieastmoneycom基金数据)
- [二、push2.eastmoney.com（实时行情）](#二push2eastmoneycom实时行情)
- [三、fundsuggest.eastmoney.com（基金搜索）](#三fundsuggesteastmoneycom基金搜索)
- [四、静态资源](#四静态资源)

---

## 一、fundmobapi.eastmoney.com（基金数据）

### 1.1 基金实时估值/净值（批量）

**用途**：批量获取多个基金的单位净值、估算净值、涨跌幅

```
GET https://fundmobapi.eastmoney.com/FundMNewApi/FundMNFInfo
```

**参数**：

| 参数 | 必填 | 说明 |
|------|------|------|
| `pageIndex` | 是 | `1` |
| `pageSize` | 是 | 返回数量，最大 `200` |
| `plat` | 是 | `Android` |
| `appType` | 是 | `ttjj` |
| `product` | 是 | `EFund` |
| `Version` | 是 | `1` |
| `deviceid` | 是 | 设备 UUID |
| `Fcodes` | 是 | 逗号分隔的基金代码，如 `161725,001234` |

**返回**：

```jsonc
{
  "Datas": [
    {
      "FCODE": "161725",       // 基金代码
      "SHORTNAME": "招商中证白酒指数(LOF)A",  // 基金简称
      "PDATE": "2026-04-17",   // 净值日期
      "NAV": "0.6288",         // 单位净值
      "NAVCHGRT": "-1.87",     // 净值日涨跌幅
      "ACCNAV": "2.3449",      // 累计净值
      "GSZ": "0.6287",         // 估算净值（盘中）
      "GSZZL": "-0.01",        // 估算涨跌幅
      "GZTIME": "2026-04-20 15:00", // 估值时间
      "DWJZ": "0.6288"         // 同 NAV
    }
  ]
}
```

**关键逻辑**：
- 如果 `PDATE == GZTIME.substr(0,10)`（净值日期 == 估值日期），说明今日净值已公布，此时用 `NAV` 和 `NAVCHGRT` 替换 `GSZ` 和 `GSZZL`。

---

### 1.2 基金分时估值明细

**用途**：获取基金盘中分时估算数据（每分钟一个点）

```
GET https://fundmobapi.eastmoney.com/FundMApi/FundVarietieValuationDetail.ashx
```

**参数**：

| 参数 | 必填 | 说明 |
|------|------|------|
| `FCODE` | 是 | 基金代码 |
| `deviceid` | 是 | `Wap` |
| `plat` | 是 | `Wap` |
| `product` | 是 | `EFund` |
| `version` | 是 | `2.0.0` |
| `_` | 是 | 时间戳 |

**返回**：

```jsonc
{
  "Datas": [
    "09:30,,0.01",   // 逗号分隔，[2] = 估算涨跌幅
    "09:31,,0.02",
    // ...
  ],
  "Expansion": {
    "DWJZ": "0.6288"  // 前一日单位净值
  }
}
```

---

### 1.3.1 基金单位净值/累计净值走势图

**用途**：获取历史净值走势数据

```
GET https://fundmobapi.eastmoney.com/FundMApi/FundNetDiagram.ashx
```

**参数**：

| 参数 | 必填 | 说明 |
|------|------|------|
| `FCODE` | 是 | 基金代码 |
| `RANGE` | 是 | 时间范围：`y`=近1月, `3y`=近3月, `6y`=近6月, `n`=近1年, `3n`=近3年, `5n`=近5年 |
| `deviceid` | 是 | `Wap` |
| `plat` | 是 | `Wap` |
| `product` | 是 | `EFund` |
| `version` | 是 | `2.0.0` |
| `_` | 是 | 时间戳 |

**返回**：

```jsonc
{
  "Datas": [
    {
      "FSRQ": "2026-04-17",  // 日期
      "DWJZ": "0.6288",      // 单位净值
      "LJJZ": "2.3449",      // 累计净值
      "JZZZL": "-1.87"       // 日增长率
    }
  ]
}
```

---

### 1.3.2 基金累计收益率走势图

**用途**：获取基金累计收益走势（含基准对比）

```
GET https://fundmobapi.eastmoney.com/FundMApi/FundYieldDiagramNew.ashx
```

**参数**：同 1.3.1

**返回**：

```jsonc
{
  "Datas": [
    {
      "PDATE": "2026-04-17",  // 日期
      "YIELD": "-23.93",      // 基金累计收益率
      "INDEXYIED": "-15.00"   // 基准指数累计收益率
    }
  ],
  "Expansion": {
    "INDEXNAME": "沪深300"   // 基准指数名称
  }
}
```

---

### 1.4 基金基本信息（概况）

**用途**：获取基金类型、公司、经理、规模、阶段收益率及排名

```
GET https://fundmobapi.eastmoney.com/FundMApi/FundBaseTypeInformation.ashx
```

**参数**：

| 参数 | 必填 | 说明 |
|------|------|------|
| `FCODE` | 是 | 基金代码 |
| `deviceid` | 是 | `Wap` |
| `plat` | 是 | `Wap` |
| `product` | 是 | `EFund` |
| `version` | 是 | `2.0.0` |
| `Uid` | 否 | 空 |
| `_` | 是 | 时间戳 |

**返回**：

```jsonc
{
  "Datas": {
    "FCODE": "161725",
    "SHORTNAME": "招商中证白酒指数(LOF)A",
    "FTYPE": "指数型-股票",         // 基金类型
    "FUNDTYPE": "001",
    "JJGS": "招商基金",            // 基金公司
    "JJJL": "侯昊",                // 基金经理
    "DWJZ": "0.6288",              // 单位净值
    "FSRQ": "2026-04-17",          // 净值日期
    "LJJZ": "2.3449",              // 累计净值
    "RZDF": "-1.87",               // 日涨跌幅
    "SYL_Y": "-6.8",               // 近1月收益率
    "SYL_3Y": "-11.34",            // 近3月收益率
    "SYL_6Y": "-20.25",            // 近6月收益率
    "SYL_1N": "-23.93",            // 近1年收益率
    "RANKM": "4938",               // 近1月排名
    "RANKQ": "4566",               // 近3月排名
    "RANKHY": "4479",              // 近6月排名
    "RANKY": "3722",               // 近1年排名
    "SGZT": "限大额(单日投资上限50万元)",  // 申购状态
    "SHZT": "开放赎回",            // 赎回状态
    "ENDNAV": "28495463455.46",    // 基金规模（元）
    "FEGM": "40141836329.19",      // 基金规模（另一种口径）
    "ISSBCFMDATA": "2015-05-12 00:00:00",  // 成立日期
    "ISSEDATE": "2015-05-22 15:00:00",     // 上市日期
    "RISKLEVEL": "4",              // 风险等级
    "FUNDINVEST": "贵州茅台,山西汾酒,...", // 持仓股票
    "RATE": "0.10%",               // 费率
    "MINSG": "10",                 // 最低申购金额
    "FUNDBONUS": {
      "PDATE": "2021-12-31",       // 分红日期
      "CHGRATIO": 0.045            // 分红比例
    }
  }
}
```

---

### 1.5 基金持仓股票明细（十大重仓）

**用途**：获取基金持仓股票列表（股票代码、名称、净值占比、较上期变化）

```
GET https://fundmobapi.eastmoney.com/FundMNewApi/FundMNInverstPosition
```

**参数**：

| 参数 | 必填 | 说明 |
|------|------|------|
| `FCODE` | 是 | 基金代码 |
| `deviceid` | 是 | `Wap` |
| `plat` | 是 | `Wap` |
| `product` | 是 | `EFund` |
| `version` | 是 | `2.0.0` |
| `Uid` | 否 | 空 |
| `_` | 是 | 时间戳 |

**返回**：

```jsonc
{
  "Datas": {
    "fundStocks": [
      {
        "GPJC": "贵州茅台",          // 股票简称
        "GPDM": "600519",            // 股票代码
        "JZBL": "14.52",             // 净值占比(%)
        "PCTNVCHG": "新增",           // 较上期变化（"新增"/"+0.12%"/"-0.05%"）
        "NEWTEXCH": "1"              // 交易所代码（1=沪, 0=深）
      }
    ]
  },
  "Expansion": "2026-03-31"  // 持仓截止日期
}
```

---

### 1.6 基金经理变动列表

**用途**：获取基金经理变更历史

```
GET https://fundmobapi.eastmoney.com/FundMApi/FundManagerList.ashx
```

**参数**：同 1.4

**返回**：

```jsonc
{
  "Datas": [
    {
      "MGRID": "30379533",           // 经理ID
      "MGRNAME": "侯昊",             // 经理姓名
      "FEMPDATE": "2021-05-12",      // 上任日期
      "LEMPDATE": "",                // 离任日期（空表示现任）
      "DAYS": "1805",                // 任职天数
      "PENAVGROWTH": "-23.93"        // 任职涨幅
    }
  ]
}
```

---

### 1.7 基金经理详情

**用途**：获取基金经理简历和业绩

```
GET https://fundmobapi.eastmoney.com/FundMApi/FundMangerDetail.ashx
```

**参数**：同 1.4

**返回**：

```jsonc
{
  "Datas": [
    {
      "MGRNAME": "侯昊",
      "PHOTOURL": "https://...",     // 照片URL
      "RESUME": "硕士...工作经历...", // 简历
      "FEMPDATE": "2021-05-12",
      "DAYS": "1805"
    }
  ]
}
```

---

## 二、push2.eastmoney.com（实时行情）

### 2.1 多标的实时行情（股票/指数）

**用途**：批量获取多个股票或指数的实时行情

```
GET https://push2.eastmoney.com/api/qt/ulist.np/get
```

**参数**：

| 参数 | 必填 | 说明 |
|------|------|------|
| `fltt` | 是 | `2` |
| `fields` | 是 | 字段列表，常用：`f2,f3,f4,f6,f12,f13,f14,f104,f105,f106,f292` |
| `secids` | 是 | 逗号分隔，格式 `{市场}.{代码}`，如 `1.600519,0.000001` |
| `_` | 否 | 时间戳 |

**字段说明**：

| 字段 | 含义 |
|------|------|
| `f1` | 未知 |
| `f2` | 最新价 |
| `f3` | 涨跌幅(%) |
| `f4` | 涨跌额 |
| `f6` | 成交额 |
| `f12` | 代码 |
| `f13` | 市场ID（0=深, 1=沪） |
| `f14` | 名称 |
| `f104` | 上涨家数 |
| `f105` | 下跌家数 |
| `f106` | 平盘家数 |
| `f292` | 其他 |

**市场代码**：

| 市场ID | 含义 |
|--------|------|
| `0` | 深证 |
| `1` | 上证 |
| `105` | 港股 |
| `107` | 美股 |

**返回**：

```jsonc
{
  "data": {
    "diff": [
      {
        "f12": "600519",     // 代码
        "f13": 1,            // 市场
        "f14": "贵州茅台",    // 名称
        "f2": 1800.00,       // 最新价
        "f3": 2.50,          // 涨跌幅%
        "f4": 45.00          // 涨跌额
      }
    ]
  }
}
```

---

### 2.2 个股/指数分时走势

**用途**：获取某只股票或指数的分时数据

```
GET https://push2.eastmoney.com/api/qt/stock/trends2/get
```

**参数**：

| 参数 | 必填 | 说明 |
|------|------|------|
| `secid` | 是 | `{f13}.{f12}`，如 `1.000001` |
| `fields1` | 是 | `f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13` |
| `fields2` | 是 | `f51,f53,f56,f58` |
| `iscr` | 是 | `0` |
| `iscca` | 是 | `0` |
| `ndays` | 是 | `1`（1天）|
| `forcect` | 是 | `1` |

**返回**：

```jsonc
{
  "data": {
    "prePrice": 3300.00,       // 昨收价
    "trends": [
      "2026-04-20 09:30,3301.50,1000",  // 时间,价格,成交量 (逗号分隔)
      "2026-04-20 09:31,3302.00,800",
      // ...
    ]
  }
}
```

---

### 2.3 大盘资金流向

**用途**：获取大盘每分钟的资金流向数据

```
GET http://push2.eastmoney.com/api/qt/stock/fflow/kline/get
```

**参数**：

| 参数 | 必填 | 说明 |
|------|------|------|
| `lmt` | 是 | `0` |
| `klt` | 是 | `1`（1分钟K线）|
| `secid` | 是 | `1.000001`（上证）|
| `secid2` | 是 | `0.399001`（深证）|
| `fields1` | 是 | `f1,f2,f3,f7` |
| `fields2` | 是 | `f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63` |

**返回**：

```jsonc
{
  "data": {
    "klines": [
      "2026-04-20 09:30,-5.2,3.1,-2.1,-1.5,-3.7",  // 逗号分隔:
      // [1]=主力净流入, [2]=小单净流入, [3]=中单净流入
      // [4]=大单净流入, [5]=超大单净流入
    ]
  }
}
```

---

### 2.4 行业板块排行

**用途**：获取行业板块涨跌幅排行

```
GET http://push2.eastmoney.com/api/qt/clist/get
```

**参数**：

| 参数 | 必填 | 说明 |
|------|------|------|
| `pn` | 是 | 页码 |
| `pz` | 是 | 每页条数，如 `500` |
| `po` | 是 | 排序方式，`1`=降序 |
| `np` | 是 | `1` |
| `fields` | 是 | `f12,f13,f14,f62` |
| `fid` | 是 | 排序字段，如 `f62` |
| `fs` | 是 | 筛选条件，如 `m:90+t:2`（行业板块）|

**返回**：

```jsonc
{
  "data": {
    "diff": [
      {
        "f12": "BK0001",       // 板块代码
        "f13": 90,             // 市场
        "f14": "白酒",          // 板块名称
        "f62": -2.5            // 涨跌幅或净流入
      }
    ]
  }
}
```

---

### 2.5 北向/南向资金分时

**用途**：获取北向资金（外资）和南向资金（港股通）分时流入数据

```
GET http://push2.eastmoney.com/api/qt/kamt.rtmin/get
```

**参数**：

| 参数 | 必填 | 说明 |
|------|------|------|
| `fields1` | 是 | `f1,f2,f3,f4` |
| `fields2` | 是 | `f51,f52,f53,f54,f55,f56` |
| `ut` | 否 | 空 |
| `v` | 是 | 时间戳 |

**返回**：

```jsonc
{
  "data": {
    "s2n": [  // 北向资金（外资流入）
      "09:30,1.2,100.0,0.8,50.0,2.0"  // 逗号分隔:
      // [1]=沪股通净流入(亿), [2]=沪股通余额
      // [3]=深股通净流入(亿), [4]=深股通余额
      // [5]=北向总净流入(亿)
    ],
    "n2s": [  // 南向资金（港股通流入）
      // 格式同 s2n
    ]
  }
}
```

---

## 三、fundsuggest.eastmoney.com（基金搜索）

### 3.1 基金搜索

**用途**：根据关键词搜索基金

```
GET https://fundsuggest.eastmoney.com/FundSearch/api/FundSearchAPI.ashx
```

**参数**：

| 参数 | 必填 | 说明 |
|------|------|------|
| `m` | 是 | `9` |
| `key` | 是 | 搜索关键词 |
| `_` | 是 | 时间戳 |

**返回**：

```jsonc
{
  "Datas": [
    {
      "CODE": "161725",      // 基金代码
      "NAME": "招商中证白酒指数(LOF)A"  // 基金名称
    }
  ]
}
```

---

## 四、静态资源

### 4.1 节假日数据

**用途**：判断A股交易日

```
GET http://x2rr.github.io/funds/holiday.json
```

**返回**：按年份/日期组织的 JSON 对象，`holiday: true` 表示节假日。

### 4.2 更新日志

```
GET https://x2rr.github.io/funds/src/common/changeLog.json
```

---

## 五、市场代码映射速查

| 标识 | 市场 | 使用场景 |
|------|------|---------|
| `0` | 深证 | 股票代码前缀 |
| `1` | 上证 | 股票/指数代码前缀 |
| `105` | 港股 | 港股代码前缀 |
| `107` | 美股 | 美股代码前缀 |

**构造 secid**：`${market}.${code}`，例如：
- 上证指数：`1.000001`
- 贵州茅台：`1.600519`
- 五粮液：`0.000858`

---

## 六、CORS 注意事项

| API 域 | Service Worker 直接 fetch | 浏览器 fetch |
|--------|--------------------------|-------------|
| `fundmobapi.eastmoney.com` | 不支持（无 CORS 头） | 不支持 |
| `push2.eastmoney.com` | 不支持（无 CORS 头） | 不支持 |
| `fundsuggest.eastmoney.com` | 不支持 | 不支持 |
| `fund.eastmoney.com/pingzhongdata` | 支持 | 支持 |
| `fundgz.1234567.com.cn` | 支持 | 支持 |

**解决方案**：Chrome Extension 的 Service Worker 不受同源策略限制，可以直接 fetch 这些 API。

---

## 七、注意事项

1. **估值时间判断**：`GZTIME` 与 `PDATE` 比较判断净值是否已公布（见 1.1 关键逻辑）
2. **交易所代码**：持仓 API 的 `NEWTEXCH` 字段，`1`=上证, `0`=深证
3. **净值数据**：指数基金的 `unitMoney` 可能为空字符串，需要 fallback 到 `y` 值
4. **基金概况**：部分 LOF/指数基金的 `pingzhongdata` 不包含 `fS_type` 和 `Data_establishDate`，需要从 base API 获取
5. **角标限制**：Chrome 角标最多显示 4 个字符，数值需要缩略
