// Parity tests for the web bank/card management actions (mirror of Flutter's
// bank_config_sync_test). The network/sync side-effects are stubbed so the test
// exercises pure state transitions: add/update/delete + day clamping + the
// CC↔DB billing-cycle rules.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api/settings', () => ({
  pushPreferencesBatch: vi.fn().mockResolvedValue(undefined),
  pushAppSetting: vi.fn().mockResolvedValue(undefined),
  fetchPreferences: vi.fn().mockResolvedValue(null),
}));

import { DEFAULT_BANKS } from '@/lib/constants';
import { useSettingsStore } from './settingsStore';

const last = () => {
  const banks = useSettingsStore.getState().banks;
  return banks[banks.length - 1];
};

beforeEach(() => {
  useSettingsStore.setState({ banks: DEFAULT_BANKS.map((b) => ({ ...b })) });
});

describe('settingsStore — banks & cards', () => {
  it('ships defaults that include at least one configured credit card', () => {
    const cc = DEFAULT_BANKS.filter((b) => b.cardType === 'CC');
    expect(cc.length).toBeGreaterThan(0);
    for (const b of cc) {
      expect(typeof b.statementDay).toBe('number');
      expect(typeof b.dueDay).toBe('number');
    }
  });

  it('addBank appends a credit card and clamps out-of-range days', () => {
    const before = useSettingsStore.getState().banks.length;
    useSettingsStore.getState().addBank('ICICI', { cardType: 'CC', statementDay: 99, dueDay: 0 });
    expect(useSettingsStore.getState().banks.length).toBe(before + 1);
    const added = last();
    expect(added.name).toBe('ICICI');
    expect(added.cardType).toBe('CC');
    expect(added.statementDay).toBe(31);
    expect(added.dueDay).toBe(1);
  });

  it('addBank ignores blank names', () => {
    const before = useSettingsStore.getState().banks.length;
    useSettingsStore.getState().addBank('   ');
    expect(useSettingsStore.getState().banks.length).toBe(before);
  });

  it('a debit card never carries a billing cycle', () => {
    useSettingsStore.getState().addBank('KOTAK', { cardType: 'DB', statementDay: 10, dueDay: 5 });
    const added = last();
    expect(added.cardType).toBe('DB');
    expect(added.statementDay).toBeUndefined();
    expect(added.dueDay).toBeUndefined();
  });

  it('updateBank → debit clears the billing cycle', () => {
    useSettingsStore.getState().addBank('SCAPIA', { cardType: 'CC', statementDay: 26, dueDay: 15 });
    const id = last().id;
    useSettingsStore.getState().updateBank(id, { cardType: 'DB' });
    const updated = useSettingsStore.getState().banks.find((b) => b.id === id)!;
    expect(updated.cardType).toBe('DB');
    expect(updated.statementDay).toBeUndefined();
    expect(updated.dueDay).toBeUndefined();
  });

  it('updateBank can revise a CC billing cycle in place', () => {
    useSettingsStore.getState().addBank('AXIS', { cardType: 'CC', statementDay: 24, dueDay: 13 });
    const id = last().id;
    useSettingsStore.getState().updateBank(id, { statementDay: 20, dueDay: 8 });
    const updated = useSettingsStore.getState().banks.find((b) => b.id === id)!;
    expect(updated.statementDay).toBe(20);
    expect(updated.dueDay).toBe(8);
  });

  it('deleteBank removes only the target entry', () => {
    const target = useSettingsStore.getState().banks[0].id;
    const before = useSettingsStore.getState().banks.length;
    useSettingsStore.getState().deleteBank(target);
    expect(useSettingsStore.getState().banks.length).toBe(before - 1);
    expect(useSettingsStore.getState().banks.find((b) => b.id === target)).toBeUndefined();
  });
});
