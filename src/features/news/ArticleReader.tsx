import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Bookmark,
  BookmarkCheck,
  CheckCircle2,
  Circle,
  ExternalLink,
  Send,
  Share2,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Markdown } from '@/components/ui/Markdown';
import { Lightbox } from '@/components/ui/Lightbox';
import { AiComposer } from '@/components/ui/AiComposer';
import { AiWait } from '@/components/ui/AiWait';
import { ModelPicker } from '@/components/ui/ModelPicker';
import { ModelBadge } from '@/components/ui/ModelBadge';
import { toast } from '@/components/ui/toast';
import { useSettingsStore, Provider } from '@/store/settingsStore';
import { ModelMode } from '@/lib/modelHints';
import { apiErrorMessage } from '@/lib/api/client';
import { relativeTime } from '@/lib/format';
import { NEWS_CAT_COLOR } from '@/lib/constants';
import {
  Article,
  ChatMessage,
  articleFollowUp,
  clearArticleChats,
  fetchArticleChats,
  saveArticleChat,
  summarizeArticle,
} from '@/lib/api/news';
import { uuid } from '@/lib/format';
import { persist } from '@/lib/api/persistQueue';
import { useMarkRead, useToggleSave } from './hooks';
import { formatArticleShareText, presentShare, ShareTurn } from '@/lib/shareText';

interface Props {
  article: Article | null;
  onClose: () => void;
}

function countSources(sourcesJson?: string): number {
  if (!sourcesJson) return 0;
  try {
    const parsed = JSON.parse(sourcesJson);
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

export function ArticleReader({ article, onClose }: Props) {
  const open = !!article;
  return (
    <Modal open={open} onClose={onClose} variant="sheet" maxWidth="max-w-3xl">
      {article && <ReaderBody key={article.id} article={article} onClose={onClose} />}
    </Modal>
  );
}

function ReaderBody({ article, onClose }: { article: Article; onClose: () => void }) {
  const toggleSave = useToggleSave();
  const markRead = useMarkRead();
  const [showSummary, setShowSummary] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const [heroZoom, setHeroZoom] = useState(false);
  // Read state is driven by an explicit "Mark read" action (like the Android
  // app) — NOT by simply opening the article. Saving never marks it read.
  const [read, setRead] = useState(article.isRead);
  const [shareMessages, setShareMessages] = useState<ShareTurn[]>([]);

  function onMarkRead() {
    if (read) return; // already read → the "Done" pill is a no-op, as on Android
    setRead(true);
    markRead.mutate(article.id);
    // Briefly show the "Done" state, then close — mirrors the app's flow so the
    // (now-read) article drops out of the For You list behind the sheet.
    setTimeout(onClose, 300);
  }

  async function onSummarize() {
    if (summary) {
      setShowSummary((s) => !s);
      return;
    }
    setSummarizing(true);
    try {
      const result = await summarizeArticle(article);
      setSummary(result);
      setShowSummary(true);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not summarize'));
    } finally {
      setSummarizing(false);
    }
  }

  const catColor = NEWS_CAT_COLOR[article.category] ?? '#38BDF8';
  const body = showSummary && summary ? summary : article.summaryMarkdown;

  return (
    <div>
      {/* Hero */}
      {article.imageUrl && (
        <button
          type="button"
          onClick={() => setHeroZoom(true)}
          className="group relative block h-44 w-full cursor-zoom-in overflow-hidden sm:h-60"
          aria-label="Zoom image"
        >
          <img
            src={article.imageUrl}
            alt=""
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
            onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-bg1 via-bg1/20 to-transparent" />
        </button>
      )}
      <Lightbox
        src={heroZoom ? article.imageUrl : null}
        onClose={() => setHeroZoom(false)}
      />

      <div className="mx-auto max-w-2xl px-5 py-6 sm:px-6">
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
            <span
              className="rounded-full px-2.5 py-1 font-semibold"
              style={{ background: `${catColor}22`, color: catColor }}
            >
              {article.category}
            </span>
            <span className="text-fg3">{article.source}</span>
            {article.readTime && <span className="text-fg4">· {article.readTime}</span>}
            <span className="text-fg4">· {relativeTime(article.publishedAt || article.date)}</span>
          </div>

          <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-fg sm:text-3xl">
            {article.title}
          </h1>

          {/* Action bar */}
          <div className="sticky top-0 z-10 -mx-5 mt-4 flex flex-wrap items-center gap-2 border-y border-line bg-[var(--header-bg)]/90 px-5 py-2.5 backdrop-blur sm:-mx-6 sm:px-6">
            <button
              onClick={() => toggleSave.mutate(article.id)}
              className={`pill border ${
                article.isSaved
                  ? 'border-accent bg-accent/15 text-accent'
                  : 'border-line bg-bg2 text-fg2'
              }`}
            >
              {article.isSaved ? <BookmarkCheck size={15} /> : <Bookmark size={15} />}
              <span className="hidden sm:inline">{article.isSaved ? 'Saved' : 'Save'}</span>
            </button>

            <button
              onClick={onSummarize}
              disabled={summarizing}
              className={`pill border ${
                showSummary
                  ? 'border-accent-2 bg-accent-2/15 text-accent-2'
                  : 'border-line bg-bg2 text-fg2'
              }`}
            >
              <Sparkles size={15} className={summarizing ? 'animate-pulse' : undefined} />
              <span>
                {summarizing
                  ? 'Summarizing…'
                  : showSummary
                    ? 'Full article'
                    : 'AI Summary'}
              </span>
            </button>

            <button
              onClick={() => {
                const text = formatArticleShareText({
                  title: article.title,
                  source: article.source,
                  date: article.publishedAt || article.date || undefined,
                  url: article.originalUrl,
                  snapshot: article.excerpt,
                  messages: shareMessages,
                });
                void presentShare(text, article.title).then((kind) => {
                  if (kind === 'copied') toast.info('Copied share text');
                  if (kind === 'failed') toast.error('Could not share');
                });
              }}
              className="pill border border-line bg-bg2 text-fg2"
              aria-label="Share article"
            >
              <Share2 size={15} />
              <span className="hidden sm:inline">Share</span>
            </button>

            {article.originalUrl && (
              <a
                href={article.originalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="pill border border-line bg-bg2 text-fg2"
              >
                <ExternalLink size={15} />
                <span className="hidden sm:inline">Source</span>
              </a>
            )}

            <button
              onClick={onMarkRead}
              className={`pill border ${
                read
                  ? 'border-emerald-500 bg-emerald-500/15 text-emerald-400'
                  : 'border-line bg-bg2 text-fg2'
              }`}
            >
              {read ? <CheckCircle2 size={15} /> : <Circle size={15} />}
              <span className="hidden sm:inline">{read ? 'Done' : 'Mark read'}</span>
            </button>
          </div>

          {/* Body. While the summary is being written the wait lives HERE,
              where the text is going to appear — not as a glyph in the pill. */}
          {summarizing && (
            <div className="mt-5 rounded-2xl border border-line bg-bg2 p-4">
              <AiWait variant="think" mode="lite" active status="Reading the article" />
            </div>
          )}
          <AnimatePresence mode="wait">
            <motion.div
              key={showSummary ? 'summary' : 'full'}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-5"
            >
              {showSummary && summary && (
                <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-accent-2/15 px-3 py-1 text-xs font-semibold text-accent-2">
                  <Sparkles size={12} /> AI Summary
                </div>
              )}
              <Markdown>{body || article.excerpt || ''}</Markdown>
            </motion.div>
          </AnimatePresence>

          {/* Follow-up chat */}
          <FollowUpChat article={article} onMessages={setShareMessages} />
      </div>
    </div>
  );
}

function FollowUpChat({
  article,
  onMessages,
}: {
  article: Article;
  onMessages: (messages: ShareTurn[]) => void;
}) {
  const { data: serverMsgs } = useQuery({
    queryKey: ['article-chats', article.id],
    queryFn: () => fetchArticleChats(article.id),
  });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const defaultProvider = useSettingsStore((s) => s.defaultFollowUpProvider);
  const [provider, setProvider] = useState<Provider>(defaultProvider);
  const [mode, setMode] = useState<ModelMode>('lite');
  const bottomRef = useRef<HTMLDivElement>(null);
  // Only auto-scroll to the latest message once the user actually starts a
  // follow-up. Without this, opening an article (especially one with saved
  // chats) would scroll the whole sheet to the bottom on load.
  const interacted = useRef(false);

  useEffect(() => {
    if (serverMsgs) setMessages(serverMsgs);
  }, [serverMsgs]);

  useEffect(() => {
    onMessages(messages.map((m) => ({ role: m.role, text: m.text })));
  }, [messages, onMessages]);

  useEffect(() => {
    if (!interacted.current) return;
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, busy]);

  async function send() {
    const q = input.trim();
    if (!q || busy) return;
    interacted.current = true;
    setInput('');
    const now = new Date().toISOString();
    const userMsg: ChatMessage = {
      id: uuid(),
      article_id: article.id,
      role: 'user',
      text: q,
      model: '',
      sources_json: '[]',
      created_at: now,
    };
    setMessages((m) => [...m, userMsg]);
    setBusy(true);
    persist('article-chat', () => saveArticleChat({ ...userMsg, articleId: article.id }));

    try {
      const history = messages.map((m) => ({ role: m.role, text: m.text }));
      const res = await articleFollowUp({ article, question: q, history, provider, mode });
      const aiMsg: ChatMessage = {
        id: uuid(),
        article_id: article.id,
        role: 'assistant',
        text: res.answer,
        model: res.model,
        sources_json: JSON.stringify(res.sources ?? []),
        created_at: new Date().toISOString(),
      };
      setMessages((m) => [...m, aiMsg]);
      persist('article-chat', () =>
        saveArticleChat({
          ...aiMsg,
          articleId: article.id,
          sourcesJson: aiMsg.sources_json,
        }),
      );
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Follow-up failed'));
      setMessages((m) => m.filter((x) => x.id !== userMsg.id));
      setInput(q);
    } finally {
      setBusy(false);
    }
  }

  async function clearAll() {
    setMessages([]);
    await clearArticleChats(article.id).catch(() => {});
    toast.info('Conversation cleared');
  }

  return (
    <div className="mt-8 border-t border-line pt-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-bold text-fg">
          <Sparkles size={16} className="text-accent" /> Ask a follow-up
        </h3>
        {messages.length > 0 && (
          <button
            onClick={clearAll}
            className="tap-44 flex items-center gap-1 text-xs text-fg3 hover:text-red-400"
          >
            <Trash2 size={13} /> Clear
          </button>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}
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
        {busy && (
          <div className="flex justify-start">
            <div className="max-w-[88%] rounded-2xl rounded-bl-md bg-bg2 px-4 py-3">
              <AiWait
                variant={mode === 'lite' ? 'research' : 'think'}
                mode={mode}
                active
                className="w-full"
              />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <AiComposer
        testId="article-followup-composer"
        className="mt-3"
        value={input}
        onValueChange={setInput}
        onSubmit={send}
        placeholder="Ask anything about this article…"
        submitLabel="Send"
        submitIcon={<Send size={18} />}
        mode={mode}
        busy={busy}
        onPasteText={(text) => setInput((q) => (q ? `${q} ${text}` : text))}
        controls={
          <ModelPicker
            density="chips"
            provider={provider}
            mode={mode}
            onProviderChange={setProvider}
            onModeChange={setMode}
          />
        }
      />
    </div>
  );
}
