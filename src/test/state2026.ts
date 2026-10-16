import { createDefaultState } from '../state/model';
import { TAX_2026 } from '../tax/params';

/** Default state pinned to the 2026 figures that most regression expectations were derived from. */
export function state2026() {
  const s = createDefaultState();
  s.tax = structuredClone(TAX_2026);
  s.settings.rooms.year = 2026;
  return s;
}
