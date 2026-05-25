type Props = {
  dimensions: Record<string, number>;
  labels: Record<string, string>;
  size?: number;
  className?: string;
};

export default function RadarChart({ dimensions, labels, size = 180, className }: Props) {
  const keys = Object.keys(dimensions).filter((k) => dimensions[k] !== undefined);
  const n = keys.length;
  const center = size / 2;
  const radius = (size / 2) - 20;
  const levels = 5;

  function angle(i: number): number {
    return (Math.PI * 2 * i) / n - Math.PI / 2;
  }

  function polar(level: number, i: number): [number, number] {
    const r = (radius * level) / levels;
    return [center + r * Math.cos(angle(i)), center + r * Math.sin(angle(i))];
  }

  const gridPolygons = Array.from({ length: levels }, (_, l) => {
    const pts = Array.from({ length: n }, (__, i) => {
      const [x, y] = polar(l + 1, i);
      return `${x},${y}`;
    }).join(' ');
    return pts;
  });

  const dataPoints = keys.map((k, i) => {
    const value = Math.max(0, Math.min(100, dimensions[k] ?? 0));
    const [x, y] = polar((value / 100) * levels, i);
    return { x, y, key: k };
  });

  const dataPoly = dataPoints.map((p) => `${p.x},${p.y}`).join(' ');

  const axisLines = Array.from({ length: n }, (_, i) => {
    const [x, y] = polar(levels, i);
    return { x1: center, y1: center, x2: x, y2: y };
  });

  const labelPositions = keys.map((k, i) => {
    const [lx, ly] = polar(levels + 0.6, i);
    return { key: k, label: labels[k] ?? k, x: lx, y: ly };
  });

  return (
    <svg width={size} height={size} className={className} viewBox={`0 0 ${size} ${size}`}>
      {gridPolygons.map((pts, i) => (
        <polygon
          key={i}
          points={pts}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.12}
          strokeWidth="0.5"
        />
      ))}
      {axisLines.map((a, i) => (
        <line
          key={i}
          x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2}
          stroke="currentColor" strokeOpacity={0.1} strokeWidth="0.5"
        />
      ))}
      <polygon
        points={dataPoly}
        fill="currentColor"
        fillOpacity={0.1}
        stroke="currentColor"
        strokeOpacity={0.4}
        strokeWidth="1.5"
      />
      {dataPoints.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="2.5" fill="currentColor" opacity={0.7} />
      ))}
      {labelPositions.map((lp, i) => (
        <text
          key={i}
          x={lp.x} y={lp.y}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize="9"
          fill="currentColor"
          opacity={0.6}
        >
          {lp.label}
        </text>
      ))}
    </svg>
  );
}
