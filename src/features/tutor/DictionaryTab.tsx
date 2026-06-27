import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { BookA, Bookmark, Search, Trash2, Volume2 } from 'lucide-react';
import { Button, EmptyState } from '@/components/ui/primitives';
import { toast } from '@/components/ui/toast';
import { apiErrorMessage } from '@/lib/api/client';
import {
  DefineResult,
  define,
  deleteSavedWord,
  fetchSavedWords,
  saveWord,
} from '@/lib/api/tutor';

export function DictionaryTab() {
  const qc = useQueryClient();
  const [word, setWord] = useState('');
  const [result, setResult] = useState<DefineResult | null>(null);
  const [loading, setLoading] = useState(false);
  const topRef = useRef<HTMLDivElement>(null);

  const { data: saved = [] } = useQuery({
    queryKey: ['saved-words'],
    queryFn: fetchSavedWords,
  });

  const save = useMutation({
    mutationFn: saveWord,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['saved-words'] });
      toast.success('Word saved');
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Could not save')),
  });

  const remove = useMutation({
    mutationFn: deleteSavedWord,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['saved-words'] }),
  });

  async function run() {
    if (!word.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      setResult(await define(word.trim()));
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Lookup failed'));
    } finally {
      setLoading(false);
    }
  }

  function openSaved(w: (typeof saved)[number]) {
    setWord(w.word);
    let parsed: DefineResult | null = null;
    try {
      const obj = JSON.parse(w.response_json || '{}');
      if (obj && obj.definition) parsed = obj as DefineResult;
    } catch {
      /* fall back to row columns */
    }
    setResult(
      parsed ?? {
        word: w.word,
        pronunciation: w.pronunciation || '',
        partOfSpeech: w.part_of_speech || '',
        definition: w.definition || '',
        examples: [],
        usageGuide: '',
        model: '',
      },
    );
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function speak(w: string) {
    try {
      const u = new SpeechSynthesisUtterance(w);
      speechSynthesis.speak(u);
    } catch {
      /* not supported */
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-5 sm:px-6">
      <div ref={topRef} className="-mt-2 scroll-mt-4" />
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-fg4" />
          <input
            className="input pl-11"
            placeholder="Look up a word…"
            value={word}
            onChange={(e) => setWord(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && run()}
          />
        </div>
        <Button onClick={run} loading={loading} disabled={!word.trim()} className="px-5">
          Define
        </Button>
      </div>

      {result && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="card p-5"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-2xl font-extrabold text-fg">{result.word}</h2>
              <div className="mt-1 flex items-center gap-2 text-sm text-fg3">
                {result.pronunciation && <span>{result.pronunciation}</span>}
                {result.partOfSpeech && (
                  <span className="rounded-full bg-bg3 px-2 py-0.5 text-xs font-semibold italic">
                    {result.partOfSpeech}
                  </span>
                )}
                <button onClick={() => speak(result.word)} className="text-fg3 hover:text-fg">
                  <Volume2 size={16} />
                </button>
              </div>
            </div>
            <Button
              variant="ghost"
              onClick={() => save.mutate(result)}
              loading={save.isPending}
              className="px-3 py-2 text-sm"
            >
              <Bookmark size={15} /> Save
            </Button>
          </div>

          <p className="mt-4 text-fg">{result.definition}</p>

          {result.usageGuide && (
            <div className="mt-4 rounded-xl bg-bg2 p-4 text-sm text-fg2">
              <span className="mb-1 block font-semibold text-fg">When to use</span>
              {result.usageGuide}
            </div>
          )}

          {result.examples.length > 0 && (
            <div className="mt-4">
              <span className="mb-1 block text-sm font-semibold text-fg2">Examples</span>
              <ul className="list-disc space-y-1 pl-5 text-fg2">
                {result.examples.map((ex, i) => (
                  <li key={i}>{ex}</li>
                ))}
              </ul>
            </div>
          )}
        </motion.div>
      )}

      <div>
        <h3 className="mb-3 text-sm font-semibold text-fg2">Saved words</h3>
        {saved.length === 0 ? (
          <EmptyState icon={<BookA size={26} />} title="No saved words yet" />
        ) : (
          <div className="flex flex-col gap-2">
            {saved.map((w) => (
              <div key={w.id} className="card flex items-center gap-3 p-3.5 transition hover:border-line2">
                <button onClick={() => openSaved(w)} className="min-w-0 flex-1 text-left">
                  <p className="font-semibold text-fg">
                    {w.word}{' '}
                    {w.part_of_speech && (
                      <span className="text-xs font-normal italic text-fg4">
                        {w.part_of_speech}
                      </span>
                    )}
                  </p>
                  <p className="truncate text-sm text-fg3">{w.definition}</p>
                </button>
                <button
                  onClick={() => remove.mutate(w.id)}
                  className="shrink-0 rounded-lg p-2 text-fg4 transition hover:bg-red-500/15 hover:text-red-400"
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
