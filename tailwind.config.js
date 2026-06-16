/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      borderRadius: {
        'md':  '6px',
        'lg':  '6px',
        'xl':  '8px',
        '2xl': '8px',
        '3xl': '8px',
      },
    },
  },
  plugins: [],
}
