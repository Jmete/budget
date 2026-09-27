import { INCOME_KINDS, perYear, type BudgetState, type ExpenseItem, type IncomeKind } from '../../state/model';
import type { Budget } from '../../tax/budget';
import type { BreakdownNode } from './BreakdownChart';

const INCOME_COLORS: Record<IncomeKind, string> = {
  employment: 'var(--s-savings)',
  selfEmployment: 'var(--s-lifestyle)',
  other: 'var(--s-payroll)',
  eligibleDividend: 'var(--s-essentials)',
  nonEligibleDividend: 'var(--s-tax)',
  capitalGain: 'var(--s-essentials)',
  taxFree: 'var(--ink-3)',
};

const sum = (nodes: BreakdownNode[]) => nodes.reduce((s, n) => s + n.value, 0);
const itemAnnual = (e: ExpenseItem) => (e.amount ?? 0) * perYear(e.freq);

function groupNode(key: string, label: string, color: string, items: ExpenseItem[]): BreakdownNode {
  const byCat = new Map<string, BreakdownNode[]>();
  for (const e of items) {
    const v = itemAnnual(e);
    if (v <= 0) continue;
    const list = byCat.get(e.category) ?? [];
    list.push({ key: e.id, label: e.name.trim() || 'Unnamed expense', value: v });
    byCat.set(e.category, list);
  }
  const children = [...byCat.entries()].map(([cat, kids]) => ({
    key: `${key}:${cat}`,
    label: cat,
    value: sum(kids),
    children: kids,
  }));
  return { key, label, color, value: sum(children), children };
}

/** All expenses → Essentials / Lifestyle → category → individual expense. */
export function expenseTree(state: BudgetState): BreakdownNode {
  const children = [
    groupNode('essentials', 'Essentials', 'var(--s-essentials)', state.essentials),
    groupNode('lifestyle', 'Lifestyle', 'var(--s-lifestyle)', state.lifestyle),
  ];
  return { key: 'root', label: 'All expenses', value: sum(children), children };
}

/** Gross income → income type → individual source (in C$). */
export function incomeTree(state: BudgetState, b: Budget): BreakdownNode {
  const children: BreakdownNode[] = INCOME_KINDS.map((k) => {
    const kids = state.income
      .filter((i) => i.kind === k.value)
      .map((i) => ({
        key: i.id,
        label: i.name.trim() || 'Unnamed source',
        value: Math.max(0, b.incomeLines[i.id]?.annualCad ?? 0),
      }))
      .filter((n) => n.value > 0);
    return { key: k.value, label: k.label, color: INCOME_COLORS[k.value], value: sum(kids), children: kids };
  });
  return { key: 'root', label: 'Gross income', value: sum(children), children };
}
