import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api/client';

type Job = { status?: string; chunks?: number[]; complete?: boolean; chunk_error?: string; reason?: string };

export function NarrationBar({ articleId, text, title }: { articleId: string; text: string; title: string }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [error, setError] = useState('');
  const [label, setLabel] = useState('Listen');
  const played = useRef(0);
  const stop = useRef(false);

  useEffect(() => () => { stop.current = true; }, []);

  async function poll(): Promise<Job> {
    const res = await api.get<Job>(`/narration/${encodeURIComponent(articleId)}`);
    return res.data || {};
  }

  async function playIndex(index: number) {
    const res = await api.get(`/narration/${encodeURIComponent(articleId)}/chunks/${index}`, { responseType: 'blob' });
    const url = URL.createObjectURL(res.data);
    const el = audio.current;
    if (!el) return;
    el.src = url;
    await el.play();
    played.current = index + 1;
  }

  async function advance(job: Job) {
    const ready = job.chunks || [];
    if (job.chunk_error || job.status === 'failed') {
      setError(job.chunk_error || job.reason || 'Narration stopped');
      audio.current?.pause();
      return;
    }
    const el = audio.current;
    const idle = !el || el.paused || el.ended;
    if (idle && played.current < ready.length) {
      await playIndex(played.current);
      return;
    }
    if (el && el.ended && played.current < ready.length) {
      await playIndex(played.current);
    }
  }

  async function onListen() {
    setError('');
    setLabel('Preparing…');
    stop.current = false;
    await api.post(`/narration/${encodeURIComponent(articleId)}/ensure`, { title, text });
    for (let i = 0; i < 90 && !stop.current; i++) {
      const job = await poll();
      setLabel(job.complete ? 'Ready' : `Chunk ${Math.max(played.current, (job.chunks || []).length)}`);
      await advance(job);
      if (job.complete && played.current >= (job.chunks || []).length) break;
      if (job.chunk_error || job.status === 'failed') break;
      await new Promise((r) => setTimeout(r, 175));
    }
  }

  return (
    <div className="mb-3 flex items-center gap-3">
      <button type="button" className="tap-44 text-sm font-semibold text-accent" onClick={onListen}>
        {label}
      </button>
      <audio
        ref={audio}
        onEnded={() => {
          poll().then((job) => advance(job)).catch(() => setError('Could not load the next chunk'));
        }}
      />
      {error && <span className="text-sm text-red-400">{error}</span>}
    </div>
  );
}
