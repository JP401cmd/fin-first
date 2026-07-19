import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../..')

// Cross-origin isolation: LiteRT-LM leunt op @litertjs/wasm-utils; de multi-threaded
// WASM-tak vereist SharedArrayBuffer (→ crossOriginIsolated). WebGPU zelf niet, maar
// we zetten het aan zodat de volledige runtime meet-baar is.
//
// COEP = 'credentialless' i.p.v. 'require-corp': geeft nog steeds
// crossOriginIsolated === true, maar laat de cross-origin model-download van
// huggingface.co toe zonder dat die een CORP-header hoeft te sturen.
const COI_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
} as const

export default defineConfig({
  server: {
    // host: 'localhost' → WebGPU vereist een secure context; localhost telt als
    // secure. Vaste poort 5183 met strictPort zodat Playwright de URL kent.
    host: 'localhost',
    port: 5183,
    strictPort: true,
    headers: { ...COI_HEADERS },
    // Sta imports toe uit de repo-root: ../../lib/* (prompt + budgetlijst, single
    // source of truth) en ../lokale-categorisatie/* (hergebruikte fase-0-modules).
    fs: { allow: [repoRoot] },
  },
  preview: {
    host: 'localhost',
    port: 4183,
    strictPort: true,
    headers: { ...COI_HEADERS },
  },
  // Laat esbuild de WASM-zware runtime niet pre-bundelen; we importeren 'm
  // dynamisch en laten Vite 'm as-is serveren.
  optimizeDeps: {
    exclude: ['@litert-lm/core'],
  },
})
