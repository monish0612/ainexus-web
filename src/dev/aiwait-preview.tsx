/**
 * Dev-only harness for the AiWait variants.
 *
 * It is a standalone Vite entry (`/nexusai/aiwait-preview.html`) with its own
 * root, so it never touches the real router and never ships: `vite build` only
 * takes index.html as an input, and nothing in the app imports this file.
 */
import { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { MotionConfig } from 'framer-motion';
import { AiWait, AiWaitMode } from '@/components/ui/AiWait';
import { applyTheme, ThemeName } from '@/lib/theme';
import '@fontsource-variable/plus-jakarta-sans';
import '@fontsource-variable/jetbrains-mono';
import '../index.css';

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card flex flex-col gap-3 p-4">
      <h2 className="text-xs font-bold uppercase tracking-wider text-fg3">{title}</h2>
      {children}
    </section>
  );
}

function Preview() {
  const [theme, setTheme] = useState<ThemeName>('dark');
  const [mode, setMode] = useState<AiWaitMode>('lite');
  const [done, setDone] = useState(false);
  const [progress, setProgress] = useState(0.08);
  const [errorShown, setErrorShown] = useState(true);

  useEffect(() => applyTheme(theme), [theme]);

  useEffect(() => {
    const id = window.setInterval(
      () => setProgress((p) => (p >= 1 ? 0.08 : Math.min(1, p + 0.13))),
      1400,
    );
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="min-h-screen bg-bg p-6 text-fg">
      <div className="mx-auto flex max-w-4xl flex-col gap-5">
        <header className="flex flex-wrap items-center gap-2">
          <h1 className="mr-auto text-xl font-extrabold tracking-tight">AiWait preview</h1>
          <button className="pill bg-bg2" onClick={() => setTheme(theme === 'dark' ? 'white' : 'dark')}>
            Theme: {theme}
          </button>
          {(['lite', 'deep', 'thinking'] as AiWaitMode[]).map((m) => (
            <button
              key={m}
              className={`pill ${mode === m ? 'bg-bg4 text-fg' : 'bg-bg2 text-fg3'}`}
              onClick={() => setMode(m)}
            >
              {m}
            </button>
          ))}
          <button className="pill bg-bg2" onClick={() => setDone((d) => !d)}>
            {done ? 'reset converge' : 'converge'}
          </button>
        </header>

        <div className="grid gap-4 sm:grid-cols-2">
          <Panel title="research">
            <AiWait variant="research" mode={mode} done={done} />
          </Panel>
          <Panel title="think">
            <AiWait variant="think" mode={mode === 'lite' ? 'deep' : mode} />
          </Panel>
          <Panel title="vision (determinate)">
            <AiWait variant="vision" mode={mode} progress={progress} alt="" />
          </Panel>
          <Panel title="vision (indeterminate)">
            <AiWait variant="vision" mode={mode} progress={null} alt="" />
          </Panel>
          <Panel title="sync">
            <AiWait variant="sync" mode={mode} progress={progress} status="Uploading" />
          </Panel>
          <Panel title="result">
            <div className="flex flex-col gap-3">
              <AiWait variant="result" mode={mode} state="success" status="Saved to library" />
              {errorShown && (
                <AiWait
                  variant="result"
                  state="error"
                  status="Couldn't reach the model"
                  onRevert={() => setErrorShown(false)}
                />
              )}
              <button className="pill bg-bg2" onClick={() => setErrorShown(true)}>
                replay error
              </button>
            </div>
          </Panel>
          <Panel title="list — row">
            <AiWait variant="list" rows={4} shape="row" />
          </Panel>
          <Panel title="list — article">
            <AiWait variant="list" rows={2} shape="article" />
          </Panel>
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <MotionConfig reducedMotion="user">
    <Preview />
  </MotionConfig>,
);
