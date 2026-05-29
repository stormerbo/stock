import test from 'node:test';
import assert from 'node:assert/strict';

import { computeDailyPnlFromTrades, deleteTrade, loadTradeHistory, mergeTradeHistory, sanitizeTradeHistory, TRADE_HISTORY_KEY, TRADE_HISTORY_MIGRATION_KEY, type StockTradeRecord } from '../src/shared/trade-history.ts';

function makeTrade(partial: Partial<StockTradeRecord> & Pick<StockTradeRecord, 'stockCode' | 'date' | 'type' | 'shares' | 'price'>): StockTradeRecord {
  return {
    id: partial.id ?? `${partial.type}-${partial.date}-${partial.shares}-${partial.price}`,
    stockCode: partial.stockCode,
    date: partial.date,
    type: partial.type,
    shares: partial.shares,
    price: partial.price,
    total: partial.total,
    fees: partial.fees,
    commission: partial.commission,
    stampTax: partial.stampTax,
    transferFee: partial.transferFee,
    note: partial.note,
    createdAt: partial.createdAt ?? `${partial.date}T09:30:00.000Z`,
  };
}

function createStorageStore(initial: Record<string, unknown> = {}) {
  const store: Record<string, unknown> = { ...initial };
  return {
    store,
    async get(keys?: string | string[] | null) {
      if (keys == null) return { ...store };
      if (Array.isArray(keys)) return Object.fromEntries(keys.map((key) => [key, store[key]]).filter(([, value]) => value !== undefined));
      return store[keys] === undefined ? {} : { [keys]: store[keys] };
    },
    async set(items: Record<string, unknown>) {
      Object.assign(store, items);
    },
    async remove(keys: string | string[]) {
      const list = Array.isArray(keys) ? keys : [keys];
      for (const key of list) delete store[key];
    },
    async clear() {
      for (const key of Object.keys(store)) delete store[key];
    },
  };
}

function installChromeMock(syncInitial: Record<string, unknown> = {}, localInitial: Record<string, unknown> = {}) {
  const originalChrome = (globalThis as typeof globalThis & { chrome?: unknown }).chrome;
  const sync = createStorageStore(syncInitial);
  const local = createStorageStore(localInitial);
  (globalThis as typeof globalThis & { chrome?: unknown }).chrome = {
    storage: {
      sync,
      local,
      onChanged: {
        addListener() {},
        removeListener() {},
      },
    },
  };
  return {
    sync,
    local,
    restore() {
      (globalThis as typeof globalThis & { chrome?: unknown }).chrome = originalChrome;
    },
  };
}

test('computeDailyPnlFromTrades uses opening market value for overnight positions', () => {
  const result = computeDailyPnlFromTrades([
    makeTrade({ stockCode: '600000', date: '2026-05-21', type: 'buy', shares: 100, price: 9 }),
  ], 12, 10, '2026-05-22');

  assert.equal(result.pnl, 200);
  assert.equal(result.baseAmount, 1000);
  assert.equal(result.changePct, 20);
});

test('computeDailyPnlFromTrades includes same-day round-trip realized pnl and fees', () => {
  const result = computeDailyPnlFromTrades([
    makeTrade({ stockCode: '600000', date: '2026-05-22', type: 'buy', shares: 100, price: 10, commission: 10, createdAt: '2026-05-22T09:31:00.000Z' }),
    makeTrade({ stockCode: '600000', date: '2026-05-22', type: 'sell', shares: 100, price: 11, commission: 11, createdAt: '2026-05-22T10:15:00.000Z' }),
  ], 11, 10, '2026-05-22');

  assert.equal(result.pnl, 79);
  assert.equal(result.baseAmount, 1010);
  assert.ok(Math.abs(result.changePct - 7.82) < 0.001);
});

test('computeDailyPnlFromTrades handles mixed overnight and same-day trades without switching formula', () => {
  const result = computeDailyPnlFromTrades([
    makeTrade({ stockCode: '600000', date: '2026-05-21', type: 'buy', shares: 100, price: 9 }),
    makeTrade({ stockCode: '600000', date: '2026-05-22', type: 'buy', shares: 50, price: 11, createdAt: '2026-05-22T09:35:00.000Z' }),
    makeTrade({ stockCode: '600000', date: '2026-05-22', type: 'sell', shares: 80, price: 12, commission: 8, createdAt: '2026-05-22T10:00:00.000Z' }),
  ], 12, 10, '2026-05-22');

  assert.equal(result.pnl, 242);
  assert.equal(result.baseAmount, 1550);
  assert.ok(Math.abs(result.changePct - 15.61) < 0.001);
});

test('sanitizeTradeHistory keeps legacy trade rows with string numbers and outer stock code', () => {
  const normalized = sanitizeTradeHistory({
    '600000': [
      {
        id: 't1',
        code: '600000',
        date: '2026-05-22',
        tradeType: 'buy',
        shares: '100',
        price: '10.5',
        commission: '1.2',
      },
    ],
  });

  assert.equal(normalized['600000'].length, 1);
  assert.equal(normalized['600000'][0].stockCode, '600000');
  assert.equal(normalized['600000'][0].type, 'buy');
  assert.equal(normalized['600000'][0].shares, 100);
  assert.equal(normalized['600000'][0].price, 10.5);
  assert.equal(normalized['600000'][0].commission, 1.2);
});

test('mergeTradeHistory keeps the richer source when sync is partial', () => {
  const merged = mergeTradeHistory(
    {
      '600000': [
        makeTrade({ stockCode: '600000', date: '2026-05-21', type: 'buy', shares: 100, price: 9 }),
        makeTrade({ stockCode: '600000', date: '2026-05-22', type: 'sell', shares: 20, price: 10 }),
      ],
    },
    {
      '600000': [
        makeTrade({ stockCode: '600000', date: '2026-05-21', type: 'buy', shares: 100, price: 9 }),
      ],
    },
  );

  assert.equal(merged['600000'].length, 2);
  assert.equal(merged['600000'][1].type, 'sell');
});

test('loadTradeHistory migrates local trade history into sync once', async () => {
  const mock = installChromeMock({}, {
    [TRADE_HISTORY_KEY]: {
      '600000': [
        makeTrade({ stockCode: '600000', date: '2026-05-21', type: 'buy', shares: 100, price: 9 }),
      ],
    },
  });

  try {
    const history = await loadTradeHistory();
    assert.equal(history['600000'].length, 1);
    assert.equal(mock.sync.store[TRADE_HISTORY_KEY] ? 1 : 0, 1);
    assert.equal((mock.sync.store[TRADE_HISTORY_KEY] as Record<string, StockTradeRecord[]> )['600000'].length, 1);
    assert.equal(mock.sync.store[TRADE_HISTORY_MIGRATION_KEY], true);
  } finally {
    mock.restore();
  }
});

test('loadTradeHistory trusts migrated sync data over stale local cache', async () => {
  const mock = installChromeMock({
    [TRADE_HISTORY_KEY]: {
      '600000': [
        makeTrade({ stockCode: '600000', date: '2026-05-21', type: 'buy', shares: 100, price: 9 }),
      ],
    },
    [TRADE_HISTORY_MIGRATION_KEY]: true,
  }, {
    [TRADE_HISTORY_KEY]: {
      '600000': [
        makeTrade({ stockCode: '600000', date: '2026-05-21', type: 'buy', shares: 100, price: 9 }),
        makeTrade({ stockCode: '600000', date: '2026-05-22', type: 'sell', shares: 20, price: 10 }),
      ],
    },
  });

  try {
    const history = await loadTradeHistory();
    assert.equal(history['600000'].length, 1);
    assert.equal(history['600000'][0].type, 'buy');
  } finally {
    mock.restore();
  }
});

test('deleteTrade removes the record from both sync and local stores', async () => {
  const tradeA = makeTrade({ stockCode: '600000', date: '2026-05-21', type: 'buy', shares: 100, price: 9 });
  const tradeB = makeTrade({ stockCode: '600000', date: '2026-05-22', type: 'sell', shares: 20, price: 10 });
  const mock = installChromeMock({
    [TRADE_HISTORY_KEY]: { '600000': [tradeA, tradeB] },
    [TRADE_HISTORY_MIGRATION_KEY]: true,
  }, {
    [TRADE_HISTORY_KEY]: { '600000': [tradeA, tradeB] },
  });

  try {
    await deleteTrade('600000', tradeB.id);
    const syncHistory = mock.sync.store[TRADE_HISTORY_KEY] as Record<string, StockTradeRecord[]>;
    const localHistory = mock.local.store[TRADE_HISTORY_KEY] as Record<string, StockTradeRecord[]>;
    assert.equal(syncHistory['600000'].length, 1);
    assert.equal(syncHistory['600000'][0].id, tradeA.id);
    assert.equal(localHistory['600000'].length, 1);
    assert.equal(localHistory['600000'][0].id, tradeA.id);
  } finally {
    mock.restore();
  }
});
