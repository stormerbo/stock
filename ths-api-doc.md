# 同花顺 A 股行情 HTTP 接口文档

> 整理时间：2026-05-18 ｜ 验证状态：[✅] 已验证可用 ｜ [❓] 未验证
> 同花顺概念指数代码格式：**8 开头 6 位数字**（如 886013=信创, 886041=存储芯片）
> 东方财富概念板块代码格式：**BK 开头**（如 BK0966）

---

## 如何获取概念代码

### 方式A：东方财富 push2 API（推荐，国内用）
> ⚠️ **海外/香港 IP 直接断连（Empty reply from server），海外用户不要用这个**

```
GET https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=100&po=1&np=1&fields=f12,f14&fid=f62&fs=m:90+t:3
```

**参数：**
- `fs=m:90+t:3` 概念板块（`t:2`=行业板块, `t:3`=概念板块）
- `pn` = 页码，`pz` = 每页条数（最多100）
- `f12` = 板块代码（BK开头），`f14` = 板块名称

**示例：**
```bash
# 第1页，取5条看看
curl -s "https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=5&po=1&np=1&fields=f12,f14&fid=f62&fs=m:90+t:3"
```

**注意：** ⚠️ 海外 IP 可能被屏蔽，返回空结果

### 方式B：同花顺问财搜索 API（同花顺官方，国内用）

```
GET http://search.10jqka.com.cn/gateway/urp/v7/landing/getDataList?perpage=100&page=1&query=所有概念&...（完整参数见源码注释）
```

**返回字段：** `code` = 指数代码（8开头）, `指数简称` = 概念名称

**注意：** ⚠️ 需要随请求附带同花顺 Cookie，海外 IP 可能被限制

### 方式C：爬取同花顺概念页面

```
GET http://q.10jqka.com.cn/gn/
```

解析页面中所有概念板块链接，提取概念代码。但该页面仅显示最新/热点概念（约10条），非全量。

### 方式D：问财语义 API（同花顺，需Cookie + 海外可能受限）

```
POST http://www.iwencai.com/gateway/urp/v7/landing/getDataList
Body: query={name} 概念成分股有哪些&...
```

---

## 代码对照说明

| 数据源 | 板块代码格式 | 示例 | 用途 |
|--------|-------------|------|------|
| 同花顺概念指数 | 8开头6位 | `886013` | 7.1 成分股API / 板块行情 |
| 同花顺概念索引 | 3开头6位 | `309265` | 7.2 HTML爬取成分股 |
| 东方财富概念板块 | BK开头 | `BK0966` | 板块资金流向 / 成分股查询 |

## 一、个股行情

### 1.1 腾讯财经接口（个股实时行情，同花顺系共用）

```
GET http://qt.gtimg.cn/q={code1},{code2},...
```

**参数说明：**
- `code` 格式：`sh`/`sz`/`bj` 前缀 + 股票代码
  - 沪市：`sh600519`
  - 深市：`sz000001`
  - 北交所：`bj830799`
  - 港股：`hk00700`
  - 美股：`usAAPL`

**示例：**
```bash
curl -s "http://qt.gtimg.cn/q=sh600519"
curl -s "http://qt.gtimg.cn/q=sh600519,sz000001,sh000001"
```

**返回格式：** GBK 编码，`v_sh600519="字段1~字段2~...~字段N"`

**字段索引：**
| 索引 | 字段 | 说明 |
|------|------|------|
| 1 | 股票名称 | 如"贵州茅台" |
| 2 | 股票代码 | 如"600519" |
| 3 | 当前价 | 最新成交价 |
| 4 | 昨收价 | 昨日收盘价 |
| 5 | 今开价 | 今日开盘价 |
| 6 | 成交量 | 手 |
| 7 | 成交额 | 元 |
| 8 | 最高价 | - |
| 9 | 最低价 | - |
| 10 | 时间 | - |
| 39 | PE(TTM) | 动态市盈率 |
| 43 | 振幅% | 注意不是PB |
| 44 | 流通市值 | 亿 |
| 45 | 总市值 | 亿 |
| 46 | PB | 市净率 |
| 47 | 涨停价 | - |
| 48 | 跌停价 | - |

---

### 1.2 同花顺个股实时行情

```
GET http://d.10jqka.com.cn/v6/real/{market}_{code}/last.js
```

**示例：**
```bash
# 深市股票
curl -s "http://d.10jqka.com.cn/v6/real/0_000001/last.js"
# 沪市股票
curl -s "http://d.10jqka.com.cn/v6/real/1_600519/last.js"
```

---

## 二、概念板块行情 [✅ 已验证可用]

### 2.1 概念板块当前行情快照

```
GET http://d.10jqka.com.cn/v6/line/48_{code}/01/today.js
```

**参数：**
- `code`：同花顺概念板块代码（8 开头 6 位数字）
- `01`：日K前复权（`00`=不复权, `01`=前复权, `02`=后复权）

**示例：**
```bash
# 信创概念 (886013)
curl -s "http://d.10jqka.com.cn/v6/line/48_886013/01/today.js"
```

**返回字段：**
```json
quotebridge_v6_line_48_886013_01_today({
  "48_886013": {
    "1": "20260518",       // 交易日期
    "7": "2216.773",       // 开盘价
    "8": "2249.134",       // 最高价
    "9": "2214.665",       // 最低价
    "11": "2237.986",      // 最新价
    "13": 4693438300,      // 成交量(股)
    "19": "126710549000",  // 成交额(元)
    "name": "信创",         // 板块名称
    "dt": "1158"           // 时间
  }
})
```

### 2.2 概念板块历史 K 线

```
GET http://d.10jqka.com.cn/v6/line/48_{code}/{ktype}/last1800.js
```

**参数：**
| ktype | 说明 |
|-------|------|
| `00` | 日K 不复权 |
| `01` | 日K 前复权（最常用） |
| `02` | 日K 后复权 |
| `11` | 周K 前复权 |
| `21` | 月K 前复权 |

**示例：**
```bash
curl -s "http://d.10jqka.com.cn/v6/line/48_886013/01/last1800.js"
```

**返回格式：**
```
quotebridge_v6_line_48_886013_01_last1800({
  "rt": "0930-1130,1300-1500",
  "num": 883,
  "name": "信创",
  "data": "20220919,1002.472,1003.266,966.030,966.685,820953530,16959251000.000,,,,0;20220920,..."
})
```

data 字段每行格式（`;` 分隔，`,` 分隔列）：
| 列 | 字段 | 说明 |
|----|------|------|
| 1 | 日期 | YYYYMMDD |
| 2 | 开盘价 | - |
| 3 | 最高价 | - |
| 4 | 最低价 | - |
| 5 | 收盘价 | - |
| 6 | 成交量 | 股 |
| 7 | 成交额 | 元 |

### 2.3 概念板块当日分时

```
GET http://d.10jqka.com.cn/v6/time/48_{code}/last.js
```

**示例：**
```bash
curl -s "http://d.10jqka.com.cn/v6/time/48_886013/last.js"
```

**返回格式：**
```
quotebridge_v6_time_48_886013_last({
  "48_886013": {
    "data": "0930,958.901,74456973,36.807,2022925;...",
    "pre": "960.374"
  }
})
```

分时数据每行（`;` 分隔）：
| 列 | 字段 |
|----|------|
| 1 | 时间 (HHMM) |
| 2 | 现价 |
| 3 | 成交额(元) |
| 4 | 均价 |
| 5 | 成交量(股) |

---

## 三、板块列表

### 3.1 概念板块代码列表

```
GET http://q.10jqka.com.cn/gn/
```

爬取页面 HTML 解析概念板块名称和代码。页面中每个概念有一个详情链接：
`/gn/detail/code/{code}/`

### 3.2 热门概念板块20排行 [✅ 已验证可用]

```
GET https://dq.10jqka.com.cn/fuyao/hot_list_data/out/hot_list/v1/stock?stock_type=a&type=hour&list_type=normal
```

**说明：** 返回个股热度排行榜，包含所属概念标签（`concept_tag`），可通过统计推断当天热门概念。

**示例：**
```bash
curl -s "https://dq.10jqka.com.cn/fuyao/hot_list_data/out/hot_list/v1/stock?stock_type=a&type=hour&list_type=normal"
```

**返回字段：**
```json
{
  "status_code": 0,
  "data": {
    "stock_list": [
      {
        "code": "601991",
        "name": "大唐发电",
        "rate": "5547308.0",
        "rise_and_fall": 0.1263,
        "tag": {
          "concept_tag": ["绿色电力", "风电"],
          "popularity_tag": "持续上榜"
        }
      }
    ]
  }
}
```

---

## 四、行业板块行情 [❓ 未验证]

### 4.1 行业板块列表

```
GET http://q.10jqka.com.cn/tyhw/
```

爬取页面解析行业板块名称和代码。

### 4.2 行业板块行情

```
GET http://d.10jqka.com.cn/v6/line/40_{code}/{ktype}/last1800.js
```

行业板块代码格式与概念板块不同，具体代码需从行业板块页面获取。

---

## 五、大盘指数

### 5.1 指数行情

```
GET http://d.10jqka.com.cn/v6/real/1_000001/last.js    # 上证指数
GET http://d.10jqka.com.cn/v6/real/0_399001/last.js    # 深证成指
GET http://d.10jqka.com.cn/v6/real/0_399006/last.js    # 创业板指
GET http://d.10jqka.com.cn/v6/real/1_000688/last.js    # 科创50
```

---

## 六、辅助接口

### 6.1 龙虎榜

```
GET https://data.eastmoney.com/stock/lhb/yyb/{yyb_id}.html
```

### 6.2 北向资金（沪深港通）

同花顺通过 hsgtApi 提供北向资金接口：
```
# 通过 akshare 或 hsgtApi 获取
GET https://api.hsgtapi.com/...
```

---

## 七、概念板块成分股 [✅ 已验证可用]

### 7.1 通过指数代码获取成分股（推荐）

```
GET https://d.10jqka.com.cn/v2/blockrank/{index_code}/8/d3000.js
```

**参数：**
- `index_code`：同花顺概念指数代码（8 开头 6 位数字，如 `886013`=信创）
- `d3000`：一次性返回最多 3000 条记录（覆盖所有成分股）
- 分页模式（每页15条）：`d15.js`(第1页), `d30.js`(第2页), `d45.js`(第3页)...

**示例：**
```bash
# 一次性拉取全部成分股（推荐）
curl -s "https://d.10jqka.com.cn/v2/blockrank/886013/8/d3000.js"

# 分页取第一页（前15只）
curl -s "https://d.10jqka.com.cn/v2/blockrank/886013/8/d15.js"
```

**返回格式：**
```
quotebridge_v2_blockrank_886013_8_d3000({
  "block": {
    "name": "信创",
    "subcodeCount": 300    // 总成分股数
  },
  "items": [
    {
      "5": "920953",         // 股票代码
      "55": "国子软件",       // 股票名称
      "6": "28.54",          // 最新价
      "1968584": "0.000",    // 涨跌幅(%)
      "2034120": "724.430",  // 涨跌额
      "3475914": "1709139400", // 成交额(元)
      "3541450": "3656430400"  // 流通市值(元)
    },
    ...
  ]
})
```

**字段说明（items 内）：**
| 字段 | 说明 |
|------|------|
| `5` | 股票代码 |
| `55` | 股票名称 |
| `6` | 最新价 |
| `1968584` | 涨跌幅% |
| `2034120` | 涨跌额 |
| `3475914` | 成交额(元) |
| `3541450` | 流通市值(元) |

### 7.2 通过概念代码获取成分股（HTML 解析）

```
GET http://q.10jqka.com.cn/gn/detail/code/{concept_code}/
```

**参数：**
- `concept_code`：同花顺概念索引代码（3 开头，如 `309265`）

**说明：** 返回 HTML 页面，需解析 `<table>` 表格提取股票代码和名称，使用 BeautifulSoup 或正则。

### 7.3 通过概念名称获取成分股（问财接口）

```
POST http://www.iwencai.com/gateway/urp/v7/landing/getDataList
Content-Type: application/x-www-form-urlencoded

# Body:
query={name} 概念成分股有哪些&...
```

**说明：** 问财语义搜索接口，需注意 IP 限制和 Cookie 处理。

---

## 八、综合建议

| 数据需求 | 推荐接口 | 说明 |
|---------|---------|------|
| 单只股票实时行情 | `qt.gtimg.cn` | 腾讯接口，国内海外都可用 |
| 概念板块当前行情 | `d.10jqka.com.cn/v6/line/48_{code}/01/today.js` | ✅ 已验证海外可用 |
| 概念板块历史K线 | `d.10jqka.com.cn/v6/line/48_{code}/01/last1800.js` | ✅ 已验证海外可用 |
| 概念板块当日分时 | `d.10jqka.com.cn/v6/time/48_{code}/last.js` | ✅ 已验证海外可用 |
| 个股热度+概念标签 | `dq.10jqka.com.cn/fuyao/hot_list` | ✅ 已验证海外可用 |
| 板块代码列表 | 爬 `q.10jqka.com.cn/gn/` | 需要解析HTML |

### 相关 GitHub 项目

- [akfamily/akshare](https://github.com/akfamily/akshare) ⭐18k — Python财经数据接口
- [1nchaos/adata](https://github.com/1nchaos/adata) ⭐2k — A股量化数据（底层封装了同花顺+东方财富HTTP接口）
- [akfamily/aktools](https://github.com/akfamily/aktools) — 一键将 akshare 启动为 HTTP API 服务
- [simonlin1212/a-stock-data](https://github.com/simonlin1212/a-stock-data) — A股全栈数据工具包
