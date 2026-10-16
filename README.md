# Toronto Budget

A budget planner for someone living in Toronto. Enter your salary, consulting income, investments and expenses to see
take-home pay, federal and Ontario tax, CPP/EI, and what is left each month.

## Features

- **Tax engine.** Federal and Ontario brackets, basic personal amounts (including the federal phase-out), CPP, CPP2, EI,
  the Canada employment amount, Ontario surtax, tax reduction and Health Premium.
- **Income types.** Salary (T4), consulting / self-employment (both halves of CPP, no EI), interest and other income,
  eligible and non-eligible dividends, capital gains, and tax-free cash.
- **Foreign clients.** Enter income in USD, EUR, GBP, SAR or HKD. Exchange rates update daily from the Bank of Canada (with ExchangeRate-API for currencies it no longer publishes, such as SAR), or you can type your own. Any foreign tax withheld gets a
  foreign tax credit. The app also shows how much to set aside each month for consulting tax.
- **Registered accounts.** RRSP and FHSA deductions (capped at the contribution room you enter), TFSA and
  non-registered contributions, and group RRSP employer matching.
- **Charts.** Where gross income goes, income and expense breakdowns (pie or bar, click to drill down from type → category → item), needs/wants/savings against the 50/30/20 guideline,
  marginal and average tax rates, and a savings growth projection. Each chart can also be shown as a table.
- **Your data stays local.** Inputs are saved in `localStorage`. Use **Download config** / **Upload config** to move
  them between computers.
- Dark mode by default, with a light mode.

The 50/30/20 comparison uses after-tax income before personal payroll savings. Only personal savings count
toward the 20% target; all debt payments count as needs, and unallocated cash remains separate. This is a
savings-only adaptation: the usual rule also counts debt payments above the minimum toward 20%. Employer contributions appear in
the dollar total for planned savings and the growth projection, but not in the 50/30/20 percentages. The planned
saving rate also excludes unallocated cash, employer contributions and debt payments.

The default planning year is 2027. It uses the published 2027 EI rates and RRSP limit; other figures stay at their 2026
values until CRA publishes the 2027 indexation in November. Built-in 2026 figures are also available: set the planning
year to 2026. Every tax rate and limit can be edited under **Assumptions → 2027 tax rates and limits** and is saved in the
exported config.

## Develop

```sh
npm install
npm run dev     # http://localhost:5173
npm test        # tax, plan, contribution-room and state regression tests
npm run build   # static site in dist/
```

`dist/` uses relative paths, so it can be hosted on GitHub Pages, Netlify, Cloudflare Pages or any static host.

## Caveats

These are estimates. The planner does not cover every credit (tuition, medical, donations, Canada Workers Benefit,
etc.), and it treats foreign tax credits simply. Check with a Canadian tax professional before filing.

## Workplace plans and contribution room

Under **Savings & investing**, enter your workplace pension and savings plan: contribution rates, employer automatic
and matching contributions, waiting periods and caps. The default is a typical full year divided by 12; switch to the
calendar year to prorate from a start date. RRSP, TFSA and FHSA room stays unknown (no deduction is assumed) until you
enter a verified amount or an estimate, and an unopened FHSA has no room.
