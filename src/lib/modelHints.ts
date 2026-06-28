import { Provider } from '@/store/settingsStore';

/**
 * Web port of the Android app's `ModelHints.build()` (lib/core/llm/model_hints.dart).
 *
 * The backend picks the actual LLM (and whether to enable Google-Search
 * grounding) from the combination of `provider` + `mode` plus the ONE matching
 * model-id field. Forwarding every model field at once is risky: a slightly
 * permissive resolver (`body.deepModel ?? body.liteModel ?? default`) can route
 * a "lite" request to a "deep"/non-grounded model — exactly the "everything is
 * doing deep search / not sure which model is used" bug.
 *
 * Two invariants enforced on every request:
 *   1. PROVIDER ISOLATION — gemini never ships an `xgrok*` field; xgrok never
 *      ships `deepModel`.
 *   2. MODE ISOLATION — only the model id matching the active mode is sent.
 */
export type ModelMode = 'lite' | 'deep' | 'thinking';

export interface ModelHintInput {
  provider?: string;
  mode?: string;
  deepModel?: string;
  liteModel?: string;
  xgrokLiteModel?: string;
  xgrokDeepModel?: string;
  xgrokThinkingModel?: string;
}

const PROVIDER_GEMINI = 'gemini';
const PROVIDER_XGROK = 'xgrok';

function normalizeProvider(raw?: string): Provider {
  return raw?.trim().toLowerCase() === PROVIDER_XGROK ? PROVIDER_XGROK : PROVIDER_GEMINI;
}

function normalizeMode(raw: string | undefined, provider: Provider): ModelMode {
  const t = raw?.trim().toLowerCase();
  if (t === 'deep') return 'deep';
  if (t === 'thinking') {
    // Thinking is an xGrok-only depth. Collapse to deep on Gemini so the
    // backend's mode dispatcher always sees a value it can route.
    return provider === PROVIDER_XGROK ? 'thinking' : 'deep';
  }
  return 'lite';
}

function clean(v?: string): string | undefined {
  if (v == null) return undefined;
  const t = v.trim();
  return t.length === 0 ? undefined : t;
}

/**
 * Returns `{ provider, mode }` plus AT MOST one model-id field — the one that
 * matches the active (provider, mode) pair. Unrelated fields are dropped.
 */
export function buildModelHints(input: ModelHintInput): Record<string, string> {
  const p = normalizeProvider(input.provider);
  const m = normalizeMode(input.mode, p);

  const out: Record<string, string> = { provider: p, mode: m };

  if (p === PROVIDER_XGROK) {
    if (m === 'deep') {
      const v = clean(input.xgrokDeepModel);
      if (v) out.xgrokDeepModel = v;
    } else if (m === 'thinking') {
      const v = clean(input.xgrokThinkingModel);
      if (v) out.xgrokThinkingModel = v;
    } else {
      const v = clean(input.xgrokLiteModel);
      if (v) out.xgrokLiteModel = v;
    }
  } else {
    // Gemini. Deep & Thinking both use the Gemini "deep" slot.
    if (m === 'deep' || m === 'thinking') {
      const v = clean(input.deepModel);
      if (v) out.deepModel = v;
    } else {
      const v = clean(input.liteModel);
      if (v) out.liteModel = v;
    }
  }

  return out;
}
