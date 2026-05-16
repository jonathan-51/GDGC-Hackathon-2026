/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: '#050505',
          deep:    '#050505',
          light:   '#111111',
        },
        cyan: {
          electric: '#F2DDA4',
          400: '#E6B347',
          500: '#C7A97A',
        },
        gold: {
          pale:  '#F2DDA4',
          aged:  '#C7A97A',
          cta:   '#E6B347',
          amber: '#FFE082',
        },
        // All blue shades → gold/warm tones — no blue anywhere
        blue: {
          300: '#F2DDA4',
          400: '#F2DDA4',
          500: '#E6B347',
          600: '#C7A97A',
          700: '#8B5E15',
          800: '#5C3E0D',
          900: '#2E1E04',
        },
        // Silver-neutral slate — no blue tint
        slate: {
          200: '#E8E8E8',
          300: '#D0D0D0',
          400: '#A8A8A8',
          500: '#737373',
          600: '#525252',
          700: '#3A3A3A',
          800: '#242424',
          900: '#141414',
        },
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', '"Fira Code"', 'ui-monospace', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 0 20px rgba(242, 221, 164, 0.4)',
      },
    },
  },
  plugins: [],
}
