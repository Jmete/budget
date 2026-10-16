import { useId, type ReactNode } from 'react';
import { PLAN_ACCOUNTS, RETIREMENT_TYPES, type BudgetState, type Settings } from '../state/model';
import { DEFAULT_BENEFITS, type BenefitRules, type RoomDetails } from '../state/benefits';
import { fmt, type Budget } from '../tax/budget';
import { NumberField, SelectField, TextField } from './Fields';

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const id = useId();
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>{label}</label>
      <div className="input-shell"><input id={id} type="date" value={value} onChange={(e) => onChange(e.target.value)} /></div>
    </div>
  );
}

/** A row of a plan summary: an annual amount (shown per month and per year) or a text status. */
type SummaryRow = [label: string, value: number | string, opts?: { strong?: boolean; yearOnly?: boolean }];

function Summary({ rows }: { rows: SummaryRow[] }) {
  return (
    <table className="plan-sum">
      <thead>
        <tr><th scope="col"><span className="sr-only">Item</span></th><th scope="col" className="r">/ month</th><th scope="col" className="r">/ year</th></tr>
      </thead>
      <tbody>
        {rows.map(([label, v, o]) => (
          <tr key={label} className={o?.strong ? 'strong' : ''}>
            <th scope="row">{label}</th>
            {typeof v === 'string' ? <td className="r" colSpan={2}>{v}</td> : <>
              <td className="r">{o?.yearOnly ? '—' : fmt(v / 12, 2)}</td>
              <td className="r">{fmt(v)}</td>
            </>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const More = ({ summary, children }: { summary: string; children: ReactNode }) => (
  <details className="plan-more"><summary>{summary}</summary><div className="field-grid">{children}</div></details>
);

const statusOptions = [
  { value: 'unknown' as const, label: 'I don’t know yet' },
  { value: 'verified' as const, label: 'Verified (CRA / records)' },
  { value: 'estimated' as const, label: 'My estimate' },
];
const ACCOUNTS = ['rrsp', 'tfsa', 'fhsa'] as const;

export function Benefits({ state, budget: b, onSettings, onYear }: { state: BudgetState; budget: Budget; onSettings: (patch: Partial<Settings>) => void; onYear: (year: number) => void }) {
  const s = state.settings, rules = s.benefits, rooms = s.rooms;
  const calendar = rules.mode === 'calendar';
  const setRule = (patch: Partial<BenefitRules>) => onSettings({ benefits: { ...rules, ...patch } });
  const setRoom = (patch: Partial<RoomDetails>) => onSettings({ rooms: { ...rooms, ...patch } });
  type NumberRule = { [K in keyof BenefitRules]: BenefitRules[K] extends number | null ? K : never }[keyof BenefitRules];
  const numberRule = (key: NumberRule, label: string, suffix?: string) => (
    <NumberField hideLabel={false} label={label} value={rules[key]} min={0} prefix={suffix ? undefined : '$'} suffix={suffix}
      placeholder={DEFAULT_BENEFITS[key] !== null ? '0' : suffix === 'yr' || key === 'laterMatchRate' ? 'Not set' : 'No cap'} onChange={(v) => setRule({ [key]: v ?? DEFAULT_BENEFITS[key] } as Partial<BenefitRules>)} />
  );
  const savingsUsed = (s.planPct ?? 0) > 0;
  const remainder = 100 - rules.employeeRrspAllocation - rules.employeeTfsaAllocation;
  const roomLeft = (k: (typeof ACCOUNTS)[number]) => (k === 'rrsp' ? b.roomAvailable.rrspNewContributions : b.roomAvailable[k]);

  return <>
    <div className="benefit-timing">
      <h3 className="sub-head">Workplace plans</h3>
      <div className="field-grid">
        <SelectField hideLabel={false} label="Show contributions for" value={rules.mode}
          options={[{ value: 'annualized', label: 'Typical full year' }, { value: 'calendar', label: 'Actual calendar year (dates)' }]}
          onChange={(mode) => setRule({ mode, ...(mode === 'annualized' ? { residency: 'fullYear' as const } : {}) })} />
        <NumberField hideLabel={false} label="Tax / planning year" value={state.tax.year} maxDigits={0} grouping={false}
          onChange={(v) => { if (v !== null && v >= 2009 && v <= 2100) onYear(Math.round(v)); }} />
        {calendar && <DateField label="Employment start date" value={rules.employmentStart} onChange={(employmentStart) => setRule({ employmentStart })} />}
      </div>
      <p className="hint">{calendar
        ? 'Salary and workplace plans are prorated from your start date; monthly figures are the year’s total ÷ 12.'
        : 'A full year of salary and plan participation ÷ 12, assuming full-year Canadian residency.'} Changing the year means reviewing tax rates and room.</p>
      <More summary="Earnings and payslip details">
        <NumberField hideLabel={false} label="Eligible plan earnings / yr" value={rules.eligibleAnnualEarnings} prefix="$" placeholder="Salary total" min={0} onChange={(eligibleAnnualEarnings) => setRule({ eligibleAnnualEarnings })} />
        <SelectField hideLabel={false} label="Canadian tax residency" value={rules.residency} options={[{ value: 'fullYear', label: 'Full calendar year' }, { value: 'partYearUnknown', label: 'Part year / needs review' }]} onChange={(residency) => setRule({ residency })} />
        <NumberField hideLabel={false} label="Income tax withheld this year" value={rules.incomeTaxWithheld} prefix="$" placeholder="Unknown" min={0} onChange={(incomeTaxWithheld) => setRule({ incomeTaxWithheld })} />
        <NumberField hideLabel={false} label="CPP + EI withheld this year" value={rules.cppEiWithheld} prefix="$" placeholder="Unknown" min={0} onChange={(cppEiWithheld) => setRule({ cppEiWithheld })} />
        <p className="hint span-all">Use full-year totals or a full-year forecast, not year-to-date. Part-year residents need a separate review of credits.</p>
        <p className="derived span-all"><span>Bank pay after payroll deductions</span><strong>{b.actualCashAfterPayroll === null ? 'Enter both withholding totals' : `${fmt(b.actualCashAfterPayroll)}/yr`}</strong></p>
      </More>
    </div>

    <div className="subpanels benefits-panels">
      <fieldset className="param-group">
        <legend>Retirement plan</legend>
        <div className="plan-body"><div className="plan-inputs">
        <div className="field-grid">
          <SelectField hideLabel={false} label="Plan type" value={s.retirementType} options={RETIREMENT_TYPES} onChange={(retirementType) => onSettings({ retirementType })} />
          <NumberField hideLabel={false} label="You contribute" value={s.retirementPct} suffix="% of pay" min={0} onChange={(retirementPct) => onSettings({ retirementPct })} />
          {numberRule('automaticPct', 'Employer automatic', '% of pay')}
          <NumberField hideLabel={false} label="Employer match" value={s.matchRate} suffix="%" placeholder="e.g. 50" min={0} onChange={(matchRate) => onSettings({ matchRate })} />
          <NumberField hideLabel={false} label="Matched up to" value={s.matchCapPct} suffix="% of pay" min={0} placeholder="All" onChange={(matchCapPct) => onSettings({ matchCapPct })} />
          {calendar
            ? <p className="derived"><span>Plan starts</span><strong>{b.plans.dates.retirement || 'Enter a start date'}</strong></p>
            : numberRule('membershipYear', 'Membership year', 'yr')}
        </div>
        <p className="hint">Employer match is a percentage of what you contribute: 50% means 50¢ for every $1 you put in.</p>
        <More summary="Dates, caps and later matching">
          <DateField label="Plan start (override)" value={rules.retirementStart} onChange={(retirementStart) => setRule({ retirementStart })} />
          {numberRule('retirementWaitMonths', 'Waiting period', 'months')}
          {numberRule('retirementEmployeeMaxPct', 'Max employee election', '%')}
          {numberRule('employerEarningsCap', 'Employer earnings cap')}
          {numberRule('employeeEarningsCap', 'Your earnings cap')}
          {numberRule('automaticMax', 'Automatic annual max')}
          <NumberField hideLabel={false} label="Matching annual max" prefix="$" placeholder="No cap" value={s.matchMax} min={0} onChange={(matchMax) => onSettings({ matchMax })} />
          {numberRule('matchStepYear', 'Higher match from year', 'yr')}
          {numberRule('laterMatchRate', 'Higher match', '%')}
          <SelectField hideLabel={false} label="If the pension limit is reached" value={rules.limitAllocation} options={[{ value: 'employeeFirst', label: 'Cut employee first' }, { value: 'proportional', label: 'Cut all proportionally' }]} onChange={(limitAllocation) => setRule({ limitAllocation })} />
          {s.retirementType === 'groupRrsp' && <label className="check span-all"><input type="checkbox" checked={rules.groupRrspWithdrawable} onChange={(e) => setRule({ groupRrspWithdrawable: e.target.checked })} />Group RRSP allows cash withdrawals while employed (employer share is subject to EI)</label>}
          <p className="hint span-all">Blank caps mean no cap; zero means zero. Confirm how your administrator applies limit reductions.</p>
        </More>
        </div><div className="plan-results">
        <Summary rows={[
          ['You contribute', b.retirementContribution],
          ['Employer automatic', b.employerAutomatic],
          ['Employer matching', b.employerMatching],
          ['Total retirement savings', b.retirementContribution + b.employerMatch, { strong: true }],
          ...(s.retirementType === 'dcPension' ? [['Pension adjustment (approx.)', b.retirementContribution + b.employerMatch, { yearOnly: true }] as SummaryRow] : []),
        ]} />
        <p className="hint">{s.retirementType === 'dcPension'
          ? 'DC contributions are an RPP deduction and use no RRSP room; they reduce next year’s RRSP room instead.'
          : 'Group RRSP contributions use your RRSP room. The employer share is taxable pay.'}</p>
        </div></div>
      </fieldset>

      <fieldset className="param-group">
        <legend>Employee savings plan</legend>
        <div className="plan-body"><div className="plan-inputs">
        <div className="field-grid">
          <NumberField hideLabel={false} label="You save from pay" value={s.planPct} suffix="% of pay" min={0} onChange={(planPct) => onSettings({ planPct })} />
          {savingsUsed && <SelectField hideLabel={false} label="Your savings go to" value={rules.employeeSplit ? 'split' : s.planAccount}
            options={[...PLAN_ACCOUNTS.map((a) => ({ ...a, label: a.value === 'nonRegistered' ? 'ESP / non-registered' : a.label })), { value: 'split', label: 'Split: ESP, RRSP, TFSA' }]}
            onChange={(value) => value === 'split' ? setRule({ employeeSplit: true }) : onSettings({ planAccount: value, benefits: { ...rules, employeeSplit: false } })} />}
          {savingsUsed && <>
            {rules.employeeSplit && <>
              {numberRule('employeeRrspAllocation', 'Share to RRSP', '%')}
              {numberRule('employeeTfsaAllocation', 'Share to TFSA', '%')}
              <p className="derived"><span>Remainder to ESP</span><strong>{remainder < 0 ? 'Over 100%' : `${remainder}%`}</strong></p>
            </>}
            <NumberField hideLabel={false} label="Employer match" value={s.planMatchRate} suffix="%" placeholder="e.g. 50" min={0} onChange={(planMatchRate) => onSettings({ planMatchRate })} />
            <NumberField hideLabel={false} label="Matched up to" value={s.planMatchCapPct} suffix="% of pay" min={0} placeholder="All" onChange={(planMatchCapPct) => onSettings({ planMatchCapPct })} />
            <SelectField hideLabel={false} label="Employer match goes to" value={rules.employerAccount}
              options={[{ value: 'unknown', label: 'Not sure yet' }, ...(rules.planKind === 'profitSharing' ? [] : PLAN_ACCOUNTS), { value: 'epsp', label: 'EPSP (taxable, T4PS)' }, { value: 'dpsp', label: 'DPSP (tax-deferred)' }]}
              onChange={(employerAccount) => setRule({ employerAccount })} />
            {rules.planKind !== 'profitSharing' && !['epsp', 'dpsp'].includes(rules.employerAccount) &&
              <SelectField hideLabel={false} label="Match is taxed as" value={rules.benefitTreatment}
                options={[{ value: 'unknown', label: 'Not sure yet' }, { value: 'nonCash', label: 'Non-cash: CPP, no EI' }, { value: 'cash', label: 'Cash: CPP + EI' }, { value: 'exempt', label: 'Not taxable (confirmed)' }]}
                onChange={(benefitTreatment) => setRule({ benefitTreatment })} />}
            {calendar && <p className="derived"><span>Plan starts</span><strong>{b.plans.dates.savings || 'Enter a start date'}</strong></p>}
          </>}
        </div>
        {!savingsUsed && <p className="hint">Enter a percentage if your employer offers a savings or share purchase plan.</p>}
        {savingsUsed && <>
          <p className="hint">Employer match is a percentage of what you contribute: 50% means 50¢ for every $1 you put in.</p>
          <More summary="Dates and limits">
            <SelectField hideLabel={false} label="Arrangement" value={rules.planKind} options={[{ value: 'generic', label: 'Configurable' }, { value: 'profitSharing', label: 'Separate EPSP or DPSP' }]} onChange={(planKind) => setRule({ planKind })} />
            <DateField label="Plan start (override)" value={rules.savingsStart} onChange={(savingsStart) => setRule({ savingsStart })} />
            {numberRule('savingsWaitMonths', 'Waiting period', 'months')}
            {numberRule('savingsEmployeeMaxPct', 'Max employee election', '%')}
            {numberRule('savingsEarningsCap', 'Earnings cap')}
            <NumberField hideLabel={false} label="Match annual max" value={s.planMatchMax} prefix="$" placeholder="No cap" min={0} onChange={(planMatchMax) => onSettings({ planMatchMax })} />
            <p className="hint span-all">With a separate EPSP/DPSP arrangement, the employer match goes there regardless of where your savings go. EPSP allocations are taxable with no withholding; DPSP contributions add to your pension adjustment.</p>
          </More>
        </>}
        </div>
        {savingsUsed && <div className="plan-results">
          <Summary rows={[
            ['You contribute', b.planContribution],
            ['Employer adds', b.planMatch],
            ['Total savings plan', b.planContribution + b.planMatch, { strong: true }],
            ...(rules.employerAccount === 'dpsp' ? [['DPSP pension adjustment', b.planMatch, { yearOnly: true }] as SummaryRow] : []),
            ['Income tax on match', b.planMatchIncomeTax ?? 'Unconfirmed'],
            ['CPP + EI on match', b.planMatchPayrollTax ?? 'Unconfirmed'],
          ]} />
          {b.planMatchTax === null && <p className="hint">Until confirmed, the budget reserves {fmt(b.planTaxRange[1] / 12, 2)}/mo as if the match were a taxable benefit.</p>}
          <p className="hint">The employer match is invested for you, not paid into your bank account.</p>
        </div>}
        </div>
      </fieldset>

      <fieldset className="param-group span-all">
        <legend>Contribution room for {state.tax.year}</legend>
        <p className="hint">Room at the start of the year, before the contributions in this budget. Unknown is not the same as $0. Each planning year’s room is saved separately.</p>
        <div className="room-grid">
          {ACCOUNTS.map((k) => (
            <div className="room-account" key={k}>
              <h3>{k.toUpperCase()}</h3>
              {k === 'fhsa' && <>
                <SelectField hideLabel={false} label="Account" value={rooms.fhsaState}
                  options={[{ value: 'unknown', label: 'Not confirmed' }, { value: 'ineligible', label: 'Not eligible' }, { value: 'notOpened', label: 'Eligible, not opened' }, { value: 'opened', label: 'Opened' }]}
                  onChange={(fhsaState) => setRoom({ fhsaState })} />
                {rooms.fhsaState === 'opened' && <>
                  <DateField label="First opened" value={rooms.fhsaOpened} onChange={(fhsaOpened) => setRoom({ fhsaOpened })} />
                  <label className="check"><input type="checkbox" checked={rooms.fhsaEligibilityConfirmed} onChange={(e) => setRoom({ fhsaEligibilityConfirmed: e.target.checked })} />I met the opening eligibility rules</label>
                  <p className="hint">At opening: Canadian resident, age 18–71, and you or your spouse/partner didn’t own and live in a home (including overseas) that year or the four before.</p>
                </>}
              </>}
              <SelectField hideLabel={false} label="Room source" value={rooms[`${k}Status`]} options={statusOptions} onChange={(v) => setRoom({ [`${k}Status`]: v })} />
              {rooms[`${k}Status`] !== 'unknown' && <NumberField hideLabel={false} label={k === 'rrsp' ? 'Deduction limit' : 'Room'} value={s[`${k}Room`]} prefix="$"
                placeholder="Amount or history" min={0} onChange={(v) => onSettings({ [`${k}Room`]: v })} />}
              <dl className="room-stats">
                <div><dt>Available</dt><dd>{roomLeft(k) === null ? 'Unknown' : fmt(roomLeft(k)!)}</dd></div>
                <div><dt>Planned</dt><dd className={roomLeft(k) !== null && b.roomUsed[k] > roomLeft(k)! ? 'is-neg' : ''}>{fmt(b.roomUsed[k])}</dd></div>
              </dl>
            </div>
          ))}
        </div>
        <More summary="History and contributions elsewhere">
          <p className="hint span-all">Only contributions not already in the rows above or your payroll plans. They count toward cash flow, room and deductions.</p>
          {ACCOUNTS.map((k) => <NumberField key={k} hideLabel={false} label={`${k.toUpperCase()} elsewhere this year`} value={rooms[`${k}Elsewhere`]} prefix="$" min={0} onChange={(v) => setRoom({ [`${k}Elsewhere`]: v ?? 0 })} />)}
          <NumberField hideLabel={false} label="RRSP undeducted from past years" value={rooms.rrspPriorUnused} prefix="$" min={0} onChange={(v) => setRoom({ rrspPriorUnused: v ?? 0 })} />
          <p className="hint span-all">Past undeducted RRSP contributions already use room and are claimed first. They don’t leave your bank account again.</p>
          <h4 className="span-all">Estimate RRSP room</h4>
          <p className="hint span-all">Choose “My estimate” and leave the RRSP limit blank. Your room is unused room carried forward, plus 18% of last year’s earned income (up to {fmt(state.tax.rrspDollarLimit)}), less last year’s pension adjustment. Unused room is on your last Notice of Assessment or CRA My Account; enter 0 if you never had any.</p>
          <NumberField hideLabel={false} label="Unused room carried forward" value={rooms.rrspCarryforward} prefix="$" placeholder="0 if none" min={0} onChange={(rrspCarryforward) => setRoom({ rrspCarryforward })} />
          <NumberField hideLabel={false} label={`${state.tax.year - 1} Canadian earned income`} value={rooms.rrspPriorEarnedIncome} prefix="$" placeholder="0 if none" min={0} onChange={(rrspPriorEarnedIncome) => setRoom({ rrspPriorEarnedIncome })} />
          <NumberField hideLabel={false} label={`${state.tax.year - 1} pension adjustment`} value={rooms.rrspPriorPensionAdjustment} prefix="$" placeholder="0 if none" min={0} onChange={(rrspPriorPensionAdjustment) => setRoom({ rrspPriorPensionAdjustment })} />
          <h4 className="span-all">Estimate TFSA room</h4>
          <p className="hint span-all">Choose “My estimate” and leave the TFSA room blank. List years you were 18+ and resident in Canada for part of the year, e.g. 2010-2012, 2026.</p>
          <TextField hideLabel={false} label="Qualifying years" value={rooms.tfsaQualifyingYears} placeholder="e.g. 2026" onChange={(tfsaQualifyingYears) => setRoom({ tfsaQualifyingYears })} />
          <NumberField hideLabel={false} label="Past contributions" value={rooms.tfsaPastContributions} prefix="$" placeholder="0 if none" min={0} onChange={(tfsaPastContributions) => setRoom({ tfsaPastContributions })} />
          <NumberField hideLabel={false} label="Past withdrawals" value={rooms.tfsaPastWithdrawals} prefix="$" placeholder="0 if none" min={0} onChange={(tfsaPastWithdrawals) => setRoom({ tfsaPastWithdrawals })} />
          <h4 className="span-all">Estimate FHSA room</h4>
          <p className="hint span-all">Choose “My estimate” and leave the FHSA room blank. $8,000 a year from opening, up to $8,000 carried forward. Transfers and corrections need a verified amount.</p>
          <NumberField hideLabel={false} label="Carried from last year" value={rooms.fhsaCarryforward} prefix="$" placeholder="0 if none" min={0} onChange={(fhsaCarryforward) => setRoom({ fhsaCarryforward })} />
          <NumberField hideLabel={false} label="Lifetime used before this year" value={rooms.fhsaLifetimeUsed} prefix="$" placeholder="0 if none" min={0} onChange={(fhsaLifetimeUsed) => setRoom({ fhsaLifetimeUsed })} />
        </More>
        <Summary rows={[
          ['RRSP + FHSA deductions allowed', b.rrspDeduction + b.fhsaDeduction],
          ...(b.potentialDeductionSavings - b.deductionSavings > 0.5 ? [['Extra tax saving once unknown room is confirmed', b.potentialDeductionSavings - b.deductionSavings, { yearOnly: true }] as SummaryRow] : []),
          ['Pension adjustment (affects next year’s RRSP room)', b.pensionAdjustment, { yearOnly: true }],
        ]} />
      </fieldset>
    </div>
  </>;
}
