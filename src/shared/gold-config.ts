export type GoldMarket = 'domestic' | 'international';
export type GoldChartPeriod = 'minute' | 'day' | 'week' | 'month';
export type GoldInstrumentId =
  | 'cn_spot_gold'
  | 'sh_gold'
  | 'gold_td'
  | 'intl_spot_gold'
  | 'comex_gold'
  | 'london_gold'
  | 'ny_gold_tn12';

export type GoldInstrumentConfig = {
  id: GoldInstrumentId;
  code: string;
  secid: string;
  label: string;
  market: GoldMarket;
  unit: string;
  supportedPeriods: GoldChartPeriod[];
};

export const GOLD_INSTRUMENTS: GoldInstrumentConfig[] = [
  {
    id: 'cn_spot_gold',
    code: 'AU9999',
    secid: '118.AU9999',
    label: '国内现货金',
    market: 'domestic',
    unit: '元/克',
    supportedPeriods: ['minute', 'day', 'week', 'month'],
  },
  {
    id: 'sh_gold',
    code: 'SHAU',
    secid: '118.SHAU',
    label: '上海金',
    market: 'domestic',
    unit: '元/克',
    supportedPeriods: ['minute', 'day', 'week', 'month'],
  },
  {
    id: 'gold_td',
    code: 'AUTD',
    secid: '118.AUTD',
    label: '黄金 T+D',
    market: 'domestic',
    unit: '元/克',
    supportedPeriods: ['minute', 'day', 'week', 'month'],
  },
  {
    id: 'intl_spot_gold',
    code: 'XAU',
    secid: '122.XAU',
    label: '国际现货金',
    market: 'international',
    unit: '美元/盎司',
    supportedPeriods: ['minute', 'day', 'week', 'month'],
  },
  {
    id: 'comex_gold',
    code: 'GC00Y',
    secid: '101.GC00Y',
    label: 'COMEX 黄金',
    market: 'international',
    unit: '美元/盎司',
    supportedPeriods: ['minute', 'day', 'week', 'month'],
  },
  {
    id: 'london_gold',
    code: 'HLAU',
    secid: '123.HLAU',
    label: '港伦敦金',
    market: 'international',
    unit: '美元/盎司',
    supportedPeriods: ['minute', 'day', 'week', 'month'],
  },
  {
    id: 'ny_gold_tn12',
    code: 'NYAuTN12',
    secid: '118.NYAuTN12',
    label: '纽约金 TN12',
    market: 'domestic',
    unit: '元/克',
    supportedPeriods: ['minute', 'day', 'week', 'month'],
  },
];

export function getGoldInstrumentById(id: GoldInstrumentId): GoldInstrumentConfig | undefined {
  return GOLD_INSTRUMENTS.find((item) => item.id === id);
}

export function getGoldInstrumentByCode(code: string): GoldInstrumentConfig | undefined {
  return GOLD_INSTRUMENTS.find((item) => item.code === code || item.id === code);
}

export function getGoldInstrumentBySecid(secid: string): GoldInstrumentConfig | undefined {
  return GOLD_INSTRUMENTS.find((item) => item.secid === secid);
}

export function getGoldInstrumentsByMarket(market: GoldMarket): GoldInstrumentConfig[] {
  return GOLD_INSTRUMENTS.filter((item) => item.market === market);
}
