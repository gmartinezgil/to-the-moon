export function Sparkline({
  points,
  color = '#22c55e',
  height = 80,
}: {
  points: number[];
  color?: string;
  height?: number;
}) {
  if (points.length === 0) return <div style={{ height }} />;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const W = 100;
  const H = 40;
  const coords = points.map((p, i) => ({
    x: (i / (points.length - 1)) * W,
    y: H - 3 - ((p - min) / span) * (H - 6),
  }));
  const line = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x},${c.y}`).join(' ');
  const area = `${line} L${W},${H} L0,${H} Z`;
  return (
    <div className="relative w-full" style={{ height }}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
        <path d={area} fill={`${color}22`} />
        <path d={line} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" />
      </svg>
    </div>
  );
}
