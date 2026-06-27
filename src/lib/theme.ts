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
      text3: 'rgba(0,0,0,0.55)',
      text4: 'rgba(0,0,0,0.38)',
      text5: 'rgba(0,0,0,0.25)',
      border: 'rgba(0,0,0,0.09)',
      border2: 'rgba(0,0,0,0.06)',
      headerBg: '#FFFFFF',
      navBg: 'rgba(255,255,255,0.97)',
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
    text3: 'rgba(255,255,255,0.42)',
    text4: 'rgba(255,255,255,0.28)',
    text5: 'rgba(255,255,255,0.18)',
    border: 'rgba(255,255,255,0.08)',
    border2: 'rgba(255,255,255,0.05)',
    headerBg: '#000000',
    navBg: 'rgba(0,0,0,0.97)',
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
