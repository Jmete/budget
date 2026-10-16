import { describe, expect, it } from 'vitest';
import { createDefaultState } from '../state/model';
import { computeBudget } from './budget';
import { TAX_2027 } from './params';
import { contributionRooms, estimateRrspRoom } from './rooms';

describe('RRSP room estimate', () => {
  it('adds 18% of last year’s earned income, capped at the dollar limit, less the pension adjustment', () => {
    expect(estimateRrspRoom(TAX_2027, 0, 30000, null)).toBeCloseTo(5400);
    expect(estimateRrspRoom(TAX_2027, 2500, 30000, 1000)).toBeCloseTo(6900);
    expect(estimateRrspRoom(TAX_2027, 0, 500000, 0)).toBe(35390);
    expect(estimateRrspRoom(TAX_2027, 0, 1000, 5000)).toBe(0);
  });

  it('needs carryforward and earned income entered, even as zero', () => {
    expect(estimateRrspRoom(TAX_2027, null, 30000, 0)).toBeNull();
    expect(estimateRrspRoom(TAX_2027, 0, null, 0)).toBeNull();
  });

  it('is used only for “My estimate” with the limit left blank', () => {
    const s = createDefaultState();
    Object.assign(s.settings.rooms, { rrspCarryforward: 1000, rrspPriorEarnedIncome: 30000 });
    expect(contributionRooms(s.settings, s.tax).rrsp).toBeNull();
    s.settings.rooms.rrspStatus = 'estimated';
    expect(contributionRooms(s.settings, s.tax).rrsp).toBeCloseTo(6400);
    s.settings.rrspRoom = 2000;
    expect(contributionRooms(s.settings, s.tax).rrsp).toBe(2000);
  });
});

describe('potential deduction saving', () => {
  it('shows what unknown room would save, and matches the actual saving once room is known', () => {
    const s = createDefaultState();
    s.income[0].amount = 100000;
    s.investments.find((i) => i.kind === 'rrsp')!.amount = 500;
    let b = computeBudget(s);
    expect(b.deductionSavings).toBe(0);
    expect(b.potentialDeductionSavings).toBeGreaterThan(1500);
    s.settings.rooms.rrspStatus = 'verified';
    s.settings.rrspRoom = 20000;
    b = computeBudget(s);
    expect(b.deductionSavings).toBeCloseTo(b.potentialDeductionSavings);
  });
});
