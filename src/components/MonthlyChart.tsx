import { useState } from "react";
import type { MonthlyIncome } from "../lib/api";
import { formatMonth } from "../lib/dates";
import { formatMoney } from "../lib/format";

const W = 800;
const H = 240;
const PAD = { top: 18, right: 20, bottom: 30, left: 42 };

function niceStep(max: number): number {
  if (max <= 4) return 1;
  const rough = max / 4;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const norm = rough / pow;
  const mult = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return Math.max(1, mult * pow);
}

export function MonthlyChart({ data, currency }: { data: MonthlyIncome[]; currency: string }) {
  const [hover, setHover] = useState<number | null>(null);

  if (data.length === 0) return null;

  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const n = data.length;
  const maxClasses = Math.max(1, ...data.map((d) => d.classes));
  const step = niceStep(maxClasses);
  const top = Math.ceil(maxClasses / step) * step;

  const x = (i: number) => (n === 1 ? PAD.left + innerW / 2 : PAD.left + (i / (n - 1)) * innerW);
  const y = (value: number) => PAD.top + innerH * (1 - value / top);
  const baseY = PAD.top + innerH;

  const linePoints = data.map((d, i) => `${x(i)},${y(d.classes)}`).join(" ");
  const areaPath =
    data.length === 1
      ? `M ${x(0)} ${baseY} L ${x(0)} ${y(data[0].classes)} L ${x(0)} ${baseY} Z`
      : `M ${x(0)} ${baseY} L ${linePoints.replace(/ /g, " L ")} L ${x(n - 1)} ${baseY} Z`;

  const ticks: number[] = [];
  for (let value = 0; value <= top; value += step) ticks.push(value);

  const labelEvery = n > 8 ? Math.ceil(n / 8) : 1;

  function handlePointer(event: React.MouseEvent<SVGRectElement>) {
    if (n === 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    const vbX = ratio * W;
    if (n === 1) {
      setHover(0);
      return;
    }
    const index = Math.round(((vbX - PAD.left) / innerW) * (n - 1));
    setHover(Math.min(n - 1, Math.max(0, index)));
  }

  const hovered = hover != null ? data[hover] : null;

  return (
    <div className="chart-line">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Clases por mes">
        {ticks.map((value) => (
          <g key={value}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(value)}
              y2={y(value)}
              className="chart-grid"
            />
            <text x={PAD.left - 10} y={y(value) + 4} className="chart-tick" textAnchor="end">
              {value}
            </text>
          </g>
        ))}

        <path d={areaPath} className="chart-area" />
        <polyline points={linePoints} className="chart-line-path" />

        {data.map((d, i) => (
          <g key={d.month}>
            {hover === i && (
              <line x1={x(i)} x2={x(i)} y1={PAD.top} y2={baseY} className="chart-crosshair" />
            )}
            <circle cx={x(i)} cy={y(d.classes)} r={hover === i ? 5 : 3.5} className="chart-dot" />
            {(i % labelEvery === 0 || i === n - 1) && (
              <text x={x(i)} y={H - 10} className="chart-month" textAnchor="middle">
                {formatMonth(d.month)}
              </text>
            )}
          </g>
        ))}

        {/* biome-ignore lint/a11y/noStaticElementInteractions: capa transparente para detectar el hover del gráfico */}
        <rect
          x={PAD.left}
          y={PAD.top}
          width={innerW}
          height={innerH}
          fill="transparent"
          onMouseMove={handlePointer}
          onMouseLeave={() => setHover(null)}
        />
      </svg>

      {hovered && hover != null && (
        <div
          className="chart-tooltip"
          style={{ left: `${(x(hover) / W) * 100}%`, top: `${(y(hovered.classes) / H) * 100}%` }}
        >
          <strong>{formatMonth(hovered.month)}</strong>
          <span>
            {hovered.classes} clase{hovered.classes === 1 ? "" : "s"}
          </span>
          <span className="muted">{formatMoney(hovered.amount, currency)}</span>
        </div>
      )}
    </div>
  );
}
