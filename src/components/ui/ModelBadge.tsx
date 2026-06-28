import { Brain, Link2, Sparkles, Zap } from 'lucide-react';

export type ModelTier = 'Lite' | 'Deep' | 'Thinking';
export type ModelProvider = 'Gemini' | 'xGrok' | 'AI';

export interface ModelInfo {
  provider: ModelProvider;
  tier: ModelTier;
}

/**
 * Parse a backend model id (e.g. "gemini-3.1-flash-lite-preview",
 * "grok-4-1-fast-reasoning") into a provider + tier so each follow-up answer
 * shows exactly which model produced it — letting one model's output be
 * cross-checked by another, the same way the Android app's per-message chip
 * does. Order matters: 'non-reasoning' must be checked before 'reasoning'
 * because the lite grok id literally contains the substring "reasoning".
 */
export function describeModel(model: string): ModelInfo {
  const m = (model || '').toLowerCase();
  const provider: ModelProvider = m.includes('grok')
    ? 'xGrok'
    : m.includes('gemini')
      ? 'Gemini'
      : 'AI';

  let tier: ModelTier;
  if (m.includes('non-reasoning') || m.includes('lite') || m.includes('flash')) {
    tier = 'Lite';
  } else if (m.includes('reasoning') || m.includes('thinking')) {
    tier = 'Thinking';
  } else if (m.includes('pro') || m.includes('deep') || m.includes('0709')) {
    tier = 'Deep';
  } else {
    // Unknown/empty → assume Deep (matches the backend's default resolution).
    tier = 'Deep';
  }

  return { provider, tier };
}

const TIER_STYLE: Record<ModelTier, { icon: typeof Zap; color: string }> = {
  Lite: { icon: Zap, color: '#4285F4' },
  Deep: { icon: Brain, color: '#C084FC' },
  Thinking: { icon: Sparkles, color: '#F59E0B' },
};

const PROVIDER_COLOR: Record<ModelProvider, string> = {
  Gemini: '#4285F4',
  xGrok: '#E8453C',
  AI: '#94A3B8',
};

function Chip({ icon: Icon, color, label }: { icon: typeof Zap; color: string; label: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold"
      style={{
        color,
        background: `${color}1f`,
        border: `1px solid ${color}38`,
      }}
    >
      <Icon size={10} />
      {label}
    </span>
  );
}

/**
 * Per-message model indicator: provider (Gemini/xGrok) + tier (Lite/Deep/
 * Thinking) + optional sources count. Render under each AI answer so the user
 * can verify the exact model that produced it.
 */
export function ModelBadge({ model, sources }: { model?: string; sources?: number }) {
  if (!model && !sources) return null;
  const info = model ? describeModel(model) : null;
  const tierStyle = info ? TIER_STYLE[info.tier] : null;

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      {info && (
        <Chip icon={Sparkles} color={PROVIDER_COLOR[info.provider]} label={info.provider} />
      )}
      {info && tierStyle && <Chip icon={tierStyle.icon} color={tierStyle.color} label={info.tier} />}
      {!!sources && sources > 0 && (
        <Chip icon={Link2} color="#34D399" label={`${sources} ${sources === 1 ? 'source' : 'sources'}`} />
      )}
    </div>
  );
}
