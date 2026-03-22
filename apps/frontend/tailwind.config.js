/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['Cinzel', 'Georgia', 'serif'],
        sans: ['Source Sans 3', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        initiativeDiePop: {
          '0%': { opacity: '0', transform: 'scale(0.88) translateY(4px)' },
          '55%': { opacity: '1', transform: 'scale(1.06) translateY(0)' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        initiativeDieDim: {
          '0%, 50%': { opacity: '1', transform: 'scale(1)' },
          '100%': { opacity: '0.4', transform: 'scale(0.94)' },
        },
      },
      animation: {
        'init-die-pop': 'initiativeDiePop 0.65s ease-out both',
        'init-die-dim': 'initiativeDieDim 0.75s ease-out 0.2s both',
      },
    },
  },
  plugins: [],
};
