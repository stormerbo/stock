import { ChevronLeft } from 'lucide-react';
import type { StockScoreResult, ScoreBreakdown } from '../../shared/scoring';

type Props = {
  code: string;
  name: string;
  score: StockScoreResult;
  onBack: () => void;
};

const RATING_COLORS: Record<string, string> = {
  S: '#FFD700',
  A: '#2aa568',
  B: '#3b82f6',
  C: '#f59e0b',
  D: '#e45555',
};

const DIM_COLORS: Record<string, string> = {
  '技术面': '#e45555',
  '基本面': '#3b82f6',
  '风险面': '#f59e0b',
};

type IndicatorMeta = {
  key: keyof ScoreBreakdown;
  name: string;
  dimension: string;
  dimWeight: string;
  subWeight: string;
  formula: string;
};

const INDICATORS: IndicatorMeta[] = [
  { key: 'macd',         name: 'MACD',     dimension: '技术面', dimWeight: '50%', subWeight: '15/50', formula: '金叉=90, 死叉=10, DIF>DEA=60, DIF<DEA=40, 柱状图±5修正' },
  { key: 'maAlignment',  name: '均线排列', dimension: '技术面', dimWeight: '50%', subWeight: '10/50', formula: 'MA5>MA10>MA20=90, 空头=10, 缠绕=50' },
  { key: 'rsi',          name: 'RSI',       dimension: '技术面', dimWeight: '50%', subWeight: '10/50', formula: '30-40=80, 40-60=60, 60-70=40, >70=20, <30=70 (14日)' },
  { key: 'volume',       name: '量能',      dimension: '技术面', dimWeight: '50%', subWeight: '5/50',  formula: '量比>1.5且收涨=80, 放量下跌=20, 量比<0.5=20, 其余=50' },
  { key: 'kdj',          name: 'KDJ',       dimension: '技术面', dimWeight: '50%', subWeight: '5/50',  formula: '金叉=90, 死叉=10, K<20=80, 20-40=70, 40-60=55, 60-80=40, >80=20' },
  { key: 'bollinger',    name: '布林带',    dimension: '技术面', dimWeight: '50%', subWeight: '5/50',  formula: '(收盘-下轨)/(上轨-下轨): <0.1=80, 0.1-0.4=65, 0.4-0.6=60, 0.6-0.9=40, >0.9=20, 突破上轨=30' },
  { key: 'pe',           name: 'PE_TTM',    dimension: '基本面', dimWeight: '30%', subWeight: '10/30', formula: '<0=50, 0-15=90, 15-25=70, 25-40=50, 40-80=30, >80=10' },
  { key: 'roe',          name: 'ROE',       dimension: '基本面', dimWeight: '30%', subWeight: '8/30',  formula: '>20%=90, 15-20%=80, 10-15%=60, 5-10%=40, 0-5%=20, 负值=10' },
  { key: 'profitGrowth', name: '利润增速',  dimension: '基本面', dimWeight: '30%', subWeight: '7/30',  formula: '>30%=90, 20-30%=80, 10-20%=60, 0-10%=50, 负值=20 (净利润同比)' },
  { key: 'dividendYield',name: '股息率',    dimension: '基本面', dimWeight: '30%', subWeight: '5/30',  formula: '>4%=90, 2-4%=70, 1-2%=50, <1%=30' },
  { key: 'volatility',   name: '年化波动率',dimension: '风险面', dimWeight: '20%', subWeight: '10/20', formula: '<20%=90, 20-30%=70, 30-40%=50, 40-50%=30, >50%=10 (年化)' },
  { key: 'drawdown',     name: '最大回撤',  dimension: '风险面', dimWeight: '20%', subWeight: '10/20', formula: '<10%=90, 10-20%=70, 20-30%=50, 30-40%=30, >40%=10 (60日)' },
];

export default function ScoreDetailView({ code, name, score, onBack }: Props) {
  const ratingColor = RATING_COLORS[score.rating] || '#888';

  return (
    <section className="stock-detail-panel">
      <header className="detail-header">
        <button type="button" className="detail-back-btn" onClick={onBack}>
          <ChevronLeft size={14} />
          返回
        </button>
      </header>

      <div className="detail-body" style={{ overflow: 'auto' }}>
        {/* Hero 区域 */}
        <div className="score-hero">
          <div className="score-hero-ring">
            <svg width="64" height="64" viewBox="0 0 64 64">
              <circle cx="32" cy="32" r="26" fill="none" stroke="var(--border-2)" strokeWidth="4" />
              <circle
                cx="32" cy="32" r="26" fill="none" stroke={ratingColor} strokeWidth="4"
                strokeDasharray={2 * Math.PI * 26}
                strokeDashoffset={2 * Math.PI * 26 * (1 - score.totalScore / 100)}
                strokeLinecap="round" transform="rotate(-90 32 32)"
              />
              <text x="32" y="32" textAnchor="middle" dominantBaseline="central"
                fill={ratingColor} fontSize="22" fontWeight="800"
              >
                {score.rating}
              </text>
            </svg>
          </div>
          <div className="score-hero-info">
            <div className="score-hero-name">{name}</div>
            <div className="score-hero-code">{code}</div>
            <div className="score-hero-total" style={{ color: ratingColor }}>
              {score.totalScore}<span className="score-hero-unit"> 分</span>
            </div>
          </div>
        </div>

        {/* 公式 */}
        <div className="score-formula-bar">
          综合得分 = 技术面×50% + 基本面×30% + 风险面×20%
        </div>

        {/* 维度总览 */}
        <div className="score-dim-strip">
          <div className="score-dim-strip-item">
            <div className="score-dim-strip-head">
              <span style={{ color: DIM_COLORS['技术面'] }}>技术面</span>
              <strong>{score.dimensions.technical}</strong>
              <span className="score-dim-strip-w">×50%</span>
            </div>
            <div className="score-dim-strip-bar">
              <div className="score-dim-strip-fill" style={{ width: `${score.dimensions.technical}%`, background: DIM_COLORS['技术面'] }} />
            </div>
          </div>
          <div className="score-dim-strip-item">
            <div className="score-dim-strip-head">
              <span style={{ color: DIM_COLORS['基本面'] }}>基本面</span>
              <strong>{score.dimensions.fundamental}</strong>
              <span className="score-dim-strip-w">×30%</span>
            </div>
            <div className="score-dim-strip-bar">
              <div className="score-dim-strip-fill" style={{ width: `${score.dimensions.fundamental}%`, background: DIM_COLORS['基本面'] }} />
            </div>
          </div>
          <div className="score-dim-strip-item">
            <div className="score-dim-strip-head">
              <span style={{ color: DIM_COLORS['风险面'] }}>风险面</span>
              <strong>{score.dimensions.risk}</strong>
              <span className="score-dim-strip-w">×20%</span>
            </div>
            <div className="score-dim-strip-bar">
              <div className="score-dim-strip-fill" style={{ width: `${score.dimensions.risk}%`, background: DIM_COLORS['风险面'] }} />
            </div>
          </div>
        </div>

        {/* 雷达图 */}
        <div className="score-radar-section">
          <RadarChart
            technical={score.dimensions.technical}
            fundamental={score.dimensions.fundamental}
            risk={score.dimensions.risk}
          />
        </div>

        {score.warnings.length > 0 && (
          <div className="score-warnings-bar">
            {score.warnings.map((w, i) => (
              <span key={i} className="score-warning-chip">{w}</span>
            ))}
          </div>
        )}

        {/* 指标明细表 */}
        <div className="score-table-wrap">
          <table className="score-table">
            <thead>
              <tr>
                <th>指标</th>
                <th>维度</th>
                <th>得分</th>
                <th>量化规则</th>
              </tr>
            </thead>
            <tbody>
              {INDICATORS.map((meta) => {
                const val = score.breakdown[meta.key];
                return (
                  <tr key={meta.key}>
                    <td className="score-table-name">{meta.name}</td>
                    <td>
                      <span className="score-table-dim" style={{ background: DIM_COLORS[meta.dimension], color: '#fff' }}>
                        {meta.dimension}
                      </span>
                    </td>
                    <td className="score-table-score">
                      <div className="score-table-bar-track">
                        <div className="score-table-bar-fill" style={{ width: `${val}%`, background: ratingColor }} />
                      </div>
                      <span>{val}</span>
                    </td>
                    <td className="score-table-formula">{meta.formula}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

// ---- 雷达图 ----

function RadarChart({ technical, fundamental, risk }: {
  technical: number;
  fundamental: number;
  risk: number;
}) {
  const size = 220;
  const cx = size / 2;
  const cy = size / 2;
  const maxR = 85;

  const axes = [
    { label: '技术', angle: -90, value: technical, color: '#e45555' },
    { label: '基本面', angle: 30, value: fundamental, color: '#3b82f6' },
    { label: '风险', angle: 150, value: risk, color: '#f59e0b' },
  ];

  const toXY = (angleDeg: number, value: number) => {
    const rad = (angleDeg * Math.PI) / 180;
    const r = (value / 100) * maxR;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  };

  const gridLevels = [33, 66, 100];
  const gridPolygons = gridLevels.map((level) => {
    const pts = axes.map((a) => { const p = toXY(a.angle, level); return `${p.x},${p.y}`; });
    return pts.join(' ');
  });

  const dataPts = axes.map((a) => { const p = toXY(a.angle, a.value); return `${p.x},${p.y}`; }).join(' ');

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="score-radar-svg">
      {gridPolygons.map((pts, i) => (
        <polygon key={`g-${i}`} points={pts} fill="none" stroke="var(--border-2)" strokeWidth="1" />
      ))}
      {axes.map((a, i) => {
        const ep = toXY(a.angle, 108);
        return <line key={`l-${i}`} x1={cx} y1={cy} x2={ep.x} y2={ep.y} stroke="var(--border-2)" strokeWidth="0.5" />;
      })}
      <polygon points={dataPts} fill="rgba(59,130,246,0.12)" stroke="rgba(59,130,246,0.4)" strokeWidth="1.5" />
      {axes.map((a, i) => {
        const p = toXY(a.angle, a.value);
        return <circle key={`d-${i}`} cx={p.x} cy={p.y} r="4" fill={a.color} stroke="var(--bg-0)" strokeWidth="1.5" />;
      })}
      {axes.map((a, i) => {
        const ep = toXY(a.angle, 108);
        let dx = 0, dy = 0;
        if (a.angle === -90) dy = -12;
        else if (a.angle === 30) { dy = 8; dx = 8; }
        else { dy = 8; dx = -8; }
        return (
          <text key={`t-${i}`} x={ep.x + dx} y={ep.y + dy} textAnchor="middle" fill="var(--text-1)" fontSize="11" fontWeight="500">
            {a.label}
          </text>
        );
      })}
    </svg>
  );
}
