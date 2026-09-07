import { describe, it, expect } from 'vitest'
import {
  resolveLocalReadiness,
  LOCAL_READINESS_FLAP_HINT,
  LOCAL_MODEL_MISSING_MESSAGE,
  LOCAL_MODEL_DOWNLOADING_MESSAGE,
  LOCAL_MODEL_NOT_DOWNLOADED_MESSAGE,
} from './local-readiness'
import type { LocalAiCapability } from './webgpu-capability'

// Bouw een capability met veilige defaults; override per test.
function cap(over: Partial<LocalAiCapability> = {}): LocalAiCapability {
  return { ok: true, reasons: [], shaderF16: true, deviceMemoryGb: null, ...over }
}

describe('resolveLocalReadiness', () => {
  it('ok-tak: capability oké én model klaar → ready, kind ok, geen melding', () => {
    const r = resolveLocalReadiness(cap({ ok: true }), { state: 'klaar' })
    expect(r).toEqual({ ready: true, kind: 'ok', message: null })
  })

  it('capability-tak: neemt de eerste zin uit reasons + de transiënte flap-hint', () => {
    const reason =
      'Er kon geen geschikte grafische chip (WebGPU-adapter) worden gevonden. Lokale AI vraagt een desktop-GPU; op dit toestel lukt dat niet.'
    const r = resolveLocalReadiness(cap({ ok: false, reasons: [reason] }), { state: 'klaar' })
    expect(r.ready).toBe(false)
    expect(r.kind).toBe('capability')
    // Eerste zin overgenomen ...
    expect(r.message).toContain('Er kon geen geschikte grafische chip (WebGPU-adapter) worden gevonden.')
    // ... maar bewust ingekort: de tweede zin komt niet mee ...
    expect(r.message).not.toContain('Lokale AI vraagt een desktop-GPU')
    // ... plus de flap-hint erachter.
    expect(r.message).toContain(LOCAL_READINESS_FLAP_HINT)
  })

  it('capability-tak is decimaal-veilig: "0.85 GiB" kapt de zin niet af op de decimaal', () => {
    const reason =
      'Je grafische chip heeft te weinig werkgeheugen voor het model (beschikbaar 0.85 GiB, nodig minstens 1,2 GiB). Dit is typisch op telefoons en tablets.'
    const r = resolveLocalReadiness(cap({ ok: false, reasons: [reason] }), { state: 'klaar' })
    expect(r.message).toContain('beschikbaar 0.85 GiB, nodig minstens 1,2 GiB).')
    expect(r.message).not.toContain('Dit is typisch')
    expect(r.message).toContain(LOCAL_READINESS_FLAP_HINT)
  })

  it('capability-tak wint van model-missing (de hardere blokkade eerst)', () => {
    const r = resolveLocalReadiness(cap({ ok: false, reasons: ['Geen WebGPU.'] }), {
      state: 'niet-gedownload',
    })
    expect(r.kind).toBe('capability')
  })

  // UR3-17 #18/#13: "nooit gedownload" en "gedownload en daarna kwijtgeraakt"
  // leveren allebei state 'niet-gedownload' op (de Cache Storage is in beide
  // gevallen leeg). Alleen `everDownloaded` onderscheidt ze, en alleen het
  // tweede geval verdient het verlies-narratief.
  it('model-missing-tak: leeg cachepad ná een eerdere download → eviction-melding', () => {
    const r = resolveLocalReadiness(cap({ ok: true }), {
      state: 'niet-gedownload',
      everDownloaded: true,
    })
    expect(r.ready).toBe(false)
    expect(r.kind).toBe('model-missing')
    expect(r.message).toBe(LOCAL_MODEL_MISSING_MESSAGE)
  })

  it('model-missing-tak: nog nooit gedownload → géén verlies-narratief', () => {
    const r = resolveLocalReadiness(cap({ ok: true }), {
      state: 'niet-gedownload',
      everDownloaded: false,
    })
    expect(r.ready).toBe(false)
    expect(r.kind).toBe('model-missing')
    expect(r.message).toBe(LOCAL_MODEL_NOT_DOWNLOADED_MESSAGE)
    // De twee zinnen waar de melding over ging: hij mag niet suggereren dat er
    // iets verdwenen is, en niet dat de browser iets heeft opgeruimd.
    expect(r.message).not.toContain('niet (meer)')
    expect(r.message).not.toContain('verwijderd om ruimte te maken')
  })

  it('model-missing-tak: zonder everDownloaded is de onschuldige lezing de default', () => {
    const r = resolveLocalReadiness(cap({ ok: true }), { state: 'niet-gedownload' })
    expect(r.message).toBe(LOCAL_MODEL_NOT_DOWNLOADED_MESSAGE)
  })

  it("state 'fout' houdt het verlies-narratief, óók zonder everDownloaded", () => {
    const r = resolveLocalReadiness(cap({ ok: true }), { state: 'fout' })
    expect(r.message).toBe(LOCAL_MODEL_MISSING_MESSAGE)
  })

  it("lopende download ('downloaden') → eigen melding, niet het eviction-narratief (review 19 jul)", () => {
    const r = resolveLocalReadiness(cap({ ok: true }), { state: 'downloaden' })
    expect(r.ready).toBe(false)
    expect(r.kind).toBe('model-missing')
    expect(r.message).toBe(LOCAL_MODEL_DOWNLOADING_MESSAGE)
    expect(r.message).not.toContain('verwijderd om ruimte te maken')
  })

  it('lege reasons-edge: capability faalt zonder reasons → nog steeds een bruikbare melding met flap-hint', () => {
    const r = resolveLocalReadiness(cap({ ok: false, reasons: [] }), { state: 'klaar' })
    expect(r.ready).toBe(false)
    expect(r.kind).toBe('capability')
    expect(r.message).toBeTruthy()
    expect(r.message).toContain(LOCAL_READINESS_FLAP_HINT)
  })
})
