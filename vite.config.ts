/// <reference types="vitest" />
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Spec §202 — GitHub deployment model.
 * The app must build to a static bundle that works from a repository
 * sub-path (GitHub Pages) as well as from a domain root.
 *
 * Set BASE_PATH at build time, e.g.
 *   BASE_PATH=/Drone-Surveying-Mining/ npm run build
 */
const base = process.env.BASE_PATH ?? '/';

const resolvePath = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  base,
  plugins: [react()],
  resolve: {
    alias: {
      '@engine': resolvePath('./src/engine'),
      '@data': resolvePath('./src/data'),
      '@components': resolvePath('./src/components'),
      '@modules': resolvePath('./src/modules'),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    // Spec §204 — keep the initial payload small; heavy 3D code is split out.
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          r3f: ['@react-three/fiber', '@react-three/drei'],
        },
      },
    },
    chunkSizeWarningLimit: 1200,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
