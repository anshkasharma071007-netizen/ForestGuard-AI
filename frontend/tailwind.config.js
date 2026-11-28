import themeColors from './theme-colors.js'

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      opacity: { disabled: 'var(--theme-disabled-opacity, 0.5)' },
      colors: {
        ...themeColors,
        forest: {
          950: '#0B2B1D',
          900: '#0E3323',
          800: '#123D2A',
          700: '#174A33',
          600: '#1F5C3A',
          500: '#2A7048',
          400: '#4C8F5F',
          300: '#7FB389',
          200: '#B6D5B7',
          100: '#DDEBD6',
          50: '#F0F6E9',
        },
        moss: '#7FA36B',
        lime: '#CFE8A3',
        clay: '#8B5E3C',
        amber: '#E0A32E',
      },
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Consolas', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(17,32,22,0.05), 0 14px 34px -20px rgba(11,43,29,0.28)',
        lift: '0 22px 54px -26px rgba(11,43,29,0.55)',
      },
      backgroundImage: {
        topo: "radial-gradient(circle at 18% 18%, rgba(207,232,163,0.10) 0, transparent 42%), radial-gradient(circle at 82% 0%, rgba(127,163,107,0.14) 0, transparent 46%)",
      },
    },
  },
  plugins: [],
}