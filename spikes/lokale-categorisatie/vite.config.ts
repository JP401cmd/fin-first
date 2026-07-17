import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../..')

// Cross-origin isolation: nodig voor de multi-threaded WASM-fallback van
// onnxruntime-web (SharedArrayBuffer). WebGPU zelf vereist dit niet, maar we
// zetten het aan zodat de WASM-fallback ook meet-baar is.
//
// COEP = 'credentialless' i.p.v. 'require-corp': geeft nog steeds
// crossOriginIsolated === true, maar laat cross-origin model-downloads van
// huggingface.co toe zonder dat die een CORP-header hoeven te sturen. Met
// 'require-corp' zouden de model-shards geblokkeerd worden.
const COI_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
} as const

export default defineConfig({
  // host: true → bind op 0.0.0.0 zodat een telefoon in hetzelfde netwerk
  // kan meekijken (let op: WebGPU vereist een secure context; localhost is
  // secure, maar een LAN-IP is dat niet — zie README voor de tunnel-optie).
  server: {
    host: true,
    port: 5173,
    strictPort: false,
    headers: { ...COI_HEADERS },
    // Sta imports toe uit de repo-root (../../lib/*) — single source of truth
    // voor de prompt en de budgetlijst.
    fs: { allow: [repoRoot] },
  },
  preview: {
    host: true,
    port: 4173,
    headers: { ...COI_HEADERS },
  },
  // Laat esbuild de zware, deels node-conditionele transformers-bundle niet
  // pre-bundelen; we importeren 'm dynamisch en laten Vite 'm as-is serveren.
  optimizeDeps: {
    exclude: ['@huggingface/transformers'],
  },
})
