import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { aliases } from '../../aliases';

/** Strict CSP for the built app. (Dev keeps Vite's inline HMR preamble, so the policy is applied at build time.) */
const CSP = [
  "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:", "font-src 'self'",
  "connect-src 'self' http://127.0.0.1:4310 ws://127.0.0.1:4310 http://localhost:4310 ws://localhost:4310",
  "worker-src 'self'", "media-src 'self' blob:", "object-src 'none'", "base-uri 'self'", "form-action 'none'",
].join('; ');
const csp = (): Plugin => ({
  name: 'aster-csp', apply: 'build',
  transformIndexHtml: (html) => html.replace('<!--csp-->', `<meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
});

export default defineConfig({
  root: __dirname,
  resolve: { alias: aliases },
  plugins: [
    react(), csp(),
    VitePWA({
      registerType: 'prompt', // never auto-reload an active run; updates are opt-in from Settings
      injectRegister: false,
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'ASTER — Space Health Research Console', short_name: 'ASTER', description: 'Research prototype · simulated data',
        theme_color: '#0B1016', background_color: '#0B1016', display: 'standalone', start_url: '.',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,svg,woff2,json}'], navigateFallback: 'index.html', cleanupOutdatedCaches: true },
    }),
  ],
  worker: { format: 'es' },
  build: { outDir: '../../dist', emptyOutDir: true, target: 'es2023', sourcemap: false },
  server: { port: 5173, strictPort: true, host: '127.0.0.1' },
  preview: { port: 4173, strictPort: true, host: '127.0.0.1' },
});
