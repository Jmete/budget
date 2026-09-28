import { describe, expect, it } from 'vitest';
import { EXPENSE_CATEGORIES, groupItems, isGrouped, moveItem } from './model';

describe('moveItem', () => {
  it('moves down and up', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveItem(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c']);
  });
});

describe('groupItems', () => {
  const cat = (x: { c: string }) => x.c;
  const items = [
    { n: 1, c: 'Food' },
    { n: 2, c: 'Housing' },
    { n: 3, c: 'Food' },
    { n: 4, c: 'Other' },
    { n: 5, c: 'Housing' },
  ];

  it('groups by the category order and keeps order within a group', () => {
    expect(groupItems(items, cat, EXPENSE_CATEGORIES).map((x) => x.n)).toEqual([2, 5, 1, 3, 4]);
  });

  it('detects an already grouped list', () => {
    expect(isGrouped(items, cat, EXPENSE_CATEGORIES)).toBe(false);
    expect(isGrouped(groupItems(items, cat, EXPENSE_CATEGORIES), cat, EXPENSE_CATEGORIES)).toBe(true);
  });
});
