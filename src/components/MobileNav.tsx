import { useEffect, useState } from 'react';
import { fmt } from '../tax/budget';

// Several page sections can map to one tab (Spending covers essentials and lifestyle).
const TABS = [
  { key: 'income', label: 'Income', ids: ['income'] },
  { key: 'savings', label: 'Saving', ids: ['savings'] },
  { key: 'spending', label: 'Spending', ids: ['essentials', 'lifestyle'] },
  { key: 'analysis', label: 'Charts', ids: ['analysis', 'assumptions'] },
] as const;

type TabKey = 'summary' | (typeof TABS)[number]['key'];

/**
 * Bottom tab bar for phones (hidden by CSS on wider screens). Keeps the monthly
 * result in view while filling out the form and jumps between sections.
 */
export function MobileNav({ monthlyLeft }: { monthlyLeft: number }) {
  const [active, setActive] = useState<TabKey>('summary');

  // Scrollspy: the section crossing a line ~40% down the viewport is active.
  useEffect(() => {
    const owner = new Map<string, TabKey>([['summary', 'summary']]);
    TABS.forEach((t) => t.ids.forEach((id) => owner.set(id, t.key)));
    const els = [...owner.keys()].map((id) => document.getElementById(id)).filter((el): el is HTMLElement => !!el);
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.find((e) => e.isIntersecting);
        if (hit) setActive(owner.get(hit.target.id) ?? 'summary');
      },
      { rootMargin: '-40% 0px -59% 0px' },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  const go = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ block: 'start' });
  };
  const short = monthlyLeft < -0.5;

  return (
    <nav className="mobile-nav" aria-label="Sections">
      <a
        href="#summary"
        className={`mobile-nav-sum ${short ? 'is-neg' : ''}`}
        aria-current={active === 'summary' ? 'true' : undefined}
        onClick={go('summary')}
      >
        <strong>{fmt(Math.abs(monthlyLeft))}</strong>
        <span>{short ? 'short / mo' : 'left / mo'}</span>
      </a>
      {TABS.map((t) => (
        <a key={t.key} href={`#${t.ids[0]}`} aria-current={active === t.key ? 'true' : undefined} onClick={go(t.ids[0])}>
          {t.label}
        </a>
      ))}
    </nav>
  );
}
