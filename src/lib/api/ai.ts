import { api } from './client';
import { useSettingsStore } from '@/store/settingsStore';

function liteModel(): string {
  return useSettingsStore.getState().liteModel;
}

export interface SmartParseResult {
  amount: number;
  description: string;
  bank: string;
  cardType: string;
  category: string;
}

export async function smartParseText(text: string): Promise<SmartParseResult> {
  const { data } = await api.post('/ai/smart-parse', { text, liteModel: liteModel() });
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
