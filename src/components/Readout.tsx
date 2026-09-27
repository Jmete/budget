import { useState } from 'react';
import { fmt, type Budget } from '../tax/budget';

const pct = (n: number, d = 1) => `${(n * 100).toFixed(d)}%`;

interface Segment {
  key: string;
  label: string;
  value: number;
  color: string;
  hatch?: boolean;
}

export function allocationSegments(b: Budget): Segment[] {
  return [
    { key: 'tax', label: 'Income tax', value: b.tax.incomeTax + b.tax.foreignTaxPaid, color: 'var(--s-tax)' },
    { key: 'payroll', label: 'CPP & EI', value: b.tax.cppTotal + b.tax.ei, color: 'var(--s-payroll)' },
    { key: 'savings', label: 'Savings & investing', value: b.personalContributions, color: 'var(--s-savings)' },
    { key: 'essentials', label: 'Essentials', value: b.essentials, color: 'var(--s-essentials)' },
    { key: 'lifestyle', label: 'Lifestyle', value: b.lifestyle, color: 'var(--s-lifestyle)' },
    { key: 'left', label: 'Left over', value: Math.max(0, b.unallocated), color: 'var(--s-left)', hatch: true },
  ];
}

export function Readout({ b }: { b: Budget }) {
  const monthlyLeft = b.unallocated / 12;
  const short = monthlyLeft < -0.5;
  const hasIncome = b.grossIncome > 0;
  const marginal = b.salary === 0 && b.consulting > 0 ? b.marginalConsulting : b.marginalSalary;

  return (
    <section className="readout panel" id="summary" aria-labelledby="readout-title">
      <div className="readout-main">
        <h2 id="readout-title" className="readout-label">
          {short ? 'Short each month' : 'Left over each month'}
        </h2>
        <p className={`hero-figure ${short ? 'is-neg' : ''}`} aria-live="polite">
          {fmt(Math.abs(monthlyLeft))}
        </p>
        <p className="readout-sub">
          {hasIncome
            ? short
              ? 'Your savings and expenses are more than your take-home pay. Trim expenses or contributions until this reaches zero.'
              : `After tax, CPP, EI, ${fmt(b.personalContributions / 12)} of savings and ${fmt(b.expenses / 12)} of expenses.`
            : 'Enter your income below to see your take-home pay, taxes and what is left after expenses.'}
        </p>
      </div>

      <dl className="tiles">
        <Tile label="Take-home pay" value={fmt(b.afterTax / 12)} unit="/mo" note={`${fmt(b.afterTax)} a year`} />
        <Tile
          label="Tax, CPP & EI"
          value={fmt(b.tax.totalDeducted / 12)}
          unit="/mo"
          note={`${pct(b.effectiveRate)} of taxable income`}
        />
        <Tile
          label="Marginal rate"
          value={hasIncome ? pct(Math.max(0, marginal)) : '–'}
          note={b.consulting > 0 && b.salary > 0 ? `${pct(b.marginalConsulting)} on next consulting dollar` : 'Tax on your next dollar'}
        />
        <Tile
          label="Saving rate"
          value={pct(b.savingsRate, 0)}
          note={
            b.employerMatch + b.planMatch > 0
              ? `plus ${fmt(b.employerMatch + b.planMatch)}/yr employer match`
              : 'Savings + leftover ÷ take-home'
          }
        />
        <Tile
          label="RRSP & FHSA refund"
          value={fmt(b.deductionSavings)}
          unit="/yr"
          note="Tax saved by your deductions"
        />
        {b.consulting > 0 && (
          <Tile
            label="Set aside for consulting tax"
            value={fmt(b.consultingSetAside / 12)}
            unit="/mo"
            note="Income tax + CPP on consulting income"
          />
        )}
      </dl>

      <AllocationBar b={b} />
    </section>
  );
}

function Tile({ label, value, unit, note }: { label: string; value: string; unit?: string; note?: string }) {
  return (
    <div className="tile">
      <dt>{label}</dt>
      <dd>
        <span className="tile-value">
          {value}
          {unit && <span className="tile-unit">{unit}</span>}
        </span>
        {note && <span className="tile-note">{note}</span>}
      </dd>
    </div>
  );
}

function AllocationBar({ b }: { b: Budget }) {
  const [active, setActive] = useState<string | null>(null);
  const segs = allocationSegments(b);
  const outflow = segs.reduce((s, x) => s + x.value, 0);
  const total = Math.max(b.grossIncome, outflow);
  const shortfall = Math.max(0, -b.unallocated);

  return (
    <figure className="alloc">
      <figcaption>
        <span>Where each dollar of gross income goes</span>
        <span className="alloc-total">{fmt(b.grossIncome)}/yr gross</span>
      </figcaption>
      <div className="alloc-track" role="img" aria-label="Allocation of gross income. Values listed in the legend.">
        {total > 0 ? (
          segs
            .filter((s) => s.value > 0)
            .map((s) => (
              <div
                key={s.key}
                className={`alloc-seg ${s.hatch ? 'hatch' : ''} ${active && active !== s.key ? 'dim' : ''}`}
                style={{ flexGrow: s.value, background: s.hatch ? undefined : s.color }}
                onMouseEnter={() => setActive(s.key)}
                onMouseLeave={() => setActive(null)}
              >
                {active === s.key && (
                  <span className="tip" role="tooltip">
                    <strong>{s.label}</strong>
                    {fmt(s.value / 12)}/mo · {pct(s.value / (b.grossIncome || 1))}
                  </span>
                )}
              </div>
            ))
        ) : (
          <div className="alloc-seg empty" style={{ flexGrow: 1 }} />
        )}
      </div>
      {shortfall > 0 && (
        <p className="alloc-short">
          <span className="status-icon" aria-hidden="true">!</span>
          Outflows exceed income by {fmt(shortfall)}/yr
        </p>
      )}
      <ul className="legend">
        {segs.map((s) => (
          <li
            key={s.key}
            onMouseEnter={() => setActive(s.key)}
            onMouseLeave={() => setActive(null)}
            className={active && active !== s.key ? 'dim' : ''}
          >
            <span className={`swatch ${s.hatch ? 'hatch' : ''}`} style={{ background: s.hatch ? undefined : s.color }} aria-hidden="true" />
            <span className="legend-label">{s.label}</span>
            <span className="legend-value">{fmt(s.value / 12)}/mo</span>
            <span className="legend-pct">{b.grossIncome > 0 ? pct(s.value / b.grossIncome, 0) : '–'}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
