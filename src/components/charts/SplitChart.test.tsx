import { state2026 } from '../../test/state2026';
import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { computeBudget } from '../../tax/budget';
import { SplitChart } from './SplitChart';

it('does not let debt payments satisfy the savings target or disappear from the spending shares', () => {
  const s = state2026();
  s.income[0] = { ...s.income[0], kind: 'taxFree', amount: 60000 };
  s.investments.find(i => i.kind === 'tfsa')!.amount = 500;
  s.essentials = [
    { id: 'rent', name: 'Rent', category: 'Housing', amount: 2000, freq: 'month' },
    { id: 'debt', name: 'Debt payment', category: 'Extra debt repayment', amount: 1000, freq: 'month' },
  ];
  s.lifestyle = [{ id: 'fun', name: 'Fun', category: 'Entertainment', amount: 500, freq: 'month' }];
  const b = computeBudget(s);
  const html = renderToStaticMarkup(<SplitChart b={b} />);
  expect(html).toContain('Your plan: Needs 60%, Wants 10%, Savings 10%, unallocated 20%');
  expect(html).toContain('$500/mo more toward savings would reach 20%.');
  expect(html).not.toContain('Your plan meets the 50/30/20 guide.');
  expect(b.savingsRate).toBe(.1);
  expect(b.totalInvested).toBe(6000);
  expect(b.needs + b.wants + b.personalContributions + b.unallocated).toBe(b.afterTax);
});
