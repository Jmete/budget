import { DEFAULT_BENEFITS, DEFAULT_ROOMS, sanitizeDetails, type BenefitRules, type RoomDetails } from './benefits';
import { DEFAULT_TAX, defaultTaxFor, type TaxParams } from '../tax/params';
import { roomsForPlanningYear, sanitizeRoomYears, type RoomYearRecord } from './roomYears';

export type Freq = 'week' | 'biweekly' | 'semimonthly' | 'month' | 'quarter' | 'year';

export const FREQS: { value: Freq; label: string; perYear: number }[] = [
  { value: 'week', label: 'Weekly', perYear: 52 },
  { value: 'biweekly', label: 'Every 2 weeks', perYear: 26 },
  { value: 'semimonthly', label: 'Twice a month', perYear: 24 },
  { value: 'month', label: 'Monthly', perYear: 12 },
  { value: 'quarter', label: 'Quarterly', perYear: 4 },
  { value: 'year', label: 'Yearly', perYear: 1 },
];

export const perYear = (f: Freq) => FREQS.find((x) => x.value === f)?.perYear ?? 12;

export type Currency = 'CAD' | 'USD' | 'EUR' | 'GBP' | 'SAR' | 'HKD';
export type ForeignCurrency = Exclude<Currency, 'CAD'>;
export const FOREIGN_CURRENCIES: ForeignCurrency[] = ['USD', 'EUR', 'GBP', 'SAR', 'HKD'];
export const CURRENCIES: Currency[] = ['CAD', ...FOREIGN_CURRENCIES];

export type IncomeKind =
  | 'employment'
  | 'selfEmployment'
  | 'other'
  | 'eligibleDividend'
  | 'nonEligibleDividend'
  | 'capitalGain'
  | 'taxFree';

export const INCOME_KINDS: { value: IncomeKind; label: string; hint: string }[] = [
  {
    value: 'employment',
    label: 'Salary (T4)',
    hint: 'Employment income. CPP and EI are deducted from your pay.',
  },
  {
    value: 'selfEmployment',
    label: 'Consulting',
    hint: 'Net business profit (revenue minus deductible expenses). Taxed at the same rates as salary, but you pay both halves of CPP and no EI, and nothing is withheld, so set tax aside.',
  },
  {
    value: 'other',
    label: 'Interest & other',
    hint: 'Interest, rental profit and other income. Fully taxable. No CPP or EI.',
  },
  {
    value: 'eligibleDividend',
    label: 'Eligible dividends',
    hint: 'Canadian public company dividends. Grossed up 38%, then offset by the dividend tax credit.',
  },
  {
    value: 'nonEligibleDividend',
    label: 'Other dividends',
    hint: 'Non-eligible dividends, usually from a small private corporation. Grossed up 15%, then a smaller dividend tax credit.',
  },
  {
    value: 'capitalGain',
    label: 'Capital gains',
    hint: 'Realized gains in a non-registered account. Only the inclusion rate (50%) is taxable.',
  },
  {
    value: 'taxFree',
    label: 'Tax-free',
    hint: 'Gifts, TFSA withdrawals, GST/HST credit and similar. Counted as cash, never taxed.',
  },
];

export type AccountKind = 'rrsp' | 'fhsa' | 'tfsa' | 'nonRegistered' | 'other';

export const ACCOUNT_KINDS: { value: AccountKind; label: string; hint: string }[] = [
  { value: 'rrsp', label: 'RRSP', hint: 'Tax-deductible. Reduces taxable income up to your contribution room.' },
  { value: 'fhsa', label: 'FHSA', hint: 'Tax-deductible, like an RRSP. C$8,000 per year, C$40,000 lifetime.' },
  { value: 'tfsa', label: 'TFSA', hint: 'Not deductible, but growth and withdrawals are tax-free.' },
  { value: 'nonRegistered', label: 'Non-registered', hint: 'Regular brokerage account. No deduction; growth is taxable.' },
  { value: 'other', label: 'Other savings', hint: 'Emergency fund, RESP, sinking funds. No tax effect.' },
];

export type RetirementType = 'groupRrsp' | 'dcPension';

export const RETIREMENT_TYPES: { value: RetirementType; label: string }[] = [
  { value: 'groupRrsp', label: 'Group RRSP' },
  { value: 'dcPension', label: 'DC pension plan' },
];

export type PlanAccount = 'nonRegistered' | 'tfsa' | 'rrsp';

export const PLAN_ACCOUNTS: { value: PlanAccount; label: string }[] = [
  { value: 'nonRegistered', label: 'Non-registered' },
  { value: 'tfsa', label: 'TFSA' },
  { value: 'rrsp', label: 'RRSP' },
];

export const EXPENSE_CATEGORIES = [
  'Housing',
  'Utilities',
  'Food',
  'Transportation',
  'Insurance',
  'Health',
  'Pets',
  'Subscriptions',
  'Entertainment',
  'Personal',
  'Family',
  'Debt',
  'Extra debt repayment',
  'Travel',
  'Giving',
  'Other',
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export interface IncomeItem {
  id: string;
  name: string;
  kind: IncomeKind;
  amount: number | null;
  freq: Freq;
  currency: Currency;
  /** Foreign tax withheld at source, in percent. */
  foreignTaxPct: number | null;
}

export interface InvestmentItem {
  id: string;
  name: string;
  kind: AccountKind;
  amount: number | null;
  freq: Freq;
}

export interface ExpenseItem {
  id: string;
  name: string;
  category: ExpenseCategory;
  amount: number | null;
  freq: Freq;
}

export interface Settings {
  benefits: BenefitRules;
  rooms: RoomDetails;
  /** Previously entered room and history, saved separately for each planning year. */
  roomYears: Record<string, RoomYearRecord>;
  scenario: string;
  /** Workplace retirement plan type. Decides how contributions are taxed. */
  retirementType: RetirementType;
  /** Your payroll contribution to the retirement plan, in percent of salary. */
  retirementPct: number | null;
  /** Employer match, in percent of your retirement plan contribution (100 = dollar for dollar). */
  matchRate: number | null;
  /** Match applies to contributions up to this percent of salary. */
  matchCapPct: number | null;
  /** Annual employer maximum in C$. */
  matchMax: number | null;
  /** Employee savings / share purchase plan: your payroll contribution, in percent of salary. */
  planPct: number | null;
  /** Account for employee contributions only; employer destination is separate. */
  planAccount: PlanAccount;
  /** Employer match, in percent of your plan contribution (50 = 50 cents per dollar). */
  planMatchRate: number | null;
  /** Match applies to contributions up to this percent of salary. */
  planMatchCapPct: number | null;
  /** Annual employer maximum in C$. */
  planMatchMax: number | null;
  rrspRoom: number | null;
  fhsaRoom: number | null;
  tfsaRoom: number | null;
  /** Other annual deductions: union dues, childcare, moving expenses, etc. */
  otherDeductions: number | null;
  fx: Record<ForeignCurrency, number>;
  /** Refresh exchange rates from the internet once a day. Turned off when a rate is typed in. */
  fxAuto: boolean;
  /** ISO time of the last successful rate download. */
  fxUpdatedAt: string | null;
  /** Source label per currency, e.g. "Bank of Canada 2026-09-25" or "Entered manually". */
  fxSources: Partial<Record<ForeignCurrency, string>>;
  /** Expected annual investment return, in percent. */
  returnRate: number;
  horizonYears: number;
}

export interface BudgetState {
  version: 1;
  settings: Settings;
  income: IncomeItem[];
  investments: InvestmentItem[];
  essentials: ExpenseItem[];
  lifestyle: ExpenseItem[];
  tax: TaxParams;
}

// ------------------------------------------------------------------ ordering

/** Returns a copy of `items` with the element at `from` moved to `to`. */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const next = items.slice();
  const [it] = next.splice(from, 1);
  next.splice(to, 0, it);
  return next;
}

/**
 * Stable sort that gathers items of the same group together, with groups in the
 * order given by `order`. Items keep their relative order within a group.
 */
export function groupItems<T>(items: readonly T[], groupOf: (item: T) => string, order: readonly string[]): T[] {
  const rank = (it: T) => {
    const i = order.indexOf(groupOf(it));
    return i < 0 ? order.length : i;
  };
  return items
    .map((it, i) => ({ it, i, r: rank(it) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.it);
}

export const isGrouped = <T,>(items: readonly T[], groupOf: (item: T) => string, order: readonly string[]) =>
  groupItems(items, groupOf, order).every((it, i) => it === items[i]);

export const INCOME_ORDER = INCOME_KINDS.map((k) => k.value);
export const ACCOUNT_ORDER = ACCOUNT_KINDS.map((k) => k.value);

let counter = 0;
export const uid = () =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id-${Date.now().toString(36)}-${(counter++).toString(36)}`
  ).slice(0, 12);

const inc = (name: string, kind: IncomeKind, freq: Freq = 'year', currency: Currency = 'CAD'): IncomeItem => ({
  id: uid(),
  name,
  kind,
  amount: null,
  freq,
  currency,
  foreignTaxPct: null,
});

const inv = (name: string, kind: AccountKind): InvestmentItem => ({
  id: uid(),
  name,
  kind,
  amount: null,
  freq: 'month',
});

const exp = (name: string, category: ExpenseCategory, freq: Freq = 'month'): ExpenseItem => ({
  id: uid(),
  name,
  category,
  amount: null,
  freq,
});

// Rough starting rates; users should update them. SAR and HKD are pegged to the USD
// (3.75 and ~7.8 per USD), so they follow the USD rate.
const DEFAULT_FX: Settings['fx'] = { USD: 1.38, EUR: 1.6, GBP: 1.85, SAR: 0.368, HKD: 0.177 };

export function createDefaultState(): BudgetState {
  return {
    version: 1,
    settings: {
      benefits: { ...DEFAULT_BENEFITS },
      rooms: { ...DEFAULT_ROOMS, year: DEFAULT_TAX.year },
      roomYears: {},
      scenario: '',
      retirementType: 'groupRrsp',
      retirementPct: null,
      matchRate: null,
      matchCapPct: null,
      matchMax: null,
      planPct: null,
      planAccount: 'nonRegistered',
      planMatchRate: null,
      planMatchCapPct: null,
      planMatchMax: null,
      rrspRoom: null,
      fhsaRoom: null,
      tfsaRoom: null,
      otherDeductions: null,
      fx: { ...DEFAULT_FX },
      fxAuto: true,
      fxUpdatedAt: null,
      fxSources: {},
      returnRate: 5,
      horizonYears: 25,
    },
    income: [
      inc('Salary', 'employment'),
      inc('Consulting (Canada)', 'selfEmployment'),
      inc('Consulting (foreign)', 'selfEmployment', 'year', 'USD'),
    ],
    investments: [
      inv('RRSP', 'rrsp'),
      inv('FHSA', 'fhsa'),
      inv('TFSA', 'tfsa'),
      inv('Non-registered', 'nonRegistered'),
      inv('Emergency fund', 'other'),
    ],
    essentials: [
      exp('Rent or mortgage', 'Housing'),
      exp('Condo fees / property tax', 'Housing'),
      exp('Hydro, gas & water', 'Utilities'),
      exp('Internet', 'Utilities'),
      exp('Mobile phone', 'Utilities'),
      exp('Groceries', 'Food'),
      exp('TTC / GO Transit', 'Transportation'),
      exp('Car payment', 'Transportation'),
      exp('Car insurance', 'Insurance'),
      exp('Gas & parking', 'Transportation'),
      exp('Car maintenance', 'Transportation'),
      exp('Tenant / home insurance', 'Insurance'),
      exp('Life insurance', 'Insurance'),
      exp('Prescriptions & dental', 'Health'),
      exp('Pet food & vet', 'Pets'),
      exp('Minimum debt payments', 'Debt'),
    ],
    lifestyle: [
      exp('Restaurants', 'Food'),
      exp('Food delivery', 'Food'),
      exp('Work lunches & coffee', 'Food'),
      exp('Gym / fitness', 'Health'),
      exp('Streaming', 'Subscriptions'),
      exp('Software & cloud', 'Subscriptions'),
      exp('Games & hobbies', 'Entertainment'),
      exp('Clothing', 'Personal'),
      exp('Personal care', 'Personal'),
      exp('Travel', 'Travel', 'year'),
      exp('Gifts & donations', 'Giving'),
      exp('Other', 'Other'),
    ],
    tax: structuredClone(DEFAULT_TAX),
  };
}

// ---------------------------------------------------------------- persistence

const STORAGE_KEY = 'tb.state.v1';

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v.slice(0, 120) : fallback);
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback;

const FREQ_VALUES = FREQS.map((f) => f.value);
const INCOME_VALUES = INCOME_KINDS.map((k) => k.value);
const ACCOUNT_VALUES = ACCOUNT_KINDS.map((k) => k.value);

const list = <T,>(v: unknown, map: (x: Record<string, unknown>) => T): T[] =>
  Array.isArray(v) ? v.filter((x) => x && typeof x === 'object').map((x) => map(x as Record<string, unknown>)) : [];

/**
 * Accepts anything (localStorage or an uploaded file) and returns a complete,
 * well-typed state. Unknown fields are dropped; missing ones fall back to defaults.
 */
export function sanitizeState(raw: unknown): BudgetState {
  const base = createDefaultState();
  if (!raw || typeof raw !== 'object') throw new Error('The file does not contain a budget config.');
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.income) && !Array.isArray(r.essentials) && !r.settings) {
    throw new Error('The file does not look like a budget config exported from this app.');
  }
  const s = (r.settings ?? {}) as Record<string, unknown>;
  const fx = (s.fx ?? {}) as Record<string, unknown>;

  const rooms = sanitizeDetails(s.rooms, { ...DEFAULT_ROOMS, year: num((r.tax as Record<string, unknown>)?.year) ?? DEFAULT_TAX.year });
  // Existing entered amounts remain estimates, never silently become CRA-verified.
  if (!s.rooms) for (const k of ['rrsp', 'tfsa', 'fhsa'] as const) {
    if (num(s[`${k}Room`]) !== null) rooms[`${k}Status`] = 'estimated';
  }
  const settings: Settings = {
    benefits: sanitizeDetails(s.benefits, DEFAULT_BENEFITS),
    rooms,
    roomYears: sanitizeRoomYears(s.roomYears),
    scenario: str(s.scenario),
    retirementType: oneOf(s.retirementType, RETIREMENT_TYPES.map((t) => t.value), 'groupRrsp'),
    retirementPct: num(s.retirementPct),
    matchRate: num(s.matchRate),
    matchCapPct: num(s.matchCapPct),
    matchMax: num(s.matchMax),
    planPct: num(s.planPct),
    planAccount: oneOf(s.planAccount, PLAN_ACCOUNTS.map((a) => a.value), 'nonRegistered'),
    planMatchRate: num(s.planMatchRate),
    planMatchCapPct: num(s.planMatchCapPct),
    planMatchMax: num(s.planMatchMax),
    rrspRoom: num(s.rrspRoom),
    fhsaRoom: num(s.fhsaRoom),
    tfsaRoom: num(s.tfsaRoom),
    otherDeductions: num(s.otherDeductions),
    fx: Object.fromEntries(
      FOREIGN_CURRENCIES.map((c) => [c, num(fx[c]) ?? DEFAULT_FX[c]]),
    ) as Settings['fx'],
    fxAuto: typeof s.fxAuto === 'boolean' ? s.fxAuto : true,
    fxUpdatedAt: typeof s.fxUpdatedAt === 'string' && !Number.isNaN(Date.parse(s.fxUpdatedAt)) ? s.fxUpdatedAt : null,
    fxSources: Object.fromEntries(
      FOREIGN_CURRENCIES.flatMap((c) => {
        const v = (s.fxSources as Record<string, unknown> | undefined)?.[c];
        return typeof v === 'string' ? [[c, v.slice(0, 60)]] : [];
      }),
    ),
    returnRate: num(s.returnRate) ?? base.settings.returnRate,
    horizonYears: Math.min(50, Math.max(1, Math.round(num(s.horizonYears) ?? base.settings.horizonYears))),
  };

  const expense = (x: Record<string, unknown>): ExpenseItem => ({
    id: str(x.id) || uid(),
    name: str(x.name),
    category: oneOf(x.category, EXPENSE_CATEGORIES, 'Other'),
    amount: num(x.amount),
    freq: oneOf(x.freq, FREQ_VALUES, 'month'),
  });

  const rt = (r.tax ?? {}) as Record<string, unknown>;
  // Missing fields fall back to the built-in figures for the config's own year.
  const defaults = defaultTaxFor(num(rt.year) ?? DEFAULT_TAX.year);
  const tax = structuredClone(defaults);
  for (const key of Object.keys(defaults) as (keyof TaxParams)[]) {
    const v = rt[key];
    if (key === 'federalBrackets' || key === 'ontarioBrackets') {
      if (Array.isArray(v) && v.length === defaults[key].length) {
        tax[key] = v.map((b, i) => ({
          upTo: i === v.length - 1 ? null : (num((b as Record<string, unknown>)?.upTo) ?? defaults[key][i].upTo),
          rate: num((b as Record<string, unknown>)?.rate) ?? defaults[key][i].rate,
        }));
      }
    } else if (num(v) !== null) {
      (tax as unknown as Record<string, number>)[key] = v as number;
    }
  }

  return {
    version: 1,
    settings: roomsForPlanningYear(settings, tax.year),
    income: list(r.income, (x) => ({
      id: str(x.id) || uid(),
      name: str(x.name),
      kind: oneOf(x.kind, INCOME_VALUES, 'employment'),
      amount: num(x.amount),
      freq: oneOf(x.freq, FREQ_VALUES, 'year'),
      currency: oneOf(x.currency, CURRENCIES, 'CAD'),
      foreignTaxPct: num(x.foreignTaxPct),
    })),
    investments: list(r.investments, (x) => ({
      id: str(x.id) || uid(),
      name: str(x.name),
      kind: oneOf(x.kind, ACCOUNT_VALUES, 'other'),
      amount: num(x.amount),
      freq: oneOf(x.freq, FREQ_VALUES, 'month'),
    })),
    essentials: list(r.essentials, expense),
    lifestyle: list(r.lifestyle, expense),
    tax,
  };
}

export function loadState(): BudgetState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return sanitizeState(JSON.parse(raw));
  } catch {
    // Corrupt or foreign data: start fresh rather than crash.
  }
  return createDefaultState();
}

/** All UI tax updates (including reset) share the same room-year transition. */
export function updateTaxParams(state: BudgetState, patch: Partial<TaxParams>): BudgetState {
  const tax = { ...state.tax, ...patch };
  return { ...state, tax, settings: roomsForPlanningYear(state.settings, tax.year) };
}

export function saveState(state: BudgetState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage full or disabled (private mode). The app keeps working in memory.
  }
}
