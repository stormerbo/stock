import type { StockAssessment } from './stock-assessment.ts';

const ASSESSMENT_CACHE_KEY = 'stockAssessments';
const ASSESSMENT_LAST_CALC_KEY = '_lastStockAssessmentTime';
const ASSESSMENT_VERSION_KEY = '_stockAssessmentVersion';
const ASSESSMENT_VERSION = 2;
const ASSESSMENT_TTL_MS = 2 * 60 * 60 * 1000;

function isStockAssessment(value: unknown): value is StockAssessment {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<StockAssessment>;
  const risk = item.risk as StockAssessment['risk'] | undefined;
  return typeof item.code === 'string'
    && typeof item.name === 'string'
    && typeof item.scope === 'string'
    && item.overall != null
    && item.action != null
    && item.structure != null
    && item.technical != null
    && risk != null
    && typeof risk.summary === 'string'
    && Array.isArray(risk.components);
}

export function sanitizeStockAssessmentCache(value: unknown): StockAssessment[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isStockAssessment);
}

export async function loadCachedStockAssessments(): Promise<StockAssessment[]> {
  try {
    const result = await chrome.storage.local.get([ASSESSMENT_CACHE_KEY, ASSESSMENT_VERSION_KEY]);
    const version = (result[ASSESSMENT_VERSION_KEY] as number) ?? 0;
    if (version !== ASSESSMENT_VERSION) return [];
    return sanitizeStockAssessmentCache(result[ASSESSMENT_CACHE_KEY]);
  } catch {
    return [];
  }
}

export async function saveStockAssessmentCache(assessments: StockAssessment[]): Promise<void> {
  try {
    await chrome.storage.local.set({
      [ASSESSMENT_CACHE_KEY]: assessments,
      [ASSESSMENT_LAST_CALC_KEY]: Date.now(),
      [ASSESSMENT_VERSION_KEY]: ASSESSMENT_VERSION,
    });
  } catch {
    // best effort
  }
}

export async function shouldRecalcStockAssessments(): Promise<boolean> {
  try {
    const result = await chrome.storage.local.get([ASSESSMENT_LAST_CALC_KEY, ASSESSMENT_VERSION_KEY]);
    const version = (result[ASSESSMENT_VERSION_KEY] as number) ?? 0;
    if (version !== ASSESSMENT_VERSION) return true;
    const lastCalc = (result[ASSESSMENT_LAST_CALC_KEY] as number) ?? 0;
    return Date.now() - lastCalc > ASSESSMENT_TTL_MS;
  } catch {
    return true;
  }
}

export async function clearStockAssessmentCache(): Promise<void> {
  try {
    await chrome.storage.local.remove([ASSESSMENT_CACHE_KEY, ASSESSMENT_LAST_CALC_KEY, ASSESSMENT_VERSION_KEY]);
  } catch {
    // best effort
  }
}
