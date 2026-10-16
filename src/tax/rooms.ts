import type { Settings } from '../state/model';
import type { TaxParams } from './params';
import { positive, validDate } from './plans';

export function tfsaAnnualLimit(year: number): number | null {
  if (year < 2009 || year > 2026) return null;
  if (year <= 2012) return 5000;
  if (year <= 2014) return 5500;
  if (year === 2015) return 10000;
  if (year <= 2018) return 5500;
  if (year <= 2022) return 6000;
  if (year === 2023) return 6500;
  return 7000;
}

/** Years supplied explicitly mean resident for some part of that year and age 18+. */
export function estimateTfsaRoom(year: number, qualifying: string, pastContributions: number | null, pastWithdrawals: number | null): number | null {
  if (!qualifying.trim() || pastContributions === null || pastWithdrawals === null) return null;
  const years = new Set<number>();
  for (const token of qualifying.split(',')) {
    const m = token.trim().match(/^(\d{4})(?:\s*-\s*(\d{4}))?$/);
    if (!m) return null;
    const start = +m[1], end = +(m[2] ?? m[1]);
    if (end < start || start < 2009 || end > year || end > 2026) return null;
    for (let y = start; y <= end; y++) years.add(y);
  }
  return Math.max(0, [...years].reduce((sum, y) => sum + (tfsaAnnualLimit(y) ?? 0), 0) - positive(pastContributions) + positive(pastWithdrawals));
}

export function contributionRooms(st: Settings, p: TaxParams) {
  const r = st.rooms;
  const sameYear = r.year === p.year;
  const known = (status: string, value: number | null) => sameYear && status !== 'unknown' && value !== null ? positive(value) : null;
  const rrsp = known(r.rrspStatus, st.rrspRoom);
  let tfsa = known(r.tfsaStatus, st.tfsaRoom);
  if (sameYear && r.tfsaStatus === 'estimated' && st.tfsaRoom === null) tfsa = estimateTfsaRoom(p.year, r.tfsaQualifyingYears, r.tfsaPastContributions, r.tfsaPastWithdrawals);
  let fhsa: number | null = null;
  if (r.fhsaState === 'ineligible' || r.fhsaState === 'notOpened') fhsa = 0;
  else if (r.fhsaState === 'opened' && validDate(r.fhsaOpened) && +r.fhsaOpened.slice(0, 4) > p.year) fhsa = 0;
  else if (r.fhsaState === 'opened' && r.fhsaEligibilityConfirmed && validDate(r.fhsaOpened) && +r.fhsaOpened.slice(0, 4) >= 2023) {
    fhsa = known(r.fhsaStatus, st.fhsaRoom);
    const openingYear = +r.fhsaOpened.slice(0, 4);
    if (sameYear && r.fhsaStatus === 'estimated' && st.fhsaRoom === null && r.fhsaLifetimeUsed !== null && (openingYear === p.year || r.fhsaCarryforward !== null)) {
      fhsa = Math.min(p.fhsaAnnualLimit + (openingYear === p.year ? 0 : Math.min(p.fhsaAnnualLimit, positive(r.fhsaCarryforward))), Math.max(0, p.fhsaLifetimeLimit - positive(r.fhsaLifetimeUsed)));
    }
    if (fhsa !== null) fhsa = Math.min(fhsa, Math.max(0, p.fhsaLifetimeLimit - positive(r.fhsaLifetimeUsed)));
    if (p.year > openingYear + 15) fhsa = 0;
  }
  return { rrsp, tfsa, fhsa, rrspNewContributions: rrsp === null ? null : Math.max(0, rrsp - r.rrspPriorUnused) };
}
