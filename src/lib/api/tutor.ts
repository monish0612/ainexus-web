import { api } from './client';
import { useSettingsStore, Provider } from '@/store/settingsStore';
import { Source } from './news';
import { uuid } from '@/lib/format';
import { buildModelHints, ModelMode } from '@/lib/modelHints';

// Builds the { provider, mode, <one model id> } contract the backend resolver
// expects — only the model field matching the active (provider, mode) pair is
// sent so a "lite" call can never be silently upgraded to a deep model.
function searchHints(mode: ModelMode, provider?: Provider) {
  const s = useSettingsStore.getState();
  return buildModelHints({
    provider: provider ?? s.onlineSearchProvider,
    mode,
    deepModel: s.deepModel,
    liteModel: s.liteModel,
    xgrokLiteModel: s.xgrokLiteModel,
    xgrokDeepModel: s.xgrokDeepModel,
    xgrokThinkingModel: s.xgrokThinkingModel,
  });
}

// ── Rephrase ──────────────────────────────────────────────────────────────────

export async function rephrase(
  text: string,
  platform: string,
  intent?: string,
): Promise<{ platform: string; rephrasedText: string; model: string }> {
  const { liteModel } = useSettingsStore.getState();
  const { data } = await api.post('/ai/rephrase', { text, platform, intent, liteModel });
  return data;
}

// ── Coach (correct) ───────────────────────────────────────────────────────────

export interface CoachResult {
  correctedText: string;
  explanation: string;
  variations: { label: string; text: string }[];
  model: string;
}

export async function correct(text: string): Promise<CoachResult> {
  const { liteModel } = useSettingsStore.getState();
  const { data } = await api.post('/ai/correct', { text, liteModel });
  return data;
}

// ── Dictionary (define) ───────────────────────────────────────────────────────

export interface DefineResult {
  word: string;
  pronunciation: string;
  partOfSpeech: string;
  definition: string;
  examples: string[];
  usageGuide: string;
  model: string;
}

export async function define(word: string): Promise<DefineResult> {
  const { liteModel } = useSettingsStore.getState();
  const { data } = await api.post('/ai/define', { word, liteModel });
  return {
    word: data.word ?? word,
    pronunciation: data.pronunciation ?? '',
    partOfSpeech: data.partOfSpeech ?? '',
    definition: data.definition ?? '',
    examples: Array.isArray(data.examples) ? data.examples : [],
    usageGuide: data.usageGuide ?? '',
    model: data.model ?? '',
  };
}

// ── InsightAI (web search / deep research / image search) ─────────────────────

export type SearchMode = 'lite' | 'deep' | 'thinking';

export interface SearchResult {
  answer: string;
  model: string;
  sources: Source[];
  searchQueries: string[];
  mode?: string;
}

export async function groundedSearch(
  query: string,
  mode: SearchMode,
  provider?: Provider,
): Promise<SearchResult> {
  const { data } = await api.post('/ai/grounded-search', {
    query,
    ...searchHints(mode, provider),
  });
  return {
    answer: data.answer ?? '',
    model: data.model ?? '',
    sources: data.sources ?? [],
    searchQueries: data.searchQueries ?? [],
    mode: data.mode,
  };
}

export async function imageSearch(
  query: string,
  image: string,
  imageMediaType: string,
  mode: SearchMode,
  provider?: Provider,
): Promise<SearchResult> {
  const { data } = await api.post('/ai/image-search', {
    query,
    image,
    imageMediaType,
    ...searchHints(mode, provider),
  });
  return {
    answer: data.answer ?? '',
    model: data.model ?? '',
    sources: data.sources ?? [],
    searchQueries: data.searchQueries ?? [],
    mode: data.mode,
  };
}

export async function searchFollowUp(params: {
  query: string;
  question: string;
  history: { role: string; text: string }[];
  mode: SearchMode;
  provider?: Provider;
}): Promise<SearchResult> {
  const { data } = await api.post('/ai/article-followup', {
    articleTitle: params.query,
    articleUrl: '',
    question: params.question,
    history: params.history,
    ...searchHints(params.mode, params.provider),
  });
  return {
    answer: data.answer ?? '',
    model: data.model ?? '',
    sources: data.sources ?? [],
    searchQueries: data.searchQueries ?? [],
  };
}

// ── Saved words ───────────────────────────────────────────────────────────────

export interface SavedWord {
  id: string;
  word: string;
  definition: string;
  pronunciation: string;
  part_of_speech: string;
  saved_at: string;
  response_json: string;
}

export async function fetchSavedWords(): Promise<SavedWord[]> {
  const { data } = await api.get<SavedWord[]>('/saved-words');
  return Array.isArray(data) ? data : [];
}

export async function saveWord(d: DefineResult): Promise<void> {
  await api.post('/saved-words', {
    id: uuid(),
    word: d.word,
    definition: d.definition,
    pronunciation: d.pronunciation,
    partOfSpeech: d.partOfSpeech,
    savedAt: new Date().toISOString(),
    responseJson: JSON.stringify(d),
  });
}

export async function deleteSavedWord(id: string): Promise<void> {
  await api.delete(`/saved-words/${id}`);
}

// ── Saved searches ────────────────────────────────────────────────────────────

export interface SavedSearch {
  id: string;
  kind: string;
  query: string;
  title: string;
  responseType: string;
  responseJson: string;
  model: string;
  provider: string;
  mode: string;
  pinned: boolean;
  savedAt: string;
  updatedAt: string;
}

export async function fetchSavedSearches(): Promise<SavedSearch[]> {
  const { data } = await api.get<SavedSearch[]>('/saved-searches');
  return Array.isArray(data) ? data : [];
}

export async function saveSearch(s: {
  query: string;
  title: string;
  result: SearchResult;
  mode: string;
}): Promise<string> {
  const id = uuid();
  await api.post('/saved-searches', {
    id,
    kind: 'query',
    query: s.query,
    title: s.title,
    responseType: 'search',
    responseJson: JSON.stringify(s.result),
    model: s.result.model,
    mode: s.mode,
    pinned: true,
    savedAt: new Date().toISOString(),
  });
  return id;
}

export async function deleteSavedSearch(id: string): Promise<void> {
  await api.delete(`/saved-searches/${id}`);
}

export interface SearchChatMessage {
  id: string;
  role: string;
  text: string;
  model?: string;
  sources_json?: string;
  created_at?: string;
}

export async function fetchSearchChat(id: string): Promise<SearchChatMessage[]> {
  const { data } = await api.get<SearchChatMessage[]>(`/saved-searches/${id}/chat`);
  return Array.isArray(data) ? data : [];
}

export async function saveSearchChat(searchId: string, msg: SearchChatMessage): Promise<void> {
  await api.post(`/saved-searches/${searchId}/chat`, {
    id: msg.id,
    role: msg.role,
    text: msg.text,
    model: msg.model ?? '',
    sourcesJson: msg.sources_json ?? '[]',
    createdAt: msg.created_at ?? new Date().toISOString(),
  });
}
