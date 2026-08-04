import { describe, it, expect, beforeEach } from 'vitest'
import { readProofVerdict, writeProofVerdict, clearProofVerdict } from './proof-verdict'
import { LOCAL_PROOF_VERSION } from './output-proof'
import { LOCAL_MODEL_URL } from './litert-runtime'

const STORAGE_KEY = 'trifinity.lokale-ai.uitvoertoets'
const AT = '2026-08-03T12:00:00.000Z'

beforeEach(() => {
  localStorage.clear()
})

describe('proof-verdict', () => {
  it('niets bewaard → null (dat is "nog niet beproefd", niet "gezakt")', () => {
    expect(readProofVerdict()).toBeNull()
  })

  it('schrijven en teruglezen behoudt uitslag, redenen en tijdstip', () => {
    writeProofVerdict({ ok: false, reasons: ['Bij de proef ging het mis.'] }, AT)
    const verdict = readProofVerdict()

    expect(verdict).toEqual({
      ok: false,
      reasons: ['Bij de proef ging het mis.'],
      at: AT,
      version: LOCAL_PROOF_VERSION,
      model: LOCAL_MODEL_URL,
    })
  })

  // Een oordeel is een uitspraak over ÉÉN model onder ÉÉN toetsversie. Verandert
  // er een van beide, dan zegt het niets meer over wat er nu draait.
  it('oordeel van een oudere toetsversie telt niet mee', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ok: true, reasons: [], at: AT, version: LOCAL_PROOF_VERSION - 1, model: LOCAL_MODEL_URL }),
    )
    expect(readProofVerdict()).toBeNull()
  })

  it('oordeel over een ander model telt niet mee', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ok: true, reasons: [], at: AT, version: LOCAL_PROOF_VERSION, model: 'https://elders/ander.litertlm' }),
    )
    expect(readProofVerdict()).toBeNull()
  })

  it('onleesbare inhoud → null in plaats van een throw', () => {
    localStorage.setItem(STORAGE_KEY, '{niet eens json')
    expect(readProofVerdict()).toBeNull()
  })

  it('wissen hoort bij het verwijderen of opnieuw ophalen van het model', () => {
    writeProofVerdict({ ok: true, reasons: [] }, AT)
    clearProofVerdict()
    expect(readProofVerdict()).toBeNull()
  })
})
