import { useId } from 'react';
import { formatNumber } from '../../../shared/utils/format';

interface GeometryPreviewProps {
  a: number;
  b: number;
  unit: string;
}

function dimension(value: number): string {
  return formatNumber(value, 2).replace(/,00$/, '').replace(/(,\d)0$/, '$1');
}

export default function GeometryPreview({ a, b, unit }: GeometryPreviewProps) {
  const titleId = `geometry-title-${useId().replace(/:/g, '')}`;
  const ratio = Number.isFinite(a / b) && a > 0 && b > 0
    ? Math.min(2.8, Math.max(0.5, a / b))
    : 2;
  const width = Math.min(310, 128 * ratio);
  const height = width / ratio;
  const left = 260 - width / 2;
  const top = 133 - height / 2;
  const right = left + width;
  const bottom = top + height;
  const upperDimension = top - 24;
  const rightDimension = right + 26;
  const aLabel = `a = ${dimension(a)} ${unit}`;
  const bLabel = `b = ${dimension(b)} ${unit}`;

  return (
    <section className="geometry-panel panel" aria-labelledby={titleId}>
      <header className="geometry-header">
        <h2 id={titleId}>Размеры</h2>
      </header>

      <svg
        viewBox="0 0 520 230"
        role="img"
        aria-label={`Прямоугольник: сторона ${aLabel}, сторона ${bLabel}. Площадь S равна a, умноженному на b. Пунктир обозначает условные границы измерений.`}
        style={{ display: 'block', width: '100%', height: 'auto' }}
      >
        <rect width="520" height="230" fill="#ffffff" />

        <g fill="none" stroke="#94a3b8" strokeWidth="1">
          <path d={`M ${left} ${top - 10} V ${upperDimension - 9}`} />
          <path d={`M ${right} ${top - 10} V ${upperDimension - 9}`} />
          <path d={`M ${right + 10} ${top} H ${rightDimension + 9}`} />
          <path d={`M ${right + 10} ${bottom} H ${rightDimension + 9}`} />
        </g>
        <g fill="none" stroke="#334155" strokeWidth="1">
          <path d={`M ${left} ${upperDimension} H ${right}`} />
          <path d={`M ${left - 4} ${upperDimension + 4} l 8 -8`} />
          <path d={`M ${right - 4} ${upperDimension + 4} l 8 -8`} />
          <path d={`M ${rightDimension} ${top} V ${bottom}`} />
          <path d={`M ${rightDimension - 4} ${top + 4} l 8 -8`} />
          <path d={`M ${rightDimension - 4} ${bottom + 4} l 8 -8`} />
        </g>

        <rect
          x={left - 6}
          y={top - 6}
          width={width + 12}
          height={height + 12}
          fill="none"
          stroke="#cbd5e1"
          strokeWidth="1"
          strokeDasharray="4 4"
        />
        <rect
          x={left}
          y={top}
          width={width}
          height={height}
          fill="#eff4ff"
          stroke="#1d4ed8"
          strokeWidth="1.5"
        />
        <path
          d={`M ${left + 12} ${bottom} V ${bottom - 12} H ${left}`}
          fill="none"
          stroke="#334155"
          strokeWidth="1"
        />
        <g fill="#334155" fontFamily="inherit" fontSize="17">
          <text x="260" y={upperDimension - 8} textAnchor="middle">{aLabel}</text>
          <text
            x={rightDimension + 16}
            y="133"
            textAnchor="middle"
            transform={`rotate(-90 ${rightDimension + 16} 133)`}
          >
            {bLabel}
          </text>
        </g>
        <text
          x="260"
          y="140"
          textAnchor="middle"
          fontFamily="inherit"
          fontSize="22"
          fill="#334155"
        >
          {width < 100 ? 'S' : 'S = a · b'}
        </text>
      </svg>
    </section>
  );
}
