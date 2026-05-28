/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
      colors: {
        primary: { DEFAULT: '#FF6B35', dark: '#E55B25', light: '#FF8C5A' },
        secondary: { DEFAULT: '#0F1729', light: '#1A2744' },
        success: '#00C48C',
        warning: '#FFA502',
        danger: '#FF4757',
      }
    }
  },
  plugins: []
};
