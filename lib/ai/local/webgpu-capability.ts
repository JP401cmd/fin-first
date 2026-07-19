// ── WebGPU capability-check voor de lokale privé-modus (desktop-only) ─────────
//
// ADR 0043 / FR-2.2: vóór er ook maar iets gedownload wordt, toetst deze check
// of dit toestel de on-device Gemma 4 E2B-runtime aankan. De lat is bewust
// desktop-gericht: WebGPU aanwezig + `maxStorageBufferBindingSize` ≥ 1,2 GiB +
// shader-f16. Mobiel (iOS-bufferlimiet ~128 MB–1 GB, mid-range Android te traag)
// valt hier eerlijk buiten v1 — géén cloud-fallback binnen deze flow (fail
// closed op de privacy-belofte).
//
// De reasons zijn in NL-gebruikerstaal: ze worden 1-op-1 aan de gebruiker
// getoond op /mijn/privacy (fase-2-UI, parallelle agent) en in de blokkademelding
// van de categorisatie-sheet.
//
// We definiëren de WebGPU-vorm hier lokaal (minimale interfaces) i.p.v. de
// @webgpu/types-globals: die zijn niet in de tsconfig-lib opgenomen en we willen
// geen extra type-dependency voor drie property-lezingen.

export type LocalAiCapability = {
  ok: boolean
  /** Menselijke, NL-taal redenen waarom het (niet) kan — leeg bij ok. */
  reasons: string[]
  adapterInfo?: { vendor: string; architecture: string }
  limits?: { maxStorageBufferBindingSize: number; maxBufferSize: number }
  shaderF16: boolean
  deviceMemoryGb: number | null
}

type GpuAdapterLike = {
  features: { has(name: string): boolean }
  limits: Record<string, number | undefined>
  info?: { vendor?: string; architecture?: string }
}

type GpuLike = {
  requestAdapter(opts?: { powerPreference?: string }): Promise<GpuAdapterLike | null>
}

/** Ondergrens voor maxStorageBufferBindingSize: 1,2 GiB (Gemma 4 E2B-buffers). */
export const MIN_STORAGE_BUFFER_BINDING_BYTES = Math.round(1.2 * 1024 ** 3)

/** Wachttijd (ms) vóór de eenmalige adapter-herpoging bij een transiënte null. */
export const ADAPTER_RETRY_DELAY_MS = 400

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Vraagt de WebGPU-adapter aan met FLAP-DEMPING. `requestAdapter` kan
 * kortstondig null (of, zeldzamer, een throw) geven wanneer het GPU-proces net
 * herstart of een driver-update draait — een TRANSIËNTE flap, geen echt
 * ongeschikt toestel. Mislukt de eerste poging, dan wachten we even en proberen
 * we exact één keer opnieuw vóór we het toestel afkeuren. Zo krijgt een
 * gebruiker die het model wél kan draaien niet onterecht de "niet geschikt"-
 * blokkade te zien.
 */
async function requestAdapterWithRetry(
  gpu: GpuLike,
  retryDelayMs: number,
): Promise<GpuAdapterLike | null> {
  const attempt = async (): Promise<GpuAdapterLike | null> => {
    try {
      // 'high-performance' stuurt op de discrete GPU waar die er is — de zwaarste
      // buffers passen daar eerder.
      return await gpu.requestAdapter({ powerPreference: 'high-performance' })
    } catch {
      return null
    }
  }

  const first = await attempt()
  if (first) return first
  await sleep(retryDelayMs)
  return attempt()
}

/** Best-effort geheugen-inschatting (GB) uit navigator.deviceMemory (kan ontbreken). */
function readDeviceMemoryGb(): number | null {
  if (typeof navigator === 'undefined') return null
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory
  return typeof mem === 'number' && Number.isFinite(mem) ? mem : null
}

/**
 * Toetst of dit toestel de lokale AI-runtime kan draaien. Doet een echte
 * `requestAdapter()` (geen device-creatie — dat gebeurt pas bij de
 * modeldownload) en leest de adapter-limits/-features uit. Een transiënte
 * adapter-flap wordt gedempt met één herpoging (zie requestAdapterWithRetry).
 *
 * Werpt nooit: elke faal-tak wordt een `ok:false` met een concrete NL-reden.
 *
 * `opts.adapterRetryDelayMs` overschrijft alleen de wachttijd vóór die
 * herpoging — bedoeld voor tests (0 = instant), productie gebruikt de default.
 */
export async function checkLocalAiCapability(
  opts?: { adapterRetryDelayMs?: number },
): Promise<LocalAiCapability> {
  const retryDelayMs = opts?.adapterRetryDelayMs ?? ADAPTER_RETRY_DELAY_MS
  const deviceMemoryGb = readDeviceMemoryGb()

  const gpu = typeof navigator !== 'undefined'
    ? (navigator as Navigator & { gpu?: GpuLike }).gpu
    : undefined

  if (!gpu) {
    return {
      ok: false,
      reasons: ['Je browser ondersteunt WebGPU niet. Lokale AI werkt op dit moment alleen op een desktopbrowser met WebGPU (bijvoorbeeld een recente Chrome of Edge op je computer).'],
      shaderF16: false,
      deviceMemoryGb,
    }
  }

  const adapter = await requestAdapterWithRetry(gpu, retryDelayMs)

  if (!adapter) {
    return {
      ok: false,
      reasons: ['Er kon geen geschikte grafische chip (WebGPU-adapter) worden gevonden. Lokale AI vraagt een desktop-GPU; op dit toestel lukt dat niet.'],
      shaderF16: false,
      deviceMemoryGb,
    }
  }

  const shaderF16 = adapter.features.has('shader-f16')
  const maxStorageBufferBindingSize = Number(adapter.limits.maxStorageBufferBindingSize ?? 0)
  const maxBufferSize = Number(adapter.limits.maxBufferSize ?? 0)

  const adapterInfo = {
    vendor: adapter.info?.vendor ?? '',
    architecture: adapter.info?.architecture ?? '',
  }

  const reasons: string[] = []

  if (!shaderF16) {
    reasons.push('Je grafische chip ondersteunt geen 16-bits shaders (shader-f16). Zonder dat wordt het model te zwaar en te traag om lokaal te draaien.')
  }

  if (maxStorageBufferBindingSize < MIN_STORAGE_BUFFER_BINDING_BYTES) {
    const haveGiB = (maxStorageBufferBindingSize / 1024 ** 3).toFixed(2)
    reasons.push(`Je grafische chip heeft te weinig werkgeheugen voor het model (beschikbaar ${haveGiB} GiB, nodig minstens 1,2 GiB). Dit is typisch op telefoons en tablets — lokale AI is voorlopig een desktopfunctie.`)
  }

  return {
    ok: reasons.length === 0,
    reasons,
    adapterInfo,
    limits: { maxStorageBufferBindingSize, maxBufferSize },
    shaderF16,
    deviceMemoryGb,
  }
}
