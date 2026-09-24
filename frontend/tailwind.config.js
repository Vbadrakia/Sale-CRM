/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef4ff',
          100: '#dbe6fe',
          200: '#bed2fe',
          300: '#91b4fd',
          400: '#5c8cf9',
          500: '#3767f0',
          600: '#2149e0',
          700: '#1b39b6',
          800: '#1b3291',
          900: '#1c2f74',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(16, 24, 40, 0.06), 0 1px 3px rgba(16, 24, 40, 0.1)',
      },
    },
  },
  plugins: [],
};
