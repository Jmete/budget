import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createDefaultState } from '../state/model';
import { computeBudget } from '../tax/budget';
import { Benefits } from './Benefits';

const render = (s: ReturnType<typeof createDefaultState>) =>
  renderToStaticMarkup(<Benefits state={s} budget={computeBudget(s)} onSettings={() => {}} onYear={() => {}} />);

it('hides savings plan details until a contribution is entered', () => {
  const s = createDefaultState();
  expect(render(s)).toContain('Enter a percentage if your employer offers');
  s.settings.planPct = 5;
  const html = render(s);
  expect(html).not.toContain('Enter a percentage if your employer offers');
  expect(html).toContain('Employer match goes to');
});

it('renders every optional branch and shows the year without a thousands separator', () => {
  const s = createDefaultState();
  s.income[0].amount = 100000;
  Object.assign(s.settings, { retirementType: 'dcPension', retirementPct: 5, planPct: 5, planMatchRate: 50 });
  Object.assign(s.settings.benefits, { mode: 'calendar', employmentStart: '2026-03-02', employeeSplit: true, employerAccount: 'dpsp' });
  Object.assign(s.settings.rooms, { fhsaState: 'opened', rrspStatus: 'verified' });
  const html = render(s);
  expect(html).toContain('value="2027"');
  expect(html).toContain('Pension adjustment (approx.)');
  expect(html).toContain('DPSP pension adjustment');
  expect(html).toContain('Remainder to ESP');
  expect(html).toContain('I met the opening eligibility rules');
});
