import { useState } from 'react';
import { motion } from 'framer-motion';
import { Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/primitives';
import { CopyButton } from '@/components/ui/CopyButton';
import { Markdown } from '@/components/ui/Markdown';
import { toast } from '@/components/ui/toast';
import { apiErrorMessage } from '@/lib/api/client';
import { REPHRASE_PLATFORMS } from '@/lib/constants';
import { rephrase } from '@/lib/api/tutor';

export function RephraseTab() {
  const [text, setText] = useState('');
  const [platform, setPlatform] = useState('casual');
  const [intent, setIntent] = useState('');
  const [output, setOutput] = useState('');
  const [loading, setLoading] = useState(false);

  async function run() {
    if (!text.trim()) return;
    setLoading(true);
    setOutput('');
    try {
      const res = await rephrase(text.trim(), platform, platform === 'own' ? intent : undefined);
      setOutput(res.rephrasedText);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Rephrase failed'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-5 sm:px-6">
      <textarea
        className="input min-h-[120px] resize-y"
        placeholder="Paste the text you want to rewrite…"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg3">Style</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {REPHRASE_PLATFORMS.map((p) => {
            const active = p.id === platform;
            return (
              <button
                key={p.id}
                onClick={() => setPlatform(p.id)}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                  active
                    ? 'border-accent bg-accent/15 text-fg'
                    : 'border-line bg-bg2 text-fg2 hover:bg-bg3'
                }`}
              >
                <span className="text-base">{p.icon}</span>
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{p.label}</span>
                  <span className="block truncate text-[11px] text-fg4">{p.desc}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {platform === 'own' && (
        <input
          className="input"
          placeholder="Describe the tone / instruction (e.g. ‘make it formal & concise’)"
          value={intent}
          onChange={(e) => setIntent(e.target.value)}
        />
      )}

      <Button onClick={run} loading={loading} disabled={!text.trim()}>
        <Wand2 size={18} /> Rephrase
      </Button>

      {output && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="card p-5"
        >
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-semibold text-fg2">Result</span>
            <CopyButton text={output} />
          </div>
          <Markdown>{output}</Markdown>
        </motion.div>
      )}
    </div>
  );
}
