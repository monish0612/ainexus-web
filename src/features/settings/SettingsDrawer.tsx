import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { LogOut, Moon, RefreshCw, Sun, X } from 'lucide-react';
import { Segmented, Spinner } from '@/components/ui/primitives';
import { Provider, useSettingsStore } from '@/store/settingsStore';
import { useAuthStore } from '@/store/authStore';
import { fetchModels } from '@/lib/api/settings';
import { BanksSection } from './BanksSection';

interface Props {
  open: boolean;
  onClose: () => void;
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-fg3">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-fg4">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function ProviderSegment({
  label,
  subtitle,
  value,
  onChange,
}: {
  label: string;
  subtitle?: string;
  value: Provider;
  onChange: (v: Provider) => void;
}) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wider text-fg3">{label}</p>
      {subtitle && <p className="mb-1.5 mt-0.5 text-xs text-fg4">{subtitle}</p>}
      <div className={subtitle ? '' : 'mt-1.5'}>
        <Segmented<Provider>
          value={value}
          onChange={onChange}
          options={[
            { value: 'gemini', label: 'Gemini' },
            { value: 'xgrok', label: 'xAI Grok' },
          ]}
        />
      </div>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <p className="mb-1.5 text-sm font-medium text-fg2">{label}</p>
      <input
        className="input"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

export function SettingsDrawer({ open, onClose }: Props) {
  const s = useSettingsStore();
  const { username, logout } = useAuthStore();

  const modelsQuery = useQuery({
    queryKey: ['ai-models'],
    queryFn: () => fetchModels(false),
    enabled: open,
    staleTime: 10 * 60_000,
  });
  const models = modelsQuery.data?.models ?? [];

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[95] flex justify-end"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            className="relative z-10 flex h-full w-full max-w-md flex-col border-l border-line bg-bg1"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 320 }}
          >
            {/* Header / profile */}
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-accent to-accent-2 font-bold text-white">
                  {(username[0] || 'N').toUpperCase()}
                </div>
                <div>
                  <p className="font-bold text-fg">{username || 'Nexus'}</p>
                  <p className="text-xs text-fg3">Settings</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="rounded-full p-1.5 text-fg3 hover:bg-bg3 hover:text-fg"
              >
                <X size={20} />
              </button>
            </div>

            {/* Body */}
            <div className="flex flex-1 flex-col gap-7 overflow-y-auto p-5">
              <Section title="Theme">
                <Segmented
                  value={s.theme}
                  onChange={(v) => s.set('theme', v)}
                  options={[
                    {
                      value: 'dark',
                      label: (
                        <span className="inline-flex items-center gap-1.5">
                          <Moon size={15} /> AMOLED Dark
                        </span>
                      ),
                    },
                    {
                      value: 'white',
                      label: (
                        <span className="inline-flex items-center gap-1.5">
                          <Sun size={15} /> White
                        </span>
                      ),
                    },
                  ]}
                />
              </Section>

              <Section
                title="Deep research model"
                subtitle="Used for deep research, follow-ups & online search"
              >
                <TextField
                  label="Gemini deep model"
                  value={s.deepModel}
                  onChange={(v) => s.set('deepModel', v)}
                  placeholder="gemini-3.1-pro-preview"
                />
              </Section>

              <Section
                title="Gemini lite model"
                subtitle="Fast tasks: categorize, rephrase, summarize, define"
              >
                {modelsQuery.isLoading ? (
                  <div className="flex items-center gap-2 text-sm text-fg3">
                    <Spinner size={15} /> Loading models…
                  </div>
                ) : (
                  <select
                    className="input"
                    value={s.liteModel}
                    onChange={(e) => s.set('liteModel', e.target.value)}
                  >
                    {!models.some((m) => m.id === s.liteModel) && s.liteModel && (
                      <option value={s.liteModel}>{s.liteModel}</option>
                    )}
                    {models.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.displayName || m.id}
                      </option>
                    ))}
                  </select>
                )}
                <button
                  onClick={() => modelsQuery.refetch()}
                  className="flex items-center gap-1.5 self-start text-xs font-semibold text-accent"
                >
                  <RefreshCw size={13} /> Refresh available models
                </button>
              </Section>

              <Section title="xGrok models">
                <label className="flex items-center justify-between rounded-xl border border-line bg-bg2 px-4 py-3">
                  <span className="text-sm font-medium text-fg">Enable xGrok models</span>
                  <input
                    type="checkbox"
                    checked={s.xgrokEnabled}
                    onChange={(e) => s.set('xgrokEnabled', e.target.checked)}
                    className="h-5 w-5 accent-accent"
                  />
                </label>

                {s.xgrokEnabled && (
                  <div className="flex flex-col gap-5 border-l-2 border-line pl-4">
                    <TextField
                      label="Lite Model"
                      value={s.xgrokLiteModel}
                      onChange={(v) => s.set('xgrokLiteModel', v)}
                    />
                    <TextField
                      label="Deep Model"
                      value={s.xgrokDeepModel}
                      onChange={(v) => s.set('xgrokDeepModel', v)}
                    />
                    <TextField
                      label="Thinking Model"
                      value={s.xgrokThinkingModel}
                      onChange={(v) => s.set('xgrokThinkingModel', v)}
                    />
                    <ProviderSegment
                      label="Article summarize override"
                      subtitle="Override the article summarizer model provider"
                      value={s.summarizeOverride}
                      onChange={(v) => s.set('summarizeOverride', v)}
                    />
                    <ProviderSegment
                      label="Online search"
                      subtitle="Provider for InsightAI web search"
                      value={s.onlineSearchProvider}
                      onChange={(v) => s.set('onlineSearchProvider', v)}
                    />
                    <ProviderSegment
                      label="Default follow-up provider"
                      subtitle="Pre-select the AI provider for article & search follow-ups"
                      value={s.defaultFollowUpProvider}
                      onChange={(v) => s.set('defaultFollowUpProvider', v)}
                    />
                  </div>
                )}
              </Section>

              <BanksSection />

              <button
                onClick={() => {
                  logout();
                  onClose();
                }}
                className="mt-1 flex items-center justify-center gap-2 rounded-xl border border-line bg-bg2 px-4 py-3 font-semibold text-fg2 transition hover:text-fg"
              >
                <LogOut size={17} /> Sign Out
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
