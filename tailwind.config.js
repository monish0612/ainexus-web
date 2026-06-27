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
        card: '0 8px 30px -12px rgba(0,0,0,0.45)',
      },
      keyframes: {
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        shimmer: 'shimmer 1.6s infinite',
        'fade-up': 'fade-up 0.3s ease-out',
      },
    },
  },
  plugins: [],
};
