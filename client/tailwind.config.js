/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          50: '#F3F7FB',
          100: '#E3ECF5',
          200: '#C4D6E6',
          300: '#93B4D2',
          400: '#5C8DBA',
          500: '#2A649B',
          600: '#1A4E82',
          700: '#123C68',
          800: '#0B2E52',
          900: '#0A2540',
          950: '#071A33',
        },
        gold: {
          50: '#FCF8EE',
          100: '#F8F1DD',
          200: '#F1E4BC',
          300: '#E7CE84',
          400: '#D9B950',
          500: '#C9A227',
          600: '#B08A24',
          700: '#9A761B',
          800: '#7D5F16',
          900: '#5F4811',
        },
        ink: '#0F172A',
        muted: '#64748B',
        canvas: '#F7F9FC',
        line: '#E6EBF2',
      },
      spacing: {
        sidebar: 'var(--sidebar-width)',
        topbar: 'var(--topbar-height)',
      },
      maxWidth: {
        shell: 'var(--shell-max-width)',
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(10, 37, 64, 0.04), 0 10px 28px -18px rgba(10, 37, 64, 0.18)',
        lift: '0 12px 32px -12px rgba(10, 37, 64, 0.22)',
        gold: '0 10px 24px -10px rgba(201, 162, 39, 0.55)',
      },
      borderRadius: {
        xl2: '1.15rem',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-up': { from: { opacity: '0', transform: 'translateY(10px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        'slide-in': { from: { transform: 'translateX(100%)' }, to: { transform: 'translateX(0)' } },
        'scale-in': { from: { opacity: '0', transform: 'scale(.97)' }, to: { opacity: '1', transform: 'scale(1)' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
      },
      animation: {
        'fade-in': 'fade-in .25s ease-out both',
        'slide-up': 'slide-up .35s cubic-bezier(.22,.8,.3,1) both',
        'slide-in': 'slide-in .28s cubic-bezier(.22,.8,.3,1) both',
        'scale-in': 'scale-in .18s ease-out both',
      },
    },
  },
  plugins: [],
};
