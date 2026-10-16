import type { TaxResult } from '../tax/engine';
import { fmt, type Budget } from '../tax/budget';

type Row = [label: string, pick: (t: TaxResult) => number, opts?: { strong?: boolean; neg?: boolean; hideZero?: boolean }];

const ROWS: Row[] = [
  ['Total income', (t) => t.totalIncome, { strong: true }],
  ['CPP (salary)', (t) => t.cppEmployeeBase + t.cppEmployeeEnhanced + t.cppEmployee2, { neg: true }],
  ['CPP (self-employed, both halves)', (t) => t.cppSelfBase + t.cppSelfDeductible, { neg: true, hideZero: true }],
  ['EI premiums', (t) => t.ei, { neg: true }],
  ['Taxable income', (t) => t.taxableIncome, { strong: true }],
  ['Federal tax before credits', (t) => t.federalBeforeCredits],
  // Credits are non-refundable: only the part that offsets tax is shown.
  ['Federal credits (BPA, CPP, EI, employment)', (t) => Math.min(t.federalCredits, t.federalBeforeCredits), { neg: true }],
  ['Federal dividend tax credit', (t) => t.federalDividendCredit, { neg: true, hideZero: true }],
  ['Federal tax', (t) => t.federalTax, { strong: true }],
  ['Ontario tax before credits', (t) => t.ontarioBeforeCredits],
  ['Ontario credits (BPA, CPP, EI)', (t) => Math.min(t.ontarioCredits, t.ontarioBeforeCredits), { neg: true }],
  ['Ontario dividend tax credit', (t) => t.ontarioDividendCredit, { neg: true, hideZero: true }],
  ['Ontario surtax', (t) => t.ontarioSurtax, { hideZero: true }],
  ['Ontario tax reduction', (t) => t.ontarioReduction, { neg: true, hideZero: true }],
  ['Ontario Health Premium', (t) => t.ontarioHealthPremium],
  ['Ontario tax', (t) => t.ontarioTax, { strong: true }],
  ['Foreign tax withheld', (t) => t.foreignTaxPaid, { hideZero: true }],
  ['Foreign tax credit', (t) => t.foreignTaxCredit, { neg: true, hideZero: true }],
  ['Total tax, CPP & EI', (t) => t.totalDeducted, { strong: true }],
];

export function TaxBreakdown({ b }: { b: Budget }) {
  const a = b.tax;
  const n = b.taxNoDeductions;
  const rows = ROWS.filter(([, pick, o]) => !o?.hideZero || pick(a) > 0.5 || pick(n) > 0.5);

  return (
    <section className="panel analysis" id="tax" aria-labelledby="tax-title">
      <header className="panel-head">
        <h2 id="tax-title">Tax calculation</h2>
        <p>Estimated {b.taxYear} federal and Ontario tax, annual C$, with and without your RRSP/FHSA deductions. Not payroll withholding.</p>
        {b.taxProvisional && <p className="hint">Provisional until the plan, room or residency notes are resolved.</p>}
      </header>
      <table className="tax-table">
        <thead>
          <tr>
            <th scope="col">Line</th>
            <th scope="col" className="r">With RRSP/FHSA</th>
            <th scope="col" className="r">Without</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, pick, o]) => (
            <tr key={label} className={o?.strong ? 'strong' : ''}>
              <th scope="row">{label}</th>
              <td className="r">{o?.neg && pick(a) > 0 ? `−${fmt(pick(a))}` : fmt(pick(a))}</td>
              <td className="r">{o?.neg && pick(n) > 0 ? `−${fmt(pick(n))}` : fmt(pick(n))}</td>
            </tr>
          ))}
          <tr><th scope="row">Take-home cash (excludes employer contributions)</th><td className="r">{fmt(b.afterTax)}</td><td className="r">{fmt(b.afterTax - b.deductionSavings)}</td></tr>
          <tr><th scope="row">Employee payroll plan contributions</th><td className="r" colSpan={2}>{fmt(b.retirementContribution + b.planContribution)}</td></tr>
          <tr className="delta">
            <th scope="row">Tax saved by deductions</th>
            <td className="r" colSpan={2}>
              {fmt(b.deductionSavings)}
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}
