import { describe, expect, it } from 'vitest';
import { createDefaultState, sanitizeState, type BudgetState } from '../state/model';
import { computeBudget } from './budget';

function withIncome(patch: (s: BudgetState) => void) {
  const s = createDefaultState();
  patch(s);
  return s;
}

describe('computeBudget', () => {
  it('starts blank: no income, no tax, nothing left over', () => {
    const b = computeBudget(createDefaultState());
    expect(b.grossIncome).toBe(0);
    expect(b.tax.totalDeducted).toBe(0);
    expect(b.unallocated).toBe(0);
  });

  it('converts foreign consulting income to CAD and applies self-employed CPP', () => {
    const s = withIncome((s) => {
      const foreign = s.income.find((i) => i.currency === 'USD')!;
      foreign.amount = 50000;
    });
    const b = computeBudget(s);
    expect(b.consulting).toBeCloseTo(50000 * s.settings.fx.USD);
    expect(b.tax.ei).toBe(0);
    expect(b.tax.cppSelfBase + b.tax.cppSelfDeductible).toBeGreaterThan(0);
    expect(b.consultingSetAside).toBeCloseTo(b.tax.totalDeducted, 0);
  });

  it('credits foreign withholding without exceeding the tax actually paid', () => {
    const s = withIncome((s) => {
      s.income[0].amount = 80000;
      const foreign = s.income.find((i) => i.currency === 'USD')!;
      foreign.amount = 20000;
      foreign.foreignTaxPct = 10;
    });
    const b = computeBudget(s);
    const withheld = 20000 * s.settings.fx.USD * 0.1;
    expect(b.tax.foreignTaxPaid).toBeCloseTo(withheld);
    expect(b.tax.foreignTaxCredit).toBeGreaterThan(0);
    expect(b.tax.foreignTaxCredit).toBeLessThanOrEqual(withheld + 0.01);
  });

  it('taxes eligible dividends less than the same amount of interest', () => {
    const div = computeBudget(withIncome((s) => s.income.push({ ...s.income[0], id: 'd', kind: 'eligibleDividend', amount: 40000 })));
    const int = computeBudget(withIncome((s) => s.income.push({ ...s.income[0], id: 'i', kind: 'other', amount: 40000 })));
    expect(div.tax.incomeTax).toBeLessThan(int.tax.incomeTax);
  });

  it('taxes a group RRSP match as salary, deducts it, and caps deductions at the entered room', () => {
    const s = withIncome((s) => {
      s.income[0].amount = 100000;
      s.settings.retirementPct = 6; // 6,000/yr
      s.settings.matchRate = 100;
      s.settings.matchCapPct = 3;
      s.settings.rrspRoom = 5000;
      s.settings.rooms.rrspStatus = 'verified';
    });
    const b = computeBudget(s);
    expect(b.employerMatch).toBeCloseTo(3000);
    expect(b.tax.totalIncome).toBeCloseTo(103000);
    expect(b.rrspDeduction).toBeCloseTo(5000); // 9,000 contributed, capped at room
    expect(b.warnings.some((w) => w.level === 'warning' && w.text.includes('RRSP'))).toBe(true);
  });

  it('costs only CPP and EI on a group RRSP match when there is room', () => {
    const b = computeBudget(
      withIncome((s) => {
        s.income[0].amount = 60000;
        s.settings.rrspRoom = 20000;
        s.settings.rooms.rrspStatus = 'verified';
        s.settings.retirementPct = 5;
        s.settings.matchRate = 100;
      }),
    );
    expect(b.rrspDeduction).toBeCloseTo(6000);
    // Income tax on the match is cancelled by its deduction, leaving CPP and EI
    // (less the credits and deduction they earn).
    expect(b.employerMatchTax).toBeGreaterThan(3000 * (0.0495 + 0.0163) * 0.75);
    expect(b.employerMatchTax).toBeLessThan(3000 * (0.0595 + 0.0163));
  });

  it('deducts DC pension contributions without taxing the match or using RRSP room', () => {
    const base = computeBudget(withIncome((s) => (s.income[0].amount = 100000)));
    const b = computeBudget(
      withIncome((s) => {
        s.income[0].amount = 100000;
        s.settings.retirementType = 'dcPension';
        s.settings.retirementPct = 6;
        s.settings.matchRate = 100;
        s.settings.rrspRoom = 0;
      }),
    );
    expect(b.employerMatch).toBeCloseTo(6000);
    expect(b.tax.totalIncome).toBeCloseTo(100000);
    expect(b.tax.taxableIncome).toBeCloseTo(base.tax.taxableIncome - 6000);
    expect(b.tax.ei).toBeCloseTo(base.tax.ei);
    expect(b.rrspDeduction).toBe(0);
    expect(b.pensionAdjustment).toBeCloseTo(12000);
    expect(b.totalInvested).toBeCloseTo(12000);
    expect(b.warnings.some((w) => w.level === 'warning')).toBe(false);
  });

  it('taxes the savings plan match as salary and keeps it out of take-home pay', () => {
    const base = computeBudget(withIncome((s) => (s.income[0].amount = 100000)));
    const b = computeBudget(
      withIncome((s) => {
        s.income[0].amount = 100000;
        s.settings.planPct = 10;
        s.settings.benefits.employerAccount = 'nonRegistered';
        s.settings.benefits.benefitTreatment = 'nonCash';
        s.settings.planMatchRate = 50;
        s.settings.planMatchCapPct = 6;
      }),
    );
    expect(b.planContribution).toBeCloseTo(10000);
    expect(b.contributions.nonRegistered).toBeCloseTo(10000);
    expect(b.planMatch).toBeCloseTo(3000); // 50% of the first 6%
    expect(b.tax.totalIncome).toBeCloseTo(103000);
    expect(b.planMatchTax).toBeGreaterThan(0);
    expect(b.afterTax).toBeCloseTo(base.afterTax - b.planMatchTax!);
    expect(b.totalInvested).toBeCloseTo(13000);
  });

  it('deducts both halves of a savings plan held in an RRSP', () => {
    const b = computeBudget(
      withIncome((s) => {
        s.income[0].amount = 100000;
        s.settings.planPct = 6;
        s.settings.planAccount = 'rrsp';
        s.settings.benefits.employerAccount = 'rrsp';
        s.settings.benefits.benefitTreatment = 'cash';
        s.settings.rrspRoom = 20000;
        s.settings.rooms.rrspStatus = 'verified';
        s.settings.planMatchRate = 50;
      }),
    );
    expect(b.rrspDeduction).toBeCloseTo(9000);
  });

  it('caps the FHSA deduction at the annual limit', () => {
    const s = withIncome((s) => {
      s.income[0].amount = 90000;
      Object.assign(s.settings.rooms, { fhsaState: 'opened', fhsaOpened: '2026-01-01', fhsaEligibilityConfirmed: true, fhsaStatus: 'estimated', fhsaLifetimeUsed: 0 });
      s.investments.find((i) => i.kind === 'fhsa')!.amount = 1000; // 12,000/yr
    });
    expect(computeBudget(s).fhsaDeduction).toBe(8000);
  });
});

describe('sanitizeState', () => {
  it('round-trips an exported config', () => {
    const s = createDefaultState();
    s.income[0].amount = 123456;
    s.settings.scenario = 'Downtown condo';
    const back = sanitizeState(JSON.parse(JSON.stringify({ app: 'x', ...s })));
    expect(back.income[0].amount).toBe(123456);
    expect(back.settings.scenario).toBe('Downtown condo');
    expect(back.tax).toEqual(s.tax);
  });

  it('rejects unrelated JSON and repairs bad fields', () => {
    expect(() => sanitizeState({ hello: 1 })).toThrow();
    const fixed = sanitizeState({ income: [{ name: 'X', kind: 'bogus', amount: 'abc', freq: 'hourly' }] });
    expect(fixed.income[0]).toMatchObject({ kind: 'employment', amount: null, freq: 'year', currency: 'CAD' });
  });
});
