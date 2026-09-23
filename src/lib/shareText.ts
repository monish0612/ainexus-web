/** Same chooser text the phone builds in article_share_text.dart and search_share_text.dart. */

export interface ShareTurn {
  role: string;
  text: string;
  isLoading?: boolean;
  isError?: boolean;
}

export interface ShareQa {
  question: string;
  answer: string;
}

function clean(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Completed user/assistant pairs only. Loading, errors, and unanswered questions drop out. */
export function shareQaFromMessages(messages: ShareTurn[]): ShareQa[] {
  const out: ShareQa[] = [];
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m.isLoading || m.isError) continue;
    if (m.role !== 'user') continue;
    if (i + 1 >= messages.length) break;
    const next = messages[i + 1];
    if (next.role !== 'assistant') continue;
    if (next.isLoading || next.isError) continue;
    const question = clean(m.text);
    const answer = clean(next.text);
    if (!question && !answer) {
      i += 1;
      continue;
    }
    out.push({
      question: question || '(No question text)',
      answer: answer || '(No answer yet)',
    });
    i += 1;
  }
  return out;
}

function appendQa(buf: string[], turns: ShareQa[]) {
  if (!turns.length) return;
  buf.push('────────  Follow-up  ────────', '');
  turns.forEach((turn, i) => {
    const n = turns.length === 1 ? '' : ` ${i + 1}`;
    buf.push(`Question${n}`, turn.question, '', `Answer${n}`, turn.answer);
    if (i < turns.length - 1) buf.push('', '· · ·', '');
  });
  buf.push('');
}

export function formatArticleShareText(input: {
  title: string;
  source?: string;
  date?: string;
  url?: string;
  snapshot?: string;
  messages?: ShareTurn[];
}): string {
  const turns = shareQaFromMessages(input.messages ?? []);
  const buf: string[] = ['Nexus AI · News', ''];
  buf.push(clean(input.title) || 'Untitled article', '');
  const meta = [clean(input.source), clean(input.date)].filter(Boolean);
  if (meta.length) buf.push(meta.join('  ·  '), '');
  const snap = clean(input.snapshot);
  if (snap && snap !== clean(input.title)) buf.push(snap, '');
  const link = (input.url ?? '').trim();
  if (link) buf.push(link, '');
  appendQa(buf, turns);
  buf.push('— Shared from Nexus AI');
  return `${buf.join('\n').replace(/\n+$/, '')}\n`;
}

export function formatSearchShareText(input: {
  query: string;
  kind?: string;
  model?: string;
  response: string;
  messages?: ShareTurn[];
}): string {
  const turns = shareQaFromMessages(input.messages ?? []);
  const kind = clean(input.kind) || 'Search';
  const buf: string[] = [`Nexus AI · ${kind}`, ''];
  buf.push(clean(input.query) || 'Untitled', '');
  const model = clean(input.model);
  if (model) buf.push(model, '');
  const body = clean(input.response);
  if (body) buf.push(body, '');
  appendQa(buf, turns);
  buf.push('— Shared from Nexus AI');
  return `${buf.join('\n').replace(/\n+$/, '')}\n`;
}

/** OS share sheet when the browser allows it. Otherwise the clipboard. */
export async function presentShare(text: string, title?: string): Promise<'shared' | 'copied' | 'cancelled' | 'failed'> {
  const body = text.trim();
  if (!body) return 'failed';
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: title || 'Nexus AI', text: body });
      return 'shared';
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
    }
  }
  try {
    await navigator.clipboard.writeText(body);
    return 'copied';
  } catch {
    return 'failed';
  }
}
