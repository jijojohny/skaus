import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        skaus: {
          primary: '#6366f1',
          secondary: '#8b5cf6',
          dark: '#0f0f23',
          surface: '#1a1a2e',
          border: '#2a2a4a',
          text: '#e2e8f0',
          muted: '#94a3b8',
          success: '#22c55e',
          error: '#ef4444',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
