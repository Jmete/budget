import { useId } from 'react';
import { PLAN_ACCOUNTS, RETIREMENT_TYPES, type BudgetState, type Settings } from '../state/model';
import { DEFAULT_BENEFITS, type BenefitRules, type RoomDetails } from '../state/benefits';
import { fmt, type Budget } from '../tax/budget';
import { NumberField, SelectField, TextField } from './Fields';

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const id = useId();
  return <div className="field"><label className="field-label" htmlFor={id}>{label}</label><div className="input-shell"><input id={id} type="date" value={value} onChange={e => onChange(e.target.value)} /></div></div>;
}
const statusOptions = [{ value: 'unknown' as const, label: 'I don’t know yet' }, { value: 'verified' as const, label: 'Verified from CRA / records' }, { value: 'estimated' as const, label: 'My estimate' }];

export function Benefits({ state, budget: b, onSettings, onYear }: { state: BudgetState; budget: Budget; onSettings: (patch: Partial<Settings>) => void; onYear: (year: number) => void }) {
  const s = state.settings, rules = s.benefits, rooms = s.rooms;
  const setRule = (patch: Partial<BenefitRules>) => onSettings({ benefits: { ...rules, ...patch } });
  const setRoom = (patch: Partial<RoomDetails>) => onSettings({ rooms: { ...rooms, ...patch } });
  const amount = (label: string, value: number) => <p className="derived"><span>{label}</span><strong>{fmt(value, 2)}/yr · {fmt(value / 12, 2)}/mo</strong></p>;
  type NumberRule = { [K in keyof BenefitRules]: BenefitRules[K] extends number | null ? K : never }[keyof BenefitRules];
  const numberRule = (key: NumberRule, label: string, suffix?: string) => <NumberField hideLabel={false} label={label} value={rules[key]} min={0} suffix={suffix} placeholder={rules[key] === null ? 'No cap / not set' : '0'} onChange={v => setRule({ [key]: v ?? DEFAULT_BENEFITS[key] } as Partial<BenefitRules>)} />;
  return <>
    <div className="benefit-timing param-group">
      <p className="hint">Enter your pension and savings plan details below, including contribution rates, employer matching, and where contributions go.</p>
      <div className="benefit-grid">
        <SelectField hideLabel={false} label="Show contributions for" value={rules.mode} options={[{ value: 'annualized', label: 'Typical full year (monthly budget)' }, { value: 'calendar', label: 'Actual calendar year (use dates)' }]} onChange={mode => setRule({ mode, ...(mode === 'annualized' ? { residency: 'fullYear' as const } : {}) })} />
        <NumberField hideLabel={false} label="Tax / planning year" value={state.tax.year} maxDigits={0} onChange={v => { if (v !== null && v >= 2009 && v <= 2100) onYear(Math.round(v)); }} />
        {rules.mode === 'calendar' && <DateField label="Employment start date" value={rules.employmentStart} onChange={employmentStart => setRule({ employmentStart })} />}
      </div>
      <p className="hint">{rules.mode === 'annualized'
        ? 'Plan a typical month using a full year of salary and plan participation, divided by 12. Full-year Canadian tax residency is assumed; start dates do not reduce this budget.'
        : 'Salary rows contain your annual pay rate. Calendar mode prorates salary and workplace plans only. Monthly results are the year’s total divided by 12.'} Changing the year requires reviewing tax rates and contribution room.</p>
      <details><summary>Earnings and payslip details</summary>
        <div className="benefit-grid">
          <NumberField hideLabel={false} label="Eligible annual plan earnings" value={rules.eligibleAnnualEarnings} prefix="$" placeholder="Use salary total" min={0} onChange={eligibleAnnualEarnings => setRule({ eligibleAnnualEarnings })} />
          <SelectField hideLabel={false} label="Canadian tax residency assumption" value={rules.residency} options={[{ value: 'fullYear', label: 'Full calendar year' }, { value: 'partYearUnknown', label: 'Part year / needs review' }]} onChange={residency => setRule({ residency })} />
          <NumberField hideLabel={false} label="Income tax withheld from pay this year" value={rules.incomeTaxWithheld} prefix="$" placeholder="Unknown" min={0} onChange={incomeTaxWithheld => setRule({ incomeTaxWithheld })} />
          <NumberField hideLabel={false} label="CPP + EI withheld from pay this year" value={rules.cppEiWithheld} prefix="$" placeholder="Unknown" min={0} onChange={cppEiWithheld => setRule({ cppEiWithheld })} />
        </div>
        <p className="hint">Use full-year actual totals (or a full-year forecast), not year-to-date amounts. Tax liability below is an estimate, not payroll withholding. Part-year resident credits need a separate review; this engine uses full-year credits.</p>
        <p className="derived"><span>Bank pay after payroll contributions</span><strong>{b.actualCashAfterPayroll === null ? 'Enter withholding totals' : `${fmt(b.actualCashAfterPayroll, 2)}/yr`}</strong></p>
      </details>
    </div>
    <div className="subpanels benefits-panels">
      <fieldset className="param-group">
        <legend>Workplace retirement plan</legend>
        <p className="hint">A DC pension uses its own RPP deduction. Its employee + employer contributions affect next year’s RRSP room, not today’s room.</p>
        <SelectField hideLabel={false} label="Plan type" value={s.retirementType} options={RETIREMENT_TYPES} onChange={retirementType => onSettings({ retirementType })} />
        <NumberField hideLabel={false} label="You contribute" value={s.retirementPct} suffix="%" min={0} onChange={retirementPct => onSettings({ retirementPct })} />
        {numberRule('automaticPct', 'Employer automatic contribution', '%')}
        <NumberField hideLabel={false} label="Employer match (50% = 50¢ per $1)" value={s.matchRate} suffix="%" min={0} onChange={matchRate => onSettings({ matchRate })} />
        <NumberField hideLabel={false} label="Match your first … % of earnings" value={s.matchCapPct} suffix="%" min={0} placeholder="All contributions" onChange={matchCapPct => onSettings({ matchCapPct })} />
        {rules.mode === 'annualized' ? numberRule('membershipYear', 'Pension membership year') : <p className="hint">Plan starts: <strong>{b.plans.dates.retirement || 'Enter employment / plan start date'}</strong>. Membership years run from this date.</p>}
        <details><summary>Plan dates, caps and later matching</summary>
          <DateField label="Retirement plan start (optional override)" value={rules.retirementStart} onChange={retirementStart => setRule({ retirementStart })} />
          {numberRule('retirementWaitMonths', 'Waiting period', 'months')}
          {numberRule('retirementEmployeeMaxPct', 'Maximum employee election', '%')}
          {numberRule('employerEarningsCap', 'Employer annual earnings cap')}
          {numberRule('employeeEarningsCap', 'Your elected annual earnings cap')}
          {numberRule('automaticMax', 'Automatic contribution annual maximum')}
          <NumberField hideLabel={false} label="Matching contribution annual maximum" prefix="$" placeholder="No cap" value={s.matchMax} min={0} onChange={matchMax => onSettings({ matchMax })} />
          {numberRule('matchStepYear', 'Higher match starts in membership year')}
          {numberRule('laterMatchRate', 'Higher employer match', '%')}
          <SelectField hideLabel={false} label="If the registered pension limit is reached" value={rules.limitAllocation} options={[{ value: 'employeeFirst', label: 'Reduce employee contributions first' }, { value: 'proportional', label: 'Reduce all contributions proportionally' }]} onChange={limitAllocation => setRule({ limitAllocation })} />
          <p className="hint">Blank caps mean no cap; zero means zero. Limit reductions use this budgeting convention; confirm your plan administrator’s method.</p>
          {s.retirementType === 'groupRrsp' && <label className="check"><input type="checkbox" checked={rules.groupRrspWithdrawable} onChange={e => setRule({ groupRrspWithdrawable: e.target.checked })} />Group RRSP allows ordinary cash withdrawals before leaving (employer benefit subject to EI)</label>}
        </details>
        {amount('You contribute', b.retirementContribution)}
        {amount('Employer automatic', b.employerAutomatic)}
        {amount('Employer matching', b.employerMatching)}
        {amount('Total employer contribution', b.employerMatch)}
        {amount('Total retirement savings', b.retirementContribution + b.employerMatch)}
        {s.retirementType === 'dcPension' && <p className="derived"><span>Approx. pension adjustment (DC only)</span><strong>{fmt(b.retirementContribution + b.employerMatch)}/yr</strong></p>}
      </fieldset>
      <fieldset className="param-group">
        <legend>Employee savings plan</legend>
        <p className="hint">Separate from your pension. An employer share contribution is invested compensation, never extra cash in your bank account.</p>
        <NumberField hideLabel={false} label="You save from pay" value={s.planPct} suffix="%" min={0} onChange={planPct => onSettings({ planPct })} />
        <SelectField hideLabel={false} label="Your contributions go to" value={rules.employeeSplit ? 'split' : s.planAccount} options={[...PLAN_ACCOUNTS.map(a => ({ ...a, label: a.value === 'nonRegistered' ? 'ESP / non-registered' : a.label })), { value: 'split', label: 'Split between ESP, RRSP and TFSA' }]} onChange={value => value === 'split' ? setRule({ employeeSplit: true }) : onSettings({ planAccount: value, benefits: { ...rules, employeeSplit: false } })} />
        {rules.employeeSplit && <>
          {numberRule('employeeRrspAllocation', 'Share of your savings going to RRSP', '%')}
          {numberRule('employeeTfsaAllocation', 'Share of your savings going to TFSA', '%')}
          <p className="derived"><span>Remainder to ESP / non-registered</span><strong>{rules.employeeRrspAllocation + rules.employeeTfsaAllocation > 100 ? 'Must total 100% or less' : `${100 - rules.employeeRrspAllocation - rules.employeeTfsaAllocation}%`}</strong></p>
        </>}
        <SelectField hideLabel={false} label="Employer match goes to" value={rules.employerAccount} options={[{ value: 'unknown', label: 'I need to check my plan' }, ...(rules.planKind === 'profitSharing' ? [] : PLAN_ACCOUNTS), { value: 'epsp', label: 'Separate EPSP (taxable, T4PS)' }, { value: 'dpsp', label: 'Separate DPSP (tax-deferred)' }]} onChange={employerAccount => setRule({ employerAccount })} />
        {rules.planKind !== 'profitSharing' && !['epsp', 'dpsp'].includes(rules.employerAccount) && <SelectField hideLabel={false} label="Employer benefit treatment" value={rules.benefitTreatment} options={[{ value: 'unknown', label: 'I need to check payroll treatment' }, { value: 'nonCash', label: 'Taxable non-cash: CPP, no EI' }, { value: 'cash', label: 'Taxable cash benefit: CPP + EI' }, { value: 'exempt', label: 'Non-taxable (confirmed by plan)' }]} onChange={benefitTreatment => setRule({ benefitTreatment })} />}
        <NumberField hideLabel={false} label="Savings match rate" value={s.planMatchRate} suffix="%" min={0} onChange={planMatchRate => onSettings({ planMatchRate })} />
        <NumberField hideLabel={false} label="Match your first … % of savings earnings" value={s.planMatchCapPct} suffix="%" min={0} placeholder="All contributions" onChange={planMatchCapPct => onSettings({ planMatchCapPct })} />
        {rules.mode === 'calendar' && <p className="hint">Plan starts: <strong>{b.plans.dates.savings || 'Enter employment / plan start date'}</strong></p>}
        <details><summary>Savings plan dates and limits</summary>
          <SelectField hideLabel={false} label="Savings plan arrangement" value={rules.planKind} options={[{ value: 'generic', label: 'Other employer / configurable' }, { value: 'profitSharing', label: 'Separate EPSP or DPSP' }]} onChange={planKind => setRule({ planKind })} />
          <DateField label="Savings plan start (optional override)" value={rules.savingsStart} onChange={savingsStart => setRule({ savingsStart })} />
          {numberRule('savingsWaitMonths', 'Savings waiting period', 'months')}
          {numberRule('savingsEmployeeMaxPct', 'Maximum savings election', '%')}
          {numberRule('savingsEarningsCap', 'Savings annual earnings cap')}
          <NumberField hideLabel={false} label="Employer savings match annual maximum" value={s.planMatchMax} prefix="$" placeholder="No cap" min={0} onChange={planMatchMax => onSettings({ planMatchMax })} />
          <p className="hint">Leave the annual maximum blank unless your plan specifies a cap. In a separate profit-sharing arrangement, the employer match goes to EPSP or DPSP independently of your contributions. EPSP is taxable at allocation without CPP/EI or income-tax withholding; DPSP contributes to a pension adjustment.</p>
        </details>
        {amount('You contribute', b.planContribution)}
        {amount('Employer adds', b.planMatch)}
        {amount('Total savings plan', b.planContribution + b.planMatch)}
        {rules.employerAccount === 'dpsp' && <p className="derived"><span>Additional DPSP pension adjustment</span><strong>{fmt(b.planMatch)}/yr</strong></p>}
        <p className="derived"><span>Income tax on employer match</span><strong>{b.planMatchIncomeTax === null ? 'Unconfirmed — check plan / room' : `${fmt(b.planMatchIncomeTax / 12, 2)}/mo`}</strong></p>
        <p className="derived"><span>Extra CPP + EI on match</span><strong>{b.planMatchPayrollTax === null ? 'Unconfirmed' : `${fmt(b.planMatchPayrollTax / 12, 2)}/mo`}</strong></p>
        {b.planMatchTax === null && <p className="hint">Budget reserves {fmt(b.planTaxRange[1] / 12, 2)}/mo under the stated taxable-benefit assumption. A confirmed tax-deferred account or eligible RRSP deduction may lower this. This is not withholding.</p>}
      </fieldset>
      <fieldset className="param-group">
        <legend>Contribution room</legend>
        <p className="hint">Unknown is different from $0. Use room at the start of the selected tax year, before the contributions listed in this budget. RRSP uses the CRA deduction limit; prior unused contributions are entered separately.</p>
        <p className="derived"><span>Room for planning year</span><strong>{state.tax.year}</strong></p>
        <p className="hint">Follows your Tax / planning year above. Each year’s entries are saved separately; new years start with unknown room.</p>
        {(['rrsp', 'tfsa', 'fhsa'] as const).map(k => <div className="room-account" key={k}>
          <h3>{k.toUpperCase()}</h3>
          {k === 'fhsa' && <>
            <SelectField hideLabel={false} label="FHSA account situation" value={rooms.fhsaState} options={[{ value: 'unknown', label: 'Eligibility / opening not confirmed' }, { value: 'ineligible', label: 'Not eligible' }, { value: 'notOpened', label: 'Eligible, but not opened' }, { value: 'opened', label: 'Opened an FHSA' }]} onChange={fhsaState => setRoom({ fhsaState })} />
            {rooms.fhsaState === 'opened' && <><DateField label="First FHSA opening date" value={rooms.fhsaOpened} onChange={fhsaOpened => setRoom({ fhsaOpened })} /><label className="check"><input type="checkbox" checked={rooms.fhsaEligibilityConfirmed} onChange={e => setRoom({ fhsaEligibilityConfirmed: e.target.checked })} />I met the opening eligibility rules below</label></>}
            <p className="hint">At opening: Canadian resident, age 18+ and no more than 71 at year-end. In that year before opening and the prior four years, you must not have lived in a home you or your current spouse/partner owned (including overseas). Confirm all rules with your issuer.</p>
          </>}
          <SelectField hideLabel={false} label={`${k.toUpperCase()} room source`} value={rooms[`${k}Status`]} options={statusOptions} onChange={v => setRoom({ [`${k}Status`]: v })} />
          {rooms[`${k}Status`] !== 'unknown' && <NumberField hideLabel={false} label={k === 'rrsp' ? 'RRSP deduction limit for the year' : `${k.toUpperCase()} room before this year’s contributions`} value={s[`${k}Room`]} prefix="$" placeholder={k === 'rrsp' ? 'Enter amount, including 0' : 'Enter amount or use history below'} min={0} onChange={v => onSettings({ [`${k}Room`]: v })} />}
          <p className="derived"><span>Room available before planned deposits</span><strong>{(k === 'rrsp' ? b.roomAvailable.rrspNewContributions : b.roomAvailable[k]) === null ? 'Unknown' : fmt((k === 'rrsp' ? b.roomAvailable.rrspNewContributions : b.roomAvailable[k])!, 2)}</strong></p>
          <p className="derived"><span>Deposits planned this year</span><strong>{fmt(b.roomUsed[k], 2)}</strong></p>
        </div>)}
        <details><summary>History and contributions elsewhere</summary>
          <p className="hint">Add amounts missing from the annual investment rows and payroll plans only. These contributions count in this year’s cash flow, room use and deductions; do not enter them twice.</p>
          {(['rrsp', 'tfsa', 'fhsa'] as const).map(k => <NumberField key={k} hideLabel={false} label={`${k.toUpperCase()} contributions elsewhere this year`} value={rooms[`${k}Elsewhere`]} prefix="$" min={0} onChange={v => setRoom({ [`${k}Elsewhere`]: v ?? 0 })} />)}
          <NumberField hideLabel={false} label="RRSP prior-year contributions not yet deducted" value={rooms.rrspPriorUnused} prefix="$" min={0} onChange={v => setRoom({ rrspPriorUnused: v ?? 0 })} />
          <p className="hint">These already occupy RRSP room. The model claims them against your deduction limit before additional contributions; they do not leave your bank account again this year. This year’s salary does not create this year’s RRSP room.</p>
          <h3>Estimate TFSA room from history</h3>
          <p className="hint">Select “My estimate” and leave the TFSA amount blank. List only years you were 18+ and a Canadian tax resident for at least part of the year (for example 2010-2012, 2026). Citizenship alone does not qualify. This estimates current room, not historical excess or non-resident contribution penalties.</p>
          <TextField hideLabel={false} label="Qualifying Canadian resident years" value={rooms.tfsaQualifyingYears} placeholder="e.g. 2026" onChange={tfsaQualifyingYears => setRoom({ tfsaQualifyingYears })} />
          <NumberField hideLabel={false} label="TFSA total contributions before this year" value={rooms.tfsaPastContributions} prefix="$" placeholder="Enter 0 if none" min={0} onChange={tfsaPastContributions => setRoom({ tfsaPastContributions })} />
          <NumberField hideLabel={false} label="TFSA total withdrawals before this year" value={rooms.tfsaPastWithdrawals} prefix="$" placeholder="Enter 0 if none" min={0} onChange={tfsaPastWithdrawals => setRoom({ tfsaPastWithdrawals })} />
          <h3>Estimate FHSA room from history</h3>
          <p className="hint">Select “My estimate” and leave the FHSA amount blank. Opening generates $8,000; carryforward is capped at $8,000. No room accrues before opening. For ordinary contributions only; transfers, excess corrections and re-participation room need a verified amount.</p>
          <NumberField hideLabel={false} label="FHSA unused room carried from last year" value={rooms.fhsaCarryforward} prefix="$" placeholder="Enter 0 if none" min={0} onChange={fhsaCarryforward => setRoom({ fhsaCarryforward })} />
          <NumberField hideLabel={false} label="FHSA lifetime contributions + RRSP transfers before this year" value={rooms.fhsaLifetimeUsed} prefix="$" placeholder="Enter 0 if none" min={0} onChange={fhsaLifetimeUsed => setRoom({ fhsaLifetimeUsed })} />
        </details>
        {amount('RRSP + FHSA deductions allowed', b.rrspDeduction + b.fhsaDeduction)}
        <p className="derived"><span>Approx. total PA for next year’s RRSP calculation</span><strong>{fmt(b.pensionAdjustment)}/yr</strong></p>
        <p className="hint">DC pension contributions use no current RRSP room. Unknown employer allocations are not assigned to a registered account until confirmed.</p>
      </fieldset>
    </div>
  </>;
}
