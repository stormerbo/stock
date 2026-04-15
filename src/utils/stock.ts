import { MARKET_SUFFIXES, MARKET_TAGS } from './constants';

/**
 * 股票代码相关工具
 */

// 添加市场后缀
export function addMarketSuffix(code: string): string {
  const pureCode = code.replace(/\.(SZ|SH|BJ)$/i, '');
  const firstChar = pureCode.charAt(0);

  if (MARKET_SUFFIXES.SH.includes(firstChar)) return `${pureCode}.SH`;
  if (MARKET_SUFFIXES.SZ.includes(firstChar)) return `${pureCode}.SZ`;
  if (MARKET_SUFFIXES.BJ.includes(firstChar)) return `${pureCode}.BJ`;

  return pureCode;
}

// 移除市场后缀
export function removeMarketSuffix(code: string): string {
  return code.replace(/\.(SZ|SH|BJ)$/i, '');
}

// 获取市场标签
export function getMarketTag(code: string): string | null {
  const pureCode = removeMarketSuffix(code);
  const firstChar = pureCode.charAt(0);
  return MARKET_TAGS[firstChar] || null;
}

// 验证股票代码格式
export function isValidStockCode(code: string): boolean {
  if (!code) return false;
  const pureCode = removeMarketSuffix(code);
  return /^\d{6}$/.test(pureCode);
}

// 解析批量输入
export function parseBatchInput(text: string): Array<{
  code: string;
  costPrice: number;
  shares: number;
}> {
  const lines = text.trim().split('\n');
  const results = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // 尝试逗号分隔
    let parts = trimmed.split(',').map((s) => s.trim());
    if (parts.length !== 3) {
      // 尝试空格分隔
      parts = trimmed.split(/\s+/).map((s) => s.trim());
    }

    const code = removeMarketSuffix(parts[0]);
    if (!isValidStockCode(code)) continue;

    if (parts.length >= 3) {
      // 完整格式：代码,成本价,持仓数
      const costPrice = parseFloat(parts[1]);
      const shares = parseInt(parts[2]);

      if (!isNaN(costPrice) && !isNaN(shares)) {
        results.push({ code, costPrice, shares });
      }
    } else if (parts.length === 2) {
      // 格式：代码,成本价（持仓数为0）
      const costPrice = parseFloat(parts[1]);
      if (!isNaN(costPrice)) {
        results.push({ code, costPrice, shares: 0 });
      }
    } else {
      // 只有代码：代码（成本价和持仓数都为0）
      results.push({ code, costPrice: 0, shares: 0 });
    }
  }

  return results;
}

// 生成东方财富风格迷你分时图 SVG
export function generateMiniChart(
  priceData: number[],
  width = 70,
  height = 32,
  openPrice?: number, // 开盘价/昨日收盘价（用于画虚线）
  avgPrice?: number   // 均价（用于画趋势线）
): string {
  if (!priceData || priceData.length < 2) {
    return `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"></svg>`;
  }

  // 计算显示范围（基于价格波动）
  const min = Math.min(...priceData);
  const max = Math.max(...priceData);
  const range = max - min || 1;

  // 价格转Y坐标函数
  const priceToY = (price: number) => {
    return height - ((price - min) / range) * (height - 4) - 2;
  };

  // 价格折线点
  const points = priceData.map((price, index) => {
    const x = (index / (priceData.length - 1)) * width;
    const y = priceToY(price);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  // 涨跌颜色（红涨绿跌，东方财富风格）
  const isUp = priceData[priceData.length - 1] >= (openPrice ?? priceData[0]);
  const priceColor = isUp ? '#e74c3c' : '#27ae60';
  const avgColor = '#f39c12'; // 均价线颜色（橙色）

  // 开盘价虚线（如果提供）
  let openLine = '';
  if (openPrice !== undefined && openPrice >= min && openPrice <= max) {
    const y = priceToY(openPrice);
    openLine = `<line x1="0" y1="${y.toFixed(1)}" x2="${width}" y2="${y.toFixed(1)}" stroke="#bdc3c7" stroke-width="1" stroke-dasharray="3,2"/>`;
  }

  // 均价线（如果提供，或计算简单移动平均）
  let avgLine = '';
  const avgData = avgPrice !== undefined
    ? Array(priceData.length).fill(avgPrice)
    : calculateSMA(priceData, 5); // 默认使用5点简单移动平均

  if (avgData && avgData.length === priceData.length) {
    const avgPoints = avgData.map((price, index) => {
      const x = (index / (priceData.length - 1)) * width;
      // 确保均价在显示范围内，否则clamp
      const clampedPrice = Math.max(min, Math.min(max, price));
      const y = priceToY(clampedPrice);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    avgLine = `<polyline points="${avgPoints.join(' ')}" fill="none" stroke="${avgColor}" stroke-width="1"/>`;
  }

  return `
    <svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
      ${openLine}
      ${avgLine}
      <polyline points="${points.join(' ')}" fill="none" stroke="${priceColor}" stroke-width="1.2"/>
    </svg>
  `;
}

// 计算简单移动平均
function calculateSMA(data: number[], period: number): number[] {
  if (data.length < period) return data;
  const result: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(data[i]);
    } else {
      let sum = 0;
      for (let j = 0; j < period; j++) {
        sum += data[i - j];
      }
      result.push(sum / period);
    }
  }
  return result;
}
