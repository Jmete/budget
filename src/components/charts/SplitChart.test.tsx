import { state2026 } from '../../test/state2026';
import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { computeBudget } from '../../tax/budget';
import { SplitChart } from './SplitChart';

it('counts leftover cash as savings without letting debt payments satisfy the target', () => {
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
  expect(html).toContain('Your plan: Needs 60%, Wants 10%, Savings 30%');
  expect(html).toContain('Your savings meet 20%; needs are above the 50% guide.');
  expect(html).not.toContain('Your plan meets the 50/30/20 guide.');
  expect(b.savingsRate).toBe(.1);
  expect(b.totalInvested).toBe(6000);
  expect(b.needs + b.wants + b.personalContributions + b.unallocated).toBe(b.afterTax);
});

it('asks for more savings when contributions and leftover fall short of 20%', () => {
  const s = state2026();
  s.income[0] = { ...s.income[0], kind: 'taxFree', amount: 60000 };
  s.investments.find(i => i.kind === 'tfsa')!.amount = 250;
  s.essentials = [{ id: 'rent', name: 'Rent', category: 'Housing', amount: 3000, freq: 'month' }];
  s.lifestyle = [{ id: 'fun', name: 'Fun', category: 'Entertainment', amount: 1500, freq: 'month' }];
  const html = renderToStaticMarkup(<SplitChart b={computeBudget(s)} />);
  expect(html).toContain('Your plan: Needs 60%, Wants 30%, Savings 10%');
  expect(html).toContain('$500/mo more toward savings would reach 20%.');
});
