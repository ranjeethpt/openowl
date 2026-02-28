/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./public/**/*.html",
    "./src/**/*.{js,jsx}"
  ],
  theme: {
    extend: {
      colors: {
        // OpenOwl brand colors from logo
        owl: {
          primary: '#0f172a',    // Dark navy (slate-900)
          secondary: '#1e293b',  // Medium slate (slate-800)
          blue: '#2563eb',       // Bright blue (blue-600)
          accent: '#f59e0b',     // Orange accent (amber-500)
        }
      }
    },
  },
  plugins: [],
}
