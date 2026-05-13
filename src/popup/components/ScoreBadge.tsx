import type { StockScoreResult } from '../../shared/scoring';

const RATING_COLORS: Record<string, string> = {
  S: '#FFD700', A: '#2aa568', B: '#3b82f6', C: '#f59e0b', D: '#e45555',
};

export default function ScoreBadge({ score }: { score: StockScoreResult | undefined }) {
  if (!score) return null;
  const color = RATING_COLORS[score.rating] || '#888';
  const radius = 10;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score.totalScore / 100) * circumference;
  return (
    <span className="score-badge" title={`${score.totalScore}分 — ${score.rating}级`}>
      <svg width="24" height="24" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r={radius} fill="none" stroke="var(--border-2)" strokeWidth="2" />
        <circle
          cx="12" cy="12" r={radius} fill="none" stroke={color} strokeWidth="2"
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round" transform="rotate(-90 12 12)"
        />
        <text x="12" y="12" textAnchor="middle" dominantBaseline="central"
          fill={color} fontSize="10" fontWeight="700"
        >
          {score.rating}
        </text>
      </svg>
    </span>
  );
}
