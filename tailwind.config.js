/** @type {import('tailwindcss').Config} */

// AcidReflux palette — pulled from the podcast logo.
const acid = {
  50: '#f8fcdc',
  100: '#eef9b0',
  200: '#e3f47b',
  300: '#d8ee45',
  400: '#c9e21b', // brand lime ("ACID")
  500: '#b0c80f',
  600: '#8ca00c',
  700: '#6c7b0c',
  800: '#55610f',
  900: '#464f11',
};
const chili = {
  50: '#fff1ee',
  100: '#ffdfd8',
  200: '#ffbfb0',
  300: '#ff9580',
  400: '#ff6a4d',
  500: '#f0391e', // brand chili red
  600: '#d42a12',
  700: '#b0200e',
  800: '#8f1d11',
  900: '#771e14',
};
const sun = {
  50: '#fffde6',
  100: '#fff9bf',
  200: '#fff088',
  300: '#ffe44d',
  400: '#ffd60a', // brand yellow ("REFLUX")
  500: '#e6b800',
  600: '#bf8d00',
  700: '#946600',
  800: '#7a4f07',
  900: '#68410c',
};

module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['var(--font-display)', 'Impact', 'sans-serif'],
        sans: ['var(--font-body)', 'Inter', 'Segoe UI', 'sans-serif'],
      },
      colors: {
        ink: { DEFAULT: '#070707', 800: '#0f0f0d', 700: '#171714', 600: '#1f1f1a' },
        acid,
        chili,
        sun,
        brand: chili,
        // Global re-theme: legacy utility names used across existing pages
        // now resolve to the AcidReflux palette.
        rose: chili,
        violet: acid,
        emerald: acid,
        amber: sun,
      },
      boxShadow: {
        acid: '0 10px 40px -10px rgba(201, 226, 27, 0.45)',
        chili: '0 10px 40px -10px rgba(240, 57, 30, 0.5)',
      },
      keyframes: {
        drip: {
          '0%,100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(6px)' },
        },
        floaty: {
          '0%,100%': { transform: 'translateY(0) rotate(-1deg)' },
          '50%': { transform: 'translateY(-10px) rotate(1deg)' },
        },
      },
      animation: {
        drip: 'drip 3s ease-in-out infinite',
        floaty: 'floaty 6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
