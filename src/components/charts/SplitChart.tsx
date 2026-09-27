import { useState } from 'react';
import { fmt, type Budget } from '../../tax/budget';
import { ChartCard } from './common';

const KEYS = [
  { key: 'needs', label: 'Needs', color: 'var(--s-essentials)' },
  { key: 'wants', label: 'Wants', color: 'var(--s-lifestyle)' },
  { key: 'savings', label: 'Savings', color: 'var(--s-savings)' },
] as const;

type Key = (typeof KEYS)[number]['key'];

/** Compares the plan against the 50/30/20 guideline, as shares of take-home pay. */
export function SplitChart({ b }: { b: Budget }) {
  const [hover, setHover] = useState<Key | null>(null);
  const takeHome = b.afterTax;
  const you: Record<Key, number> = {
    needs: b.essentials,
    wants: b.lifestyle,
    savings: b.personalContributions + Math.max(0, b.unallocated),
  };
  const youTotal = you.needs + you.wants + you.savings;
  const share = (k: Key) => (takeHome > 0 ? you[k] / takeHome : 0);
  const guide: Record<Key, number> = { needs: 0.5, wants: 0.3, savings: 0.2 };

  const bars = [
    { name: 'Your plan', values: KEYS.map((k) => ({ ...k, v: share(k.key), amt: you[k.key] })), scale: Math.max(takeHome, youTotal) },
    { name: '50/30/20 guide', values: KEYS.map((k) => ({ ...k, v: guide[k.key], amt: takeHome * guide[k.key] })), scale: takeHome },
  ];

  return (
    <ChartCard
      id="split"
      title="Needs, wants and savings"
      subtitle="Share of take-home pay, next to the 50/30/20 guideline"
      legend={KEYS.map((k) => ({ label: k.label, color: k.color }))}
      table={{
        head: ['Bucket', 'Your plan', 'Your share', 'Guide'],
        rows: KEYS.map((k) => [k.label, `${fmt(you[k.key] / 12)}/mo`, `${(share(k.key) * 100).toFixed(0)}%`, `${guide[k.key] * 100}%`]),
      }}
    >
      {takeHome <= 0 ? (
        <p className="chart-empty">Enter your income to compare your plan with the guideline.</p>
      ) : (
        <div className="split">
          {bars.map((bar) => (
            <div className="split-row" key={bar.name}>
              <span className="split-name">{bar.name}</span>
              <div className="split-track">
                {bar.values.map((s) =>
                  s.amt > 0 ? (
                    <div
                      key={s.key}
                      className={`split-seg ${hover && hover !== s.key ? 'dim' : ''}`}
                      style={{ flexGrow: s.amt / (bar.scale || 1), background: s.color }}
                      onMouseEnter={() => setHover(s.key)}
                      onMouseLeave={() => setHover(null)}
                    >
                      {s.v >= 0.08 && <span className="split-pct">{(s.v * 100).toFixed(0)}%</span>}
                    </div>
                  ) : null,
                )}
                {bar.name === 'Your plan' && youTotal < takeHome && <div style={{ flexGrow: (takeHome - youTotal) / bar.scale }} />}
              </div>
            </div>
          ))}
          <p className="split-verdict">{verdict(share('needs'), share('wants'), share('savings'), takeHome)}</p>
        </div>
      )}
    </ChartCard>
  );
}

function verdict(needs: number, wants: number, savings: number, takeHome: number) {
  if (needs + wants + savings > 1.001) return 'Your plan spends more than you take home, so the shares add up to more than 100%.';
  if (savings >= 0.2 && needs <= 0.5) return 'Needs are within half of take-home and you save at least 20%. On track.';
  if (needs > 0.5) return `Needs take ${(needs * 100).toFixed(0)}% of take-home. Housing is usually the biggest lever in Toronto.`;
  if (savings < 0.2) return `You save ${(savings * 100).toFixed(0)}%. Another ${fmt(((0.2 - savings) * takeHome) / 12)}/month would reach 20%.`;
  return 'Balanced against the guideline.';
}
