import type { StockQuote, StockBasic } from '@/types';
import { addMarketSuffix } from '@/utils/stock';

// 腾讯财经接口基础URL（使用HTTPS避免混合内容问题）
const TENCENT_API_URL = 'https://qt.gtimg.cn/q=';

// 内置股票列表（常见A股）用于搜索
// 实际使用时可以按需扩展或从其他来源获取
const COMMON_STOCKS: StockBasic[] = [
  // 上证50/沪深300 主要成分股示例
  { code: '600000.SH', name: '浦发银行', market: '主板' },
  { code: '600004.SH', name: '白云机场', market: '主板' },
  { code: '600009.SH', name: '上海机场', market: '主板' },
  { code: '600016.SH', name: '民生银行', market: '主板' },
  { code: '600028.SH', name: '中国石化', market: '主板' },
  { code: '600030.SH', name: '中信证券', market: '主板' },
  { code: '600031.SH', name: '三一重工', market: '主板' },
  { code: '600036.SH', name: '招商银行', market: '主板' },
  { code: '600048.SH', name: '保利发展', market: '主板' },
  { code: '600050.SH', name: '中国联通', market: '主板' },
  { code: '600104.SH', name: '上汽集团', market: '主板' },
  { code: '600111.SH', name: '北方稀土', market: '主板' },
  { code: '600196.SH', name: '复星医药', market: '主板' },
  { code: '600276.SH', name: '恒瑞医药', market: '主板' },
  { code: '600309.SH', name: '万华化学', market: '主板' },
  { code: '600340.SH', name: '华夏幸福', market: '主板' },
  { code: '600415.SH', name: '小商品城', market: '主板' },
  { code: '600436.SH', name: '片仔癀', market: '主板' },
  { code: '600438.SH', name: '通威股份', market: '主板' },
  { code: '600519.SH', name: '贵州茅台', market: '主板' },
  { code: '600585.SH', name: '海螺水泥', market: '主板' },
  { code: '600690.SH', name: '海尔智家', market: '主板' },
  { code: '600703.SH', name: '三安光电', market: '主板' },
  { code: '600745.SH', name: '闻泰科技', market: '主板' },
  { code: '600809.SH', name: '山西汾酒', market: '主板' },
  { code: '600837.SH', name: '海通证券', market: '主板' },
  { code: '600887.SH', name: '伊利股份', market: '主板' },
  { code: '600900.SH', name: '长江电力', market: '主板' },
  { code: '601012.SH', name: '隆基绿能', market: '主板' },
  { code: '601066.SH', name: '中信建投', market: '主板' },
  { code: '601088.SH', name: '中国神华', market: '主板' },
  { code: '601111.SH', name: '中国国航', market: '主板' },
  { code: '601138.SH', name: '工业富联', market: '主板' },
  { code: '601166.SH', name: '兴业银行', market: '主板' },
  { code: '601186.SH', name: '中国铁建', market: '主板' },
  { code: '601288.SH', name: '农业银行', market: '主板' },
  { code: '601318.SH', name: '中国平安', market: '主板' },
  { code: '601319.SH', name: '中国人保', market: '主板' },
  { code: '601390.SH', name: '中国中铁', market: '主板' },
  { code: '601398.SH', name: '工商银行', market: '主板' },
  { code: '601601.SH', name: '中国太保', market: '主板' },
  { code: '601628.SH', name: '中国人寿', market: '主板' },
  { code: '601633.SH', name: '长城汽车', market: '主板' },
  { code: '601668.SH', name: '中国建筑', market: '主板' },
  { code: '601688.SH', name: '华泰证券', market: '主板' },
  { code: '601857.SH', name: '中国石油', market: '主板' },
  { code: '601888.SH', name: '中国中免', market: '主板' },
  { code: '601899.SH', name: '紫金矿业', market: '主板' },
  { code: '601919.SH', name: '中远海控', market: '主板' },
  { code: '601988.SH', name: '中国银行', market: '主板' },
  { code: '601995.SH', name: '中金公司', market: '主板' },
  { code: '603259.SH', name: '药明康德', market: '主板' },
  { code: '603288.SH', name: '海天味业', market: '主板' },
  { code: '603392.SH', name: '万泰生物', market: '主板' },
  { code: '603501.SH', name: '韦尔股份', market: '主板' },
  { code: '603658.SH', name: '安图生物', market: '主板' },
  { code: '603986.SH', name: '兆易创新', market: '主板' },
  { code: '688981.SH', name: '中芯国际', market: '科创板' },
  { code: '688012.SH', name: '中微公司', market: '科创板' },
  { code: '688036.SH', name: '传音控股', market: '科创板' },
  { code: '688111.SH', name: '金山办公', market: '科创板' },
  { code: '688599.SH', name: '天合光能', market: '科创板' },
  // 深证主要股票
  { code: '000001.SZ', name: '平安银行', market: '主板' },
  { code: '000002.SZ', name: '万科A', market: '主板' },
  { code: '000063.SZ', name: '中兴通讯', market: '主板' },
  { code: '000100.SZ', name: 'TCL科技', market: '主板' },
  { code: '000333.SZ', name: '美的集团', market: '主板' },
  { code: '000538.SZ', name: '云南白药', market: '主板' },
  { code: '000568.SZ', name: '泸州老窖', market: '主板' },
  { code: '000596.SZ', name: '古井贡酒', market: '主板' },
  { code: '000651.SZ', name: '格力电器', market: '主板' },
  { code: '000725.SZ', name: '京东方A', market: '主板' },
  { code: '000768.SZ', name: '中航西飞', market: '主板' },
  { code: '000776.SZ', name: '广发证券', market: '主板' },
  { code: '000792.SZ', name: '盐湖股份', market: '主板' },
  { code: '000858.SZ', name: '五粮液', market: '主板' },
  { code: '000895.SZ', name: '双汇发展', market: '主板' },
  { code: '000938.SZ', name: '中信建投', market: '主板' },
  { code: '001979.SZ', name: '招商蛇口', market: '主板' },
  { code: '002001.SZ', name: '新和成', market: '中小板' },
  { code: '002007.SZ', name: '华兰生物', market: '中小板' },
  { code: '002024.SZ', name: '苏宁易购', market: '中小板' },
  { code: '002027.SZ', name: '分众传媒', market: '中小板' },
  { code: '002049.SZ', name: '紫光国微', market: '中小板' },
  { code: '002120.SZ', name: '韵达股份', market: '中小板' },
  { code: '002142.SZ', name: '宁波银行', market: '中小板' },
  { code: '002230.SZ', name: '科大讯飞', market: '中小板' },
  { code: '002236.SZ', name: '大华股份', market: '中小板' },
  { code: '002271.SZ', name: '东方雨虹', market: '中小板' },
  { code: '002304.SZ', name: '洋河股份', market: '中小板' },
  { code: '002352.SZ', name: '顺丰控股', market: '中小板' },
  { code: '002371.SZ', name: '北方华创', market: '中小板' },
  { code: '002410.SZ', name: '广联达', market: '中小板' },
  { code: '002415.SZ', name: '海康威视', market: '中小板' },
  { code: '002460.SZ', name: '赣锋锂业', market: '中小板' },
  { code: '002475.SZ', name: '立讯精密', market: '中小板' },
  { code: '002493.SZ', name: '荣盛石化', market: '中小板' },
  { code: '002594.SZ', name: '比亚迪', market: '中小板' },
  { code: '002714.SZ', name: '牧原股份', market: '中小板' },
  { code: '002812.SZ', name: '恩捷股份', market: '中小板' },
  { code: '300003.SZ', name: '乐普医疗', market: '创业板' },
  { code: '300014.SZ', name: '亿纬锂能', market: '创业板' },
  { code: '300015.SZ', name: '爱尔眼科', market: '创业板' },
  { code: '300033.SZ', name: '同花顺', market: '创业板' },
  { code: '300059.SZ', name: '东方财富', market: '创业板' },
  { code: '300122.SZ', name: '智飞生物', market: '创业板' },
  { code: '300124.SZ', name: '汇川技术', market: '创业板' },
  { code: '300142.SZ', name: '沃森生物', market: '创业板' },
  { code: '300274.SZ', name: '阳光电源', market: '创业板' },
  { code: '300408.SZ', name: '三环集团', market: '创业板' },
  { code: '300413.SZ', name: '芒果超媒', market: '创业板' },
  { code: '300433.SZ', name: '蓝思科技', market: '创业板' },
  { code: '300498.SZ', name: '温氏股份', market: '创业板' },
  { code: '300750.SZ', name: '宁德时代', market: '创业板' },
  { code: '300760.SZ', name: '迈瑞医疗', market: '创业板' },
];

// 缓存股票列表
let stockListCache: StockBasic[] | null = null;
let cacheTime = 0;
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24小时缓存

// 将代码转换为腾讯格式
function toTencentCode(code: string): string {
  // 代码格式: 600000.SH -> sh600000
  if (code.includes('.SH')) {
    return 'sh' + code.replace('.SH', '');
  } else if (code.includes('.SZ')) {
    return 'sz' + code.replace('.SZ', '');
  } else if (code.includes('.BJ')) {
    return 'bj' + code.replace('.BJ', '');
  }
  return code;
}

// 将腾讯格式转回标准格式
function fromTencentCode(tencentCode: string): string {
  const prefix = tencentCode.substring(0, 2).toLowerCase();
  const code = tencentCode.substring(2);
  switch (prefix) {
    case 'sh': return `${code}.SH`;
    case 'sz': return `${code}.SZ`;
    case 'bj': return `${code}.BJ`;
    default: return tencentCode;
  }
}

// 解析腾讯行情数据
function parseQuoteData(data: string): StockQuote[] {
  const quotes: StockQuote[] = [];
  
  // 腾讯返回格式: v_sh600000="1~浦发银行~600000~...";
  const lines = data.split(';');
  
  for (const line of lines) {
    const match = line.match(/v_[a-z]+(\d+)="([^"]+)"/);
    if (!match) continue;
    
    const tencentCode = line.match(/v_([a-z]+\d+)/)?.[1] || '';
    const fields = match[2].split('~');
    
    if (fields.length < 10) continue;
    
    const code = fromTencentCode(tencentCode);
    const name = fields[1];
    const close = parseFloat(fields[3]) || 0;
    const preClose = parseFloat(fields[4]) || 0;
    const open = parseFloat(fields[5]) || 0;
    const high = parseFloat(fields[6]) || 0;
    const low = parseFloat(fields[7]) || 0;
    const change = parseFloat(fields[8]) || 0;
    const pctChange = parseFloat(fields[9]) || 0;
    const volume = parseFloat(fields[10]) || 0;
    const amount = parseFloat(fields[11]) || 0;
    
    quotes.push({
      code,
      name,
      open,
      high,
      low,
      close,
      preClose,
      change,
      pctChange,
      volume,
      amount,
    });
  }
  
  return quotes;
}

// 获取实时行情
export async function getRealtimeQuote(codes: string[]): Promise<StockQuote[]> {
  if (!codes.length) return [];

  const tencentCodes = codes.map(toTencentCode).join(',');
  
  try {
    // 使用 cors-anywhere 或类似服务处理跨域，或者通过 background script
    // 这里使用直接请求（Chrome扩展可以配置权限）
    const response = await fetch(`${TENCENT_API_URL}${tencentCodes}`, {
      method: 'GET',
      headers: {
        'Referer': 'https://stock.qq.com',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }

    const text = await response.text();
    return parseQuoteData(text);
  } catch (error) {
    console.error('获取腾讯行情失败:', error);
    throw error;
  }
}

// 获取股票基础信息
export async function getStockBasic(codes: string[]): Promise<StockBasic[]> {
  if (!codes.length) return [];

  // 从内置列表查找
  return codes.map(code => {
    const stock = COMMON_STOCKS.find(s => s.code === code);
    return stock || { code, name: code, market: '未知' };
  });
}

// 获取所有股票列表
async function getAllStocks(): Promise<StockBasic[]> {
  const now = Date.now();
  
  // 使用缓存
  if (stockListCache && (now - cacheTime) < CACHE_DURATION) {
    return stockListCache;
  }

  // 使用内置列表
  stockListCache = [...COMMON_STOCKS];
  cacheTime = now;
  
  return stockListCache;
}

// 搜索股票
export async function searchStocks(keyword: string): Promise<StockBasic[]> {
  if (keyword.length < 2) return [];

  const allStocks = await getAllStocks();
  const lowerKeyword = keyword.toLowerCase();

  return allStocks
    .filter((item) => {
      const code = item.code.toLowerCase();
      const name = item.name.toLowerCase();
      return code.includes(lowerKeyword) || name.includes(lowerKeyword);
    })
    .slice(0, 20);
}

// 清除缓存
export function clearStockCache() {
  stockListCache = null;
  cacheTime = 0;
}

// 获取单个股票名称（用于批量导入时验证）
export async function getStockName(code: string): Promise<string | null> {
  const stock = COMMON_STOCKS.find(s => s.code === code || s.code.includes(code));
  return stock?.name || null;
}

// 兼容性函数（保持与Tushare接口一致）
export function setApiToken(_token: string) {
  // 腾讯财经不需要Token，此函数用于兼容
}

export function getApiToken(): string | null {
  return 'not_required';
}

export async function validateToken(): Promise<{ valid: boolean; error?: string }> {
  // 腾讯财经不需要验证Token
  return { valid: true };
}
