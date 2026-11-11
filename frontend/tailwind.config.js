/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        forest: {
          950: '#081A12',
          900: '#0C2418',
          800: '#113021',
          700: '#19452F',
          600: '#235A3D',
          500: '#2F7250',
          400: '#4C9069',
          300: '#79B091',
          200: '#B4D3BF',
          100: '#DCEBE1',
          50: '#F0F6F2',
        },
        moss: '#7FA36B',
        lime: '#C4E87A',
        sand: '#F4F1E8',
        parchment: '#FBFAF5',
        ink: '#17211B',
        clay: '#B85C38',
        amber: '#D9A441',
      },
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Consolas', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(23,33,27,0.04), 0 12px 32px -18px rgba(23,33,27,0.25)',
        lift: '0 18px 50px -24px rgba(8,26,18,0.45)',
      },
      backgroundImage: {
        topo: "radial-gradient(circle at 20% 20%, rgba(196,232,122,0.08) 0, transparent 40%), radial-gradient(circle at 80% 0%, rgba(127,163,107,0.12) 0, transparent 45%)",
      },
    },
  },
  plugins: [],
}
