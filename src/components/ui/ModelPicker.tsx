import { useEffect } from 'react';
import { Brain, Sparkles, Zap } from 'lucide-react';
import { Segmented } from './primitives';
import { useSettingsStore, Provider } from '@/store/settingsStore';
import { ModelMode } from '@/lib/modelHints';

const PROVIDER_OPTS: { value: Provider; label: React.ReactNode }[] = [
  {
    value: 'gemini',
    label: (
      <span className="inline-flex items-center justify-center gap-1.5">
        <Sparkles size={13} /> Gemini
      </span>
    ),
  },
  {
    value: 'xgrok',
    label: (
      <span className="inline-flex items-center justify-center gap-1.5">
        <Brain size={13} /> xGrok
      </span>
    ),
  },
];

const MODE_META: Record<ModelMode, { label: string; icon: React.ReactNode }> = {
  lite: { label: 'Lite', icon: <Zap size={13} /> },
  deep: { label: 'Deep', icon: <Brain size={13} /> },
  thinking: { label: 'Thinking', icon: <Sparkles size={13} /> },
};

interface Props {
  provider: Provider;
  mode: ModelMode;
  onProviderChange: (p: Provider) => void;
  onModeChange: (m: ModelMode) => void;
  /** Modes to expose. Defaults to lite + deep. `thinking` is xGrok-only and is
   *  automatically hidden when the provider is Gemini. */
  modes?: ModelMode[];
  className?: string;
}

/**
 * Per-query AI model picker — Gemini/xGrok provider toggle + Lite/Deep/Thinking
 * depth toggle. Mirrors the Android app's in-sheet picker so the user controls
 * exactly which model answers each follow-up / search.
 *
 * The provider toggle only appears when "Enable xGrok models" is on in Settings
 * (same gate as Android). `thinking` is an xGrok-only depth and is dropped when
 * Gemini is active (collapses to deep), keeping the wire contract honest.
 */
export function ModelPicker({
  provider,
  mode,
  onProviderChange,
  onModeChange,
  modes = ['lite', 'deep'],
  className,
}: Props) {
  const xgrokEnabled = useSettingsStore((s) => s.xgrokEnabled);

  const effectiveProvider: Provider = xgrokEnabled ? provider : 'gemini';

  const visibleModes = modes.filter(
    (m) => m !== 'thinking' || effectiveProvider === 'xgrok',
  );

  // If the active mode is no longer valid (e.g. Thinking while on Gemini),
  // coerce to deep so we never send an unrenderable selection.
  useEffect(() => {
    if (!visibleModes.includes(mode)) {
      onModeChange(visibleModes.includes('deep') ? 'deep' : visibleModes[0]);
    }
  }, [mode, visibleModes, onModeChange]);

  const modeOpts = visibleModes.map((m) => ({
    value: m,
    label: (
      <span className="inline-flex items-center justify-center gap-1.5">
        {MODE_META[m].icon} {MODE_META[m].label}
      </span>
    ),
  }));

  return (
    <div className={className ?? 'flex flex-col gap-2'}>
      {xgrokEnabled && (
        <Segmented
          value={effectiveProvider}
          options={PROVIDER_OPTS}
          onChange={onProviderChange}
        />
      )}
      <Segmented value={mode} options={modeOpts} onChange={onModeChange} />
    </div>
  );
}
