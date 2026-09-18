import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import type { Dirent } from 'node:fs'
import { posix, resolve } from 'node:path'
import { defineConfig, loadEnv } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { connectSrcFor, readCloudConfig } from './src/lib/cloud/env'
import type { CloudConfig } from './src/lib/cloud/env'
import { precachePaths } from './src/pwa/precache'
import type { BuildFile } from './src/pwa/precache'

const CONNECT_SRC_PLACEHOLDER = '__CSP_CONNECT_SRC__'
const SW_CONFIG_PLACEHOLDER = '__SW_CONFIG__'
const SW_TEMPLATE = './src/pwa/sw-template.js'

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

/** Arquivos de public/ (favicon, ícones, manifesto), que o Vite copia sem passar pelo bundle. */
function publicFiles(dir: string, prefix = ''): BuildFile[] {
  let entries: Dirent[]
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
  return entries.flatMap(entry => {
    const path = posix.join(prefix, entry.name)
    return entry.isDirectory()
      ? publicFiles(resolve(dir, entry.name), path)
      : [{ path, size: statSync(resolve(dir, entry.name)).size }]
  })
}

/**
 * Emite dist/sw.js a partir de src/pwa/sw-template.js com a lista de estáticos deste build.
 * Só arquivos do build entram: o modelo é que garante que dado de usuário nunca vá para o
 * cache, e src/pwa/serviceWorker.test.ts trava essa regra.
 */
function serviceWorker(): Plugin {
  let publicDir = ''
  let assetsDir = 'assets'
  return {
    name: 'financaspro-service-worker',
    apply: 'build',
    configResolved(config) {
      publicDir = config.publicDir
      assetsDir = config.build.assetsDir
    },
    generateBundle(_options, bundle) {
      const built: BuildFile[] = Object.values(bundle).map(item =>
        item.type === 'chunk'
          ? { path: item.fileName, size: Buffer.byteLength(item.code) }
          : { path: item.fileName, size: Buffer.byteLength(item.source as string | Uint8Array) },
      )
      // O index.html ainda não está no bundle neste gancho; ele é a casca e entra sempre.
      // Não entra no cálculo da versão, e tudo bem: a navegação busca a casca na rede
      // primeiro e só cai no cache quando não há rede, então ela nunca fica velha.
      const precache = precachePaths([...built, ...publicFiles(publicDir), { path: 'index.html', size: 0 }])

      // A versão é o resumo da própria lista: se nada mudou, o cache do usuário continua
      // valendo; se um arquivo mudou, o sw.js muda e o navegador oferece a atualização.
      const version = createHash('sha256').update(precache.join('\n')).digest('hex').slice(0, 12)
      const config = { version, assetPrefix: `/${assetsDir}/`, precache }

      const template = readFileSync(new URL(SW_TEMPLATE, import.meta.url), 'utf8')
      // Exatamente uma: se a marca aparecer também num comentário, a configuração cai lá.
      const marks = template.split(SW_CONFIG_PLACEHOLDER).length - 1
      if (marks !== 1) {
        throw new Error(`${SW_TEMPLATE} precisa da marca de configuração uma única vez (encontradas: ${marks}).`)
      }
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: template.replace(SW_CONFIG_PLACEHOLDER, JSON.stringify(config, null, 2)),
      })
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
    plugins: [
      react(),
      tailwindcss(),
      cspConnectSrc(cloud),
      serviceWorker(),
    ],
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
