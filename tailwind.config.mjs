/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        vert: {
          DEFAULT: '#1C6B35',
          dark: '#14502A',
          light: '#2E8B4A',
          50: '#F2F9F4',
          100: '#DCEFE1',
          200: '#B9DFC3',
          300: '#8FCB9F',
          400: '#5EB276',
          500: '#2E8B4A',
          600: '#1C6B35',
          700: '#14502A',
          800: '#0E3B1F',
          900: '#092614',
        },
        rouge: {
          DEFAULT: '#8B1919',
          dark: '#6B0F0F',
          light: '#B02525',
          50: '#FCEEEE',
          100: '#F6D2D2',
          200: '#EDA5A5',
          300: '#E07878',
          400: '#CF4A4A',
          500: '#B02525',
          600: '#8B1919',
          700: '#6B0F0F',
          800: '#4A0808',
          900: '#2A0404',
        },
        noir: {
          DEFAULT: '#0F0F0F',
          soft: '#1A1A1A',
          softer: '#2A2A2A',
        },
        creme: {
          DEFAULT: '#F4F4F2',
          warm: '#F7F5F0',
        },
        texte: '#111111',
      },
      fontFamily: {
        // Typekit — loaded via <link rel="stylesheet" href="https://use.typekit.net/tci0qgy.css">
        pro: ['"filson-pro"', 'system-ui', 'sans-serif'],
        soft: ['"filson-soft"', 'system-ui', 'sans-serif'],
        sans: ['"filson-pro"', 'system-ui', 'sans-serif'],
        display: ['"filson-soft"', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        // Display scale tuned for Filson Soft
        'display-sm': ['2.5rem', { lineHeight: '1.05', letterSpacing: '-0.01em', fontWeight: '700' }],
        'display-md': ['3.5rem', { lineHeight: '1.02', letterSpacing: '-0.02em', fontWeight: '700' }],
        'display-lg': ['4.5rem', { lineHeight: '1', letterSpacing: '-0.02em', fontWeight: '700' }],
        'display-xl': ['6rem', { lineHeight: '0.95', letterSpacing: '-0.03em', fontWeight: '700' }],
        'display-2xl': ['8rem', { lineHeight: '0.9', letterSpacing: '-0.03em', fontWeight: '700' }],
      },
      spacing: {
        section: '6rem',
        'section-sm': '4rem',
        'section-lg': '8rem',
      },
      boxShadow: {
        'logo': '0 2px 8px rgba(28, 107, 53, 0.08)',
        'logo-hover': '0 4px 16px rgba(28, 107, 53, 0.15)',
        'card': '0 1px 3px rgba(0, 0, 0, 0.05), 0 8px 24px rgba(0, 0, 0, 0.06)',
        'card-hover': '0 4px 12px rgba(0, 0, 0, 0.08), 0 16px 40px rgba(0, 0, 0, 0.1)',
      },
      maxWidth: {
        'content': '1280px',
        'prose-wide': '72ch',
      },
      animation: {
        'marquee': 'marquee 30s linear infinite',
        'fade-up': 'fadeUp 0.6s ease-out',
      },
      keyframes: {
        marquee: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};
