import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Bookmark,
  ExternalLink,
  Globe,
  History,
  ScanSearch,
  Search,
  Send,
  Sparkles,
  Telescope,
  Trash2,
} from 'lucide-react';
import { Button, EmptyState, SkeletonCard } from '@/components/ui/primitives';
import { AiComposer, ComposerImage } from '@/components/ui/AiComposer';
import { AiWait } from '@/components/ui/AiWait';
import { ModelPicker } from '@/components/ui/ModelPicker';
import { ModelBadge } from '@/components/ui/ModelBadge';
import { Markdown } from '@/components/ui/Markdown';
import { toast } from '@/components/ui/toast';
import { standard, usePrefersReducedMotion } from '@/lib/motion';
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
            className="flex items-center gap-2 text-sm text-accent-text hover:underline"
          >
            <ExternalLink size={13} className="shrink-0" />
            <span className="truncate">{s.title || s.url}</span>
          </a>
        ))}
      </div>
    </div>
  );
}

/** Intent copy. The Android box cross-fades this line; so does this one. */
const INTENT: Record<string, { icon: typeof Globe; label: string; hint: string }> = {
  vision: { icon: ScanSearch, label: 'Analyse image', hint: 'Vision + web grounding' },
  lite: { icon: Globe, label: 'Search the web', hint: 'Fast, grounded answer' },
  deep: { icon: Telescope, label: 'Deep research', hint: 'Slower, reads more sources' },
  thinking: { icon: Sparkles, label: 'Extended thinking', hint: 'Reasons before answering' },
};

/**
 * The identity row above the field: a breathing orb plus an intent line that
 * cross-fades whenever the picked mode (or an attached image) changes what
 * pressing Search is actually going to do.
 */
function IntentHeader({ intent }: { intent: keyof typeof INTENT }) {
  const reduced = usePrefersReducedMotion();
  const meta = INTENT[intent] ?? INTENT.lite;
  const Icon = meta.icon;
  return (
    <div className="flex items-center gap-3 px-1">
      <motion.span
        aria-hidden
        className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gemini text-white"
        animate={reduced ? undefined : { scale: [1, 1.05, 1] }}
        transition={reduced ? undefined : { duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
      >
        <Sparkles size={18} />
      </motion.span>
      <div className="min-w-0">
        <p className="text-sm font-extrabold tracking-tight text-fg">InsightAI</p>
        <div className="relative h-[18px] overflow-hidden">
          <AnimatePresence mode="wait" initial={false}>
            <motion.p
              key={intent}
              className="flex min-w-0 items-center gap-1.5 text-xs text-fg3"
              initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
              animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, y: -8 }}
              transition={{ duration: 0.18, ease: standard.enter.ease }}
            >
              <Icon size={12} className="shrink-0" />
              {/* The row is clipped to one line, so the hint needs an ellipsis
                  of its own — at 360 it otherwise ends mid-word. */}
              <span className="truncate">
                {meta.label} · {meta.hint}
              </span>
            </motion.p>
          </AnimatePresence>
        </div>
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
  const [image, setImage] = useState<
    (ComposerImage & { base64: string; mediaType: string }) | null
  >(null);
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
  // The follow-up composer owns its OWN provider/mode. It used to share the
  // main composer's state, and because the follow-up picker is two-state
  // (lite/deep — Thinking stays out of follow-ups by decision), its coercion
  // effect fired the moment an answer rendered and silently dragged the MAIN
  // composer from Thinking down to Deep. The next search then ran Deep without
  // the user touching anything. Separate state, one source of truth each.
  const followProviderDefault = useSettingsStore((s) => s.defaultFollowUpProvider);
  const [followProvider, setFollowProvider] = useState<Provider>(followProviderDefault);
  const [followMode, setFollowMode] = useState<SearchMode>('lite');
  const fileRef = useRef<HTMLInputElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const savedRef = useRef<HTMLDivElement>(null);

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
      let preview = '';
      try {
        preview = URL.createObjectURL(file);
      } catch {
        /* no object-URL support — the chip just shows its meta line */
      }
      setImage({
        ...p,
        preview,
        sizeKb: file.size ? file.size / 1024 : undefined,
      });
      // Pixel dimensions are decoration for the chip's meta line, so they are
      // resolved after the fact and never gate the attach.
      if (preview) {
        const probe = new Image();
        probe.onload = () =>
          setImage((cur) =>
            cur && cur.preview === preview
              ? { ...cur, width: probe.naturalWidth, height: probe.naturalHeight }
              : cur,
          );
        probe.src = preview;
      }
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
      const res = await searchFollowUp({
        query: activeQuery,
        question: q,
        history,
        mode: followMode,
        provider: followProvider,
      });
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

  const intent = image ? 'vision' : mode;
  const waitVariant = image ? 'vision' : mode === 'lite' ? 'research' : 'think';

  return (
    // Desktop gets a real layout instead of one small card marooned in the
    // middle of an empty page: a wide answer column with the saved-search rail
    // alongside it. Below `xl` the rail falls back under the column.
    <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6">
      <div ref={topRef} className="-mt-2 scroll-mt-4" />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start xl:gap-8">
        {/* Before the first answer the column is mostly empty, so the composer
            takes the optical centre instead of clinging to the top of a tall
            blank page. Once there is a result the column fills top-down. */}
        <div
          className={`flex min-w-0 flex-col gap-5 ${
            !result && !loading ? 'xl:min-h-[68vh] xl:justify-center' : ''
          }`}
        >
          {/* ── Main composer ────────────────────────────────────────────
              This renders BEFORE the follow-up composer, and it has to stay
              that way: InsightAITab.test.tsx picks the follow-up controls
              with a "last matching element" helper. Both composers also
              carry a `data-testid` so new tests can target one explicitly
              instead of relying on document order. */}
          <div className="relative">
            {/* Ambient wash so the composer sits on something instead of
                floating in dead space. Decorative, never interactive. */}
            {/* Only bleeds past the column from `sm` up: at 360 the page
                gutter is 16px, so a -24px inset would push the scroll width
                past the viewport. */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-0 -top-10 bottom-6 -z-10 rounded-[40px]
                bg-[radial-gradient(60%_80%_at_50%_0%,rgba(13,89,242,0.14),transparent_70%)]
                sm:-inset-x-6"
            />
            <AiComposer
              testId="insight-composer"
              value={query}
              onValueChange={setQuery}
              onSubmit={run}
              placeholder="Ask anything — get a researched answer with sources…"
              submitLabel="Search"
              submitIcon={<Search size={18} />}
              submitVariant="pill"
              mode={mode}
              busy={loading}
              maxHeight={220}
              canSubmit={!!query.trim() || !!image}
              header={<IntentHeader intent={intent} />}
              onAttach={() => fileRef.current?.click()}
              onPasteText={(text) => setQuery((q) => (q ? `${q} ${text}` : text))}
              image={image}
              onRemoveImage={() => setImage(null)}
              toolbarEnd={
                savedSearches.length > 0 ? (
                  <button
                    type="button"
                    onClick={() =>
                      savedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                    }
                    aria-label={`Jump to saved searches, ${savedSearches.length} saved`}
                    title={`${savedSearches.length} saved searches`}
                    className="tap inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full px-3
                      text-fg3 hover:bg-bg3 hover:text-fg focus-visible:outline-none
                      focus-visible:ring-2 focus-visible:ring-accent/40"
                  >
                    <History size={17} />
                    <span className="grid min-w-[18px] place-items-center rounded-full bg-bg4 px-1.5 py-0.5 text-[11px] font-semibold text-fg2">
                      {savedSearches.length}
                    </span>
                  </button>
                ) : null
              }
              controls={
                <ModelPicker
                  density="chips"
                  provider={provider}
                  mode={mode}
                  onProviderChange={setProvider}
                  onModeChange={setMode}
                  modes={['lite', 'deep', 'thinking']}
                />
              }
            />
          </div>
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

          {/* ── Waiting ──────────────────────────────────────────────────── */}
          {loading && (
            <div className="card flex flex-col gap-4 p-5">
              <p className="truncate text-sm text-fg2">
                <span className="font-semibold text-fg">{INTENT[intent]?.label}</span>
                {activeQuery && <span className="text-fg3"> · “{activeQuery}”</span>}
              </p>
              <AiWait
                variant={waitVariant}
                mode={mode}
                active
                src={image?.preview}
                alt=""
              />
              {/* The answer card is about to land here, so the placeholder is
                  shaped like the answer card — not like a spinner. */}
              <div className="flex flex-col gap-2">
                <SkeletonCard shape="stat" />
                <SkeletonCard shape="stat" />
              </div>
            </div>
          )}

          {result && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="card p-5"
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-sm font-semibold text-accent-text">
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
                  <div className="mb-3 max-w-[88%] rounded-2xl rounded-bl-md bg-bg2 px-4 py-3">
                    <AiWait
                      variant={followMode === 'lite' ? 'research' : 'think'}
                      mode={followMode}
                      active
                      className="w-full"
                    />
                  </div>
                )}
                <AiComposer
                  testId="insight-followup-composer"
                  value={followInput}
                  onValueChange={setFollowInput}
                  onSubmit={sendFollow}
                  placeholder="Ask a follow-up…"
                  submitLabel="Send"
                  submitIcon={<Send size={17} />}
                  mode={followMode}
                  busy={followBusy}
                  maxHeight={132}
                  hideHint
                  onPasteText={(text) => setFollowInput((q) => (q ? `${q} ${text}` : text))}
                  controls={
                    <ModelPicker
                      density="chips"
                      provider={followProvider}
                      mode={followMode}
                      onProviderChange={setFollowProvider}
                      onModeChange={setFollowMode}
                    />
                  }
                />
              </div>
            </motion.div>
          )}
        </div>

        {/* Saved searches. A rail on wide screens — it is what fills the dead
            space the composer used to float in — and a section underneath
            everywhere else. */}
        <aside ref={savedRef} className="min-w-0 scroll-mt-4 xl:sticky xl:top-5">
          <h3 className="mb-3 text-sm font-semibold text-fg2">Saved searches</h3>
          {savedSearches.length === 0 ? (
            <div className="card">
              <EmptyState icon={<Search size={26} />} title="No saved searches yet" />
            </div>
          ) : (
            <div className="flex max-h-[70vh] flex-col gap-2 overflow-y-auto pr-0.5">
              {savedSearches.map((s) => (
                <div key={s.id} className="card group flex items-center gap-3 p-3.5">
                  <button
                    onClick={() => openSaved(s)}
                    className="flex min-h-[44px] min-w-0 flex-1 flex-col justify-center text-left"
                  >
                    <p className="truncate font-semibold text-fg">{s.title || s.query}</p>
                    <p className="truncate text-xs text-fg3">{s.mode} · {s.model}</p>
                  </button>
                  <button
                    onClick={() => del.mutate(s.id)}
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-fg4 opacity-0 transition hover:bg-red-500/15 hover:text-red-400 group-hover:opacity-100"
                    aria-label="Delete"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
