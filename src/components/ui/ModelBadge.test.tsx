import { describe, expect, it } from 'vitest';
import { describeModel } from './ModelBadge';

describe('describeModel', () => {
  it('detects gemini lite (flash-lite)', () => {
    expect(describeModel('gemini-3.1-flash-lite-preview')).toEqual({
      provider: 'Gemini',
      tier: 'Lite',
    });
  });

  it('detects gemini deep (pro)', () => {
    expect(describeModel('gemini-3.1-pro-preview')).toEqual({
      provider: 'Gemini',
      tier: 'Deep',
    });
  });

  it('detects grok lite (fast-non-reasoning) — not Thinking', () => {
    // The lite grok id contains the substring "reasoning"; must resolve to Lite.
    expect(describeModel('grok-4-1-fast-non-reasoning')).toEqual({
      provider: 'xGrok',
      tier: 'Lite',
    });
  });

  it('detects grok thinking (fast-reasoning)', () => {
    expect(describeModel('grok-4-1-fast-reasoning')).toEqual({
      provider: 'xGrok',
      tier: 'Thinking',
    });
  });

  it('detects grok deep (grok-4-0709)', () => {
    expect(describeModel('grok-4-0709')).toEqual({
      provider: 'xGrok',
      tier: 'Deep',
    });
  });

  it('falls back to AI/Deep on unknown model', () => {
    expect(describeModel('mystery-model')).toEqual({ provider: 'AI', tier: 'Deep' });
  });

  it('handles empty string', () => {
    expect(describeModel('')).toEqual({ provider: 'AI', tier: 'Deep' });
  });
});
