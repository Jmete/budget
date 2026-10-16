import {
  INCOME_ORDER,
  perYear,
  type AccountKind,
  type BudgetState,
  type ExpenseItem,
  type IncomeItem,
  type IncomeKind,
} from '../state/model';
import { calculatePlans, positive, yearFraction, validDate } from './plans';
import { contributionRooms } from './rooms';
import { calculateTax, EMPTY_INPUT, marginalBracketRate, type TaxInput, type TaxResult } from './engine';
import { hasBuiltInTax, PENDING_2027 } from './params';

export interface Warning {
  level: 'info' | 'warning';
  text: string;
}

export interface IncomeLine {
  id: string;
  annualCad: number;
  foreignTax: number;
}

export interface Budget {
  incomeLines: Record<string, IncomeLine>;
  grossIncome: number; // cash in, before anything (incl. tax-free)
  salary: number;
  consulting: number;

  tax: TaxResult;
  taxNoDeductions: TaxResult;
  afterTax: number; // annual, incl. tax-free income
  deductionSavings: number; // RRSP + FHSA tax savings
  /** Savings if contributions to accounts with unknown room were fully deductible; equals deductionSavings when room is known. */
  potentialDeductionSavings: number;
  consultingSetAside: number; // annual Canadian tax + CPP attributable to consulting income (foreign withholding excluded)
  effectiveRate: number; // (income tax + CPP + EI + foreign) / taxable gross income
  marginalSalary: number;
  marginalConsulting: number;

  contributions: Record<AccountKind, number>;
  personalContributions: number;
  rrspDeduction: number;
  fhsaDeduction: number;
  retirementContribution: number; // your payroll contribution to the workplace retirement plan
  employerMatch: number; // employer's retirement plan contribution
  employerMatchTax: number; // net tax, CPP and EI on it (group RRSP only)
  pensionAdjustment: number; // DC pension contributions that reduce next year's RRSP room
  planContribution: number; // your payroll contribution to the employee savings plan
  planMatch: number; // employer's contribution to it, taxed as employment income
  planMatchTax: number | null; // net tax, CPP and EI on it, after any RRSP deduction
  totalInvested: number;
  employerAutomatic: number;
  employerMatching: number;
  planMatchIncomeTax: number | null;
  planMatchPayrollTax: number | null;
  planTaxRange: [number, number];
  roomUsed: { rrsp: number; tfsa: number; fhsa: number };
  roomAvailable: ReturnType<typeof contributionRooms>;
  investedByAccount: Record<string, number>;
  plans: ReturnType<typeof calculatePlans>;
  taxProvisional: boolean;
  actualCashAfterPayroll: number | null;
  taxYear: number;
  calendarMode: boolean;

  essentials: number;
  lifestyle: number;
  expenses: number;
  /** Spending buckets for the savings-only guide; all debt payments count as needs. */
  needs: number;
  wants: number;

  unallocated: number; // annual; negative = shortfall
  savingsRate: number; // personal contributions / after-tax; excludes leftover and employer contributions

  warnings: Warning[];
}

const annual = (amount: number | null, freq: IncomeItem['freq']) => (amount ?? 0) * perYear(freq);

const toCad = (item: IncomeItem, fx: BudgetState['settings']['fx']) =>
  item.currency === 'CAD' ? 1 : (fx[item.currency] ?? 1);

function buildTaxInput(state: BudgetState, lines: Record<string, IncomeLine>) {
  const input: TaxInput = { ...EMPTY_INPUT };
  for (const item of state.income) {
    const { annualCad, foreignTax } = lines[item.id];
    const foreign = item.currency !== 'CAD' || (item.foreignTaxPct ?? 0) > 0;
    switch (item.kind) {
      case 'employment':
        input.employment += annualCad;
        break;
      case 'selfEmployment':
        input.selfEmployment += annualCad;
        break;
      case 'other':
        input.other += annualCad;
        break;
      case 'eligibleDividend':
        // Foreign dividends are never "eligible" for the Canadian dividend credit.
        if (foreign) input.other += annualCad;
        else input.eligibleDividends += annualCad;
        break;
      case 'nonEligibleDividend':
        if (foreign) input.other += annualCad;
        else input.nonEligibleDividends += annualCad;
        break;
      case 'capitalGain':
        input.capitalGains += annualCad;
        break;
      case 'taxFree':
        continue;
    }
    if (foreign) {
      const taxedPortion =
        item.kind === 'capitalGain' ? annualCad * state.tax.capitalGainsInclusion : annualCad;
      if (item.kind === 'selfEmployment') {
        input.foreignBusiness += Math.max(0, taxedPortion);
        input.foreignTaxBusiness += foreignTax;
      } else {
        input.foreignNonBusiness += Math.max(0, taxedPortion);
        input.foreignTaxNonBusiness += foreignTax;
      }
    }
  }
  return input;
}

function sumExpenses(items: ExpenseItem[]) {
  return items.reduce((s, e) => s + annual(e.amount, e.freq), 0);
}

export function computeBudget(state: BudgetState): Budget {
  const { settings: st, tax: p } = state;
  const warnings: Warning[] = [];

  const rules = st.benefits;
  const calendar = rules.mode === 'calendar';
  const employmentFraction = calendar ? yearFraction(p.year, rules.employmentStart) : 1;
  const annualSalary = state.income.filter(i => i.kind === 'employment').reduce((sum, i) => sum + annual(i.amount, i.freq) * toCad(i, st.fx), 0);
  const plans = calculatePlans(st, p, annualSalary);
  const roomAvailable = contributionRooms(st, p);
  if (calendar && !validDate(rules.employmentStart)) warnings.push({ level: 'warning', text: 'Enter your employment start date. Calendar-year salary and plan contributions are excluded until it is known.' });
  if (calendar) warnings.push({ level: 'info', text: 'Calendar-year salary uses complete months / 12 and calendar days for partial months. Monthly figures are annual totals / 12, not the amount on an active-month payslip. Income rows are annualized; other income, investments and expenses remain the annual totals you enter.' });
  if (rules.residency === 'partYearUnknown') warnings.push({ level: 'warning', text: 'Part-year Canadian residency: tax is provisional. This engine uses full-year personal credits and does not determine residency, pre-arrival world income or newcomer credit entitlements. Adjust Tax assumptions using your return or adviser; withholding is separate below.' });
  const builtInYear = hasBuiltInTax(p.year);
  if (!builtInYear) warnings.push({ level: 'warning', text: `Planning year ${p.year}: no built-in tax rates for this year. Review Tax assumptions; saved contribution room only applies to its stated year.` });
  if (p.year === 2027) warnings.push({ level: 'info', text: `2027 uses the published EI rates and RRSP limit. ${PENDING_2027} stay at 2026 values until CRA publishes 2027 indexation (usually in November).` });
  // --- Income -----------------------------------------------------------------
  const incomeLines: Record<string, IncomeLine> = {};
  const byKind = Object.fromEntries(INCOME_ORDER.map((k) => [k, 0])) as Record<IncomeKind, number>;
  for (const item of state.income) {
    const annualCad = annual(item.amount, item.freq) * toCad(item, st.fx) * (item.kind === 'employment' ? employmentFraction : 1);
    const foreignTax = item.kind === 'taxFree' ? 0 : Math.max(0, annualCad) * ((item.foreignTaxPct ?? 0) / 100);
    incomeLines[item.id] = { id: item.id, annualCad, foreignTax };
    byKind[item.kind] += annualCad;
  }
  const grossIncome = Object.values(byKind).reduce((a, b) => a + b, 0);
  const salary = byKind.employment;
  const consulting = byKind.selfEmployment;

  // --- Contributions ------------------------------------------------------------
  const contributions: Record<AccountKind, number> = { rrsp: 0, fhsa: 0, tfsa: 0, nonRegistered: 0, other: 0 };
  for (const i of state.investments) contributions[i.kind] += Math.max(0, annual(i.amount, i.freq));
  for (const k of ['rrsp', 'tfsa', 'fhsa'] as const) contributions[k] += positive(st.rooms[`${k}Elsewhere`]);
  const dcPension = st.retirementType === 'dcPension';
  const retirementContribution = plans.employee;
  const employerMatch = plans.automatic + plans.matching;
  const groupRrspMatch = dcPension ? 0 : employerMatch;
  if (!dcPension) contributions.rrsp += retirementContribution;
  const planContribution = plans.savingsEmployee;
  const planMatch = plans.savingsMatch;
  const rrspAllocation = positive(rules.employeeRrspAllocation);
  const tfsaAllocation = positive(rules.employeeTfsaAllocation);
  const invalidAllocation = rules.employeeSplit && rrspAllocation + tfsaAllocation > 100;
  if (rules.employeeSplit && !invalidAllocation) {
    contributions.rrsp += planContribution * rrspAllocation / 100;
    contributions.tfsa += planContribution * tfsaAllocation / 100;
    contributions.nonRegistered += planContribution * (100 - rrspAllocation - tfsaAllocation) / 100;
  } else if (invalidAllocation) contributions.other += planContribution;
  else contributions[st.planAccount] += planContribution;
  if (invalidAllocation) warnings.push({ level: 'warning', text: 'Savings allocation exceeds 100%. Reduce the RRSP or TFSA percentage. Employee savings remain unallocated with no registered-account deduction or room allocation until corrected.' });
  const personalContributions = Object.values(contributions).reduce((a, b) => a + b, 0) + (dcPension ? retirementContribution : 0);
  const rawDestination = rules.employerAccount;
  const destination = rules.planKind === 'profitSharing' && !['unknown', 'epsp', 'dpsp'].includes(rawDestination) ? 'unknown' : rawDestination;
  const epsp = destination === 'epsp', dpsp = destination === 'dpsp';
  const unknownBenefit = destination === 'unknown' || (!epsp && !dpsp && rules.benefitTreatment === 'unknown');
  const taxablePlanMatch = dpsp || (!epsp && !unknownBenefit && rules.benefitTreatment === 'exempt') ? 0 : planMatch;
  const planPensionable = epsp || dpsp || rules.planKind === 'profitSharing' ? 0 : taxablePlanMatch;
  const planInsurable = epsp || dpsp || rules.planKind === 'profitSharing' || rules.benefitTreatment === 'nonCash' ? 0 : taxablePlanMatch;
  const taxableBenefits = groupRrspMatch + taxablePlanMatch;
  const rrspContributed = contributions.rrsp + groupRrspMatch + (destination === 'rrsp' ? planMatch : 0);
  const tfsaContributed = contributions.tfsa + (destination === 'tfsa' ? planMatch : 0);
  const pensionAdjustment = (dcPension ? retirementContribution + employerMatch : 0) + (dpsp ? planMatch : 0);
  const roomUsed = { rrsp: rrspContributed, tfsa: tfsaContributed, fhsa: contributions.fhsa };
  const rrspDeductionFor = (contributed: number) => Math.min(positive(contributed) + positive(st.rooms.rrspPriorUnused), roomAvailable.rrsp ?? 0);
  const rrspDeduction = rrspDeductionFor(rrspContributed);
  const fhsaDeduction = Math.min(contributions.fhsa, roomAvailable.fhsa ?? 0);
  let taxProvisional = invalidAllocation || (calendar && !validDate(rules.employmentStart)) || rules.residency === 'partYearUnknown' || !builtInYear || (planMatch > 0 && unknownBenefit);
  for (const k of ['rrsp', 'tfsa', 'fhsa'] as const) {
    const available = k === 'rrsp' ? roomAvailable.rrspNewContributions : roomAvailable[k];
    if (available === null) {
      if (roomUsed[k] > 0 || (k === 'rrsp' && st.rooms.rrspPriorUnused > 0)) {
        if (k !== 'tfsa') taxProvisional = true;
        warnings.push({ level: 'warning', text: `${k.toUpperCase()} room is unknown for ${p.year}. Planned contributions of ${fmt(roomUsed[k])} are not confirmed safe. ${k === 'tfsa' ? 'No residency years are assumed.' : 'No deduction based on unknown room is included.'} Enter verified room or a documented estimate.` });
      }
    } else if (roomUsed[k] > available) warnings.push({ level: 'warning', text: `${k.toUpperCase()} contributions exceed available room by ${fmt(roomUsed[k] - available)}. Contributions remain in cash flow; deductions are capped. Excess-contribution tax is not included. Reduce contributions or confirm additional room before contributing.` });
    if (st.rooms[`${k}Status`] === 'estimated' && roomUsed[k] > 0) warnings.push({ level: 'info', text: `${k.toUpperCase()} room is an estimate, not CRA-verified.` });
  }
  if (st.rooms.rrspPriorUnused > (roomAvailable.rrsp ?? Infinity)) warnings.push({ level: 'warning', text: 'Previously unused RRSP contributions already exceed the entered deduction limit. Check CRA records; no automatic $2,000 deduction buffer is allowed.' });
  if (plans.limited || plans.dpspLimited) warnings.push({ level: 'warning', text: `Registered pension savings are capped at ${fmt(plans.dcLimit)}. The selected limit-allocation convention is a budget estimate; confirm how your administrator allocates reductions and forfeitures.` });
  if ((st.retirementPct ?? 0) > (rules.retirementEmployeeMaxPct ?? Infinity) || (st.planPct ?? 0) > (rules.savingsEmployeeMaxPct ?? Infinity)) warnings.push({ level: 'warning', text: 'An employee contribution election exceeds the configured plan maximum. The contribution calculation uses the maximum allowed rate.' });
  if (pensionAdjustment > 0) warnings.push({ level: 'info', text: `Approximate pension adjustment: ${fmt(pensionAdjustment)} for ${p.year}, reducing new RRSP room calculated for ${p.year + 1}. It does not consume today's RRSP room. Use the actual T4 pension adjustment; forfeitures and other adjustments can differ.` });
  if (unknownBenefit && planMatch > 0) warnings.push({ level: 'warning', text: 'Employer savings-match structure is unconfirmed. Budget tax reserves assume a taxable benefit and no unconfirmed employer RRSP deduction. Generic unconfirmed plans include CPP/EI; Separate profit-sharing arrangements use neither because their employer choices are EPSP or DPSP. The match tax is shown as unresolved. Select the actual employer account and benefit treatment from your plan documents.' });
  if (epsp && planMatch > 0) warnings.push({ level: 'info', text: 'EPSP allocations are taxable on T4PS, with no CPP/EI or income-tax withholding on the allocation. Set aside the estimated tax; the shares are not bank-account cash. Enter subsequent taxable investment income separately.' });
  if (dpsp && planMatch > 0) warnings.push({ level: 'info', text: 'DPSP employer contributions generate a pension adjustment and are generally taxed on withdrawal. A DPSP is different from an EPSP. This simplified limit calculation assumes both workplace plans have the same employer.' });

  // --- Tax: benefits have independent income-tax, CPP and EI bases. --------------
  const input = buildTaxInput(state, incomeLines);
  input.rrspDeduction = rrspDeduction;
  input.fhsaDeduction = fhsaDeduction;
  input.rppDeduction = dcPension ? retirementContribution : 0;
  input.otherDeductions = st.otherDeductions ?? 0;
  const otherEmploymentBenefit = epsp || (rules.planKind === 'profitSharing' && unknownBenefit);
  input.employment += groupRrspMatch + (otherEmploymentBenefit ? 0 : taxablePlanMatch);
  input.other += otherEmploymentBenefit ? taxablePlanMatch : 0;
  input.pensionableEmployment = Math.max(0, salary) + groupRrspMatch + planPensionable;
  input.insurableEmployment = Math.max(0, salary) + (rules.groupRrspWithdrawable ? groupRrspMatch : 0) + planInsurable;

  const tax = calculateTax(input, p);
  const withoutGroupMatch = calculateTax({ ...input, employment: input.employment - groupRrspMatch,
    pensionableEmployment: input.pensionableEmployment - groupRrspMatch,
    insurableEmployment: input.insurableEmployment - (rules.groupRrspWithdrawable ? groupRrspMatch : 0),
    rrspDeduction: rrspDeductionFor(rrspContributed - groupRrspMatch) }, p);
  const withoutPlanMatch = calculateTax({ ...input,
    employment: input.employment - (otherEmploymentBenefit ? 0 : taxablePlanMatch), other: input.other - (otherEmploymentBenefit ? taxablePlanMatch : 0),
    pensionableEmployment: input.pensionableEmployment - planPensionable,
    insurableEmployment: input.insurableEmployment - planInsurable,
    rrspDeduction: rrspDeductionFor(rrspContributed - (destination === 'rrsp' ? planMatch : 0)) }, p);
  const employerMatchTax = tax.totalDeducted - withoutGroupMatch.totalDeducted;
  const planTax = tax.totalDeducted - withoutPlanMatch.totalDeducted;
  const unresolvedTax = planMatch > 0 && !dpsp && taxProvisional;
  const planMatchTax = unresolvedTax ? null : planTax;
  const planMatchIncomeTax = unresolvedTax ? null : tax.incomeTax - withoutPlanMatch.incomeTax;
  const planMatchPayrollTax = planMatch > 0 && unknownBenefit && rules.planKind !== 'profitSharing' ? null : (tax.cppTotal - withoutPlanMatch.cppTotal) + (tax.ei - withoutPlanMatch.ei);
  const planTaxRange: [number, number] = unresolvedTax ? [Math.min(0, planTax), Math.max(0, planTax)] : [planTax, planTax];
  const investedByAccount: Record<string, number> = { ...contributions, pension: dcPension ? retirementContribution + employerMatch : 0 };
  if (invalidAllocation) { investedByAccount.other -= planContribution; investedByAccount.unknown = planContribution; }
  investedByAccount.rrsp += groupRrspMatch;
  investedByAccount[destination] = (investedByAccount[destination] ?? 0) + planMatch;
  const taxNoDeductions = calculateTax({ ...input, rrspDeduction: 0, fhsaDeduction: 0 }, p);
  const taxNoConsulting = calculateTax(
    { ...input, selfEmployment: 0, foreignBusiness: 0, foreignTaxBusiness: 0 },
    p,
  );
  // Foreign tax withheld at source is already paid, so it is not part of the set-aside.
  const domesticTax = (t: TaxResult) => t.totalDeducted - t.foreignTaxPaid;

  // Employer contributions are taxed but never reach your bank account.
  const afterTax = tax.afterTax + byKind.taxFree - taxableBenefits;
  const deductionSavings = taxNoDeductions.totalDeducted - tax.totalDeducted;
  // What unknown room would be worth once confirmed: unknown RRSP room deducts everything
  // contributed; unknown FHSA room deducts up to the annual limit.
  const potentialTax = calculateTax({ ...input,
    rrspDeduction: roomAvailable.rrsp === null ? positive(rrspContributed) + positive(st.rooms.rrspPriorUnused) : rrspDeduction,
    fhsaDeduction: roomAvailable.fhsa === null ? Math.min(contributions.fhsa, p.fhsaAnnualLimit) : fhsaDeduction }, p);
  const potentialDeductionSavings = taxNoDeductions.totalDeducted - potentialTax.totalDeducted;
  const consultingSetAside = Math.max(0, domesticTax(tax) - domesticTax(taxNoConsulting));

  const step = 100;
  const bumpSal = calculateTax({ ...input, employment: input.employment + step, pensionableEmployment: input.pensionableEmployment! + step, insurableEmployment: input.insurableEmployment! + step }, p);
  const bumpCon = calculateTax({ ...input, selfEmployment: input.selfEmployment + step }, p);
  const marginalSalary = (bumpSal.totalDeducted - tax.totalDeducted) / step;
  const marginalConsulting = (bumpCon.totalDeducted - tax.totalDeducted) / step;

  const taxableSources = grossIncome - byKind.taxFree + taxableBenefits;
  const effectiveRate = taxableSources > 0 ? tax.totalDeducted / taxableSources : 0;

  if (consulting > 0) {
    warnings.push({
      level: 'info',
      text: `No tax is withheld from consulting income. Set aside about ${fmt(consultingSetAside / 12)}/month for income tax and CPP. If you owe more than C$3,000 at filing, CRA will ask for quarterly instalments.`,
    });
    if (consulting > 30000) {
      warnings.push({
        level: 'info',
        text: 'Consulting revenue over C$30,000 in four quarters requires GST/HST registration. Services exported to non-resident clients are usually zero-rated (0% HST), but Canadian clients are charged 13%.',
      });
    }
  }
  if (tax.foreignTaxPaid > tax.foreignTaxCredit + 1) {
    warnings.push({
      level: 'warning',
      text: `Foreign tax withheld (${fmt(tax.foreignTaxPaid)}) is more than the credit Canada allows (${fmt(tax.foreignTaxCredit)}). Check whether a tax treaty form (for example a US W-8BEN) can reduce the withholding.`,
    });
  }

  // --- Expenses ------------------------------------------------------------------
  const essentials = sumExpenses(state.essentials);
  const lifestyle = sumExpenses(state.lifestyle);
  const expenses = essentials + lifestyle;
  const lifestyleDebt = sumExpenses(state.lifestyle.filter((e) => e.category === 'Debt' || e.category === 'Extra debt repayment'));
  const needs = essentials + lifestyleDebt;
  const wants = lifestyle - lifestyleDebt;

  const unallocated = afterTax - personalContributions - expenses;
  const savingsRate = afterTax > 0 ? personalContributions / afterTax : 0;

  if (unallocated < -0.5) {
    warnings.unshift({
      level: 'warning',
      text: `You're spending and saving ${fmt(-unallocated / 12)}/month more than you take home.`,
    });
  }

  const payrollContributions = retirementContribution + planContribution;
  const actualCashAfterPayroll = rules.incomeTaxWithheld !== null && rules.cppEiWithheld !== null
    ? salary - positive(rules.incomeTaxWithheld) - positive(rules.cppEiWithheld) - payrollContributions : null;
  return {
    employerAutomatic: plans.automatic, employerMatching: plans.matching,
    planMatchIncomeTax, planMatchPayrollTax, planTaxRange, roomUsed, roomAvailable,
    investedByAccount, plans, taxProvisional, actualCashAfterPayroll, taxYear: p.year, calendarMode: calendar,
    incomeLines,
    grossIncome,
    salary,
    consulting,
    tax,
    taxNoDeductions,
    afterTax,
    deductionSavings,
    potentialDeductionSavings,
    consultingSetAside,
    effectiveRate,
    marginalSalary,
    marginalConsulting,
    contributions,
    personalContributions,
    rrspDeduction,
    fhsaDeduction,
    retirementContribution,
    employerMatch,
    employerMatchTax,
    pensionAdjustment,
    planContribution,
    planMatch,
    planMatchTax,
    totalInvested: personalContributions + employerMatch + planMatch,
    essentials,
    lifestyle,
    expenses,
    needs,
    wants,
    unallocated,
    savingsRate,
    warnings,
  };
}

// ---------------------------------------------------------------- projections

export interface ProjectionPoint {
  year: number;
  contributed: number;
  growth: number;
  balance: number;
}

/** Year-by-year balance of all savings, contributions made mid-year on average. */
export function projectSavings(state: BudgetState, b: Budget): ProjectionPoint[] {
  const r = state.settings.returnRate / 100;
  const years = state.settings.horizonYears;
  const fhsaLifetime = state.tax.fhsaLifetimeLimit;
  let balance = 0;
  let contributed = 0;
  let fhsaTotal = positive(state.settings.rooms.fhsaLifetimeUsed);
  const out: ProjectionPoint[] = [{ year: 0, contributed: 0, growth: 0, balance: 0 }];
  for (let y = 1; y <= years; y++) {
    const nextState = { ...state, tax: { ...state.tax, year: state.tax.year + y - 1 },
      settings: { ...state.settings, benefits: { ...state.settings.benefits, membershipYear: state.settings.benefits.membershipYear + y - 1 } } };
    const next = y === 1 ? b : computeBudget(nextState);
    const fhsa = Math.max(0, Math.min(next.contributions.fhsa, fhsaLifetime - fhsaTotal));
    fhsaTotal += fhsa;
    const yearly = next.totalInvested - next.contributions.fhsa + fhsa;
    balance = balance * (1 + r) + yearly * (1 + r / 2);
    contributed += yearly;
    out.push({ year: y, contributed, growth: balance - contributed, balance });
  }
  return out;
}

/**
 * Federal + Ontario income tax rates across taxable income (no CPP/EI).
 *
 * The marginal line is the bracket rate: federal rate + Ontario rate × surtax.
 * It deliberately leaves out the Ontario Health Premium phase-ins and the
 * low-income tax reduction clawback, which only apply over narrow income bands
 * and would otherwise show as spikes. The average line includes everything.
 */
export function rateCurve(state: BudgetState, max: number, points = 600) {
  const p = state.tax;
  const out: { income: number; average: number; marginal: number }[] = [];
  const step = max / points;
  for (let i = 1; i <= points; i++) {
    const income = i * step;
    const t = calculateTax({ ...EMPTY_INPUT, other: income }, p);
    const fed = t.federalTax > 0 ? marginalBracketRate(income, p.federalBrackets) : 0;
    const surtax =
      1 +
      (t.ontarioBasic > p.ontarioSurtaxT1 ? p.ontarioSurtaxR1 : 0) +
      (t.ontarioBasic > p.ontarioSurtaxT2 ? p.ontarioSurtaxR2 : 0);
    const on = t.ontarioBasic > 0 ? marginalBracketRate(income, p.ontarioBrackets) * surtax : 0;
    out.push({ income, average: t.incomeTax / income, marginal: fed + on });
  }
  return out;
}

/** Taxable incomes where the Ontario Health Premium steps up, and by how much. */
export const HEALTH_PREMIUM_STEPS = [
  { from: 20000, to: 25000, amount: 300 },
  { from: 36000, to: 38500, amount: 150 },
  { from: 48000, to: 48600, amount: 150 },
  { from: 72000, to: 72600, amount: 150 },
  { from: 200000, to: 200600, amount: 150 },
];

export function fmt(n: number, digits = 0) {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(Number(n.toFixed(8)));
}
