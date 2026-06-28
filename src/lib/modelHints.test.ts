import { describe, expect, it } from 'vitest';
import { buildModelHints } from './modelHints';

const MODELS = {
  deepModel: 'gemini-3.1-pro-preview',
  liteModel: 'gemini-3.1-flash-lite-preview',
  xgrokLiteModel: 'grok-4-1-fast-non-reasoning',
  xgrokDeepModel: 'grok-4-0709',
  xgrokThinkingModel: 'grok-4-1-fast-reasoning',
};

describe('buildModelHints — provider + mode isolation', () => {
  it('gemini lite → only liteModel, no xgrok/deep fields', () => {
    const h = buildModelHints({ provider: 'gemini', mode: 'lite', ...MODELS });
    expect(h).toEqual({ provider: 'gemini', mode: 'lite', liteModel: MODELS.liteModel });
  });

  it('gemini deep → only deepModel', () => {
    const h = buildModelHints({ provider: 'gemini', mode: 'deep', ...MODELS });
    expect(h).toEqual({ provider: 'gemini', mode: 'deep', deepModel: MODELS.deepModel });
  });

  it('gemini thinking collapses to deep (xgrok-only depth) → deepModel', () => {
    const h = buildModelHints({ provider: 'gemini', mode: 'thinking', ...MODELS });
    expect(h).toEqual({ provider: 'gemini', mode: 'deep', deepModel: MODELS.deepModel });
  });

  it('xgrok lite → only xgrokLiteModel, no gemini fields', () => {
    const h = buildModelHints({ provider: 'xgrok', mode: 'lite', ...MODELS });
    expect(h).toEqual({ provider: 'xgrok', mode: 'lite', xgrokLiteModel: MODELS.xgrokLiteModel });
  });

  it('xgrok deep → only xgrokDeepModel', () => {
    const h = buildModelHints({ provider: 'xgrok', mode: 'deep', ...MODELS });
    expect(h).toEqual({ provider: 'xgrok', mode: 'deep', xgrokDeepModel: MODELS.xgrokDeepModel });
  });

  it('xgrok thinking → only xgrokThinkingModel', () => {
    const h = buildModelHints({ provider: 'xgrok', mode: 'thinking', ...MODELS });
    expect(h).toEqual({
      provider: 'xgrok',
      mode: 'thinking',
      xgrokThinkingModel: MODELS.xgrokThinkingModel,
    });
  });

  it('never leaks the other provider model id', () => {
    const gem = buildModelHints({ provider: 'gemini', mode: 'deep', ...MODELS });
    expect(gem.xgrokDeepModel).toBeUndefined();
    expect(gem.xgrokLiteModel).toBeUndefined();
    const grok = buildModelHints({ provider: 'xgrok', mode: 'lite', ...MODELS });
    expect(grok.deepModel).toBeUndefined();
    expect(grok.liteModel).toBeUndefined();
  });

  it('defaults: unknown provider → gemini, unknown mode → lite', () => {
    const h = buildModelHints({ provider: 'bogus', mode: 'weird', ...MODELS });
    expect(h.provider).toBe('gemini');
    expect(h.mode).toBe('lite');
    expect(h.liteModel).toBe(MODELS.liteModel);
  });

  it('blank model ids are dropped, not sent as empty strings', () => {
    const h = buildModelHints({ provider: 'gemini', mode: 'lite', liteModel: '   ' });
    expect(h).toEqual({ provider: 'gemini', mode: 'lite' });
  });
});
