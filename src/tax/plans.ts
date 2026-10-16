import type { Settings } from '../state/model';
import type { TaxParams } from './params';

export const positive = (v: number | null | undefined) => Math.max(0, v ?? 0);
const capped = (v: number, cap: number | null) => cap === null ? v : Math.min(v, positive(cap));

export function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value;
}
export function addMonths(value: string, months: number): string {
  if (!validDate(value)) return '';
  const d = new Date(`${value}T00:00:00Z`);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + Math.floor(positive(months)));
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
}

/** Monthly salary convention: complete months / 12, partial months by calendar days. */
export function yearFraction(year: number, start: string, end = `${year + 1}-01-01`): number {
  if (!validDate(start) || !validDate(end)) return 0;
  const from = Math.max(Date.parse(start), Date.UTC(year, 0, 1));
  const until = Math.min(Date.parse(end), Date.UTC(year + 1, 0, 1));
  let result = 0;
  for (let m = 0; m < 12; m++) {
    const a = Date.UTC(year, m, 1), b = Date.UTC(year, m + 1, 1);
    result += Math.max(0, Math.min(b, until) - Math.max(a, from)) / (b - a) / 12;
  }
  return Math.min(1, result);
}

function planDates(st: Settings) {
  const b = st.benefits;
  const later = (date: string) => validDate(b.employmentStart) && validDate(date)
    ? (date > b.employmentStart ? date : b.employmentStart) : date;
  return {
    retirement: later(b.retirementStart || addMonths(b.employmentStart, b.retirementWaitMonths)),
    savings: later(b.savingsStart || addMonths(b.employmentStart, b.savingsWaitMonths)),
  };
}

export function calculatePlans(st: Settings, p: TaxParams, annualSalary: number) {
  const b = st.benefits, dates = planDates(st);
  const calendar = b.mode === 'calendar';
  const employmentFraction = calendar ? yearFraction(p.year, b.employmentStart) : 1;
  const retirementFraction = calendar ? yearFraction(p.year, dates.retirement) * (employmentFraction > 0 ? 1 : 0) : 1;
  const savingsFraction = calendar ? yearFraction(p.year, dates.savings) * (employmentFraction > 0 ? 1 : 0) : 1;
  const earnings = positive(b.eligibleAnnualEarnings ?? annualSalary);
  const empRate = capped(positive(st.retirementPct), b.retirementEmployeeMaxPct) / 100;
  const savingsRate = capped(positive(st.planPct), b.savingsEmployeeMaxPct) / 100;
  let employee = capped(earnings, b.employeeEarningsCap) * empRate * retirementFraction;
  const employerBase = capped(earnings, b.employerEarningsCap);
  let automatic = capped(employerBase * positive(b.automaticPct) / 100 * retirementFraction, b.automaticMax);
  const initialRate = positive(st.matchRate) / 100;
  let weightedMatchRate = initialRate * retirementFraction;
  if (b.matchStepYear !== null && b.laterMatchRate !== null) {
    if (calendar && validDate(dates.retirement)) {
      const anniversary = addMonths(dates.retirement, Math.max(0, b.matchStepYear - 1) * 12);
      const laterFraction = Math.min(retirementFraction, yearFraction(p.year, anniversary));
      weightedMatchRate = initialRate * (retirementFraction - laterFraction) + b.laterMatchRate / 100 * laterFraction;
    } else if (b.membershipYear >= b.matchStepYear) weightedMatchRate = b.laterMatchRate / 100 * retirementFraction;
  }
  let matching = capped(employerBase * Math.min(empRate, st.matchCapPct === null ? empRate : positive(st.matchCapPct) / 100) * weightedMatchRate, st.matchMax);
  const requested = employee + automatic + matching;
  const dcLimit = Math.min(positive(p.moneyPurchaseLimit), earnings * employmentFraction * p.rrspEarnedIncomeRate);
  const limited = st.retirementType === 'dcPension' && requested > dcLimit;
  if (limited) {
    if (b.limitAllocation === 'proportional') {
      const ratio = dcLimit / requested;
      employee *= ratio; automatic *= ratio; matching *= ratio;
    } else {
      // Budget convention: reserve automatic and matching benefits, reduce employee first.
      employee = Math.min(employee, Math.max(0, dcLimit - automatic - matching));
      matching = Math.min(matching, Math.max(0, dcLimit - automatic));
      automatic = Math.min(automatic, dcLimit);
    }
  }
  const savingsBase = capped(earnings, b.savingsEarningsCap);
  const savingsEmployee = savingsBase * savingsRate * savingsFraction;
  let savingsMatch = capped(savingsBase * Math.min(savingsRate, st.planMatchCapPct === null ? savingsRate : positive(st.planMatchCapPct) / 100) * positive(st.planMatchRate) / 100 * savingsFraction, st.planMatchMax);
  // A DPSP has its own pension credit and annual limit. EPSP does not.
  if (b.employerAccount === 'dpsp') savingsMatch = Math.min(savingsMatch, p.moneyPurchaseLimit / 2, earnings * employmentFraction * p.rrspEarnedIncomeRate);
  const dpspLimited = st.retirementType === 'dcPension' && b.employerAccount === 'dpsp' && employee + automatic + matching + savingsMatch > dcLimit;
  if (dpspLimited) {
    if (b.limitAllocation === 'proportional') {
      const ratio = dcLimit / (employee + automatic + matching + savingsMatch);
      employee *= ratio; automatic *= ratio; matching *= ratio; savingsMatch *= ratio;
    } else {
      // Apply the same chosen convention across both plans of this employer.
      let excess = employee + automatic + matching + savingsMatch - dcLimit;
      const reduce = (amount: number) => { const cut = Math.min(amount, excess); excess -= cut; return amount - cut; };
      employee = reduce(employee);
      matching = reduce(matching);
      savingsMatch = reduce(savingsMatch);
      automatic = reduce(automatic);
    }
  }
  return { employee, automatic, matching, savingsEmployee, savingsMatch, dates, employmentFraction,
    retirementFraction, savingsFraction, limited, dpspLimited, dcLimit, earnings };
}
