# 腾讯财经股票接口文档

> 综合整理自 GitHub 开源项目社区
>
> 参考来源：
> - https://github.com/Flying9001/stock-alert/blob/master/doc/stock_api_tencent.md
> - https://github.com/shaipe/data-apis/blob/master/stock.md
> - https://github.com/zhangxiangliang/stock-api

**注意：以下接口均为非官方 HTTP API，随时可能变更或下线，仅供学习交流使用。**

---

## 一、实时行情接口

### 1.1 接口地址

```
GET https://qt.gtimg.cn/q=
```

### 1.2 交易所编码

| 交易所 | 编码 | 说明 |
|--------|------|------|
| 上海交易所 | `sh` | 6 开头的股票 |
| 深圳交易所 | `sz` | 非 6 开头的 A 股 |

### 1.3 使用示例

**查询单只股票：**

```
GET https://qt.gtimg.cn/q=sh600036
```

**批量查询：**

```
GET https://qt.gtimg.cn/q=sh600036,sz000001,sz000002
```

**建议加 Referer 请求头增强稳定性：**

```
Referer: https://stockapp.finance.qq.com/
```

### 1.4 返回数据格式

返回类似 JavaScript 变量的字符串，用 `~` 分隔各字段：

```
v_sh600036="1~招商银行~600036~18.52~18.60~18.58~243520~107651~135870~18.52~88~18.51~49~...";
```

### 1.5 字段说明（按 `~` 分割后的下标）

| 下标 | 字段说明 | 示例值 |
|------|----------|--------|
| 0 | 未知 | 1 |
| 1 | 股票名称 | 招商银行 |
| 2 | 股票代码 | 600036 |
| 3 | **当前价格** | 18.52 |
| 4 | **昨日收盘价** | 18.60 |
| 5 | **今日开盘价** | 18.58 |
| 6 | **成交量（手）** | 243520 |
| 7 | 外盘（主动买入量） | 107651 |
| 8 | 内盘（主动卖出量） | 135870 |
| 9-18 | **买卖五档**（价格+数量，共10个字段） | — |
| 30 | 日期时间 | 20260513153812 |
| 31 | **涨跌额** | -0.56 |
| 32 | **涨跌幅(%)** | -1.06 |
| 33 | **今日最高价** | 18.90 |
| 34 | **今日最低价** | 18.30 |
| 37 | **成交金额（万元）** | 128447 |

**买卖五档详细映射：**

| 下标 | 含义 | 下标 | 含义 |
|------|------|------|------|
| 9 | 卖一价 | 10 | 卖一量 |
| 11 | 卖二价 | 12 | 卖二量 |
| 13 | 卖三价 | 14 | 卖三量 |
| 15 | 卖四价 | 16 | 卖四量 |
| 17 | 卖五价 | 18 | 卖五量 |
| 19 | 买一价 | 20 | 买一量 |
| 21 | 买二价 | 22 | 买二量 |
| 23 | 买三价 | 24 | 买三量 |
| 25 | 买四价 | 26 | 买四量 |
| 27 | 买五价 | 28 | 买五量 |

> 💡 更后面的字段还包含市盈率、市净率、总市值、流通市值等深度数据。

### 1.6 Python 示例

```python
import requests

url = "https://qt.gtimg.cn/q=sh600036,sz000001"
headers = {"Referer": "https://stockapp.finance.qq.com/"}
resp = requests.get(url, headers=headers)
resp.encoding = "gbk"

for line in resp.text.strip().split("\n"):
    if "=" not in line:
        continue
    code, data = line.split("=", 1)
    data = data.strip('";')
    fields = data.split("~")
    if not fields or fields[0] == "":
        continue
    name = fields[1]
    price = fields[3]
    change_pct = fields[32]
    print(f"{name}({fields[2]}): {price}元, 涨跌幅 {change_pct}%")
```

---

## 二、分时图数据

### 2.1 当日分时

```
GET http://data.gtimg.cn/flashdata/hushen/minute/sz000001.js
```

参数说明：
- `maxage` — 缓存时间（秒）
- 股票代码格式：交易所前缀 + 代码

### 2.2 五日分时

```
GET http://data.gtimg.cn/flashdata/hushen/4day/sz/sz000002.js?maxage=43200
```

---

## 三、K 线数据

### 3.1 日 K 线（最新）

```
GET http://data.gtimg.cn/flashdata/hushen/latest/daily/sz000002.js
```

### 3.2 指定年份日 K 线

```
GET http://data.gtimg.cn/flashdata/hushen/daily/17/sz000750.js
```

`17` 代表 2017 年。

### 3.3 周 K 线

```
GET http://data.gtimg.cn/flashdata/hushen/latest/weekly/sz000002.js
```

### 3.4 月 K 线

```
GET http://data.gtimg.cn/flashdata/hushen/monthly/sz000002.js
```

---

## 四、历史行情接口（AKShare 封装版本）

AKShare 库中的 `stock_zh_a_hist_tx` 接口也基于腾讯财经数据源：

```python
import akshare as ak

# 腾讯财经历史行情
df = ak.stock_zh_a_hist_tx(symbol="600036", period="daily", start_date="20250101", end_date="20250513")
```

---

## 五、实时成交量明细

```
GET http://stock.gtimg.cn/data/index.php?appn=detail&action=data&c=sz002451&p=2
```

| 参数 | 说明 |
|------|------|
| `c` | 股票代码（带交易所前缀） |
| `p` | 分页页码 |

---

## 六、大单数据

```
GET http://stock.finance.qq.com/sstock/list/view/dadan.php?t=js&c=sz002451&max=80&p=1&opt=10&o=0
```

**opt 参数说明：**

| opt 值 | 含义 |
|--------|------|
| 10 | 成交额 ≥ 100 万 |
| 11 | 成交额 ≥ 200 万 |
| 12 | 成交额 ≥ 500 万 |
| 13 | 成交额 ≥ 1000 万 |
| 1 | 成交量 ≥ 100 手 |
| 2 | 成交量 ≥ 200 手 |
| 3 | 成交量 ≥ 300 手 |
| 4 | 成交量 ≥ 400 手 |
| 5 | 成交量 ≥ 500 手 |
| 6 | 成交量 ≥ 800 手 |
| 7 | 成交量 ≥ 1000 手 |
| 8 | 成交量 ≥ 1500 手 |

---

## 七、指数数据

指数也用同一个实时接口，前缀规则：

| 指数 | 代码 | 接口示例 |
|------|------|----------|
| 上证指数 | `sh000001` | `https://qt.gtimg.cn/q=sh000001` |
| 深证成指 | `sz399001` | `https://qt.gtimg.cn/q=sz399001` |
| 创业板指 | `sz399006` | `https://qt.gtimg.cn/q=sz399006` |
| 沪深 300 | `sh000300` | `https://qt.gtimg.cn/q=sh000300` |
| 中证 500 | `sh000905` | `https://qt.gtimg.cn/q=sh000905` |

---

## 八、注意事项

1. **编码问题**：返回数据为 **GBK 编码**，请求时需要 `resp.encoding = "gbk"` 否则中文乱码
2. **Referer 头**：建议加上 `Referer: https://stockapp.finance.qq.com/` 防止被限
3. **限频**：批量请求建议加延迟（> 0.5s），避免 IP 被封
4. **非官方接口**：无 SLA 保证，随时可能下线或变更格式
5. **北交所**：部分历史接口不支持北交所（8/4 开头股票）

---

## 九、快速使用汇总

| 场景 | 接口 |
|------|------|
| 实时行情 | `https://qt.gtimg.cn/q=sh600036` |
| 批量行情 | `https://qt.gtimg.cn/q=sh600036,sz000001` |
| 当日分时 | `http://data.gtimg.cn/flashdata/hushen/minute/sz000001.js` |
| 五日分时 | `http://data.gtimg.cn/flashdata/hushen/4day/sz/sz000002.js` |
| 最新日 K | `http://data.gtimg.cn/flashdata/hushen/latest/daily/sz000002.js` |
| 历史日 K | `http://data.gtimg.cn/flashdata/hushen/daily/25/sz000002.js` |
| 周 K | `http://data.gtimg.cn/flashdata/hushen/latest/weekly/sz000002.js` |
| 月 K | `http://data.gtimg.cn/flashdata/hushen/monthly/sz000002.js` |
| 成交量明细 | `http://stock.gtimg.cn/data/index.php?appn=detail&action=data&c=sz002451&p=1` |
| 大单数据 | `http://stock.finance.qq.com/sstock/list/view/dadan.php?t=js&c=sz002451&opt=10` |
