import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the build works on any static host (GitHub Pages, Netlify, a subfolder).
export default defineConfig({
  base: './',
  plugins: [react()],
});
