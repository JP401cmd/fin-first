// Capability-panel (metriek 8): WebGPU aanwezig, adapter-info, relevante limits,
// shader-f16, geschatte deviceMemory — met PASS/FAIL t.o.v. wat het model nodig heeft.

import type { ModelEntry } from './registry.ts'

export type CapabilityReport = {
  webgpu: boolean
  adapter: {
    vendor?: string
    architecture?: string
    device?: string
    description?: string
  } | null
  shaderF16: boolean
  maxStorageBufferBindingSize: number | null
  maxBufferSize: number | null
  deviceMemoryGB: number | null
  features: string[]
  error?: string
}

export async function probeCapability(): Promise<CapabilityReport> {
  const nav = navigator as unknown as { gpu?: GPU; deviceMemory?: number }
  const deviceMemoryGB = typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null

  if (!nav.gpu) {
    return {
      webgpu: false,
      adapter: null,
      shaderF16: false,
      maxStorageBufferBindingSize: null,
      maxBufferSize: null,
      deviceMemoryGB,
      features: [],
      error: 'navigator.gpu ontbreekt — geen WebGPU (of geen secure context).',
    }
  }

  try {
    const adapter = await nav.gpu.requestAdapter({ powerPreference: 'high-performance' })
    if (!adapter) {
      return {
        webgpu: true,
        adapter: null,
        shaderF16: false,
        maxStorageBufferBindingSize: null,
        maxBufferSize: null,
        deviceMemoryGB,
        features: [],
        error: 'Geen GPU-adapter beschikbaar (requestAdapter gaf null).',
      }
    }

    // adapter.info is de huidige API; requestAdapterInfo() is de oudere/deprecated variant.
    const anyAdapter = adapter as unknown as {
      info?: Record<string, string>
      requestAdapterInfo?: () => Promise<Record<string, string>>
    }
    let info: Record<string, string> = {}
    try {
      if (anyAdapter.info) info = anyAdapter.info
      else if (anyAdapter.requestAdapterInfo) info = await anyAdapter.requestAdapterInfo()
    } catch {
      /* info blijft leeg */
    }

    const features = Array.from(adapter.features ?? []) as string[]

    return {
      webgpu: true,
      adapter: {
        vendor: info.vendor,
        architecture: info.architecture,
        device: info.device,
        description: info.description,
      },
      shaderF16: adapter.features?.has('shader-f16') ?? false,
      maxStorageBufferBindingSize: adapter.limits?.maxStorageBufferBindingSize ?? null,
      maxBufferSize: adapter.limits?.maxBufferSize ?? null,
      deviceMemoryGB,
      features,
    }
  } catch (e) {
    return {
      webgpu: true,
      adapter: null,
      shaderF16: false,
      maxStorageBufferBindingSize: null,
      maxBufferSize: null,
      deviceMemoryGB,
      features: [],
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

export type CheckRow = { label: string; value: string; verdict: 'PASS' | 'WARN' | 'FAIL' }

const MB = 1024 * 1024

/** Beoordeel de capability t.o.v. de eisen van het gekozen model. */
export function evaluateCapability(cap: CapabilityReport, entry: ModelEntry): CheckRow[] {
  const rows: CheckRow[] = []

  rows.push({
    label: 'WebGPU (navigator.gpu)',
    value: cap.webgpu ? 'aanwezig' : 'ONTBREEKT',
    verdict: cap.webgpu ? 'PASS' : 'FAIL',
  })

  rows.push({
    label: 'GPU-adapter',
    value: cap.adapter
      ? [cap.adapter.vendor, cap.adapter.architecture, cap.adapter.description].filter(Boolean).join(' · ') || 'beschikbaar'
      : 'geen adapter',
    verdict: cap.adapter ? 'PASS' : 'FAIL',
  })

  rows.push({
    label: 'shader-f16',
    value: cap.shaderF16 ? 'ondersteund' : 'niet ondersteund',
    verdict: cap.shaderF16 ? 'PASS' : entry.needsShaderF16 ? 'WARN' : 'PASS',
  })

  const need = entry.minStorageBufferBindingMB * MB
  const have = cap.maxStorageBufferBindingSize
  rows.push({
    label: 'maxStorageBufferBindingSize',
    value: have != null ? `${fmtBytes(have)} (nodig ~${entry.minStorageBufferBindingMB} MB)` : 'onbekend',
    verdict: have == null ? 'WARN' : have >= need ? 'PASS' : 'WARN',
  })

  rows.push({
    label: 'maxBufferSize',
    value: cap.maxBufferSize != null ? fmtBytes(cap.maxBufferSize) : 'onbekend',
    verdict: cap.maxBufferSize == null ? 'WARN' : cap.maxBufferSize >= need ? 'PASS' : 'WARN',
  })

  rows.push({
    label: 'deviceMemory (schatting)',
    value: cap.deviceMemoryGB != null ? `~${cap.deviceMemoryGB} GB` : 'onbekend (browser rapporteert niet)',
    verdict: cap.deviceMemoryGB == null ? 'WARN' : cap.deviceMemoryGB >= 8 ? 'PASS' : 'WARN',
  })

  if (cap.error) {
    rows.push({ label: 'fout', value: cap.error, verdict: 'FAIL' })
  }

  return rows
}

export function fmtBytes(n: number): string {
  if (n >= 1024 * 1024 * 1024) return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(0)} MB`
  if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${n} B`
}
