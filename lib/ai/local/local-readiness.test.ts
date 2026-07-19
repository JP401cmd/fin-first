import { describe, it, expect } from 'vitest'
import {
  resolveLocalReadiness,
  LOCAL_READINESS_FLAP_HINT,
  LOCAL_MODEL_MISSING_MESSAGE,
  LOCAL_MODEL_DOWNLOADING_MESSAGE,
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

  it('model-missing-tak: capability oké maar model niet klaar → eviction-melding', () => {
    const r = resolveLocalReadiness(cap({ ok: true }), { state: 'niet-gedownload' })
    expect(r.ready).toBe(false)
    expect(r.kind).toBe('model-missing')
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
