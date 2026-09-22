import { useEffect } from 'react';
import { Brain, Sparkles, Zap } from 'lucide-react';
import { Segmented, SegmentedOption, SegmentedTone } from './primitives';
import { useSettingsStore, Provider } from '@/store/settingsStore';
import { ModelMode } from '@/lib/modelHints';

/**
 * A mode's active chip: its own colour at low alpha as the fill, the `*-edge`
 * token as the border, and the AA-fixed `--mode-*` text colour for the label.
 * The saturated colour is never used as a fill behind white text — cyan-600
 * under white is 3.7:1 and would fail AA at this weight.
 *
 * The fill is the pre-baked `--mode-*-fill` token, not a `color-mix()` of
 * `--mode-*`: an engine that doesn't know `color-mix` drops the declaration
 * and the active chip loses its fill entirely, leaving only the border to
 * carry state.
 */
function modeTone(v: ModelMode): SegmentedTone {
  const token = v === 'thinking' ? 'thinking' : v;
  return {
    fill: `var(--mode-${token}-fill)`,
    edge: `var(--mode-${token}-edge)`,
    text: `var(--mode-${token})`,
  };
}

/**
 * Provider identity is STRUCTURAL, not just chromatic: Gemini is a gradient in
 * a fully-round chip, xGrok is flat slate in an angular one. Print the picker
 * in grayscale and the two are still telling you which model you picked.
 */
const GEMINI_TONE: SegmentedTone = {
  fill: 'var(--provider-gemini-fill)',
  edge: 'var(--provider-gemini-to)',
  text: 'var(--accent-text)',
  radius: 'rounded-full',
};

const XGROK_TONE: SegmentedTone = {
  fill: 'var(--provider-xgrok-fill)',
  edge: 'var(--provider-xgrok)',
  text: 'var(--text)',
  radius: 'rounded-[7px]',
};

const PROVIDER_OPTS: SegmentedOption<Provider>[] = [
  {
    value: 'gemini',
    tone: GEMINI_TONE,
    label: (
      <span className="inline-flex items-center justify-center gap-1.5">
        <Sparkles size={13} /> Gemini
      </span>
    ),
  },
  {
    value: 'xgrok',
    tone: XGROK_TONE,
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
  /**
   * `stacked` = two full-width bars (Settings-style). `chips` = both groups
   * hug their content and share one wrapping row, which is what the composers
   * use so the controls read as subordinate to the field.
   */
  density?: 'stacked' | 'chips';
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
  density = 'stacked',
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

  const modeOpts: SegmentedOption<ModelMode>[] = visibleModes.map((m) => ({
    value: m,
    tone: modeTone(m),
    label: (
      <span className="inline-flex items-center justify-center gap-1.5">
        {MODE_META[m].icon} {MODE_META[m].label}
      </span>
    ),
  }));

  const chips = density === 'chips';
  const segmentDensity = chips ? 'chips' : 'bar';

  return (
    <div
      className={
        className ?? (chips ? 'flex flex-wrap items-center gap-2' : 'flex flex-col gap-2')
      }
    >
      {/* Provider stays first: Thinking appears and disappears at the END of
          the depth group, so the provider chips never shift under the cursor
          when the user switches to xGrok. */}
      {xgrokEnabled && (
        <Segmented
          value={effectiveProvider}
          options={PROVIDER_OPTS}
          onChange={onProviderChange}
          density={segmentDensity}
          aria-label="AI provider"
        />
      )}
      <Segmented
        value={mode}
        options={modeOpts}
        onChange={onModeChange}
        density={segmentDensity}
        aria-label="Answer depth"
      />
    </div>
  );
}
