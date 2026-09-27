import {
  perYear,
  type AccountKind,
  type BudgetState,
  type ExpenseItem,
  type IncomeItem,
  type IncomeKind,
} from '../state/model';
import { calculateTax, EMPTY_INPUT, marginalBracketRate, type TaxInput, type TaxResult } from './engine';

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
  byKind: Record<IncomeKind, number>;
  grossIncome: number; // cash in, before anything (incl. tax-free)
  taxableSources: number; // gross less tax-free
  salary: number;
  consulting: number;

  tax: TaxResult;
  taxNoDeductions: TaxResult;
  taxNoConsulting: TaxResult;
  afterTax: number; // annual, incl. tax-free income
  deductionSavings: number; // RRSP + FHSA tax savings
  consultingSetAside: number; // annual tax + CPP attributable to consulting income
  effectiveRate: number; // (income tax + CPP + EI + foreign) / gross
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
  planMatchTax: number; // net tax, CPP and EI on it, after any RRSP deduction
  totalInvested: number;

  essentials: number;
  lifestyle: number;
  expenses: number;
  byCategory: { category: string; annual: number }[];

  cashAfterContributions: number;
  unallocated: number; // annual; negative = shortfall
  savingsRate: number; // (personal contributions + max(0, unallocated)) / after-tax

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

function matchOn(contribution: number, salary: number, rate: number | null, capPct: number | null, max: number | null) {
  if (!rate || rate <= 0) return 0;
  const eligible = capPct != null ? Math.min(contribution, (salary * capPct) / 100) : contribution;
  const match = (eligible * rate) / 100;
  return max != null && max > 0 ? Math.min(match, max) : match;
}

export function computeBudget(state: BudgetState): Budget {
  const { settings: st, tax: p } = state;
  const warnings: Warning[] = [];

  // --- Income -----------------------------------------------------------------
  const incomeLines: Record<string, IncomeLine> = {};
  const byKind = {
    employment: 0,
    selfEmployment: 0,
    other: 0,
    eligibleDividend: 0,
    nonEligibleDividend: 0,
    capitalGain: 0,
    taxFree: 0,
  } as Record<IncomeKind, number>;
  for (const item of state.income) {
    const annualCad = annual(item.amount, item.freq) * toCad(item, st.fx);
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
  const ofSalary = (pct: number | null) => (Math.max(0, salary) * Math.max(0, pct ?? 0)) / 100;

  // Workplace retirement plan. A group RRSP is just an RRSP paid through payroll;
  // a DC pension is a separate registered plan with its own deduction.
  const dcPension = st.retirementType === 'dcPension';
  const retirementContribution = ofSalary(st.retirementPct);
  if (!dcPension) contributions.rrsp += retirementContribution;
  const employerMatch = matchOn(retirementContribution, salary, st.matchRate, st.matchCapPct, st.matchMax);

  // Employee savings / share purchase plan.
  const planContribution = ofSalary(st.planPct);
  contributions[st.planAccount] += planContribution;
  const planMatch = matchOn(planContribution, salary, st.planMatchRate, st.planMatchCapPct, st.planMatchMax);

  const personalContributions =
    Object.values(contributions).reduce((a, b) => a + b, 0) + (dcPension ? retirementContribution : 0);

  // Employer contributions to a group RRSP or savings plan are taxable employment
  // income (with CPP and EI). Those paid into an RRSP are then deductible like your own.
  // Employer DC pension contributions aren't taxed; they reduce next year's RRSP room instead.
  const groupRrspMatch = dcPension ? 0 : employerMatch;
  const taxableBenefits = groupRrspMatch + planMatch;
  const rrspContributed = contributions.rrsp + groupRrspMatch + (st.planAccount === 'rrsp' ? planMatch : 0);
  const tfsaContributed = contributions.tfsa + (st.planAccount === 'tfsa' ? planMatch : 0);
  const pensionAdjustment = dcPension ? retirementContribution + employerMatch : 0;

  // Deduction limits
  const earnedIncome = Math.max(0, salary + taxableBenefits + consulting);
  const estNewRrspRoom = Math.max(0, Math.min(p.rrspDollarLimit, earnedIncome * p.rrspEarnedIncomeRate) - pensionAdjustment);
  const rrspDeductionFor = (contributed: number) => Math.min(contributed, st.rrspRoom ?? Infinity);
  const rrspDeduction = rrspDeductionFor(rrspContributed);
  if (st.rrspRoom != null && rrspContributed > st.rrspRoom) {
    warnings.push({
      level: 'warning',
      text: `RRSP contributions${rrspContributed > contributions.rrsp ? ' (including employer contributions)' : ''} exceed your room by ${fmt(rrspContributed - st.rrspRoom)}. Only ${fmt(rrspDeduction)} is deducted, and over-contributions beyond C$2,000 are charged 1% per month.`,
    });
  } else if (st.rrspRoom == null && rrspContributed > estNewRrspRoom && rrspContributed > 0) {
    warnings.push({
      level: 'info',
      text: `Your RRSP total (${fmt(rrspContributed)}/yr) is above the room this income creates (about ${fmt(estNewRrspRoom)}). That's fine if you have unused room. Check your Notice of Assessment and enter it under Contribution room.`,
    });
  }

  if (dcPension && pensionAdjustment > 0) {
    const dcLimit = Math.min(p.moneyPurchaseLimit, Math.max(0, salary) * p.rrspEarnedIncomeRate);
    if (pensionAdjustment > dcLimit) {
      warnings.push({
        level: 'warning',
        text: `DC pension contributions of ${fmt(pensionAdjustment)}/yr (yours plus your employer's) are above the ${fmt(dcLimit)} limit for this salary. Your plan will stop contributions at the limit.`,
      });
    }
    warnings.push({
      level: 'info',
      text: `Your DC pension contributions (${fmt(pensionAdjustment)}/yr, yours plus your employer's) are reported as a pension adjustment, which lowers next year's RRSP room to about ${fmt(estNewRrspRoom)}.`,
    });
  }

  const fhsaRoom = st.fhsaRoom ?? p.fhsaAnnualLimit;
  const fhsaDeduction = Math.min(contributions.fhsa, fhsaRoom);
  if (contributions.fhsa > fhsaRoom) {
    warnings.push({
      level: 'warning',
      text: `FHSA contributions of ${fmt(contributions.fhsa)}/yr exceed ${st.fhsaRoom != null ? 'your room' : 'the annual limit'} of ${fmt(fhsaRoom)}. Only ${fmt(fhsaDeduction)} is deducted.`,
    });
  }

  const tfsaRoom = st.tfsaRoom ?? p.tfsaAnnualLimit;
  if (tfsaContributed > tfsaRoom) {
    warnings.push({
      level: st.tfsaRoom != null ? 'warning' : 'info',
      text:
        st.tfsaRoom != null
          ? `TFSA contributions of ${fmt(tfsaContributed)}/yr exceed your room of ${fmt(tfsaRoom)}. Excess amounts are taxed 1% per month.`
          : `TFSA contributions of ${fmt(tfsaContributed)}/yr are above the ${p.year} limit of ${fmt(p.tfsaAnnualLimit)}. That's fine if you have carry-forward room. Enter it under Contribution room to check.`,
    });
  }

  // --- Tax --------------------------------------------------------------------------
  const input = buildTaxInput(state, incomeLines);
  input.rrspDeduction = rrspDeduction;
  input.fhsaDeduction = fhsaDeduction;
  input.rppDeduction = dcPension ? retirementContribution : 0;
  input.otherDeductions = st.otherDeductions ?? 0;
  input.employment += taxableBenefits;

  const tax = calculateTax(input, p);
  // Net tax, CPP and EI caused by an employer contribution, after any RRSP deduction it earns.
  const taxOnBenefit = (benefit: number, rrspPart: number) =>
    benefit > 0
      ? tax.totalDeducted -
        calculateTax({ ...input, employment: input.employment - benefit, rrspDeduction: rrspDeductionFor(rrspContributed - rrspPart) }, p)
          .totalDeducted
      : 0;
  const employerMatchTax = taxOnBenefit(groupRrspMatch, groupRrspMatch);
  const planMatchTax = taxOnBenefit(planMatch, st.planAccount === 'rrsp' ? planMatch : 0);
  const taxNoDeductions = calculateTax({ ...input, rrspDeduction: 0, fhsaDeduction: 0 }, p);
  const taxNoConsulting = calculateTax(
    { ...input, selfEmployment: 0, foreignBusiness: 0, foreignTaxBusiness: 0 },
    p,
  );

  // Employer contributions are taxed but never reach your bank account.
  const afterTax = tax.afterTax + byKind.taxFree - taxableBenefits;
  const deductionSavings = taxNoDeductions.totalDeducted - tax.totalDeducted;
  const consultingSetAside = Math.max(0, tax.totalDeducted - taxNoConsulting.totalDeducted);

  const step = 100;
  const bumpSal = calculateTax({ ...input, employment: input.employment + step }, p);
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
  const cat = new Map<string, number>();
  for (const e of [...state.essentials, ...state.lifestyle]) {
    const a = annual(e.amount, e.freq);
    if (a > 0) cat.set(e.category, (cat.get(e.category) ?? 0) + a);
  }
  const byCategory = [...cat.entries()]
    .map(([category, annual]) => ({ category, annual }))
    .sort((a, b) => b.annual - a.annual);

  const cashAfterContributions = afterTax - personalContributions;
  const unallocated = cashAfterContributions - expenses;
  const savingsRate = afterTax > 0 ? (personalContributions + Math.max(0, unallocated)) / afterTax : 0;

  if (unallocated < -0.5) {
    warnings.unshift({
      level: 'warning',
      text: `You're spending and saving ${fmt(-unallocated / 12)}/month more than you take home.`,
    });
  }

  return {
    incomeLines,
    byKind,
    grossIncome,
    taxableSources,
    salary,
    consulting,
    tax,
    taxNoDeductions,
    taxNoConsulting,
    afterTax,
    deductionSavings,
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
    byCategory,
    cashAfterContributions,
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
  let fhsaTotal = 0;
  const out: ProjectionPoint[] = [{ year: 0, contributed: 0, growth: 0, balance: 0 }];
  for (let y = 1; y <= years; y++) {
    const fhsa = Math.max(0, Math.min(b.contributions.fhsa, fhsaLifetime - fhsaTotal));
    fhsaTotal += fhsa;
    const yearly = b.totalInvested - b.contributions.fhsa + fhsa;
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
  }).format(n);
}
