import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: '#0a0a0b',
          soft: '#111114',
          panel: '#16161a',
          line: '#26262c',
        },
        accent: {
          DEFAULT: '#7c5cff',
          soft: '#a48bff',
        },
        ok: '#3fd6a0',
        warn: '#f5b042',
        bad: '#ff6b6b',
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
