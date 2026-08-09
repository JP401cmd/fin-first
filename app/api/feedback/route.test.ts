import { describe, it, expect } from 'vitest'
import { POST } from './route'

/**
 * ADR 0096 — dit endpoint is gesloten. De test bewaakt drie dingen die elk
 * afzonderlijk fout kunnen gaan bij een latere opruimronde:
 *  1. de statuscode is 410 (Gone), niet 404 — een 404 leest als defect;
 *  2. het antwoord houdt de platte error-envelope aan (ADR 0044, `{ error }`);
 *  3. de tekst wijst naar de opvolger, zodat de gebruiker niet vastloopt.
 */
describe('POST /api/feedback — gesloten (ADR 0096)', () => {
  it('antwoordt met 410 Gone in de platte error-envelope', async () => {
    const res = await POST()
    expect(res.status).toBe(410)

    const body = await res.json()
    expect(typeof body.error).toBe('string')
    expect(body.code).toBe('gone')
  })

  it('wijst de gebruiker door naar de meldmodus in de chat', async () => {
    const res = await POST()
    const body = await res.json()
    expect(body.error.toLowerCase()).toContain('melden')
    expect(body.error.toLowerCase()).toContain('megafoon')
  })

  it('schrijft niets meer weg — geen enkel veld uit de body komt terug', async () => {
    // Regressie: het oude gedrag las `message`/`category` en insertte in
    // `feedback`. Een 410 mag geen enkele body-echo of ok:true meer bevatten.
    const res = await POST()
    const body = await res.json()
    expect(body.ok).toBeUndefined()
    expect(Object.keys(body).sort()).toEqual(['code', 'error'])
  })
})
