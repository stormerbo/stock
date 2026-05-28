import {
  getStockAssessmentRatingLabel,
  getStockAssessmentRiskLevelLabel,
  type StockAssessment,
} from '../../shared/stock-assessment.ts';

type Props = {
  assessment: StockAssessment | null;
  onOpenAssessment?: (code: string) => void;
};

function tone(rating: StockAssessment['overall']['rating'] | null): 'positive' | 'negative' | 'neutral' {
  if (rating === 'strong' || rating === 'positive') return 'positive';
  if (rating === 'cautious' || rating === 'weak') return 'negative';
  return 'neutral';
}

function riskTone(level: StockAssessment['risk']['level'] | null): 'positive' | 'negative' | 'neutral' {
  if (level === 'low') return 'positive';
  if (level === 'high') return 'negative';
  return 'neutral';
}

export default function AssessmentSummaryBlock({ assessment, onOpenAssessment }: Props) {
  if (!assessment) {
    return (
      <div className="assessment-summary-card is-empty">
        <span className="assessment-summary-title">评估摘要</span>
        <p className="assessment-summary-copy">统一评估还没准备好，先刷新一次行情后再看会更准。</p>
      </div>
    );
  }

  return (
    <div className="assessment-summary-card">
      <div className="assessment-summary-topline">
        <div className="assessment-summary-topline-main">
          <span className="assessment-summary-title">评估摘要</span>
          <span className={`assessment-chip assessment-tone-${tone(assessment.overall.rating)}`}>
            {getStockAssessmentRatingLabel(assessment.overall.rating)} {assessment.overall.score}分
          </span>
        </div>
        {onOpenAssessment ? (
          <button type="button" className="assessment-inline-btn secondary compact" onClick={() => onOpenAssessment(assessment.code)}>
            完整评估
          </button>
        ) : null}
      </div>

      <div className="assessment-summary-headline-row">
        <div className="assessment-summary-headline">{assessment.overall.headline}</div>
        <span className={`assessment-chip assessment-tone-${riskTone(assessment.risk.level)}`}>{getStockAssessmentRiskLevelLabel(assessment.risk.level)}</span>
        <span className="assessment-chip">{assessment.action.label}</span>
      </div>

      <p className="assessment-summary-copy compact">{assessment.overall.summary}</p>
      <p className="assessment-summary-copy compact">{assessment.risk.summary}</p>

      <div className="assessment-chip-row compact">
        <span className="assessment-chip">{assessment.structure.label}</span>
        {assessment.risk.components.slice(0, 2).map((component) => (
          <span key={component.aspect} className={`assessment-chip assessment-chip-tone assessment-chip-tone-${riskTone(component.level)}`}>
            {component.label} {component.detail}
          </span>
        ))}
        {assessment.action.reasons.slice(0, 2).map((reason) => <span key={reason} className="assessment-chip">{reason}</span>)}
      </div>

      {assessment.scope === 'holding' && assessment.action.stopLoss != null && assessment.action.takeProfit != null ? (
        <div className="assessment-summary-prices">
          <span>止损 {assessment.action.stopLoss.toFixed(2)}</span>
          <span>止盈 {assessment.action.takeProfit.toFixed(2)}</span>
        </div>
      ) : null}
    </div>
  );
}
