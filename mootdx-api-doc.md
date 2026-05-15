# mootdx 接口文档

> 通达信数据读取的一个简便使用封装
>
> GitHub: https://github.com/mootdx/mootdx
> 在线文档: https://www.mootdx.com/
> 国内镜像: https://gitee.com/ibopo/mootdx
>
> **注意：本项目仅供学习交流，不得用于任何商业目的。**

---

## 安装

```bash
# 核心功能
pip install 'mootdx'

# 含命令行工具
pip install 'mootdx[cli]'

# 完整功能（推荐）
pip install 'mootdx[all]'
```

---

## 模块总览

mootdx 提供三大核心模块 + 辅助工具：

| 模块 | 用途 | 入口类 |
|------|------|--------|
| **线上行情** (quotes) | 连接通达信服务器获取实时/历史行情 | `Quotes.factory()` |
| **离线数据** (reader) | 读取本地通达信 vipdoc 目录下的数据文件 | `Reader.factory()` |
| **财务数据** (affair) | 下载和解析通达信财务数据 zip 包 | `Affair` |
| **服务器测试** (server) | 测试并选择最快的通达信服务器 | `bestip()` |

---

## 一、线上行情接口 — `mootdx.quotes.Quotes`

### 1.1 初始化

```python
from mootdx.quotes import Quotes

# 标准市场（沪深A股）
client = Quotes.factory(market='std', multithread=True, heartbeat=True)

# 扩展市场（期货、黄金等）
# client = Quotes.factory(market='ext')
```

**factory 参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `market` | str | `'std'` 标准市场 / `'ext'` 扩展市场 |
| `multithread` | bool | 是否启用多线程 |
| `heartbeat` | bool | 是否启用心跳保活 |
| `bestip` | bool | 是否自动选择最快服务器 |
| `timeout` | int | 连接超时时间（秒），默认 15 |
| `server` | tuple | 手动指定服务器 `(ip, port)` |

### 1.2 StdQuotes（标准市场）接口

#### 📊 bars — K 线数据

```python
client.bars(symbol='600036', frequency=9, start=0, offset=800)
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `symbol` | str | 股票代码 |
| `frequency` | int | K 线周期（见下表） |
| `start` | int | 起始位置，默认 0 |
| `offset` | int | 获取数量，最大 800 |

**frequency 取值：**

| 值 | K 线类型 | 值 | K 线类型 |
|----|---------|----|---------|
| 0 | 5 分钟 | 5 | 周 K |
| 1 | 15 分钟 | 6 | 月 K |
| 2 | 30 分钟 | 7 | 1 分钟（扩展） |
| 3 | 1 小时 | 8 | 1 分钟 |
| 4 | 日 K | 9 | 日 K（推荐） |
| 10 | 季 K | 11 | 年 K |

#### 📈 index — 指数 K 线

```python
client.index(symbol='000001', frequency=9, start=0, offset=800)
client.index(symbol='000001', frequency=9)  # 上证指数日线
```

参数同 `bars`，自动识别上海/深圳市场。

#### ⏱ minute — 当日分时数据

```python
client.minute(symbol='600036')
```

返回当日分钟级行情。

#### 📅 minutes — 历史分时数据

```python
client.minutes(symbol='000036', date='20250109')
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `symbol` | str | 股票代码 |
| `date` | str | 查询日期，格式 `YYYYMMDD` |

#### 💹 quotes — 实时五档行情

```python
client.quotes(symbol='600036')
client.quotes(symbol=['600036', '000001'])  # 批量查询
```

返回实时买卖盘五档数据、当前价格、成交量等。

#### 📋 stocks — 股票列表

```python
client.stocks(market=0)  # 深圳市场全部股票
client.stocks(market=1)  # 上海市场全部股票
client.stock_all()       # 沪深全部
```

#### 🔢 stock_count — 市场股票数量

```python
client.stock_count(market=0)  # 深圳市场股票数
client.stock_count(market=1)  # 上海市场股票数
```

#### 📝 transaction — 当日分笔成交

```python
client.transaction(symbol='600036', start=0, offset=800)
```

#### 📜 transactions — 历史分笔成交

```python
client.transactions(symbol='600036', date='20250109', start=0, offset=800)
```

#### 🏢 F10C — 公司资料目录

```python
client.F10C(symbol='600036')
```

返回公司 F10 资料的分类目录。

#### 📄 F10 — 公司资料详情

```python
client.F10(symbol='600036', name='最新提示')  # 指定栏目
client.F10(symbol='600036')                     # 全部栏目
```

#### 🔄 xdxr — 除权除息

```python
client.xdxr(symbol='600036')
```

返回送股、配股、分红等除权除息信息。

#### 💰 finance — 财务信息

```python
client.finance(symbol='600036')
```

返回主要财务指标。

#### 📐 k / ohlc — 按日期范围获取 K 线

```python
client.k(symbol='600036', begin='2025-01-01', end='2025-03-01')
client.ohlc(symbol='600036', begin='2025-01-01', end='2025-03-01')  # 别名
```

#### 📦 block — 板块信息

```python
client.block(tofile='block.dat')
```

获取证券板块分类信息。

#### 📊 traffic — 流量统计

```python
client.traffic()
```

获取连接流量统计信息。

---

### 1.3 ExtQuotes（扩展市场）接口

> ⚠️ 扩展市场行情接口目前可能已失效。

```python
from mootdx.quotes import Quotes
client = Quotes.factory(market='ext')
```

| 方法 | 说明 | 参数 |
|------|------|------|
| `markets()` | 获取扩展市场列表 | — |
| `instruments()` | 获取全部合约列表 | — |
| `instrument(start, offset)` | 分页查询合约 | `start`, `offset` |
| `instrument_count()` | 合约总数 | — |
| `quote(market, symbol)` | 五档行情 | `market`, `symbol` |
| `bars(frequency, market, symbol, start, offset)` | K 线 | `frequency`, `market`, `symbol` |
| `minute(market, symbol)` | 分时 | `market`, `symbol` |
| `minutes(market, symbol, date)` | 历史分时 | `market`, `symbol`, `date` |
| `transaction(market, symbol, start, offset)` | 分笔成交 | `market`, `symbol` |
| `transactions(market, symbol, date, start, offset)` | 历史分笔 | `market`, `symbol`, `date` |

---

## 二、离线数据接口 — `mootdx.reader.Reader`

用于读取本地通达信 `vipdoc` 目录下的数据文件。

### 2.1 初始化

```python
from mootdx.reader import Reader

# market: 'std' 标准市场 / 'ext' 扩展市场
# tdxdir: 通达信安装目录
reader = Reader.factory(market='std', tdxdir='C:/new_tdx')
```

### 2.2 StdReader 接口

| 方法 | 说明 | 示例 |
|------|------|------|
| `daily(symbol)` | 日线数据 | `reader.daily(symbol='600036')` |
| `minute(symbol, suffix=1)` | 1/5 分钟线 | `reader.minute(symbol='600036')` |
| `fzline(symbol)` | 5 分钟线 | `reader.fzline(symbol='600036')` |
| `block(symbol, group=False)` | 板块数据 | `reader.block(symbol='block_zs.dat')` |
| `block_new(name, symbol)` | 自定义板块操作 | 见下方 |

**自定义板块管理：**

```python
# 创建自定义板块
reader.block_new(name='我的自选', symbol=['600036', '000001', '000002'])

# 查询自定义板块
reader.block_new(name='我的自选')
```

### 2.3 ExtReader 接口

| 方法 | 说明 |
|------|------|
| `daily(symbol)` | 扩展市场日线 |
| `minute(symbol)` | 扩展市场分钟线 |
| `fzline(symbol)` | 扩展市场 5 分钟线 |

---

## 三、财务数据接口 — `mootdx.affair.Affair`

### 3.1 files — 获取财务文件列表

```python
from mootdx.affair import Affair

files = Affair.files()
# 返回所有可下载的财务数据文件列表（含文件名、哈希值等）
```

### 3.2 fetch — 下载财务数据

```python
# 下载单个文件
Affair.fetch(downdir='tmp', filename='gpcw19960630.zip')

# 下载全部财务数据
Affair.fetch(downdir='tmp')
```

### 3.3 parse — 解析财务文件

```python
# 解析单个财务文件
Affair.parse(downdir='tmp', filename='gpcw19960630.zip')
```

---

## 四、服务器测试 — `mootdx.server`

### 4.1 命令行方式

```bash
python -m mootdx bestip -vv
```

### 4.2 代码方式

```python
from mootdx.server import bestip

# 测试并保存最优服务器到配置
bestip(console=True, limit=5, sync=False)
```

---

## 五、快速示例

### 5.1 获取日线数据

```python
from mootdx.quotes import Quotes

client = Quotes.factory(market='std')

# 获取招商银行的 200 条日 K 线数据
df = client.bars(symbol='600036', frequency=9, offset=200)
print(df.tail())
```

### 5.2 计算均线

```python
from mootdx.quotes import Quotes
import pandas as pd

client = Quotes.factory(market='std')

df = client.bars(symbol='600036', frequency=9, offset=100)
df['MA5']  = df['close'].rolling(window=5).mean()
df['MA20'] = df['close'].rolling(window=20).mean()
print(df[['close', 'MA5', 'MA20']].tail(10))
```

### 5.3 批量获取多只股票

```python
symbols = ['600036', '000001', '000002']
all_data = {}
for symbol in symbols:
    df = client.bars(symbol=symbol, frequency=9, offset=1000)
    all_data[symbol] = df
```

### 5.4 读取本地数据

```python
from mootdx.reader import Reader

reader = Reader.factory(market='std', tdxdir='C:/new_tdx')

daily = reader.daily(symbol='600036')
minute = reader.minute(symbol='600036')
```

---

## 六、常见问题

### M1 Mac 兼容问题

M1 Mac 系统上 `PyMiniRacer` 可能无法使用，参考：
https://github.com/sqreen/PyMiniRacer/issues/143

### 服务器连接失败

```bash
python -m mootdx bestip --test
```

或代码中设置 `bestip=True` 自动选择最快服务器。

### 升级

```bash
pip install -U tdxpy mootdx
```
