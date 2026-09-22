import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Camera, Image as ImageIcon, LogOut, Moon, RefreshCw, Sun, Trash2, X } from 'lucide-react';
import { Segmented, Spinner } from '@/components/ui/primitives';
import { PresenceBoundary } from '@/components/ui/PresenceBoundary';
import { Provider, useSettingsStore } from '@/store/settingsStore';
import { useAuthStore } from '@/store/authStore';
import { useProfilePhotoStore } from '@/store/profilePhotoStore';
import { fetchModels } from '@/lib/api/settings';
import { spring } from '@/lib/motion';
import { BanksSection } from './BanksSection';
import { UserAvatar } from '@/components/ui/UserAvatar';

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
  const photoUrl = useProfilePhotoStore((st) => st.url);
  const photoBusy = useProfilePhotoStore((st) => st.busy);
  const photoError = useProfilePhotoStore((st) => st.error);
  const setFromFile = useProfilePhotoStore((st) => st.setFromFile);
  const removePhoto = useProfilePhotoStore((st) => st.remove);
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  // Same dialog treatment as Modal: Escape closes, Tab is trapped inside the
  // drawer while it is open, and focus goes back to whatever opened it.
  //
  // Escape is its own listener rather than another branch of the Tab handler:
  // the trap returns early for every non-Tab key, which is exactly how the
  // drawer ended up with a focus trap and no way out from the keyboard.
  useEffect(() => {
    if (!open) return;
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onEscape);
    return () => document.removeEventListener('keydown', onEscape);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !panelRef.current) return;
      const items = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (items.length === 0) return;
      const start = items[0];
      const end = items[items.length - 1];
      if (e.shiftKey && document.activeElement === start) {
        e.preventDefault();
        end.focus();
      } else if (!e.shiftKey && document.activeElement === end) {
        e.preventDefault();
        start.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previous?.focus?.();
    };
  }, [open]);

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
          animate={{ opacity: 1, pointerEvents: 'auto' }}
          // The panel slides out on a spring, so the overlay outlives the
          // close by a few hundred ms. Without this it keeps swallowing the
          // click the user makes immediately after closing.
          exit={{ opacity: 0, pointerEvents: 'none' }}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            className="relative z-10 flex h-full w-full max-w-md flex-col border-l border-line bg-bg1 shadow-card outline-none"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={spring.default}
          >
            {/* Header / profile */}
            <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
              <div className="flex items-center gap-3">
                <UserAvatar username={username || 'Nexus'} size={40} />
                <div>
                  <p className="font-bold text-fg">{username || 'Nexus'}</p>
                  <p id={titleId} className="text-xs text-fg3">
                    Settings
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close settings"
                className="icon-btn -mr-2 rounded-full"
              >
                <X size={20} />
              </button>
            </div>

            {/* Body */}
            <PresenceBoundary>
              <div className="flex flex-1 flex-col gap-7 overflow-y-auto p-5">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (f) void setFromFile(f).catch(() => {});
                  }}
                />
                <input
                  ref={camRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (f) void setFromFile(f).catch(() => {});
                  }}
                />
                <Section title="Profile photo" subtitle="Shown on the phone and on the web after you sign in.">
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      disabled={photoBusy}
                      onClick={() => camRef.current?.click()}
                      className="flex items-center gap-2 rounded-xl border border-line bg-bg2 px-4 py-3 text-sm font-semibold text-fg2 hover:text-fg disabled:opacity-50"
                    >
                      <Camera size={17} /> Take photo
                    </button>
                    <button
                      type="button"
                      disabled={photoBusy}
                      onClick={() => fileRef.current?.click()}
                      className="flex items-center gap-2 rounded-xl border border-line bg-bg2 px-4 py-3 text-sm font-semibold text-fg2 hover:text-fg disabled:opacity-50"
                    >
                      <ImageIcon size={17} /> {photoUrl ? 'Change photo' : 'Choose from gallery'}
                    </button>
                    {photoUrl && (
                      <button
                        type="button"
                        disabled={photoBusy}
                        onClick={() => void removePhoto().catch(() => {})}
                        className="flex items-center gap-2 rounded-xl border border-line bg-bg2 px-4 py-3 text-sm font-semibold text-red-400 hover:text-red-300 disabled:opacity-50"
                      >
                        <Trash2 size={17} /> Remove photo
                      </button>
                    )}
                    {photoBusy && <p className="text-xs text-fg4">Saving…</p>}
                    {photoError && <p className="text-xs text-red-400">{photoError}</p>}
                  </div>
                </Section>
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
                    className="tap-44 mt-0.5 flex items-center gap-1.5 self-start text-xs font-semibold text-accent"
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
            </PresenceBoundary>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
