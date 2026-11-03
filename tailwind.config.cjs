/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: 'rgb(var(--bg) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        sunken: 'rgb(var(--sunken) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        faint: 'rgb(var(--faint) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        accent: 'rgb(var(--accent) / <alpha-value>)',
        'accent-soft': 'rgb(var(--accent-soft) / <alpha-value>)',
        meal: 'rgb(var(--meal) / <alpha-value>)',
        'meal-soft': 'rgb(var(--meal-soft) / <alpha-value>)',
        notice: 'rgb(var(--notice) / <alpha-value>)',
        'notice-soft': 'rgb(var(--notice-soft) / <alpha-value>)',
        danger: 'rgb(var(--danger) / <alpha-value>)',
        nonveg: 'rgb(var(--nonveg) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', '"Noto Sans Devanagari"', 'sans-serif'],
      },
      borderRadius: { card: '20px', tile: '14px' },
      boxShadow: {
        card: '0 1px 2px rgb(23 32 45 / 0.04), 0 1px 1px rgb(23 32 45 / 0.02)',
        lift: '0 8px 30px rgb(23 32 45 / 0.12)',
      },
      maxWidth: { app: '1120px' },
    },
  },
  plugins: [],
};
