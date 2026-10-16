import { useMemo, useState } from 'react';
import type { BudgetState } from '../../state/model';
import { fmt, projectSavings, type Budget } from '../../tax/budget';
import { ChartCard, compact, niceScale, useWidth } from './common';

const H = 230;
const M = { l: 52, r: 14, t: 14, b: 30 };

export function ProjectionChart({ state, b }: { state: BudgetState; b: Budget }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hoverI, setHoverI] = useState<number | null>(null);
  const data = useMemo(() => projectSavings(state, b), [state, b]);
  const last = data[data.length - 1];
  const years = data.length - 1;

  const yScale = niceScale(last.balance, 4);
  const iw = width - M.l - M.r;
  const ih = H - M.t - M.b;
  const x = (yr: number) => M.l + (yr / years) * iw;
  const y = (v: number) => M.t + ih - (v / yScale.max) * ih;

  const line = (key: 'balance' | 'contributed') =>
    data.map((d, i) => `${i ? 'L' : 'M'}${x(d.year).toFixed(1)},${y(d[key]).toFixed(1)}`).join('');
  const area = `${line('balance')}L${x(years)},${y(0)}L${x(0)},${y(0)}Z`;

  const hover = hoverI != null ? data[hoverI] : null;
  const yTicks = Array.from({ length: Math.round(yScale.max / yScale.step) + 1 }, (_, i) => i * yScale.step);
  const xStep = years <= 10 ? 1 : years <= 25 ? 5 : 10;
  const xTicks = data.filter((d) => d.year % xStep === 0).map((d) => d.year);

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setHoverI(Math.round(((e.clientX - rect.left) / rect.width) * years));
  };

  const empty = last.contributed <= 0;

  return (
    <ChartCard
      id="growth"
      title="Savings growth"
      subtitle={
        empty
          ? undefined
          : `${fmt(last.balance)} after ${years} years at ${state.settings.returnRate}%, including employer contributions. Salary, limits and your savings stay fixed.`
      }
      legend={[
        { label: 'Projected balance', color: 'var(--s-savings)', line: true },
        { label: 'Total contributed', color: 'var(--ink-3)', line: true },
      ]}
      table={{
        head: ['Year', 'Contributed', 'Growth', 'Balance'],
        rows: data.filter((d) => d.year > 0 && (d.year % xStep === 0 || d.year === years)).map((d) => [`Year ${d.year}`, fmt(d.contributed), fmt(d.growth), fmt(d.balance)]),
      }}
    >
      {empty ? (
        <p className="chart-empty">Add RRSP, FHSA, TFSA or other contributions to project their growth. Set the return rate under Assumptions.</p>
      ) : (
        <div className="chart-box" ref={ref}>
          <svg width={width} height={H} role="img" aria-label="Area chart of projected savings balance by year">
            {yTicks.map((t) => (
              <g key={t}>
                <line className="grid" x1={M.l} x2={width - M.r} y1={y(t)} y2={y(t)} />
                <text className="tick" x={M.l - 8} y={y(t)} dy="0.32em" textAnchor="end">
                  {t === 0 ? '0' : compact(t)}
                </text>
              </g>
            ))}
            {xTicks.map((t) => (
              <text key={t} className="tick" x={x(t)} y={H - 8} textAnchor={t === 0 ? 'start' : t === years ? 'end' : 'middle'}>
                {t === 0 ? 'Now' : `Yr ${t}`}
              </text>
            ))}
            <line className="axis" x1={M.l} x2={width - M.r} y1={y(0)} y2={y(0)} />
            <path d={area} className="series-area" style={{ fill: 'var(--s-savings)' }} />
            <path d={line('contributed')} className="series-line" style={{ stroke: 'var(--ink-3)' }} />
            <path d={line('balance')} className="series-line" style={{ stroke: 'var(--s-savings)' }} />
            <circle cx={x(years)} cy={y(last.balance)} r={5} className="end-dot" style={{ fill: 'var(--s-savings)' }} />

            {hover && (
              <g className="crosshair">
                <line x1={x(hover.year)} x2={x(hover.year)} y1={M.t} y2={y(0)} />
                <circle cx={x(hover.year)} cy={y(hover.balance)} r={4} style={{ fill: 'var(--s-savings)' }} />
                <circle cx={x(hover.year)} cy={y(hover.contributed)} r={4} style={{ fill: 'var(--ink-3)' }} />
              </g>
            )}
            <rect
              x={M.l}
              y={M.t}
              width={iw}
              height={ih}
              fill="transparent"
              onPointerDown={onMove}
              onPointerMove={onMove}
              onPointerLeave={(e) => e.pointerType !== 'touch' && setHoverI(null)}
            />
          </svg>
          {hover && (
            <div className="tip floating" role="tooltip" style={{ left: Math.min(x(hover.year) + 12, width - 180), top: M.t }}>
              <strong>{hover.year === 0 ? 'Today' : `Year ${hover.year}`}</strong>
              <span>Balance {fmt(hover.balance)}</span>
              <span>Contributed {fmt(hover.contributed)}</span>
              <span>Growth {fmt(hover.growth)}</span>
            </div>
          )}
        </div>
      )}
    </ChartCard>
  );
}
