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
        chat: {
          bg: '#0d0d0d',          // ChatGPT dark background
          sidebar: '#171717',     // ChatGPT sidebar tone
          card: '#212121',        // ChatGPT card & bubble
          input: '#2f2f2f',       // Input bar background
          border: '#383838',      // Border tone
          accent: '#10a37f',      // OpenAI emerald accent
          gemini: '#4b90ff',      // Gemini blue accent
          geminiGlow: '#e879f9'   // Gemini purple glow
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
