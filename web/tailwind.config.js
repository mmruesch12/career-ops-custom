/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        base: '#1e1e2e',
        mantle: '#181825',
        crust: '#11111b',
        surface: '#313244',
        overlay: '#45475a',
        muted: '#6c7086',
        subtle: '#a6adc8',
        text: '#cdd6f4',
        blue: '#89b4fa',
        mauve: '#cba6f7',
        green: '#a6e3a1',
        yellow: '#f9e2af',
        peach: '#fab387',
        red: '#f38ba8',
        pink: '#f5c2e7',
        sky: '#89dceb',
        lavender: '#b4befe',
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 0 40px -10px rgba(137, 180, 250, 0.35)',
        card: '0 4px 24px -4px rgba(0, 0, 0, 0.4)',
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease-out',
        'slide-up': 'slideUp 0.35s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};