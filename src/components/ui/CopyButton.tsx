import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

export function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard blocked */
        }
      }}
      className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-bg2 px-2.5 py-1.5 text-xs font-semibold text-fg2 transition hover:bg-bg3 hover:text-fg"
    >
      {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
      {label ?? (copied ? 'Copied' : 'Copy')}
    </button>
  );
}
