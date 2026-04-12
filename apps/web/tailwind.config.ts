import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        skaus: {
          primary: '#ff2d2d',
          'primary-hover': '#e01e1e',
          accent: '#ff4d4d',
          dark: '#0a0a0a',
          darker: '#050505',
          surface: '#111111',
          'surface-hover': '#1a1a1a',
          border: '#222222',
          'border-hover': '#333333',
          text: '#f5f5f5',
          muted: '#777777',
          'muted-light': '#999999',
          success: '#22c55e',
          error: '#ef4444',
          warning: '#f59e0b',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
        display: ['Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        'display-xl': [
          'clamp(2.25rem, 9vw + 1rem, 5rem)',
          { lineHeight: '1', letterSpacing: '-0.04em', fontWeight: '900' },
        ],
        'display-lg': [
          'clamp(1.875rem, 5.5vw + 0.85rem, 3.5rem)',
          { lineHeight: '1.05', letterSpacing: '-0.03em', fontWeight: '800' },
        ],
        'display-md': [
          'clamp(1.5rem, 3.8vw + 0.65rem, 2.5rem)',
          { lineHeight: '1.1', letterSpacing: '-0.02em', fontWeight: '700' },
        ],
        'display-sm': [
          'clamp(1.25rem, 2.2vw + 0.85rem, 1.75rem)',
          { lineHeight: '1.2', letterSpacing: '-0.01em', fontWeight: '700' },
        ],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'slide-up': 'slideUp 0.5s ease-out',
        'slide-down': 'slideDown 0.3s ease-out',
        'fade-in': 'fadeIn 0.4s ease-out',
        'scale-in': 'scaleIn 0.3s ease-out',
      },
      keyframes: {
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideDown: {
          '0%': { transform: 'translateY(-10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
      backgroundImage: {
        'grid-pattern': 'linear-gradient(to right, #151515 1px, transparent 1px), linear-gradient(to bottom, #151515 1px, transparent 1px)',
      },
    },
  },
  plugins: [],
};

export default config;
