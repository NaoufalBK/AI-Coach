/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./*.{js,ts,jsx,tsx}",
    "./services/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      blur: {
        '3xl': '64px',
      },
    },
  },
  safelist: [
    'animate-[fadeIn_0.5s_ease-in_forwards]',
    'animate-[fadeIn_0.7s_ease-in_forwards]',
    'animate-[fadeIn_1s_ease-in_forwards]',
    'animate-[slideInFromBottom_0.5s_ease-out_forwards]',
    'animate-[slideInFromBottom_0.7s_ease-out_forwards]',
    'animate-[slideInFromRight_0.5s_ease-out_forwards]',
  ],
  plugins: [],
}
