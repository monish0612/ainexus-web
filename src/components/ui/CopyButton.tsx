import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

export function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          // navigator.clipboard only exists in a secure context (HTTPS). Over
          // plain HTTP it's undefined, so fall back to the legacy execCommand.
          if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
          } else {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
          }
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
