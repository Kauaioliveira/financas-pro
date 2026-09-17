import { readFileSync } from 'node:fs'
import { defineConfig, loadEnv } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { connectSrcFor, readCloudConfig } from './src/lib/cloud/env'
import type { CloudConfig } from './src/lib/cloud/env'

const CONNECT_SRC_PLACEHOLDER = '__CSP_CONNECT_SRC__'

/**
 * Which build this is, sent with the testers' opinions ("app_version", at most 40 chars).
 * The version of package.json alone does not change between deploys, so the build date
 * goes with it. No personal data and nothing about the machine that built it.
 */
function appVersion(): string {
  const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version?: string }
  return `${pkg.version || '0.0.0'}+${new Date().toISOString().slice(0, 10)}`.slice(0, 40)
}

/**
 * Fills connect-src of the CSP <meta> in index.html (dev and build): 'self' in local
 * builds, plus the Supabase origin in cloud builds. Vite's %VITE_*% syntax is not used
 * because a missing variable would stay in the page as literal text.
 */
function cspConnectSrc(cloud: CloudConfig | null): Plugin {
  return {
    name: 'financaspro-csp-connect-src',
    transformIndexHtml(html) {
      if (!html.includes(CONNECT_SRC_PLACEHOLDER)) {
        throw new Error(`index.html precisa de connect-src ${CONNECT_SRC_PLACEHOLDER} no Content-Security-Policy.`)
      }
      return html.replaceAll(CONNECT_SRC_PLACEHOLDER, connectSrcFor(cloud))
    },
  }
}

export default defineConfig(({ mode }) => {
  // Throws on unsafe values (e.g. a secret key), so a broken deploy fails at build time.
  const cloud = readCloudConfig(loadEnv(mode, process.cwd(), 'VITE_'))

  return {
    // false turns every cloud branch into dead code, so the local bundle has no cloud modules.
    define: {
      __FINANCASPRO_CLOUD__: JSON.stringify(cloud !== null),
      __FINANCASPRO_VERSION__: JSON.stringify(appVersion()),
    },
    plugins: [react(), tailwindcss(), cspConnectSrc(cloud)],
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
