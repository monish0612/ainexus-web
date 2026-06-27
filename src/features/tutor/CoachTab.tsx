import { useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCheck, GraduationCap } from 'lucide-react';
import { Button } from '@/components/ui/primitives';
import { CopyButton } from '@/components/ui/CopyButton';
import { Markdown } from '@/components/ui/Markdown';
import { toast } from '@/components/ui/toast';
import { apiErrorMessage } from '@/lib/api/client';
import { CoachResult, correct } from '@/lib/api/tutor';

export function CoachTab() {
  const [text, setText] = useState('');
  const [result, setResult] = useState<CoachResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function run() {
    if (!text.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      setResult(await correct(text.trim()));
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Coach failed'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-5 sm:px-6">
      <textarea
        className="input min-h-[120px] resize-y"
        placeholder="Write a sentence and let the coach polish it…"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <Button onClick={run} loading={loading} disabled={!text.trim()}>
        <GraduationCap size={18} /> Correct & improve
      </Button>

      {result && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col gap-4"
        >
          <div className="card p-5">
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-sm font-semibold text-emerald-400">
                <CheckCheck size={16} /> Corrected
              </span>
              <CopyButton text={result.correctedText} />
            </div>
            <p className="whitespace-pre-wrap text-lg font-medium text-fg">
              {result.correctedText}
            </p>
          </div>

          {result.explanation && (
            <div className="card p-5">
              <span className="mb-2 block text-sm font-semibold text-fg2">Why</span>
              <Markdown>{result.explanation}</Markdown>
            </div>
          )}

          {result.variations.length > 0 && (
            <div className="flex flex-col gap-3">
              <span className="text-sm font-semibold text-fg2">Tone variations</span>
              {result.variations.map((v, i) => (
                <div key={i} className="card p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="rounded-full bg-bg3 px-2.5 py-0.5 text-xs font-semibold text-fg2">
                      {v.label}
                    </span>
                    <CopyButton text={v.text} />
                  </div>
                  <p className="whitespace-pre-wrap text-fg">{v.text}</p>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}
