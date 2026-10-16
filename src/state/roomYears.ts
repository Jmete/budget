import { DEFAULT_ROOMS, sanitizeDetails, type RoomDetails } from './benefits';
import type { Settings } from './model';

export interface RoomYearRecord {
  rooms: RoomDetails;
  rrspRoom: number | null;
  tfsaRoom: number | null;
  fhsaRoom: number | null;
}

/** Keep confirmed amounts and year-relative history attached to their original year. */
export function roomsForPlanningYear(settings: Settings, year: number): Settings {
  if (settings.rooms.year === year) return settings;
  const { rooms, rrspRoom, tfsaRoom, fhsaRoom } = settings;
  const roomYears: Record<string, RoomYearRecord> = {
    ...settings.roomYears,
    [rooms.year]: { rooms: { ...rooms }, rrspRoom, tfsaRoom, fhsaRoom },
  };
  const selected: RoomYearRecord = roomYears[year] ?? {
    rooms: {
      ...DEFAULT_ROOMS, year,
      // These describe dated facts, not a balance or a rolling annual total.
      tfsaQualifyingYears: rooms.tfsaQualifyingYears,
      fhsaState: rooms.fhsaState,
      fhsaOpened: rooms.fhsaOpened,
      fhsaEligibilityConfirmed: rooms.fhsaEligibilityConfirmed,
    },
    rrspRoom: null, tfsaRoom: null, fhsaRoom: null,
  };
  return { ...settings, ...selected, rooms: { ...selected.rooms }, roomYears };
}

export function sanitizeRoomYears(raw: unknown): Record<string, RoomYearRecord> {
  const result: Record<string, RoomYearRecord> = {};
  if (!raw || typeof raw !== 'object') return result;
  const amount = (v: unknown) => typeof v === 'number' && Number.isFinite(v) ? Math.max(0, v) : null;
  for (const [key, value] of Object.entries(raw)) {
    if (!/^\d{4}$/.test(key) || +key < 2009 || +key > 2100 || !value || typeof value !== 'object') continue;
    const record = value as Record<string, unknown>;
    result[key] = {
      rooms: { ...sanitizeDetails(record.rooms, DEFAULT_ROOMS), year: +key },
      rrspRoom: amount(record.rrspRoom), tfsaRoom: amount(record.tfsaRoom), fhsaRoom: amount(record.fhsaRoom),
    };
  }
  return result;
}
