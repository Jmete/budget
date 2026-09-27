import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Assumptions, type FxStatus } from './components/Assumptions';
import { BreakdownChart } from './components/charts/BreakdownChart';
import { expenseTree, incomeTree } from './components/charts/trees';
import { ProjectionChart } from './components/charts/ProjectionChart';
import { RateChart } from './components/charts/RateChart';
import { SplitChart } from './components/charts/SplitChart';
import { NumberField, SelectField, TextField } from './components/Fields';
import { MobileNav } from './components/MobileNav';
import { Readout } from './components/Readout';
import { AddButton, ExpenseRows, IncomeRows, InvestmentRows, Section } from './components/Sections';
import { TaxBreakdown } from './components/TaxBreakdown';
import {
  createDefaultState,
  INCOME_KINDS,
  loadState,
  PLAN_ACCOUNTS,
  RETIREMENT_TYPES,
  sanitizeState,
  saveState,
  uid,
  type BudgetState,
  type ExpenseItem,
  type IncomeItem,
  type InvestmentItem,
  type Settings,
} from './state/model';
import { fetchLatestRates } from './state/fx';
import { computeBudget, fmt } from './tax/budget';
import { DEFAULT_TAX, type TaxParams } from './tax/params';

type Theme = 'dark' | 'light';
type ListKey = 'income' | 'investments' | 'essentials' | 'lifestyle';
type ItemOf<K extends ListKey> = BudgetState[K][number];

export default function App() {
  const [state, setState] = useState<BudgetState>(loadState);
  const [theme, setTheme] = useState<Theme>(() =>
    document.documentElement.dataset.theme === 'light' ? 'light' : 'dark',
  );
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [fxStatus, setFxStatus] = useState<FxStatus>({ state: 'idle' });

  const updateRates = useCallback(async (manual: boolean) => {
    setFxStatus({ state: 'loading' });
    try {
      const { rates, sources } = await fetchLatestRates();
      setState((s) => ({
        ...s,
        settings: {
          ...s.settings,
          fx: { ...s.settings.fx, ...rates },
          fxSources: { ...s.settings.fxSources, ...sources },
          fxUpdatedAt: new Date().toISOString(),
          fxAuto: manual ? true : s.settings.fxAuto,
        },
      }));
      setFxStatus({ state: 'idle' });
      if (manual) setToast({ text: 'Exchange rates updated.' });
    } catch (e) {
      setFxStatus({ state: 'error', message: `${(e as Error).message} Your saved rates are still in use.` });
    }
  }, []);

  // Refresh rates once a day when automatic updates are on.
  useEffect(() => {
    const { fxAuto, fxUpdatedAt } = state.settings;
    const stale = !fxUpdatedAt || Date.now() - Date.parse(fxUpdatedAt) > 20 * 3600 * 1000;
    if (fxAuto && stale) void updateRates(false);
    // Only on startup and when auto-update is switched back on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.settings.fxAuto]);

  // Persist (lightly debounced so typing stays smooth).
  useEffect(() => {
    const t = setTimeout(() => saveState(state), 250);
    return () => clearTimeout(t);
  }, [state]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#ffffff' : '#060707');
    try {
      localStorage.setItem('tb.theme', theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const budget = useMemo(() => computeBudget(state), [state]);
  const incomeRoot = useMemo(() => incomeTree(state, budget), [state, budget]);
  const expenseRoot = useMemo(() => expenseTree(state), [state]);

  // ---- list helpers
  const patchItem = useCallback(<K extends ListKey>(key: K, id: string, patch: Partial<ItemOf<K>>) => {
    setState((s) => ({ ...s, [key]: (s[key] as ItemOf<K>[]).map((it) => (it.id === id ? { ...it, ...patch } : it)) }));
  }, []);
  const removeItem = useCallback((key: ListKey, id: string) => {
    setState((s) => ({ ...s, [key]: (s[key] as { id: string }[]).filter((it) => it.id !== id) }));
  }, []);
  const addItem = <K extends ListKey>(key: K, item: ItemOf<K>) => {
    setState((s) => ({ ...s, [key]: [...s[key], item] }));
    // Focus the new row's name so the user can type straight away.
    requestAnimationFrame(() => {
      const rows = document.querySelectorAll<HTMLInputElement>(`[data-list="${key}"] .row:last-child .c-name input`);
      rows[rows.length - 1]?.focus();
    });
  };
  const setSettings = (patch: Partial<Settings>) => setState((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
  const setTax = (patch: Partial<TaxParams>) => setState((s) => ({ ...s, tax: { ...s.tax, ...patch } }));

  // ---- config import / export
  const exportConfig = () => {
    const payload = { app: 'toronto-budget-planner', exportedAt: new Date().toISOString(), ...state };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const slug = state.settings.scenario.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    a.href = url;
    a.download = `budget-${slug ? slug + '-' : ''}${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setToast({ text: 'Config downloaded. Upload it on another computer to continue there.' });
  };

  const importConfig = async (file: File) => {
    try {
      if (file.size > 2_000_000) throw new Error('That file is too large to be a budget config.');
      const next = sanitizeState(JSON.parse(await file.text()));
      setState(next);
      setToast({ text: `Loaded ${file.name}.` });
    } catch (e) {
      setToast({
        text: e instanceof SyntaxError ? `${file.name} isn't valid JSON. Choose a file downloaded from this app.` : (e as Error).message,
        error: true,
      });
    }
  };

  const resetAll = () => {
    if (window.confirm('Clear every amount and restore the default rows? Download your config first if you want to keep it.')) {
      setState(createDefaultState());
      setToast({ text: 'All inputs cleared.' });
    }
  };

  const monthlyLeft = budget.unallocated / 12;
  const s = state.settings;

  return (
    <>
      <a className="skip" href="#main">
        Skip to budget
      </a>
      <header className="topbar">
        <div className="brand">
          <svg viewBox="0 0 32 32" className="brand-mark" aria-hidden="true">
            <path d="M5 26 16 6l11 20z" />
            <circle cx="16" cy="19.5" r="2.6" />
          </svg>
          <div className="brand-text">
            <span className="brand-name">Toronto Budget</span>
            <span className="brand-meta">Ontario tax year {state.tax.year}</span>
          </div>
        </div>

        <TextField
          className="scenario"
          label="Scenario name"
          value={s.scenario}
          placeholder="Name this scenario"
          onChange={(scenario) => setSettings({ scenario })}
        />

        <div className={`hud ${monthlyLeft < -0.5 ? 'is-neg' : ''}`} aria-hidden="true">
          <span>Left / mo</span>
          <strong>{fmt(monthlyLeft)}</strong>
        </div>

        <div className="actions">
          <button type="button" className="btn" onClick={() => fileInput.current?.click()}>
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M8 11V2M4.5 5.5 8 2l3.5 3.5M2.5 11v2.5h11V11" />
            </svg>
            Upload config
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importConfig(f);
              e.target.value = '';
            }}
          />
          <button type="button" className="btn" onClick={exportConfig}>
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M8 2v9M4.5 7.5 8 11l3.5-3.5M2.5 11v2.5h11V11" />
            </svg>
            Download config
          </button>
          <button type="button" className="btn ghost" onClick={resetAll}>
            Clear
          </button>
          <button
            type="button"
            className="icon-btn theme-toggle"
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            {theme === 'dark' ? (
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <circle cx="8" cy="8" r="3" />
                <path d="M8 1v1.6M8 13.4V15M1 8h1.6M13.4 8H15M3 3l1.1 1.1M11.9 11.9 13 13M3 13l1.1-1.1M11.9 4.1 13 3" />
              </svg>
            ) : (
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M13.5 9.5A5.5 5.5 0 0 1 6.5 2.5a5.5 5.5 0 1 0 7 7z" />
              </svg>
            )}
          </button>
        </div>
      </header>

      <main id="main">
        <Readout b={budget} />

        {budget.warnings.length > 0 && (
          <ul className="notices" aria-label="Notes about your plan">
            {budget.warnings.map((w, i) => (
              <li key={i} className={`notice ${w.level}`}>
                <span className="status-icon" aria-hidden="true">
                  {w.level === 'warning' ? '!' : 'i'}
                </span>
                <span className="sr-only">{w.level === 'warning' ? 'Warning:' : 'Note:'}</span>
                {w.text}
              </li>
            ))}
          </ul>
        )}

        <div className="layout">
          <div className="inputs">
            <Section
              index="01"
              id="income"
              title="Income"
              total={budget.grossIncome / 12}
              totalLabel="gross / month"
              intro={
                <details className="explainer">
                  <summary>How each income type is taxed</summary>
                  <dl>
                    {INCOME_KINDS.map((k) => (
                      <div key={k.value}>
                        <dt>{k.label}</dt>
                        <dd>{k.hint}</dd>
                      </div>
                    ))}
                    <div>
                      <dt>Foreign clients</dt>
                      <dd>
                        As a Toronto resident you pay Canadian tax on worldwide income at the same rates. Pick the
                        currency you're paid in. If a client's country withholds tax, enter the percentage and a
                        foreign tax credit is applied so you aren't taxed twice.
                      </dd>
                    </div>
                  </dl>
                </details>
              }
            >
              <div data-list="income">
                <IncomeRows
                  items={state.income}
                  budget={budget}
                  fx={s.fx}
                  onChange={(id, p) => patchItem('income', id, p)}
                  onRemove={(id) => removeItem('income', id)}
                />
              </div>
              <AddButton
                onClick={() =>
                  addItem('income', {
                    id: uid(),
                    name: '',
                    kind: 'employment',
                    amount: null,
                    freq: 'year',
                    currency: 'CAD',
                    foreignTaxPct: null,
                  } satisfies IncomeItem)
                }
              >
                Add income
              </AddButton>
            </Section>

            <Section
              index="02"
              id="savings"
              title="Savings & investing"
              total={budget.personalContributions / 12}
              tone="--s-savings"
            >
              <div data-list="investments">
                <InvestmentRows
                  items={state.investments}
                  onChange={(id, p) => patchItem('investments', id, p)}
                  onRemove={(id) => removeItem('investments', id)}
                />
              </div>
              <AddButton
                onClick={() =>
                  addItem('investments', { id: uid(), name: '', kind: 'tfsa', amount: null, freq: 'month' } satisfies InvestmentItem)
                }
              >
                Add contribution
              </AddButton>

              <div className="subpanels">
                <fieldset className="param-group">
                  <legend>Workplace retirement plan</legend>
                  <p className="hint">
                    {s.retirementType === 'dcPension'
                      ? "Your contributions are deducted from taxable income. Your employer's aren't taxed, but they lower next year's RRSP room."
                      : "Your contributions use RRSP room. Your employer's are taxed as salary, then deducted like your own."}
                  </p>
                  <SelectField hideLabel={false} label="Plan type" value={s.retirementType} options={RETIREMENT_TYPES} onChange={(retirementType) => setSettings({ retirementType })} />
                  <NumberField hideLabel={false} label="You contribute (% of salary)" suffix="%" placeholder="e.g. 6" value={s.retirementPct} min={0} onChange={(retirementPct) => setSettings({ retirementPct })} />
                  <NumberField hideLabel={false} label="Match rate" suffix="%" placeholder="e.g. 100" value={s.matchRate} min={0} onChange={(matchRate) => setSettings({ matchRate })} />
                  <NumberField hideLabel={false} label="Up to % of salary" suffix="%" placeholder="e.g. 3" value={s.matchCapPct} min={0} onChange={(matchCapPct) => setSettings({ matchCapPct })} />
                  <NumberField hideLabel={false} label="Annual maximum" prefix="$" placeholder="No cap" value={s.matchMax} min={0} onChange={(matchMax) => setSettings({ matchMax })} />
                  <p className="derived">
                    <span>You contribute</span>
                    <strong>{fmt(budget.retirementContribution / 12)}/mo</strong>
                  </p>
                  <p className="derived">
                    <span>Employer adds</span>
                    <strong>{fmt(budget.employerMatch / 12)}/mo</strong>
                  </p>
                  {s.retirementType === 'dcPension' ? (
                    <p className="derived">
                      <span>Next year's RRSP room cut</span>
                      <strong>{fmt(budget.pensionAdjustment)}/yr</strong>
                    </p>
                  ) : (
                    <p className="derived">
                      <span>Tax on the match</span>
                      <strong>{fmt(budget.employerMatchTax / 12)}/mo</strong>
                    </p>
                  )}
                </fieldset>
                <fieldset className="param-group">
                  <legend>Employee savings plan</legend>
                  <p className="hint">
                    Payroll share purchase or savings plan with an employer match. The match is a taxable benefit added to your salary.
                  </p>
                  <NumberField hideLabel={false} label="You contribute (% of salary)" suffix="%" placeholder="e.g. 6" value={s.planPct} min={0} onChange={(planPct) => setSettings({ planPct })} />
                  <SelectField hideLabel={false} label="Held in" value={s.planAccount} options={PLAN_ACCOUNTS} onChange={(planAccount) => setSettings({ planAccount })} />
                  <NumberField hideLabel={false} label="Match rate" suffix="%" placeholder="e.g. 50" value={s.planMatchRate} min={0} onChange={(planMatchRate) => setSettings({ planMatchRate })} />
                  <NumberField hideLabel={false} label="Up to % of salary" suffix="%" placeholder="e.g. 6" value={s.planMatchCapPct} min={0} onChange={(planMatchCapPct) => setSettings({ planMatchCapPct })} />
                  <NumberField hideLabel={false} label="Annual maximum" prefix="$" placeholder="No cap" value={s.planMatchMax} min={0} onChange={(planMatchMax) => setSettings({ planMatchMax })} />
                  <p className="derived">
                    <span>You contribute</span>
                    <strong>{fmt(budget.planContribution / 12)}/mo</strong>
                  </p>
                  <p className="derived">
                    <span>Employer adds</span>
                    <strong>{fmt(budget.planMatch / 12)}/mo</strong>
                  </p>
                  <p className="derived">
                    <span>Tax on the match</span>
                    <strong>{fmt(budget.planMatchTax / 12)}/mo</strong>
                  </p>
                </fieldset>
                <fieldset className="param-group">
                  <legend>Contribution room</legend>
                  <p className="hint">From your CRA Notice of Assessment or My Account. Used to cap deductions and flag over-contributions.</p>
                  <NumberField hideLabel={false} label="RRSP room" prefix="$" placeholder="Unknown" value={s.rrspRoom} min={0} onChange={(rrspRoom) => setSettings({ rrspRoom })} />
                  <NumberField hideLabel={false} label="FHSA room" prefix="$" placeholder={DEFAULT_TAX.fhsaAnnualLimit.toLocaleString('en-CA')} value={s.fhsaRoom} min={0} onChange={(fhsaRoom) => setSettings({ fhsaRoom })} />
                  <NumberField hideLabel={false} label="TFSA room" prefix="$" placeholder="Unknown" value={s.tfsaRoom} min={0} onChange={(tfsaRoom) => setSettings({ tfsaRoom })} />
                  <p className="derived">
                    <span>Deducted from income</span>
                    <strong>{fmt(budget.rrspDeduction + budget.fhsaDeduction)}/yr</strong>
                  </p>
                </fieldset>
              </div>
            </Section>

            <Section index="03" id="essentials" title="Essentials" total={budget.essentials / 12} tone="--s-essentials">
              <div data-list="essentials">
                <ExpenseRows
                  label="Essential expenses"
                  items={state.essentials}
                  onChange={(id, p) => patchItem('essentials', id, p)}
                  onRemove={(id) => removeItem('essentials', id)}
                />
              </div>
              <AddButton
                onClick={() =>
                  addItem('essentials', { id: uid(), name: '', category: 'Other', amount: null, freq: 'month' } satisfies ExpenseItem)
                }
              >
                Add essential
              </AddButton>
            </Section>

            <Section index="04" id="lifestyle" title="Lifestyle & subscriptions" total={budget.lifestyle / 12} tone="--s-lifestyle">
              <div data-list="lifestyle">
                <ExpenseRows
                  label="Lifestyle expenses"
                  items={state.lifestyle}
                  onChange={(id, p) => patchItem('lifestyle', id, p)}
                  onRemove={(id) => removeItem('lifestyle', id)}
                />
              </div>
              <AddButton
                onClick={() =>
                  addItem('lifestyle', { id: uid(), name: '', category: 'Other', amount: null, freq: 'month' } satisfies ExpenseItem)
                }
              >
                Add lifestyle expense
              </AddButton>
            </Section>
          </div>

          <aside className="rail" id="analysis" aria-label="Analysis">
            <BreakdownChart
              id="income-mix"
              title="Income"
              rootLabel="Gross income"
              root={incomeRoot}
              emptyText="Add income to see where it comes from."
            />
            <TaxBreakdown b={budget} />
            <BreakdownChart
              id="expense-mix"
              title="Expenses"
              rootLabel="All expenses"
              root={expenseRoot}
              emptyText="Add expense amounts to see where your money goes."
            />
            <SplitChart b={budget} />
            <RateChart state={state} b={budget} />
            <ProjectionChart state={state} b={budget} />
          </aside>
        </div>

        <div className="wide">
          <Section index="05" id="assumptions" title="Assumptions">
            <Assumptions
              state={state}
              onSettings={setSettings}
              onTax={setTax}
              onResetTax={() => setState((st) => ({ ...st, tax: structuredClone(DEFAULT_TAX) }))}
              fxStatus={fxStatus}
              onUpdateRates={() => void updateRates(true)}
            />
          </Section>
        </div>
      </main>

      <footer className="footer">
        <p>
          Estimates only. The calculator covers federal and Ontario income tax, CPP, EI, the Ontario Health Premium,
          RRSP and FHSA deductions, dividend and foreign tax credits. It leaves out credits such as tuition, medical,
          donations and the Canada Workers Benefit. Check with a tax professional before filing.
        </p>
        <p>Your inputs stay in this browser's local storage and are never uploaded.</p>
      </footer>

      <MobileNav monthlyLeft={monthlyLeft} />

      <div className={`toast ${toast ? 'show' : ''} ${toast?.error ? 'error' : ''}`} role="status" aria-live="polite">
        {toast?.text}
      </div>
    </>
  );
}
