import type { StockHoldingConfig, StockPosition } from './fetch.ts';
import { calcATR, calcMA, detectAllSignals, type KlinePoint } from './technical-analysis.ts';
import { calcMaxDrawdownFromKline, calcVolatilityFromKline } from './risk-metrics.ts';
import { assessVolumePriceContext, describeVolumePriceAssessment } from './volume-price-context.ts';
import { calcTradeSignal } from './trade-signal.ts';

export type StockAssessmentRating = 'strong' | 'positive' | 'neutral' | 'cautious' | 'weak';
export type StockAssessmentScope = 'holding' | 'watchlist';
export type StockAssessmentTrend = 'up' | 'down' | 'sideways';
export type StockAssessmentMomentum = 'strong' | 'normal' | 'weak';
export type StockAssessmentRiskLevel = 'low' | 'medium' | 'high';
export type StockAssessmentActionStance = 'buy-watch' | 'hold' | 'reduce' | 'avoid';
export type StockAssessmentRiskAspect = 'volatility' | 'drawdown' | 'structure';

export type StockAssessment = {
  code: string;
  name: string;
  scope: StockAssessmentScope;
  previousOrder: number;
  quote: {
    currentPrice: number;
    changePct: number;
    shares: number;
    cost: number;
    floatingPnl: number | null;
    positionValue: number | null;
  };
  overall: {
    score: number;
    rating: StockAssessmentRating;
    headline: string;
    summary: string;
  };
  technical: {
    score: number;
    trend: StockAssessmentTrend;
    momentum: StockAssessmentMomentum;
    signals: Array<{ label: string; severity: 'positive' | 'negative' | 'info'; reason: string }>;
  };
  risk: {
    score: number;
    level: StockAssessmentRiskLevel;
    summary: string;
    volatilityPct: number;
    maxDrawdownPct: number;
    warningTags: string[];
    components: Array<{
      aspect: StockAssessmentRiskAspect;
      label: string;
      level: StockAssessmentRiskLevel;
      score: number;
      detail: string;
    }>;
  };
  structure: {
    directionScore: number;
    riskScore: number;
    tags: string[];
    label: string;
  };
  action: {
    stance: StockAssessmentActionStance;
    label: string;
    stopLoss: number | null;
    takeProfit: number | null;
    reasons: string[];
  };
  updatedAt: number;
};

export type BuildStockAssessmentInput = {
  holding: StockHoldingConfig;
  currentPrice: number;
  kline: KlinePoint[];
  fallbackName: string;
  previousOrder: number;
  position?: StockPosition | null;
};

export type AssessmentReportSnapshot = {
  stockCount: number;
  summaryLine: string;
  details: string;
  signatures: Record<string, string>;
};

export const ASSESSMENT_REPORT_NOTIFICATION_NAME = '盘后评估报告';
export const LEGACY_TECH_REPORT_NOTIFICATION_NAME = '盘后技术报告';

export function isAssessmentReportNotificationName(name: string): boolean {
  return name === ASSESSMENT_REPORT_NOTIFICATION_NAME || name === LEGACY_TECH_REPORT_NOTIFICATION_NAME;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function lastNumber(values: Array<number | null>): number | null {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    const value = values[index];
    if (value !== null && Number.isFinite(value)) return value;
  }
  return null;
}

function calcTrendSlope(closes: number[], period = 20, window = 5): number {
  const ma = calcMA(closes, period);
  const valid = ma.filter((value): value is number => value !== null);
  if (valid.length < window + 1) return 0;
  const recent = valid.slice(-window - 1);
  return recent[recent.length - 1] - recent[0];
}

function deriveTrend(score: number): StockAssessmentTrend {
  if (score >= 65) return 'up';
  if (score <= 35) return 'down';
  return 'sideways';
}

function deriveMomentum(score: number): StockAssessmentMomentum {
  if (score >= 65) return 'strong';
  if (score <= 35) return 'weak';
  return 'normal';
}

function deriveRiskLevel(score: number): StockAssessmentRiskLevel {
  if (score >= 72) return 'high';
  if (score >= 42) return 'medium';
  return 'low';
}

function deriveRating(score: number): StockAssessmentRating {
  if (score >= 80) return 'strong';
  if (score >= 62) return 'positive';
  if (score >= 45) return 'neutral';
  if (score >= 28) return 'cautious';
  return 'weak';
}

export function getStockAssessmentRatingLabel(rating: StockAssessmentRating): string {
  switch (rating) {
    case 'strong': return '强势';
    case 'positive': return '偏多';
    case 'neutral': return '中性';
    case 'cautious': return '谨慎';
    case 'weak': return '承压';
  }
}

function deriveHeadline(structureLabel: string, tradeLabel: string, rating: StockAssessmentRating): string {
  if (structureLabel && structureLabel !== '量价中性') return structureLabel;
  if (tradeLabel) return tradeLabel;
  return getStockAssessmentRatingLabel(rating);
}

function deriveSummary(rating: StockAssessmentRating, structureLabel: string, scope: StockAssessmentScope, riskLevel: StockAssessmentRiskLevel): string {
  if (scope === 'watchlist') {
    if (rating === 'strong' || rating === 'positive') return `${structureLabel}，适合作为重点观察对象，等待更好的介入确认。`;
    if (rating === 'weak' || riskLevel === 'high') return `${structureLabel}，当前风险更高，优先观望。`;
    return `${structureLabel}，先放在观察列表里继续跟踪。`;
  }
  if (rating === 'strong') return `${structureLabel}，趋势和结构都站在多头一侧，当前更适合顺势持有。`;
  if (rating === 'positive') return `${structureLabel}，整体仍偏多，但需要继续观察量价延续。`;
  if (rating === 'weak') return `${structureLabel}，风险项占优，建议把风控放在第一位。`;
  if (riskLevel === 'high') return `${structureLabel}，风险暴露偏高，仓位和止损都需要更谨慎。`;
  return `${structureLabel}，多空线索交错，先按计划执行。`;
}

function deriveRiskComponentLevel(score: number): StockAssessmentRiskLevel {
  if (score >= 72) return 'high';
  if (score >= 42) return 'medium';
  return 'low';
}

function deriveRiskComponents(
  volatilityPct: number,
  maxDrawdownPct: number,
  structureRiskScore: number,
): StockAssessment['risk']['components'] {
  const volatilityScore = Math.round(clamp(((volatilityPct - 18) / 34) * 100, 0, 100));
  const drawdownScore = Math.round(clamp(((maxDrawdownPct - 8) / 24) * 100, 0, 100));
  const structureScore = Math.round(clamp(((structureRiskScore + 10) / 50) * 100, 0, 100));

  return [
    {
      aspect: 'volatility',
      label: '波动',
      level: deriveRiskComponentLevel(volatilityScore),
      score: volatilityScore,
      detail: `${round(volatilityPct)}%`,
    },
    {
      aspect: 'drawdown',
      label: '回撤',
      level: deriveRiskComponentLevel(drawdownScore),
      score: drawdownScore,
      detail: `${round(maxDrawdownPct)}%`,
    },
    {
      aspect: 'structure',
      label: '结构',
      level: deriveRiskComponentLevel(structureScore),
      score: structureScore,
      detail: structureRiskScore >= 12 ? '需防守' : structureRiskScore <= -8 ? '较稳定' : '需观察',
    },
  ];
}

function deriveRiskScore(components: StockAssessment['risk']['components']): number {
  const volatility = components.find((item) => item.aspect === 'volatility')?.score ?? 0;
  const drawdown = components.find((item) => item.aspect === 'drawdown')?.score ?? 0;
  const structure = components.find((item) => item.aspect === 'structure')?.score ?? 0;
  const highCount = components.filter((item) => item.level === 'high').length;
  const mediumCount = components.filter((item) => item.level === 'medium').length;
  const breadthBonus = highCount >= 2 ? 18 : highCount === 1 && mediumCount >= 1 ? 10 : mediumCount >= 2 ? 6 : 0;
  return Math.round(clamp(volatility * 0.32 + drawdown * 0.23 + structure * 0.45 + breadthBonus, 0, 100));
}

function deriveRiskSummary(
  level: StockAssessmentRiskLevel,
  components: StockAssessment['risk']['components'],
): string {
  const emphasized = components
    .filter((item) => item.level !== 'low')
    .sort((left, right) => right.score - left.score)
    .slice(0, 2);

  if (emphasized.length === 0) return '波动、回撤和结构都相对可控';
  if (level === 'high') return emphasized.map((item) => `${item.label}${item.level === 'high' ? '偏高' : '偏谨慎'}`).join(' / ');
  return emphasized.map((item) => `${item.label}需观察`).join(' / ');
}

function deriveWarningTags(volatilityPct: number, maxDrawdownPct: number, structureTags: string[]): string[] {
  const tags: string[] = [];
  if (volatilityPct >= 45) tags.push('高波动');
  if (maxDrawdownPct >= 20) tags.push('高回撤');
  if (structureTags.includes('bearish_divergence')) tags.push('背离');
  if (structureTags.includes('bear_confirmed')) tags.push('放量走弱');
  return tags;
}

function deriveTechnicalScore(signals: StockAssessment['technical']['signals'], tradeSignalScore: number | null): number {
  let score = tradeSignalScore ?? 50;
  const positive = signals.filter((signal) => signal.severity === 'positive').length;
  const negative = signals.filter((signal) => signal.severity === 'negative').length;
  score += positive * 5;
  score -= negative * 5;
  return Math.round(clamp(score, 0, 100));
}

function deriveOverallScore(
  technicalScore: number,
  riskScore: number,
  directionScore: number,
  tradeSignalScore: number | null,
): number {
  const structureComponent = clamp(((directionScore + 100) / 200) * 100, 0, 100);
  const tradeComponent = tradeSignalScore ?? technicalScore;
  const raw = tradeComponent * 0.45 + technicalScore * 0.2 + structureComponent * 0.2 + (100 - riskScore) * 0.15;
  return Math.round(clamp(raw, 0, 100));
}

function deriveActionLabel(stance: StockAssessmentActionStance): string {
  switch (stance) {
    case 'buy-watch': return '重点观察';
    case 'hold': return '继续持有';
    case 'reduce': return '收紧风控';
    case 'avoid': return '暂时回避';
  }
}

export function getStockAssessmentRiskLevelLabel(level: StockAssessmentRiskLevel): string {
  switch (level) {
    case 'low': return '低风险';
    case 'medium': return '中风险';
    case 'high': return '高风险';
  }
}

function calcStopTargets(kline: KlinePoint[], currentPrice: number, directionScore: number, riskScore: number): { stopLoss: number | null; takeProfit: number | null } {
  const closes = kline.map((item) => item.close);
  const highs = kline.map((item) => item.high);
  const lows = kline.map((item) => item.low);
  const atrSeries = calcATR(highs, lows, closes, 14);
  const lastAtr = lastNumber(atrSeries);
  if (lastAtr === null || !Number.isFinite(lastAtr) || lastAtr <= 0) {
    return { stopLoss: null, takeProfit: null };
  }

  const slope = calcTrendSlope(closes, 20, 5);
  const recent = closes.slice(-20);
  const avgPrice = recent.reduce((sum, value) => sum + value, 0) / recent.length;
  const normalizedSlope = avgPrice > 0 ? clamp((slope / avgPrice) * 100, -0.5, 0.5) : 0;
  const trendFactor = 1 + normalizedSlope;
  const directionFactor = clamp(1 + (directionScore / 100) * 0.18 - (riskScore / 100) * 0.22, 0.75, 1.35);
  const rewardFactor = clamp(1 + (directionScore / 100) * 0.28 - (riskScore / 100) * 0.08, 0.72, 1.45);

  const stopLoss = round(currentPrice - lastAtr * 2 * trendFactor * directionFactor);
  const takeProfit = round(currentPrice + lastAtr * 2 * (2 - trendFactor) * rewardFactor);
  return { stopLoss, takeProfit };
}

function deriveAction(
  scope: StockAssessmentScope,
  overallScore: number,
  riskLevel: StockAssessmentRiskLevel,
  structureLabel: string,
  structureTags: string[],
  targets: { stopLoss: number | null; takeProfit: number | null },
): StockAssessment['action'] {
  let stance: StockAssessmentActionStance;
  if (scope === 'watchlist') {
    stance = overallScore >= 60 ? 'buy-watch' : overallScore <= 35 || riskLevel === 'high' ? 'avoid' : 'buy-watch';
  } else if (overallScore >= 60 && riskLevel !== 'high') {
    stance = 'hold';
  } else if (overallScore <= 35 || structureTags.includes('bearish_divergence') || structureTags.includes('bear_confirmed')) {
    stance = 'reduce';
  } else if (riskLevel === 'high') {
    stance = 'reduce';
  } else {
    stance = 'hold';
  }

  const reasons = [structureLabel];
  if (structureTags.includes('trend_follow_through')) reasons.push('趋势延续性较好');
  if (structureTags.includes('healthy_pullback')) reasons.push('回踩质量较健康');
  if (structureTags.includes('bearish_divergence')) reasons.push('结构背离需要防守');
  if (riskLevel === 'high') reasons.push('风险等级偏高');

  return {
    stance,
    label: deriveActionLabel(stance),
    stopLoss: scope === 'holding' ? targets.stopLoss : null,
    takeProfit: scope === 'holding' ? targets.takeProfit : null,
    reasons: Array.from(new Set(reasons.filter(Boolean))).slice(0, 4),
  };
}

export function buildStockAssessment(input: BuildStockAssessmentInput): StockAssessment {
  const { holding, currentPrice, kline, fallbackName, previousOrder, position } = input;
  const name = position?.name || holding.name || fallbackName || holding.code;
  const scope: StockAssessmentScope = holding.shares > 0 ? 'holding' : 'watchlist';
  const quoteChangePct = position?.dailyChangePct ?? Number.NaN;
  const positionValue = holding.shares > 0 ? round(currentPrice * holding.shares) : null;
  const floatingPnl = holding.shares > 0 && holding.cost > 0
    ? round((currentPrice - holding.cost) * holding.shares)
    : null;

  const structureAssessment = assessVolumePriceContext(kline);
  const technicalSignals = detectAllSignals(kline).map((signal) => ({
    label: signal.label,
    severity: signal.severity,
    reason: signal.guidance,
  }));
  const tradeSignal = calcTradeSignal(holding.code, name, kline, currentPrice);
  const technicalScore = deriveTechnicalScore(technicalSignals, tradeSignal?.score ?? null);
  const volatility = calcVolatilityFromKline(kline)?.annualizedVolatility ?? 0;
  const maxDrawdown = Math.abs(calcMaxDrawdownFromKline(kline)?.maxDrawdown ?? 0);
  const riskComponents = deriveRiskComponents(volatility * 100, maxDrawdown * 100, structureAssessment.riskScore);
  const riskScore = deriveRiskScore(riskComponents);
  const riskLevel = deriveRiskLevel(riskScore);
  const riskSummary = deriveRiskSummary(riskLevel, riskComponents);
  const overallScore = deriveOverallScore(technicalScore, riskScore, structureAssessment.directionScore, tradeSignal?.score ?? null);
  const rating = deriveRating(overallScore);
  const structureLabel = describeVolumePriceAssessment(structureAssessment);
  const headline = deriveHeadline(structureLabel, tradeSignal?.label ?? '', rating);
  const summary = deriveSummary(rating, structureLabel, scope, riskLevel);
  const targets = calcStopTargets(kline, currentPrice, structureAssessment.directionScore, structureAssessment.riskScore);
  const action = deriveAction(scope, overallScore, riskLevel, structureLabel, structureAssessment.tags, targets);

  return {
    code: holding.code,
    name,
    scope,
    previousOrder,
    quote: {
      currentPrice: round(currentPrice),
      changePct: quoteChangePct,
      shares: holding.shares,
      cost: holding.cost,
      floatingPnl,
      positionValue,
    },
    overall: {
      score: overallScore,
      rating,
      headline,
      summary,
    },
    technical: {
      score: technicalScore,
      trend: deriveTrend(tradeSignal?.details.trendScore ?? technicalScore),
      momentum: deriveMomentum(tradeSignal?.details.momentumScore ?? technicalScore),
      signals: technicalSignals,
    },
    risk: {
      score: riskScore,
      level: riskLevel,
      summary: riskSummary,
      volatilityPct: round(volatility * 100),
      maxDrawdownPct: round(maxDrawdown * 100),
      warningTags: deriveWarningTags(volatility * 100, maxDrawdown * 100, structureAssessment.tags),
      components: riskComponents,
    },
    structure: {
      directionScore: structureAssessment.directionScore,
      riskScore: structureAssessment.riskScore,
      tags: structureAssessment.tags,
      label: structureLabel,
    },
    action,
    updatedAt: Date.now(),
  };
}

export function sortStockAssessments<T extends Pick<StockAssessment, 'scope' | 'overall' | 'previousOrder'>>(items: T[]): T[] {
  return [...items].sort((left, right) => {
    if (left.scope !== right.scope) return left.scope === 'holding' ? -1 : 1;
    if (left.overall.score !== right.overall.score) return right.overall.score - left.overall.score;
    return left.previousOrder - right.previousOrder;
  });
}

function severityTag(rating: StockAssessmentRating): '[看多]' | '[看空]' | '[中性]' {
  if (rating === 'strong' || rating === 'positive') return '[看多]';
  if (rating === 'cautious' || rating === 'weak') return '[看空]';
  return '[中性]';
}

export function buildAssessmentSignature(assessment: StockAssessment): string {
  return [
    assessment.overall.rating,
    assessment.overall.headline,
    assessment.action.stance,
    assessment.structure.label,
    assessment.structure.tags.join(','),
  ].join('|');
}

export function buildAssessmentReportSnapshot(
  assessments: StockAssessment[],
  date: string,
): AssessmentReportSnapshot {
  const sorted = sortStockAssessments(assessments);
  const detailsLines: string[] = [`📊 评估报告 (${date})`, ''];
  const signatures: Record<string, string> = {};

  for (const assessment of sorted) {
    signatures[assessment.code] = buildAssessmentSignature(assessment);
    detailsLines.push(`${assessment.name}(${assessment.code}):`);
    detailsLines.push(`  • ${severityTag(assessment.overall.rating)} ${assessment.overall.headline} — ${assessment.overall.summary}`);
    detailsLines.push(`  • [中性] ${assessment.action.label} — ${assessment.action.reasons.join('，')}`);
    if (assessment.scope === 'holding' && assessment.action.stopLoss !== null && assessment.action.takeProfit !== null) {
      detailsLines.push(`  • [中性] 止损/止盈 — ${assessment.action.stopLoss.toFixed(2)} / ${assessment.action.takeProfit.toFixed(2)}`);
    }
    detailsLines.push('');
  }

  const summaryLine = sorted.length === 0
    ? '暂无新的评估变化'
    : `${sorted.length}只自选股票出现新的评估变化`;

  return {
    stockCount: sorted.length,
    summaryLine,
    details: detailsLines.join('\n').trim(),
    signatures,
  };
}
