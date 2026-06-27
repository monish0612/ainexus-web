import { api } from './client';

export interface GeminiModel {
  id: string;
  displayName: string;
  description?: string;
  inputTokenLimit?: number;
  outputTokenLimit?: number;
}

export interface GeminiModelList {
  models: GeminiModel[];
  primary?: string;
  cachedAt?: string;
}

export async function fetchModels(refresh = false): Promise<GeminiModelList> {
  const { data } = await api.get<GeminiModelList>('/ai/models', {
    params: refresh ? { refresh: 1 } : undefined,
  });
  return { models: data.models ?? [], primary: data.primary, cachedAt: data.cachedAt };
}

/** Flat string key-value map. */
export async function fetchPreferences(): Promise<Record<string, string>> {
  const { data } = await api.get<Record<string, string>>('/user-preferences');
  return data ?? {};
}

export async function pushPreferencesBatch(
  entries: { key: string; value: string }[],
): Promise<void> {
  if (!entries.length) return;
  // Backend caps the batch at 30 entries; we only ever send ~11.
  await api.put('/user-preferences/batch', { entries });
}

export async function pushAppSetting(key: string, value: string): Promise<void> {
  await api.put('/app-settings', { key, value });
}

export interface DataResetEpoch {
  fullGen: number;
  expenseGen: number;
  resetAt: string | null;
}

export async function getDataReset(): Promise<DataResetEpoch> {
  const { data } = await api.get<DataResetEpoch>('/data-reset');
  return data;
}

export async function postDataReset(
  scope: 'full' | 'expense',
): Promise<DataResetEpoch> {
  const { data } = await api.post<DataResetEpoch>('/data-reset', { scope });
  return data;
}
