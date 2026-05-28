import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildAssessmentReportSnapshot,
  buildStockAssessment,
  sortStockAssessments,
  type StockAssessment,
} from '../src/shared/stock-assessment.ts';
import { sanitizeStockAssessmentCache } from '../src/shared/stock-assessment-cache.ts';
import type { StockHoldingConfig } from '../src/shared/fetch.ts';
import type { KlinePoint } from '../src/shared/technical-analysis.ts';

function buildKline(
  closes: number[],
  volumes: number[],
  wiggle = 1.1,
): KlinePoint[] {
  return closes.map((close, index) => {
    const prev = index > 0 ? closes[index - 1] : close - 0.3;
    const open = index === 0 ? close - 0.1 : prev;
    return {
      date: `2026-05-${String(index + 1).padStart(2, '0')}`,
      open,
      close,
      high: Math.max(open, close) + wiggle,
      low: Math.min(open, close) - wiggle,
      volume: volumes[index],
    };
  });
}

test('buildStockAssessment gives held stocks full action suggestions but watchlist names observation-oriented actions', () => {
  const heldHolding: StockHoldingConfig = { code: '600001', name: '持仓股', shares: 200, cost: 102 };
  const watchHolding: StockHoldingConfig = { code: '600002', name: '观察股', shares: 0, cost: 0 };
  const strongCloses = [
    100, 100.5, 101.1, 101.8, 102.4,
    103, 103.7, 104.4, 105.1, 105.9,
    106.8, 107.7, 108.8, 110, 111.3,
    112.7, 114.1, 115.6, 117.2, 118.8,
    120.1, 121.2, 122.4, 123.7, 125,
    126.1, 127.3, 128.4, 129.5, 130.4,
  ];
  const strongVolumes = [
    100, 101, 103, 105, 108,
    111, 115, 119, 124, 130,
    137, 145, 154, 164, 175,
    187, 199, 212, 226, 239,
    248, 257, 266, 274, 283,
    292, 300, 308, 317, 325,
  ];

  const held = buildStockAssessment({
    holding: heldHolding,
    currentPrice: strongCloses[strongCloses.length - 1],
    kline: buildKline(strongCloses, strongVolumes),
    fallbackName: '持仓股',
    previousOrder: 0,
  });
  const watch = buildStockAssessment({
    holding: watchHolding,
    currentPrice: strongCloses[strongCloses.length - 1],
    kline: buildKline(strongCloses, strongVolumes),
    fallbackName: '观察股',
    previousOrder: 1,
  });

  assert.equal(held.scope, 'holding');
  assert.equal(watch.scope, 'watchlist');
  assert.ok(typeof held.action.stopLoss === 'number' && typeof held.action.takeProfit === 'number');
  assert.equal(watch.action.stopLoss, null);
  assert.equal(watch.action.takeProfit, null);
  assert.equal(watch.action.stance, 'buy-watch');
  assert.notEqual(held.risk.summary, '');
  assert.ok(held.risk.components.length >= 3);
});

test('buildStockAssessment keeps healthy trends out of blanket high-risk labels', () => {
  const holding: StockHoldingConfig = { code: '600003', name: '稳健股', shares: 100, cost: 45 };
  const closes = [
    40, 40.5, 41, 41.4, 41.9,
    42.3, 42.8, 43.1, 43.5, 43.9,
    44.2, 44.6, 45, 45.3, 45.6,
    45.9, 46.2, 46.4, 46.7, 47,
    47.2, 47.5, 47.7, 47.9, 48.2,
    48.4, 48.7, 49, 49.2, 49.5,
  ];
  const volumes = Array.from({ length: closes.length }, (_, index) => 120 + index * 2);

  const assessment = buildStockAssessment({
    holding,
    currentPrice: closes[closes.length - 1],
    kline: buildKline(closes, volumes, 0.7),
    fallbackName: '稳健股',
    previousOrder: 0,
  });

  assert.notEqual(assessment.risk.level, 'high');
  assert.ok(assessment.risk.components.some((item) => item.level === 'low'));
});

test('buildStockAssessment still escalates clearly unstable structures to high risk', () => {
  const holding: StockHoldingConfig = { code: '600004', name: '波动股', shares: 100, cost: 92 };
  const closes = [
    100, 104, 99, 107, 95,
    109, 94, 111, 92, 110,
    89, 112, 88, 108, 85,
    103, 81, 99, 78, 95,
    74, 90, 70, 86, 67,
    83, 65, 80, 63, 76,
  ];
  const volumes = [
    180, 210, 190, 230, 220,
    250, 245, 270, 280, 290,
    305, 315, 325, 340, 355,
    365, 380, 395, 410, 425,
    440, 455, 470, 485, 500,
    515, 530, 545, 560, 575,
  ];

  const assessment = buildStockAssessment({
    holding,
    currentPrice: closes[closes.length - 1],
    kline: buildKline(closes, volumes, 3.2),
    fallbackName: '波动股',
    previousOrder: 0,
  });

  assert.equal(assessment.risk.level, 'high');
  assert.ok(assessment.risk.components.some((item) => item.level === 'high'));
});

test('sortStockAssessments keeps holdings first before score ordering', () => {
  const items = [
    { code: '3', scope: 'watchlist', overall: { score: 95 } },
    { code: '1', scope: 'holding', overall: { score: 55 } },
    { code: '2', scope: 'holding', overall: { score: 80 } },
    { code: '4', scope: 'watchlist', overall: { score: 70 } },
  ] as Array<Pick<StockAssessment, 'code' | 'scope' | 'overall'>>;

  const sorted = sortStockAssessments(items as StockAssessment[]).map((item) => item.code);

  assert.deepEqual(sorted, ['2', '1', '3', '4']);
});

test('buildAssessmentReportSnapshot emits grouped report lines from assessments', () => {
  const assessments = [
    {
      code: '600001',
      name: '强势股',
      scope: 'holding',
      overall: { score: 84, rating: 'strong', headline: '量价连续确认', summary: '趋势延续性较好' },
      action: { stance: 'hold', label: '继续持有', stopLoss: 118, takeProfit: 136, reasons: ['放量上攻', '趋势确认'] },
      structure: { label: '量价连续确认', tags: ['trend_follow_through'], riskScore: -6, directionScore: 72 },
      technical: { score: 78, trend: 'up', momentum: 'strong', signals: [] },
      risk: { score: 32, level: 'low', volatilityPct: 22, maxDrawdownPct: 8, warningTags: [] },
    },
    {
      code: '600002',
      name: '观察股',
      scope: 'watchlist',
      overall: { score: 36, rating: 'cautious', headline: '顶背离预警', summary: '不宜贸然追价' },
      action: { stance: 'avoid', label: '暂回避', stopLoss: null, takeProfit: null, reasons: ['量价背离', '风险抬升'] },
      structure: { label: '顶背离预警', tags: ['bearish_divergence'], riskScore: 28, directionScore: -22 },
      technical: { score: 42, trend: 'down', momentum: 'weak', signals: [] },
      risk: { score: 78, level: 'high', volatilityPct: 48, maxDrawdownPct: 26, warningTags: ['高波动'] },
    },
  ] as unknown as StockAssessment[];

  const snapshot = buildAssessmentReportSnapshot(assessments, '2026-05-28');

  assert.equal(snapshot.stockCount, 2);
  assert.ok(snapshot.summaryLine.includes('2'));
  assert.ok(snapshot.details.includes('强势股(600001):'));
  assert.ok(snapshot.details.includes('观察股(600002):'));
  assert.ok(snapshot.signatures['600001'].includes('量价连续确认'));
});

test('sanitizeStockAssessmentCache rejects legacy entries that miss new risk fields', () => {
  const sanitized = sanitizeStockAssessmentCache([
    {
      code: '600005',
      name: '旧缓存',
      scope: 'holding',
      overall: {},
      action: {},
      structure: {},
      technical: {},
      risk: {
        score: 68,
        level: 'high',
        volatilityPct: 42,
        maxDrawdownPct: 18,
        warningTags: ['高波动'],
      },
    },
  ]);

  assert.deepEqual(sanitized, []);
});
