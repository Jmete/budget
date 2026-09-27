import { describe, expect, it } from 'vitest';
import { calculateTax, EMPTY_INPUT } from './engine';
import { DEFAULT_TAX } from './params';

// Expected values reproduce the formulas of the original Excel planner.
const cases: [number, number, number, number, number][] = [
  [125000, 0, 3600, 2400, 92776.87],
  [125000, 0, 0, 0, 90172.29],
  [60000, 40000, 0, 0, 73441.83],
  [0, 90000, 5000, 0, 66109.63],
  [30000, 0, 0, 0, 25482.14],
  [300000, 50000, 10000, 8000, 213007.34],
];

describe('calculateTax matches the spreadsheet', () => {
  it.each(cases)('salary %d, consulting %d, RRSP %d, FHSA %d', (employment, selfEmployment, rrsp, fhsa, expected) => {
    const r = calculateTax(
      { ...EMPTY_INPUT, employment, selfEmployment, rrspDeduction: rrsp, fhsaDeduction: fhsa },
      DEFAULT_TAX,
    );
    expect(r.afterTax).toBeCloseTo(expected, 0);
  });
});
