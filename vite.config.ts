/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    // Mirror the Netlify redirect so deck import works in dev: Archidekt's API has no
    // CORS headers, so we proxy it server-side instead of calling it from the browser.
    proxy: {
      '/api/archidekt': {
        target: 'https://archidekt.com/api',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/archidekt/, '')
      }
    }
  },
  test: {
    // Unit tests target logic/data integrity (composables, stores, utils) — not the DOM.
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts']
  }
})
