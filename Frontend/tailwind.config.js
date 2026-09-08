/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      colors: {
        // ── Primary brand — warm amber ──────────────────────────────
        primary: {
          50:  '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',   // main brand accent
          700: '#b45309',   // hover
          800: '#92400e',
          900: '#78350f',
          950: '#451a03',
        },
        // ── Surface — warm graphite neutral ─────────────────────────
        surface: {
          50:  '#f7f7f5',   // warm off-white page bg
          100: '#f0f0ed',
          200: '#e4e4e0',
          300: '#d1d1cc',
          400: '#9d9d97',
          500: '#70706a',   // secondary text
          600: '#52524d',
          700: '#3a3a36',
          800: '#27272a',   // dark borders
          900: '#1c1c1e',   // dark surfaces
          950: '#111214',   // darkest bg
        },
        // ── Semantic — success ───────────────────────────────────────
        success: {
          50:  '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
          800: '#166534',
          900: '#14532d',
          950: '#052e16',
        },
        // ── Semantic — warning ───────────────────────────────────────
        warning: {
          50:  '#fffbeb',
          100: '#fef3c7',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
          950: '#451a03',
        },
        // ── Semantic — error ─────────────────────────────────────────
        error: {
          50:  '#fef2f2',
          100: '#fee2e2',
          200: '#fecaca',
          500: '#ef4444',
          600: '#dc2626',
          700: '#b91c1c',
          800: '#991b1b',
          950: '#450a0a',
        },
        // ── Dark mode sidebar/surface overrides ──────────────────────
        dark: {
          bg:      '#111214',
          surface: '#181a1d',
          border:  '#2a2d32',
        },
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '1rem' }],
      },
      borderRadius: {
        DEFAULT: '0.25rem',
        sm: '0.125rem',
        md: '0.375rem',
        lg: '0.5rem',
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
        'card-md': '0 1px 3px 0 rgb(0 0 0 / 0.08), 0 1px 2px -1px rgb(0 0 0 / 0.06)',
      },
    },
  },
  plugins: [],
};
