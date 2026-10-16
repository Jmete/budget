// Federal + Ontario assumptions by tax year. Every value is editable in the app's
// "Tax assumptions" panel and travels with the exported config.

export interface Bracket {
  /** Upper limit of the bracket in C$; null for the top bracket. */
  upTo: number | null;
  rate: number;
}

export interface TaxParams {
  year: number;
  // CPP / EI
  cppBasicExemption: number;
  cppYmpe: number;
  cppYampe: number;
  cppBaseRate: number; // employee base portion (credit)
  cppFirstEnhancedRate: number; // employee first-enhanced portion (deduction)
  cpp2Rate: number; // employee CPP2 rate
  eiMaxInsurable: number;
  eiRate: number;
  // Federal
  federalBrackets: Bracket[];
  federalBpaMax: number;
  federalBpaMin: number;
  federalBpaPhaseStart: number;
  federalBpaPhaseEnd: number;
  canadaEmploymentAmount: number;
  // Ontario
  ontarioBrackets: Bracket[];
  ontarioBpa: number;
  ontarioSurtaxT1: number;
  ontarioSurtaxT2: number;
  ontarioSurtaxR1: number;
  ontarioSurtaxR2: number;
  ontarioReductionBasic: number;
  // Investment income
  capitalGainsInclusion: number;
  eligibleDivGrossUp: number;
  eligibleDivFedCredit: number; // % of grossed-up dividend
  eligibleDivOnCredit: number;
  nonEligibleDivGrossUp: number;
  nonEligibleDivFedCredit: number;
  nonEligibleDivOnCredit: number;
  // Registered account limits (used for warnings and deduction caps)
  rrspDollarLimit: number;
  rrspEarnedIncomeRate: number;
  /** Yearly cap on combined employee + employer DC pension contributions. */
  moneyPurchaseLimit: number;
  fhsaAnnualLimit: number;
  fhsaLifetimeLimit: number;
  tfsaAnnualLimit: number;
}

export const TAX_2026: TaxParams = {
  year: 2026,
  cppBasicExemption: 3500,
  cppYmpe: 74600,
  cppYampe: 85000,
  cppBaseRate: 0.0495,
  cppFirstEnhancedRate: 0.01,
  cpp2Rate: 0.04,
  eiMaxInsurable: 68900,
  eiRate: 0.0163,
  federalBrackets: [
    { upTo: 58523, rate: 0.14 },
    { upTo: 117045, rate: 0.205 },
    { upTo: 181440, rate: 0.26 },
    { upTo: 258482, rate: 0.29 },
    { upTo: null, rate: 0.33 },
  ],
  federalBpaMax: 16452,
  federalBpaMin: 14829,
  federalBpaPhaseStart: 181440,
  federalBpaPhaseEnd: 258482,
  canadaEmploymentAmount: 1501,
  ontarioBrackets: [
    { upTo: 53891, rate: 0.0505 },
    { upTo: 107785, rate: 0.0915 },
    { upTo: 150000, rate: 0.1116 },
    { upTo: 220000, rate: 0.1216 },
    { upTo: null, rate: 0.1316 },
  ],
  ontarioBpa: 12989,
  ontarioSurtaxT1: 5818,
  ontarioSurtaxT2: 7446,
  ontarioSurtaxR1: 0.2,
  ontarioSurtaxR2: 0.36,
  ontarioReductionBasic: 300,
  capitalGainsInclusion: 0.5,
  eligibleDivGrossUp: 0.38,
  eligibleDivFedCredit: 0.150198,
  eligibleDivOnCredit: 0.1,
  nonEligibleDivGrossUp: 0.15,
  nonEligibleDivFedCredit: 0.090301,
  nonEligibleDivOnCredit: 0.029863,
  rrspDollarLimit: 33810,
  rrspEarnedIncomeRate: 0.18,
  moneyPurchaseLimit: 35390,
  fhsaAnnualLimit: 8000,
  fhsaLifetimeLimit: 40000,
  tfsaAnnualLimit: 7000,
};

/**
 * 2027 figures published so far: EI (CEIC, September 2026) and the RRSP dollar limit.
 * CRA publishes the rest of the 2027 indexation in November; until then these stay at 2026 values.
 */
export const TAX_2027: TaxParams = {
  ...TAX_2026,
  year: 2027,
  eiMaxInsurable: 70800,
  eiRate: 0.0164,
  rrspDollarLimit: 35390,
};

/** Figures in TAX_2027 still carried over from 2026, shown as a planning note. */
export const PENDING_2027 = 'Federal and Ontario brackets and credits, CPP limits, the DC pension (money purchase) limit and the TFSA limit';

const BUILT_IN: Record<number, TaxParams> = { 2026: TAX_2026, 2027: TAX_2027 };

export const DEFAULT_TAX = TAX_2027;

/** The built-in assumptions for a year, or the current default for years without them. */
export const defaultTaxFor = (year: number): TaxParams => BUILT_IN[year] ?? DEFAULT_TAX;
export const hasBuiltInTax = (year: number) => year in BUILT_IN;

/**
 * Parameters after switching planning year. Unedited built-in figures follow the new
 * year; edited or custom figures are kept and only the year changes.
 */
export function paramsForYear(current: TaxParams, year: number): TaxParams {
  const unedited = hasBuiltInTax(current.year) && JSON.stringify(current) === JSON.stringify(BUILT_IN[current.year]);
  return unedited && hasBuiltInTax(year) ? structuredClone(BUILT_IN[year]) : { ...current, year };
}
