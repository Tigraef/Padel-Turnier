// Eigener Build für alte iPads (alte Safari-Versionen). Ergebnis: dist/ipad/index.html
// Die normale App (vite.config.js) bleibt davon unberührt.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import legacy from '@vitejs/plugin-legacy';
import postcssCustomProperties from 'postcss-custom-properties';
import autoprefixer from 'autoprefixer';

// "ie >= 11" erzwingt reines ES5 – damit läuft es auch auf sehr alten Safari-Versionen sicher.
const targets = ['ios >= 9', 'safari >= 9', 'ie >= 11'];

export default defineConfig({
  plugins: [
    react(),
    legacy({
      targets,
      // Nur die kompatible Variante ausliefern – auch iPads mit „halb-modernem“ Safari bekommen sie.
      renderModernChunks: false,
    }),
  ],
  base: './',
  publicDir: false,
  css: {
    postcss: {
      plugins: [postcssCustomProperties({ preserve: true }), autoprefixer({ overrideBrowserslist: targets })],
    },
  },
  build: {
    outDir: 'dist/ipad',
    emptyOutDir: true,
    rollupOptions: { input: 'ipad.html' },
  },
});
