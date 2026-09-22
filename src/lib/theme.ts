export type ThemeName = 'dark' | 'white';

export interface Palette {
  bg: string;
  bg1: string;
  bg2: string;
  bg3: string;
  bg4: string;
  text: string;
  text2: string;
  text3: string;
  text4: string;
  text5: string;
  border: string;
  border2: string;
  headerBg: string;
  navBg: string;
  /** Mode accents, used as text. Per-theme because no single hex clears AA on
   *  both #000000 and #FFFFFF. Non-text (border/ring) variants that pass the
   *  3:1 dual threshold on both themes are theme-invariant and live in
   *  index.css as --mode-*-edge. */
  modeLite: string;
  modeDeep: string;
  modeThinking: string;
  /** The CTA fill (#0D59F2) is only 3.73:1 on black, so it cannot be used as
   *  text in the dark theme. This is the blue to use for *text*. */
  accentText: string;
  /** xGrok reads as flat slate against Gemini's gradient, so the two providers
   *  stay distinguishable in grayscale. */
  providerXgrok: string;
  shadowCard: string;
  isDark: boolean;
}

// Mirrors docs/figma_source/palette.ts exactly.
export function createPalette(theme: ThemeName): Palette {
  if (theme === 'white') {
    return {
      bg: '#FFFFFF',
      bg1: '#F8FAFC',
      bg2: 'rgba(0,0,0,0.04)',
      bg3: 'rgba(0,0,0,0.06)',
      bg4: 'rgba(0,0,0,0.09)',
      text: '#0F172A',
      text2: '#475569',
      // 7.23:1 / 4.74:1 / 3.15:1 on #FFFFFF.
      text3: 'rgba(0,0,0,0.66)',
      text4: 'rgba(0,0,0,0.55)',
      text5: 'rgba(0,0,0,0.43)',
      border: 'rgba(0,0,0,0.09)',
      border2: 'rgba(0,0,0,0.06)',
      headerBg: '#FFFFFF',
      navBg: 'rgba(255,255,255,0.97)',
      modeLite: '#0E7490',
      modeDeep: '#7C3AED',
      modeThinking: '#A16207',
      accentText: '#0D59F2',
      providerXgrok: '#475569',
      shadowCard: '0 1px 2px rgba(15,23,42,0.06), 0 8px 24px rgba(15,23,42,0.08)',
      isDark: false,
    };
  }
  return {
    bg: '#000000',
    bg1: '#060608',
    bg2: 'rgba(255,255,255,0.05)',
    bg3: 'rgba(255,255,255,0.08)',
    bg4: 'rgba(255,255,255,0.12)',
    text: '#F1F5F9',
    text2: '#94A3B8',
    // 7.37:1 / 4.76:1 / 3.14:1 on #000000.
    text3: 'rgba(255,255,255,0.60)',
    text4: 'rgba(255,255,255,0.47)',
    text5: 'rgba(255,255,255,0.36)',
    border: 'rgba(255,255,255,0.08)',
    border2: 'rgba(255,255,255,0.05)',
    headerBg: '#000000',
    navBg: 'rgba(0,0,0,0.97)',
    modeLite: '#22D3EE',
    modeDeep: '#8B5CF6',
    modeThinking: '#F5B62C',
    accentText: '#5B8CFF',
    providerXgrok: '#94A3B8',
    shadowCard: '0 8px 30px -12px rgba(0,0,0,0.45)',
    isDark: true,
  };
}

const VAR_MAP: Record<string, keyof Palette> = {
  '--bg': 'bg',
  '--bg1': 'bg1',
  '--bg2': 'bg2',
  '--bg3': 'bg3',
  '--bg4': 'bg4',
  '--text': 'text',
  '--text2': 'text2',
  '--text3': 'text3',
  '--text4': 'text4',
  '--text5': 'text5',
  '--border': 'border',
  '--border2': 'border2',
  '--header-bg': 'headerBg',
  '--nav-bg': 'navBg',
  '--mode-lite': 'modeLite',
  '--mode-deep': 'modeDeep',
  '--mode-thinking': 'modeThinking',
  '--accent-text': 'accentText',
  '--provider-xgrok': 'providerXgrok',
  '--shadow-card': 'shadowCard',
};

/** Push a palette into the document root CSS variables and theme attribute. */
export function applyTheme(theme: ThemeName) {
  const p = createPalette(theme);
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
  for (const [cssVar, key] of Object.entries(VAR_MAP)) {
    root.style.setProperty(cssVar, String(p[key]));
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', p.headerBg);
}
