import type { ReactNode } from 'react';
import {
  ACCOUNT_KINDS,
  CURRENCIES,
  EXPENSE_CATEGORIES,
  FREQS,
  INCOME_KINDS,
  perYear,
  type BudgetState,
  type ExpenseItem,
  type IncomeItem,
  type InvestmentItem,
} from '../state/model';
import { fmt, type Budget } from '../tax/budget';
import { HintLabel, NumberField, SelectField, TextField } from './Fields';

const FREQ_OPTIONS = FREQS.map((f) => ({ value: f.value, label: f.label }));

export function Section({
  index,
  id,
  title,
  total,
  totalLabel = 'per month',
  tone,
  children,
  intro,
}: {
  index: string;
  id: string;
  title: string;
  total?: number;
  totalLabel?: string;
  tone?: string;
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="panel section" aria-labelledby={`${id}-title`} id={id}>
      <header className="section-head">
        <span className="section-index" aria-hidden="true">
          {index}
        </span>
        <h2 id={`${id}-title`}>{title}</h2>
        {total !== undefined && (
          <div className="section-total">
            {tone && <span className="swatch" style={{ background: `var(${tone})` }} aria-hidden="true" />}
            <strong>{fmt(total)}</strong>
            <span>{totalLabel}</span>
          </div>
        )}
      </header>
      {intro && <div className="section-intro">{intro}</div>}
      {children}
    </section>
  );
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="icon-btn remove" aria-label={`Remove ${label || 'row'}`} title="Remove" onClick={onClick}>
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M4 4l8 8M12 4l-8 8" />
      </svg>
    </button>
  );
}

function Calc({ value, dim }: { value: number; dim?: boolean }) {
  return <span className={`calc ${dim || !value ? 'is-zero' : ''}`}>{fmt(value)}</span>;
}

export function AddButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" className="add-btn" onClick={onClick}>
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M8 3v10M3 8h10" />
      </svg>
      {children}
    </button>
  );
}

// ------------------------------------------------------------------ income

export function IncomeRows({
  items,
  budget,
  fx,
  onChange,
  onRemove,
}: {
  items: IncomeItem[];
  budget: Budget;
  fx: BudgetState['settings']['fx'];
  onChange: (id: string, patch: Partial<IncomeItem>) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="rows rows-income" role="table" aria-label="Income sources">
      <div className="row row-head" role="row">
        <span role="columnheader">Source</span>
        <span role="columnheader">Type</span>
        <span role="columnheader">Amount</span>
        <span role="columnheader">Frequency</span>
        <span role="columnheader">
          <HintLabel label="Withheld">
            <strong>Foreign tax withheld</strong>
            <span>
              The % a foreign country took from this payment before it reached you, e.g. 15 for a 15% withholding tax.
            </span>
            <span>
              A foreign tax credit is applied so you aren't taxed twice. Leave blank for Canadian income: tax on your
              salary is already calculated.
            </span>
          </HintLabel>
        </span>
        <span role="columnheader" className="r">C$ / month</span>
        <span role="columnheader" className="r">C$ / year</span>
        <span />
      </div>
      {items.length === 0 && <p className="empty">Add your salary, consulting or other income to see your take-home pay.</p>}
      {items.map((item) => {
        const line = budget.incomeLines[item.id];
        const kind = INCOME_KINDS.find((k) => k.value === item.kind);
        return (
          <div className="row" role="row" key={item.id}>
            <TextField className="c-name" label="Source name" value={item.name} placeholder="Income source" onChange={(name) => onChange(item.id, { name })} />
            <SelectField
              className="c-kind"
              label="Income type"
              title={kind?.hint}
              value={item.kind}
              options={INCOME_KINDS}
              onChange={(k) => onChange(item.id, { kind: k })}
            />
            <div className="c-amount money-pair">
              <SelectField
                className="currency"
                label="Currency"
                value={item.currency}
                options={CURRENCIES}
                onChange={(currency) => onChange(item.id, { currency })}
              />
              <NumberField label={`${item.name || 'Income'} amount`} value={item.amount} onChange={(amount) => onChange(item.id, { amount })} />
            </div>
            <SelectField className="c-freq" label="Frequency" value={item.freq} options={FREQ_OPTIONS} onChange={(freq) => onChange(item.id, { freq })} />
            <NumberField
              className="c-pct"
              label="Foreign tax withheld (percent)"
              value={item.kind === 'taxFree' ? null : item.foreignTaxPct}
              suffix="%"
              min={0}
              onChange={(foreignTaxPct) => onChange(item.id, { foreignTaxPct })}
            />
            <span className="c-mo r" role="cell">
              <Calc value={(line?.annualCad ?? 0) / 12} />
            </span>
            <span className="c-yr r" role="cell">
              <Calc value={line?.annualCad ?? 0} />
              {item.currency !== 'CAD' && <small className="fx-note">@ {fx[item.currency]} C$/{item.currency}</small>}
            </span>
            <RemoveButton label={item.name} onClick={() => onRemove(item.id)} />
          </div>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------- investments

export function InvestmentRows({
  items,
  onChange,
  onRemove,
}: {
  items: InvestmentItem[];
  onChange: (id: string, patch: Partial<InvestmentItem>) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="rows rows-simple" role="table" aria-label="Savings and investment contributions">
      <div className="row row-head" role="row">
        <span role="columnheader">Contribution</span>
        <span role="columnheader">Account</span>
        <span role="columnheader">Amount</span>
        <span role="columnheader">Frequency</span>
        <span role="columnheader" className="r">C$ / month</span>
        <span role="columnheader" className="r">C$ / year</span>
        <span />
      </div>
      {items.length === 0 && <p className="empty">Add an RRSP, FHSA, TFSA or other savings contribution.</p>}
      {items.map((item) => {
        const yr = (item.amount ?? 0) * perYear(item.freq);
        const kind = ACCOUNT_KINDS.find((k) => k.value === item.kind);
        return (
          <div className="row" role="row" key={item.id}>
            <TextField className="c-name" label="Contribution name" value={item.name} placeholder="Account name" onChange={(name) => onChange(item.id, { name })} />
            <SelectField className="c-kind" label="Account type" title={kind?.hint} value={item.kind} options={ACCOUNT_KINDS} onChange={(k) => onChange(item.id, { kind: k })} />
            <NumberField className="c-amount" label={`${item.name || 'Contribution'} amount`} prefix="$" value={item.amount} min={0} onChange={(amount) => onChange(item.id, { amount })} />
            <SelectField className="c-freq" label="Frequency" value={item.freq} options={FREQ_OPTIONS} onChange={(freq) => onChange(item.id, { freq })} />
            <span className="c-mo r" role="cell">
              <Calc value={yr / 12} />
            </span>
            <span className="c-yr r" role="cell">
              <Calc value={yr} />
            </span>
            <RemoveButton label={item.name} onClick={() => onRemove(item.id)} />
          </div>
        );
      })}
    </div>
  );
}

// ----------------------------------------------------------------- expenses

export function ExpenseRows({
  items,
  label,
  onChange,
  onRemove,
}: {
  items: ExpenseItem[];
  label: string;
  onChange: (id: string, patch: Partial<ExpenseItem>) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="rows rows-simple" role="table" aria-label={label}>
      <div className="row row-head" role="row">
        <span role="columnheader">Expense</span>
        <span role="columnheader">Category</span>
        <span role="columnheader">Amount</span>
        <span role="columnheader">Frequency</span>
        <span role="columnheader" className="r">C$ / month</span>
        <span role="columnheader" className="r">C$ / year</span>
        <span />
      </div>
      {items.length === 0 && <p className="empty">No expenses here yet. Add one below.</p>}
      {items.map((item) => {
        const yr = (item.amount ?? 0) * perYear(item.freq);
        return (
          <div className="row" role="row" key={item.id}>
            <TextField className="c-name" label="Expense name" value={item.name} placeholder="Expense" onChange={(name) => onChange(item.id, { name })} />
            <SelectField className="c-kind" label="Category" value={item.category} options={EXPENSE_CATEGORIES} onChange={(category) => onChange(item.id, { category })} />
            <NumberField className="c-amount" label={`${item.name || 'Expense'} amount`} prefix="$" value={item.amount} min={0} onChange={(amount) => onChange(item.id, { amount })} />
            <SelectField className="c-freq" label="Frequency" value={item.freq} options={FREQ_OPTIONS} onChange={(freq) => onChange(item.id, { freq })} />
            <span className="c-mo r" role="cell">
              <Calc value={yr / 12} />
            </span>
            <span className="c-yr r" role="cell">
              <Calc value={yr} />
            </span>
            <RemoveButton label={item.name} onClick={() => onRemove(item.id)} />
          </div>
        );
      })}
    </div>
  );
}
