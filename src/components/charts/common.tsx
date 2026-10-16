import { useCallback, useRef, useState, type ReactNode } from 'react';

/** Tracks an element's width. A callback ref, so it survives the element mounting later. */
export function useWidth<T extends HTMLElement>(fallback = 320) {
  const [width, setWidth] = useState(fallback);
  const observer = useRef<ResizeObserver | null>(null);
  const ref = useCallback((el: T | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(240, Math.floor(entry.contentRect.width))));
    ro.observe(el);
    observer.current = ro;
  }, []);
  return [ref, width] as const;
}

export interface LegendItem {
  label: string;
  color: string;
  line?: boolean;
  diamond?: boolean;
  hatch?: boolean;
}

export function ChartCard({
  id,
  title,
  subtitle,
  legend,
  table,
  footnote,
  footer,
  actions,
  children,
}: {
  id: string;
  title: string;
  subtitle?: ReactNode;
  legend?: LegendItem[];
  table?: { head: string[]; rows: (string | number)[][] };
  footnote?: ReactNode;
  /** Supporting content kept visible in both chart and table views. */
  footer?: ReactNode;
  /** Controls shown at the right of the title, e.g. a view toggle. */
  actions?: ReactNode;
  children: ReactNode;
}) {
  const [showTable, setShowTable] = useState(false);
  return (
    <section className="panel chart-card" id={id} aria-labelledby={`${id}-title`}>
      <header className={`panel-head ${actions ? 'has-actions' : ''}`}>
        <div className="panel-head-text">
          <h2 id={`${id}-title`}>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {actions}
      </header>
      {legend && legend.length > 1 && (
        <ul className="chart-legend">
          {legend.map((l) => (
            <li key={l.label}>
              <span
                className={`swatch ${l.line ? 'line' : ''} ${l.hatch ? 'hatch' : ''} ${l.diamond ? 'diamond' : ''}`}
                style={{ background: l.hatch ? undefined : l.color }}
                aria-hidden="true"
              />
              {l.label}
            </li>
          ))}
        </ul>
      )}
      {showTable && table ? (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                {table.head.map((h, i) => (
                  <th key={h} scope="col" className={i ? 'r' : ''}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) => (j === 0 ? <th key={j} scope="row">{c}</th> : <td key={j} className="r">{c}</td>))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        children
      )}
      {footnote && !showTable && <p className="chart-footnote">{footnote}</p>}
      {table && (
        <button type="button" className="link-btn" aria-pressed={showTable} onClick={() => setShowTable((v) => !v)}>
          {showTable ? 'Show chart' : 'Show as table'}
        </button>
      )}
      {footer}
    </section>
  );
}

/** Rounded "nice" axis maximum and tick step. */
export function niceScale(max: number, ticks = 4) {
  if (max <= 0) return { max: 1, step: 1 / ticks };
  const raw = max / ticks;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  return { max: Math.ceil(max / step) * step, step };
}

export const compact = (n: number) =>
  new Intl.NumberFormat('en-CA', { notation: 'compact', maximumFractionDigits: 1, style: 'currency', currency: 'CAD' }).format(n);
