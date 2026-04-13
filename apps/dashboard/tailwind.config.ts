import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#f0f4ff',
          100: '#dde8ff',
          200: '#b3c9ff',
          300: '#7aa4ff',
          400: '#4477ff',
          500: '#1a55ff',
          600: '#0037e0',
          700: '#002db5',
          800: '#002490',
          900: '#001c72',
        },
      },
    },
  },
  plugins: [],
};

export default config;
