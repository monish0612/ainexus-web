/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        // Theme tokens are CSS variables set by ThemeProvider so dark/white
        // switch at runtime without re-tailwinding. Mirrors palette.ts.
        bg: 'var(--bg)',
        bg1: 'var(--bg1)',
        bg2: 'var(--bg2)',
        bg3: 'var(--bg3)',
        bg4: 'var(--bg4)',
        fg: 'var(--text)',
        fg2: 'var(--text2)',
        fg3: 'var(--text3)',
        fg4: 'var(--text4)',
        fg5: 'var(--text5)',
        line: 'var(--border)',
        line2: 'var(--border2)',
        accent: '#0D59F2',
        'accent-2': '#7C3AED',
        // Accent as *text*: #0D59F2 is 3.73:1 on #000000 and fails AA, so text
        // in the dark theme uses #5B8CFF instead. The fill stays #0D59F2.
        'accent-text': 'var(--accent-text)',
        // Mode identity. `*-edge` are the non-text (border / focus ring)
        // variants that clear 3:1 on both themes.
        lite: 'var(--mode-lite)',
        'lite-edge': 'var(--mode-lite-edge)',
        deep: 'var(--mode-deep)',
        'deep-edge': 'var(--mode-deep-edge)',
        think: 'var(--mode-thinking)',
        'think-edge': 'var(--mode-thinking-edge)',
        // Provider identity. Gemini is a gradient (see backgroundImage.gemini),
        // xGrok is deliberately flat so the pair survives grayscale.
        'gemini-from': 'var(--provider-gemini-from)',
        'gemini-to': 'var(--provider-gemini-to)',
        xgrok: 'var(--provider-xgrok)',
      },
      backgroundImage: {
        gemini: 'var(--provider-gemini)',
      },
      fontFamily: {
        sans: [
          '"Plus Jakarta Sans Variable"',
          '"Plus Jakarta Sans"',
          'system-ui',
          'sans-serif',
        ],
        mono: ['"JetBrains Mono Variable"', '"JetBrains Mono"', 'monospace'],
      },
      maxWidth: {
        content: '1280px',
      },
      boxShadow: {
        glow: '0 0 40px -8px rgba(13,89,242,0.45)',
        // Per-theme: the dark drop shadow goes muddy on white, so the white
        // theme swaps in a soft cool-slate elevation. See index.css.
        card: 'var(--shadow-card)',
      },
      spacing: {
        'safe-b': 'env(safe-area-inset-bottom)',
      },
      keyframes: {
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'digit-pop': {
          '0%': { opacity: '0', transform: 'translateY(8px)', filter: 'blur(2px)' },
          '100%': { opacity: '1', transform: 'translateY(0)', filter: 'blur(0)' },
        },
      },
      animation: {
        shimmer: 'shimmer 1.6s infinite',
        'fade-up': 'fade-up 0.3s ease-out',
        'digit-pop': 'digit-pop 0.5s cubic-bezier(0.34, 1.45, 0.64, 1) both',
      },
    },
  },
  plugins: [],
};
