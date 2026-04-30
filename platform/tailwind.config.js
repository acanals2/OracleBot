/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        ob: {
          bg: '#07080B',
          surface: '#0F1117',
          raised: '#14171F',
          panel: '#1A1E27',
          line: 'rgba(255,255,255,0.08)',
          'line-strong': 'rgba(255,255,255,0.14)',
          ink: '#ECEEF2',
          muted: '#9097A4',
          dim: '#5F6573',
          signal: '#7CF0C0',
          'signal-dim': '#45A98B',
          warn: '#F4B860',
          danger: '#E27474',
          glow: 'rgba(124,240,192,0.12)',
        },
      },
      fontFamily: {
        sans: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
        display: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 40px -8px rgba(124,240,192,0.25)',
        card: '0 1px 0 rgba(255,255,255,0.06) inset, 0 24px 48px -24px rgba(0,0,0,0.5)',
      },
      backgroundImage: {
        'grid-pattern':
          'linear-gradient(to right, rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.03) 1px, transparent 1px)',
      },
      keyframes: {
        'ob-rise': {
          '0%': { opacity: '0', transform: 'translateY(0.5em)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};
