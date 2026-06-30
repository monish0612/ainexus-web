import { api } from './client';
import { useSettingsStore } from '@/store/settingsStore';

function liteModel(): string {
  return useSettingsStore.getState().liteModel;
}

/**
 * The user's configured bank names (distinct, trimmed) so the backend
 * smart-parse prompt can recognise cards added in Settings after release.
 */
function configuredBanks(): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const b of useSettingsStore.getState().banks) {
    const name = (b?.name ?? '').trim();
    if (!name) continue;
    const key = name.toUpperCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(name);
    }
  }
  return out;
}

export interface SmartParseResult {
  amount: number;
  description: string;
  bank: string;
  cardType: string;
  category: string;
}

export async function smartParseText(text: string): Promise<SmartParseResult> {
  const { data } = await api.post('/ai/smart-parse', {
    text,
    liteModel: liteModel(),
    banks: configuredBanks(),
  });
  return data;
}

/** Vision receipt/bill parse — base64 image (no data: prefix needed). */
export async function smartParseImage(
  image: string,
  imageMediaType: string,
): Promise<SmartParseResult> {
  const { data } = await api.post('/ai/smart-parse-image', {
    image,
    imageMediaType,
    liteModel: liteModel(),
    banks: configuredBanks(),
  });
  return data;
}

export interface CategorizeResult {
  category: string;
  confidence: string;
  reasoning?: string;
  score?: number;
}

export async function categorize(description: string): Promise<CategorizeResult> {
  const { data } = await api.post('/ai/categorize', {
    description,
    liteModel: liteModel(),
  });
  return data;
}
