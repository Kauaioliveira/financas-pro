import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readCloudConfig } from './src/lib/cloud/env'

export default defineConfig(({ mode }) => {
  // Throws on unsafe values (e.g. a secret key), so a broken deploy fails at build time.
  const cloud = readCloudConfig(loadEnv(mode, process.cwd(), 'VITE_'))

  return {
    // false turns every cloud branch into dead code, so the local bundle has no cloud modules.
    define: { __FINANCASPRO_CLOUD__: JSON.stringify(cloud !== null) },
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) {
              return;
            }

            if (
              id.includes('recharts') ||
              id.includes('victory-vendor') ||
              id.includes(`${'node_modules'}${'/'}d3-`)
            ) {
              return 'charts-vendor';
            }

            if (id.includes('papaparse') || id.includes('date-fns')) {
              return 'parser-vendor';
            }

            if (
              id.includes('react') ||
              id.includes('react-dom') ||
              id.includes('scheduler')
            ) {
              return 'react-vendor';
            }
          },
        },
      },
    },
  }
})
