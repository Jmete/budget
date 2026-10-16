import { useEffect, useMemo, useState } from 'react';
import { fmt } from '../../tax/budget';
import { ChartCard } from './common';

export interface BreakdownNode {
  key: string;
  label: string;
  /** Annual C$. */
  value: number;
  color?: string;
  children?: BreakdownNode[];
}

type View = 'pie' | 'bar';

const PIE_MAX = 6; // slices before the tail folds into "Other"
const pct = (v: number, total: number) => (total > 0 ? (v / total) * 100 : 0);
const pctText = (v: number, total: number) => {
  const p = pct(v, total);
  return p > 0 && p < 1 ? '<1%' : `${p.toFixed(0)}%`;
};

interface Slice {
  key: string;
  label: string;
  value: number;
  color: string;
  node?: BreakdownNode;
  drillable: boolean;
  folded?: number; // number of items folded into "Other"
}

/** Items below the top level wear shades of their parent's colour, largest darkest. */
function shade(base: string, rank: number, count: number) {
  if (count <= 1) return base;
  const strength = 100 - Math.round((rank / (count - 1)) * 62);
  return `color-mix(in oklab, ${base} ${strength}%, var(--panel))`;
}

function positive(nodes: BreakdownNode[] | undefined) {
  return (nodes ?? []).filter((n) => n.value > 0.5).sort((a, b) => b.value - a.value);
}

export function BreakdownChart({
  id,
  title,
  root,
  rootLabel,
  emptyText,
}: {
  id: string;
  title: string;
  root: BreakdownNode;
  rootLabel: string;
  emptyText: string;
}) {
  const storageKey = `tb.view.${id}`;
  const [view, setView] = useState<View>(() => {
    try {
      return localStorage.getItem(storageKey) === 'bar' ? 'bar' : 'pie';
    } catch {
      return 'pie';
    }
  });
  const [path, setPath] = useState<string[]>([]);
  const [hover, setHover] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, view);
    } catch {
      /* ignore */
    }
  }, [storageKey, view]);

  // Walk the path; if data changed underneath us (row deleted), stop at the deepest valid node.
  const trail = useMemo(() => {
    const t: BreakdownNode[] = [root];
    for (const key of path) {
      const next = positive(t[t.length - 1].children).find((c) => c.key === key);
      if (!next) break;
      t.push(next);
    }
    return t;
  }, [root, path]);
  const node = trail[trail.length - 1];
  const baseColor = trail.find((n) => n.color)?.color;

  const items: Slice[] = useMemo(() => {
    const kids = positive(node.children);
    return kids.map((k, i) => ({
      key: k.key,
      label: k.label,
      value: k.value,
      color: k.color ?? (baseColor ? shade(baseColor, i, kids.length) : 'var(--s-savings)'),
      node: k,
      drillable: positive(k.children).length > 0,
    }));
  }, [node, baseColor]);

  const total = items.reduce((s, x) => s + x.value, 0);
  const pieItems: Slice[] =
    items.length > PIE_MAX
      ? [
          ...items.slice(0, PIE_MAX - 1),
          {
            key: '__other',
            label: `Other (${items.length - PIE_MAX + 1})`,
            value: items.slice(PIE_MAX - 1).reduce((s, x) => s + x.value, 0),
            color: 'var(--s-left)',
            drillable: false,
            folded: items.length - PIE_MAX + 1,
          },
        ]
      : items;

  const drill = (s: Slice) => {
    if (s.drillable) {
      setPath(trail.slice(1).map((n) => n.key).concat(s.key));
      setHover(null);
    } else if (s.folded) {
      setView('bar');
    }
  };

  const shareOfParent = trail.length > 1 && trail[0].value > 0 ? node.value / trail[0].value : null;

  return (
    <ChartCard
      id={id}
      title={title}
      subtitle={
        total > 0
          ? `${fmt(total / 12)} a month${shareOfParent != null ? `, ${(shareOfParent * 100).toFixed(0)}% of ${rootLabel.toLowerCase()}` : ''}. ${
              items.some((i) => i.drillable) ? 'Select a segment to drill down.' : ''
            }`
          : undefined
      }
      table={{
        head: ['Item', 'Monthly', 'Yearly', 'Share'],
        rows: items.map((s) => [s.label, fmt(s.value / 12), fmt(s.value), pctText(s.value, total)]),
      }}
      actions={
        <div className="seg" role="group" aria-label="Chart type">
          {(['pie', 'bar'] as const).map((v) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}>
              {v === 'pie' ? 'Pie' : 'Bar'}
            </button>
          ))}
        </div>
      }
    >
      <nav className="crumbs" aria-label={`${title} level`}>
        {trail.map((n, i) => (
          <span key={n.key} className="crumb">
            {i > 0 && <span className="crumb-sep" aria-hidden="true">/</span>}
            {i < trail.length - 1 ? (
              <button type="button" onClick={() => setPath(path.slice(0, i))}>
                {i === 0 ? rootLabel : n.label}
              </button>
            ) : (
              <span aria-current="page">{i === 0 ? rootLabel : n.label}</span>
            )}
          </span>
        ))}
      </nav>

      {total <= 0 ? (
        <p className="chart-empty">{emptyText}</p>
      ) : view === 'pie' ? (
        <div className="pie-wrap">
          <Pie slices={pieItems} total={total} hover={hover} setHover={setHover} onPick={drill} />
          <ul className="pie-legend">
            {pieItems.map((s) => (
              <li key={s.key} className={hover && hover !== s.key ? 'dim' : ''}>
                <button
                  type="button"
                  className="legend-btn"
                  disabled={!s.drillable && !s.folded}
                  onMouseEnter={() => setHover(s.key)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(s.key)}
                  onBlur={() => setHover(null)}
                  onClick={() => drill(s)}
                  title={s.drillable ? `Show ${s.label} breakdown` : s.folded ? 'Show all items as bars' : undefined}
                >
                  <span className="swatch" style={{ background: s.color }} aria-hidden="true" />
                  <span className="legend-label">{s.label}</span>
                  <span className="legend-value">{fmt(s.value / 12)}</span>
                  <span className="legend-pct">{pctText(s.value, total)}</span>
                  <Chevron show={s.drillable} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <ul className="bbars">
          {items.map((s) => (
            <li key={s.key} className={hover && hover !== s.key ? 'dim' : ''}>
              <button
                type="button"
                className="bbar"
                disabled={!s.drillable}
                onMouseEnter={() => setHover(s.key)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(s.key)}
                onBlur={() => setHover(null)}
                onClick={() => drill(s)}
                title={s.drillable ? `Show ${s.label} breakdown` : undefined}
              >
                <span className="bbar-label">{s.label}</span>
                <span className="bbar-track">
                  <span className="bbar-fill" style={{ width: `${(s.value / items[0].value) * 100}%`, background: s.color }} />
                </span>
                <span className="bbar-value">{fmt(s.value / 12)}</span>
                <span className="bbar-pct">{pctText(s.value, total)}</span>
                <Chevron show={s.drillable} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </ChartCard>
  );
}

function Chevron({ show }: { show: boolean }) {
  return (
    <svg className={`chev ${show ? '' : 'hidden'}`} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M6 3.5 10.5 8 6 12.5" />
    </svg>
  );
}

const SIZE = 196;
const R = 94;
const INNER = 58;

function arcPath(a0: number, a1: number) {
  const pt = (r: number, a: number) => `${(SIZE / 2 + r * Math.sin(a)).toFixed(2)},${(SIZE / 2 - r * Math.cos(a)).toFixed(2)}`;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M${pt(R, a0)}A${R},${R} 0 ${large} 1 ${pt(R, a1)}L${pt(INNER, a1)}A${INNER},${INNER} 0 ${large} 0 ${pt(INNER, a0)}Z`;
}

function Pie({
  slices,
  total,
  hover,
  setHover,
  onPick,
}: {
  slices: Slice[];
  total: number;
  hover: string | null;
  setHover: (k: string | null) => void;
  onPick: (s: Slice) => void;
}) {
  let a = 0;
  const arcs = slices.map((s) => {
    const a0 = a;
    a += (s.value / total) * Math.PI * 2;
    return { s, a0, a1: a };
  });
  const active = arcs.find((x) => x.s.key === hover)?.s;

  return (
    <div className="pie">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE} role="img" aria-label="Pie chart. Values are listed in the legend.">
        {arcs.length === 1 ? (
          <g
            className={`pie-slice ${arcs[0].s.drillable ? 'drillable' : ''}`}
            onMouseEnter={() => setHover(arcs[0].s.key)}
            onMouseLeave={() => setHover(null)}
            onClick={() => onPick(arcs[0].s)}
          >
            <circle cx={SIZE / 2} cy={SIZE / 2} r={(R + INNER) / 2} fill="none" style={{ stroke: arcs[0].s.color }} strokeWidth={R - INNER} />
          </g>
        ) : (
          arcs.map(({ s, a0, a1 }) => (
            <path
              key={s.key}
              d={arcPath(a0, a1)}
              className={`pie-slice ${s.drillable || s.folded ? 'drillable' : ''} ${hover && hover !== s.key ? 'dim' : ''}`}
              style={{ fill: s.color }}
              onMouseEnter={() => setHover(s.key)}
              onMouseLeave={() => setHover(null)}
              onClick={() => onPick(s)}
            />
          ))
        )}
      </svg>
      <div className="pie-center" aria-hidden="true">
        {active ? (
          <>
            <strong>{pctText(active.value, total)}</strong>
            <span>{fmt(active.value / 12)}/mo</span>
          </>
        ) : (
          <>
            <strong>{fmt(total / 12)}</strong>
            <span>per month</span>
          </>
        )}
      </div>
    </div>
  );
}
