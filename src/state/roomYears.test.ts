import { describe, expect, it } from 'vitest';
import { createDefaultState, sanitizeState, updateTaxParams } from './model';
import { computeBudget } from '../tax/budget';
import { DEFAULT_TAX } from '../tax/params';

function with2026Room() {
  const state = createDefaultState();
  state.income[0].amount = 125000;
  state.settings.rrspRoom = 15000;
  state.settings.tfsaRoom = 7000;
  state.settings.fhsaRoom = 8000;
  Object.assign(state.settings.rooms, {
    rrspStatus: 'verified', tfsaStatus: 'estimated', fhsaStatus: 'verified',
    rrspPriorUnused: 1000, rrspElsewhere: 2000, tfsaElsewhere: 3000, fhsaElsewhere: 4000,
    tfsaQualifyingYears: '2026', tfsaPastContributions: 0, tfsaPastWithdrawals: 0,
    fhsaState: 'opened', fhsaOpened: '2026-10-16', fhsaEligibilityConfirmed: true,
    fhsaCarryforward: 0, fhsaLifetimeUsed: 0,
  });
  return state;
}

describe('contribution room follows the planning year', () => {
  it('starts a new year unknown without reusing deductions or contributions elsewhere', () => {
    const original = with2026Room();
    const next = updateTaxParams(original, { year: 2027 });
    expect(next.settings.rooms.year).toBe(next.tax.year);
    expect([next.settings.rrspRoom, next.settings.tfsaRoom, next.settings.fhsaRoom]).toEqual([null, null, null]);
    expect([next.settings.rooms.rrspStatus, next.settings.rooms.tfsaStatus, next.settings.rooms.fhsaStatus]).toEqual(['unknown', 'unknown', 'unknown']);
    expect([next.settings.rooms.rrspElsewhere, next.settings.rooms.tfsaElsewhere, next.settings.rooms.fhsaElsewhere, next.settings.rooms.rrspPriorUnused]).toEqual([0, 0, 0, 0]);
    expect(next.settings.rooms.tfsaPastContributions).toBeNull();
    expect(next.settings.rooms.tfsaPastWithdrawals).toBeNull();
    expect(next.settings.rooms.fhsaLifetimeUsed).toBeNull();
    expect(next.settings.rooms.fhsaCarryforward).toBeNull();
    expect(next.settings.rooms.fhsaOpened).toBe('2026-10-16');
    expect(computeBudget(next).roomAvailable).toEqual({ rrsp: null, rrspNewContributions: null, tfsa: null, fhsa: null });
    expect(computeBudget(next).rrspDeduction).toBe(0);
    expect(computeBudget(next).fhsaDeduction).toBe(0);
    expect(original.settings.rooms.year).toBe(2026);
    expect(original.settings.roomYears).toEqual({});
  });

  it('restores each year’s exact amounts, sources and history, including verified zero', () => {
    const original = with2026Room();
    const next = updateTaxParams(original, { year: 2027 });
    next.settings.rrspRoom = 0;
    next.settings.rooms.rrspStatus = 'verified';
    const back = updateTaxParams(next, { year: 2026 });
    expect(back.settings.rooms).toEqual(original.settings.rooms);
    expect(back.settings.rrspRoom).toBe(15000);
    expect(back.settings.tfsaRoom).toBe(7000);
    expect(back.settings.fhsaRoom).toBe(8000);
    const again = updateTaxParams(back, { year: 2027 });
    expect(again.settings.rrspRoom).toBe(0);
    expect(again.settings.rooms.rrspStatus).toBe('verified');
    expect(computeBudget(again).roomAvailable.rrsp).toBe(0);
  });

  it('repairs an existing year mismatch on load without relabelling the old figures', () => {
    const saved = with2026Room();
    saved.tax.year = 2027;
    const loaded = sanitizeState(JSON.parse(JSON.stringify(saved)));
    expect(loaded.settings.rooms.year).toBe(2027);
    expect(loaded.settings.rrspRoom).toBeNull();
    expect(loaded.settings.roomYears['2026'].rrspRoom).toBe(15000);
    expect(updateTaxParams(loaded, { year: 2026 }).settings.rooms).toEqual(saved.settings.rooms);
  });

  it('preserves both years through export/import and uses the latest active edits', () => {
    let state = updateTaxParams(with2026Room(), { year: 2027 });
    state.settings.rrspRoom = 5000;
    state.settings.rooms.rrspStatus = 'estimated';
    state = updateTaxParams(state, { year: 2026 });
    state.settings.rrspRoom = 12000;
    const loaded = sanitizeState(JSON.parse(JSON.stringify(state)));
    expect(loaded).toEqual(state);
    const next = updateTaxParams(loaded, { year: 2027 });
    expect(next.settings.rrspRoom).toBe(5000);
    expect(updateTaxParams(next, { year: 2026 }).settings.rrspRoom).toBe(12000);
  });

  it('leaves same-year edits intact and applies year alignment when restoring tax defaults', () => {
    const original = with2026Room();
    expect(updateTaxParams(original, { fhsaAnnualLimit: 9000 }).settings).toBe(original.settings);
    const next = updateTaxParams(original, { year: 2027 });
    const reset = updateTaxParams(next, structuredClone(DEFAULT_TAX));
    expect(reset.tax).toEqual(DEFAULT_TAX);
    expect(reset.settings.rooms).toEqual(original.settings.rooms);
  });

  it('whitelists imported year records and takes the year from the record key', () => {
    const saved = with2026Room();
    const loaded = sanitizeState({ ...saved, settings: { ...saved.settings, roomYears: {
      bogus: { rrspRoom: 100 }, 2027: { rrspRoom: Infinity, tfsaRoom: -20, rooms: { year: 2026, rrspStatus: 'bogus' }, unrelated: 'discard' },
    } } });
    expect(Object.keys(loaded.settings.roomYears)).toEqual(['2027']);
    const next = updateTaxParams(loaded, { year: 2027 });
    expect(next.settings.rooms.year).toBe(2027);
    expect(next.settings.rooms.rrspStatus).toBe('unknown');
    expect(next.settings.rrspRoom).toBeNull();
    expect(next.settings.tfsaRoom).toBe(0);
    expect(next.settings.roomYears['2027']).not.toHaveProperty('unrelated');
  });
});
