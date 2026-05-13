// Search suggestion fetchers for stocks and funds
import type { SearchStock, FundSearchEntry } from '../types';

let fundSearchIndexPromise: Promise<FundSearchEntry[]> | null = null;

export async function fetchTencentStockSuggestions(keyword: string): Promise<SearchStock[]> {
  const q = keyword.trim();
  if (!q) return [];

  const response = await fetch(`https://smartbox.gtimg.cn/s3/?t=all&c=1&q=${encodeURIComponent(q)}`);
  const text = await response.text();
  const matched = text.match(/v_hint="([\s\S]*?)";?/);
  if (!matched || matched[1] === 'N') return [];

  const decoded = matched[1].replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) => (
    String.fromCharCode(parseInt(hex, 16))
  ));

  const dedup = new Set<string>();
  const suggestions: SearchStock[] = [];

  decoded.split('^').forEach((segment) => {
    const parts = segment.split('~');
    if (parts.length < 5) return;

    const market = parts[0];
    const code = parts[1];
    const name = parts[2];
    const productType = parts[4] ?? '';

    if (!(market === 'sh' || market === 'sz')) return;
    if (!/^\d{6}$/.test(code)) return;
    if (!productType.includes('GP')) return;
    if (dedup.has(code)) return;

    dedup.add(code);
    suggestions.push({ code, name });
  });

  return suggestions.slice(0, 16);
}

export async function fetchFundSuggestions(keyword: string): Promise<SearchStock[]> {
  const q = keyword.trim();
  if (!q) return [];

  try {
    if (!fundSearchIndexPromise) {
      fundSearchIndexPromise = fetch('https://fund.eastmoney.com/js/fundcode_search.js')
        .then((r) => r.text())
        .then((text) => {
          const matched = text.match(/var\s+r\s*=\s*(\[[\s\S]*\]);?/);
          if (!matched) return [];

          const parsed = JSON.parse(matched[1]) as Array<[string, string, string, string, string]>;
          return parsed
            .map((item) => {
              const code = String(item[0] ?? '').trim();
              const jp = String(item[1] ?? '').trim();
              const name = String(item[2] ?? '').trim();
              const category = String(item[3] ?? '').trim();
              const fullNamePinyin = String(item[4] ?? '').trim();
              if (!/^\d{6}$/.test(code) || !name) return null;

              return {
                code,
                name,
                jp,
                category,
                fullNamePinyin,
                haystack: [code, name, jp, category, fullNamePinyin].join('|').toLowerCase(),
              };
            })
            .filter((item): item is FundSearchEntry => item !== null);
        })
        .catch(() => {
          fundSearchIndexPromise = null;
          return [];
        });
    }

    const entries = await fundSearchIndexPromise;
    if (!entries) return [];
    const query = q.toLowerCase();
    return entries
      .filter((item) => item.haystack.includes(query))
      .slice(0, 16)
      .map(({ code, name }) => ({ code, name }));
  } catch {
    return [];
  }
}
