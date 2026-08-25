import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: '#F4F6FB',
          panel: '#FFFFFF',
          raised: '#FFFFFF',
          border: '#E3E7EF',
        },
        ink: {
          DEFAULT: '#1B2333',
          muted: '#5B6472',
          faint: '#8A93A3',
        },
        accent: {
          DEFAULT: '#3D6FE0',
          soft: '#EAF1FF',
        },
        positive: '#12B76A',
        warning: '#F79009',
        danger: '#F04438',
      },
      fontFamily: {
        display: ['var(--font-display)', 'sans-serif'],
        sans: ['var(--font-sans)', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      borderRadius: {
        xl: '14px',
        '2xl': '20px',
      },
      boxShadow: {
        panel: '0 1px 2px 0 rgba(16,24,40,0.04), 0 1px 3px 0 rgba(16,24,40,0.06)',
      },
    },
  },
  plugins: [],
};

export default config;
