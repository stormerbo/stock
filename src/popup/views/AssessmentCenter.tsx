import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { genRuleId, loadAlertConfig, saveAlertConfig, type AlertRule } from '../../shared/alerts';
import {
  getStockAssessmentRatingLabel,
  getStockAssessmentRiskLevelLabel,
  type StockAssessment,
} from '../../shared/stock-assessment.ts';
import { loadCachedStockAssessments, sanitizeStockAssessmentCache } from '../../shared/stock-assessment-cache.ts';

type Props = {
  focusCode?: string | null;
  onSelectStock?: (code: string, name: string) => void;
};

type AssessmentFilterId = 'holding' | 'watchlist' | StockAssessment['overall']['rating'];

const ASSESSMENT_FILTER_OPTIONS: Array<{ id: 'all' | AssessmentFilterId; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'holding', label: '持仓' },
  { id: 'watchlist', label: '自选' },
  { id: 'strong', label: '强势' },
  { id: 'positive', label: '偏多' },
  { id: 'neutral', label: '中性' },
  { id: 'cautious', label: '谨慎' },
  { id: 'weak', label: '承压' },
];

function ratingTone(rating: StockAssessment['overall']['rating']): 'positive' | 'negative' | 'neutral' {
  if (rating === 'strong' || rating === 'positive') return 'positive';
  if (rating === 'cautious' || rating === 'weak') return 'negative';
  return 'neutral';
}

function riskTone(level: StockAssessment['risk']['level']): 'positive' | 'negative' | 'neutral' {
  if (level === 'low') return 'positive';
  if (level === 'high') return 'negative';
  return 'neutral';
}

function structureTone(assessment: StockAssessment): 'positive' | 'negative' | 'neutral' {
  if (assessment.structure.directionScore >= 20 && assessment.structure.riskScore <= 0) return 'positive';
  if (assessment.structure.directionScore <= -20 || assessment.structure.riskScore >= 20) return 'negative';
  return 'neutral';
}

function actionTone(stance: StockAssessment['action']['stance']): 'positive' | 'negative' | 'neutral' {
  if (stance === 'hold' || stance === 'buy-watch') return 'positive';
  if (stance === 'reduce' || stance === 'avoid') return 'negative';
  return 'neutral';
}

function formatPrice(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '--';
  return value.toFixed(2);
}

function formatPct(value: number): string {
  if (!Number.isFinite(value)) return '--';
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

async function addStopAlerts(assessment: StockAssessment): Promise<string> {
  if (assessment.scope !== 'holding' || assessment.action.stopLoss == null || assessment.action.takeProfit == null) {
    return `${assessment.name} 当前没有可同步的止盈止损价位`;
  }

  const config = await loadAlertConfig();
  if (!config.globalEnabled) config.globalEnabled = true;
  let stockCfg = config.stocks.find((item) => item.code === assessment.code);
  if (!stockCfg) {
    stockCfg = { code: assessment.code, scope: 'holding', rules: [] };
    config.stocks.push(stockCfg);
  }

  const rules: AlertRule[] = [
    { id: genRuleId(), type: 'price_down', targetPrice: assessment.action.stopLoss, enabled: true, cooldownSeconds: 300 },
    { id: genRuleId(), type: 'price_up', targetPrice: assessment.action.takeProfit, enabled: true, cooldownSeconds: 300 },
  ];
  stockCfg.rules = [...stockCfg.rules.filter((rule) => rule.type !== 'price_up' && rule.type !== 'price_down'), ...rules];
  await saveAlertConfig(config);
  return `${assessment.name} 的止盈止损已同步到告警规则`;
}

function matchesAssessmentFilter(assessment: StockAssessment, filterId: AssessmentFilterId): boolean {
  if (filterId === 'holding' || filterId === 'watchlist') return assessment.scope === filterId;
  return assessment.overall.rating === filterId;
}

export default function AssessmentCenter({ focusCode, onSelectStock }: Props) {
  const [assessments, setAssessments] = useState<StockAssessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedCode, setExpandedCode] = useState<string | null>(null);
  const [selectedAssessmentFilters, setSelectedAssessmentFilters] = useState<AssessmentFilterId[]>([]);
  const [selectedStructureFilters, setSelectedStructureFilters] = useState<string[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const next = await loadCachedStockAssessments();
    setAssessments(next);
    setLoading(false);
    return next;
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    const listener = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
      if (areaName === 'local' && changes.stockAssessments) {
        setAssessments(sanitizeStockAssessmentCache(changes.stockAssessments.newValue));
        setLoading(false);
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, [loadData]);

  const structureOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const assessment of assessments) {
      const label = assessment.structure.label;
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, 'zh-CN'));
  }, [assessments]);

  const structureFilteredAssessments = useMemo(() => {
    if (selectedStructureFilters.length === 0) return assessments;
    return assessments.filter((assessment) => selectedStructureFilters.includes(assessment.structure.label));
  }, [assessments, selectedStructureFilters]);

  const assessmentFilteredAssessments = useMemo(() => {
    if (selectedAssessmentFilters.length === 0) return assessments;
    return assessments.filter((assessment) => selectedAssessmentFilters.some((filterId) => matchesAssessmentFilter(assessment, filterId)));
  }, [assessments, selectedAssessmentFilters]);

  const filteredAssessments = useMemo(() => {
    return assessments.filter((assessment) => {
      const assessmentPass = selectedAssessmentFilters.length === 0
        || selectedAssessmentFilters.some((filterId) => matchesAssessmentFilter(assessment, filterId));
      const structurePass = selectedStructureFilters.length === 0
        || selectedStructureFilters.includes(assessment.structure.label);
      return assessmentPass && structurePass;
    });
  }, [assessments, selectedAssessmentFilters, selectedStructureFilters]);

  const assessmentOptionCounts = useMemo(() => {
    const counts = new Map<'all' | AssessmentFilterId, number>();
    counts.set('all', structureFilteredAssessments.length);
    for (const option of ASSESSMENT_FILTER_OPTIONS) {
      if (option.id === 'all') continue;
      counts.set(option.id, structureFilteredAssessments.filter((assessment) => matchesAssessmentFilter(assessment, option.id as AssessmentFilterId)).length);
    }
    return counts;
  }, [structureFilteredAssessments]);

  const structureOptionCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const option of structureOptions) {
      counts.set(option.label, assessmentFilteredAssessments.filter((assessment) => assessment.structure.label === option.label).length);
    }
    return counts;
  }, [assessmentFilteredAssessments, structureOptions]);

  useEffect(() => {
    if (filteredAssessments.length === 0) {
      setExpandedCode(null);
      return;
    }
    if (focusCode && filteredAssessments.some((item) => item.code === focusCode)) {
      setExpandedCode(focusCode);
      return;
    }
    setExpandedCode((prev) => {
      if (prev && filteredAssessments.some((item) => item.code === prev)) return prev;
      return filteredAssessments[0]?.code ?? null;
    });
  }, [filteredAssessments, focusCode]);

  const forceRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await chrome.runtime.sendMessage({ type: 'force-refresh' });
      window.setTimeout(async () => {
        await loadData();
        setRefreshing(false);
      }, 3200);
    } catch {
      setRefreshing(false);
    }
  }, [loadData]);

  const syncAlerts = useCallback(async (assessment: StockAssessment) => {
    const message = await addStopAlerts(assessment);
    setToast(message);
    window.setTimeout(() => setToast(null), 2400);
  }, []);

  const toggleAssessmentFilter = useCallback((filterId: 'all' | AssessmentFilterId) => {
    if (filterId === 'all') {
      setSelectedAssessmentFilters([]);
      return;
    }
    setSelectedAssessmentFilters((prev) => (
      prev.includes(filterId)
        ? prev.filter((item) => item !== filterId)
        : [...prev, filterId]
    ));
  }, []);

  const toggleStructureFilter = useCallback((label: string) => {
    setSelectedStructureFilters((prev) => (
      prev.includes(label)
        ? prev.filter((item) => item !== label)
        : [...prev, label]
    ));
  }, []);

  if (loading) return <div className="panel-message">评估中心加载中...</div>;

  if (assessments.length === 0) {
    return (
      <div className="panel-message">
        <p>暂无统一评估</p>
        <p className="panel-sub">先刷新一次行情和 K 线，我们就能把技术、结构和风控一起算出来。</p>
        <button
          type="button"
          className="style-refresh-btn"
          style={{ margin: '12px auto 0', display: 'flex' }}
          onClick={forceRefresh}
          disabled={refreshing}
          title="立即计算"
        >
          <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
        </button>
      </div>
    );
  }

  return (
    <div className="assessment-page">
      <div className="assessment-page-header">
        <div className="assessment-page-title-row">
          <span className="assessment-page-title">评估中心</span>
          <button type="button" className="style-refresh-btn" onClick={forceRefresh} disabled={refreshing} title="强制刷新">
            <RefreshCw size={12} className={refreshing ? 'spin' : ''} />
          </button>
        </div>
        <p className="assessment-page-intro">
          统一查看全部自选股票的趋势、量价结构、风险暴露和操作建议。当前按持仓优先排序，其它自选随后。
        </p>
      </div>

      <section className="assessment-filter-panel">
        <div className="assessment-filter-header">
          <span className="assessment-filter-title">筛选</span>
          {selectedAssessmentFilters.length > 0 || selectedStructureFilters.length > 0 ? (
            <button
              type="button"
              className="assessment-clear-btn"
              onClick={() => {
                setSelectedAssessmentFilters([]);
                setSelectedStructureFilters([]);
              }}
            >
              清空筛选
            </button>
          ) : null}
        </div>

        <div className="assessment-filter-group">
          <span className="assessment-filter-label">评估状态</span>
          <div className="assessment-filter-chips">
            {ASSESSMENT_FILTER_OPTIONS.map((option) => {
              const active = option.id === 'all'
                ? selectedAssessmentFilters.length === 0
                : selectedAssessmentFilters.includes(option.id as AssessmentFilterId);
              const count = assessmentOptionCounts.get(option.id) ?? 0;
              return (
                <button
                  key={option.id}
                  type="button"
                  className={`assessment-filter-chip ${active ? 'active' : ''}`}
                  onClick={() => toggleAssessmentFilter(option.id)}
                >
                  <span>{option.label}</span>
                  <strong>{count}</strong>
                </button>
              );
            })}
          </div>
        </div>

        <div className="assessment-filter-group">
          <span className="assessment-filter-label">结构信号</span>
          <div className="assessment-filter-chips">
            {structureOptions.map((option) => {
              const active = selectedStructureFilters.includes(option.label);
              const count = structureOptionCounts.get(option.label) ?? 0;
              return (
                <button
                  key={option.label}
                  type="button"
                  className={`assessment-filter-chip ${active ? 'active' : ''}`}
                  onClick={() => toggleStructureFilter(option.label)}
                >
                  <span>{option.label}</span>
                  <strong>{count}</strong>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <div className="assessment-list">
        {filteredAssessments.length === 0 ? (
          <div className="assessment-empty-state">
            <strong>当前筛选下没有匹配股票</strong>
            <span>试试放宽标签，或者先清空筛选再看全量评估。</span>
          </div>
        ) : filteredAssessments.map((assessment) => {
          const isExpanded = expandedCode === assessment.code;
          const scoreTone = ratingTone(assessment.overall.rating);
          const structureStateTone = structureTone(assessment);
          const actionStateTone = actionTone(assessment.action.stance);
          const riskStateTone = riskTone(assessment.risk.level);
          const currentPriceTone = Number.isFinite(assessment.quote.changePct)
            ? (assessment.quote.changePct >= 0 ? 'up' : 'down')
            : '';
          return (
            <article key={assessment.code} className={`assessment-card ${isExpanded ? 'expanded' : ''}`}>
              <button
                type="button"
                className="assessment-card-summary"
                onClick={() => setExpandedCode((prev) => prev === assessment.code ? null : assessment.code)}
              >
                <div className="assessment-card-main">
                  <div className="assessment-card-title">
                    <div className="assessment-card-name-row">
                      <strong>{assessment.name}</strong>
                      <span className="assessment-card-code">{assessment.code}</span>
                      <span className={`assessment-chip scope ${assessment.scope === 'holding' ? 'holding' : 'watchlist'}`}>
                        {assessment.scope === 'holding' ? '持仓' : '自选'}
                      </span>
                    </div>
                    <div className={`assessment-card-headline assessment-tone-${structureStateTone}`}>{assessment.overall.headline}</div>
                    <div className="assessment-card-support">
                      <span className="assessment-card-support-line">{assessment.risk.summary}</span>
                      <div className="assessment-card-support-tags">
                        {assessment.action.reasons.slice(0, 1).map((reason) => (
                          <span key={reason} className="assessment-card-support-tag">{reason}</span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="assessment-card-rail">
                    <div className="assessment-card-metrics">
                      <div className="assessment-metric">
                        <span>现价</span>
                        <strong className={currentPriceTone}>{formatPrice(assessment.quote.currentPrice)}</strong>
                        <small className={currentPriceTone}>{formatPct(assessment.quote.changePct)}</small>
                      </div>
                      <div className="assessment-metric">
                        <span>总评</span>
                        <strong className={`assessment-tone-${scoreTone}`}>{getStockAssessmentRatingLabel(assessment.overall.rating)}</strong>
                        <small className={`assessment-metric-note assessment-tone-${scoreTone}`}>{assessment.overall.score}分</small>
                      </div>
                      <div className="assessment-metric">
                        <span>风险</span>
                        <strong className={`assessment-tone-${riskStateTone}`}>{getStockAssessmentRiskLevelLabel(assessment.risk.level)}</strong>
                        <small className={`assessment-metric-note assessment-tone-${riskStateTone}`}>{assessment.risk.summary}</small>
                      </div>
                      <div className="assessment-metric">
                        <span>建议</span>
                        <strong className={`assessment-tone-${actionStateTone}`}>{assessment.action.label}</strong>
                        <small className={`assessment-metric-note assessment-tone-${actionStateTone}`}>{assessment.scope === 'holding' ? '含风控价位' : '观察建议'}</small>
                      </div>
                    </div>
                    <span className="assessment-card-expand-icon">
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </span>
                  </div>
                </div>
              </button>

              {isExpanded ? (
                <div className="assessment-card-detail">
                  <div className="assessment-card-detail-grid">
                    <section className="assessment-block">
                      <div className="assessment-block-title">综合判断</div>
                      <p className="assessment-summary-text">{assessment.overall.summary}</p>
                      <div className="assessment-chip-row">
                        <span className={`assessment-chip assessment-chip-tone assessment-chip-tone-${scoreTone}`}>{getStockAssessmentRatingLabel(assessment.overall.rating)}</span>
                        <span className={`assessment-chip assessment-chip-tone assessment-chip-tone-${structureStateTone}`}>{assessment.structure.label}</span>
                        <span className={`assessment-chip assessment-chip-tone assessment-chip-tone-${riskStateTone}`}>{getStockAssessmentRiskLevelLabel(assessment.risk.level)}</span>
                      </div>
                    </section>

                    <section className="assessment-block">
                      <div className="assessment-block-title">操作建议</div>
                      <div className="assessment-action-line">
                        <strong className={`assessment-tone-${scoreTone}`}>{assessment.action.label}</strong>
                        {assessment.scope === 'holding' && assessment.action.stopLoss != null && assessment.action.takeProfit != null ? (
                          <span className="assessment-action-prices">
                            止损 {assessment.action.stopLoss.toFixed(2)} / 止盈 {assessment.action.takeProfit.toFixed(2)}
                          </span>
                        ) : (
                          <span className="assessment-action-prices">当前以观察节奏为主</span>
                        )}
                      </div>
                      <div className="assessment-reasons">
                        {assessment.action.reasons.map((reason) => <span key={reason}>{reason}</span>)}
                      </div>
                      <div className="assessment-actions-row">
                        <button
                          type="button"
                          className="assessment-inline-btn"
                          onClick={() => onSelectStock?.(assessment.code, assessment.name)}
                        >
                          查看详情
                        </button>
                        {assessment.scope === 'holding' && assessment.action.stopLoss != null && assessment.action.takeProfit != null ? (
                          <button
                            type="button"
                            className="assessment-inline-btn secondary"
                            onClick={() => { void syncAlerts(assessment); }}
                          >
                            同步止盈止损告警
                          </button>
                        ) : null}
                      </div>
                    </section>

                    <section className="assessment-block">
                      <div className="assessment-block-title">技术与结构</div>
                      <div className="assessment-kpi-row">
                        <span>技术 {assessment.technical.score}</span>
                        <span>方向 {assessment.structure.directionScore}</span>
                        <span>结构风险 {assessment.structure.riskScore}</span>
                      </div>
                      <div className="assessment-signal-list">
                        {assessment.technical.signals.slice(0, 5).map((signal) => (
                          <div key={`${assessment.code}_${signal.label}`} className={`assessment-signal assessment-signal-${signal.severity}`}>
                            <span>{signal.label}</span>
                            <small>{signal.reason}</small>
                          </div>
                        ))}
                        {assessment.technical.signals.length === 0 ? (
                          <div className="assessment-empty-inline">暂无额外技术信号</div>
                        ) : null}
                      </div>
                    </section>

                    <section className="assessment-block">
                      <div className="assessment-block-title">风险暴露</div>
                      <div className="assessment-kpi-row">
                        <span>综合 {assessment.risk.summary}</span>
                        <span>风险分 {assessment.risk.score}</span>
                      </div>
                      <div className="assessment-chip-row">
                        {assessment.risk.components.map((component) => (
                          <span
                            key={`${assessment.code}_${component.aspect}`}
                            className={`assessment-chip assessment-chip-tone assessment-chip-tone-${riskTone(component.level)}`}
                          >
                            {component.label} {component.detail}
                          </span>
                        ))}
                      </div>
                      <div className="assessment-reasons">
                        {(assessment.risk.warningTags.length > 0 ? assessment.risk.warningTags : ['暂无额外警示']).map((tag) => (
                          <span key={tag} className={assessment.risk.warningTags.length > 0 ? 'assessment-risk-warning' : ''}>{tag}</span>
                        ))}
                      </div>
                    </section>
                  </div>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>

      {toast ? <div className="stop-toast">{toast}</div> : null}
    </div>
  );
}
