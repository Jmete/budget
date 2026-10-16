import { describe, expect, it } from 'vitest';
import { createDefaultState, sanitizeState } from '../state/model';
import { computeBudget } from './budget';
import { DEFAULT_TAX, paramsForYear, TAX_2026, TAX_2027 } from './params';
import { estimateTfsaRoom } from './rooms';

describe('2027 default planning year', () => {
  it('starts in 2027 with the published EI rates and RRSP limit', () => {
    const s = createDefaultState();
    expect(s.tax.year).toBe(2027);
    expect(s.settings.rooms.year).toBe(2027);
    expect(DEFAULT_TAX).toEqual(TAX_2027);
    expect([TAX_2027.eiRate, TAX_2027.eiMaxInsurable, TAX_2027.rrspDollarLimit]).toEqual([0.0164, 70800, 35390]);
  });

  it('notes the pending indexation without marking the budget provisional', () => {
    const s = createDefaultState();
    s.income[0].amount = 90000;
    const b = computeBudget(s);
    expect(b.taxProvisional).toBe(false);
    expect(b.warnings.some((w) => w.level === 'info' && w.text.includes('stay at 2026 values'))).toBe(true);
    expect(b.tax.ei).toBeCloseTo(70800 * 0.0164);
  });

  it('still flags years without built-in figures', () => {
    const s = createDefaultState();
    s.tax.year = 2028;
    expect(computeBudget(s).taxProvisional).toBe(true);
  });

  it('switches unedited built-in figures with the year but keeps custom edits', () => {
    expect(paramsForYear(structuredClone(TAX_2027), 2026)).toEqual(TAX_2026);
    expect(paramsForYear(structuredClone(TAX_2026), 2027)).toEqual(TAX_2027);
    const edited = { ...structuredClone(TAX_2027), eiRate: 0.02 };
    expect(paramsForYear(edited, 2026)).toEqual({ ...edited, year: 2026 });
    expect(paramsForYear(structuredClone(TAX_2027), 2028)).toEqual({ ...TAX_2027, year: 2028 });
  });

  it('fills missing fields in an imported 2026 config from the 2026 figures', () => {
    const raw = { ...createDefaultState(), tax: { year: 2026 } };
    expect(sanitizeState(raw).tax).toEqual(TAX_2026);
  });

  it('estimates 2027 TFSA room with the planning-year limit', () => {
    expect(estimateTfsaRoom(2027, '2026-2027', 0, 0, 7000)).toBe(14000);
    expect(estimateTfsaRoom(2027, '2026-2027', 0, 0, 7500)).toBe(14500);
    expect(estimateTfsaRoom(2028, '2027', 0, 0, 7000)).toBeNull(); // no published 2027 figure for a past year
  });
});
