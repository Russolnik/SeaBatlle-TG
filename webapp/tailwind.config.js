/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'cell-empty': 'var(--cell-empty)',
        'cell-ship': 'var(--cell-ship)',
        'cell-hit': 'var(--cell-hit)',
        'cell-miss': 'var(--cell-miss)',
      },
    },
  },
  plugins: [],
}

