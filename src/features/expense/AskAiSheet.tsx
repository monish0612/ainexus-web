import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Sparkles, TrendingUp, Wallet, Wand2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { AiComposer } from '@/components/ui/AiComposer';
import { AiWait } from '@/components/ui/AiWait';
import { Markdown } from '@/components/ui/Markdown';
import { EmptyState, SkeletonCard } from '@/components/ui/primitives';
import { toast } from '@/components/ui/toast';
import { spring, standard, usePrefersReducedMotion } from '@/lib/motion';
import { formatCurrency, formatDateLabel } from '@/lib/format';
import { EXPENSE_AI_CATEGORIES, categoryColor, categoryIcon } from '@/lib/constants';
import { ExpenseQuerySpec, askAiLiteModel, expenseAiQuery } from '@/lib/api/expenseAi';
import { useExpenses, useSalaryHistory } from './hooks';
import { bucketsFor, keywordFallbackSpec, runExpenseQuerySpec, sumOf } from './askAi';

/** Same rail the Android sheet offers, same order. */
const SUGGESTIONS = [
  "Today's expenses",
  'Highest expense',
  'Visualize last month',
  'Anything related to my car',
  'My salary this month',
  'Did I get a hike?',
  'Spending by category',
  'Last trip cost',
];

interface Props {
  open: boolean;
  onClose: () => void;
}

interface Answer {
  spec: ExpenseQuerySpec;
  question: string;
  /** True when the AI was unreachable and we fell back to a keyword search. */
  fallback: boolean;
}

function SuggestionRail({
  onPick,
  disabled,
}: {
  onPick: (q: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="flex items-center gap-1.5 px-1 text-[10.5px] font-bold uppercase tracking-[0.1em] text-fg3">
        <Wand2 size={13} /> Try asking
      </p>
      {/* Single scrolling rail with fade edges — a wall of chips is not a menu. */}
      <div
        className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
        style={{
          maskImage:
            'linear-gradient(to right, transparent, #000 12px, #000 calc(100% - 12px), transparent)',
        }}
      >
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            disabled={disabled}
            onClick={() => onPick(s)}
            className="tap min-h-[44px] shrink-0 whitespace-nowrap rounded-full border border-line bg-bg2
              px-4 text-xs font-semibold text-fg2 transition-colors duration-150
              hover:border-accent-text/50 hover:text-fg focus-visible:outline-none
              focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-40"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function BucketBars({ buckets }: { buckets: { label: string; value: number }[] }) {
  const reduced = usePrefersReducedMotion();
  const max = Math.max(...buckets.map((b) => b.value), 1);
  return (
    <div className="flex flex-col gap-2">
      {buckets.slice(0, 12).map((b, i) => (
        <div key={b.label} className="flex items-center gap-3">
          <span className="w-20 shrink-0 truncate text-xs text-fg3">{b.label}</span>
          <span className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-bg3">
            <motion.span
              className="block h-full w-full origin-left rounded-full"
              style={{ backgroundColor: categoryColor(b.label) }}
              initial={{ scaleX: 0 }}
              animate={{ scaleX: b.value / max }}
              transition={reduced ? standard.enter : { ...spring.slow, delay: i * 0.03 }}
            />
          </span>
          <span className="w-20 shrink-0 text-right text-xs font-semibold tabular-nums text-fg2">
            {formatCurrency(b.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

function SalaryPanel({ answer }: { answer: string }) {
  const { data: salary = [] } = useSalaryHistory();
  const recent = useMemo(
    () => [...salary].sort((a, b) => (b.month || '').localeCompare(a.month || '')).slice(0, 6),
    [salary],
  );
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-line bg-bg2 p-4">
      <p className="flex items-center gap-2 text-sm font-bold text-fg">
        <Wallet size={16} className="text-lite" /> Income
      </p>
      {answer && <Markdown className="text-sm">{answer}</Markdown>}
      {/* The numbers come from the user's own salary history, never from the
          model — same rule the Android salary screen enforces. */}
      {recent.length === 0 ? (
        <p className="text-sm text-fg3">No income recorded yet.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {recent.map((s) => (
            <div key={s.id} className="flex items-center justify-between text-sm">
              <span className="text-fg3">{s.month}</span>
              <span className="font-semibold tabular-nums text-fg">{formatCurrency(s.amount)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function AskAiSheet({ open, onClose }: Props) {
  const { data: expenses = [] } = useExpenses();
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<Answer | null>(null);

  async function submit(preset?: string) {
    const q = (preset ?? question).trim();
    if (!q || busy) return;

    // Easter-egg guard, mirrored from Android: "nuke" is intercepted BEFORE
    // the AI round-trip so it never leaves the device as a search query. The
    // web has no expense-nuke service, so there is nothing to trigger here —
    // and this branch exists precisely so nothing ever is.
    if (q.toLowerCase() === 'nuke') {
      setQuestion('');
      toast.info('That one only works in the app.');
      return;
    }

    if (preset) setQuestion(preset);
    setBusy(true);
    setAnswer(null);
    try {
      const spec = await expenseAiQuery(q, {
        categories: [...EXPENSE_AI_CATEGORIES],
        liteModel: askAiLiteModel(),
      });
      // A null spec is not an error: fall back to a keyword search so results
      // still show, exactly like the sheet on the phone.
      setAnswer({
        spec: spec ?? keywordFallbackSpec(q),
        question: q,
        fallback: spec == null,
      });
    } finally {
      setBusy(false);
    }
  }

  // The spec is the answer; the rows are derived from it. Keeping them derived
  // (rather than snapshotted at submit time) means the result is right even if
  // the expense list was still loading when the question was asked, and it
  // re-runs if a row is edited while the sheet is open.
  const rows = useMemo(
    () => (answer ? runExpenseQuerySpec(expenses, answer.spec) : []),
    [answer, expenses],
  );
  const buckets = useMemo(
    () => (answer ? bucketsFor(rows, answer.spec.chart) : []),
    [answer, rows],
  );
  const total = sumOf(rows);

  return (
    <Modal
      open={open}
      onClose={onClose}
      variant="sheet"
      maxWidth="max-w-2xl"
      title={
        <span className="flex items-center gap-3">
          <span
            aria-hidden
            className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gemini text-white"
          >
            <Sparkles size={18} />
          </span>
          <span className="flex flex-col">
            <span className="text-base font-extrabold tracking-tight text-fg">Ask AI</span>
            <span className="text-xs font-medium text-fg3">
              Search your expenses in plain English
            </span>
          </span>
        </span>
      }
    >
      <div className="flex flex-col gap-4 p-5">
        <AiComposer
          testId="expense-ask-ai-composer"
          value={question}
          onValueChange={setQuestion}
          onSubmit={() => submit()}
          placeholder="how much did I spend on food today?"
          submitLabel="Ask"
          submitIcon={<Sparkles size={18} />}
          submitVariant="pill"
          mode="lite"
          busy={busy}
          maxHeight={120}
          onPasteText={(text) => setQuestion((q) => (q ? `${q} ${text}` : text))}
        />

        {/* The rail collapses the moment the user starts typing, so the sheet
            stays clean — same behaviour as the Android sheet. */}
        <AnimatePresence initial={false}>
          {!question.trim() && !answer && !busy && (
            <motion.div
              key="rail"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={standard.enter}
              className="overflow-hidden"
            >
              <SuggestionRail onPick={(q) => submit(q)} disabled={busy} />
            </motion.div>
          )}
        </AnimatePresence>

        {busy && (
          <div className="flex flex-col gap-4 rounded-2xl border border-line bg-bg2 p-4">
            <AiWait variant="research" mode="lite" active />
            <div className="flex flex-col gap-2">
              <SkeletonCard shape="row" />
              <SkeletonCard shape="row" />
              <SkeletonCard shape="row" />
            </div>
          </div>
        )}

        {answer && !busy && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={standard.enter}
            className="flex flex-col gap-4"
          >
            {answer.spec.isSalaryTopic ? (
              <SalaryPanel answer={answer.spec.answer} />
            ) : (
              <>
                {answer.spec.answer && (
                  <div className="rounded-2xl border border-line bg-bg2 p-4">
                    <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-accent-text">
                      <Sparkles size={13} /> {answer.fallback ? 'Keyword search' : 'Insight'}
                    </p>
                    <Markdown className="text-sm">{answer.spec.answer}</Markdown>
                  </div>
                )}

                <div className="flex items-baseline justify-between gap-3 px-1">
                  <p className="truncate text-sm font-bold text-fg">{answer.spec.title}</p>
                  <p className="shrink-0 text-sm text-fg3">
                    <span className="font-semibold tabular-nums text-fg">
                      {formatCurrency(total)}
                    </span>{' '}
                    · {rows.length} {rows.length === 1 ? 'entry' : 'entries'}
                  </p>
                </div>

                {buckets.length > 0 && (
                  <div className="rounded-2xl border border-line bg-bg2 p-4">
                    <p className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-fg3">
                      <TrendingUp size={13} /> Breakdown
                    </p>
                    <BucketBars buckets={buckets} />
                  </div>
                )}

                {rows.length === 0 ? (
                  <EmptyState
                    icon={<Wallet size={26} />}
                    title="Nothing matched"
                    hint="Try a different wording, or a wider time range."
                  />
                ) : (
                  <div className="flex flex-col gap-2">
                    {rows.slice(0, 60).map((e) => (
                      <div key={e.id} className="flex items-center gap-3 rounded-2xl border border-line bg-bg2 p-3">
                        <span
                          aria-hidden
                          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-lg"
                          style={{ background: `${categoryColor(e.category)}22` }}
                        >
                          {categoryIcon(e.category)}
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate font-semibold text-fg">{e.description}</span>
                          <span className="truncate text-xs text-fg3">
                            {e.category} · {formatDateLabel(e.date)}
                          </span>
                        </span>
                        <span className="shrink-0 font-bold tabular-nums text-fg">
                          {formatCurrency(e.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </motion.div>
        )}
      </div>
    </Modal>
  );
}

export default AskAiSheet;
