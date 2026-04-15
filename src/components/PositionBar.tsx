interface PositionBarProps {
  ratio: number;
}

export function PositionBar({ ratio }: PositionBarProps) {
  if (ratio <= 0) {
    return <span className="text-xs text-gray-400">-</span>;
  }

  return (
    <div>
      <div className="w-12 h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-primary-500 rounded-full"
          style={{ width: `${Math.min(ratio, 100)}%` }}
        />
      </div>
      <div className="text-xs text-gray-500 mt-1">{ratio.toFixed(1)}%</div>
    </div>
  );
}
