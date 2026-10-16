import type { Bracket, TaxParams } from './params';

/** Annual C$ amounts that feed one tax calculation. */
export interface TaxInput {
  employment: number;
  /** Non-cash benefits can be taxable without being CPP pensionable or EI insurable. */
  pensionableEmployment?: number;
  insurableEmployment?: number;
  selfEmployment: number; // net profit; may be negative (a loss)
  other: number;
  eligibleDividends: number; // actual cash received
  nonEligibleDividends: number;
  capitalGains: number; // realized gain, before inclusion
  /** Foreign-source slices of the above (already included in the totals). */
  foreignBusiness: number;
  foreignNonBusiness: number;
  foreignTaxBusiness: number;
  foreignTaxNonBusiness: number;
  rrspDeduction: number;
  fhsaDeduction: number;
  /** Your registered pension plan contributions (deducted in full, no RRSP room used). */
  rppDeduction: number;
  otherDeductions: number;
}

export const EMPTY_INPUT: TaxInput = {
  employment: 0,
  selfEmployment: 0,
  other: 0,
  eligibleDividends: 0,
  nonEligibleDividends: 0,
  capitalGains: 0,
  foreignBusiness: 0,
  foreignNonBusiness: 0,
  foreignTaxBusiness: 0,
  foreignTaxNonBusiness: 0,
  rrspDeduction: 0,
  fhsaDeduction: 0,
  rppDeduction: 0,
  otherDeductions: 0,
};

export interface TaxResult {
  totalIncome: number;
  // Payroll
  cppEmployeeBase: number;
  cppEmployeeEnhanced: number;
  cppEmployee2: number;
  ei: number;
  cppSelfBase: number; // credit portion (employee-equivalent base)
  cppSelfDeductible: number; // employer-equivalent base + enhanced + CPP2
  cppTotal: number;
  // Income
  netIncome: number;
  taxableIncome: number;
  // Federal
  federalBeforeCredits: number;
  federalBpa: number;
  federalCredits: number;
  federalDividendCredit: number;
  federalTax: number; // after credits, before foreign tax credit
  // Ontario
  ontarioBeforeCredits: number;
  ontarioCredits: number;
  ontarioDividendCredit: number;
  ontarioBasic: number;
  ontarioSurtax: number;
  ontarioReduction: number;
  ontarioHealthPremium: number;
  ontarioTax: number; // incl. health premium, before foreign tax credit
  // Foreign
  foreignTaxPaid: number;
  foreignTaxCredit: number;
  // Totals
  incomeTax: number; // federal + Ontario (net of FTC), excludes foreign tax paid
  totalDeducted: number; // incomeTax + CPP + EI + foreign tax paid
  afterTax: number; // totalIncome (cash) - totalDeducted
}

function bracketTax(income: number, brackets: Bracket[]): number {
  let tax = 0;
  let prev = 0;
  for (const b of brackets) {
    const top = b.upTo ?? Infinity;
    if (income > prev) tax += (Math.min(income, top) - prev) * b.rate;
    prev = top;
  }
  return tax;
}

export function marginalBracketRate(income: number, brackets: Bracket[]): number {
  for (const b of brackets) if (b.upTo === null || income < b.upTo) return b.rate;
  return brackets[brackets.length - 1].rate;
}

export function ontarioHealthPremium(taxable: number): number {
  if (taxable <= 20000) return 0;
  if (taxable <= 36000) return Math.min(300, 0.06 * (taxable - 20000));
  if (taxable <= 48000) return Math.min(450, 300 + 0.06 * (taxable - 36000));
  if (taxable <= 72000) return Math.min(600, 450 + 0.25 * (taxable - 48000));
  if (taxable <= 200000) return Math.min(750, 600 + 0.25 * (taxable - 72000));
  return Math.min(900, 750 + 0.25 * (taxable - 200000));
}

const clamp0 = (n: number) => Math.max(0, n);

export function calculateTax(input: TaxInput, p: TaxParams): TaxResult {
  const E = clamp0(input.employment);
  const pensionable = clamp0(input.pensionableEmployment ?? E);
  const insurable = clamp0(input.insurableEmployment ?? E);
  const S = input.selfEmployment;
  const Spos = clamp0(S);

  // --- Employee CPP / EI -----------------------------------------------------
  const empBand = Math.min(clamp0(pensionable - p.cppBasicExemption), p.cppYmpe - p.cppBasicExemption);
  const cppEmployeeBase = empBand * p.cppBaseRate;
  const cppEmployeeEnhanced = empBand * p.cppFirstEnhancedRate;
  const cppEmployee2 = Math.min(clamp0(pensionable - p.cppYmpe), p.cppYampe - p.cppYmpe) * p.cpp2Rate;
  const ei = Math.min(insurable, p.eiMaxInsurable) * p.eiRate;

  // --- Self-employed CPP (both halves on earnings not already covered by salary)
  const seBand = clamp0(Math.min(pensionable + Spos, p.cppYmpe) - Math.max(pensionable, p.cppBasicExemption));
  const se2Band = clamp0(Math.min(pensionable + Spos, p.cppYampe) - Math.max(pensionable, p.cppYmpe));
  const cppSelfBase = seBand * p.cppBaseRate;
  const cppSelfDeductible =
    seBand * (p.cppBaseRate + 2 * p.cppFirstEnhancedRate) + se2Band * 2 * p.cpp2Rate;
  const cppTotal = cppEmployeeBase + cppEmployeeEnhanced + cppEmployee2 + cppSelfBase + cppSelfDeductible;

  // --- Net & taxable income -------------------------------------------------
  const eligGrossed = clamp0(input.eligibleDividends) * (1 + p.eligibleDivGrossUp);
  const nonEligGrossed = clamp0(input.nonEligibleDividends) * (1 + p.nonEligibleDivGrossUp);
  const taxableGains = clamp0(input.capitalGains) * p.capitalGainsInclusion;

  const totalIncome =
    E + S + input.other + clamp0(input.eligibleDividends) + clamp0(input.nonEligibleDividends) + clamp0(input.capitalGains);

  const deductions =
    cppEmployeeEnhanced +
    cppEmployee2 +
    cppSelfDeductible +
    clamp0(input.rrspDeduction) +
    clamp0(input.fhsaDeduction) +
    clamp0(input.rppDeduction) +
    clamp0(input.otherDeductions);

  const netIncome = clamp0(E + S + input.other + eligGrossed + nonEligGrossed + taxableGains - deductions);
  const taxableIncome = netIncome;

  // --- Federal ---------------------------------------------------------------
  const fedLow = p.federalBrackets[0].rate;
  const federalBeforeCredits = bracketTax(taxableIncome, p.federalBrackets);
  const federalBpa =
    netIncome <= p.federalBpaPhaseStart
      ? p.federalBpaMax
      : netIncome >= p.federalBpaPhaseEnd
        ? p.federalBpaMin
        : p.federalBpaMax -
          ((netIncome - p.federalBpaPhaseStart) * (p.federalBpaMax - p.federalBpaMin)) /
            (p.federalBpaPhaseEnd - p.federalBpaPhaseStart);
  const cea = Math.min(E, p.canadaEmploymentAmount);
  const federalCredits = fedLow * (federalBpa + cppEmployeeBase + cppSelfBase + ei + cea);
  const federalDividendCredit =
    eligGrossed * p.eligibleDivFedCredit + nonEligGrossed * p.nonEligibleDivFedCredit;
  const federalTax = clamp0(federalBeforeCredits - federalCredits - federalDividendCredit);

  // --- Ontario ---------------------------------------------------------------
  const onLow = p.ontarioBrackets[0].rate;
  const ontarioBeforeCredits = bracketTax(taxableIncome, p.ontarioBrackets);
  const ontarioCredits = onLow * (p.ontarioBpa + cppEmployeeBase + cppSelfBase + ei);
  const ontarioDividendCredit =
    eligGrossed * p.eligibleDivOnCredit + nonEligGrossed * p.nonEligibleDivOnCredit;
  const ontarioBasic = clamp0(ontarioBeforeCredits - ontarioCredits - ontarioDividendCredit);
  const ontarioSurtax =
    p.ontarioSurtaxR1 * clamp0(ontarioBasic - p.ontarioSurtaxT1) +
    p.ontarioSurtaxR2 * clamp0(ontarioBasic - p.ontarioSurtaxT2);
  const onWithSurtax = ontarioBasic + ontarioSurtax;
  const ontarioReduction = Math.min(onWithSurtax, clamp0(2 * p.ontarioReductionBasic - onWithSurtax));
  const ontarioHealthPremiumAmt = ontarioHealthPremium(taxableIncome);
  const ontarioTax = onWithSurtax - ontarioReduction + ontarioHealthPremiumAmt;

  // --- Foreign tax credit ------------------------------------------------------
  // Business income: federal credit only, limited to the federal tax on that income.
  // Non-business income: federal first, then Ontario for any remainder.
  const share = (x: number) => (netIncome > 0 ? Math.min(1, clamp0(x) / netIncome) : 0);
  const fedCapBiz = federalTax * share(input.foreignBusiness);
  const fedCapNonBiz = federalTax * share(input.foreignNonBusiness);
  const ftcFedBiz = Math.min(clamp0(input.foreignTaxBusiness), fedCapBiz);
  const ftcFedNonBiz = Math.min(clamp0(input.foreignTaxNonBusiness), fedCapNonBiz);
  const ftcOn = Math.min(
    clamp0(input.foreignTaxNonBusiness) - ftcFedNonBiz,
    (ontarioTax - ontarioHealthPremiumAmt) * share(input.foreignNonBusiness),
  );
  const foreignTaxCredit = ftcFedBiz + ftcFedNonBiz + clamp0(ftcOn);
  const foreignTaxPaid = clamp0(input.foreignTaxBusiness) + clamp0(input.foreignTaxNonBusiness);

  const incomeTax = federalTax + ontarioTax - foreignTaxCredit;
  const totalDeducted = incomeTax + cppTotal + ei + foreignTaxPaid;

  return {
    totalIncome,
    cppEmployeeBase,
    cppEmployeeEnhanced,
    cppEmployee2,
    ei,
    cppSelfBase,
    cppSelfDeductible,
    cppTotal,
    netIncome,
    taxableIncome,
    federalBeforeCredits,
    federalBpa,
    federalCredits,
    federalDividendCredit,
    federalTax,
    ontarioBeforeCredits,
    ontarioCredits,
    ontarioDividendCredit,
    ontarioBasic,
    ontarioSurtax,
    ontarioReduction,
    ontarioHealthPremium: ontarioHealthPremiumAmt,
    ontarioTax,
    foreignTaxPaid,
    foreignTaxCredit,
    incomeTax,
    totalDeducted,
    afterTax: totalIncome - totalDeducted,
  };
}
