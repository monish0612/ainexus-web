import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Bookmark,
  ExternalLink,
  ImagePlus,
  Search,
  Send,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { Button, EmptyState, Spinner } from '@/components/ui/primitives';
import { ModelPicker } from '@/components/ui/ModelPicker';
import { ModelBadge } from '@/components/ui/ModelBadge';
import { Markdown } from '@/components/ui/Markdown';
import { toast } from '@/components/ui/toast';
import { useSettingsStore, Provider } from '@/store/settingsStore';
import { apiErrorMessage } from '@/lib/api/client';
import { uuid } from '@/lib/format';
import { imageFileToPayload } from '@/features/expense/receipt';
import {
  SearchChatMessage,
  SearchMode,
  SearchResult,
  deleteSavedSearch,
  fetchSavedSearches,
  fetchSearchChat,
  groundedSearch,
  imageSearch,
  parseSavedResult,
  saveSearch,
  saveSearchChat,
  searchFollowUp,
} from '@/lib/api/tutor';
import { Source } from '@/lib/api/news';
import { persist } from '@/lib/api/persistQueue';

function countSources(sourcesJson?: string): number {
  if (!sourcesJson) return 0;
  try {
    const parsed = JSON.parse(sourcesJson);
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

function Sources({ sources }: { sources: Source[] }) {
  if (!sources.length) return null;
  return (
    <div className="mt-4 border-t border-line pt-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg3">Sources</p>
      <div className="flex flex-col gap-1.5">
        {sources.map((s, i) => (
          <a
            key={i}
            href={s.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm text-accent hover:underline"
          >
            <ExternalLink size={13} className="shrink-0" />
            <span className="truncate">{s.title || s.url}</span>
          </a>
        ))}
      </div>
    </div>
  );
}

export function InsightAITab() {
  const qc = useQueryClient();
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<SearchMode>('lite');
  const onlineSearchProvider = useSettingsStore((s) => s.onlineSearchProvider);
  const [provider, setProvider] = useState<Provider>(onlineSearchProvider);
  const [image, setImage] = useState<{ base64: string; mediaType: string; preview: string } | null>(null);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [activeQuery, setActiveQuery] = useState('');
  const [loading, setLoading] = useState(false);
  // `sessionId` is the STABLE id for the current result session. It's chosen
  // up-front (on search / on reopen) so that when the user finally taps Save
  // the parent row and every follow-up message share one id — and the id used
  // here is exactly the one persisted, so reopening (here or on the phone)
  // re-attaches the same chat. `savedId` is non-null only once the row is
  // actually persisted (pinned) on the server.
  const [sessionId, setSessionId] = useState<string>(() => uuid());
  const [savedId, setSavedId] = useState<string | null>(null);
  const [chat, setChat] = useState<SearchChatMessage[]>([]);
  const [followInput, setFollowInput] = useState('');
  const [followBusy, setFollowBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const topRef = useRef<HTMLDivElement>(null);

  const { data: savedSearches = [] } = useQuery({
    queryKey: ['saved-searches'],
    queryFn: fetchSavedSearches,
  });

  const del = useMutation({
    mutationFn: deleteSavedSearch,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['saved-searches'] });
      toast.info('Removed');
    },
  });

  async function onPickImage(file: File) {
    try {
      const p = await imageFileToPayload(file);
      setImage({ ...p, preview: URL.createObjectURL(file) });
    } catch {
      toast.error('Could not read image');
    }
  }

  async function run() {
    if (!query.trim() && !image) return;
    const q = query.trim() || 'Describe this image';
    setLoading(true);
    setResult(null);
    setSavedId(null);
    setSessionId(uuid());
    setChat([]);
    setActiveQuery(q);
    try {
      const res = image
        ? await imageSearch(q, image.base64, image.mediaType, mode, provider)
        : await groundedSearch(q, mode, provider);
      setResult(res);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Search failed'));
    } finally {
      setLoading(false);
    }
  }

  async function onSave() {
    if (!result || savedId) return;
    try {
      const id = await saveSearch({
        id: sessionId,
        query: activeQuery,
        title: activeQuery.slice(0, 80),
        result,
        mode,
        provider,
      });
      setSavedId(id);
      // Flush any follow-ups asked BEFORE saving so they persist on the
      // server and sync to the phone. Robust retry + Telegram on failure.
      for (const m of chat) {
        persist('saved-search-chat', () => saveSearchChat(id, m));
      }
      qc.invalidateQueries({ queryKey: ['saved-searches'] });
      toast.success('Saved');
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not save'));
    }
  }

  async function sendFollow() {
    const q = followInput.trim();
    if (!q || followBusy || !result) return;
    setFollowInput('');
    const userMsg: SearchChatMessage = {
      id: uuid(),
      role: 'user',
      text: q,
      created_at: new Date().toISOString(),
    };
    setChat((c) => [...c, userMsg]);
    setFollowBusy(true);
    if (savedId) persist('saved-search-chat', () => saveSearchChat(savedId, userMsg));
    try {
      const history = [
        { role: 'assistant', text: result.answer },
        ...chat.map((m) => ({ role: m.role, text: m.text })),
      ];
      const res = await searchFollowUp({ query: activeQuery, question: q, history, mode, provider });
      const aiMsg: SearchChatMessage = {
        id: uuid(),
        role: 'assistant',
        text: res.answer,
        model: res.model,
        sources_json: JSON.stringify(res.sources),
        created_at: new Date().toISOString(),
      };
      setChat((c) => [...c, aiMsg]);
      if (savedId) persist('saved-search-chat', () => saveSearchChat(savedId, aiMsg));
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Follow-up failed'));
      setChat((c) => c.filter((m) => m.id !== userMsg.id));
      setFollowInput(q);
    } finally {
      setFollowBusy(false);
    }
  }

  async function openSaved(s: (typeof savedSearches)[number]) {
    // `responseJson` arrives as a parsed object from the server (or a raw
    // string for legacy/local rows). `parseSavedResult` tolerates both and
    // every cross-platform shape (web grounded, Android grounded/summarizer).
    const parsed = parseSavedResult(s.responseJson);
    if (!parsed) {
      toast.error('Could not open saved search');
      return;
    }
    setResult(parsed);
    setActiveQuery(s.query);
    setSessionId(s.id);
    setSavedId(s.id);
    setChat([]);
    setMode((s.mode as SearchMode) || 'lite');
    if (s.provider) setProvider(s.provider as Provider);
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // Load the persisted follow-up chat (may have been created here earlier
    // or on the phone). Best-effort — a fetch failure just leaves it empty.
    try {
      const msgs = await fetchSearchChat(s.id);
      setChat(msgs);
    } catch {
      /* keep chat empty on failure */
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-5 sm:px-6">
      <div ref={topRef} className="-mt-2 scroll-mt-4" />
      <div className="card flex flex-col gap-3 p-4">
        {image && (
          <div className="relative w-fit">
            <img src={image.preview} alt="" className="h-24 rounded-xl border border-line" />
            <button
              onClick={() => setImage(null)}
              className="absolute -right-2 -top-2 grid h-6 w-6 place-items-center rounded-full bg-bg4 text-fg"
            >
              <X size={14} />
            </button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <button
            onClick={() => fileRef.current?.click()}
            className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-line bg-bg2 text-fg3 hover:text-fg"
            aria-label="Attach image"
          >
            <ImagePlus size={18} />
          </button>
          <textarea
            className="input max-h-32 min-h-[48px] flex-1 resize-none py-3"
            placeholder="Ask anything — get a researched answer with sources…"
            rows={1}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                run();
              }
            }}
          />
          <button
            onClick={run}
            disabled={loading || (!query.trim() && !image)}
            className="btn-accent h-12 w-12 shrink-0 rounded-xl p-0"
            aria-label="Search"
          >
            {loading ? <Spinner size={18} /> : <Search size={18} />}
          </button>
        </div>
        <ModelPicker
          provider={provider}
          mode={mode}
          onProviderChange={setProvider}
          onModeChange={setMode}
          modes={['lite', 'deep', 'thinking']}
        />
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPickImage(f);
            e.target.value = '';
          }}
        />
      </div>

      {loading && (
        <div className="card flex items-center gap-3 p-5 text-fg3">
          <Spinner size={18} /> Researching “{activeQuery}”…
        </div>
      )}

      {result && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-sm font-semibold text-accent">
              <Sparkles size={15} /> Answer
            </span>
            <Button
              variant="ghost"
              onClick={onSave}
              disabled={!!savedId}
              className="px-3 py-1.5 text-xs"
            >
              <Bookmark size={14} /> {savedId ? 'Saved' : 'Save'}
            </Button>
          </div>
          <Markdown>{result.answer}</Markdown>
          <ModelBadge model={result.model} sources={result.sources.length} />
          <Sources sources={result.sources} />

          {/* Follow-up */}
          <div className="mt-5 border-t border-line pt-4">
            {chat.map((m) => (
              <div
                key={m.id}
                className={`mb-3 flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[88%] rounded-2xl px-4 py-2.5 ${
                    m.role === 'user'
                      ? 'rounded-br-md bg-accent text-white'
                      : 'rounded-bl-md bg-bg2 text-fg'
                  }`}
                >
                  {m.role === 'user' ? (
                    <p className="whitespace-pre-wrap text-sm">{m.text}</p>
                  ) : (
                    <Markdown className="text-sm">{m.text}</Markdown>
                  )}
                </div>
                {m.role === 'assistant' && (
                  <ModelBadge model={m.model} sources={countSources(m.sources_json)} />
                )}
              </div>
            ))}
            {followBusy && (
              <div className="mb-3 flex items-center gap-2 text-fg3">
                <Spinner size={15} /> Thinking…
              </div>
            )}
            <ModelPicker
              className="mb-2 flex flex-col gap-2"
              provider={provider}
              mode={mode}
              onProviderChange={setProvider}
              onModeChange={setMode}
            />
            <div className="flex items-end gap-2">
              <textarea
                className="input max-h-28 min-h-[44px] flex-1 resize-none py-2.5"
                placeholder="Ask a follow-up…"
                rows={1}
                value={followInput}
                onChange={(e) => setFollowInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendFollow();
                  }
                }}
              />
              <button
                onClick={sendFollow}
                disabled={followBusy || !followInput.trim()}
                className="btn-accent h-11 w-11 shrink-0 rounded-xl p-0"
                aria-label="Send"
              >
                <Send size={17} />
              </button>
            </div>
          </div>
        </motion.div>
      )}

      {/* Saved searches */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-fg2">Saved searches</h3>
        {savedSearches.length === 0 ? (
          <EmptyState icon={<Search size={26} />} title="No saved searches yet" />
        ) : (
          <div className="flex flex-col gap-2">
            {savedSearches.map((s) => (
              <div key={s.id} className="card group flex items-center gap-3 p-3.5">
                <button onClick={() => openSaved(s)} className="min-w-0 flex-1 text-left">
                  <p className="truncate font-semibold text-fg">{s.title || s.query}</p>
                  <p className="truncate text-xs text-fg3">{s.mode} · {s.model}</p>
                </button>
                <button
                  onClick={() => del.mutate(s.id)}
                  className="rounded-lg p-2 text-fg4 opacity-0 transition hover:bg-red-500/15 hover:text-red-400 group-hover:opacity-100"
                  aria-label="Delete"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
