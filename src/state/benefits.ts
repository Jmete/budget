import { DEFAULT_TAX } from '../tax/params';

/** Plan rules are separate from personal elections and CRA room amounts. */
export interface BenefitRules {
  planKind: 'generic' | 'profitSharing';
  employeeSplit: boolean;
  employeeRrspAllocation: number;
  employeeTfsaAllocation: number;
  mode: 'annualized' | 'calendar';
  employmentStart: string;
  retirementStart: string;
  savingsStart: string;
  retirementWaitMonths: number;
  savingsWaitMonths: number;
  eligibleAnnualEarnings: number | null;
  employeeEarningsCap: number | null;
  employerEarningsCap: number | null;
  automaticPct: number;
  automaticMax: number | null;
  retirementEmployeeMaxPct: number | null;
  savingsEmployeeMaxPct: number | null;
  savingsEarningsCap: number | null;
  membershipYear: number;
  matchStepYear: number | null;
  laterMatchRate: number | null;
  limitAllocation: 'employeeFirst' | 'proportional';
  employerAccount: 'unknown' | 'nonRegistered' | 'tfsa' | 'rrsp' | 'epsp' | 'dpsp';
  benefitTreatment: 'unknown' | 'nonCash' | 'cash' | 'exempt';
  groupRrspWithdrawable: boolean;
  incomeTaxWithheld: number | null;
  cppEiWithheld: number | null;
  residency: 'fullYear' | 'partYearUnknown';
}

export type RoomStatus = 'unknown' | 'verified' | 'estimated';
export interface RoomDetails {
  year: number;
  rrspStatus: RoomStatus;
  tfsaStatus: RoomStatus;
  fhsaStatus: RoomStatus;
  rrspPriorUnused: number;
  rrspElsewhere: number;
  tfsaElsewhere: number;
  fhsaElsewhere: number;
  tfsaQualifyingYears: string;
  tfsaPastContributions: number | null;
  tfsaPastWithdrawals: number | null;
  /** RRSP estimate inputs: unused room carried forward, last year's earned income and pension adjustment. */
  rrspCarryforward: number | null;
  rrspPriorEarnedIncome: number | null;
  rrspPriorPensionAdjustment: number | null;
  fhsaState: 'unknown' | 'ineligible' | 'notOpened' | 'opened';
  fhsaOpened: string;
  fhsaEligibilityConfirmed: boolean;
  fhsaCarryforward: number | null;
  fhsaLifetimeUsed: number | null;
}

export const DEFAULT_BENEFITS: BenefitRules = {
  planKind: 'generic', employeeSplit: false, employeeRrspAllocation: 0, employeeTfsaAllocation: 0,
  mode: 'annualized', employmentStart: '', retirementStart: '', savingsStart: '',
  retirementWaitMonths: 0, savingsWaitMonths: 0, eligibleAnnualEarnings: null,
  employeeEarningsCap: null, employerEarningsCap: null, automaticPct: 0, automaticMax: null,
  retirementEmployeeMaxPct: null, savingsEmployeeMaxPct: null, savingsEarningsCap: null,
  membershipYear: 1, matchStepYear: null, laterMatchRate: null, limitAllocation: 'employeeFirst',
  employerAccount: 'unknown', benefitTreatment: 'unknown', groupRrspWithdrawable: true,
  incomeTaxWithheld: null, cppEiWithheld: null, residency: 'fullYear',
};
export const DEFAULT_ROOMS: RoomDetails = {
  year: DEFAULT_TAX.year, rrspStatus: 'unknown', tfsaStatus: 'unknown', fhsaStatus: 'unknown',
  rrspPriorUnused: 0, rrspElsewhere: 0, tfsaElsewhere: 0, fhsaElsewhere: 0,
  tfsaQualifyingYears: '', tfsaPastContributions: null, tfsaPastWithdrawals: null,
  rrspCarryforward: null, rrspPriorEarnedIncome: null, rrspPriorPensionAdjustment: null,
  fhsaState: 'unknown', fhsaOpened: '', fhsaEligibilityConfirmed: false,
  fhsaCarryforward: null, fhsaLifetimeUsed: null,
};

const enums: Record<string, readonly string[]> = {
  planKind: ['generic', 'profitSharing'], mode: ['annualized', 'calendar'], limitAllocation: ['employeeFirst', 'proportional'],
  employerAccount: ['unknown', 'nonRegistered', 'tfsa', 'rrsp', 'epsp', 'dpsp'],
  benefitTreatment: ['unknown', 'nonCash', 'cash', 'exempt'], residency: ['fullYear', 'partYearUnknown'],
  rrspStatus: ['unknown', 'verified', 'estimated'], tfsaStatus: ['unknown', 'verified', 'estimated'],
  fhsaStatus: ['unknown', 'verified', 'estimated'], fhsaState: ['unknown', 'ineligible', 'notOpened', 'opened'],
};

/** Whitelist nested imported settings; never spread untrusted JSON into the model. */
export function sanitizeDetails<T extends object>(raw: unknown, defaults: T): T {
  const source = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const out = { ...defaults } as Record<string, unknown>;
  for (const [key, fallback] of Object.entries(defaults)) {
    const v = source[key];
    // Older configs used a named preset for the only non-generic arrangement.
    // Normalize that legacy choice without retaining its name in saved/exported data.
    if (key === 'planKind' && typeof v === 'string' && v && v !== 'generic') out[key] = 'profitSharing';
    else if (enums[key]) { if (typeof v === 'string' && enums[key].includes(v)) out[key] = v; }
    else if (typeof fallback === 'boolean') { if (typeof v === 'boolean') out[key] = v; }
    else if (typeof fallback === 'string') { if (typeof v === 'string') out[key] = v.slice(0, 300); }
    else if (typeof v === 'number' && Number.isFinite(v)) out[key] = Math.max(0, v);
  }
  return out as T;
}
