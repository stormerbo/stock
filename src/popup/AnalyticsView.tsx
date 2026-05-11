import { useMemo } from 'react';
import type { StockScoreResult } from '../shared/scoring';

type Props = {
  scores: Map<string, StockScoreResult>;
  stocks: Array<{ code: string; name: string }>;
  onSelectStock: (code: string, name: string) => void;
};

const RATING_COLORS: Record<string, string> = {
  S: '#FFD700',
  A: '#2aa568',
  B: '#3b82f6',
  C: '#f59e0b',
  D: '#e45555',
};

export default function AnalyticsView({ scores, stocks, onSelectStock }: Props) {
  const ranked = useMemo(() => {
    return stocks
      .filter((s) => scores.has(s.code))
      .map((s) => ({ ...s, score: scores.get(s.code)! }))
      .sort((a, b) => b.score.totalScore - a.score.totalScore);
  }, [scores, stocks]);

  if (ranked.length === 0) {
    return (
      <div className="analytics-view">
        <div className="analytics-empty">暂无评分数据，请刷新股票行情</div>
      </div>
    );
  }

  return (
    <div className="analytics-view">
      <div className="analytics-section">
        <h3 className="analytics-section-title">评分排行榜</h3>
        <div className="ranking-list">
          {ranked.map((item, i) => (
            <div
              key={item.code}
              className="ranking-row"
              onClick={() => onSelectStock(item.code, item.name || item.code)}
            >
              <span className="ranking-index">{i + 1}</span>
              <span className="ranking-name">{item.name || item.code}</span>
              <div className="ranking-bar-track">
                <div
                  className="ranking-bar-fill"
                  style={{
                    width: `${item.score.totalScore}%`,
                    backgroundColor: RATING_COLORS[item.score.rating],
                  }}
                />
              </div>
              <span className="ranking-score">{item.score.totalScore}</span>
              <span
                className="ranking-rating"
                style={{ color: RATING_COLORS[item.score.rating] }}
              >
                {item.score.rating}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
