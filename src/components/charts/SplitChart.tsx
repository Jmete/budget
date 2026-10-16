import { fmt, type Budget } from '../../tax/budget';
import { ChartCard } from './common';

const KEYS = [
  { key: 'needs', label: 'Needs', color: 'var(--s-essentials)' },
  { key: 'wants', label: 'Wants', color: 'var(--s-lifestyle)' },
  { key: 'savings', label: 'Savings', color: 'var(--s-savings)' },
] as const;

type Key = (typeof KEYS)[number]['key'];
const GUIDE: Record<Key, number> = { needs: 0.5, wants: 0.3, savings: 0.2 };
const percent = (share: number) => `${(share * 100).toFixed(0)}%`;
const monthly = (annual: number) => `${fmt(annual / 12)}/mo`;

/** Only personal savings contributions count toward the 20% target. */
export function SplitChart({ b }: { b: Budget }) {
  const income = b.afterTax;
  const you: Record<Key, number> = {
    needs: b.needs,
    wants: b.wants,
    savings: b.personalContributions,
  };
  const allocated = you.needs + you.wants + you.savings;
  const leftover = Math.max(0, b.unallocated);
  const share = (amount: number) => income > 0 ? amount / income : 0;
  const bars = [
    { name: 'Your plan', values: you, scale: Math.max(income, allocated), remainder: leftover },
    { name: '50/30/20 guide', values: { needs: income * .5, wants: income * .3, savings: income * .2 }, scale: income, remainder: 0 },
  ];

  return (
    <ChartCard
      id="split"
      title="Needs, wants and savings"
      subtitle="50/30/20 of after-tax income, before your payroll savings"
      legend={KEYS.map(k => ({ label: k.label, color: k.color }))}
      table={{
        head: ['Bucket', 'Your plan', 'Your share', 'Guide'],
        rows: [
          ...KEYS.map(k => [k.label, monthly(you[k.key]), percent(share(you[k.key])), percent(GUIDE[k.key])]),
          ...(leftover > 0 ? [['Unallocated', monthly(leftover), percent(share(leftover)), '—']] : []),
        ],
      }}
      footer={
        <>
          {income > 0 && <p className="split-verdict">{verdict(b)}</p>}
          <dl className="split-summary">
            <div><dt>Your planned savings</dt><dd>{monthly(b.personalContributions)}</dd></div>
            <div><dt>Employer contributions</dt><dd>{monthly(b.employerMatch + b.planMatch)}</dd></div>
            <div className="split-total"><dt>Total planned savings</dt><dd>{monthly(b.totalInvested)}</dd></div>
            <div className="split-leftover">
              <dt>{b.unallocated < 0 ? 'Budget shortfall' : 'Left to allocate'}</dt>
              <dd>{monthly(Math.abs(b.unallocated))}</dd>
            </div>
          </dl>
          <p className="split-note">Total savings includes employer contributions. The 20% comparison excludes them and any unallocated cash.</p>
          <details className="split-explainer">
            <summary>How the guide works</summary>
            <p>A budgeting starting point: aim for needs at or below 50%, wants at or below 30%, and savings at or above 20%.</p>
            <p>Savings includes money you set aside or invest, including your payroll pension and savings contributions. All debt payments count as needs.</p>
            <p>This is a savings-only version of the guide. The usual 50/30/20 rule also counts debt payments above the minimum toward its 20% target.</p>
            <p>Unallocated cash is available to save, but is not yet assigned. Meeting the guide does not guarantee you are saving enough for your goals.</p>
            <a href="https://www.nerdwallet.com/finance/learn/how-to-budget" target="_blank" rel="noreferrer">About the 50/30/20 guide ↗</a>
          </details>
        </>
      }
    >
      {income <= 0 ? (
        <p className="chart-empty">Enter your income to compare your plan with the guideline.</p>
      ) : (
        <div className="split">
          {bars.map(bar => (
            <div className="split-row" key={bar.name}>
              <span className="split-name">{bar.name}</span>
              <div className="split-track" role="img" aria-label={`${bar.name}: ${KEYS.map(k => `${k.label} ${percent(share(bar.values[k.key]))}`).join(', ')}${bar.remainder > 0 ? `, unallocated ${percent(share(bar.remainder))}` : ''}`}>
                {KEYS.map(k => {
                  const amount = bar.values[k.key];
                  const label = `${k.label}: ${percent(share(amount))} · ${monthly(amount)}`;
                  return amount > 0 ? (
                    <div key={k.key} className="split-seg" style={{ flexGrow: amount / bar.scale, background: k.color }} title={label}>
                      {amount / bar.scale >= .08 && <span className="split-pct">{percent(share(amount))}</span>}
                    </div>
                  ) : null;
                })}
                {bar.remainder > 0 && <div className="split-seg split-unallocated" style={{ flexGrow: bar.remainder / bar.scale }} title={`Unallocated: ${percent(share(bar.remainder))} · ${monthly(bar.remainder)}`}>
                  {bar.remainder / bar.scale >= .08 && <span className="split-pct">{percent(share(bar.remainder))}</span>}
                </div>}
              </div>
            </div>
          ))}
          {leftover > 0 && <p className="split-remainder"><span className="swatch split-unallocated" aria-hidden="true" />Unallocated · {percent(share(leftover))} available to save or spend</p>}
        </div>
      )}
    </ChartCard>
  );
}

function verdict(b: Budget) {
  if (b.unallocated < -0.5) return `Your plan exceeds after-tax income by ${monthly(-b.unallocated)}. Reduce spending or contributions to balance it.`;
  const savings = b.savingsRate;
  if (savings < .2) return `${monthly(b.afterTax * .2 - b.personalContributions)} more toward savings would reach 20%.`;
  if (b.needs / b.afterTax > .5) return 'Your savings meet 20%; needs are above the 50% guide.';
  if (b.wants / b.afterTax > .3) return 'Your savings meet 20%; wants are above the 30% guide.';
  return 'Your plan meets the 50/30/20 guide.';
}
