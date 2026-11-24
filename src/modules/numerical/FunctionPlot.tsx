import { useEffect, useId, useRef, useState } from 'react';

interface Point {
  x: number;
  y: number;
}

interface PlotProps {
  segments: Point[][];
  expression: string;
  min: number;
  max: number;
}

// When the endpoints have opposite signs, their difference can overflow.
function fraction(value: number, low: number, high: number) {
  const range = high - low;
  return Number.isFinite(range) ? (value - low) / range :
    (value / 2 - low / 2) / (high / 2 - low / 2);
}

function interpolate(low: number, high: number, ratio: number) {
  if (ratio === 0) return low;
  if (ratio === 1) return high;
  return low < 0 && high > 0 ? low * (1 - ratio) + high * ratio : low + (high - low) * ratio;
}

function ticks(low: number, high: number, intervals: number) {
  const values = Array.from({ length: intervals + 1 }, (_, i) => interpolate(low, high, i / intervals));
  const step = Math.abs(values[1] - values[0]);
  return [...new Set(values)].map((value) => {
    const magnitude = Math.abs(value);
    let label = '0';
    if (magnitude !== 0 && !(low <= 0 && high >= 0 && magnitude < step * 1e-10)) {
      const precision = Math.min(17, Math.max(3, Math.ceil(Math.log10(magnitude) - Math.log10(step || magnitude)) + 2));
      label = value.toLocaleString('ru-RU', {
        maximumSignificantDigits: precision,
        useGrouping: false,
        notation: magnitude >= 100000 || magnitude < 0.001 ? 'scientific' : 'standard',
      });
    }
    return { value, label };
  });
}

export default function FunctionPlot({ segments, expression, min, max }: PlotProps) {
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(520);
  const [showFullRange, setShowFullRange] = useState(false);
  const id = useId();
  useEffect(() => {
    const node = container.current;
    if (!node) return;
    const resize = () => setWidth(Math.max(220, Math.round(node.getBoundingClientRect().width)));
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const valid = segments.filter((segment) => segment.length > 0);
  if (!valid.length || !Number.isFinite(min) || !Number.isFinite(max) || min >= max) {
    return <p className="numerical-empty">На выбранном интервале нет точек графика.</p>;
  }
  let low = Infinity;
  let high = -Infinity;
  // Use equally spaced x bins, since adaptive sampling places many points near poles.
  const bins: (Point | undefined)[] = Array.from({ length: 64 });
  for (const segment of valid) {
    for (const point of segment) {
      low = Math.min(low, point.y);
      high = Math.max(high, point.y);
      const index = Math.max(0, Math.min(bins.length - 1, Math.floor(fraction(point.x, min, max) * bins.length)));
      const center = interpolate(min, max, (index + 0.5) / bins.length);
      const previous = bins[index];
      if (!previous || Math.abs(point.x - center) < Math.abs(previous.x - center)) bins[index] = point;
    }
  }
  const typical = bins.flatMap((point) => point ? [point.y] : []).sort((a, b) => a - b);
  const lower = typical[Math.floor(typical.length * .05)];
  const upper = typical[Math.floor(typical.length * .95)];
  const spread = upper - lower;
  const trimLow = typical.length >= 12 && spread > 0 && lower - low > 8 * spread;
  const trimHigh = typical.length >= 12 && spread > 0 && high - upper > 8 * spread;
  if (!showFullRange && trimLow) low = lower - spread * .3;
  if (!showFullRange && trimHigh) high = upper + spread * .3;
  const padding = high === low ? (Math.abs(high) * 0.1 || 1) : (high * 0.06 - low * 0.06);
  const yMin = Number.isFinite(low - padding) ? low - padding : low;
  const yMax = Number.isFinite(high + padding) ? high + padding : high;
  const yTicks = ticks(yMin, yMax, 4);
  const xTicks = ticks(min, max, width < 440 ? 3 : 4);
  const height = width < 440 ? 240 : 290;
  const left = Math.min(width * 0.28, Math.max(34, ...yTicks.map((tick) => 8 + tick.label.length * 7)));
  const right = width - 12;
  const top = 18;
  const bottom = height - 29;
  const px = (x: number) => left + fraction(x, min, max) * (right - left);
  const py = (y: number) => bottom - Math.max(-10, Math.min(11, fraction(y, yMin, yMax))) * (bottom - top);
  return <div ref={container} className="numerical-plot">
    <svg viewBox={'0 0 ' + width + ' ' + height} role="img" aria-labelledby={id + '-title ' + id + '-desc'}>
      <title id={id + '-title'}>График y = {expression}</title>
      <desc id={id + '-desc'}>По горизонтали x от {min} до {max}.
        {' '}По вертикали y от {yTicks[0].label} до {yTicks[yTicks.length - 1].label}.
        {' '}Отдельных линий на графике — {valid.filter((points) => points.length > 1).length}.</desc>
      <defs><clipPath id={id + '-clip'}><rect x={left} y={top} width={right - left} height={bottom - top} /></clipPath></defs>
      <rect x={left} y={top} width={right - left} height={bottom - top} fill="#f8faff" />
      {xTicks.map(({ value, label }, index) => <g key={value}>
        <line x1={px(value)} x2={px(value)} y1={top} y2={bottom} className="plot-grid-line" />
        <text x={px(value)} y={bottom + 18}
          textAnchor={index === 0 ? 'start' : index === xTicks.length - 1 ? 'end' : 'middle'}>{label}</text>
      </g>)}
      {yTicks.map(({ value, label }) => <g key={value}>
        <line x1={left} x2={right} y1={py(value)} y2={py(value)} className="plot-grid-line" />
        <text x={left - 6} y={py(value)} textAnchor="end" dominantBaseline="middle">{label}</text>
      </g>)}
      {min <= 0 && max >= 0 && <line x1={px(0)} x2={px(0)} y1={top} y2={bottom} className="plot-axis-line" />}
      {yMin <= 0 && yMax >= 0 && <line x1={left} x2={right} y1={py(0)} y2={py(0)} className="plot-axis-line" />}
      <g clipPath={'url(#' + id + '-clip)'}>
        {valid.map((points, index) => points.length === 1 ?
          <circle key={index} cx={px(points[0].x)} cy={py(points[0].y)} r={2.25} fill="var(--accent)" /> :
          <polyline key={index} points={points.map((point) => px(point.x).toFixed(2) + ',' + py(point.y).toFixed(2)).join(' ')}
            fill="none" stroke="var(--accent)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />)}
      </g>
      <text x={right} y={bottom - 5} textAnchor="end" className="plot-axis-name">x</text>
      <text x={left} y={top - 6} className="plot-axis-name">y</text>
    </svg>
    {(trimLow || trimHigh) && <button type="button" className="plot-range-button" aria-pressed={showFullRange}
      onClick={() => setShowFullRange(!showFullRange)}>
      {showFullRange ? 'Увеличить основную часть графика' : 'Показать весь диапазон y'}
    </button>}
  </div>;
}
