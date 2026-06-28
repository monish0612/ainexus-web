import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { useSettingsStore } from '@/store/settingsStore';
import { ModelPicker } from './ModelPicker';
import { ModelMode } from '@/lib/modelHints';
import { Provider } from '@/store/settingsStore';

function Harness({
  modes,
  initialProvider = 'gemini',
  initialMode = 'lite',
  onMode,
}: {
  modes?: ModelMode[];
  initialProvider?: Provider;
  initialMode?: ModelMode;
  onMode?: (m: ModelMode) => void;
}) {
  // Mirror how the feature screens drive the picker with local state.
  let provider = initialProvider;
  let mode = initialMode;
  return (
    <ModelPicker
      provider={provider}
      mode={mode}
      modes={modes}
      onProviderChange={(p) => {
        provider = p;
      }}
      onModeChange={(m) => {
        mode = m;
        onMode?.(m);
      }}
    />
  );
}

beforeEach(() => {
  useSettingsStore.setState({ xgrokEnabled: false });
});
afterEach(() => cleanup());

describe('ModelPicker — provider gating + mode visibility (Android parity)', () => {
  it('hides the provider toggle when xGrok is disabled', () => {
    render(<Harness />);
    expect(screen.queryByText('Gemini')).toBeNull();
    expect(screen.queryByText('xGrok')).toBeNull();
    // Mode toggle is always present.
    expect(screen.getByText('Lite')).toBeTruthy();
    expect(screen.getByText('Deep')).toBeTruthy();
  });

  it('shows Gemini/xGrok toggle when xGrok is enabled', () => {
    useSettingsStore.setState({ xgrokEnabled: true });
    render(<Harness />);
    expect(screen.getByText('Gemini')).toBeTruthy();
    expect(screen.getByText('xGrok')).toBeTruthy();
  });

  it('hides Thinking on Gemini even when requested', () => {
    useSettingsStore.setState({ xgrokEnabled: true });
    render(<Harness modes={['lite', 'deep', 'thinking']} initialProvider="gemini" />);
    expect(screen.getByText('Lite')).toBeTruthy();
    expect(screen.getByText('Deep')).toBeTruthy();
    expect(screen.queryByText('Thinking')).toBeNull();
  });

  it('shows Thinking only when provider is xGrok', () => {
    useSettingsStore.setState({ xgrokEnabled: true });
    render(<Harness modes={['lite', 'deep', 'thinking']} initialProvider="xgrok" />);
    expect(screen.getByText('Thinking')).toBeTruthy();
  });

  it('coerces an invalid Thinking selection to Deep (gemini)', () => {
    useSettingsStore.setState({ xgrokEnabled: true });
    const onMode = vi.fn();
    // mode=thinking but provider=gemini → effect must coerce to deep.
    render(
      <Harness
        modes={['lite', 'deep', 'thinking']}
        initialProvider="gemini"
        initialMode="thinking"
        onMode={onMode}
      />,
    );
    expect(onMode).toHaveBeenCalledWith('deep');
  });

  it('treats provider as gemini when xGrok disabled regardless of prop', () => {
    useSettingsStore.setState({ xgrokEnabled: false });
    render(<Harness modes={['lite', 'deep', 'thinking']} initialProvider="xgrok" />);
    // No provider toggle, and Thinking hidden because effective provider is gemini.
    expect(screen.queryByText('xGrok')).toBeNull();
    expect(screen.queryByText('Thinking')).toBeNull();
  });
});
