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
  // The backend returns `responseJson` as a PARSED object (it JSON.parses the
  // stored column before sending), but older/local rows may still be a raw
  // string — callers must tolerate both. See `parseSavedResult`.
  responseJson: unknown;
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

/**
 * Decode a saved-search `responseJson` (object OR string) into a
 * `SearchResult`, tolerating every shape the platforms persist:
 *   • Web grounded:  { answer, model, sources, searchQueries }
 *   • Android grounded/tavily: same keys (+ query, citations)
 *   • Android summarizer: { summary, model, ... } — `summary` → answer
 * Returns null only when the payload is unusable.
 */
export function parseSavedResult(raw: unknown): SearchResult | null {
  let obj: Record<string, unknown> | null = null;
  if (raw && typeof raw === 'object') {
    obj = raw as Record<string, unknown>;
  } else if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') obj = parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  if (!obj) return null;
  const str = (v: unknown): string => (typeof v === 'string' ? v : '');
  const answer = str(obj.answer) || str(obj.text) || str(obj.summary) || str(obj.content);
  return {
    answer,
    model: str(obj.model),
    sources: Array.isArray(obj.sources) ? (obj.sources as Source[]) : [],
    searchQueries: Array.isArray(obj.searchQueries) ? (obj.searchQueries as string[]) : [],
    mode: str(obj.mode) || undefined,
  };
}

export async function saveSearch(s: {
  id?: string;
  query: string;
  title: string;
  result: SearchResult;
  mode: string;
  provider?: string;
}): Promise<string> {
  const id = s.id ?? uuid();
  await api.post('/saved-searches', {
    id,
    kind: 'query',
    query: s.query,
    title: s.title,
    // Use the SAME response type + JSON shape the Android app persists
    // (`SavedSearchResponseType.grounded`) so a web-saved search renders its
    // ANSWER (not just the query) when opened on the phone, and vice-versa.
    responseType: 'grounded',
    responseJson: JSON.stringify({
      answer: s.result.answer,
      query: s.query,
      model: s.result.model,
      searchQueries: s.result.searchQueries ?? [],
      sources: s.result.sources ?? [],
      citations: [],
    }),
    model: s.result.model,
    provider: s.provider ?? '',
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
  const { data } = await api.get<Record<string, unknown>[]>(`/saved-searches/${id}/chat`);
  if (!Array.isArray(data)) return [];
  // The backend emits camelCase (`sourcesJson`/`createdAt`); normalize to the
  // snake_case shape the UI uses so reopened messages keep their source counts.
  return data.map((m) => ({
    id: String(m.id ?? ''),
    role: String(m.role ?? 'assistant'),
    text: String(m.text ?? ''),
    model: m.model != null ? String(m.model) : '',
    sources_json: String(m.sources_json ?? m.sourcesJson ?? '[]'),
    created_at: String(m.created_at ?? m.createdAt ?? ''),
  }));
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
