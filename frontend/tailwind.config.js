/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // DYCI brand — navy blue + golden yellow (from the school seal)
        navy: {
          50: '#eef0fb',
          100: '#d6daf4',
          200: '#aab2e8',
          300: '#7c89d9',
          400: '#5061c8',
          500: '#3e50c8',
          600: '#2a3a9e',
          700: '#1e2a78',
          800: '#172058',
          900: '#10163b',
          950: '#0a0e26',
        },
        gold: {
          50: '#fdf8ea',
          100: '#faedc4',
          200: '#f6ce5b',
          300: '#f2c13a',
          400: '#eab02e',
          500: '#d99a20',
          600: '#c8901c',
          700: '#a06f16',
          800: '#7a5413',
          900: '#5c3f10',
        },
        surface: {
          light: '#ffffff',
          'light-2': '#f6f7fb',
          dark: '#0e1226',
          'dark-2': '#161b36',
          'dark-3': '#1e2444',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', 'Inter', 'ui-sans-serif', 'sans-serif'],
      },
      boxShadow: {
        navy: '0 18px 40px -12px rgba(30, 42, 120, 0.35)',
        gold: '0 18px 40px -12px rgba(234, 176, 46, 0.35)',
        card: '0 4px 24px -8px rgba(16, 22, 59, 0.12)',
        'card-dark': '0 6px 28px -10px rgba(0, 0, 0, 0.6)',
      },
      borderRadius: {
        xl: '0.9rem',
        '2xl': '1.25rem',
        '3xl': '1.75rem',
      },
      backgroundImage: {
        'hero-navy': 'linear-gradient(135deg, #10163b 0%, #1e2a78 45%, #2a3a9e 100%)',
        'gold-sheen': 'linear-gradient(135deg, #f6ce5b 0%, #eab02e 50%, #c8901c 100%)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.6s cubic-bezier(0.22, 1, 0.36, 1) both',
        'fade-in': 'fade-in 0.5s ease-out both',
        float: 'float 6s ease-in-out infinite',
        shimmer: 'shimmer 1.6s infinite',
      },
    },
  },
  plugins: [],
};
