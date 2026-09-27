import { useMemo, useState } from 'react';
import type { BudgetState } from '../../state/model';
import { fmt, HEALTH_PREMIUM_STEPS, rateCurve, type Budget } from '../../tax/budget';
import { ChartCard, compact, niceScale, useWidth } from './common';

const H = 230;
const M = { l: 44, r: 14, t: 14, b: 30 };

export function RateChart({ state, b }: { state: BudgetState; b: Budget }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hoverI, setHoverI] = useState<number | null>(null);

  const you = b.tax.taxableIncome;
  const before = b.taxNoDeductions.taxableIncome;
  const xScale = niceScale(Math.max(200000, Math.max(you, before) * 1.35), 4);
  const data = useMemo(() => rateCurve(state, xScale.max), [state, xScale.max]);
  const yScale = niceScale(Math.max(...data.map((d) => d.marginal)) * 1.05, 4);

  const iw = width - M.l - M.r;
  const ih = H - M.t - M.b;
  const x = (v: number) => M.l + (v / xScale.max) * iw;
  const y = (v: number) => M.t + ih - (Math.max(0, v) / yScale.max) * ih;

  const path = (key: 'marginal' | 'average') =>
    data.map((d, i) => `${i ? 'L' : 'M'}${x(d.income).toFixed(1)},${y(d[key]).toFixed(1)}`).join('');
  // Marginal rates change in steps, so draw them as a step line.
  const stepPath = data
    .map((d, i) => (i ? `H${x(d.income).toFixed(1)}V${y(d.marginal).toFixed(1)}` : `M${x(d.income).toFixed(1)},${y(d.marginal).toFixed(1)}`))
    .join('');

  const at = (inc: number) => data[Math.min(data.length - 1, Math.max(0, Math.round((inc / xScale.max) * data.length) - 1))];
  const hover = hoverI != null ? data[hoverI] : null;
  const showBefore = before - you > 500;

  const xTicks = Array.from({ length: Math.round(xScale.max / xScale.step) + 1 }, (_, i) => i * xScale.step);
  const yTicks = Array.from({ length: Math.round(yScale.max / yScale.step) + 1 }, (_, i) => i * yScale.step);

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const inc = ((e.clientX - rect.left) / rect.width) * xScale.max;
    setHoverI(Math.min(data.length - 1, Math.max(0, Math.round((inc / xScale.max) * data.length) - 1)));
  };

  const youPoint = at(you);
  const steps = HEALTH_PREMIUM_STEPS.filter((st) => st.from < xScale.max);
  // A Health Premium step is "hovered" when the pointer is within a few pixels of its marker.
  const hoverStep = hover ? steps.find((st) => Math.abs(x(hover.income) - x(st.from)) < 7) : undefined;

  return (
    <ChartCard
      id="rates"
      title="Your tax rates"
      subtitle={
        you > 0
          ? `At ${fmt(you)} taxable income, your next dollar is taxed at ${(youPoint.marginal * 100).toFixed(1)}% and you pay ${(youPoint.average * 100).toFixed(1)}% on average.`
          : 'Federal and Ontario income tax on taxable income, excluding CPP and EI.'
      }
      footnote={
        'Marginal rate is the combined federal and Ontario bracket rate, including the Ontario surtax. Diamonds mark where the Ontario Health Premium steps up, briefly adding 6–25% over a narrow income band (C$150–300 in total). The average rate includes everything.'
      }
      legend={[
        { label: 'Marginal rate', color: 'var(--s-tax)', line: true },
        { label: 'Average rate', color: 'var(--s-savings)', line: true },
        { label: 'Health Premium step', color: 'var(--ink-3)', diamond: true },
      ]}
      table={{
        head: ['Taxable income', 'Marginal', 'Average'],
        rows: data.filter((_, i) => (i + 1) % 20 === 0).map((d) => [fmt(d.income), `${(d.marginal * 100).toFixed(1)}%`, `${(d.average * 100).toFixed(1)}%`]),
      }}
    >
      <div className="chart-box" ref={ref}>
        <svg width={width} height={H} role="img" aria-label="Line chart of marginal and average income tax rates by taxable income">
          {yTicks.map((t) => (
            <g key={t}>
              <line className="grid" x1={M.l} x2={width - M.r} y1={y(t)} y2={y(t)} />
              <text className="tick" x={M.l - 8} y={y(t)} dy="0.32em" textAnchor="end">
                {Math.round(t * 100)}%
              </text>
            </g>
          ))}
          {xTicks.map((t) => (
            <text key={t} className="tick" x={x(t)} y={H - 8} textAnchor={t === 0 ? 'start' : t === xScale.max ? 'end' : 'middle'}>
              {t === 0 ? '0' : compact(t)}
            </text>
          ))}
          <line className="axis" x1={M.l} x2={width - M.r} y1={y(0)} y2={y(0)} />

          <path d={path('average')} className="series-line" style={{ stroke: 'var(--s-savings)' }} />
          <path d={stepPath} className="series-line step" style={{ stroke: 'var(--s-tax)' }} />

          {steps.map((st) => (
            <rect
              key={st.from}
              className={`ohp-mark ${hoverStep === st ? 'active' : ''}`}
              x={x(st.from) - 4}
              y={y(0) - 4}
              width={8}
              height={8}
              transform={`rotate(45 ${x(st.from)} ${y(0)})`}
            />
          ))}

          {showBefore && (
            <g className="marker ghost">
              <line x1={x(before)} x2={x(before)} y1={M.t} y2={y(0)} />
              <circle cx={x(before)} cy={y(at(before).marginal)} r={4.5} />
            </g>
          )}
          {you > 0 && you < xScale.max && (
            <g className="marker">
              <line x1={x(you)} x2={x(you)} y1={M.t} y2={y(0)} />
              <circle cx={x(you)} cy={y(youPoint.marginal)} r={5} style={{ fill: 'var(--s-tax)' }} />
              <text x={x(you) - 6} y={y(0) - 8} textAnchor="end" className="marker-label">
                You
              </text>
              {showBefore && (
                <text
                  x={x(before) + (x(before) > width - 120 ? -6 : 6)}
                  y={y(0) - 8}
                  textAnchor={x(before) > width - 120 ? 'end' : 'start'}
                  className="marker-label muted"
                >
                  Before RRSP/FHSA
                </text>
              )}
            </g>
          )}

          {hover && (
            <g className="crosshair">
              <line x1={x(hover.income)} x2={x(hover.income)} y1={M.t} y2={y(0)} />
              <circle cx={x(hover.income)} cy={y(hover.marginal)} r={4} style={{ fill: 'var(--s-tax)' }} />
              <circle cx={x(hover.income)} cy={y(hover.average)} r={4} style={{ fill: 'var(--s-savings)' }} />
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
          <div
            className="tip floating"
            role="tooltip"
            style={{ left: Math.max(0, Math.min(x(hover.income) + 12, width - 230)), top: M.t }}
          >
            <strong>{fmt(hover.income)} taxable</strong>
            <span>Marginal {(hover.marginal * 100).toFixed(1)}%</span>
            <span>Average {(hover.average * 100).toFixed(1)}%</span>
            {hoverStep && (
              <span className="tip-note">
                Health Premium +{fmt(hoverStep.amount)} between {fmt(hoverStep.from)} and {fmt(hoverStep.to)}
              </span>
            )}
          </div>
        )}
      </div>
    </ChartCard>
  );
}
