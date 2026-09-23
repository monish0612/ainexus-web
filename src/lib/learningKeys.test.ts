import { describe, expect, it } from 'vitest';
import { applyExpenseTombstones, type Expense } from './api/expense';
import { learningKeys, matchLearning } from './learningKeys';

describe('learningKeys', () => {
  it('trains firstcry from an email handle and skips email and com', () => {
    const keys = learningKeys('email@firstcry.com');
    expect(keys).toContain('email@firstcry.com');
    expect(keys).toContain('firstcry.com');
    expect(keys).toContain('firstcry');
    expect(keys).not.toContain('email');
    expect(keys).not.toContain('com');
  });

  it('does not treat a UPI PSP as a shop', () => {
    const keys = learningKeys('Q227400652@ybl');
    expect(keys).toContain('q227400652@ybl');
    expect(keys).not.toContain('ybl');
  });

  it('a taught brand matches a different handle on the same shop', () => {
    expect(matchLearning('care@firstcry.com', { firstcry: 'Family' })).toBe('Family');
  });
});

describe('applyExpenseTombstones', () => {
  const row = (id: string): Expense => ({
    id,
    amount: 1,
    description: id,
    category: 'Food',
    bank: 'HDFC',
    cardType: 'DB',
    date: '2026-09-23T12:00:00',
  });

  it('drops an id the phone already deleted', () => {
    const live = applyExpenseTombstones(
      [row('keep'), row('gone')],
      [{ id: 'gone', deletedAt: '2026-09-23T12:01:00.000Z' }],
    );
    expect(live.map((e) => e.id)).toEqual(['keep']);
  });
});
