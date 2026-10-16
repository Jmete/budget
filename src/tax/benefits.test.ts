import { state2026 } from '../test/state2026';
import { describe, expect, it } from 'vitest';
import { sanitizeState } from '../state/model';
import { computeBudget, matchStepYear, projectSavings, fmt } from './budget';
import { calculateTax, EMPTY_INPUT } from './engine';
import { addMonths, yearFraction } from './plans';
import { contributionRooms, estimateTfsaRoom } from './rooms';

function workplacePlan(salary = 125000, pct = 6, membershipYear = 1) {
  const s = state2026();
  s.income[0].amount = salary;
  Object.assign(s.settings, { retirementType: 'dcPension', retirementPct: pct, matchRate: 50, matchCapPct: 6, planPct: 6, planMatchRate: 50, planMatchCapPct: 6 });
  Object.assign(s.settings.benefits, { automaticPct: 3, employerEarningsCap: 150000, retirementEmployeeMaxPct: 9, savingsEmployeeMaxPct: 10, membershipYear, matchStepYear: 5, laterMatchRate: 100, retirementWaitMonths: 3, savingsWaitMonths: 6 });
  return s;
}
function verifyRoom(s: ReturnType<typeof workplacePlan>, room = 30000) {
  s.settings.rrspRoom = room;
  s.settings.rooms.rrspStatus = 'verified';
}

describe('DC pension examples A–E', () => {
  it.each([
    [0, 1, 0, 3750, 0, 3750],
    [3, 1, 3750, 3750, 1875, 9375],
    [6, 1, 7500, 3750, 3750, 15000],
    [9, 1, 11250, 3750, 3750, 18750],
    [6, 5, 7500, 3750, 7500, 18750],
    [9, 5, 11250, 3750, 7500, 22500],
  ])('%i%% in year %i', (pct, year, employee, auto, matching, total) => {
    const b = computeBudget(workplacePlan(125000, pct, year));
    expect(b.retirementContribution).toBeCloseTo(employee);
    expect(b.employerAutomatic).toBeCloseTo(auto);
    expect(b.employerMatching).toBeCloseTo(matching);
    expect(b.employerMatch).toBeCloseTo(auto + matching);
    expect(b.pensionAdjustment).toBeCloseTo(total);
    expect(b.roomUsed.rrsp).toBe(0);
  });
  it('uses separate employee / employer earnings caps above $150,000', () => {
    const s = workplacePlan(180000);
    let b = computeBudget(s);
    expect(b.retirementContribution).toBe(10800);
    expect(b.employerAutomatic).toBe(4500);
    expect(b.employerMatching).toBe(4500);
    expect(b.pensionAdjustment).toBe(19800);
    s.settings.benefits.employeeEarningsCap = 150000;
    b = computeBudget(s);
    expect(b.retirementContribution).toBe(9000);
    expect(b.pensionAdjustment).toBe(18000);
  });
  it('caps the total at the 2026 MP limit, with explicit reduction allocation', () => {
    const s = workplacePlan(500000, 9, 5);
    let b = computeBudget(s);
    expect(b.pensionAdjustment).toBe(35390);
    expect(b.retirementContribution).toBe(21890);
    expect(b.employerMatch).toBe(13500);
    s.settings.benefits.limitAllocation = 'proportional';
    b = computeBudget(s);
    expect(b.pensionAdjustment).toBeCloseTo(35390);
    expect(b.retirementContribution / b.employerAutomatic).toBeCloseTo(10);
  });
  it('enforces 18% and configured rate/automatic/matching maximums, including zero', () => {
    const s = workplacePlan();
    s.settings.benefits.automaticPct = 30;
    expect(computeBudget(s).pensionAdjustment).toBe(22500);
    s.settings.benefits.automaticMax = 1000;
    s.settings.matchMax = 0;
    s.settings.retirementPct = 10;
    const b = computeBudget(s);
    expect(b.retirementContribution).toBe(11250);
    expect(b.employerAutomatic).toBe(1000);
    expect(b.employerMatching).toBe(0);
  });
});

describe('employee savings plan examples F–H and combined example', () => {
  it.each([[0, 0, 0], [3, 3750, 1875], [6, 7500, 3750], [9, 11250, 3750], [10, 12500, 3750]])('%i%% savings', (pct, employee, match) => {
    const s = workplacePlan(); s.settings.planPct = pct;
    const b = computeBudget(s);
    expect(b.planContribution).toBe(employee);
    expect(b.planMatch).toBe(match);
  });
  it('does not apply an employer match cap unless configured', () => {
    expect(computeBudget(workplacePlan(180000)).planMatch).toBe(5400);
    const s = workplacePlan(180000); s.settings.planMatchMax = 4500;
    expect(computeBudget(s).planMatch).toBe(4500);
  });
  it('reconciles combined contributions, cash and account allocations', () => {
    const b = computeBudget(workplacePlan());
    expect(b.personalContributions).toBe(15000);
    expect(b.employerMatch + b.planMatch).toBe(11250);
    expect(b.totalInvested).toBe(26250);
    expect(b.totalInvested / 12).toBe(2187.5);
    expect(b.personalContributions / 12).toBe(1250);
    expect((b.employerMatch + b.planMatch) / 12).toBe(937.5);
    expect(b.pensionAdjustment).toBe(15000);
    expect(Object.values(b.investedByAccount).reduce((a, v) => a + v, 0)).toBe(b.totalInvested);
    expect(b.grossIncome - b.tax.totalDeducted - b.personalContributions - b.expenses).toBeCloseTo(b.unallocated);
  });
});

describe('separate taxation and room', () => {
  it.each(['nonRegistered', 'tfsa', 'rrsp'] as const)('EPSP match stays separate from employee %s', account => {
    const s = workplacePlan(); verifyRoom(s);
    s.settings.planAccount = account;
    s.settings.benefits.employerAccount = 'epsp';
    const b = computeBudget(s);
    expect(b.tax.totalIncome).toBe(128750);
    expect(b.rrspDeduction).toBe(account === 'rrsp' ? 7500 : 0);
    expect(b.roomUsed.tfsa).toBe(account === 'tfsa' ? 7500 : 0);
    expect(b.investedByAccount.epsp).toBe(3750);
    expect(b.planMatchIncomeTax).toBeGreaterThan(0);
    expect(b.planMatchPayrollTax).toBe(0);
    const noMatch = structuredClone(s); noMatch.settings.planMatchRate = 0;
    expect(b.planMatchIncomeTax).toBeCloseTo(b.tax.incomeTax - computeBudget(noMatch).tax.incomeTax);
  });
  it('RRSP employer match offsets income tax only when actually contributed with room', () => {
    const s = workplacePlan(); verifyRoom(s);
    s.settings.planAccount = 'rrsp';
    Object.assign(s.settings.benefits, { employerAccount: 'rrsp', benefitTreatment: 'cash' });
    const b = computeBudget(s);
    expect(b.roomUsed.rrsp).toBe(11250);
    expect(b.rrspDeduction).toBe(11250);
    expect(b.planMatchIncomeTax).toBe(0);
    expect(b.planMatchTax).toBe(0); // CPP and EI already at maximum
    expect(b.tax.taxableIncome).toBeCloseTo(125000 + 3750 - 7500 - 11250 - 1127);
  });
  it('TFSA matching benefit stays taxable and consumes only its actual account room', () => {
    const s = workplacePlan();
    Object.assign(s.settings, { planAccount: 'tfsa', tfsaRoom: 7000 });
    Object.assign(s.settings.rooms, { tfsaStatus: 'verified' });
    Object.assign(s.settings.benefits, { employerAccount: 'tfsa', benefitTreatment: 'nonCash' });
    const b = computeBudget(s);
    expect(b.roomUsed.tfsa).toBe(11250);
    expect(b.rrspDeduction).toBe(0);
    expect(b.planMatchIncomeTax).toBeGreaterThan(0);
    expect(b.warnings.some(w => w.text.includes('TFSA contributions exceed'))).toBe(true);
  });
  it.each([null, 0])('does not deduct a group RRSP or employee savings plan RRSP with room %s', room => {
    const s = workplacePlan();
    s.settings.retirementType = 'groupRrsp';
    s.settings.planAccount = 'rrsp';
    s.settings.rrspRoom = room;
    if (room !== null) s.settings.rooms.rrspStatus = 'verified';
    Object.assign(s.settings.benefits, { employerAccount: 'rrsp', benefitTreatment: 'cash' });
    const b = computeBudget(s);
    expect(b.rrspDeduction).toBe(0);
    expect(b.pensionAdjustment).toBe(0);
    expect(b.tax.totalIncome).toBe(136250);
    expect(b.taxProvisional).toBe(room === null);
    expect(b.planMatchIncomeTax === null).toBe(room === null);
    if (room === 0) expect(b.planMatchIncomeTax).toBeGreaterThan(0);
  });
  it('allows RPP deduction with verified zero RRSP room without double counting', () => {
    const s = workplacePlan(); verifyRoom(s, 0); s.settings.planPct = 0;
    const b = computeBudget(s);
    const base = calculateTax({ ...EMPTY_INPUT, employment: 125000 }, s.tax);
    expect(b.rrspDeduction).toBe(0);
    expect(b.tax.totalIncome).toBe(125000);
    expect(b.tax.taxableIncome).toBe(base.taxableIncome - 7500);
    expect(b.roomUsed.rrsp).toBe(0);
  });
  it('caps deductions when employee RRSP deposits already exhaust available room', () => {
    const s = workplacePlan(); verifyRoom(s, 7500);
    s.settings.planAccount = 'rrsp';
    Object.assign(s.settings.benefits, { employerAccount: 'rrsp', benefitTreatment: 'cash' });
    const b = computeBudget(s);
    expect(b.rrspDeduction).toBe(7500);
    expect(b.planMatchIncomeTax).toBeGreaterThan(0);
  });
  it('keeps unconfirmed employer destination unallocated and tax unresolved', () => {
    const s = workplacePlan(); s.settings.planAccount = 'rrsp'; verifyRoom(s);
    const b = computeBudget(s);
    expect(b.planMatchTax).toBeNull();
    expect(b.rrspDeduction).toBe(7500);
    expect(b.investedByAccount.unknown).toBe(3750);
    expect(b.taxProvisional).toBe(true);
  });
  it('handles EPSP, non-cash and cash payroll bases below CPP/EI ceilings', () => {
    const s = workplacePlan(40000); s.settings.benefits.employerAccount = 'epsp';
    const epsp = computeBudget(s);
    Object.assign(s.settings.benefits, { employerAccount: 'nonRegistered', benefitTreatment: 'nonCash' });
    const noncash = computeBudget(s);
    s.settings.benefits.benefitTreatment = 'cash';
    const cash = computeBudget(s);
    expect(epsp.tax.ei).toBe(noncash.tax.ei);
    expect(cash.tax.ei - noncash.tax.ei).toBeCloseTo(1200 * .0163);
    expect(noncash.tax.cppTotal - epsp.tax.cppTotal).toBeCloseTo(1200 * .0595);
  });
  it('keeps DPSP separate from EPSP and adds a PA without current deduction', () => {
    const s = workplacePlan(); s.settings.benefits.employerAccount = 'dpsp';
    const b = computeBudget(s);
    expect(b.tax.totalIncome).toBe(125000);
    expect(b.pensionAdjustment).toBe(18750);
    expect(b.roomUsed.rrsp).toBe(0);
    expect(b.planMatchIncomeTax).toBe(0);
  });
  it('supports restricted group RRSP EI exemption', () => {
    const s = workplacePlan(40000); verifyRoom(s); s.settings.retirementType = 'groupRrsp'; s.settings.planPct = 0;
    const cash = computeBudget(s);
    s.settings.benefits.groupRrspWithdrawable = false;
    const restricted = computeBudget(s);
    expect(cash.tax.ei - restricted.tax.ei).toBeCloseTo(cash.employerMatch * .0163);
    expect(cash.tax.cppTotal).toBe(restricted.tax.cppTotal);
  });
  it('deducts prior unused RRSP deposits without a second cash outflow', () => {
    const s = workplacePlan(); verifyRoom(s, 10000); s.settings.planPct = 0;
    s.settings.rooms.rrspPriorUnused = 4000;
    s.settings.rooms.rrspElsewhere = 8000;
    const b = computeBudget(s);
    expect(b.rrspDeduction).toBe(10000);
    expect(b.roomAvailable.rrspNewContributions).toBe(6000);
    expect(b.roomUsed.rrsp).toBe(8000);
    expect(b.personalContributions).toBe(15500);
  });
});

describe('calendar participation, anniversaries and payroll', () => {
  it('October 2026 hire has no 2026 plans, pension January 2027, savings April 2027', () => {
    const s = workplacePlan(); Object.assign(s.settings.benefits, { mode: 'calendar', employmentStart: '2026-10-01' });
    let b = computeBudget(s);
    expect(b.salary).toBe(31250);
    expect(b.plans.dates).toEqual({ retirement: '2027-01-01', savings: '2027-04-01' });
    expect(b.totalInvested).toBe(0);
    s.tax.year = 2027; b = computeBudget(s);
    expect(b.retirementContribution).toBeCloseTo(7500);
    expect(b.employerMatch).toBeCloseTo(7500);
    expect(b.planContribution).toBeCloseTo(5625);
    expect(b.planMatch).toBeCloseTo(2812.5);
  });
  it('starts exactly after waiting periods and handles month ends / leap years', () => {
    expect(addMonths('2026-10-16', 3)).toBe('2027-01-16');
    expect(addMonths('2026-10-16', 6)).toBe('2027-04-16');
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29');
    expect(yearFraction(2026, '2026-10-16')).toBeCloseTo((16 / 31 + 2) / 12);
    expect(yearFraction(2026, 'invalid')).toBe(0);
  });
  it('splits matching at the fourth membership anniversary within the tax year', () => {
    const s = workplacePlan(); Object.assign(s.settings.benefits, { mode: 'calendar', employmentStart: '2022-04-01' });
    const b = computeBudget(s); // pension began July 2022, year 5 starts July 2026
    expect(b.employerMatching).toBeCloseTo(5625);
    expect(b.employerAutomatic).toBeCloseTo(3750);
  });
  it('does not compute a dated salary or plans when the hire date is unknown', () => {
    const s = workplacePlan(); s.settings.benefits.mode = 'calendar';
    const b = computeBudget(s);
    expect(b.salary).toBe(0); expect(b.totalInvested).toBe(0); expect(b.taxProvisional).toBe(true);
  });
  it('does not allow an override to contribute before employment', () => {
    const s = workplacePlan(); Object.assign(s.settings.benefits, { mode: 'calendar', employmentStart: '2026-10-01', retirementStart: '2026-01-01' });
    const b = computeBudget(s);
    expect(b.retirementContribution).toBe(1875);
  });
  it('keeps actual withholding separate from final liability and bank cash', () => {
    const s = workplacePlan(); Object.assign(s.settings.benefits, { incomeTaxWithheld: 30000, cppEiWithheld: 6000, employerAccount: 'epsp' });
    const b = computeBudget(s);
    expect(b.actualCashAfterPayroll).toBe(74000);
    expect(b.afterTax).not.toBe(89000);
    expect(b.tax.totalIncome).toBe(128750);
  });
  it('projects future plan participation and membership matching instead of freezing year one', () => {
    const s = workplacePlan(); s.settings.horizonYears = 6; s.settings.returnRate = 0;
    Object.assign(s.settings.benefits, { mode: 'calendar', employmentStart: '2026-10-01' });
    const pts = projectSavings(s, computeBudget(s));
    expect(pts[1].contributed).toBe(0);
    expect(pts[2].contributed).toBeCloseTo(23437.5);
    expect(pts[6].contributed - pts[5].contributed).toBeCloseTo(30000);
  });
  it('reports the projection year the higher match starts', () => {
    const s = workplacePlan(); s.settings.horizonYears = 10;
    expect(matchStepYear(s, computeBudget(s))).toBe(5);
    expect(matchStepYear(workplacePlan(125000, 6, 3), computeBudget(workplacePlan(125000, 6, 3)))).toBe(3);
    expect(matchStepYear(workplacePlan(125000, 6, 5), computeBudget(workplacePlan(125000, 6, 5)))).toBeNull();
    s.settings.horizonYears = 4;
    expect(matchStepYear(s, computeBudget(s))).toBeNull();
    Object.assign(s.settings.benefits, { mode: 'calendar', employmentStart: '2026-10-01' });
    s.settings.horizonYears = 10;
    expect(matchStepYear(s, computeBudget(s))).toBe(6);
  });
});

describe('returning resident room', () => {
  it('does not generate current RRSP room from salary, or assume blank TFSA/FHSA room', () => {
    const s = workplacePlan();
    const b = computeBudget(s);
    expect(b.roomAvailable).toEqual({ rrsp: null, rrspNewContributions: null, tfsa: null, fhsa: null });
    s.settings.rooms.rrspStatus = 'verified'; s.settings.rrspRoom = 0;
    expect(computeBudget(s).roomAvailable.rrsp).toBe(0);
  });
  it('TFSA history includes only supplied qualifying resident years', () => {
    expect(estimateTfsaRoom(2026, '2026', 0, 0)).toBe(7000);
    expect(estimateTfsaRoom(2026, '2009-2010, 2026', 3000, 1000)).toBe(15000);
    expect(estimateTfsaRoom(2026, '2026,2026', 0, 0)).toBe(7000);
    expect(estimateTfsaRoom(2026, '', 0, 0)).toBeNull();
    expect(estimateTfsaRoom(2026, '2027', 0, 0)).toBeNull();
    expect(estimateTfsaRoom(2026, '2026', null, 0)).toBeNull();
  });
  it('requires an opened eligible FHSA and handles first year, carryforward and lifetime limits', () => {
    const s = workplacePlan();
    s.investments.find(i => i.kind === 'fhsa')!.amount = 1000;
    for (const fhsaState of ['unknown', 'notOpened', 'ineligible'] as const) {
      s.settings.rooms.fhsaState = fhsaState;
      expect(computeBudget(s).fhsaDeduction).toBe(0);
    }
    Object.assign(s.settings.rooms, { fhsaState: 'opened', fhsaOpened: '2026-10-01', fhsaEligibilityConfirmed: true, fhsaStatus: 'estimated', fhsaLifetimeUsed: 0 });
    expect(contributionRooms(s.settings, s.tax).fhsa).toBe(8000);
    s.tax.year = 2027; s.settings.rooms.year = 2027; s.settings.rooms.fhsaCarryforward = 8000;
    expect(contributionRooms(s.settings, s.tax).fhsa).toBe(16000);
    s.settings.rooms.fhsaOpened = '2027-01-01';
    expect(contributionRooms(s.settings, s.tax).fhsa).toBe(8000);
    s.settings.rooms.fhsaOpened = '2026-10-01'; s.settings.rooms.fhsaLifetimeUsed = 38000;
    expect(contributionRooms(s.settings, s.tax).fhsa).toBe(2000);
    s.settings.rooms.fhsaEligibilityConfirmed = false;
    expect(contributionRooms(s.settings, s.tax).fhsa).toBeNull();
  });
  it('does not silently reuse room after the tax year changes', () => {
    const s = workplacePlan(); verifyRoom(s); s.tax.year = 2027;
    expect(computeBudget(s).roomAvailable.rrsp).toBeNull();
  });
});

describe('saved state compatibility', () => {
  it('round-trips all new rules and room details', () => {
    const s = workplacePlan(); verifyRoom(s, 0); s.settings.rooms.tfsaQualifyingYears = '2026';
    expect(sanitizeState(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });
  it('migrates legacy room amounts as estimates without inventing employer destinations', () => {
    const s = sanitizeState({ settings: { rrspRoom: 0, tfsaRoom: 7000, planAccount: 'rrsp' } });
    expect(s.settings.rooms.rrspStatus).toBe('estimated');
    expect(s.settings.rooms.tfsaStatus).toBe('estimated');
    expect(s.settings.rooms.fhsaStatus).toBe('unknown');
    expect(s.settings.benefits.employerAccount).toBe('unknown');
    expect(s.settings.rrspRoom).toBe(0);
  });
  it('rejects invalid nested enums, negative values and non-finite caps', () => {
    const s = sanitizeState({ settings: { benefits: { automaticPct: -10, employerEarningsCap: Infinity, employerAccount: 'bogus' }, rooms: { rrspStatus: 'bogus' } } });
    expect(s.settings.benefits.automaticPct).toBe(0);
    expect(s.settings.benefits.employerEarningsCap).toBeNull();
    expect(s.settings.benefits.employerAccount).toBe('unknown');
    expect(s.settings.rooms.rrspStatus).toBe('unknown');
  });
});

describe('mid-month hire and employee savings plan account choices', () => {
  it('uses the exact supplied start date, not the first day of October', () => {
    const s = workplacePlan(); Object.assign(s.settings.benefits, { mode: 'calendar', employmentStart: '2026-10-13', planKind: 'profitSharing' });
    const b = computeBudget(s);
    expect(b.plans.dates).toEqual({ retirement: '2027-01-13', savings: '2027-04-13' });
    expect(b.salary).toBeCloseTo(125000 * (19 / 31 + 2) / 12);
    expect(b.totalInvested).toBe(0);
  });
  it.each(['epsp', 'dpsp'] as const)('splits employee funds 20/30/50 independently of %s employer funds', employerAccount => {
    const s = workplacePlan(); verifyRoom(s);
    Object.assign(s.settings.benefits, { planKind: 'profitSharing', employeeSplit: true, employeeRrspAllocation: 30, employeeTfsaAllocation: 50, employerAccount });
    const b = computeBudget(s);
    expect(b.investedByAccount.nonRegistered).toBe(1500);
    expect(b.investedByAccount.rrsp).toBe(2250);
    expect(b.investedByAccount.tfsa).toBe(3750);
    expect(b.investedByAccount[employerAccount]).toBe(3750);
    expect(b.rrspDeduction).toBe(2250);
    expect(b.roomUsed.rrsp).toBe(2250);
    expect(b.roomUsed.tfsa).toBe(3750);
    expect(b.pensionAdjustment).toBe(employerAccount === 'dpsp' ? 18750 : 15000);
    expect(b.totalInvested).toBe(26250);
    expect(Object.values(b.investedByAccount).reduce((a, v) => a + v, 0)).toBe(b.totalInvested);
  });
  it('does not apply CPP/EI to either possible employee savings plan employer account when choice is unknown', () => {
    const s = workplacePlan(40000); s.settings.benefits.planKind = 'profitSharing';
    const unknown = computeBudget(s);
    s.settings.benefits.employerAccount = 'epsp';
    const epsp = computeBudget(s);
    expect(unknown.planMatchTax).toBeNull();
    expect(unknown.tax.totalDeducted).toBeCloseTo(epsp.tax.totalDeducted);
    expect(unknown.tax.cppTotal).toBe(epsp.tax.cppTotal);
    expect(unknown.tax.ei).toBe(epsp.tax.ei);
  });
  it.each([[80, 80], [300, 0]])('flags invalid employee splits %i/%i and grants no unsubstantiated deduction', (rrsp, tfsa) => {
    const s = workplacePlan(); verifyRoom(s);
    Object.assign(s.settings.benefits, { employeeSplit: true, employeeRrspAllocation: rrsp, employeeTfsaAllocation: tfsa });
    const b = computeBudget(s);
    expect(b.rrspDeduction).toBe(0);
    expect(b.roomUsed.tfsa).toBe(0);
    expect(b.investedByAccount.unknown).toBe(11250);
    expect(b.totalInvested).toBe(26250);
    expect(b.taxProvisional).toBe(true);
  });
});

it('formats monthly cents without floating-point half-cent artefacts', () => { expect(fmt(1590.8999999999978 / 12, 2)).toBe('$132.58'); });

it('shows known zero DPSP match tax even when employee RRSP room is unknown', () => {
  const s = workplacePlan(); s.settings.planAccount = 'rrsp'; s.settings.benefits.employerAccount = 'dpsp';
  const b = computeBudget(s);
  expect(b.rrspDeduction).toBe(0);
  expect(b.taxProvisional).toBe(true);
  expect(b.planMatchIncomeTax).toBe(0);
  expect(b.planMatchPayrollTax).toBe(0);
});
it('never grants more than the absolute FHSA lifetime cap', () => {
  const s = workplacePlan(); s.settings.fhsaRoom = 50000;
  Object.assign(s.settings.rooms, { fhsaState: 'opened', fhsaStatus: 'verified', fhsaOpened: '2023-01-01', fhsaEligibilityConfirmed: true });
  expect(contributionRooms(s.settings, s.tax).fhsa).toBe(40000);
});

it('honours the selected employee-first reduction when DC plus DPSP reaches the same-employer limit', () => {
  const s = workplacePlan(125000, 9, 5); s.settings.benefits.employerAccount = 'dpsp';
  const b = computeBudget(s);
  expect(b.retirementContribution).toBe(7500);
  expect(b.employerMatch).toBe(11250);
  expect(b.planMatch).toBe(3750);
  expect(b.pensionAdjustment).toBe(22500);
  expect(b.plans.dpspLimited).toBe(true);
});

it('normalizes legacy named plan presets without retaining identifying names in exported settings', () => {
  const original = workplacePlan();
  const raw = JSON.parse(JSON.stringify(original));
  raw.settings.benefits.planKind = 'legacyEmployerPreset';
  raw.settings.benefits.employerAccount = 'epsp';
  const restored = sanitizeState(raw);
  expect(restored.settings.benefits.planKind).toBe('profitSharing');
  expect(JSON.stringify(restored)).not.toContain('legacyEmployerPreset');
  expect(computeBudget(restored).pensionAdjustment).toBe(15000);
  expect(computeBudget(restored).planMatch).toBe(3750);
  expect(computeBudget(restored).planMatchPayrollTax).toBe(0);
  expect(restored.settings.retirementPct).toBe(original.settings.retirementPct);
});
