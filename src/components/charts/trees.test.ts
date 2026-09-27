import { describe, expect, it } from 'vitest';
import { createDefaultState } from '../../state/model';
import { computeBudget } from '../../tax/budget';
import { expenseTree, incomeTree } from './trees';

describe('breakdown trees', () => {
  it('groups expenses as group → category → item, with consistent totals', () => {
    const s = createDefaultState();
    s.essentials.find((e) => e.name === 'Rent or mortgage')!.amount = 2000;
    s.essentials.find((e) => e.name === 'Groceries')!.amount = 500;
    s.lifestyle.find((e) => e.name === 'Restaurants')!.amount = 300;
    s.lifestyle.find((e) => e.name === 'Travel')!.amount = 1200; // yearly

    const root = expenseTree(s);
    expect(root.value).toBe((2000 + 500 + 300) * 12 + 1200);
    const essentials = root.children!.find((c) => c.key === 'essentials')!;
    expect(essentials.value).toBe(2500 * 12);
    const food = essentials.children!.find((c) => c.label === 'Food')!;
    expect(food.children!.map((c) => c.label)).toEqual(['Groceries']);
    const lifestyleFood = root.children!.find((c) => c.key === 'lifestyle')!.children!.find((c) => c.label === 'Food')!;
    expect(lifestyleFood.value).toBe(300 * 12);
  });

  it('groups income by type in C$', () => {
    const s = createDefaultState();
    s.income[0].amount = 100000;
    s.income.find((i) => i.currency === 'USD')!.amount = 10000;
    const b = computeBudget(s);
    const root = incomeTree(s, b);
    expect(root.value).toBeCloseTo(100000 + 10000 * s.settings.fx.USD);
    const consulting = root.children!.find((c) => c.key === 'selfEmployment')!;
    expect(consulting.children).toHaveLength(1);
  });
});
