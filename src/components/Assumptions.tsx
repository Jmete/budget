import { FOREIGN_CURRENCIES, type BudgetState, type Settings } from '../state/model';

export type FxStatus = { state: 'idle' } | { state: 'loading' } | { state: 'error'; message: string };
import { defaultTaxFor, type Bracket, type TaxParams } from '../tax/params';
import { NumberField } from './Fields';

type NumKey = { [K in keyof TaxParams]: TaxParams[K] extends number ? K : never }[keyof TaxParams];

const round = (n: number) => Math.round(n * 1e6) / 1e6;

function ParamField({
  tax,
  k,
  label,
  percent,
  onChange,
}: {
  tax: TaxParams;
  k: NumKey;
  label: string;
  percent?: boolean;
  onChange: (patch: Partial<TaxParams>) => void;
}) {
  const v = tax[k];
  return (
    <NumberField
      hideLabel={false}
      label={label}
      value={percent ? round(v * 100) : v}
      prefix={percent ? undefined : '$'}
      suffix={percent ? '%' : undefined}
      maxDigits={4}
      onChange={(n) => onChange({ [k]: n == null ? defaultTaxFor(tax.year)[k] : percent ? n / 100 : n } as Partial<TaxParams>)}
    />
  );
}

function Brackets({
  title,
  brackets,
  onChange,
}: {
  title: string;
  brackets: Bracket[];
  onChange: (b: Bracket[]) => void;
}) {
  const set = (i: number, patch: Partial<Bracket>) => onChange(brackets.map((b, j) => (i === j ? { ...b, ...patch } : b)));
  return (
    <fieldset className="param-group">
      <legend>{title}</legend>
      {brackets.map((b, i) => (
        <div className="bracket" key={i}>
          <span className="bracket-range">
            {i === 0 ? 'First' : `Over ${(brackets[i - 1].upTo ?? 0).toLocaleString('en-CA')}`}
          </span>
          {b.upTo !== null ? (
            <NumberField label={`Bracket ${i + 1} upper limit`} prefix="$" value={b.upTo} onChange={(n) => set(i, { upTo: n ?? 0 })} />
          ) : (
            <span className="bracket-top">and above</span>
          )}
          <NumberField
            label={`Bracket ${i + 1} rate`}
            suffix="%"
            maxDigits={4}
            value={round(b.rate * 100)}
            onChange={(n) => set(i, { rate: (n ?? 0) / 100 })}
          />
        </div>
      ))}
    </fieldset>
  );
}

export function Assumptions({
  state,
  onSettings,
  onTax,
  onResetTax,
  fxStatus,
  onUpdateRates,
}: {
  state: BudgetState;
  onSettings: (patch: Partial<Settings>) => void;
  onTax: (patch: Partial<TaxParams>) => void;
  onResetTax: () => void;
  fxStatus: FxStatus;
  onUpdateRates: () => void;
}) {
  const { settings: s, tax } = state;
  const P = (k: NumKey, label: string, percent = false) => (
    <ParamField tax={tax} k={k} label={label} percent={percent} onChange={onTax} />
  );

  return (
    <>
      <div className="param-grid">
        <fieldset className="param-group">
          <legend>Exchange rates</legend>
          <p className="hint">C$ per unit of foreign currency. Bank of Canada daily rates, with ExchangeRate-API for any it doesn't publish.</p>
          {FOREIGN_CURRENCIES.map((c) => (
            <div key={c} className="fx-field">
              <span className="fx-code" aria-hidden="true">
                {c}
              </span>
              <NumberField
                label={`1 ${c} in C$`}
                prefix="C$"
                value={s.fx[c]}
                maxDigits={5}
                onChange={(n) =>
                  onSettings({
                    fx: { ...s.fx, [c]: n ?? 1 },
                    fxSources: { ...s.fxSources, [c]: 'Entered manually' },
                    fxAuto: false,
                  })
                }
              />
              <small className="fx-source">{s.fxSources[c] ?? 'Default estimate'}</small>
            </div>
          ))}
          <div className="fx-actions">
            <div className="fx-row">
              <button type="button" className="btn" onClick={onUpdateRates} disabled={fxStatus.state === 'loading'}>
                {fxStatus.state === 'loading' ? 'Updating…' : 'Update now'}
              </button>
              <label className="check" title="Refresh rates once a day when the app opens">
                <input type="checkbox" checked={s.fxAuto} onChange={(e) => onSettings({ fxAuto: e.target.checked })} />
                <span>Auto-update daily</span>
              </label>
            </div>
            <span className={`fx-status ${fxStatus.state === 'error' ? 'is-error' : ''}`} role="status">
              {fxStatus.state === 'error'
                ? fxStatus.message
                : s.fxUpdatedAt
                  ? `Last updated ${new Date(s.fxUpdatedAt).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' })}`
                  : 'Not updated yet'}
            </span>
          </div>
        </fieldset>
        <fieldset className="param-group">
          <legend>Projection</legend>
          <p className="hint">Used by the savings growth chart. Nominal return before inflation.</p>
          <NumberField hideLabel={false} label="Expected annual return" suffix="%" value={s.returnRate} onChange={(n) => onSettings({ returnRate: n ?? 0 })} />
          <NumberField
            hideLabel={false}
            label="Years to project"
            value={s.horizonYears}
            maxDigits={0}
            onChange={(n) => onSettings({ horizonYears: Math.min(50, Math.max(1, Math.round(n ?? 25))) })}
          />
        </fieldset>
        <fieldset className="param-group">
          <legend>Other deductions</legend>
          <p className="hint">Annual union or professional dues, childcare, moving expenses and similar. Reduces taxable income.</p>
          <NumberField
            hideLabel={false}
            label="Other deductions per year"
            prefix="$"
            value={s.otherDeductions}
            min={0}
            onChange={(otherDeductions) => onSettings({ otherDeductions })}
          />
        </fieldset>
      </div>

      <details className="tax-params">
        <summary>
          <span>{tax.year} tax rates and limits</span>
          <span className="summary-hint">Edit only when CRA publishes new figures</span>
        </summary>
        <div className="param-grid">
          <Brackets title="Federal brackets" brackets={tax.federalBrackets} onChange={(federalBrackets) => onTax({ federalBrackets })} />
          <Brackets title="Ontario brackets" brackets={tax.ontarioBrackets} onChange={(ontarioBrackets) => onTax({ ontarioBrackets })} />
          <fieldset className="param-group">
            <legend>CPP & EI</legend>
            {P('cppBasicExemption', 'CPP basic exemption')}
            {P('cppYmpe', 'CPP earnings limit (YMPE)')}
            {P('cppYampe', 'CPP2 earnings limit (YAMPE)')}
            {P('cppBaseRate', 'CPP base rate', true)}
            {P('cppFirstEnhancedRate', 'CPP first enhanced rate', true)}
            {P('cpp2Rate', 'CPP2 rate', true)}
            {P('eiMaxInsurable', 'EI maximum insurable earnings')}
            {P('eiRate', 'EI premium rate', true)}
          </fieldset>
          <fieldset className="param-group">
            <legend>Federal credits</legend>
            {P('federalBpaMax', 'Basic personal amount (max)')}
            {P('federalBpaMin', 'Basic personal amount (min)')}
            {P('federalBpaPhaseStart', 'BPA phase-out starts')}
            {P('federalBpaPhaseEnd', 'BPA phase-out ends')}
            {P('canadaEmploymentAmount', 'Canada employment amount')}
          </fieldset>
          <fieldset className="param-group">
            <legend>Ontario credits & surtax</legend>
            {P('ontarioBpa', 'Ontario basic personal amount')}
            {P('ontarioSurtaxT1', 'Surtax threshold 1')}
            {P('ontarioSurtaxR1', 'Surtax rate 1', true)}
            {P('ontarioSurtaxT2', 'Surtax threshold 2')}
            {P('ontarioSurtaxR2', 'Surtax rate 2', true)}
            {P('ontarioReductionBasic', 'Tax reduction basic amount')}
          </fieldset>
          <fieldset className="param-group">
            <legend>Investment income</legend>
            {P('capitalGainsInclusion', 'Capital gains inclusion', true)}
            {P('eligibleDivGrossUp', 'Eligible dividend gross-up', true)}
            {P('eligibleDivFedCredit', 'Eligible federal credit', true)}
            {P('eligibleDivOnCredit', 'Eligible Ontario credit', true)}
            {P('nonEligibleDivGrossUp', 'Non-eligible gross-up', true)}
            {P('nonEligibleDivFedCredit', 'Non-eligible federal credit', true)}
            {P('nonEligibleDivOnCredit', 'Non-eligible Ontario credit', true)}
          </fieldset>
          <fieldset className="param-group">
            <legend>Account limits</legend>
            {P('rrspDollarLimit', 'RRSP dollar limit')}
            {P('rrspEarnedIncomeRate', 'RRSP % of earned income', true)}
            {P('moneyPurchaseLimit', 'DC pension limit')}
            {P('fhsaAnnualLimit', 'FHSA annual limit')}
            {P('fhsaLifetimeLimit', 'FHSA lifetime limit')}
            {P('tfsaAnnualLimit', 'TFSA annual limit')}
          </fieldset>
        </div>
        <button type="button" className="btn ghost" onClick={onResetTax}>
          Restore {defaultTaxFor(tax.year).year} defaults
        </button>
      </details>
    </>
  );
}
