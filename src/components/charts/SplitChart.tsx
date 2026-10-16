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

/** Personal savings contributions plus any unallocated cash count toward the 20% target. */
export function SplitChart({ b }: { b: Budget }) {
  const income = b.afterTax;
  const you: Record<Key, number> = {
    needs: b.needs,
    wants: b.wants,
    savings: savingsTotal(b),
  };
  const allocated = you.needs + you.wants + you.savings;
  const leftover = Math.max(0, b.unallocated);
  const share = (amount: number) => income > 0 ? amount / income : 0;
  const bars = [
    { name: 'Your plan', values: you, scale: Math.max(income, allocated) },
    { name: '50/30/20 guide', values: { needs: income * .5, wants: income * .3, savings: income * .2 }, scale: income },
  ];

  return (
    <ChartCard
      id="split"
      title="Needs, wants and savings"
      subtitle="50/30/20 of after-tax income, before your payroll savings"
      legend={KEYS.map(k => ({ label: k.label, color: k.color }))}
      table={{
        head: ['Bucket', 'Your plan', 'Your share', 'Guide'],
        rows: KEYS.map(k => [k.label, monthly(you[k.key]), percent(share(you[k.key])), percent(GUIDE[k.key])]),
      }}
      footer={
        <>
          {income > 0 && <p className="split-verdict">{verdict(b)}</p>}
          <dl className="split-summary">
            <div><dt>Your planned contributions</dt><dd>{monthly(b.personalContributions)}</dd></div>
            {leftover > 0 && <div><dt>Left over</dt><dd>{monthly(leftover)}</dd></div>}
            <div><dt>Employer contributions</dt><dd>{monthly(b.employerMatch + b.planMatch)}</dd></div>
            <div className="split-total"><dt>Total savings</dt><dd>{monthly(b.totalInvested + leftover)}</dd></div>
            {b.unallocated < -0.5 && (
              <div className="split-leftover"><dt>Budget shortfall</dt><dd>{monthly(-b.unallocated)}</dd></div>
            )}
          </dl>
          <p className="split-note">Savings includes cash left over after spending and contributions. Total savings also includes employer contributions; the 20% comparison excludes them.</p>
          <details className="split-explainer">
            <summary>How the guide works</summary>
            <p>A budgeting starting point: aim for needs at or below 50%, wants at or below 30%, and savings at or above 20%.</p>
            <p>Savings includes money you set aside or invest, including your payroll pension and savings contributions. All debt payments count as needs.</p>
            <p>This is a savings-only version of the guide. The usual 50/30/20 rule also counts debt payments above the minimum toward its 20% target.</p>
            <p>Cash left over after spending and contributions counts as savings. Meeting the guide does not guarantee you are saving enough for your goals.</p>
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
              <div className="split-track" role="img" aria-label={`${bar.name}: ${KEYS.map(k => `${k.label} ${percent(share(bar.values[k.key]))}`).join(', ')}`}>
                {KEYS.map(k => {
                  const amount = bar.values[k.key];
                  const label = `${k.label}: ${percent(share(amount))} · ${monthly(amount)}`;
                  return amount > 0 ? (
                    <div key={k.key} className="split-seg" style={{ flexGrow: amount / bar.scale, background: k.color }} title={label}>
                      {amount / bar.scale >= .08 && <span className="split-pct">{percent(share(amount))}</span>}
                    </div>
                  ) : null;
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </ChartCard>
  );
}

const savingsTotal = (b: Budget) => b.personalContributions + Math.max(0, b.unallocated);

function verdict(b: Budget) {
  if (b.unallocated < -0.5) return `Your plan exceeds after-tax income by ${monthly(-b.unallocated)}. Reduce spending or contributions to balance it.`;
  const savings = savingsTotal(b);
  if (savings < b.afterTax * .2) return `${monthly(b.afterTax * .2 - savings)} more toward savings would reach 20%.`;
  if (b.needs / b.afterTax > .5) return 'Your savings meet 20%; needs are above the 50% guide.';
  if (b.wants / b.afterTax > .3) return 'Your savings meet 20%; wants are above the 30% guide.';
  return 'Your plan meets the 50/30/20 guide.';
}
